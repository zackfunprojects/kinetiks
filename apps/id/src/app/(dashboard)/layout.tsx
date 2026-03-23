import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 240,
          borderRight: "1px solid #eee",
          padding: 24,
        }}
      >
        <nav>
          <p style={{ fontWeight: 600, color: "#6C5CE7", marginBottom: 24 }}>
            Kinetiks ID
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {[
              { href: "/", label: "Dashboard" },
              { href: "/context", label: "Context" },
              { href: "/ledger", label: "Ledger" },
              { href: "/connections", label: "Connections" },
              { href: "/imports", label: "Imports" },
              { href: "/apps", label: "Apps" },
              { href: "/billing", label: "Billing" },
              { href: "/settings", label: "Settings" },
            ].map((item) => (
              <li key={item.href} style={{ marginBottom: 8 }}>
                <Link
                  href={item.href}
                  style={{
                    color: "#333",
                    textDecoration: "none",
                    fontSize: 14,
                  }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main style={{ flex: 1, padding: 32 }}>{children}</main>
    </div>
  );
}
