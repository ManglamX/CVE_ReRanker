"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Search, FileSpreadsheet, Package, Cpu, Zap } from "lucide-react";
import Aurora from "./Aurora";
import GradientText from "./GradientText";

const NAV = [
  { href: "/",          icon: LayoutDashboard, label: "Dashboard"   },
  { href: "/lookup",    icon: Search,          label: "CVE Lookup"  },
  { href: "/bulk",      icon: FileSpreadsheet, label: "Bulk Upload" },
  { href: "/inventory", icon: Package,         label: "Inventory"   },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside className="sidebar">
      <Aurora
        colorStops={["#0a2472", "#1a0a4a", "#0d2137"]}
        speed={0.6}
        amplitude={0.7}
      />

      <div className="sidebar-brand">
        <div className="sidebar-brand-title">CVE Re-Ranker</div>
        <div className="sidebar-brand-sub">Context-aware severity scoring</div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link${path === href ? " active" : ""}`}
          >
            <Icon size={16} className="nav-icon" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Cpu size={12} />
          <GradientText
            gradient="linear-gradient(90deg,#58a6ff,#39d0d8)"
            animate={false}
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            SecBERT + XGBoost
          </GradientText>
        </p>
        <p style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
          <Zap size={12} />
          <span>FastAPI · localhost:8000</span>
        </p>
      </div>
    </aside>
  );
}
