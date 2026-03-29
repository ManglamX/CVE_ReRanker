
import streamlit as st
import pandas as pd
import numpy as np
import joblib
import os
import sys

APP_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, APP_DIR)
from reranker import compute_context_score, match_inventory

st.set_page_config(page_title="CVE Re-Ranker", page_icon="🔐", layout="wide")

BASE   = "/content/drive/MyDrive/CVE_Project"
MODELS = f"{BASE}/models"
PROC   = f"{BASE}/processed"
EMB    = f"{BASE}/embeddings"

@st.cache_resource
def load_model():
    model = joblib.load(f"{MODELS}/model_xgb.pkl")
    le    = joblib.load(f"{MODELS}/label_encoder.pkl")
    return model, le

@st.cache_data
def load_data():
    df  = pd.read_csv(f"{PROC}/cves_processed.csv")
    emb = np.load(f"{EMB}/bert_embeddings.npy")
    return df, emb

def badge(label):
    return {"Critical":"🔴","High":"🟠","Medium":"🟡","Low":"🟢"}.get(label,"⚪")

def predict_row(idx, df, emb, model, le, inventory):
    row        = df.iloc[idx]
    x          = emb[idx].reshape(1, -1)
    nlp_cols   = ["entity_count","has_remote","has_unauth","has_exec",
                  "has_priv_esc","has_dos","has_overflow","desc_word_count"]
    meta_cols  = ["attack_vector_enc","attack_complexity_enc",
                  "privileges_required_enc","user_interaction_enc","scope_enc"]
    nlp_feats  = df[nlp_cols].iloc[idx].values.reshape(1,-1).astype(float)
    meta_feats = df[meta_cols].iloc[idx].values.reshape(1,-1).astype(float)
    X          = np.concatenate([x, nlp_feats, meta_feats], axis=1)
    probs      = model.predict_proba(X)[0]
    pred_idx   = np.argmax(probs)
    pred_label = le.classes_[pred_idx]
    crit_idx   = list(le.classes_).index("Critical")
    prob_crit  = probs[crit_idx]
    ctx        = compute_context_score(row.to_dict(), inventory, prob_crit)
    return {
        "cve_id":            row["cve_id"],
        "description":       row["description"],
        "cvss_score":        row["cvss_score"],
        "cvss_label":        row["cvss_label"],
        "predicted_label":   pred_label,
        "prob_critical":     round(prob_crit, 4),
        "context_score":     ctx["context_score"],
        "boost_factor":      ctx["boost_factor"],
        "matched_inventory": ctx["matched_inventory"],
        "attack_vector":     row["attack_vector"],
        "has_remote":        1 if (row["has_remote"] or str(row["attack_vector"]).upper() == "NETWORK") else 0,
        "has_exec":          row["has_exec"],
    }

# Sidebar
st.sidebar.title("CVE Re-Ranker")
st.sidebar.markdown("---")
screen = st.sidebar.radio("Navigate", ["Single CVE lookup","Bulk analysis","Inventory matcher"])
st.sidebar.markdown("---")
st.sidebar.subheader("Software inventory")
inv_file  = st.sidebar.file_uploader("Upload inventory CSV", type="csv")
inventory = []
if inv_file:
    inv_df = pd.read_csv(inv_file)
    if "software" in inv_df.columns:
        inventory = inv_df["software"].dropna().tolist()
        st.sidebar.success(f"Loaded {len(inventory)} items")
    else:
        st.sidebar.error("CSV needs a column named: software")

# Screen 1
if screen == "Single CVE lookup":
    st.title("Single CVE analysis")
    st.markdown("Search any CVE from our dataset of 105,361 vulnerabilities.")
    cve_input = st.text_input("Enter CVE ID", placeholder="e.g. CVE-2021-44228")
    if st.button("Analyse") and cve_input.strip():
        try:
            model, le = load_model()
            df, emb   = load_data()
            cve_id    = cve_input.strip().upper()
            match     = df[df["cve_id"] == cve_id]
            if match.empty:
                st.error(f"{cve_id} not found in dataset.")
            else:
                with st.spinner("Running pipeline..."):
                    idx    = match.index[0]
                    result = predict_row(idx, df, emb, model, le, inventory)
                c1,c2,c3,c4 = st.columns(4)
                c1.metric("CVSS score",      result["cvss_score"])
                c2.metric("CVSS label",      f"{badge(result["cvss_label"])} {result["cvss_label"]}")
                c3.metric("Predicted label", f"{badge(result["predicted_label"])} {result["predicted_label"]}")
                c4.metric("Context score",   result["context_score"])
                st.markdown("---")
                st.subheader("Description")
                st.write(result["description"])
                if result["matched_inventory"]:
                    st.warning(f"Matches your inventory: {", ".join(result["matched_inventory"])}")
                    st.write(f"Boost factor applied: {result["boost_factor"]}x")
                else:
                    st.info("No inventory matches found.")
                st.subheader("Risk signals")
                r1,r2,r3 = st.columns(3)
                r1.metric("Remote exploitable", "Yes" if result["has_remote"] else "No")
                r2.metric("Code execution",     "Yes" if result["has_exec"]   else "No")
                r3.metric("Attack vector",      result["attack_vector"])
        except Exception as e:
            st.error(f"Error: {e}")

# Screen 2
elif screen == "Bulk analysis":
    st.title("Bulk CVE analysis")
    st.markdown("Upload a CSV with a **cve_id** column to analyse multiple CVEs at once.")
    sample = "cve_id\nCVE-2021-44228\nCVE-2022-30190\nCVE-2019-0708"
    st.download_button("Download sample CSV", sample, file_name="sample_cves.csv", mime="text/csv")
    bulk_file = st.file_uploader("Upload CVE list CSV", type="csv")
    if bulk_file and st.button("Run bulk analysis"):
        try:
            model, le = load_model()
            df, emb   = load_data()
            bulk_df   = pd.read_csv(bulk_file)
            if "cve_id" not in bulk_df.columns:
                st.error("CSV must have a column named: cve_id")
            else:
                results  = []
                missing  = []
                progress = st.progress(0)
                total    = len(bulk_df)
                for i, cve_id in enumerate(bulk_df["cve_id"].tolist()):
                    cve_id = str(cve_id).strip().upper()
                    match  = df[df["cve_id"] == cve_id]
                    if match.empty:
                        missing.append(cve_id)
                    else:
                        results.append(predict_row(match.index[0], df, emb, model, le, inventory))
                    progress.progress((i+1)/total)
                if results:
                    out = pd.DataFrame(results).sort_values("context_score", ascending=False).reset_index(drop=True)
                    out.index += 1
                    st.success(f"Analysed {len(results)} CVEs")
                    if missing:
                        st.warning(f"Not found: {", ".join(missing)}")
                    st.dataframe(out[["cve_id","cvss_score","cvss_label","predicted_label",
                                      "context_score","boost_factor","matched_inventory"]],
                                 use_container_width=True)
                    st.download_button("Download results", out.to_csv(index=False),
                                       file_name="results.csv", mime="text/csv")
        except Exception as e:
            st.error(f"Error: {e}")

# Screen 3
elif screen == "Inventory matcher":
    st.title("Inventory-based CVE matcher")
    st.markdown("Finds CVEs that match your software inventory, ranked by context score.")
    if not inventory:
        st.warning("Upload your inventory CSV in the sidebar first.")
        st.code("software\nApache Log4j\nWindows Server\nOpenSSL\nMySQL")
    else:
        st.success(f"Inventory loaded: {len(inventory)} items")
        if st.button("Find matching CVEs"):
            try:
                model, le = load_model()
                df, emb   = load_data()
                progress  = st.progress(0)
                matches   = []
                sample    = min(10000, len(df))
                for i, (_, row) in enumerate(df.head(sample).iterrows()):
                    if match_inventory(row.get("entities",""), inventory):
                        matches.append(predict_row(row.name, df, emb, model, le, inventory))
                    if i % 500 == 0:
                        progress.progress(i/sample)
                progress.progress(1.0)
                if matches:
                    out = pd.DataFrame(matches).sort_values("context_score", ascending=False).reset_index(drop=True)
                    out.index += 1
                    st.success(f"Found {len(out)} matching CVEs")
                    st.dataframe(out[["cve_id","cvss_score","cvss_label","predicted_label",
                                      "context_score","matched_inventory","description"]],
                                 use_container_width=True)
                else:
                    st.info("No matches found in scanned sample.")
            except Exception as e:
                st.error(f"Error: {e}")
