"""
backend/pipeline.py
Loads the XGBoost model + dataset once at startup.
Exposes predict_single() and predict_bulk() used by the API routes.
"""

import os
import json
import numpy as np
import pandas as pd
import joblib
from pathlib import Path

from reranker import compute_context_score

# ── Resolve absolute paths relative to the project root ────────────────────
# backend/ sits one level below the project root
_BACKEND_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _BACKEND_DIR.parent

MODELS_DIR = _PROJECT_ROOT / "models"
DATA_DIR   = _PROJECT_ROOT / "data"

MODEL_PATH   = MODELS_DIR / "model_xgb.pkl"
LE_PATH      = MODELS_DIR / "label_encoder.pkl"
TRACKER_PATH = MODELS_DIR / "training_tracker.json"
CSV_PATH     = DATA_DIR   / "cves_processed.csv"
EMB_PATH     = DATA_DIR   / "bert_embeddings.npy"

# ── Feature column sets (must match training) ───────────────────────────────
NLP_COLS  = [
    "entity_count", "has_remote", "has_unauth", "has_exec",
    "has_priv_esc", "has_dos", "has_overflow", "desc_word_count",
]
META_COLS = [
    "attack_vector_enc", "attack_complexity_enc",
    "privileges_required_enc", "user_interaction_enc", "scope_enc",
]


# ── Singleton load (called once at FastAPI startup) ─────────────────────────
_model = None
_le    = None
_df    = None
_emb   = None


def load_artifacts():
    """Load model, label encoder, processed CSV and embeddings into memory."""
    global _model, _le, _df, _emb
    print("Loading XGBoost model …", flush=True)
    _model = joblib.load(MODEL_PATH)
    _le    = joblib.load(LE_PATH)
    print("Loading dataset …", flush=True)
    _df    = pd.read_csv(CSV_PATH)
    print("Loading BERT embeddings …", flush=True)
    _emb   = np.load(EMB_PATH)
    print(f"Ready — {len(_df):,} CVEs loaded.", flush=True)


def _get_artifacts():
    if _model is None:
        raise RuntimeError("Artifacts not loaded. Call load_artifacts() first.")
    return _model, _le, _df, _emb


# ── Internal helpers ────────────────────────────────────────────────────────
def _badge(label: str) -> str:
    return {"Critical": "🔴", "High": "🟠", "Medium": "🟡", "Low": "🟢"}.get(label, "⚪")


def _predict_row(idx: int, inventory: list[str]) -> dict:
    """Run the full pipeline for one row index and return a result dict."""
    model, le, df, emb = _get_artifacts()

    row        = df.iloc[idx]
    x          = emb[idx].reshape(1, -1)
    nlp_feats  = df[NLP_COLS].iloc[idx].values.reshape(1, -1).astype(float)
    meta_feats = df[META_COLS].iloc[idx].values.reshape(1, -1).astype(float)
    X          = np.concatenate([x, nlp_feats, meta_feats], axis=1)

    probs      = model.predict_proba(X)[0]
    pred_idx   = int(np.argmax(probs))
    pred_label = le.classes_[pred_idx]
    crit_idx   = list(le.classes_).index("Critical")
    prob_crit  = float(probs[crit_idx])

    ctx = compute_context_score(row.to_dict(), inventory, prob_crit)

    has_remote = int(
        bool(row.get("has_remote")) or
        str(row.get("attack_vector", "")).upper() == "NETWORK"
    )

    return {
        "cve_id":            str(row["cve_id"]),
        "description":       str(row["description"]),
        "cvss_score":        float(row["cvss_score"]),
        "cvss_label":        str(row["cvss_label"]),
        "predicted_label":   pred_label,
        "prob_critical":     round(prob_crit, 4),
        "context_score":     ctx["context_score"],
        "boost_factor":      ctx["boost_factor"],
        "matched_inventory": ctx["matched_inventory"],
        "attack_vector":     str(row.get("attack_vector", "")),
        "has_remote":        has_remote,
        "has_exec":          int(bool(row.get("has_exec", 0))),
    }


# ── Public API ──────────────────────────────────────────────────────────────
def predict_single(cve_id: str, inventory: list[str]) -> dict | None:
    """Return prediction result for one CVE ID, or None if not found."""
    _, _, df, _ = _get_artifacts()
    match = df[df["cve_id"] == cve_id.upper().strip()]
    if match.empty:
        return None
    return _predict_row(match.index[0], inventory)


def predict_bulk(cve_ids: list[str], inventory: list[str]) -> tuple[list[dict], list[str]]:
    """
    Run predictions on a list of CVE IDs.
    Returns (results_sorted_by_context_score, missing_ids).
    """
    _, _, df, _ = _get_artifacts()
    results, missing = [], []
    for cve_id in cve_ids:
        cve_id = cve_id.strip().upper()
        match  = df[df["cve_id"] == cve_id]
        if match.empty:
            missing.append(cve_id)
        else:
            results.append(_predict_row(match.index[0], inventory))
    results.sort(key=lambda r: r["context_score"], reverse=True)
    return results, missing


def find_inventory_matches(inventory: list[str], sample_size: int = 10_000) -> list[dict]:
    """
    Scan the first `sample_size` CVEs, keep those that match the inventory,
    and return them sorted by context_score.
    """
    from reranker import match_inventory
    _, _, df, _ = _get_artifacts()
    matches = []
    cap = min(sample_size, len(df))
    for i in range(cap):
        row = df.iloc[i]
        if match_inventory(row.get("entities", ""), inventory, row.get("description", "")):
            matches.append(_predict_row(i, inventory))
    matches.sort(key=lambda r: r["context_score"], reverse=True)
    return matches


def get_stats() -> dict:
    """Return dataset + model statistics."""
    _, le, df, _ = _get_artifacts()

    tracker = {}
    if TRACKER_PATH.exists():
        with open(TRACKER_PATH) as f:
            tracker = json.load(f)

    last_updated = {}
    last_updated_path = DATA_DIR / "last_updated.json"
    if last_updated_path.exists():
        with open(last_updated_path) as f:
            last_updated = json.load(f)

    label_distribution = df["cvss_label"].value_counts().to_dict()

    return {
        "total_cves":         len(df),
        "label_distribution": label_distribution,
        "classes":            list(le.classes_),
        "feature_dims":       768 + len(NLP_COLS) + len(META_COLS),
        "trained_on_rows":    tracker.get("trained_on_rows", "unknown"),
        "last_data_update":   last_updated.get("last_collected", "unknown"),
    }
