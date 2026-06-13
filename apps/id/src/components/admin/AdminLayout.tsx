"use client";

import { AdminNav } from "./AdminNav";

interface AdminLayoutProps {
  /** The signed-in admin's role, shown as a small badge in the header. */
  role: "admin" | "superuser";
  children: React.ReactNode;
}

export function AdminLayout({ role, children }: AdminLayoutProps) {
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <AdminNav />
      <div style={{ flex: 1, overflow: "auto", padding: 32 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 24,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--kt-fg-3)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            Operator console
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: "var(--kt-radius-full)",
              background: "var(--kt-accent-soft)",
              color: "var(--kt-accent)",
            }}
          >
            {role}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
