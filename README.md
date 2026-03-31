# CVE Vulnerability Severity Re-Ranking

> Context-aware vulnerability prioritisation using NLP, Deep Learning, and Machine Learning

[![Python](https://img.shields.io/badge/Python-3.10-blue?style=flat-square)](https://python.org)
[![XGBoost](https://img.shields.io/badge/XGBoost-3.2-orange?style=flat-square)](https://xgboost.readthedocs.io)
[![SecBERT](https://img.shields.io/badge/SecBERT-BERT--base-purple?style=flat-square)](https://huggingface.co/jackaduma/SecBERT)
[![Streamlit](https://img.shields.io/badge/Streamlit-UI-red?style=flat-square)](https://streamlit.io)
[![NVD](https://img.shields.io/badge/Dataset-NVD%20200k%2B%20CVEs-green?style=flat-square)](https://nvd.nist.gov)
[![SDG](https://img.shields.io/badge/SDG-9%20%26%2016-teal?style=flat-square)](https://sdgs.un.org/goals)

---

## The Problem

The [National Vulnerability Database (NVD)](https://nvd.nist.gov) publishes thousands of CVEs every month, each with a static CVSS score. Security teams sort by CVSS and start patching from the top — but CVSS is environment-blind. A CVSS 9.8 Critical in software you don't use is less urgent than a CVSS 7.5 High in software running on your public-facing server.

This project fixes that.

---

## What This System Does

1. Analyses CVE descriptions from the NVD using NLP + BERT embeddings
2. Predicts severity (Low / Medium / High / Critical) using XGBoost
3. Re-ranks CVEs based on your specific software inventory
4. Surfaces the most dangerous vulnerabilities for **your environment** — not a generic list

---

## Team

| Name | Roll No | Contribution |
|---|---|---|
| Manglam Jaiswal | 10127 | Data collection, NLP preprocessing, EDA |
| Tanaya Bane | 10107 | Re-ranking module, Streamlit UI, evaluation |
| Tanmay Sarode | 10154 | SecBERT embeddings, XGBoost training, SHAP |

Third Year | Semester 6 | ML + DL + NLP Mini Project | 2025–26

---

## Results

| Metric | Value |
|---|---|
| Dataset | 200,431 CVEs (NVD 2019–2026) |
| Model | XGBoost on 781-dim fused feature vector |
| Weighted F1 | **0.77** |
| Accuracy | **77%** |
| Medium F1 | 0.82 |
| Critical F1 | 0.73 |

---

## System Architecture

```
NVD API
   │
   ▼
[Layer 1 — NLP]
  Text cleaning → spaCy NER → keyword feature flags
   │
   ▼
[Layer 2 — Deep Learning]
  SecBERT → 768-dim CLS embedding per CVE
   │
   ▼
[Layer 3 — Feature Fusion]
  BERT (768) + NLP features (8) + CVSS metadata (5) = 781-dim vector
   │
   ▼
[Layer 4 — Machine Learning]
  XGBoost classifier → Low / Medium / High / Critical
   │
   ▼
[Layer 5 — Contextual Re-Ranking]
  User inventory CSV → fuzzy match → boost score → re-sorted list
   │
   ▼
[Streamlit Dashboard]
  Single CVE lookup | Bulk analysis | Inventory matcher
```

---

## SDG Mapping

**SDG 9 — Industry, Innovation and Infrastructure**
Makes intelligent vulnerability prioritisation accessible to organisations of all sizes.

**SDG 16 — Peace, Justice and Strong Institutions**
Strengthens institutional resilience against cyberattacks by enabling faster, targeted vulnerability response.

---

## Repository Structure

```
cve-severity-reranker/
│
├── .github/
│   └── workflows/
│       ├── daily_fetch.yml         # Fetches new CVEs every day at 6 AM UTC
│       └── weekly_pipeline.yml     # Full pipeline every Sunday at 2 AM UTC
│
├── scripts/
│   ├── 01_fetch.py                 # NVD API data collection
│   ├── 02_preprocess.py            # NLP cleaning + feature engineering
│   ├── 03_embeddings.py            # SecBERT embedding generation
│   └── 04_train.py                 # XGBoost training (smart update mode)
│
├── data/
│   ├── cves_raw.csv                # Raw NVD data (Git LFS)
│   ├── cves_processed.csv          # Cleaned + feature engineered (Git LFS)
│   ├── bert_embeddings.npy         # 200k × 768 embedding matrix (Git LFS)
│   └── last_updated.json           # Tracks last data collection date
│
├── models/
│   ├── model_xgb.pkl               # Trained XGBoost model (Git LFS)
│   ├── label_encoder.pkl           # Label encoder
│   └── training_tracker.json       # Tracks rows model was trained on
│
├── app/
│   ├── app.py                      # Streamlit application (3 screens)
│   └── reranker.py                 # Contextual re-ranking logic
│
├── notebooks/
│   ├── 01_data_collection.ipynb    # NVD API fetch (Colab)
│   ├── 02_preprocessing.ipynb      # NLP pipeline (Colab)
│   ├── 04_embeddings.ipynb         # SecBERT embeddings (Colab, GPU)
│   ├── 05_training.ipynb           # XGBoost training (Colab)
│   └── 06_live_updater.ipynb       # Manual dataset update (Colab)
│
├── requirements.txt
└── README.md
```

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/cve-severity-reranker.git
cd cve-severity-reranker
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### 3. Run the Streamlit app

```bash
streamlit run app/app.py
```

The app loads the saved model and embeddings automatically. No training needed.

---

## How to Use the App

### Screen 1 — Single CVE lookup
Enter any CVE ID (e.g. `CVE-2021-44228`) and click **Analyse**. The system returns the predicted severity, context score, and risk signals.

Upload your software inventory CSV in the sidebar to see inventory matches and boost scores.

### Screen 2 — Bulk analysis
Upload a CSV with a `cve_id` column. The system analyses all CVEs and returns a table sorted by context score. Download results as CSV.

### Screen 3 — Inventory matcher
Upload your inventory CSV. The system scans the dataset and returns only CVEs that affect your software, sorted by context score.

**Sample inventory CSV format:**
```csv
software
Apache HTTP Server
OpenSSL
Windows Server
MySQL
Log4j
nginx
```

---

## How the Re-Ranking Works

After XGBoost predicts severity probabilities, a boost formula adjusts the Critical class probability:

```
boost = 1.0
  + 0.30 × (number of inventory matches)
  × 1.25 (if public exploit exists)
  × 1.15 (if remote + unauthenticated)
  × 1.10 (if attack vector = NETWORK)

context_score = min(prob_critical × boost, 1.0)
```

CVEs are then sorted by `context_score` descending — not by CVSS score.

**Example:** CVE-2021-44228 (Log4Shell)
- Without inventory: context score = 0.51
- With `Log4j` in inventory: context score = 0.67 (boost 1.43×)

---

## Automation (GitHub Actions)

The repo includes two automated workflows:

| Workflow | Schedule | What it does |
|---|---|---|
| `daily_fetch.yml` | Every day 6 AM UTC | Fetches new CVEs from NVD, updates `cves_raw.csv` |
| `weekly_pipeline.yml` | Every Sunday 2 AM UTC | Full pipeline: fetch → preprocess → embed → retrain |

The training script is smart — it only does what is needed:
- **No change** → skips training, loads existing model
- **Small update** (< 10% new rows) → continues training on new rows only
- **Large update** (≥ 10% new rows) → full retrain

To set up automation, add your NVD API key as a GitHub Secret named `NVD_API_KEY`.

---

## Training Your Own Model

If you want to retrain from scratch on Google Colab:

1. Open `notebooks/01_data_collection.ipynb` → fetch CVE data
2. Open `notebooks/02_preprocessing.ipynb` → clean and engineer features
3. Open `notebooks/04_embeddings.ipynb` → generate SecBERT embeddings (GPU required)
4. Open `notebooks/05_training.ipynb` → train XGBoost and evaluate

Each notebook is self-contained and smart — it skips steps already completed.

---

## Tech Stack

| Component | Technology |
|---|---|
| Language | Python 3.10 |
| NLP | spaCy, regex |
| Deep Learning | SecBERT (Hugging Face transformers), PyTorch |
| Machine Learning | XGBoost, scikit-learn |
| Explainability | SHAP TreeExplainer |
| Inventory matching | FuzzyWuzzy |
| UI | Streamlit |
| Data | NVD REST API v2.0 |
| Training platform | Google Colab (T4 GPU) |
| Automation | GitHub Actions |
| Storage | Google Drive + Git LFS |

---

## Evaluation

**Classification Report (test set: 40,087 CVEs)**

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Critical | 0.72 | 0.74 | 0.73 | 4,705 |
| High | 0.76 | 0.72 | 0.74 | 14,792 |
| Low | 0.88 | 0.38 | 0.53 | 1,589 |
| Medium | 0.79 | 0.86 | 0.82 | 19,001 |
| **Weighted avg** | **0.77** | **0.77** | **0.77** | **40,087** |

The Low class has lower recall due to class imbalance (1,589 samples vs 19,001 Medium). This is a known limitation and a planned improvement for future work.

---

## Dataset

| Property | Value |
|---|---|
| Source | NVD REST API v2.0 |
| Date range | January 2019 — March 2026 |
| Total CVEs | 200,431 |
| Features per CVE | 781 (768 BERT + 8 NLP + 5 metadata) |
| Labels | Low / Medium / High / Critical (from CVSS v3 base score) |

**Label mapping:**
- 0.0 – 3.9 → Low
- 4.0 – 6.9 → Medium
- 7.0 – 8.9 → High
- 9.0 – 10.0 → Critical

---

## References

1. Shahid & Debar. *CVSS-BERT: Explainable NLP to Determine the Severity of a Computer Security Vulnerability from its Description.* arXiv 2021.
2. *A Machine Learning Approach for the NLP-Based Analysis of Cyber Threats and Vulnerabilities.* PMC 2023.
3. *CVE Severity Prediction From Vulnerability Description — A Deep Learning Approach.* ScienceDirect 2024.
4. jackaduma. *SecBERT.* Hugging Face Hub. `jackaduma/SecBERT`
5. Lundberg & Lee. *A Unified Approach to Interpreting Model Predictions (SHAP).* NeurIPS 2017.
6. Chen & Guestrin. *XGBoost: A Scalable Tree Boosting System.* KDD 2016.

---

## License

This project was built for academic purposes as part of a Third Year Mini Project (2025–26).