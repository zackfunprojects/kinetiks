import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetStateMachinesForTests, registerKinetiksStateMachines } from "@/lib/state-machines-init";
import { _resetRegistryForTests } from "@kinetiks/lib/state-machines";

import {
  applyAuthorityGrantApprove,
  applyAuthorityGrantReject,
} from "../authority-grant";
import type { ApprovalRecord } from "../types";

interface StubLedger {
  account_id: string;
  event_type: string;
  source_app: string | null;
  source_operator: string | null;
  grant_id: string | null;
  detail: Record<string, unknown>;
}

interface StubGrant {
  id: string;
  account_id: string;
  status: "proposed" | "active" | "paused" | "revoked" | "expired";
  granted_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
}

function makeAdmin(initialGrants: StubGrant[]) {
  const grants = new Map<string, StubGrant>();
  for (const g of initialGrants) grants.set(g.id, { ...g });
  const ledger: StubLedger[] = [];
  const rpcCalls: Array<{ name: string; payload: unknown }> = [];

  const admin = {
    from(table: string) {
      if (table === "kinetiks_authority_grants") {
        return makeGrantQuery(grants);
      }
      if (table === "kinetiks_ledger") {
        return {
          insert(row: StubLedger) {
            ledger.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc(name: string, payload: unknown) {
      rpcCalls.push({ name, payload });
      // propose_authority_grants returns rows of {grant_id, approval_id}
      if (name === "propose_authority_grants") {
        const proposals = (payload as { p_proposals: Array<{ grant_id: string }> }).p_proposals;
        const data = proposals.map((p) => ({
          grant_id: p.grant_id,
          approval_id: `appr_${p.grant_id}`,
        }));
        return Promise.resolve({ data, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
    },
  };
  return { admin, grants, ledger, rpcCalls };
}

function makeGrantQuery(grants: Map<string, StubGrant>) {
  // A tiny chain that supports:
  //   .update({...}).eq(...).eq(...).eq(...).select("id").maybeSingle()
  //   .update({...}).eq(...).eq(...).eq(...)  (auto-executes on the 3rd .eq)
  interface Pending {
    type: "update";
    updates: Partial<StubGrant>;
    filters: Array<{ col: keyof StubGrant; val: string }>;
    matched: StubGrant | null;
  }
  const pending: Pending = {
    type: "update",
    updates: {},
    filters: [],
    matched: null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    update(u: Partial<StubGrant>) {
      pending.updates = u;
      return chain;
    },
    eq(col: keyof StubGrant, val: string) {
      pending.filters.push({ col, val });
      if (pending.filters.length >= 3) {
        const target = pending.filters.find((f) => f.col === "id");
        if (target) {
          const row = grants.get(target.val);
          if (row && pending.filters.every((f) => row[f.col] === f.val)) {
            const updated = { ...row, ...pending.updates };
            grants.set(target.val, updated);
            pending.matched = updated;
          }
        }
      }
      return chain;
    },
    select(_cols: string) {
      return chain;
    },
    maybeSingle() {
      return Promise.resolve({
        data: pending.matched ? { id: pending.matched.id } : null,
        error: null,
      });
    },
    // When the caller does not invoke .select().maybeSingle() — they
    // just await the chain after the third .eq — we need to resolve
    // to {error: null} like Supabase does for a fire-and-forget
    // update. Implement by making the chain thenable.
    then(
      resolve: (value: { error: null }) => unknown,
      _reject?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve({ error: null }).then(resolve);
    },
  };
  return chain;
}

function makeApproval(grant_id: string, account_id: string): ApprovalRecord {
  return {
    id: "approval-1",
    account_id,
    source_app: "kinetiks_id",
    source_operator: "authority_agent",
    action_category: "authority_grant_proposal",
    approval_type: "review",
    title: "Standing Slack permission",
    description: "Send Slack notifications to #general",
    preview: {
      type: "config_change",
      content: {},
      grant_id,
      grant: {
        scope_type: "standing",
        scope_id: null,
        scope_description: "Standing Slack permission",
        parent_grant_id: null,
        granted_capabilities: [
          {
            action_class: "kinetiks_id.send_slack_notification",
            description: "Send to #general",
            constraints: {
              channels: ["general"],
              max_message_length: 2000,
              threading_allowed: true,
            },
            rate_limit: { count: 20, window: "day" },
          },
        ],
        escalation_triggers: [],
        max_unapproved_spend_per_day: null,
        max_unapproved_spend_per_action: null,
        spending_currency: "USD",
        budget_category: null,
        expires_at: null,
      },
      reasoning: "First Slack permission for this account.",
      evidence: {
        patterns_referenced: [],
        similar_past_grants: [],
        ledger_summary: { proposals_last_90d: 0, approval_rate: 0, most_common_edit_type: null },
        identity_signals: [],
      },
    } as unknown as ApprovalRecord["preview"],
    deep_link: null,
    status: "pending",
    confidence_score: null,
    confidence_breakdown: null,
    auto_approved: false,
    user_edits: null,
    rejection_reason: null,
    rejection_classification: null,
    edit_classification: null,
    brand_gate_result: null,
    quality_gate_result: null,
    expires_at: null,
    created_at: new Date().toISOString(),
    acted_at: null,
  };
}

beforeEach(() => {
  _resetRegistryForTests();
  _resetStateMachinesForTests();
  registerKinetiksStateMachines();
});

afterEach(() => {
  _resetRegistryForTests();
  _resetStateMachinesForTests();
});

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const GRANT_ID = "22222222-2222-2222-2222-222222222222";

describe("applyAuthorityGrantApprove (no edits)", () => {
  it("transitions grant proposed→active and emits authority_grant_approved", async () => {
    const { admin, grants, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "proposed",
        granted_at: null,
        revoked_at: null,
        revocation_reason: null,
      },
    ]);
    const approval = makeApproval(GRANT_ID, ACCOUNT_ID);

    const result = await applyAuthorityGrantApprove(
      admin as never,
      approval,
      { edits: null },
    );

    expect(result.outcome).toBe("approved_as_proposed");
    expect(result.active_grant_id).toBe(GRANT_ID);
    const after = grants.get(GRANT_ID)!;
    expect(after.status).toBe("active");
    expect(after.granted_at).not.toBeNull();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      event_type: "authority_grant_approved",
      grant_id: GRANT_ID,
    });
  });

  it("rejects when no proposed row matches (stale or already-actioned approval)", async () => {
    // Stub returns an already-active grant. The matched-row check
    // (added in CR fix) requires status='proposed' for the UPDATE to
    // match; with no match, the handler throws rather than silently
    // emit a ledger entry for a non-transition.
    const { admin, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
      },
    ]);
    const approval = makeApproval(GRANT_ID, ACCOUNT_ID);
    await expect(
      applyAuthorityGrantApprove(admin as never, approval, { edits: null }),
    ).rejects.toThrow(/no proposed grant matched/);
    // No lifecycle ledger entry should have been emitted.
    expect(ledger.filter((l) => l.event_type === "authority_grant_approved")).toHaveLength(0);
  });
});

describe("applyAuthorityGrantReject", () => {
  it("transitions grant proposed→revoked and emits authority_grant_revoked", async () => {
    const { admin, grants, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "proposed",
        granted_at: null,
        revoked_at: null,
        revocation_reason: null,
      },
    ]);
    const approval = makeApproval(GRANT_ID, ACCOUNT_ID);

    await applyAuthorityGrantReject(admin as never, approval, {
      rejection_reason: "channels too wide; want a tighter allowlist",
    });

    const after = grants.get(GRANT_ID)!;
    expect(after.status).toBe("revoked");
    expect(after.revocation_reason).toBe("customer_revoked");
    expect(after.revoked_at).not.toBeNull();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      event_type: "authority_grant_revoked",
      grant_id: GRANT_ID,
    });
    expect((ledger[0].detail as Record<string, unknown>).customer_note).toBe(
      "channels too wide; want a tighter allowlist",
    );
  });
});

describe("applyAuthorityGrantApprove (with edits)", () => {
  it("revokes original with reason customer_edited and proposes a successor via RPC", async () => {
    const { admin, grants, ledger, rpcCalls } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "proposed",
        granted_at: null,
        revoked_at: null,
        revocation_reason: null,
      },
    ]);
    const approval = makeApproval(GRANT_ID, ACCOUNT_ID);

    const result = await applyAuthorityGrantApprove(admin as never, approval, {
      edits: {
        grant: {
          scope_type: "standing",
          scope_id: null,
          scope_description: "Tighter Slack permission",
          parent_grant_id: null,
          granted_capabilities: [
            {
              action_class: "kinetiks_id.send_slack_notification",
              description: "Send to #acme-team only",
              constraints: {
                channels: ["acme-team"],
                max_message_length: 1000,
                threading_allowed: true,
              },
              rate_limit: { count: 5, window: "day" },
            },
          ],
          escalation_triggers: [],
          max_unapproved_spend_per_day: null,
          max_unapproved_spend_per_action: null,
          spending_currency: "USD",
          budget_category: null,
          expires_at: null,
        },
      },
    });

    expect(result.outcome).toBe("approved_with_edits");
    expect(result.successor_grant_id).toBeDefined();
    expect(result.successor_approval_id).toMatch(/^appr_/);
    // Original revoked.
    const original = grants.get(GRANT_ID)!;
    expect(original.status).toBe("revoked");
    expect(original.revocation_reason).toBe("customer_edited");
    // RPC fired with the successor payload.
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("propose_authority_grants");
    // Ledger has narrowed + revoked entries.
    const eventTypes = ledger.map((l) => l.event_type);
    expect(eventTypes).toContain("authority_grant_narrowed");
    expect(eventTypes).toContain("authority_grant_revoked");
  });
});
