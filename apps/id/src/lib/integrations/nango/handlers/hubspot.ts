/**
 * Nango sync handler — HubSpot.
 *
 * HubSpot uses Nango's pre-built syncs. We consume five of them:
 *   - companies
 *   - contacts
 *   - deals
 *   - owners
 *   - pipelines
 *
 * Per slice 4, this handler:
 *   1. fetches records via the Nango records API (paginated)
 *   2. normalizes the entity payload — PII-guarded (emails/phones hashed,
 *      raw addresses dropped, free-text notes stripped)
 *   3. upserts into kinetiks_crm_entities
 *
 * Daily roll-up to kinetiks_metric_cache happens in oracle/runner.ts via
 * crm-aggregator.ts on the next Oracle cycle.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRecords, NangoMisconfiguredError } from "../client";
import { hashEmail, hashPhone, pickSafeAddress, urlDomain } from "../pii";
import { registerNangoHandler } from ".";
import type { NangoHandlerFn, NangoHandlerResult } from "../types";

// ─── Normalizers ─────────────────────────────────────────────

/** What we keep from a HubSpot company. */
interface NormalizedCompany {
  external_id: string;
  name: string | null;
  domain: string | null;
  industry: string | null;
  size_bucket: string | null;        // 'micro' | 'small' | 'mid' | 'enterprise' if classifiable
  arr_band: string | null;           // 'pre-revenue' | '0-1m' | '1-10m' | '10m+' if classifiable
  city: string | null;
  state: string | null;
  country: string | null;
  external_updated_at: string | null;
}

interface NormalizedContact {
  external_id: string;
  email_lower_hash: string | null;
  phone_lower_hash: string | null;
  domain: string | null;             // from email_address right-side
  role_or_title: string | null;
  lifecycle_stage: string | null;
  hubspot_owner_id: string | null;
  company_id: string | null;
  external_updated_at: string | null;
}

interface NormalizedDeal {
  external_id: string;
  amount: number | null;
  currency: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  is_closed: boolean;
  is_won: boolean;
  hubspot_owner_id: string | null;
  company_id: string | null;
  contact_ids: string[];
  source: string | null;             // HubSpot's `dealsource` if present
  created_at: string | null;
  closed_at: string | null;
  external_updated_at: string | null;
}

interface NormalizedOwner {
  external_id: string;
  email_lower_hash: string | null;
  external_updated_at: string | null;
}

interface NormalizedPipeline {
  external_id: string;
  label: string;
  stages: Array<{ id: string; label: string; probability: number | null; is_closed: boolean; is_won: boolean }>;
  external_updated_at: string | null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBool(v: unknown): boolean {
  return v === true || v === "true";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function normalizeCompany(raw: Record<string, unknown>): NormalizedCompany {
  const addr = pickSafeAddress({
    city: asString(raw.city),
    state: asString(raw.state),
    country: asString(raw.country),
  });
  return {
    external_id: String(raw.id ?? ""),
    name: asString(raw.name),
    domain: urlDomain(asString(raw.domain) ?? asString(raw.website)),
    industry: asString(raw.industry),
    size_bucket: bucketEmployees(asNumber(raw.numberofemployees)),
    arr_band: bandArr(asNumber(raw.annualrevenue)),
    city: addr.city ?? null,
    state: addr.state ?? null,
    country: addr.country ?? null,
    external_updated_at: asString(raw.updatedAt) ?? asString(raw.hs_lastmodifieddate),
  };
}

function bucketEmployees(n: number | null): string | null {
  if (n == null) return null;
  if (n < 10) return "micro";
  if (n < 50) return "small";
  if (n < 500) return "mid";
  return "enterprise";
}

function bandArr(n: number | null): string | null {
  if (n == null) return null;
  if (n === 0) return "pre-revenue";
  if (n < 1_000_000) return "0-1m";
  if (n < 10_000_000) return "1-10m";
  return "10m+";
}

function normalizeContact(raw: Record<string, unknown>): NormalizedContact {
  const email = asString(raw.email);
  return {
    external_id: String(raw.id ?? ""),
    email_lower_hash: hashEmail(email),
    phone_lower_hash: hashPhone(asString(raw.phone)),
    domain: email ? email.split("@")[1]?.toLowerCase() ?? null : null,
    role_or_title: asString(raw.jobtitle),
    lifecycle_stage: asString(raw.lifecyclestage),
    hubspot_owner_id: asString(raw.hubspot_owner_id),
    company_id: asString(raw.associatedcompanyid),
    external_updated_at: asString(raw.updatedAt) ?? asString(raw.hs_lastmodifieddate),
  };
}

function normalizeDeal(raw: Record<string, unknown>): NormalizedDeal {
  const isClosed = asBool(raw.is_closed) || isClosedStage(asString(raw.dealstage));
  return {
    external_id: String(raw.id ?? ""),
    amount: asNumber(raw.amount),
    currency: asString(raw.deal_currency_code) ?? "USD",
    pipeline_id: asString(raw.pipeline),
    stage_id: asString(raw.dealstage),
    is_closed: isClosed,
    is_won: asBool(raw.is_won) || isWonStage(asString(raw.dealstage)),
    hubspot_owner_id: asString(raw.hubspot_owner_id),
    company_id: asString(raw.associatedcompanyid),
    contact_ids: asStringArray(raw.associatedcontactids),
    source: asString(raw.dealsource),
    created_at: asString(raw.createdate),
    closed_at: isClosed ? asString(raw.closedate) : null,
    external_updated_at: asString(raw.updatedAt) ?? asString(raw.hs_lastmodifieddate),
  };
}

// Conservative defaults — HubSpot deal stages are customer-defined,
// so we fall back to the canonical default-pipeline ids. The proper
// resolution comes from the pipelines sync (see `normalizePipeline`)
// + a join in crm-aggregator.ts.
function isClosedStage(stageId: string | null): boolean {
  if (!stageId) return false;
  return /closedwon|closedlost/i.test(stageId);
}
function isWonStage(stageId: string | null): boolean {
  if (!stageId) return false;
  return /closedwon/i.test(stageId);
}

function normalizeOwner(raw: Record<string, unknown>): NormalizedOwner {
  return {
    external_id: String(raw.id ?? ""),
    email_lower_hash: hashEmail(asString(raw.email)),
    external_updated_at: asString(raw.updatedAt),
  };
}

function normalizePipeline(raw: Record<string, unknown>): NormalizedPipeline {
  const stages = Array.isArray(raw.stages) ? raw.stages : [];
  return {
    external_id: String(raw.id ?? ""),
    label: asString(raw.label) ?? "",
    stages: stages.map((s: unknown) => {
      const stage = s as Record<string, unknown>;
      const metadata = (stage.metadata as Record<string, unknown>) ?? {};
      return {
        id: String(stage.id ?? ""),
        label: asString(stage.label) ?? "",
        probability: asNumber(metadata.probability),
        is_closed: asBool(metadata.isClosed) || isClosedStage(asString(stage.id)),
        is_won: isWonStage(asString(stage.id)),
      };
    }),
    external_updated_at: asString(raw.updatedAt),
  };
}

// ─── Upsert ──────────────────────────────────────────────────

const ENTITY_TYPE_BY_SYNC: Record<string, "company" | "contact" | "deal" | "owner" | "pipeline"> = {
  companies: "company",
  contacts: "contact",
  deals: "deal",
  owners: "owner",
  pipelines: "pipeline",
};

const NORMALIZERS = {
  company: normalizeCompany,
  contact: normalizeContact,
  deal: normalizeDeal,
  owner: normalizeOwner,
  pipeline: normalizePipeline,
} as const;

interface UpsertCounters {
  added: number;
  updated: number;
}

async function upsertEntities(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  entityType: keyof typeof NORMALIZERS,
  page: Record<string, unknown>[]
): Promise<UpsertCounters> {
  if (page.length === 0) return { added: 0, updated: 0 };

  const rows = page
    .map((raw) => {
      try {
        const normalized = NORMALIZERS[entityType](raw as never);
        if (!normalized.external_id) return null;
        return {
          account_id: accountId,
          source: "hubspot",
          entity_type: entityType,
          external_id: normalized.external_id,
          data: normalized as unknown as Record<string, unknown>,
          external_updated_at:
            (normalized as { external_updated_at?: string | null }).external_updated_at ?? null,
          synced_at: new Date().toISOString(),
        };
      } catch {
        return null;
      }
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (rows.length === 0) return { added: 0, updated: 0 };

  const { error } = await admin
    .from("kinetiks_crm_entities")
    .upsert(rows, {
      onConflict: "account_id,source,entity_type,external_id",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`crm_entities upsert failed: ${error.message}`);
  }

  // We don't get an INSERT vs UPDATE count from PostgREST. Report all as
  // 'updated' optimistically; the operator surface treats added+updated
  // as a single "throughput" number.
  return { added: 0, updated: rows.length };
}

// ─── Handler factory ─────────────────────────────────────────

function makeHubspotHandler(syncName: string): NangoHandlerFn {
  const entityType = ENTITY_TYPE_BY_SYNC[syncName];

  return async (ctx) => {
    if (!entityType) {
      return {
        status: "skipped",
        recordsAdded: 0,
        recordsUpdated: 0,
        recordsDeleted: 0,
        errorClass: "unknown_sync",
        errorMessage: `HubSpot sync '${syncName}' not configured`,
      };
    }

    const admin = createAdminClient();
    let added = 0;
    let updated = 0;

    try {
      const summary = await fetchAllRecords(
        {
          connectionId: ctx.webhook.connectionId,
          providerConfigKey: ctx.webhook.providerConfigKey,
          model: syncName,
          modifiedAfter: ctx.webhook.modifiedAfter,
        },
        async (page) => {
          const counts = await upsertEntities(admin, ctx.accountId, entityType, page);
          added += counts.added;
          updated += counts.updated;
        }
      );

      const result: NangoHandlerResult = {
        status: summary.capReached ? "partial" : "succeeded",
        recordsAdded: added,
        recordsUpdated: updated,
        recordsDeleted: 0,
      };
      if (summary.capReached) {
        result.errorClass = "page_cap_reached";
        result.errorMessage = `Fetched ${summary.totalRecords} records across ${summary.pages} pages; cap reached.`;
      }
      return result;
    } catch (err) {
      if (err instanceof NangoMisconfiguredError) {
        return {
          status: "failed",
          recordsAdded: added,
          recordsUpdated: updated,
          recordsDeleted: 0,
          errorClass: "nango_misconfigured",
          errorMessage: err.message,
        };
      }
      return {
        status: "failed",
        recordsAdded: added,
        recordsUpdated: updated,
        recordsDeleted: 0,
        errorClass: "ingest_failed",
        errorMessage: err instanceof Error ? err.message : "unknown",
      };
    }
  };
}

// ─── Register the 5 HubSpot pre-built syncs we consume ───────

for (const syncName of ["companies", "contacts", "deals", "owners", "pipelines"]) {
  registerNangoHandler({
    providerConfigKey: "hubspot",
    syncName,
    handler: makeHubspotHandler(syncName),
  });
}

// Test exports
export {
  normalizeCompany as _normalizeCompany,
  normalizeContact as _normalizeContact,
  normalizeDeal as _normalizeDeal,
  normalizeOwner as _normalizeOwner,
  normalizePipeline as _normalizePipeline,
  bucketEmployees as _bucketEmployees,
  bandArr as _bandArr,
};
