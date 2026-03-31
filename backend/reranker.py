"""
backend/reranker.py
Inventory matching + contextual boost formula.
Mirrors app/reranker.py but lives here for the FastAPI backend.
"""

import pandas as pd
try:
    from thefuzz import fuzz          # type: ignore
except ImportError:
    from fuzzywuzzy import fuzz       # type: ignore


def match_inventory(entities_str, inventory_list: list[str], description: str = "") -> list[str]:
    """
    Return inventory items that appear in the CVE via:
      1. Fuzzy match against NER-extracted entities
      2. Direct substring / fuzzy match against raw description
    """
    matched: list[str] = []

    # ── 1. Entities column ──────────────────────────────────────────────
    if entities_str and not pd.isna(entities_str):
        entities = [e.strip() for e in str(entities_str).split(",") if e.strip()]
        for inv_item in inventory_list:
            for entity in entities:
                if fuzz.partial_ratio(inv_item.lower(), entity.lower()) >= 75:
                    matched.append(inv_item)
                    break

    # ── 2. Raw description ──────────────────────────────────────────────
    if description:
        desc_lower = description.lower()
        for inv_item in inventory_list:
            if inv_item not in matched:
                inv_lower = inv_item.lower()
                if inv_lower in desc_lower:
                    matched.append(inv_item)
                elif fuzz.partial_ratio(inv_lower, desc_lower) >= 85:
                    matched.append(inv_item)

    return list(set(matched))


def compute_context_score(row: dict, inventory_list: list[str], base_prob_critical: float) -> dict:
    """
    Apply boost multipliers and return context_score, matched_inventory, boost_factor.

    boost formula (from README):
        boost  = 1.0
               + 0.30 × inventory_matches
               × 1.25  (if public exploit)
               × 1.15  (if remote + unauthenticated)
               × 1.10  (if attack_vector == NETWORK)

        context_score = min(prob_critical × boost, 1.0)
    """
    boost = 1.0

    matched = match_inventory(
        row.get("entities", ""),
        inventory_list,
        row.get("description", ""),
    )

    if matched:
        boost += 0.3 * len(matched)
    if row.get("exploit_available", 0) == 1:
        boost *= 1.25
    if row.get("has_remote", 0) == 1 and row.get("has_unauth", 0) == 1:
        boost *= 1.15
    if str(row.get("attack_vector", "")).upper() == "NETWORK":
        boost *= 1.10

    context_score = min(float(base_prob_critical) * boost, 1.0)
    return {
        "context_score":     round(context_score, 4),
        "matched_inventory": matched,
        "boost_factor":      round(boost, 3),
    }
