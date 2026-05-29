import { describe, expect, it, vi } from "vitest";

import type { KineticsAppManifest } from "@kinetiks/types";

import { runDefaultsDiff } from "../defaults-diff";

/**
 * Diff loop tests per the Kinetiks Contract Addendum §2.6.
 *
 * The diff loop fans across three signals per (account, app, key):
 *   - covered_keys: any non-terminal grant tagged with the key
 *   - cooldown_keys: ledger entries (rejected or skipped) within the
 *     30-day window
 *   - prior_outside_window: most-recent rejected/skipped entry of any
 *     age (drives the authority_default_re_proposed annotation)
 *
 * The mocked SupabaseClient below routes each .from()/.rpc() call to
 * the test fixture so we can assert the exact behavior at each
 * decision point.
 */

const TEST_MANIFEST: KineticsAppManifest = {
  app: "kinetiks_id",
  display: { name: "Kinetiks Core", tagline: "x", color: "#000" },
  default_standing_grants: [
    {
      key: "marcus_proactive_slack_notifications",
      description: "Slack default headline",
      granted_capabilities: [
        {
          action_class: "kinetiks_id.send_slack_notification",
          description: "Slack capability description",
          constraints: {
            channels: "any",
            users: "any",
            max_message_length: 4000,
            threading_allowed: true,
          },
          rate_limit: { count: 10, window: "day" },
        },
      ],
      escalation_triggers: [],
      expires_at: null,
    },
    {
      key: "marcus_email_drafts",
      description: "Email draft default headline",
      granted_capabilities: [
        {
          action_class: "kinetiks_id.draft_email",
          description: "Email draft capability description",
          constraints: {
            max_recipients: 10,
            max_body_chars: 8000,
            allowed_from_addresses: "any",
            attachments_allowed: false,
          },
          rate_limit: { count: 15, window: "day" },
        },
      ],
      escalation_triggers: [],
      expires_at: null,
    },
  ],
};

interface MockState {
  /** rows returned by SELECT default_origin_key FROM kinetiks_authority_grants */
  coveredKeys: string[];
  /** rows returned by SELECT event_type, detail, created_at FROM kinetiks_ledger gte cooldown */
  cooldownLedger: Array<{
    event_type: "authority_default_rejected" | "authority_default_skipped";
    detail: { default_origin_app?: string; default_origin_key?: string };
    created_at: string;
  }>;
  /** rows returned by the unbounded "most recent prior" query */
  priorLedger: Array<{
    event_type: "authority_default_rejected" | "authority_default_skipped";
    detail: { default_origin_app?: string; default_origin_key?: string };
    created_at: string;
  }>;
  /** rpc("propose_authority_grants") return shape */
  rpcRows: Array<{ grant_id: string; approval_id: string }>;
}

function makeAdmin(state: MockState) {
  const ledgerInserts: Array<Array<Record<string, unknown>>> = [];

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "kinetiks_authority_grants") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () =>
                  Promise.resolve({
                    data: state.coveredKeys.map((k) => ({ default_origin_key: k })),
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === "kinetiks_ledger") {
        return {
          select: () => ({
            eq: () => ({
              in: (_col: string, _vals: string[]) => ({
                gte: () =>
                  Promise.resolve({
                    data: state.cooldownLedger,
                    error: null,
                  }),
                order: () => ({
                  limit: () =>
                    Promise.resolve({
                      data: state.priorLedger,
                      error: null,
                    }),
                }),
              }),
            }),
          }),
          insert: (rows: Array<Record<string, unknown>>) => {
            ledgerInserts.push(rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
    rpc: vi.fn((name: string) => {
      if (name === "propose_authority_grants") {
        return Promise.resolve({ data: state.rpcRows, error: null });
      }
      throw new Error(`unexpected rpc: ${name}`);
    }),
  };
  return { admin: admin as unknown as Parameters<typeof runDefaultsDiff>[0]["admin"], ledgerInserts };
}

describe("runDefaultsDiff", () => {
  it("returns zeros when account has no defaults to consider", async () => {
    const { admin } = makeAdmin({
      coveredKeys: [],
      cooldownLedger: [],
      priorLedger: [],
      rpcRows: [],
    });
    const out = await runDefaultsDiff({
      admin,
      account_id: "acc-1",
      granted_by: "user-1",
      manifests: [
        { ...TEST_MANIFEST, default_standing_grants: [] },
      ],
    });
    expect(out).toEqual({
      proposals_created: 0,
      cooldown_skipped: 0,
      already_covered: 0,
    });
  });

  it("skips keys already covered by a non-terminal grant", async () => {
    const { admin } = makeAdmin({
      coveredKeys: ["marcus_proactive_slack_notifications", "marcus_email_drafts"],
      cooldownLedger: [],
      priorLedger: [],
      rpcRows: [],
    });
    const out = await runDefaultsDiff({
      admin,
      account_id: "acc-1",
      granted_by: "user-1",
      manifests: [TEST_MANIFEST],
    });
    expect(out.already_covered).toBe(2);
    expect(out.proposals_created).toBe(0);
    expect(out.cooldown_skipped).toBe(0);
  });

  it("skips keys within the 30-day rejection cooldown", async () => {
    const recentRejection = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { admin } = makeAdmin({
      coveredKeys: [],
      cooldownLedger: [
        {
          event_type: "authority_default_rejected",
          detail: {
            default_origin_app: "kinetiks_id",
            default_origin_key: "marcus_proactive_slack_notifications",
          },
          created_at: recentRejection,
        },
      ],
      priorLedger: [],
      rpcRows: [{ grant_id: "g-1", approval_id: "a-1" }],
    });
    const out = await runDefaultsDiff({
      admin,
      account_id: "acc-1",
      granted_by: "user-1",
      manifests: [TEST_MANIFEST],
    });
    // slack: cooldown → skipped. email: uncovered, no prior → proposed.
    expect(out.cooldown_skipped).toBe(1);
    expect(out.proposals_created).toBe(1);
    expect(out.already_covered).toBe(0);
  });

  it("proposes uncovered keys with no prior cooldown record", async () => {
    const { admin, ledgerInserts } = makeAdmin({
      coveredKeys: [],
      cooldownLedger: [],
      priorLedger: [],
      rpcRows: [{ grant_id: "g-new", approval_id: "a-new" }],
    });
    const out = await runDefaultsDiff({
      admin,
      account_id: "acc-1",
      granted_by: "user-1",
      manifests: [TEST_MANIFEST],
    });
    expect(out.proposals_created).toBe(2);
    expect(out.cooldown_skipped).toBe(0);
    expect(out.already_covered).toBe(0);

    // Two propose calls → two Ledger inserts (each just the
    // authority_grant_proposed row; no re_proposed annotation
    // because priorLedger is empty).
    expect(ledgerInserts).toHaveLength(2);
    for (const rows of ledgerInserts) {
      expect(rows).toHaveLength(1);
      expect(rows[0].event_type).toBe("authority_grant_proposed");
      expect(rows[0].source_operator).toBe("authority_defaults_diff_cron");
      const detail = rows[0].detail as Record<string, unknown>;
      expect(detail.source_label).toBe("default_manifest_diff");
      expect(detail.scope_type).toBe("standing");
    }
  });

  it("annotates a re-propose with authority_default_re_proposed when prior decision exists outside cooldown", async () => {
    // Cooldown window: 30 days. Place the prior rejection at day 45
    // (outside the cooldown window).
    const oldRejection = new Date(
      Date.now() - 45 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { admin, ledgerInserts } = makeAdmin({
      coveredKeys: [],
      cooldownLedger: [], // outside window so not in the cooldown query result
      priorLedger: [
        {
          event_type: "authority_default_rejected",
          detail: {
            default_origin_app: "kinetiks_id",
            default_origin_key: "marcus_proactive_slack_notifications",
          },
          created_at: oldRejection,
        },
      ],
      rpcRows: [{ grant_id: "g-repropose", approval_id: "a-repropose" }],
    });
    const out = await runDefaultsDiff({
      admin,
      account_id: "acc-1",
      granted_by: "user-1",
      manifests: [
        {
          ...TEST_MANIFEST,
          default_standing_grants: [
            TEST_MANIFEST.default_standing_grants![0],
          ],
        },
      ],
    });
    expect(out.proposals_created).toBe(1);
    expect(ledgerInserts).toHaveLength(1);
    const rows = ledgerInserts[0];
    expect(rows).toHaveLength(2);
    expect(rows[0].event_type).toBe("authority_grant_proposed");
    expect(rows[1].event_type).toBe("authority_default_re_proposed");
    const reproposeDetail = rows[1].detail as Record<string, unknown>;
    expect(reproposeDetail.prior_decision).toBe("rejected");
    expect(reproposeDetail.prior_rejection_at).toBe(oldRejection);
  });

  it("respects the override cooldown_days parameter", async () => {
    // Set cooldown to 1 day. A 5-day-old rejection should NOT block
    // a re-propose; it should annotate with re-proposed instead.
    const fiveDaysAgo = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { admin, ledgerInserts } = makeAdmin({
      coveredKeys: [],
      cooldownLedger: [], // 5 days ago is OUTSIDE a 1-day window
      priorLedger: [
        {
          event_type: "authority_default_skipped",
          detail: {
            default_origin_app: "kinetiks_id",
            default_origin_key: "marcus_email_drafts",
          },
          created_at: fiveDaysAgo,
        },
      ],
      rpcRows: [{ grant_id: "g-1day", approval_id: "a-1day" }],
    });
    const out = await runDefaultsDiff({
      admin,
      account_id: "acc-1",
      granted_by: "user-1",
      manifests: [
        {
          ...TEST_MANIFEST,
          default_standing_grants: [
            TEST_MANIFEST.default_standing_grants![1],
          ],
        },
      ],
      cooldown_days: 1,
    });
    expect(out.proposals_created).toBe(1);
    expect(ledgerInserts[0][1]?.event_type).toBe("authority_default_re_proposed");
    expect(
      (ledgerInserts[0][1]!.detail as Record<string, unknown>).prior_decision,
    ).toBe("skipped");
  });
});
