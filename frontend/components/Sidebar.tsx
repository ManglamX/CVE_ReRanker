"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",           icon: "⬡", label: "Dashboard"    },
  { href: "/lookup",     icon: "🔍", label: "CVE Lookup"   },
  { href: "/bulk",       icon: "📋", label: "Bulk Upload"  },
  { href: "/inventory",  icon: "🗂", label: "Inventory"    },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>CVE Re-Ranker</h1>
        <p>Context-aware severity scoring</p>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ href, icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link${path === href ? " active" : ""}`}
          >
            <span className="nav-icon">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p>SecBERT + XGBoost</p>
        <p style={{ marginTop: 2 }}>FastAPI backend · :8000</p>
      </div>
    </aside>
  );
}
