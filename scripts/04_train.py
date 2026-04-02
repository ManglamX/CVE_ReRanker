import os
import json
import time
import numpy as np
import pandas as pd
import joblib
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix
try:
    import matplotlib
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "matplotlib", "-q"])
    import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

PROCESSED    = "data/cves_processed.csv"
EMB_FILE     = "data/bert_embeddings.npy"
MODELS_DIR   = "models"
TRACKER_FILE = f"{MODELS_DIR}/training_tracker.json"
MODEL_PATH   = f"{MODELS_DIR}/model_xgb.pkl"
MODEL_NATIVE = f"{MODELS_DIR}/model_xgb.json"  # XGBoost native format for warm-start
LE_PATH      = f"{MODELS_DIR}/label_encoder.pkl"
CM_PATH      = f"{MODELS_DIR}/confusion_matrix.png"

FORCE_RETRAIN    = False
UPDATE_THRESHOLD = 0.10
VALID_LABELS     = {"Critical", "High", "Medium", "Low"}

os.makedirs(MODELS_DIR, exist_ok=True)

# ── load data ──────────────────────────────────────────────────────────

df       = pd.read_csv(PROCESSED, engine="python", on_bad_lines="skip")
bert_emb = np.load(EMB_FILE)

print(f"CSV shape:        {df.shape}")
print(f"Embeddings shape: {bert_emb.shape}")
print(f"Rows match:       {len(df) == len(bert_emb)}")

if len(df) != len(bert_emb):
    raise ValueError(
        f"Row mismatch: CSV has {len(df)} rows but embeddings have {len(bert_emb)}. "
        "Re-run 03_embeddings.py before training."
    )

# ── sanitise labels BEFORE deciding train mode ─────────────────────────
# Corrupted rows have attack_vector values (NETWORK, LOCAL…) in cvss_label
# due to column-shift from unquoted commas in old CSV writes.

before   = len(df)
mask     = df["cvss_label"].isin(VALID_LABELS)
df       = df[mask].reset_index(drop=True)
bert_emb = bert_emb[mask.values]
dropped  = before - len(df)
if dropped:
    print(f"Dropped {dropped} corrupted rows (invalid cvss_label).")
print(f"Clean dataset:    {len(df)} rows")

# ── decide train mode ──────────────────────────────────────────────────

model_exists = os.path.exists(MODEL_PATH) and os.path.exists(MODEL_NATIVE)
current_rows = len(df)   # use CLEAN row count

if model_exists and os.path.exists(TRACKER_FILE):
    with open(TRACKER_FILE) as f:
        tracker = json.load(f)
    last_trained_rows = tracker.get("trained_on_rows", 0)
    new_rows          = current_rows - last_trained_rows
    pct_new           = new_rows / last_trained_rows if last_trained_rows > 0 else 1.0

    print(f"\nModel found. Last trained on: {last_trained_rows:,} rows")
    print(f"Current dataset:              {current_rows:,} rows")
    print(f"New rows since last train:    {new_rows:,} ({pct_new * 100:.1f}%)")

    if FORCE_RETRAIN:
        TRAIN_MODE = "full"
        print("\nMode: FULL RETRAIN (forced by FORCE_RETRAIN=True)")
    elif new_rows <= 0:
        TRAIN_MODE = "skip"
        print("\nMode: SKIP — dataset unchanged, loading existing model")
    elif pct_new >= UPDATE_THRESHOLD:
        TRAIN_MODE = "full"
        print(f"\nMode: FULL RETRAIN ({pct_new * 100:.1f}% new >= {UPDATE_THRESHOLD * 100:.0f}% threshold)")
    else:
        TRAIN_MODE = "update"
        print(f"\nMode: UPDATE — continuing training on {new_rows:,} new rows only")
else:
    TRAIN_MODE        = "full"
    last_trained_rows = 0
    new_rows          = current_rows
    print("\nMode: FULL RETRAIN (no existing model found)")

# ── build feature matrix ───────────────────────────────────────────────

nlp_cols  = ["entity_count", "has_remote", "has_unauth", "has_exec",
             "has_priv_esc", "has_dos", "has_overflow", "desc_word_count"]
meta_cols = ["attack_vector_enc", "attack_complexity_enc",
             "privileges_required_enc", "user_interaction_enc", "scope_enc"]

nlp_feats  = df[nlp_cols].apply(pd.to_numeric, errors="coerce").fillna(0).values.astype(float)
meta_feats = df[meta_cols].apply(pd.to_numeric, errors="coerce").fillna(0).values.astype(float)
X          = np.concatenate([bert_emb, nlp_feats, meta_feats], axis=1)
y          = df["cvss_label"].values

print(f"\nFused feature shape: {X.shape}  (768 BERT + 8 NLP + 5 meta = 781)")

le    = LabelEncoder()
y_enc = le.fit_transform(y)
print(f"Classes:             {le.classes_}")

# ── build splits ───────────────────────────────────────────────────────

def safe_split(X, y, test_size=0.2):
    """train_test_split with stratify, falling back if any class is too small."""
    counts = np.bincount(y)
    stratify = y if counts.min() >= 2 else None
    if stratify is None:
        print("  Warning: skipping stratify — a class has < 2 members.")
    return train_test_split(X, y, test_size=test_size, random_state=42, stratify=stratify)

if TRAIN_MODE == "update":
    X_new = X[last_trained_rows:]
    y_new = y_enc[last_trained_rows:]
    if len(X_new) < 5:
        # Too few new rows to split — fall back to full retrain
        print(f"Only {len(X_new)} new rows — switching to FULL RETRAIN.")
        TRAIN_MODE = "full"
    else:
        X_train_up, X_test_up, y_train_up, y_test_up = safe_split(X_new, y_new)
        print(f"Update train rows:   {len(X_train_up):,}")
        print(f"Update test rows:    {len(X_test_up):,}")

# Always build full split for evaluation
X_train, X_test, y_train, y_test = safe_split(X, y_enc)
print(f"\nFull train size:     {X_train.shape}")
print(f"Full test size:      {X_test.shape}")

# ── train / update / skip ──────────────────────────────────────────────

if TRAIN_MODE == "skip":
    print("\nLoading existing model...")
    model_xgb = joblib.load(MODEL_PATH)
    le        = joblib.load(LE_PATH)
    print("Model loaded. Skipping training.")

elif TRAIN_MODE == "update":
    print(f"\nLoading existing model to continue training...")
    model_xgb = joblib.load(MODEL_PATH)
    le        = joblib.load(LE_PATH)
    print(f"Continuing training on {len(X_train_up):,} new rows...")
    start = time.time()
    model_xgb.fit(
        X_train_up, y_train_up,
        xgb_model = MODEL_NATIVE,   # XGBoost native .json format, not pickle
        eval_set  = [(X_test_up, y_test_up)],
        verbose   = 50,
    )
    elapsed = time.time() - start
    print(f"Update training done in {elapsed:.1f}s")

else:  # full
    print("\nTraining XGBoost from scratch...")
    model_xgb = XGBClassifier(
        n_estimators     = 300,
        max_depth        = 6,
        learning_rate    = 0.1,
        subsample        = 0.8,
        colsample_bytree = 0.8,
        eval_metric      = "mlogloss",
        random_state     = 42,
        n_jobs           = -1,
        tree_method      = "hist",
    )
    start = time.time()
    model_xgb.fit(
        X_train, y_train,
        eval_set = [(X_test, y_test)],
        verbose  = 50,
    )
    elapsed = time.time() - start
    print(f"Full training done in {elapsed:.1f}s ({elapsed / 60:.1f} min)")

# ── evaluate ───────────────────────────────────────────────────────────

y_pred = model_xgb.predict(X_test)
print("\nClassification report:")
print(classification_report(y_test, y_pred, target_names=le.classes_))

cm = confusion_matrix(y_test, y_pred)
fig, ax = plt.subplots(figsize=(6, 5))
im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
plt.colorbar(im, ax=ax)
ax.set(
    xticks      = range(len(le.classes_)),
    yticks      = range(len(le.classes_)),
    xticklabels = le.classes_,
    yticklabels = le.classes_,
    xlabel      = "Predicted",
    ylabel      = "True",
    title       = "Confusion Matrix",
)
plt.tight_layout()
plt.savefig(CM_PATH, dpi=100)
plt.close()
print(f"Confusion matrix saved to {CM_PATH}")

# ── save model + tracker ───────────────────────────────────────────────

joblib.dump(model_xgb, MODEL_PATH)
joblib.dump(le, LE_PATH)
model_xgb.save_model(MODEL_NATIVE)  # native format for future warm-starts

with open(TRACKER_FILE, "w") as f:
    json.dump({"trained_on_rows": current_rows, "train_mode": TRAIN_MODE}, f)

print(f"\nModel saved to {MODELS_DIR}/")
print(f"Tracker updated: trained_on_rows = {current_rows:,}")

# ── final verification ─────────────────────────────────────────────────

model_loaded = joblib.load(MODEL_PATH)
le_loaded    = joblib.load(LE_PATH)
print(f"\nModel type:    {type(model_loaded).__name__}")
print(f"Classes:       {le_loaded.classes_}")
print(f"N estimators:  {model_loaded.n_estimators}")
print(f"Feature count: {model_loaded.n_features_in_}")
print(f"\nFiles in {MODELS_DIR}:")
for fname in sorted(os.listdir(MODELS_DIR)):
    size = os.path.getsize(f"{MODELS_DIR}/{fname}")
    print(f"  {fname}  ({size / 1024:.1f} KB)")
print("\nAll checks passed.")