import pandas as pd
import re
import os
import spacy
from tqdm import tqdm

CSV_PATH  = "data/cves_raw.csv"
OUT_PATH  = "data/cves_processed.csv"

nlp = spacy.load("en_core_web_sm")

def clean_text(text):
    text = str(text).lower()
    text = re.sub(r"http\S+|www\S+", "", text)
    text = re.sub(r"<.*?>", "", text)
    text = re.sub(r"cve-\d{4}-\d+", "CVE_TOKEN", text)
    text = re.sub(r"v?\d+\.\d+[\./\d]*", "VERSION_TOKEN", text)
    text = re.sub(r"[^a-z0-9\s_]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

REMOTE   = ["remote","remotely","network"]
UNAUTH   = ["unauthenticated","unauthorized"]
EXEC     = ["execute","execution","arbitrary code","rce"]
PRIVESC  = ["privilege escalation","root","elevated privileges"]
DOS      = ["denial of service","dos","crash"]
OVERFLOW = ["buffer overflow","heap overflow","out-of-bounds"]

def extract_features(text):
    tl  = text.lower()
    doc = nlp(tl)
    ents = [e.text for e in doc.ents if e.label_ in ["PRODUCT","ORG","GPE"]]
    return {
        "entity_count":    len(ents),
        "entities":        ", ".join(ents[:5]),
        "has_remote":      int(any(w in tl for w in REMOTE)),
        "has_unauth":      int(any(w in tl for w in UNAUTH)),
        "has_exec":        int(any(w in tl for w in EXEC)),
        "has_priv_esc":    int(any(w in tl for w in PRIVESC)),
        "has_dos":         int(any(w in tl for w in DOS)),
        "has_overflow":    int(any(w in tl for w in OVERFLOW)),
        "desc_word_count": len(text.split())
    }

AV  = {"NETWORK":3,"ADJACENT":2,"LOCAL":1,"PHYSICAL":0}
AC  = {"LOW":1,"HIGH":0}
PR  = {"NONE":2,"LOW":1,"HIGH":0}
UI  = {"NONE":1,"REQUIRED":0}
SC  = {"CHANGED":1,"UNCHANGED":0}

df_raw = pd.read_csv(CSV_PATH)

if os.path.exists(OUT_PATH):
    df_done = pd.read_csv(OUT_PATH)
    done_ids = set(df_done["cve_id"])
    df_new   = df_raw[~df_raw["cve_id"].isin(done_ids)].copy().reset_index(drop=True)
    print(f"Already processed: {len(df_done)} | New to process: {len(df_new)}")
else:
    df_done = None
    df_new  = df_raw.copy()
    print(f"Processing all {len(df_new)} rows from scratch")

if len(df_new) == 0:
    print("Nothing new to process.")
else:
    tqdm.pandas()
    df_new["description_clean"] = df_new["description"].apply(clean_text)
    feats = df_new["description"].progress_apply(lambda x: pd.Series(extract_features(x)))
    df_new = pd.concat([df_new, feats], axis=1)
    df_new["entities"] = df_new["entities"].fillna("")
    df_new["attack_vector_enc"]       = df_new["attack_vector"].map(AV).fillna(0)
    df_new["attack_complexity_enc"]   = df_new["attack_complexity"].map(AC).fillna(0)
    df_new["privileges_required_enc"] = df_new["privileges_required"].map(PR).fillna(0)
    df_new["user_interaction_enc"]    = df_new["user_interaction"].map(UI).fillna(0)
    df_new["scope_enc"]               = df_new["scope"].map(SC).fillna(0)

    final = pd.concat([df_done, df_new], ignore_index=True) if df_done is not None else df_new
    final.to_csv(OUT_PATH, index=False)
    print(f"Saved {len(final)} rows to {OUT_PATH}")