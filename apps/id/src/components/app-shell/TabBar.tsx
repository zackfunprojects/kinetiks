"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/chat", label: "Chat" },
  { href: "/analytics", label: "Analytics" },
  { href: "/cortex", label: "Cortex" },
];

interface TabBarProps {
  systemName: string | null;
  onSettingsClick: () => void;
}

export function TabBar({ systemName, onSettingsClick }: TabBarProps) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    return pathname.startsWith(href);
  }

  return (
    <div
      style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--border-muted)",
        background: "var(--bg-surface)",
        padding: "0 16px",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* Logo */}
        <span
          style={{
            fontFamily: "var(--font-mono), monospace",
            fontWeight: 700,
            fontSize: 13,
            color: "var(--logo-accent)",
            marginRight: 24,
            letterSpacing: -0.3,
          }}
        >
          {systemName || "kinetiks"}
        </span>

        {/* Tabs */}
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href === "/cortex" ? "/cortex/identity" : tab.href}
              style={{
                padding: "12px 16px",
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                textDecoration: "none",
                borderBottom: active
                  ? "2px solid var(--text-primary)"
                  : "2px solid transparent",
                marginBottom: -1,
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Settings avatar */}
      <button
        onClick={onSettingsClick}
        aria-label="Open settings"
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface-raised)",
          color: "var(--text-secondary)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <circle cx={12} cy={12} r={3} />
        </svg>
      </button>
    </div>
  );
}
