"""
backend/main.py
FastAPI application — all API routes.

Run with:
    cd backend
    uvicorn main:app --reload --port 8000

Docs at: http://localhost:8000/docs
"""

from __future__ import annotations

import io
import csv
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import pipeline


# ── Lifespan: load heavy artifacts once at startup ──────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    pipeline.load_artifacts()
    yield


# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="CVE Severity Re-Ranker API",
    description=(
        "Context-aware vulnerability prioritisation using NLP, "
        "SecBERT embeddings, and XGBoost. "
        "Re-ranks CVEs based on your software inventory."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic schemas ─────────────────────────────────────────────────────────
class CVEResult(BaseModel):
    cve_id:            str
    description:       str
    cvss_score:        float
    cvss_label:        str
    predicted_label:   str
    prob_critical:     float
    context_score:     float
    boost_factor:      float
    matched_inventory: list[str]
    attack_vector:     str
    has_remote:        int
    has_exec:          int


class BulkRequest(BaseModel):
    cve_ids:   list[str] = Field(..., min_length=1, description="List of CVE IDs to analyse")
    inventory: list[str] = Field(default=[], description="Optional software inventory for re-ranking")


class BulkResponse(BaseModel):
    analysed: int
    missing:  list[str]
    results:  list[CVEResult]


class InventoryMatchResponse(BaseModel):
    matched: int
    results: list[CVEResult]


class StatsResponse(BaseModel):
    total_cves:         int
    label_distribution: dict[str, int]
    classes:            list[str]
    feature_dims:       int
    trained_on_rows:    int | str
    last_data_update:   str


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    summary="Health check",
    tags=["Utility"],
)
def health():
    """Returns 200 OK when the service is up and model is loaded."""
    return {"status": "ok", "model": "XGBoost + SecBERT"}


# ── GET /cve/{cve_id} ────────────────────────────────────────────────────────
@app.get(
    "/cve/{cve_id}",
    response_model=CVEResult,
    summary="Analyse a single CVE",
    tags=["Analysis"],
)
def analyse_single(
    cve_id: str,
    inventory: Annotated[
        list[str],
        Query(description="Software inventory items for re-ranking (repeat param for multiple)"),
    ] = [],
):
    """
    Look up one CVE by ID and run the full prediction + re-ranking pipeline.

    **Example**
    ```
    GET /cve/CVE-2021-44228?inventory=Log4j&inventory=OpenSSL
    ```
    """
    result = pipeline.predict_single(cve_id, inventory)
    if result is None:
        raise HTTPException(status_code=404, detail=f"{cve_id.upper()} not found in dataset.")
    return result


# ── POST /bulk ───────────────────────────────────────────────────────────────
@app.post(
    "/bulk",
    response_model=BulkResponse,
    summary="Analyse a list of CVE IDs",
    tags=["Analysis"],
)
def analyse_bulk(body: BulkRequest):
    """
    Submit a list of CVE IDs and an optional inventory.
    Results are sorted by `context_score` (highest first).

    **Example body**
    ```json
    {
      "cve_ids": ["CVE-2021-44228", "CVE-2022-30190"],
      "inventory": ["Apache Log4j", "OpenSSL", "Windows Server"]
    }
    ```
    """
    results, missing = pipeline.predict_bulk(body.cve_ids, body.inventory)
    return BulkResponse(
        analysed=len(results),
        missing=missing,
        results=results,
    )


# ── POST /inventory ──────────────────────────────────────────────────────────
@app.post(
    "/inventory",
    response_model=InventoryMatchResponse,
    summary="Find CVEs matching your uploaded inventory",
    tags=["Analysis"],
)
async def inventory_match(
    file: UploadFile = File(..., description="CSV file with a 'software' column"),
    sample_size: int = Query(
        default=10_000,
        ge=100,
        le=200_000,
        description="How many CVEs to scan (max 200 000)",
    ),
):
    """
    Upload a CSV with a **software** column.
    Returns all CVEs that match your inventory, sorted by `context_score`.

    **Sample CSV format**
    ```
    software
    Apache HTTP Server
    OpenSSL
    Windows Server
    MySQL
    Log4j
    nginx
    ```
    """
    content = await file.read()
    try:
        text    = content.decode("utf-8")
        reader  = csv.DictReader(io.StringIO(text))
        if "software" not in (reader.fieldnames or []):
            raise HTTPException(
                status_code=422,
                detail="CSV must contain a column named 'software'.",
            )
        inventory = [row["software"].strip() for row in reader if row.get("software", "").strip()]
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="File must be a UTF-8 encoded CSV.")

    if not inventory:
        raise HTTPException(status_code=422, detail="Inventory CSV is empty.")

    results = pipeline.find_inventory_matches(inventory, sample_size=sample_size)
    return InventoryMatchResponse(matched=len(results), results=results)


# ── GET /stats ───────────────────────────────────────────────────────────────
@app.get(
    "/stats",
    response_model=StatsResponse,
    summary="Dataset and model statistics",
    tags=["Utility"],
)
def stats():
    """Returns dataset size, label distribution, and model metadata."""
    return pipeline.get_stats()
