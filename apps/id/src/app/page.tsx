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
      redirect("/chat");
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
        background: "var(--kt-bg-base)",
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
          borderBottom: "1px solid var(--kt-border-2)",
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--kt-accent)",
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
              color: "var(--kt-fg-2)",
              textDecoration: "none",
            }}
          >
            Developers
          </Link>
          <Link
            href="/login"
            style={{
              fontSize: 14,
              color: "var(--kt-fg-2)",
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
              background: "var(--kt-accent)",
              color: "var(--kt-fg-on-inverse)",
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
            color: "var(--kt-fg-1)",
            maxWidth: 720,
            margin: "0 0 20px",
            letterSpacing: "-0.03em",
          }}
        >
          Build your business identity once.
          <br />
          <span style={{ color: "var(--kt-accent)" }}>Power everything.</span>
        </h1>

        <p
          style={{
            fontSize: 18,
            color: "var(--kt-fg-2)",
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
              background: "var(--kt-accent)",
              color: "var(--kt-fg-on-inverse)",
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
              border: "1px solid var(--kt-border-1)",
              color: "var(--kt-fg-2)",
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
                background: "var(--kt-bg-subtle)",
                border: "1px solid var(--kt-border-2)",
                borderRadius: 10,
                padding: "16px 12px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{layer.icon}</div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--kt-fg-2)",
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
            color: "var(--kt-fg-3)",
          }}
        >
          8 layers. One identity. Every app.
        </p>
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: "24px 32px",
          borderTop: "1px solid var(--kt-border-2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
          color: "var(--kt-fg-3)",
        }}
      >
        <span>Kinetiks AI</span>
        <div style={{ display: "flex", gap: 20 }}>
          <Link href="/developers" style={{ color: "var(--kt-fg-3)", textDecoration: "none" }}>
            Developers
          </Link>
          <Link href="/login" style={{ color: "var(--kt-fg-3)", textDecoration: "none" }}>
            Log in
          </Link>
        </div>
      </footer>
    </main>
  );
}
