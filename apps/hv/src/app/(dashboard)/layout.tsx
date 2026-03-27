"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import GrowthMeter from "@/components/shared/GrowthMeter";

/* ── Workspace definitions ──────────────────────────────────── */

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface Workspace {
  id: string;
  label: string;
  emoji: string;
  items: NavItem[];
}

const WORKSPACES: Workspace[] = [
  {
    id: "greenhouse",
    label: "Greenhouse",
    emoji: "🌱",
    items: [
      { label: "Seedbed", href: "/greenhouse", icon: "book" },
      { label: "Sprouts", href: "/greenhouse?tab=sprouts", icon: "users" },
    ],
  },
  {
    id: "field",
    label: "Field",
    emoji: "🌾",
    items: [
      { label: "Overview", href: "/field", icon: "grid" },
      { label: "Plant", href: "/field/compose", icon: "edit" },
      { label: "Inbox", href: "/field/inbox", icon: "inbox" },
      { label: "Rows", href: "/field/sequences", icon: "layers" },
      { label: "Plots", href: "/field/campaigns", icon: "megaphone" },
      { label: "Calls", href: "/field/calls", icon: "phone" },
    ],
  },
  {
    id: "market",
    label: "Market",
    emoji: "🥕",
    items: [
      { label: "Harvest Board", href: "/market/pipeline", icon: "kanban" },
      { label: "Yield", href: "/market/analytics", icon: "chart" },
    ],
  },
];

const UTILITY_ITEMS: NavItem[] = [
  { label: "Settings", href: "/settings", icon: "gear" },
];

/* ── SVG Icons ──────────────────────────────────────────────── */

function SidebarIcon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    users: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
    megaphone: "M3 11l18-5v12L3 13v-2zM11.6 16.8a3 3 0 11-5.8-1.6",
    layers: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    inbox: "M22 12h-6l-2 3H10l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z",
    phone: "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z",
    kanban: "M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zM9 3v18M15 3v12",
    book: "M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z",
    chart: "M18 20V10M12 20V4M6 20v-6",
    edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
    gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
  };

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name] ?? icons.grid} />
    </svg>
  );
}

/* ── Layout ─────────────────────────────────────────────────── */

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    greenhouse: true,
    field: true,
    market: true,
  });

  function toggleSection(id: string) {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isActive(href: string): boolean {
    if (href === "/greenhouse" && pathname === "/greenhouse") return true;
    if (href === "/field" && pathname === "/field") return true;
    if (href.includes("?")) return pathname === href.split("?")[0];
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: collapsed ? 56 : 240,
          backgroundColor: "var(--surface-sidebar)",
          borderRight: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          transition: "width var(--duration-normal) var(--ease-smooth)",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* Logo / Brand */}
        <div
          style={{
            padding: collapsed ? "20px 14px 16px" : "20px 16px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            borderBottom: "1px solid var(--border-subtle)",
          }}
          onClick={() => setCollapsed(!collapsed)}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--radius-md)",
              background: "linear-gradient(135deg, var(--harvest-green) 0%, #4A9154 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            🥕
          </div>
          {!collapsed && (
            <span style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.01em",
            }}>
              Harvest
            </span>
          )}
        </div>

        {/* Workspace sections */}
        <nav style={{ flex: 1, padding: "8px 8px 0", overflowY: "auto" }}>
          {WORKSPACES.map((ws) => (
            <div key={ws.id} style={{ marginBottom: 4 }}>
              {/* Section header */}
              {!collapsed && (
                <button
                  onClick={() => toggleSection(ws.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    padding: "6px 8px",
                    border: "none",
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  <span style={{
                    fontSize: 10,
                    transition: "transform var(--duration-fast) var(--ease-smooth)",
                    transform: expandedSections[ws.id] ? "rotate(90deg)" : "rotate(0deg)",
                  }}>
                    ▶
                  </span>
                  <span>{ws.emoji} {ws.label}</span>
                </button>
              )}

              {/* Section items */}
              {(collapsed || expandedSections[ws.id]) && ws.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: collapsed ? "8px 0" : "6px 8px 6px 24px",
                      justifyContent: collapsed ? "center" : "flex-start",
                      borderRadius: "var(--radius-sm)",
                      color: active ? "var(--text-primary)" : "var(--text-secondary)",
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: active ? 500 : 400,
                      backgroundColor: active ? "var(--sidebar-active-bg)" : "transparent",
                      borderLeft: active && !collapsed ? "2px solid var(--sidebar-active-border)" : "2px solid transparent",
                      marginLeft: collapsed ? 0 : 0,
                      transition: "all var(--duration-fast) var(--ease-smooth)",
                      marginBottom: 1,
                    }}
                  >
                    <SidebarIcon name={item.icon} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}

              {/* Divider between workspaces */}
              {!collapsed && (
                <div style={{
                  height: 1,
                  backgroundColor: "var(--border-subtle)",
                  margin: "8px 8px",
                }} />
              )}
              {collapsed && (
                <div style={{
                  height: 1,
                  backgroundColor: "var(--border-subtle)",
                  margin: "6px 10px",
                }} />
              )}
            </div>
          ))}
        </nav>

        {/* Footer: utilities + growth meter */}
        <div style={{
          padding: 8,
          borderTop: "1px solid var(--border-subtle)",
        }}>
          {UTILITY_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: collapsed ? "8px 0" : "6px 8px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  borderRadius: "var(--radius-sm)",
                  color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 400,
                  backgroundColor: active ? "var(--sidebar-active-bg)" : "transparent",
                  transition: "all var(--duration-fast) var(--ease-smooth)",
                }}
              >
                <SidebarIcon name={item.icon} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}

          {/* Growth meter */}
          {!collapsed && (
            <div style={{
              marginTop: 12,
              padding: "10px 8px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--harvest-green-subtle)",
              display: "flex",
              justifyContent: "center",
            }}>
              <GrowthMeter level={15} mode="human" />
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          padding: "var(--space-6) var(--space-8)",
          overflow: "auto",
          backgroundColor: "var(--surface-base)",
          minWidth: 0,
        }}
      >
        {children}
      </main>
    </div>
  );
}
