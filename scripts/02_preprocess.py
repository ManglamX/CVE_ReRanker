import pandas as pd
import re
import os
import spacy
from tqdm import tqdm

CSV_PATH = "data/cves_raw.csv"
OUT_PATH = "data/cves_processed.csv"

nlp = spacy.load("en_core_web_sm")


# ── text cleaning ──────────────────────────────────────────────────────

def clean_text(text):
    text = str(text).lower()
    text = re.sub(r"http\S+|www\S+", "", text)                      # remove URLs
    text = re.sub(r"<.*?>", "", text)                                # remove HTML tags
    text = re.sub(r"cve-\d{4}-\d+", "CVE_TOKEN", text)              # normalise CVE IDs
    text = re.sub(r"v?\d+\.\d+[\./\d]*", "VERSION_TOKEN", text)     # normalise versions
    text = re.sub(r"[^a-z0-9\s_]", " ", text)                       # remove special chars
    text = re.sub(r"\s+", " ", text).strip()                         # collapse whitespace
    return text


# ── keyword feature flags (matches notebook exactly) ──────────────────

REMOTE_WORDS   = ["remote", "remotely", "network"]
UNAUTH_WORDS   = ["unauthenticated", "unauthorized", "no authentication"]
EXEC_WORDS     = ["execute", "execution", "arbitrary code", "command injection", "rce"]
PRIVESC_WORDS  = ["privilege escalation", "root", "admin", "elevated privileges"]
DOS_WORDS      = ["denial of service", "dos", "crash", "unavailable"]
OVERFLOW_WORDS = ["buffer overflow", "heap overflow", "stack overflow", "out-of-bounds"]


def extract_features(text):
    if not text or not isinstance(text, str):
        text = ""
    text_lower = text.lower()
    doc        = nlp(text_lower)
    entities   = [e.text for e in doc.ents if e.label_ in ["PRODUCT", "ORG", "GPE"]]
    return {
        "entity_count":    len(entities),
        "entities":        ", ".join(entities[:5]),
        "has_remote":      int(any(w in text_lower for w in REMOTE_WORDS)),
        "has_unauth":      int(any(w in text_lower for w in UNAUTH_WORDS)),
        "has_exec":        int(any(w in text_lower for w in EXEC_WORDS)),
        "has_priv_esc":    int(any(w in text_lower for w in PRIVESC_WORDS)),
        "has_dos":         int(any(w in text_lower for w in DOS_WORDS)),
        "has_overflow":    int(any(w in text_lower for w in OVERFLOW_WORDS)),
        "desc_word_count": len(text.split()),
    }


# ── encoding maps (matches notebook exactly) ──────────────────────────

ATTACK_VECTOR_MAP = {"NETWORK": 3, "ADJACENT": 2, "LOCAL": 1, "PHYSICAL": 0}
COMPLEXITY_MAP    = {"LOW": 1, "HIGH": 0}
PRIVS_MAP         = {"NONE": 2, "LOW": 1, "HIGH": 0}
UI_MAP            = {"NONE": 1, "REQUIRED": 0}
SCOPE_MAP         = {"CHANGED": 1, "UNCHANGED": 0}


def encode_metadata(df):
    df["attack_vector_enc"]       = df["attack_vector"].map(ATTACK_VECTOR_MAP).fillna(0)
    df["attack_complexity_enc"]   = df["attack_complexity"].map(COMPLEXITY_MAP).fillna(0)
    df["privileges_required_enc"] = df["privileges_required"].map(PRIVS_MAP).fillna(0)
    df["user_interaction_enc"]    = df["user_interaction"].map(UI_MAP).fillna(0)
    df["scope_enc"]               = df["scope"].map(SCOPE_MAP).fillna(0)
    return df


# ── I/O helpers ────────────────────────────────────────────────────────

def read_csv(path):
    """Read plain CSV safely with the python engine to tolerate bad lines."""
    return pd.read_csv(path, engine="python", on_bad_lines="skip")


def save_csv(df, path):
    """Write plain CSV — consistent with notebook output."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_csv(path, index=False)


# ── main ───────────────────────────────────────────────────────────────

df_raw = read_csv(CSV_PATH)
print(f"Raw CSV loaded: {len(df_raw)} rows")

if os.path.exists(OUT_PATH):
    df_existing  = read_csv(OUT_PATH)
    already_done = set(df_existing["cve_id"].tolist())
    print(f"Processed file found: {len(df_existing)} rows already done")
    print(f"New rows to process:  {len(df_raw) - len(already_done)}")
else:
    df_existing  = None
    already_done = set()
    print(f"No processed file found. Will process all {len(df_raw)} rows from scratch.")

df_to_process = df_raw[~df_raw["cve_id"].isin(already_done)].copy().reset_index(drop=True)

# Drop rows with missing descriptions before any NLP work
before = len(df_to_process)
df_to_process = df_to_process.dropna(subset=["description"]).reset_index(drop=True)
dropped = before - len(df_to_process)
if dropped:
    print(f"Dropped {dropped} rows with null descriptions.")

print(f"\nTotal raw rows:      {len(df_raw)}")
print(f"Already processed:   {len(already_done)}")
print(f"Rows to process now: {len(df_to_process)}")

if len(df_to_process) == 0:
    print("\nNothing new to process. Everything is up to date.")
else:
    tqdm.pandas()

    # Step 1 — Clean text
    print("\nStep 1/3 — Cleaning text...")
    df_to_process["description_clean"] = df_to_process["description"].apply(clean_text)
    print(f"  Done.")

    # Step 2 — NER + keyword features
    print(f"\nStep 2/3 — Extracting NLP features ({len(df_to_process)} rows)...")
    features_df   = df_to_process["description"].progress_apply(
        lambda x: pd.Series(extract_features(x))
    )
    df_to_process = pd.concat([df_to_process, features_df], axis=1)
    print(f"  Done. Shape: {df_to_process.shape}")

    # Step 3 — Encode metadata
    print("\nStep 3/3 — Encoding CVSS metadata...")
    df_to_process = encode_metadata(df_to_process)
    df_to_process["entities"] = df_to_process["entities"].fillna("")
    print("  Done.")

    # Combine with existing and save
    if df_existing is not None:
        print(f"\nAppending {len(df_to_process)} new rows to existing {len(df_existing)} rows...")
        df_final = pd.concat([df_existing, df_to_process], ignore_index=True)
    else:
        df_final = df_to_process

    save_csv(df_final, OUT_PATH)
    print(f"\nSaved {len(df_final)} rows to {OUT_PATH}")
    print(f"Total columns: {len(df_final.columns)}")
    print(f"Columns: {list(df_final.columns)}")