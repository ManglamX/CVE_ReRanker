"use client";

import { useEffect, useRef, useState } from "react";
import { api, StatsResponse } from "@/lib/api";

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#f85149",
  High:     "#f0883e",
  Medium:   "#f0c000",
  Low:      "#3fb950",
};

function DistributionChart({ data }: { data: Record<string, number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const order = ["Critical", "High", "Medium", "Low"];
    const labels = order.filter((k) => k in data);
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

    const barH   = 32;
    const gap    = 14;
    const labelW = 72;
    const valW   = 60;
    const barW   = W - labelW - valW - 16;

    labels.forEach((label, i) => {
      const y    = i * (barH + gap) + 8;
      const fill = (values[i] / max) * barW;
      const color = SEVERITY_COLORS[label] || "#58a6ff";

      // Label
      ctx.font = "12px Inter, sans-serif";
      ctx.fillStyle = "#8b949e";
      ctx.fillText(label, 0, y + barH / 2 + 4);

      // Track
      ctx.fillStyle = "#1c2128";
      ctx.roundRect(labelW, y, barW, barH, 4);
      ctx.fill();

      // Fill
      ctx.fillStyle = color + "cc";
      ctx.roundRect(labelW, y, fill, barH, 4);
      ctx.fill();

      // Value
      const pct = ((values[i] / total) * 100).toFixed(1);
      ctx.font = "500 12px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#e6edf3";
      ctx.fillText(
        `${values[i].toLocaleString()} (${pct}%)`,
        labelW + barW + 10,
        y + barH / 2 + 4
      );
    });
  }, [data]);

  return (
    <div className="chart-container" style={{ height: 180 }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

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
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-header">
        <h2 className="page-title">Dashboard</h2>
        <p className="page-subtitle">Model overview, dataset statistics, and performance metrics</p>
      </div>

      <div className="page-body">
        {/* Status bar */}
        <div className="card" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10, padding: "12px 20px" }}>
          <span style={{ fontSize: 10, width: 8, height: 8, borderRadius: "50%", display: "inline-block", background: online === null ? "#6e7681" : online ? "#3fb950" : "#f85149", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            FastAPI backend&nbsp;
            <span style={{ color: online === null ? "var(--text-subtle)" : online ? "var(--low)" : "var(--critical)", fontWeight: 600 }}>
              {online === null ? "checking…" : online ? "online" : "offline — start `uvicorn main:app --reload --port 8000`"}
            </span>
          </span>
        </div>

        {error && (
          <div className="error-box" style={{ marginBottom: 20 }}>⚠ {error}</div>
        )}

        {!stats ? (
          !error && (
            <div className="spinner-wrap"><div className="spinner" /><span>Loading stats…</span></div>
          )
        ) : (
          <>
            {/* Metrics */}
            <div className="metrics-grid">
              <div className="card">
                <div className="card-title">Total CVEs</div>
                <div className="metric-value">{stats.total_cves.toLocaleString()}</div>
                <div className="metric-label">NVD 2019 – 2026</div>
              </div>
              <div className="card">
                <div className="card-title">Feature Dims</div>
                <div className="metric-value">{stats.feature_dims}</div>
                <div className="metric-label">BERT + NLP + metadata</div>
              </div>
              <div className="card">
                <div className="card-title">Weighted F1</div>
                <div className="metric-value" style={{ color: "var(--low)" }}>0.77</div>
                <div className="metric-label">Test set (40k CVEs)</div>
              </div>
              <div className="card">
                <div className="card-title">Accuracy</div>
                <div className="metric-value" style={{ color: "var(--low)" }}>77%</div>
                <div className="metric-label">XGBoost classifier</div>
              </div>
              <div className="card">
                <div className="card-title">Trained On</div>
                <div className="metric-value" style={{ fontSize: 20 }}>
                  {typeof stats.trained_on_rows === "number"
                    ? stats.trained_on_rows.toLocaleString()
                    : stats.trained_on_rows}
                </div>
                <div className="metric-label">rows</div>
              </div>
              <div className="card">
                <div className="card-title">Last Updated</div>
                <div className="metric-value" style={{ fontSize: 16 }}>{stats.last_data_update}</div>
                <div className="metric-label">NVD fetch</div>
              </div>
            </div>

            <div className="section-grid section-grid-2">
              {/* Distribution chart */}
              <div className="card">
                <div className="card-title">Label Distribution</div>
                <DistributionChart data={stats.label_distribution} />
              </div>

              {/* Pipeline summary */}
              <div className="card">
                <div className="card-title">Pipeline Architecture</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                  {[
                    ["🔤", "NLP Pre-processing", "spaCy NER, regex feature flags"],
                    ["🤖", "SecBERT Embeddings", "768-dim CLS vector per CVE"],
                    ["📊", "Feature Fusion", "768 BERT + 8 NLP + 5 metadata"],
                    ["⚡", "XGBoost Classifier", "Low / Medium / High / Critical"],
                    ["📦", "Context Re-Ranking", "Inventory boost + exploit signals"],
                  ].map(([icon, title, desc]) => (
                    <div key={title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Evaluation table */}
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-title">Evaluation Results — Test Set (40,087 CVEs)</div>
              <div className="table-wrapper" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Precision</th>
                      <th>Recall</th>
                      <th>F1</th>
                      <th>Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Critical", "0.72", "0.74", "0.73", "4,705"],
                      ["High",     "0.76", "0.72", "0.74", "14,792"],
                      ["Medium",   "0.79", "0.86", "0.82", "19,001"],
                      ["Low",      "0.88", "0.38", "0.53", "1,589"],
                    ].map(([cls, p, r, f, s]) => (
                      <tr key={cls}>
                        <td>
                          <span className={`badge badge-${cls.toLowerCase()}`}>{cls}</span>
                        </td>
                        <td style={{ fontFamily: "monospace" }}>{p}</td>
                        <td style={{ fontFamily: "monospace" }}>{r}</td>
                        <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{f}</td>
                        <td style={{ color: "var(--text-muted)" }}>{s}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ fontWeight: 700 }}>Weighted avg</td>
                      <td style={{ fontFamily: "monospace", fontWeight: 700 }}>0.77</td>
                      <td style={{ fontFamily: "monospace", fontWeight: 700 }}>0.77</td>
                      <td style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--low)" }}>0.77</td>
                      <td style={{ color: "var(--text-muted)" }}>40,087</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
