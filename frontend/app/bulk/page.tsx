"use client";

import { useRef, useState } from "react";
import { api, CVEResult } from "@/lib/api";

function severityClass(label: string) {
  return `badge badge-${label?.toLowerCase() ?? ""}`;
}

function scoreColor(v: number) {
  if (v >= 0.75) return "var(--critical)";
  if (v >= 0.50) return "var(--high)";
  if (v >= 0.25) return "var(--medium)";
  return "var(--low)";
}

function downloadCSV(rows: CVEResult[]) {
  const cols = [
    "cve_id","cvss_score","cvss_label","predicted_label",
    "context_score","boost_factor","prob_critical",
    "attack_vector","has_remote","has_exec","matched_inventory",
  ] as const;
  const header = cols.join(",");
  const lines = rows.map((r) =>
    cols.map((c) => {
      const v = c === "matched_inventory" ? r[c].join("|") : r[c];
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(",")
  );
  const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "cve_results.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function BulkPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  const [csvFile,   setCsvFile]   = useState<File | null>(null);
  const [manualIds, setManualIds] = useState("");
  const [invInput,  setInvInput]  = useState("");
  const [results,   setResults]   = useState<CVEResult[]>([]);
  const [missing,   setMissing]   = useState<string[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  const handleFile = (file: File) => {
    setCsvFile(file);
    setManualIds("");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResults([]);
    setMissing([]);

    let ids: string[] = [];

    try {
      if (csvFile) {
        const text = await csvFile.text();
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const col = header.indexOf("cve_id");
        if (col === -1) throw new Error("CSV must contain a 'cve_id' column.");
        ids = lines.slice(1).map((l) => l.split(",")[col]?.trim()).filter(Boolean);
      } else {
        ids = manualIds.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      }
      if (!ids.length) throw new Error("No CVE IDs found.");
      const inv = invInput.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await api.bulkAnalyse(ids, inv);
      setResults(res.results);
      setMissing(res.missing);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2 className="page-title">Bulk CSV Upload</h2>
        <p className="page-subtitle">Upload a CSV with a <code style={{ fontFamily: "monospace" }}>cve_id</code> column and get a ranked table sorted by context score</p>
      </div>

      <div className="page-body">
        <div className="card">
          <form onSubmit={handleSubmit}>
            {/* File drop zone */}
            <div className="input-group">
              <label className="input-label">CVE List — CSV file</label>
              <div
                className={`drop-zone${csvFile ? " drag-over" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <div className="dz-icon">📂</div>
                <div className="dz-title">Drop CSV or click to browse</div>
                <div className="dz-sub">Required column: <code>cve_id</code></div>
                {csvFile && <div className="dz-file">✓ {csvFile.name}</div>}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            {/* OR manual */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
              <div className="divider" style={{ flex: 1, margin: 0 }} />
              <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>or type manually</span>
              <div className="divider" style={{ flex: 1, margin: 0 }} />
            </div>

            <div className="input-group">
              <label className="input-label">CVE IDs (one per line or comma-separated)</label>
              <textarea
                className="input"
                rows={4}
                placeholder={"CVE-2021-44228\nCVE-2022-30190\nCVE-2023-23397"}
                value={manualIds}
                onChange={(e) => { setManualIds(e.target.value); setCsvFile(null); }}
                style={{ resize: "vertical" }}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Your Inventory (optional, comma-separated)</label>
              <input
                className="input"
                placeholder="e.g. Apache Log4j, OpenSSL, Windows Server"
                value={invInput}
                onChange={(e) => setInvInput(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? (
                  <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Analysing…</>
                ) : "⚡ Analyse"}
              </button>
              {results.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => downloadCSV(results)}
                >
                  ⬇ Download CSV
                </button>
              )}
            </div>
          </form>
        </div>

        {error && <div className="error-box" style={{ marginTop: 16 }}>⚠ {error}</div>}

        {missing.length > 0 && (
          <div style={{ marginTop: 14, background: "var(--medium-bg)", border: "1px solid rgba(240,192,0,0.25)", borderRadius: "var(--radius)", padding: "10px 14px", fontSize: 13, color: "var(--medium)" }}>
            ⚠ Not found in dataset ({missing.length}): {missing.join(", ")}
          </div>
        )}

        {results.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Showing <strong style={{ color: "var(--text)" }}>{results.length}</strong> CVEs, sorted by context score
              </div>
            </div>
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
                    <th>Inventory Match</th>
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
                        {r.matched_inventory.length > 0 ? (
                          <div className="inv-tags">
                            {r.matched_inventory.map((m) => (
                              <span key={m} className="inv-tag">{m}</span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !error && results.length === 0 && (
          <div className="state-box" style={{ marginTop: 32 }}>
            <div className="state-icon">📋</div>
            <div className="state-title">Upload a CSV or enter CVE IDs</div>
            <div className="state-sub">Results will be ranked by context score — not CVSS.</div>
          </div>
        )}
      </div>
    </>
  );
}
