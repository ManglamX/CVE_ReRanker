"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, CVEResult } from "@/lib/api";
import BorderGlow from "@/components/BorderGlow";
import GradientText from "@/components/GradientText";
import ShinyButton from "@/components/ShinyButton";
import FadeIn from "@/components/FadeIn";
import {
  Search, Shield, ShieldAlert, ShieldCheck, AlertTriangle,
  Wifi, Terminal, Globe, ArrowUpRight,
} from "lucide-react";

function severityClass(label: string) {
  return `badge badge-${label?.toLowerCase() ?? ""}`;
}

function ScoreBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 75 ? "var(--critical)" :
    pct >= 50 ? "var(--high)" :
    pct >= 25 ? "var(--medium)" : "var(--low)";
  return (
    <div className="score-bar-wrap" style={{ marginTop: 10 }}>
      <div className="score-bar-track" style={{ flex: 1 }}>
        <motion.div
          className="score-bar-fill"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span className="score-val">{value.toFixed(3)}</span>
    </div>
  );
}

function ResultCard({ result }: { result: CVEResult }) {
  const isHighRisk = result.context_score >= 0.5;
  const colors = isHighRisk
    ? ["#f85149", "#f0883e", "#a855f7"]
    : ["#58a6ff", "#39d0d8", "#a855f7"];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginTop: 24 }}
      >
        <BorderGlow
          colors={colors}
          glowColor={isHighRisk ? "10 80 60" : "200 70 65"}
          glowIntensity={1.0}
          borderRadius={14}
          glowRadius={44}
          animated
        >
          {/* Header */}
          <div className="result-header">
            <div>
              <div className="result-cve-id">
                <GradientText gradient="linear-gradient(90deg,#58a6ff,#39d0d8)" animate={false}>
                  {result.cve_id}
                </GradientText>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 4 }}>
                Context Score (environment-adjusted)
              </div>
              <ScoreBar value={result.context_score} />
            </div>
            <div className="result-badges">
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "var(--text-subtle)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>CVSS</div>
                <span className={severityClass(result.cvss_label)}>{result.cvss_label}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6, fontFamily: "monospace", fontWeight: 600 }}>
                  {result.cvss_score.toFixed(1)}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "var(--text-subtle)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>ML Predicted</div>
                <span className={severityClass(result.predicted_label)}>{result.predicted_label}</span>
              </div>
            </div>
          </div>

          {/* Detail grid */}
          <div className="detail-grid">
            <div>
              <div className="di-label">Boost Factor</div>
              <div className="di-value">{result.boost_factor.toFixed(3)}×</div>
            </div>
            <div>
              <div className="di-label">Prob Critical</div>
              <div className="di-value">{(result.prob_critical * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="di-label">Attack Vector</div>
              <div className="di-value">{result.attack_vector || "—"}</div>
            </div>
          </div>

          {/* Risk signals */}
          <div style={{ marginBottom: 18 }}>
            <div className="section-label" style={{ marginBottom: 10 }}>Risk Signals</div>
            <div className="chips">
              <span className={`chip ${result.has_remote ? "chip-on" : "chip-off"}`}>
                <Wifi size={13} /> Remote Exploitable
              </span>
              <span className={`chip ${result.has_exec ? "chip-on" : "chip-off"}`}>
                <Terminal size={13} /> Code Execution
              </span>
              <span className={`chip ${result.attack_vector === "NETWORK" ? "chip-on" : "chip-off"}`}>
                <Globe size={13} /> Network Attack
              </span>
            </div>
          </div>

          {/* Inventory match */}
          {result.matched_inventory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                marginBottom: 18,
                background: "rgba(248,81,73,0.08)",
                border: "1px solid rgba(248,81,73,0.3)",
                borderRadius: "var(--radius)",
                padding: "12px 14px",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--critical)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldAlert size={14} /> Matches Your Inventory
              </div>
              <div className="inv-tags">
                {result.matched_inventory.map((item) => (
                  <span key={item} className="inv-tag">{item}</span>
                ))}
              </div>
            </motion.div>
          )}

          <p className="desc-text">{result.description}</p>
        </BorderGlow>
      </motion.div>
    </AnimatePresence>
  );
}

export default function LookupPage() {
  const [cveId,    setCveId]    = useState("");
  const [invInput, setInvInput] = useState("");
  const [result,   setResult]   = useState<CVEResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cveId.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const inv = invInput.split(",").map((s) => s.trim()).filter(Boolean);
      setResult(await api.getCVE(cveId.trim(), inv));
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
            <GradientText gradient="linear-gradient(135deg,#58a6ff,#39d0d8)" animate>
              Single CVE Lookup
            </GradientText>
          </h1>
          <p className="page-subtitle">
            Enter a CVE ID · get predicted severity, context score, risk signals, and inventory match
          </p>
        </motion.div>
      </div>

      <div className="page-body">
        <FadeIn delay={0.1}>
          <BorderGlow
            colors={["#58a6ff", "#39d0d8", "#6e40c9"]}
            glowColor="200 70 65"
            glowIntensity={0.9}
            borderRadius={14}
            glowRadius={40}
          >
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label className="input-label">CVE ID</label>
                <input
                  className="input input-mono"
                  placeholder="e.g. CVE-2021-44228"
                  value={cveId}
                  onChange={(e) => setCveId(e.target.value)}
                  autoFocus
                  id="cve-id-input"
                />
              </div>
              <div className="input-group">
                <label className="input-label">Your Inventory (optional · comma-separated)</label>
                <input
                  className="input"
                  placeholder="e.g. Apache Log4j, OpenSSL, Windows Server"
                  value={invInput}
                  onChange={(e) => setInvInput(e.target.value)}
                  id="inventory-input"
                />
                <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 6 }}>
                  Inventory matches boost the context score via the re-ranking formula.
                </div>
              </div>
              <ShinyButton type="submit" variant="primary" disabled={loading || !cveId.trim()}>
                {loading
                  ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Analysing…</>
                  : <><Search size={14} /> Analyse CVE</>}
              </ShinyButton>
            </form>
          </BorderGlow>
        </FadeIn>

        {!result && !error && !loading && (
          <FadeIn delay={0.2}>
            <div className="state-box">
              <Shield size={40} style={{ color: "var(--accent)", opacity: 0.7 }} />
              <div className="state-title">Enter a CVE ID above</div>
              <div className="state-sub">
                Try{" "}
                <code style={{ fontFamily: "monospace", color: "var(--accent)", cursor: "pointer" }}
                  onClick={() => setCveId("CVE-2021-44228")}>CVE-2021-44228</code>{" "}
                (Log4Shell) or{" "}
                <code style={{ fontFamily: "monospace", color: "var(--accent)", cursor: "pointer" }}
                  onClick={() => setCveId("CVE-2022-30190")}>CVE-2022-30190</code>{" "}
                (Follina)
              </div>
            </div>
          </FadeIn>
        )}

        {error && (
          <div className="error-box" style={{ marginTop: 18 }}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {result && <ResultCard result={result} />}
      </div>
    </>
  );
}
