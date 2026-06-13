import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kinetiks/supabase", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@kinetiks/supabase";
import { rollUpUsageSummaries } from "../usage-summary-rollup";

const mockCreateAdmin = vi.mocked(createAdminClient);

interface StubOptions {
  grants: Array<{ id: string; granted_at: string }>;
  eventsByGrant: Record<
    string,
    Array<{ event_type: string; detail: Record<string, unknown> | null }>
  >;
}

function stubAdmin(options: StubOptions) {
  const updates: Array<{ grant_id: string; usage_summary: Record<string, unknown> }> = [];
  const grantFilters: Array<{ accounts?: string[] }> = [];

  const from = vi.fn((table: string) => {
    if (table === "kinetiks_authority_grants") {
      return {
        select: vi.fn(() => {
          const filter = {} as { accounts?: string[] };
          grantFilters.push(filter);
          const builder = {
            in: vi.fn((column: string, values: string[]) => {
              if (column === "account_id") filter.accounts = values;
              return builder;
            }),
            not: vi.fn(() => builder),
            then: (resolve: (v: unknown) => void) =>
              resolve({ data: options.grants, error: null }),
          };
          return builder;
        }),
        update: vi.fn((payload: { usage_summary: Record<string, unknown> }) => ({
          eq: vi.fn(async (_col: string, grantId: string) => {
            updates.push({ grant_id: grantId, usage_summary: payload.usage_summary });
            return { error: null };
          }),
        })),
      };
    }
    if (table === "kinetiks_ledger") {
      let grantId = "";
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((_col: string, value: string) => {
          grantId = value;
          return builder;
        }),
        in: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        then: (resolve: (v: unknown) => void) =>
          resolve({
            data: (options.eventsByGrant[grantId] ?? []).map((e) => ({
              grant_id: grantId,
              ...e,
            })),
            error: null,
          }),
      };
      return builder;
    }
    throw new Error(`unexpected table ${table}`);
  });

  mockCreateAdmin.mockReturnValue({ from } as never);
  return { updates, grantFilters };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rollUpUsageSummaries", () => {
  it("rolls action counts, escalations, and (E2) spend into usage_summary", async () => {
    const { updates } = stubAdmin({
      grants: [{ id: "g_1", granted_at: "2026-06-01T00:00:00Z" }],
      eventsByGrant: {
        g_1: [
          {
            event_type: "authority_action_taken",
            detail: { action_class: "kinetiks_id.send_slack_notification" },
          },
          {
            event_type: "authority_action_taken",
            detail: {
              action_class: "kinetiks_id.fixture_spend",
              spend_amount: 12.5,
            },
          },
          {
            event_type: "authority_action_taken",
            detail: {
              action_class: "kinetiks_id.fixture_spend",
              spend_amount: 7.25,
            },
          },
          { event_type: "authority_action_escalated", detail: { reason_code: "rate_limited" } },
        ],
      },
    });

    const result = await rollUpUsageSummaries();
    expect(result).toEqual({ grants_updated: 1, events_rolled: 4, errors: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0].usage_summary).toMatchObject({
      action_counts: {
        "kinetiks_id.send_slack_notification": 1,
        "kinetiks_id.fixture_spend": 2,
      },
      total_spend_under_grant: 19.75,
      escalations_triggered: 1,
    });
    expect(typeof updates[0].usage_summary.computed_at).toBe("string");
  });

  it("scopes the grant fetch to the batch's accounts when provided", async () => {
    const { grantFilters } = stubAdmin({ grants: [], eventsByGrant: {} });
    await rollUpUsageSummaries({ account_ids: ["acc_1", "acc_2"] });
    expect(grantFilters[0].accounts).toEqual(["acc_1", "acc_2"]);
  });

  it("treats an explicitly empty account scope as no-op, never a global rollup", async () => {
    // A batch whose metadata yielded [] must NOT fall through to an
    // unfiltered (cross-account) rollup.
    const { updates, grantFilters } = stubAdmin({ grants: [], eventsByGrant: {} });
    const result = await rollUpUsageSummaries({ account_ids: [] });
    expect(result).toEqual({ grants_updated: 0, events_rolled: 0, errors: 0 });
    // The grants query was never built — no scan, no writes.
    expect(grantFilters).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("ignores malformed spend values rather than corrupting the total", async () => {
    const { updates } = stubAdmin({
      grants: [{ id: "g_1", granted_at: "2026-06-01T00:00:00Z" }],
      eventsByGrant: {
        g_1: [
          {
            event_type: "authority_action_taken",
            detail: { action_class: "x", spend_amount: "12.50" },
          },
          {
            event_type: "authority_action_taken",
            detail: { action_class: "x", spend_amount: Number.NaN },
          },
          {
            event_type: "authority_action_taken",
            detail: { action_class: "x", spend_amount: 5 },
          },
        ],
      },
    });
    await rollUpUsageSummaries();
    expect(updates[0].usage_summary).toMatchObject({ total_spend_under_grant: 5 });
  });
});
