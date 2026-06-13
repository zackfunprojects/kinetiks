"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pill } from "@kinetiks/ui";

// v1 ships Model management. The "Soon" items telegraph the phased
// operator console (ops/health, accounts, billing-admin, audit, flags)
// without implying they're built.
const NAV_ITEMS: Array<{ href: string; label: string; icon: string; comingSoon?: boolean }> = [
  { href: "/admin/models", label: "Models", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { href: "/admin/operations", label: "Operations", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z", comingSoon: true },
  { href: "/admin/accounts", label: "Accounts", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-3-6.7", comingSoon: true },
];

export function AdminNav() {
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
        Admin
      </h2>
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        const muted = item.comingSoon && !active;
        const inner = (
          <>
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
          </>
        );
        const style: React.CSSProperties = {
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
        };
        // "Soon" items are not navigable yet.
        if (item.comingSoon) {
          return (
            <div key={item.href} aria-disabled style={{ ...style, cursor: "default" }}>
              {inner}
            </div>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            style={style}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
