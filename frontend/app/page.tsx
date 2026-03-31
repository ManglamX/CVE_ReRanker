"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api, StatsResponse } from "@/lib/api";
import BorderGlow from "@/components/BorderGlow";
import GradientText from "@/components/GradientText";
import CountUp from "@/components/CountUp";
import FadeIn from "@/components/FadeIn";
import {
  Database, Layers, Target, BarChart3, Rows3, CalendarClock,
  FileText, Bot, Combine, Zap, PackageCheck,
} from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#f85149",
  High:     "#f0883e",
  Medium:   "#f0c000",
  Low:      "#3fb950",
};
const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"];

function DistributionChart({ data }: { data: Record<string, number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const labels = SEVERITY_ORDER.filter((k) => k in data);
    const values = labels.map((k) => data[k]);
    const total  = values.reduce((a, b) => a + b, 0);
    const max    = Math.max(...values);

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const barH  = 34;
    const gap   = 16;
    const labelW = 78;
    const valW   = 120;
    const barW   = W - labelW - valW - 16;

    labels.forEach((label, i) => {
      const y     = i * (barH + gap) + 8;
      const fill  = (values[i] / max) * barW;
      const color = SEVERITY_COLORS[label] || "#58a6ff";

      ctx.font = "600 12px Inter, sans-serif";
      ctx.fillStyle = "#8b949e";
      ctx.fillText(label, 0, y + barH / 2 + 4);

      ctx.fillStyle = "#1c2128";
      ctx.beginPath();
      ctx.roundRect(labelW, y, barW, barH, 5);
      ctx.fill();

      const grad = ctx.createLinearGradient(labelW, 0, labelW + fill, 0);
      grad.addColorStop(0, color + "99");
      grad.addColorStop(1, color + "ff");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(labelW, y, fill, barH, 5);
      ctx.fill();

      const pct = ((values[i] / total) * 100).toFixed(1);
      ctx.font = "600 12px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#e6edf3";
      ctx.fillText(
        `${values[i].toLocaleString()}  (${pct}%)`,
        labelW + barW + 12,
        y + barH / 2 + 4
      );
    });
  }, [data]);

  return (
    <div className="chart-container" style={{ height: 210 }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

const PIPELINE_STEPS = [
  { icon: FileText,    title: "NLP Pre-processing",    desc: "Text cleaning · spaCy NER · regex feature flags" },
  { icon: Bot,         title: "SecBERT Embeddings",    desc: "768-dim CLS vector per CVE description" },
  { icon: Combine,     title: "Feature Fusion",         desc: "768 BERT + 8 NLP flags + 5 metadata = 781 dims" },
  { icon: Zap,         title: "XGBoost Classifier",    desc: "Low / Medium / High / Critical prediction" },
  { icon: PackageCheck,title: "Contextual Re-Ranking",  desc: "Inventory boost × exploit × network vector signals" },
];

const EVAL_ROWS = [
  ["Critical", "0.72", "0.74", "0.73", "4,705"],
  ["High",     "0.76", "0.72", "0.74", "14,792"],
  ["Medium",   "0.79", "0.86", "0.82", "19,001"],
  ["Low",      "0.88", "0.38", "0.53", "1,589"],
];

const METRIC_ICONS = [Database, Layers, Target, BarChart3, Rows3, CalendarClock];
const METRIC_COLORS: string[][] = [
  ["#58a6ff", "#39d0d8", "#a855f7"],
  ["#39d0d8", "#58a6ff", "#6e40c9"],
  ["#3fb950", "#39d0d8", "#58a6ff"],
  ["#3fb950", "#58a6ff", "#39d0d8"],
  ["#a855f7", "#58a6ff", "#39d0d8"],
  ["#f0c000", "#f0883e", "#58a6ff"],
];

export default function Dashboard() {
  const [stats, setStats]   = useState<StatsResponse | null>(null);
  const [error, setError]   = useState("");
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    api.health()
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
    api.stats()
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-header">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="page-title">
            <GradientText gradient="linear-gradient(135deg,#58a6ff,#39d0d8,#a855f7)" animate>
              Dashboard
            </GradientText>
          </h1>
          <p className="page-subtitle">Model overview · Dataset statistics · Performance metrics</p>
        </motion.div>
      </div>

      <div className="page-body">
        {/* Backend status */}
        <FadeIn delay={0.05}>
          <BorderGlow
            colors={online ? ["#3fb950", "#39d0d8", "#58a6ff"] : ["#f85149", "#f0883e", "#ff6b6b"]}
            glowColor={online ? "140 60 60" : "0 80 60"}
            glowIntensity={0.6}
            borderRadius={10}
            glowRadius={28}
            padding="13px 20px"
            style={{ marginBottom: 22 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={`status-dot ${online === null ? "pending" : online ? "online" : "offline"}`} />
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                FastAPI backend&nbsp;
                <span style={{
                  color: online === null ? "var(--text-subtle)" : online ? "var(--low)" : "var(--critical)",
                  fontWeight: 700,
                }}>
                  {online === null
                    ? "checking…"
                    : online
                    ? "online"
                    : "offline — run `uvicorn main:app --reload --port 8000`"}
                </span>
              </span>
            </div>
          </BorderGlow>
        </FadeIn>

        {error && <div className="error-box" style={{ marginBottom: 20 }}>⚠ {error}</div>}

        {!stats ? (
          !error && (
            <div className="spinner-wrap">
              <div className="spinner" />
              <span>Loading stats…</span>
            </div>
          )
        ) : (
          <>
            {/* Metric cards */}
            <div className="metrics-grid">
              {[
                { label: "Total CVEs",   value: stats.total_cves,         sub: "NVD 2019–2026",           type: "count" as const },
                { label: "Feature Dims", value: stats.feature_dims,       sub: "BERT + NLP + metadata",   type: "count" as const },
                { label: "Weighted F1",  value: 0.77,                     sub: "Test set · 40k CVEs",     type: "decimal" as const },
                { label: "Accuracy",     value: 77,                       sub: "XGBoost classifier",      type: "pct" as const },
                {
                  label: "Trained On",
                  value: typeof stats.trained_on_rows === "number" ? stats.trained_on_rows : 0,
                  sub: "rows",
                  type: "count" as const,
                  raw: typeof stats.trained_on_rows === "string" ? stats.trained_on_rows : undefined,
                },
                { label: "Last Updated", value: 0, sub: "NVD fetch", type: "date" as const, raw: stats.last_data_update },
              ].map(({ label, value, sub, type, raw }, i) => {
                const Icon = METRIC_ICONS[i];
                return (
                  <FadeIn key={label} delay={i * 0.07}>
                    <BorderGlow
                      colors={METRIC_COLORS[i]}
                      glowColor="200 50 70"
                      glowIntensity={0.8}
                      borderRadius={12}
                      glowRadius={32}
                      animated={i === 0}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                        <Icon size={14} style={{ color: "var(--text-muted)", opacity: 0.8 }} />
                        <span className="section-label" style={{ marginBottom: 0 }}>{label}</span>
                      </div>
                      <div className="metric-value">
                        {type === "count"   && !raw && <CountUp to={value} duration={1.4} separator="," start={!!value} />}
                        {type === "decimal" && <CountUp to={value} duration={1.2} decimals={2} start />}
                        {type === "pct"     && <><CountUp to={value} duration={1.2} start />%</>}
                        {(type === "date" || (type === "count" && raw)) && (
                          <span style={{ fontSize: raw && raw.length > 6 ? 13 : 28 }}>{raw ?? value}</span>
                        )}
                      </div>
                      <div className="metric-label">{sub}</div>
                    </BorderGlow>
                  </FadeIn>
                );
              })}
            </div>

            {/* Chart + Pipeline */}
            <div className="section-grid section-grid-2" style={{ marginBottom: 24 }}>
              <FadeIn delay={0.2}>
                <BorderGlow colors={["#f85149", "#f0883e", "#f0c000"]} glowColor="20 80 65" glowIntensity={0.7} borderRadius={14} glowRadius={36}>
                  <div className="section-label">Label Distribution</div>
                  <DistributionChart data={stats.label_distribution} />
                </BorderGlow>
              </FadeIn>

              <FadeIn delay={0.25}>
                <BorderGlow colors={["#a855f7", "#58a6ff", "#39d0d8"]} glowColor="270 60 70" glowIntensity={0.7} borderRadius={14} glowRadius={36}>
                  <div className="section-label">Pipeline Architecture</div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {PIPELINE_STEPS.map(({ icon: StepIcon, title, desc }) => (
                      <div key={title} className="pipeline-step">
                        <div className="pipeline-icon">
                          <StepIcon size={16} style={{ color: "var(--accent)" }} />
                        </div>
                        <div>
                          <div className="pipeline-title">{title}</div>
                          <div className="pipeline-desc">{desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </BorderGlow>
              </FadeIn>
            </div>

            {/* Evaluation table */}
            <FadeIn delay={0.3}>
              <BorderGlow colors={["#58a6ff", "#39d0d8", "#3fb950"]} glowColor="200 70 65" glowIntensity={0.6} borderRadius={14} glowRadius={36}>
                <div className="section-label">Evaluation Results — Test Set (40,087 CVEs)</div>
                <div className="table-wrapper" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1 Score</th><th>Support</th></tr>
                    </thead>
                    <tbody>
                      {EVAL_ROWS.map(([cls, p, r, f, s]) => (
                        <tr key={cls}>
                          <td><span className={`badge badge-${cls.toLowerCase()}`}>{cls}</span></td>
                          <td style={{ fontFamily: "monospace" }}>{p}</td>
                          <td style={{ fontFamily: "monospace" }}>{r}</td>
                          <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{f}</td>
                          <td style={{ color: "var(--text-muted)" }}>{s}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: "2px solid var(--border)" }}>
                        <td style={{ fontWeight: 800 }}>Weighted avg</td>
                        <td style={{ fontFamily: "monospace", fontWeight: 700 }}>0.77</td>
                        <td style={{ fontFamily: "monospace", fontWeight: 700 }}>0.77</td>
                        <td>
                          <GradientText gradient="linear-gradient(90deg,#3fb950,#39d0d8)" animate={false}
                            style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800 }}>
                            0.77
                          </GradientText>
                        </td>
                        <td style={{ color: "var(--text-muted)" }}>40,087</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </BorderGlow>
            </FadeIn>

            {/* Re-ranking formula */}
            <FadeIn delay={0.35}>
              <BorderGlow colors={["#39d0d8", "#a855f7", "#58a6ff"]} glowColor="185 60 65" glowIntensity={0.6} borderRadius={14} glowRadius={32} style={{ marginTop: 24 }}>
                <div className="section-label">Re-Ranking Formula</div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 2.2,
                  color: "var(--text-muted)", background: "rgba(13,17,23,0.8)",
                  border: "1px solid var(--border-muted)", borderRadius: "var(--radius)",
                  padding: "14px 18px", marginTop: 10,
                }}>
                  <span style={{ color: "var(--accent)" }}>boost</span> = 1.0<br />
                  &nbsp;&nbsp;+ 0.30 × inventory_matches<br />
                  &nbsp;&nbsp;× 1.25 (if public exploit exists)<br />
                  &nbsp;&nbsp;× 1.15 (if remote + unauthenticated)<br />
                  &nbsp;&nbsp;× 1.10 (if attack_vector = NETWORK)<br /><br />
                  <span style={{ color: "var(--cyan)" }}>context_score</span> = min(prob_critical × boost, 1.0)
                </div>
              </BorderGlow>
            </FadeIn>
          </>
        )}
      </div>
    </>
  );
}
