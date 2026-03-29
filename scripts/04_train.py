import numpy as np
import pandas as pd
import joblib
import json
import os
import time
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report

CSV_PATH     = "data/cves_processed.csv"
EMB_FILE     = "data/bert_embeddings.npy"
MODEL_PATH   = "models/model_xgb.pkl"
LE_PATH      = "models/label_encoder.pkl"
TRACKER      = "models/training_tracker.json"
THRESHOLD    = 0.10

os.makedirs("models", exist_ok=True)

df       = pd.read_csv(CSV_PATH)
bert_emb = np.load(EMB_FILE)

nlp_cols  = ["entity_count","has_remote","has_unauth","has_exec",
             "has_priv_esc","has_dos","has_overflow","desc_word_count"]
meta_cols = ["attack_vector_enc","attack_complexity_enc",
             "privileges_required_enc","user_interaction_enc","scope_enc"]

X = np.concatenate([bert_emb,
                    df[nlp_cols].values.astype(float),
                    df[meta_cols].values.astype(float)], axis=1)
y = df["cvss_label"].values

le    = LabelEncoder()
y_enc = le.fit_transform(y)

X_train, X_test, y_train, y_test = train_test_split(
    X, y_enc, test_size=0.2, random_state=42, stratify=y_enc)

current_rows = len(df)
model_exists = os.path.exists(MODEL_PATH)

if model_exists and os.path.exists(TRACKER):
    with open(TRACKER) as f:
        tracker = json.load(f)
    last_rows = tracker.get("trained_on_rows", 0)
    new_rows  = current_rows - last_rows
    pct_new   = new_rows / last_rows if last_rows > 0 else 1.0
    print(f"Last trained on: {last_rows:,} | Current: {current_rows:,} | New: {new_rows:,} ({pct_new*100:.1f}%)")

    if new_rows == 0:
        print("Dataset unchanged. Skipping training.")
        exit(0)
    elif pct_new < THRESHOLD:
        print(f"Small update — continuing training on {new_rows:,} new rows")
        model_xgb = joblib.load(MODEL_PATH)
        le        = joblib.load(LE_PATH)
        X_new     = X[last_rows:]
        y_new     = y_enc[last_rows:]
        X_tr, X_te, y_tr, y_te = train_test_split(X_new, y_new, test_size=0.2,
                                                    random_state=42, stratify=y_new)
        model_xgb.set_params(n_estimators=model_xgb.n_estimators + 100)
        start = time.time()
        model_xgb.fit(X_tr, y_tr, eval_set=[(X_te, y_te)],
                      verbose=20, xgb_model=model_xgb.get_booster())
        print(f"Update done in {round(time.time()-start,1)}s")
    else:
        print("Large update — full retrain")
        model_xgb = None
else:
    print("No model found — training from scratch")
    model_xgb = None

if model_xgb is None:
    model_xgb = XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        eval_metric="mlogloss", random_state=42, n_jobs=-1)
    start = time.time()
    model_xgb.fit(X_train, y_train,
                  eval_set=[(X_test, y_test)], verbose=50)
    print(f"Training done in {round(time.time()-start,1)}s")

preds = model_xgb.predict(X_test)
print(classification_report(y_test, preds, target_names=le.classes_))

joblib.dump(model_xgb, MODEL_PATH)
joblib.dump(le,        LE_PATH)

with open(TRACKER, "w") as f:
    json.dump({"trained_on_rows": current_rows}, f)

print(f"Model saved. Tracker updated to {current_rows:,} rows.")