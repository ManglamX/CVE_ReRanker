"""
backend/test_api.py
Quick smoke-test for all five API endpoints.
Run AFTER the server is up:  python test_api.py
"""

import json
import urllib.request
import urllib.error

BASE = "http://localhost:8000"


def get(path: str) -> dict:
    with urllib.request.urlopen(BASE + path, timeout=30) as r:
        return json.loads(r.read())


def post(path: str, payload: dict) -> dict:
    body = json.dumps(payload).encode()
    req  = urllib.request.Request(
        BASE + path,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def post_file(path: str, csv_content: str) -> dict:
    boundary = "----TestBoundary7MA4YWxkTrZu0gW"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="inventory.csv"\r\n'
        f"Content-Type: text/csv\r\n\r\n"
        f"{csv_content}\r\n"
        f"--{boundary}--\r\n"
    ).encode()
    req = urllib.request.Request(
        BASE + path,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


# ── 1. Health ────────────────────────────────────────────────────────────────
print("\n── 1. GET /health ──")
h = get("/health")
print(f"  status : {h['status']}")
print(f"  model  : {h['model']}")

# ── 2. Stats ─────────────────────────────────────────────────────────────────
print("\n── 2. GET /stats ──")
s = get("/stats")
print(f"  total_cves        : {s['total_cves']:,}")
print(f"  classes           : {s['classes']}")
print(f"  label_distribution: {s['label_distribution']}")
print(f"  last_data_update  : {s['last_data_update']}")

# ── 3. Single CVE — no inventory ────────────────────────────────────────────
print("\n── 3. GET /cve/CVE-2021-44228 (no inventory) ──")
c = get("/cve/CVE-2021-44228")
print(f"  cvss_score    : {c['cvss_score']}  ({c['cvss_label']})")
print(f"  predicted     : {c['predicted_label']}")
print(f"  context_score : {c['context_score']}")
print(f"  boost_factor  : {c['boost_factor']}")
print(f"  attack_vector : {c['attack_vector']}")

# ── 4. Single CVE — with inventory ──────────────────────────────────────────
print("\n── 4. GET /cve/CVE-2021-44228?inventory=Log4j&inventory=OpenSSL ──")
c2 = get("/cve/CVE-2021-44228?inventory=Log4j&inventory=OpenSSL")
print(f"  context_score    : {c2['context_score']}")
print(f"  boost_factor     : {c2['boost_factor']}")
print(f"  matched_inventory: {c2['matched_inventory']}")

# ── 5. Bulk ──────────────────────────────────────────────────────────────────
print("\n── 5. POST /bulk ──")
b = post("/bulk", {
    "cve_ids":   ["CVE-2021-44228", "CVE-2022-30190", "CVE-2019-0708", "CVE-FAKE-0000"],
    "inventory": ["Apache Log4j", "Windows Server"],
})
print(f"  analysed : {b['analysed']}")
print(f"  missing  : {b['missing']}")
for r in b["results"]:
    print(f"  {r['cve_id']:20s}  context={r['context_score']}  matched={r['matched_inventory']}")

# ── 6. Inventory file upload ────────────────────────────────────────────────
print("\n── 6. POST /inventory (CSV upload, sample_size=500) ──")
csv_content = "software\nApache Log4j\nWindows Server\nOpenSSL\nMySQL"
try:
    inv = post_file("/inventory?sample_size=500", csv_content)
    print(f"  matched : {inv['matched']}")
    for r in inv["results"][:3]:
        print(f"  {r['cve_id']:20s}  context={r['context_score']}  matched={r['matched_inventory']}")
except urllib.error.HTTPError as e:
    print(f"  HTTP {e.code}: {e.read().decode()}")

print("\n✅  All tests complete.")
