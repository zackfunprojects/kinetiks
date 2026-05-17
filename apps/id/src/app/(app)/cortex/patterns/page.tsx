import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { listPatterns } from "@/lib/cortex/patterns/list";
import { listCustomerVisiblePatternTypes } from "@kinetiks/tools";
import { PatternsManager } from "@/components/cortex/patterns/PatternsManager";
import type { PatternLifecycleStatus } from "@kinetiks/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface SearchParams {
  type?: string;
  status?: string;
  app?: string;
  confidence_min?: string;
  starred?: string;
  suppressed?: string;
  archived?: string;
  page?: string;
}

const VALID_STATUSES: PatternLifecycleStatus[] = [
  "emerging",
  "validated",
  "declining",
  "archived",
];

export default async function PatternsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) as SearchParams;

  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) redirect("/login?redirect=/cortex/patterns");

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!account) redirect("/login?redirect=/cortex/patterns");

  // Resolve filters from URL params, defending against invalid values.
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const typeFilter = params.type && params.type.length > 0 ? params.type : undefined;
  const appFilter = params.app && params.app.length > 0 ? params.app : undefined;
  const statusFilter =
    params.status && VALID_STATUSES.includes(params.status as PatternLifecycleStatus)
      ? (params.status as PatternLifecycleStatus)
      : undefined;
  const confidenceMin = params.confidence_min
    ? Math.min(1, Math.max(0, parseFloat(params.confidence_min)))
    : undefined;
  const starredOnly = params.starred === "true";
  const includeSuppressed = params.suppressed === "true";
  const includeArchived = params.archived === "true" || statusFilter === "archived";

  let result;
  try {
    result = await listPatterns(admin, {
      account_id: account.id,
      caller_app: "customer_ui",
      pattern_types: typeFilter ? [typeFilter] : undefined,
      source_apps: appFilter ? [appFilter] : undefined,
      status_in:
        statusFilter && statusFilter !== "archived"
          ? [statusFilter as Exclude<PatternLifecycleStatus, "archived">]
          : undefined,
      minimum_confidence: confidenceMin,
      exclude_user_suppressed: !includeSuppressed,
      include_archived: includeArchived,
      only_starred: starredOnly,
      limit: PAGE_SIZE,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`Patterns page load failed account=${account.id}: ${message}`);
    return (
      <div style={{ padding: "var(--kt-s-6)", color: "var(--kt-fg-2)" }}>
        We couldn&apos;t load patterns right now. Try again in a moment.
      </div>
    );
  }

  // Surface registered pattern types for the filter dropdown. Customer-visible
  // only — the same allowlist the read helper enforces.
  const availableTypes = listCustomerVisiblePatternTypes().map((d) => ({
    pattern_type: d.pattern_type,
    description: d.description,
  }));

  return (
    <PatternsManager
      patterns={result.patterns}
      total={result.total}
      page={page}
      pageSize={PAGE_SIZE}
      availableTypes={availableTypes}
      filters={{
        type: typeFilter ?? "",
        status: statusFilter ?? "",
        app: appFilter ?? "",
        confidence_min: params.confidence_min ?? "",
        starred: starredOnly,
        suppressed: includeSuppressed,
        archived: includeArchived,
      }}
    />
  );
}
