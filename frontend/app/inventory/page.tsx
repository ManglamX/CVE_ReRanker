"use client";

import { useRef, useState } from "react";
import { api, CVEResult } from "@/lib/api";

const SAMPLE_CSV = `software\nApache HTTP Server\nOpenSSL\nWindows Server\nMySQL\nLog4j\nnginx`;

function severityClass(label: string) {
  return `badge badge-${label?.toLowerCase() ?? ""}`;
}

function scoreColor(v: number) {
  if (v >= 0.75) return "var(--critical)";
  if (v >= 0.50) return "var(--high)";
  if (v >= 0.25) return "var(--medium)";
  return "var(--low)";
}

export default function InventoryPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  const [file,       setFile]       = useState<File | null>(null);
  const [sampleSize, setSampleSize] = useState(5000);
  const [results,    setResults]    = useState<CVEResult[]>([]);
  const [matched,    setMatched]    = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [done,       setDone]       = useState(false);

  const handleFile = (f: File) => setFile(f);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setResults([]);
    setDone(false);
    try {
      const res = await api.inventoryMatch(file, sampleSize);
      setResults(res.results);
      setMatched(res.matched);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2 className="page-title">Inventory Matcher</h2>
        <p className="page-subtitle">Upload your software inventory — get back only the CVEs that affect you, ranked by context score</p>
      </div>

      <div className="page-body">
        <div className="section-grid section-grid-2" style={{ marginBottom: 20 }}>
          {/* Upload form */}
          <div className="card">
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label className="input-label">Software Inventory CSV</label>
                <div
                  className={`drop-zone${file ? " drag-over" : ""}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="dz-icon">🗂</div>
                  <div className="dz-title">Drop inventory CSV or click to browse</div>
                  <div className="dz-sub">Required column: <code>software</code></div>
                  {file && <div className="dz-file">✓ {file.name}</div>}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </div>

              <div className="input-group">
                <label className="input-label">CVEs to Scan: {sampleSize.toLocaleString()}</label>
                <div className="range-wrap">
                  <input
                    type="range"
                    min={100}
                    max={10000}
                    step={100}
                    value={sampleSize}
                    onChange={(e) => setSampleSize(Number(e.target.value))}
                  />
                  <span className="range-val">{(sampleSize / 1000).toFixed(1)}k</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 4 }}>
                  Higher = more thorough but slower. Dataset has 200k+ CVEs.
                </div>
              </div>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={loading || !file}
              >
                {loading ? (
                  <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Matching…</>
                ) : "🗂 Find Matching CVEs"}
              </button>
            </form>
          </div>

          {/* Sample CSV format */}
          <div className="card">
            <div className="card-title">Sample Inventory Format</div>
            <pre style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 13,
              color: "var(--cyan)",
              background: "var(--bg)",
              borderRadius: "var(--radius)",
              padding: "14px 16px",
              marginTop: 8,
              border: "1px solid var(--border-muted)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.8,
            }}>{SAMPLE_CSV}</pre>
            <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 10 }}>
              The system fuzzy-matches each software name against CVE entity tags and descriptions using FuzzyWuzzy.
            </div>

            <div className="divider" />

            <div className="card-title">Boost Formula</div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text-muted)", lineHeight: 2, background: "var(--bg)", border: "1px solid var(--border-muted)", borderRadius: "var(--radius)", padding: "12px 14px", marginTop: 8 }}>
              <span style={{ color: "var(--accent)" }}>boost</span> = 1.0<br />
              &nbsp;&nbsp;+ 0.30 × inventory_matches<br />
              &nbsp;&nbsp;× 1.25 (if public exploit)<br />
              &nbsp;&nbsp;× 1.15 (if remote + unauth)<br />
              &nbsp;&nbsp;× 1.10 (if NETWORK vector)<br />
              <br />
              <span style={{ color: "var(--cyan)" }}>context_score</span> = min(prob_critical × boost, 1.0)
            </div>
          </div>
        </div>

        {error && <div className="error-box" style={{ marginBottom: 16 }}>⚠ {error}</div>}

        {loading && (
          <div className="spinner-wrap">
            <div className="spinner" />
            <span>Scanning CVEs for inventory matches…</span>
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Scanning {sampleSize.toLocaleString()} CVEs</span>
          </div>
        )}

        {done && !loading && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {matched > 0 ? (
                  <>Found <strong style={{ color: "var(--text)" }}>{matched}</strong> CVEs matching your inventory</>
                ) : (
                  "No CVEs matched your inventory in the scanned range."
                )}
              </div>
            </div>

            {results.length > 0 ? (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>CVE ID</th>
                      <th>CVSS</th>
                      <th>Predicted</th>
                      <th>Context Score</th>
                      <th>Boost</th>
                      <th>Matched Software</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={r.cve_id}>
                        <td style={{ color: "var(--text-subtle)", width: 36 }}>{i + 1}</td>
                        <td><span className="cve-id">{r.cve_id}</span></td>
                        <td><span className={severityClass(r.cvss_label)}>{r.cvss_label}</span></td>
                        <td><span className={severityClass(r.predicted_label)}>{r.predicted_label}</span></td>
                        <td>
                          <div className="score-bar-wrap" style={{ minWidth: 120 }}>
                            <div className="score-bar-track" style={{ flex: 1 }}>
                              <div className="score-bar-fill" style={{ width: `${r.context_score * 100}%`, background: scoreColor(r.context_score) }} />
                            </div>
                            <span className="score-val">{r.context_score.toFixed(3)}</span>
                          </div>
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.boost_factor.toFixed(2)}×</td>
                        <td>
                          <div className="inv-tags">
                            {r.matched_inventory.map((m) => (
                              <span key={m} className="inv-tag">{m}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="state-box">
                <div className="state-icon">✅</div>
                <div className="state-title">No matches found</div>
                <div className="state-sub">
                  None of the scanned {sampleSize.toLocaleString()} CVEs matched your inventory. Try increasing the scan range or broadening software names.
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !done && !error && (
          <div className="state-box" style={{ marginTop: 12 }}>
            <div className="state-icon">🗂</div>
            <div className="state-title">Upload your inventory CSV</div>
            <div className="state-sub">
              The system will scan CVEs and surface only those that affect your software, ranked by context score.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
