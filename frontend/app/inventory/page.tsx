"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, CVEResult } from "@/lib/api";
import BorderGlow from "@/components/BorderGlow";
import GradientText from "@/components/GradientText";
import ShinyButton from "@/components/ShinyButton";
import FadeIn from "@/components/FadeIn";
import {
  Package, Upload, Search, X, AlertTriangle,
  CheckCircle2, XCircle, ArrowDownUp, Info,
} from "lucide-react";

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
  const [dragOver,   setDragOver]   = useState(false);

  const handleFile = (f: File) => setFile(f);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true); setError(""); setResults([]); setDone(false);
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
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="page-title">
            <GradientText gradient="linear-gradient(135deg,#39d0d8,#a855f7)" animate>
              Inventory Matcher
            </GradientText>
          </h1>
          <p className="page-subtitle">
            Upload your software inventory · get only CVEs that affect you · ranked by context score
          </p>
        </motion.div>
      </div>

      <div className="page-body">
        <div className="section-grid section-grid-2" style={{ marginBottom: 24 }}>
          {/* Upload form */}
          <FadeIn delay={0.1}>
            <BorderGlow colors={["#39d0d8", "#58a6ff", "#a855f7"]} glowColor="185 70 65" glowIntensity={0.9} borderRadius={14} glowRadius={40}>
              <form onSubmit={handleSubmit}>
                <div className="input-group">
                  <label className="input-label">Software Inventory CSV</label>
                  <div
                    className={`drop-zone${file || dragOver ? " drag-over" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                  >
                    <div className="dz-icon">
                      {file
                        ? <Package size={36} style={{ color: "var(--low)" }} />
                        : <Upload size={36} style={{ color: "var(--text-muted)" }} />}
                    </div>
                    <div className="dz-title">{file ? file.name : "Drop inventory CSV or click to browse"}</div>
                    <div className="dz-sub">Required column: <code>software</code></div>
                    {file && <div className="dz-file">✓ Ready · {(file.size / 1024).toFixed(1)} KB</div>}
                  </div>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </div>

                <div className="input-group">
                  <label className="input-label">CVEs to Scan: {sampleSize.toLocaleString()}</label>
                  <div className="range-wrap">
                    <input type="range" min={100} max={10000} step={100} value={sampleSize}
                      onChange={(e) => setSampleSize(Number(e.target.value))} id="sample-size-slider" />
                    <span className="range-val">{(sampleSize / 1000).toFixed(1)}k</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 5 }}>
                    Higher = more thorough but slower. Dataset has 200k+ CVEs.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <ShinyButton type="submit" variant="primary" disabled={loading || !file}>
                    {loading
                      ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Matching…</>
                      : <><Search size={14} /> Find Matching CVEs</>}
                  </ShinyButton>
                  {file && (
                    <ShinyButton type="button" variant="secondary"
                      onClick={() => { setFile(null); setDone(false); setResults([]); }}>
                      <X size={14} /> Clear
                    </ShinyButton>
                  )}
                </div>
              </form>
            </BorderGlow>
          </FadeIn>

          {/* Info panel */}
          <FadeIn delay={0.15}>
            <BorderGlow colors={["#a855f7", "#f472b6", "#58a6ff"]} glowColor="270 60 70" glowIntensity={0.8} borderRadius={14} glowRadius={40} animated>
              <div className="section-label">Sample Inventory Format</div>
              <pre style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                color: "var(--cyan)", background: "rgba(13,17,23,0.8)",
                borderRadius: "var(--radius)", padding: "14px 16px", marginTop: 8,
                border: "1px solid var(--border-muted)", whiteSpace: "pre-wrap", lineHeight: 1.9,
              }}>
                {SAMPLE_CSV}
              </pre>

              <div className="divider" />

              <div className="section-label">Boost Formula</div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                color: "var(--text-muted)", lineHeight: 2.1,
                background: "rgba(13,17,23,0.8)", border: "1px solid var(--border-muted)",
                borderRadius: "var(--radius)", padding: "13px 16px", marginTop: 8,
              }}>
                <span style={{ color: "var(--accent)" }}>boost</span> = 1.0<br />
                &nbsp;&nbsp;+ 0.30 × inventory_matches<br />
                &nbsp;&nbsp;× 1.25 (if public exploit)<br />
                &nbsp;&nbsp;× 1.15 (if remote + unauth)<br />
                &nbsp;&nbsp;× 1.10 (if NETWORK vector)<br /><br />
                <span style={{ color: "var(--cyan)" }}>context_score</span> = min(prob_critical × boost, 1.0)
              </div>

              <div style={{ marginTop: 14 }} className="info-box">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Info size={14} />
                  Fuzzy matching via <strong>FuzzyWuzzy</strong> — software names are checked
                  against NER entity tags and raw CVE descriptions (≥75% / ≥85% threshold).
                </div>
              </div>
            </BorderGlow>
          </FadeIn>
        </div>

        {error && (
          <FadeIn>
            <div className="error-box" style={{ marginBottom: 16 }}>
              <AlertTriangle size={14} /> {error}
            </div>
          </FadeIn>
        )}

        {loading && (
          <div className="spinner-wrap">
            <div className="spinner" />
            <span>Scanning {sampleSize.toLocaleString()} CVEs for inventory matches…</span>
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>This may take a few seconds</span>
          </div>
        )}

        <AnimatePresence>
          {done && !loading && (
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>

              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 16,
                background: matched > 0 ? "rgba(63,185,80,0.08)" : "rgba(248,81,73,0.08)",
                border: `1px solid ${matched > 0 ? "rgba(63,185,80,0.25)" : "rgba(248,81,73,0.25)"}`,
                borderRadius: "var(--radius)", padding: "12px 18px",
              }}>
                <div style={{ fontSize: 13, color: matched > 0 ? "var(--low)" : "var(--critical)", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                  {matched > 0
                    ? <><CheckCircle2 size={16} /> Found <strong>{matched}</strong> CVEs matching your inventory</>
                    : <><XCircle size={16} /> No CVEs matched your inventory in the scanned range</>}
                </div>
                {matched > 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-subtle)", display: "flex", alignItems: "center", gap: 4 }}>
                    <ArrowDownUp size={12} /> Sorted by context score
                  </div>
                )}
              </div>

              {results.length > 0 ? (
                <BorderGlow colors={["#39d0d8", "#3fb950", "#58a6ff"]} glowColor="185 65 65" glowIntensity={0.5}
                  borderRadius={12} glowRadius={28} padding="0">
                  <div className="table-wrapper" style={{ border: "none", borderRadius: "inherit" }}>
                    <table>
                      <thead>
                        <tr><th>#</th><th>CVE ID</th><th>CVSS</th><th>Predicted</th><th>Context Score</th><th>Boost</th><th>Matched Software</th></tr>
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
                                    transition={{ duration: 0.65, delay: i * 0.04, ease: [0.22,1,0.36,1] }} />
                                </div>
                                <span className="score-val">{r.context_score.toFixed(3)}</span>
                              </div>
                            </td>
                            <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--cyan)" }}>{r.boost_factor.toFixed(2)}×</td>
                            <td>
                              <div className="inv-tags">
                                {r.matched_inventory.map((m) => <span key={m} className="inv-tag">{m}</span>)}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </BorderGlow>
              ) : (
                <div className="state-box">
                  <CheckCircle2 size={40} style={{ color: "var(--low)", opacity: 0.7 }} />
                  <div className="state-title">No matches found</div>
                  <div className="state-sub">
                    None of the scanned {sampleSize.toLocaleString()} CVEs matched your inventory.
                    Try increasing the scan range or broadening software names.
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!loading && !done && !error && (
          <FadeIn delay={0.25}>
            <div className="state-box">
              <Package size={40} style={{ color: "var(--accent)", opacity: 0.7 }} />
              <div className="state-title">Upload your software inventory</div>
              <div className="state-sub">
                The system fuzzy-matches each software name against 200k+ CVEs and surfaces only
                those that affect <em>your environment</em>, ranked by context score.
              </div>
            </div>
          </FadeIn>
        )}
      </div>
    </>
  );
}
