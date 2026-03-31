"use client";

import { useState } from "react";
import { api, CVEResult } from "@/lib/api";

function severityClass(label: string) {
  return `badge badge-${label?.toLowerCase() ?? ""}`;
}

function ScoreBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 75 ? "var(--critical)" :
    pct >= 50 ? "var(--high)" :
    pct >= 25 ? "var(--medium)" :
                "var(--low)";
  return (
    <div className="score-bar-wrap" style={{ marginTop: 8 }}>
      <div className="score-bar-track" style={{ flex: 1 }}>
        <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="score-val">{value.toFixed(3)}</span>
    </div>
  );
}

function ResultCard({ result }: { result: CVEResult }) {
  return (
    <div className="card result-card" style={{ marginTop: 24 }}>
      <div className="result-header">
        <div>
          <div className="result-cve-id">{result.cve_id}</div>
          <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 2 }}>
            Context Score
          </div>
          <ScoreBar value={result.context_score} />
        </div>
        <div className="result-badges">
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-subtle)", marginBottom: 4 }}>CVSS</div>
            <span className={severityClass(result.cvss_label)}>{result.cvss_label}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6, fontFamily: "monospace" }}>
              {result.cvss_score.toFixed(1)}
            </span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-subtle)", marginBottom: 4 }}>Predicted</div>
            <span className={severityClass(result.predicted_label)}>{result.predicted_label}</span>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-item">
          <div className="di-label">Boost Factor</div>
          <div className="di-value">{result.boost_factor.toFixed(3)}×</div>
        </div>
        <div className="detail-item">
          <div className="di-label">Prob Critical</div>
          <div className="di-value">{(result.prob_critical * 100).toFixed(1)}%</div>
        </div>
        <div className="detail-item">
          <div className="di-label">Attack Vector</div>
          <div className="di-value">{result.attack_vector || "—"}</div>
        </div>
      </div>

      {/* Risk signals */}
      <div style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>Risk Signals</div>
        <div className="chips">
          <span className={`chip ${result.has_remote ? "chip-on" : "chip-off"}`}>
            {result.has_remote ? "🔴" : "⚪"} Remote Exploitable
          </span>
          <span className={`chip ${result.has_exec ? "chip-on" : "chip-off"}`}>
            {result.has_exec ? "🔴" : "⚪"} Code Execution
          </span>
          <span className={`chip ${result.attack_vector === "NETWORK" ? "chip-on" : "chip-off"}`}>
            {result.attack_vector === "NETWORK" ? "🔴" : "⚪"} Network Attack
          </span>
        </div>
      </div>

      {/* Matched inventory */}
      {result.matched_inventory.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>⚠ Matches Your Inventory</div>
          <div className="inv-tags">
            {result.matched_inventory.map((item) => (
              <span key={item} className="inv-tag">{item}</span>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      <p className="desc-text">{result.description}</p>
    </div>
  );
}

export default function LookupPage() {
  const [cveId,     setCveId]     = useState("");
  const [invInput,  setInvInput]  = useState("");
  const [result,    setResult]    = useState<CVEResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cveId.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const inv = invInput.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await api.getCVE(cveId.trim(), inv);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2 className="page-title">Single CVE Lookup</h2>
        <p className="page-subtitle">Enter a CVE ID to get predicted severity, context score, and risk signals</p>
      </div>

      <div className="page-body">
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">CVE ID</label>
              <input
                className="input input-mono"
                placeholder="e.g. CVE-2021-44228"
                value={cveId}
                onChange={(e) => setCveId(e.target.value)}
                autoFocus
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
              <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 5 }}>
                If your software is matched, the context score will be boosted.
              </div>
            </div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || !cveId.trim()}
            >
              {loading ? (
                <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Analysing…</>
              ) : (
                "🔍 Analyse CVE"
              )}
            </button>
          </form>
        </div>

        {error && (
          <div className="error-box" style={{ marginTop: 16 }}>
            ⚠ {error}
          </div>
        )}

        {result && <ResultCard result={result} />}

        {!result && !error && !loading && (
          <div className="state-box" style={{ marginTop: 32 }}>
            <div className="state-icon">🛡️</div>
            <div className="state-title">Enter a CVE ID above</div>
            <div className="state-sub">
              Example: <code style={{ fontFamily: "monospace", color: "var(--accent)" }}>CVE-2021-44228</code> (Log4Shell),{" "}
              <code style={{ fontFamily: "monospace", color: "var(--accent)" }}>CVE-2022-30190</code> (Follina)
            </div>
          </div>
        )}
      </div>
    </>
  );
}
