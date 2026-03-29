
import pandas as pd
from fuzzywuzzy import fuzz

def match_inventory(entities_str, inventory_list, description=""):
    """Check entities column AND raw description text for inventory matches."""
    matched = []

    # Check entities column
    if entities_str and not pd.isna(entities_str):
        entities = [e.strip() for e in str(entities_str).split(",") if e.strip()]
        for inv_item in inventory_list:
            for entity in entities:
                if fuzz.partial_ratio(inv_item.lower(), entity.lower()) >= 75:
                    matched.append(inv_item)
                    break

    # Also check raw description text directly
    if description:
        desc_lower = description.lower()
        for inv_item in inventory_list:
            if inv_item not in matched:
                inv_lower = inv_item.lower()
                # Direct substring match in description
                if inv_lower in desc_lower:
                    matched.append(inv_item)
                # Fuzzy match on key words (handles "Log4j" vs "log4j2")
                elif fuzz.partial_ratio(inv_lower, desc_lower) >= 85:
                    matched.append(inv_item)

    return list(set(matched))

def compute_context_score(row, inventory_list, base_prob_critical):
    boost   = 1.0

    # Pass description to match_inventory for better matching
    matched = match_inventory(
        row.get("entities", ""),
        inventory_list,
        row.get("description", "")
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
        "boost_factor":      round(boost, 3)
    }
