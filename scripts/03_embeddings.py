import os
import numpy as np
import pandas as pd
import torch
from transformers import AutoTokenizer, AutoModel

PROCESSED  = "data/cves_processed.csv"
EMB_FILE   = "data/bert_embeddings.npy"
TEMP_FILE  = "data/bert_embeddings_temp.npy"
MODEL_NAME = "jackaduma/SecBERT"

# ── load data ──────────────────────────────────────────────────────────

df = pd.read_csv(PROCESSED, engine="python", on_bad_lines="skip")
print(f"Processed CSV loaded: {len(df)} rows")

# ── load model ─────────────────────────────────────────────────────────

print(f"Loading {MODEL_NAME}...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model     = AutoModel.from_pretrained(MODEL_NAME)
device    = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model     = model.to(device)
model.eval()
print(f"Model loaded on: {device}")


# ── embedding function ─────────────────────────────────────────────────

def get_embeddings_batch(texts, batch_size=64):
    """Generate 768-dim CLS token embeddings for a list of texts."""
    all_embeddings = []
    total          = len(texts)

    for i in range(0, total, batch_size):
        batch  = texts[i : i + batch_size]
        inputs = tokenizer(
            batch,
            return_tensors = "pt",
            truncation     = True,
            max_length     = 512,
            padding        = True,
        ).to(device)

        with torch.no_grad():
            outputs = model(**inputs)

        # CLS token = index 0 of last hidden state
        batch_emb = outputs.last_hidden_state[:, 0, :].cpu().numpy()
        all_embeddings.append(batch_emb)

        if (i // batch_size) % 10 == 0:
            done = min(i + batch_size, total)
            print(f"  {done}/{total} ({100 * done // total}%)")

    return np.vstack(all_embeddings)


# ── generate / update embeddings ───────────────────────────────────────

total_rows = len(df)

if os.path.exists(EMB_FILE):
    # UPDATE MODE: only embed new rows
    old_emb   = np.load(EMB_FILE)
    old_count = len(old_emb)
    new_texts = df["description_clean"].iloc[old_count:].fillna("").tolist()

    print(f"Mode:                UPDATE (append only)")
    print(f"Existing embeddings: {old_count}")
    print(f"Total rows in CSV:   {total_rows}")
    print(f"New rows to embed:   {len(new_texts)}")

    if len(new_texts) == 0:
        print("\nNo new rows to embed. Everything is up to date.")
        combined = old_emb
    else:
        print(f"\nGenerating {len(new_texts)} new embeddings...")
        new_emb  = get_embeddings_batch(new_texts, batch_size=64)
        combined = np.vstack([old_emb, new_emb])
        print(f"\nCombined shape: {combined.shape}")

        print("Saving to temp file...")
        np.save(TEMP_FILE, combined)
        verify = np.load(TEMP_FILE)

        if verify.shape == (total_rows, 768):
            np.save(EMB_FILE, combined)
            os.remove(TEMP_FILE)
            print(f"Saved successfully: {verify.shape}")
        else:
            print(f"ERROR: temp shape {verify.shape} != expected ({total_rows}, 768)")
            print("Original file NOT overwritten. Check and retry.")

else:
    # FIRST RUN: generate all from scratch
    texts = df["description_clean"].fillna("").tolist()

    print(f"Mode:                FIRST RUN (generate all)")
    print(f"Total rows to embed: {len(texts)}")
    print(f"Estimated time:      30-50 min on GPU, longer on CPU\n")

    combined = get_embeddings_batch(texts, batch_size=64)
    print(f"\nGenerated shape: {combined.shape}")

    print("Saving to temp file...")
    np.save(TEMP_FILE, combined)
    verify = np.load(TEMP_FILE)

    if verify.shape == (total_rows, 768):
        np.save(EMB_FILE, combined)
        os.remove(TEMP_FILE)
        print(f"Saved successfully: {verify.shape}")
    else:
        print(f"ERROR: temp shape {verify.shape} != expected ({total_rows}, 768)")
        print("File NOT saved. Check and retry.")

# ── verification ───────────────────────────────────────────────────────

reloaded = np.load(EMB_FILE)
print(f"\nEmbedding shape:  {reloaded.shape}")
print(f"CSV rows:         {total_rows}")
print(f"Rows match:       {reloaded.shape[0] == total_rows}")
print(f"Embedding dims:   {reloaded.shape[1]} (should be 768)")

if reloaded.shape[0] == total_rows and reloaded.shape[1] == 768:
    print("\nAll checks passed. Ready to run 04_train.py")
else:
    print("\nMISMATCH — do not proceed to training. Re-run this script.")