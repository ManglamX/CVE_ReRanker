import numpy as np
import pandas as pd
import torch
import os
from transformers import AutoTokenizer, AutoModel

CSV_PATH = "data/cves_processed.csv"
EMB_FILE = "data/bert_embeddings.npy"
TEMP     = "data/bert_embeddings_temp.npy"

print("Loading SecBERT...")
tokenizer = AutoTokenizer.from_pretrained("jackaduma/SecBERT")
model     = AutoModel.from_pretrained("jackaduma/SecBERT")
device    = "cuda" if torch.cuda.is_available() else "cpu"
model     = model.to(device)
model.eval()
print(f"Model on {device}")

def get_embeddings_batch(texts, batch_size=64):
    all_emb = []
    for i in range(0, len(texts), batch_size):
        batch  = texts[i:i+batch_size]
        inputs = tokenizer(batch, return_tensors="pt",
                           truncation=True, max_length=512,
                           padding=True).to(device)
        with torch.no_grad():
            out = model(**inputs)
        all_emb.append(out.last_hidden_state[:,0,:].cpu().numpy())
        if i % (batch_size*20) == 0:
            print(f"  {min(i+batch_size, len(texts))}/{len(texts)}")
    return np.vstack(all_emb)

df         = pd.read_csv(CSV_PATH)
total_rows = len(df)

if os.path.exists(EMB_FILE):
    old_emb   = np.load(EMB_FILE)
    old_count = len(old_emb)
    new_texts = df["description_clean"].iloc[old_count:].tolist()
    print(f"Existing: {old_count} | New to embed: {len(new_texts)}")
    if len(new_texts) == 0:
        print("No new embeddings needed.")
    else:
        new_emb  = get_embeddings_batch(new_texts)
        combined = np.vstack([old_emb, new_emb])
        np.save(TEMP, combined)
        verify = np.load(TEMP)
        if verify.shape == (total_rows, 768):
            np.save(EMB_FILE, combined)
            os.remove(TEMP)
            print(f"Saved: {combined.shape}")
        else:
            print(f"ERROR: shape mismatch {verify.shape}")
else:
    texts = df["description_clean"].tolist()
    print(f"Generating {len(texts)} embeddings from scratch...")
    emb = get_embeddings_batch(texts)
    np.save(TEMP, emb)
    verify = np.load(TEMP)
    if verify.shape == (total_rows, 768):
        np.save(EMB_FILE, emb)
        os.remove(TEMP)
        print(f"Saved: {emb.shape}")
    else:
        print(f"ERROR: shape mismatch {verify.shape}")