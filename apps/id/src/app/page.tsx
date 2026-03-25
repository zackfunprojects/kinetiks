import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  // If logged in with a completed account, go straight to dashboard
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (user) {
    const admin = createAdminClient();
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id, onboarding_complete")
      .eq("user_id", user.id)
      .single();

    if (account?.onboarding_complete) {
      redirect("/context");
    }
    if (account) {
      redirect("/onboarding");
    }
  }

  // Unauthenticated - show landing
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 32px",
          borderBottom: "1px solid var(--border-muted)",
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--logo-accent)",
            letterSpacing: "-0.02em",
          }}
        >
          kinetiks_id
        </span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link
            href="/developers"
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
          >
            Developers
          </Link>
          <Link
            href="/login"
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
          >
            Log in
          </Link>
          <Link
            href="/signup"
            style={{
              fontSize: 14,
              padding: "8px 20px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "var(--text-on-accent)",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 24px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.08,
            color: "var(--text-primary)",
            maxWidth: 720,
            margin: "0 0 20px",
            letterSpacing: "-0.03em",
          }}
        >
          Build your business identity once.
          <br />
          <span style={{ color: "var(--logo-accent)" }}>Power everything.</span>
        </h1>

        <p
          style={{
            fontSize: 18,
            color: "var(--text-secondary)",
            maxWidth: 540,
            margin: "0 0 40px",
            lineHeight: 1.6,
          }}
        >
          Kinetiks learns your org, products, voice, customers, and brand -
          then that identity powers every marketing tool in the ecosystem.
          15 minutes to set up. Gets smarter over time.
        </p>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link
            href="/signup"
            style={{
              fontSize: 16,
              padding: "14px 32px",
              borderRadius: 10,
              background: "var(--accent)",
              color: "var(--text-on-accent)",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Create your Kinetiks ID
          </Link>
          <Link
            href="/developers"
            style={{
              fontSize: 16,
              padding: "14px 32px",
              borderRadius: 10,
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontWeight: 500,
              background: "transparent",
            }}
          >
            For AI Agents
          </Link>
        </div>

        {/* Context layers preview */}
        <div
          style={{
            marginTop: 80,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            maxWidth: 640,
            width: "100%",
          }}
        >
          {[
            { name: "Org", icon: "\u2302" },
            { name: "Products", icon: "\u25A0" },
            { name: "Voice", icon: "\u266A" },
            { name: "Customers", icon: "\u2616" },
            { name: "Narrative", icon: "\u270E" },
            { name: "Competitive", icon: "\u2694" },
            { name: "Market", icon: "\u2197" },
            { name: "Brand", icon: "\u25C9" },
          ].map((layer) => (
            <div
              key={layer.name}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-muted)",
                borderRadius: 10,
                padding: "16px 12px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{layer.icon}</div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  fontWeight: 500,
                }}
              >
                {layer.name}
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            marginTop: 16,
            fontSize: 13,
            color: "var(--text-tertiary)",
          }}
        >
          8 layers. One identity. Every app.
        </p>
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: "24px 32px",
          borderTop: "1px solid var(--border-muted)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
          color: "var(--text-tertiary)",
        }}
      >
        <span>Kinetiks AI</span>
        <div style={{ display: "flex", gap: 20 }}>
          <Link href="/developers" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
            Developers
          </Link>
          <Link href="/login" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
            Log in
          </Link>
        </div>
      </footer>
    </main>
  );
}
