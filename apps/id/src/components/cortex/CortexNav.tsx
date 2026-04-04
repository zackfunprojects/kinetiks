"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/cortex/identity", label: "Identity", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  { href: "/cortex/goals", label: "Goals", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { href: "/cortex/integrations", label: "Integrations", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
  { href: "/cortex/ledger", label: "Ledger", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
];

export function CortexNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        width: 220,
        borderRight: "1px solid var(--border-muted)",
        padding: "16px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        backgroundColor: "var(--bg-surface)",
        flexShrink: 0,
      }}
    >
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: "0 0 12px 8px",
          fontFamily: "var(--font-mono), monospace",
        }}
      >
        Cortex
      </h2>
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              background: active ? "var(--accent-subtle)" : "transparent",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke={active ? "var(--text-primary)" : "var(--text-tertiary)"}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={item.icon} />
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
