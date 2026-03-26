import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/types/pipeline";

export const dynamic = "force-dynamic";

interface KpiCard {
  label: string;
  value: string;
}

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let confidenceScore = 0;
  const kpis: KpiCard[] = [
    { label: "Active Prospects", value: "-" },
    { label: "Contacts", value: "-" },
    { label: "Open Deals", value: "-" },
    { label: "Pipeline Value", value: "-" },
  ];

  let hasAccount = false;

  if (user) {
    // Get account
    const { data: account } = await supabase
      .from("kinetiks_accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (account) {
      // Fetch confidence score and KPIs in parallel
      const [confidenceResult, contactsResult, dealsResult] = await Promise.all([
        supabase
          .from("kinetiks_confidence")
          .select("aggregate")
          .eq("account_id", account.id)
          .single(),
        supabase
          .from("hv_contacts")
          .select("id", { count: "exact", head: true })
          .eq("kinetiks_id", account.id),
        supabase
          .from("hv_deals")
          .select("stage, value")
          .eq("kinetiks_id", account.id),
      ]);

      confidenceScore = Math.round(Number(confidenceResult.data?.aggregate ?? 0));

      const contactCount = contactsResult.count ?? 0;
      kpis[1] = { label: "Contacts", value: String(contactCount) };

      const deals = dealsResult.data ?? [];
      const openDeals = deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost");
      const prospectingDeals = deals.filter((d) => d.stage === "prospecting");
      const pipelineValue = openDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

      kpis[0] = { label: "Active Prospects", value: String(prospectingDeals.length) };
      kpis[2] = { label: "Open Deals", value: String(openDeals.length) };
      kpis[3] = { label: "Pipeline Value", value: formatCurrency(pipelineValue) };
      hasAccount = true;
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1
            style={{
              fontSize: "1.375rem",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
              marginBottom: "8px",
            }}
          >
            Dashboard
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Welcome to Harvest. Your outbound command center.
          </p>
        </div>

        {/* Confidence score */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 20px",
            borderRadius: "10px",
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "3px solid var(--accent-primary, #6C5CE7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.875rem",
              fontWeight: 700,
              color: "var(--accent-primary, #6C5CE7)",
              fontFamily: "var(--font-mono, monospace), monospace",
            }}
          >
            {confidenceScore}%
          </div>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Kinetiks ID
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              <a href="https://id.kinetiks.ai" style={{ color: "var(--accent-primary, #6C5CE7)", textDecoration: "none" }}>
                View full ID
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "16px",
        }}
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            style={{
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              padding: "20px",
            }}
          >
            <div
              style={{
                fontSize: "0.6875rem",
                fontWeight: 500,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: "8px",
              }}
            >
              {kpi.label}
            </div>
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono, monospace), monospace",
              }}
            >
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Context suggestions */}
      {hasAccount && confidenceScore < 70 && (
        <div
          style={{
            marginTop: "24px",
            padding: "16px 20px",
            borderRadius: "8px",
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "8px",
            }}
          >
            Improve your Kinetiks ID
          </div>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
            A stronger ID means better outreach. Visit your{" "}
            <a href="https://id.kinetiks.ai" style={{ color: "var(--accent-primary, #6C5CE7)", textDecoration: "none" }}>
              Kinetiks ID dashboard
            </a>{" "}
            to connect data sources, upload writing samples, and refine your voice profile.
          </p>
        </div>
      )}
    </div>
  );
}
