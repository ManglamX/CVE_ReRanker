"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, CVEResult } from "@/lib/api";
import BorderGlow from "@/components/BorderGlow";
import GradientText from "@/components/GradientText";
import ShinyButton from "@/components/ShinyButton";
import FadeIn from "@/components/FadeIn";
import { Upload, Zap, Download, X, FileSpreadsheet, AlertTriangle, Info, FileText, Package } from "lucide-react";

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
  const cols = ["cve_id","cvss_score","cvss_label","predicted_label","context_score","boost_factor","prob_critical","attack_vector","has_remote","has_exec","matched_inventory"] as const;
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
  const invFileRef = useRef<HTMLInputElement>(null);
  
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [manualIds, setManualIds] = useState("");
  const [invInput, setInvInput] = useState("");
  const [results, setResults] = useState<CVEResult[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [invFile, setInvFile] = useState<File | null>(null);
  const [invDragOver, setInvDragOver] = useState(false);

  const handleFile = (file: File) => { setCsvFile(file); setManualIds(""); };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleInvFile = (file: File) => { setInvFile(file); setInvInput(""); };
  const handleInvDrop = (e: React.DragEvent) => {
    e.preventDefault(); setInvDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleInvFile(file);
  };

  const parseInventoryFile = async (file: File): Promise<string[]> => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    
    const header = lines[0].split(",").map(h => h.trim().toLowerCase());
    const colIndex = header.indexOf("software");
    
    if (colIndex === -1) {
      throw new Error("Inventory CSV must have a 'software' column.");
    }

    return lines.slice(1)
      .map(line => line.split(",")[colIndex]?.trim())
      .filter(Boolean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(""); setResults([]); setMissing([]);
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
      
      let inv: string[] = [];
      if (invFile) {
        inv = await parseInventoryFile(invFile);
      } else {
        inv = invInput.split(",").map((s) => s.trim()).filter(Boolean);
      }
      
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
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="page-title">
            <GradientText gradient="linear-gradient(135deg,#f0883e,#f0c000)" animate>
              Bulk CSV Upload
            </GradientText>
          </h1>
          <p className="page-subtitle">
            Upload a CSV with a <code style={{ fontFamily: "monospace", color: "var(--accent)" }}>cve_id</code> column · get a ranked table sorted by context score
          </p>
        </motion.div>
      </div>

      <div className="page-body">
        <FadeIn delay={0.1}>
          <BorderGlow colors={["#f0883e", "#f0c000", "#f85149"]} glowColor="30 80 65" glowIntensity={0.9} borderRadius={14} glowRadius={40}>
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label className="input-label">CVE List — CSV File</label>
                <div
                  className={`drop-zone${csvFile || dragOver ? " drag-over" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="dz-icon">
                    {csvFile
                      ? <FileSpreadsheet size={36} style={{ color: "var(--low)" }} />
                      : <Upload size={36} style={{ color: "var(--text-muted)" }} />}
                  </div>
                  <div className="dz-title">{csvFile ? csvFile.name : "Drop CSV or click to browse"}</div>
                  <div className="dz-sub">Required column: <code>cve_id</code></div>
                  {csvFile && <div className="dz-file">✓ Ready · {(csvFile.size / 1024).toFixed(1)} KB</div>}
                </div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 16px" }}>
                <div className="divider" style={{ flex: 1, margin: 0 }} />
                <span style={{ fontSize: 12, color: "var(--text-subtle)", fontWeight: 600 }}>or type manually</span>
                <div className="divider" style={{ flex: 1, margin: 0 }} />
              </div>

              <div className="input-group">
                <label className="input-label">CVE IDs (one per line or comma-separated)</label>
                <textarea className="input" rows={4}
                  placeholder={"CVE-2021-44228\nCVE-2022-30190\nCVE-2023-23397"}
                  value={manualIds}
                  onChange={(e) => { setManualIds(e.target.value); setCsvFile(null); }}
                  style={{ resize: "vertical" }} id="manual-cve-ids" />
              </div>

              <div className="input-group">
                <label className="input-label">Your Inventory — CSV File (optional)</label>
                <div
                  className={`drop-zone${invFile || invDragOver ? " drag-over" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setInvDragOver(true); }}
                  onDragLeave={() => setInvDragOver(false)}
                  onDrop={handleInvDrop}
                  onClick={() => invFileRef.current?.click()}
                >
                  <div className="dz-icon">
                    {invFile
                      ? <Package size={36} style={{ color: "var(--low)" }} />
                      : <Upload size={36} style={{ color: "var(--text-muted)" }} />}
                  </div>
                  <div className="dz-title">{invFile ? invFile.name : "Drop Inventory CSV or click to browse"}</div>
                  <div className="dz-sub">Required column: <code>software</code></div>
                  {invFile && <div className="dz-file">✓ Ready · {(invFile.size / 1024).toFixed(1)} KB</div>}
                </div>
                <input ref={invFileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && handleInvFile(e.target.files[0])} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 16px" }}>
                <div className="divider" style={{ flex: 1, margin: 0 }} />
                <span style={{ fontSize: 12, color: "var(--text-subtle)", fontWeight: 600 }}>or type inventory manually</span>
                <div className="divider" style={{ flex: 1, margin: 0 }} />
              </div>

              <div className="input-group">
                <label className="input-label">Manual Inventory (comma-separated)</label>
                <textarea className="input" rows={2}
                  placeholder="e.g. Apache Log4j, OpenSSL, Windows Server"
                  value={invInput}
                  onChange={(e) => { setInvInput(e.target.value); setInvFile(null); }}
                  style={{ resize: "vertical" }} id="bulk-inventory-manual" />
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <ShinyButton type="submit" variant="primary" disabled={loading}>
                  {loading
                    ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Analysing…</>
                    : <><Zap size={14} /> Analyse</>}
                </ShinyButton>
                {results.length > 0 && (
                  <ShinyButton type="button" variant="secondary" onClick={() => downloadCSV(results)}>
                    <Download size={14} /> Download CSV
                  </ShinyButton>
                )}
                {invFile && (
                  <ShinyButton type="button" variant="secondary" onClick={() => setInvFile(null)}>
                    <X size={14} /> Clear inventory
                  </ShinyButton>
                )}
                {csvFile && (
                  <ShinyButton type="button" variant="secondary" onClick={() => setCsvFile(null)}>
                    <X size={14} /> Clear CVE file
                  </ShinyButton>
                )}
              </div>
            </form>
          </BorderGlow>
        </FadeIn>

        {error && <FadeIn><div className="error-box" style={{ marginTop: 16 }}><AlertTriangle size={14} /> {error}</div></FadeIn>}

        {missing.length > 0 && (
          <FadeIn>
            <div style={{ marginTop: 14, background: "var(--medium-bg)", border: "1px solid rgba(240,192,0,0.25)", borderRadius: "var(--radius)", padding: "11px 16px", fontSize: 13, color: "var(--medium)", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={14} /> Not found in dataset ({missing.length}): {missing.join(", ")}
            </div>
          </FadeIn>
        )}

        {loading && (
          <div className="spinner-wrap">
            <div className="spinner" />
            <span>Analysing CVEs and ranking by context score…</span>
          </div>
        )}

        <AnimatePresence>
          {results.length > 0 && !loading && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} style={{ marginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Showing <strong style={{ color: "var(--text)" }}>{results.length}</strong> CVEs · ranked by context score
                </div>
                <div className="info-box" style={{ fontSize: 11, padding: "5px 12px", display: "flex", alignItems: "center", gap: 5 }}>
                  <Info size={12} /> Context score &gt; CVSS ordering
                </div>
              </div>
              <BorderGlow colors={["#f0883e", "#58a6ff", "#39d0d8"]} glowColor="30 70 65" glowIntensity={0.5}
                borderRadius={12} glowRadius={28} padding="0">
                <div className="table-wrapper" style={{ border: "none", borderRadius: "inherit" }}>
                  <table>
                    <thead>
                      <tr><th>#</th><th>CVE ID</th><th>CVSS</th><th>Predicted</th><th>Context Score</th><th>Boost</th><th>Inventory Match</th></tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={r.cve_id}>
                          <td style={{ color: "var(--text-subtle)", width: 36 }}>{i + 1}</td>
                          <td><span className="cve-id">{r.cve_id}</span></td>
                          <td><span className={severityClass(r.cvss_label)}>{r.cvss_label}</span></td>
                          <td><span className={severityClass(r.predicted_label)}>{r.predicted_label}</span></td>
                          <td>
                            <div className="score-bar-wrap" style={{ minWidth: 130 }}>
                              <div className="score-bar-track" style={{ flex: 1 }}>
                                <motion.div className="score-bar-fill"
                                  style={{ background: scoreColor(r.context_score) }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${r.context_score * 100}%` }}
                                  transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22,1,0.36,1] }} />
                              </div>
                              <span className="score-val">{r.context_score.toFixed(3)}</span>
                            </div>
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--cyan)" }}>{r.boost_factor.toFixed(2)}×</td>
                          <td>
                            {r.matched_inventory.length > 0
                              ? <div className="inv-tags">{r.matched_inventory.map((m) => <span key={m} className="inv-tag">{m}</span>)}</div>
                              : <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </BorderGlow>
            </motion.div>
          )}
        </AnimatePresence>

        {!loading && !error && results.length === 0 && (
          <FadeIn delay={0.2}>
            <div className="state-box">
              <FileSpreadsheet size={40} style={{ color: "var(--accent)", opacity: 0.7 }} />
              <div className="state-title">Upload a CSV or enter CVE IDs</div>
              <div className="state-sub">
                Results are ranked by <strong>context score</strong> — not CVSS.
                Provide your software inventory to get environment-aware rankings.
              </div>
            </div>
          </FadeIn>
        )}
      </div>
    </>
  );
}
