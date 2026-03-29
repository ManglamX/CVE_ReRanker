import requests
import pandas as pd
import time
import os
import json
from datetime import datetime, timedelta, timezone

API_KEY    = os.environ["NVD_API_KEY"]
HEADERS    = {"apiKey": API_KEY}
CSV_PATH   = "data/cves_raw.csv"
TRACKER    = "data/last_updated.json"

def score_to_label(score):
    if score >= 9.0:   return "Critical"
    elif score >= 7.0: return "High"
    elif score >= 4.0: return "Medium"
    else:              return "Low"

def fetch_chunk(start, end):
    url       = "https://services.nvd.nist.gov/rest/json/cves/2.0"
    all_items = []
    idx       = 0
    while True:
        full_url = f"{url}?pubStartDate={start}&pubEndDate={end}&startIndex={idx}&resultsPerPage=2000"
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
                "description":         desc,
                "cvss_score":          score,
                "cvss_label":          score_to_label(score),
                "attack_vector":       cvss_data.get("attackVector", ""),
                "attack_complexity":   cvss_data.get("attackComplexity", ""),
                "privileges_required": cvss_data.get("privilegesRequired", ""),
                "user_interaction":    cvss_data.get("userInteraction", ""),
                "scope":               cvss_data.get("scope", "")
            })
        except:
            continue
    return rows

# ── MAIN ──────────────────────────────────────────────────────────────
df           = pd.read_csv(CSV_PATH)
existing_ids = set(df["cve_id"].tolist())
today        = datetime.now(timezone.utc).replace(tzinfo=None)

# Read last collected date from tracker
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
            chunk_end.strftime("%Y-%m-%dT23:59:59.999")
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
        combined.to_csv(CSV_PATH, index=False)
        print(f"Saved. Total CVEs: {len(combined)}")

    with open(TRACKER, "w") as f:
        json.dump({"last_collected": today.strftime("%Y-%m-%d")}, f)
    print("Tracker updated.")