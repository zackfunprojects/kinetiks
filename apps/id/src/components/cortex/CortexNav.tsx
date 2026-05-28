"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pill } from "@kinetiks/ui";

// Canonical seven-section Cortex sub-nav per CLAUDE.md and the Kinetiks
// Contract Addendum §1.8 / §2.13: Identity → Goals → Budget → Patterns →
// Authority → Integrations → Ledger. Phase 4 wired the Authority Grants
// machinery, the Authority Agent, and the Cortex sub-tab end-to-end —
// the `comingSoon` flag dropped at that point.
const NAV_ITEMS: Array<{ href: string; label: string; icon: string; comingSoon?: boolean }> = [
  { href: "/cortex/identity", label: "Identity", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  { href: "/cortex/goals", label: "Goals", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { href: "/cortex/budget", label: "Budget", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/cortex/patterns", label: "Patterns", icon: "M3 17l6-6 4 4 8-8M14 7h7v7" },
  { href: "/cortex/authority", label: "Authority", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  { href: "/cortex/integrations", label: "Integrations", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
  { href: "/cortex/ledger", label: "Ledger", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
];

export function CortexNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        width: 220,
        borderRight: "1px solid var(--kt-border-2)",
        padding: "16px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        backgroundColor: "var(--kt-bg-subtle)",
        flexShrink: 0,
      }}
    >
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--kt-fg-1)",
          margin: "0 0 12px 8px",
          fontFamily: "var(--font-mono), monospace",
        }}
      >
        Cortex
      </h2>
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        const muted = item.comingSoon && !active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              color: active ? "var(--kt-fg-1)" : muted ? "var(--kt-fg-3)" : "var(--kt-fg-2)",
              background: active ? "var(--kt-accent-soft)" : "transparent",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke={active ? "var(--kt-fg-1)" : "var(--kt-fg-3)"}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={item.icon} />
            </svg>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.comingSoon ? <Pill tone="neutral">Soon</Pill> : null}
          </Link>
        );
      })}
    </nav>
  );
}
