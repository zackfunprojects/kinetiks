import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listGrants } from "@/lib/cortex/authority/list";
import { AuthorityManager } from "@/components/cortex/authority/AuthorityManager";
import { captureException } from "@/lib/observability/sentry";

export const dynamic = "force-dynamic";

/**
 * Cortex → Authority sub-tab per the Kinetiks Contract Addendum §2.13.
 *
 * Server Component fetches:
 *   - All non-terminal grants for the account (proposed, active, paused)
 *   - Last 7 days of authority_* ledger events with the grant's
 *     scope_description joined in
 *   - The customer's system name from kinetiks_accounts.system_name
 *
 * Renders via AuthorityManager (client component). Mutations route
 * through Next.js Server Actions in ./actions.ts; those revalidate
 * `/cortex/authority` so the page refetches on completion.
 *
 * Customer-facing copy: per CLAUDE.md, the literal phrase "Authority
 * Grant" never appears. Framing word is "permission".
 *
 * Phase 4 — Chunk 8.
 */
export default async function AuthorityPage() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) redirect("/login?redirect=/cortex/authority");

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, system_name")
    .eq("user_id", user.id)
    .single();
  if (!account) redirect("/login?redirect=/cortex/authority");

  // Grants section: all non-terminal grants (proposed, active, paused).
  // Terminal grants (revoked, expired) live in the recent-activity feed
  // for the 7-day window; long-term they live in the Ledger page.
  //
  // This is the SPINE query — the data the page is about. Per
  // CLAUDE.md error-handling rules, spine failures get captured to
  // Sentry (full structured shape) and surface a friendly error UI
  // rather than rendering an empty page.
  let grantsPage;
  try {
    grantsPage = await listGrants(admin, {
      account_id: account.id,
      status_in: ["proposed", "active", "paused"],
      limit: 50,
    });
  } catch (err) {
    await captureException(err, {
      tags: {
        app: "id",
        route: "/cortex/authority",
        action: "authority.list",
        stage: "spine",
      },
      user: { id: account.id as string },
    });
    return (
      <Layout systemName={account.system_name as string | null}>
        <div
          style={{
            padding: "var(--kt-s-5)",
            border: "1px solid var(--kt-border-2)",
            borderRadius: "var(--kt-radius-2)",
            background: "var(--kt-bg-subtle)",
            color: "var(--kt-fg-2)",
            fontSize: "var(--kt-fs-13)",
            maxWidth: 720,
          }}
        >
          We couldn&apos;t load your permissions right now. Try again in a moment.
        </div>
      </Layout>
    );
  }

  // Recent activity: last 7 days of authority_* ledger events. Joined
  // against the grants list above so the feed can show the scope
  // description without a second round trip. Terminal grants outside
  // the 50-row main page need a follow-up lookup to resolve their
  // scope_description — handled below.
  //
  // These are SIDE-PANEL queries — the page still renders fine if they
  // fail. Per CLAUDE.md "side-panel queries capture to Sentry with a
  // stage tag, fall back to 0 or []", they get captured with their own
  // stage and we continue with empty data.
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: ledgerRows, error: ledgerErr } = await admin
    .from("kinetiks_ledger")
    .select("event_type, grant_id, created_at, detail")
    .eq("account_id", account.id)
    .gte("created_at", sevenDaysAgo)
    .like("event_type", "authority_%")
    .order("created_at", { ascending: false })
    .limit(50);
  if (ledgerErr) {
    await captureException(ledgerErr, {
      tags: {
        app: "id",
        route: "/cortex/authority",
        action: "authority.activity_feed",
        stage: "side_panel",
      },
      user: { id: account.id as string },
    });
  }

  // Resolve scope_description for any grant referenced by the activity
  // feed but not already in the main grants list (e.g. a grant revoked
  // 3 days ago is in the feed but not in the active sections).
  const scopeDescriptionByGrantId = new Map<string, string>();
  for (const g of grantsPage.items) {
    scopeDescriptionByGrantId.set(g.id, g.scope_description);
  }
  const missingGrantIds = (ledgerRows ?? [])
    .map((r) => r.grant_id as string | null)
    .filter(
      (id): id is string =>
        typeof id === "string" && !scopeDescriptionByGrantId.has(id),
    );
  const uniqueMissing = Array.from(new Set(missingGrantIds));
  if (uniqueMissing.length > 0) {
    const { data: orphanGrants, error: orphanErr } = await admin
      .from("kinetiks_authority_grants")
      .select("id, scope_description")
      .eq("account_id", account.id)
      .in("id", uniqueMissing);
    if (orphanErr) {
      await captureException(orphanErr, {
        tags: {
          app: "id",
          route: "/cortex/authority",
          action: "authority.orphan_scope_lookup",
          stage: "side_panel",
        },
        user: { id: account.id as string },
      });
    }
    for (const og of orphanGrants ?? []) {
      scopeDescriptionByGrantId.set(
        og.id as string,
        og.scope_description as string,
      );
    }
  }

  const recentActivity = (ledgerRows ?? []).map((r) => {
    const grantId = r.grant_id as string | null;
    return {
      event_type: r.event_type as string,
      grant_id: grantId,
      created_at: r.created_at as string,
      detail: (r.detail ?? {}) as Record<string, unknown>,
      scope_description: grantId
        ? scopeDescriptionByGrantId.get(grantId) ?? null
        : null,
    };
  });

  return (
    <Layout systemName={account.system_name as string | null}>
      <AuthorityManager
        grants={grantsPage.items}
        recentActivity={recentActivity}
        systemName={account.system_name as string | null}
      />
    </Layout>
  );
}

function Layout({
  systemName,
  children,
}: {
  systemName: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1
        style={{
          fontSize: "var(--kt-fs-24)",
          fontWeight: "var(--kt-fw-bold)",
          color: "var(--kt-fg-1)",
          margin: "0 0 var(--kt-s-2)",
        }}
      >
        Authority
      </h1>
      <p
        style={{
          fontSize: "var(--kt-fs-14)",
          color: "var(--kt-fg-2)",
          margin: "0 0 var(--kt-s-6)",
          lineHeight: "var(--kt-lh-body)",
          maxWidth: 720,
        }}
      >
        What {systemName ?? "your system"} can do on your behalf, in plain
        language. Every permission is scoped, time-bounded, and revocable at
        any moment.
      </p>
      {children}
    </div>
  );
}
