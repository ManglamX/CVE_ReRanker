import requests
import pandas as pd
import time
import os
import csv
import json
from datetime import datetime, timedelta, timezone

API_KEY  = os.environ["NVD_API_KEY"]
HEADERS  = {"apiKey": API_KEY}
CSV_PATH = "data/cves_raw.csv"
TRACKER  = "data/last_updated.json"

COLUMNS = [
    "cve_id", "description", "cvss_score", "cvss_label",
    "attack_vector", "attack_complexity", "privileges_required",
    "user_interaction", "scope"
]

# ── helpers ────────────────────────────────────────────────────────────

def score_to_label(score):
    if score >= 9.0:   return "Critical"
    elif score >= 7.0: return "High"
    elif score >= 4.0: return "Medium"
    else:              return "Low"


def read_csv(path):
    """Read the TSV safely; return an empty DataFrame on first run."""
    if not os.path.exists(path):
        return pd.DataFrame(columns=COLUMNS)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            first_line = fh.readline()
        sep = "\t" if "\t" in first_line else ","
        return pd.read_csv(
            path,
            sep=sep,
            engine="python",
            on_bad_lines="skip",
        )
    except Exception as e:
        print(f"Warning: could not read {path} ({e}). Starting fresh.")
        return pd.DataFrame(columns=COLUMNS)


def save_csv(df, path):
    """Write as TSV with full quoting so embedded tabs/newlines are safe."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_csv(
        path,
        index=False,
        sep="\t",
        quoting=csv.QUOTE_ALL,
        escapechar="\\",
    )


# ── fetch / parse ──────────────────────────────────────────────────────

def fetch_chunk(start, end):
    url       = "https://services.nvd.nist.gov/rest/json/cves/2.0"
    all_items = []
    idx       = 0
    while True:
        full_url = (
            f"{url}?pubStartDate={start}&pubEndDate={end}"
            f"&startIndex={idx}&resultsPerPage=2000"
        )
        try:
            r = requests.get(full_url, headers=HEADERS, timeout=60)
            r.raise_for_status()
            data  = r.json()
            total = data.get("totalResults", 0)
            items = data.get("vulnerabilities", [])
            all_items.extend(items)
            if len(all_items) >= total:
                break
            idx += 2000
            time.sleep(0.7)
        except Exception as e:
            print(f"  Error: {e}")
            break
    return all_items


def parse_items(items, existing_ids):
    rows = []
    for item in items:
        try:
            cve  = item["cve"]
            desc = ""
            for d in cve.get("descriptions", []):
                if d["lang"] == "en":
                    desc = d["value"]
                    break

            if not desc or "** REJECT **" in desc or len(desc.split()) < 10:
                continue
            if cve["id"] in existing_ids:
                continue

            metrics   = cve.get("metrics", {})
            cvss_data = None
            if "cvssMetricV31" in metrics:
                cvss_data = metrics["cvssMetricV31"][0]["cvssData"]
            elif "cvssMetricV30" in metrics:
                cvss_data = metrics["cvssMetricV30"][0]["cvssData"]
            else:
                continue

            score = cvss_data["baseScore"]
            rows.append({
                "cve_id":              cve["id"],
                # Collapse embedded newlines so each CVE stays on one TSV row
                "description":         " ".join(desc.split()),
                "cvss_score":          score,
                "cvss_label":          score_to_label(score),
                "attack_vector":       cvss_data.get("attackVector", ""),
                "attack_complexity":   cvss_data.get("attackComplexity", ""),
                "privileges_required": cvss_data.get("privilegesRequired", ""),
                "user_interaction":    cvss_data.get("userInteraction", ""),
                "scope":               cvss_data.get("scope", ""),
            })
        except Exception:
            continue
    return rows


# ── main ───────────────────────────────────────────────────────────────

df           = read_csv(CSV_PATH)
existing_ids = set(df["cve_id"].tolist()) if "cve_id" in df.columns else set()
today        = datetime.now(timezone.utc).replace(tzinfo=None)

if os.path.exists(TRACKER):
    with open(TRACKER) as f:
        data = json.load(f)
    last = datetime.strptime(data["last_collected"], "%Y-%m-%d")
else:
    last = datetime(2023, 12, 31)

gap = (today - last).days
print(f"Last collected: {last.strftime('%Y-%m-%d')}")
print(f"Today:          {today.strftime('%Y-%m-%d')}")
print(f"Gap:            {gap} days")
print(f"Existing CVEs:  {len(df)}")

if gap < 1:
    print("Already up to date.")
else:
    chunks  = []
    current = last + timedelta(days=1)
    while current < today:
        chunk_end = min(current + timedelta(days=99), today)
        chunks.append((
            current.strftime("%Y-%m-%dT00:00:00.000"),
            chunk_end.strftime("%Y-%m-%dT23:59:59.999"),
        ))
        current = chunk_end + timedelta(days=1)

    print(f"Fetching {len(chunks)} chunks...")
    all_new = []
    for i, (start, end) in enumerate(chunks):
        print(f"Chunk {i+1}/{len(chunks)}: {start[:10]} → {end[:10]}")
        items    = fetch_chunk(start, end)
        new_rows = parse_items(items, existing_ids)
        all_new.extend(new_rows)
        existing_ids.update([r["cve_id"] for r in new_rows])
        print(f"  Added {len(new_rows)} | Total new: {len(all_new)}")
        time.sleep(2)

    if all_new:
        combined = pd.concat([df, pd.DataFrame(all_new)], ignore_index=True)
        save_csv(combined, CSV_PATH)
        print(f"Saved. Total CVEs: {len(combined)}")
    else:
        print("No new CVEs found.")

    with open(TRACKER, "w") as f:
        json.dump({"last_collected": today.strftime("%Y-%m-%d")}, f)
    print("Tracker updated.")