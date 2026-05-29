"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@kinetiks/ui";

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
    <nav
      aria-label="Primary"
      style={{
        height: "var(--kt-app-tabbar-h)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--kt-border-2)",
        background: "var(--kt-bg-subtle)",
        padding: "0 var(--kt-s-4)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-1)" }}>
        {/* Logo */}
        <span
          className="kt-mono"
          style={{
            fontWeight: "var(--kt-fw-bold)",
            fontSize: "var(--kt-fs-13)",
            color: "var(--kt-accent)",
            marginRight: "var(--kt-s-5)",
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
              aria-current={active ? "page" : undefined}
              style={{
                padding: "var(--kt-s-3) var(--kt-s-4)",
                fontSize: "var(--kt-fs-13)",
                fontWeight: active ? "var(--kt-fw-med)" : "var(--kt-fw-reg)",
                color: active ? "var(--kt-fg-1)" : "var(--kt-fg-2)",
                textDecoration: "none",
                borderBottom: active ? "2px solid var(--kt-fg-1)" : "2px solid transparent",
                marginBottom: -1,
                transition: "color var(--kt-dur-1) var(--kt-ease-standard), border-color var(--kt-dur-1) var(--kt-ease-standard)",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Right cluster: theme + settings */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-1)" }}>
        <ThemeToggle />
        <button
          type="button"
          onClick={onSettingsClick}
          aria-label="Open settings"
          className="kt-icon-btn"
          style={{ borderRadius: "var(--kt-radius-full)" }}
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
            aria-hidden
          >
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx={12} cy={12} r={3} />
          </svg>
        </button>
      </div>
    </nav>
  );
}
