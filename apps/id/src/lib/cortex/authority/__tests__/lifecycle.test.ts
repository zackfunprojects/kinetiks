/**
 * Unit tests for the Cortex Authority lifecycle module
 * (apps/id/src/lib/cortex/authority/lifecycle.ts).
 *
 * Covers the four customer-driven transitions on `active` / `paused`
 * grants: pause, resume, narrow, revoke. Mirrors the stub-admin pattern
 * from apps/id/src/lib/approvals/__tests__/authority-grant.test.ts so
 * the two suites read consistently.
 *
 * The `_resetStateMachinesForTests` + `registerKinetiksStateMachines`
 * pair is required because the lifecycle handlers call
 * `assertTransition`; without the registry the very first call would
 * throw.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  _resetStateMachinesForTests,
  registerKinetiksStateMachines,
} from "@/lib/state-machines-init";
import { _resetRegistryForTests as _resetStateMachineRegistryForTests } from "@kinetiks/lib/state-machines";
import {
  _resetActionClassRegistryForTests,
  registerActionClass,
} from "@kinetiks/tools";
import { kinetiksIdActionClassDescriptors } from "@/lib/action-classes/seeds/kinetiks-id";

import {
  pauseGrant,
  resumeGrant,
  revokeGrant,
  narrowGrant,
} from "../lifecycle";

// ============================================================
// In-memory admin stub
// ============================================================

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
  expires_at: string | null;
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
      if (name === "propose_authority_grants") {
        const proposals = (payload as { p_proposals: Array<{ grant_id: string }> }).p_proposals;
        const data = proposals.map((p) => ({
          grant_id: p.grant_id,
          approval_id: `appr_${p.grant_id}`,
        }));
        return Promise.resolve({ data, error: null });
      }
      return Promise.resolve({
        data: null,
        error: { message: `unknown rpc ${name}` },
      });
    },
  };
  return { admin, grants, ledger, rpcCalls };
}

function makeGrantQuery(grants: Map<string, StubGrant>) {
  // Two query shapes supported:
  //   .select(...).eq(...).eq(...).maybeSingle()
  //   .update(...).eq(...).eq(...).{in|eq}(...).select(...).maybeSingle()
  //   .update(...).eq(...).eq(...).{in|eq}(...).select(...) (thenable)
  // .in("status", ["active","paused"]) is the revoke path's lookup.
  interface Pending {
    type: "select" | "update";
    updates: Partial<StubGrant>;
    filters: Array<{ col: keyof StubGrant; val: string }>;
    inFilter: { col: keyof StubGrant; vals: string[] } | null;
    matched: StubGrant | null;
  }
  const pending: Pending = {
    type: "select",
    updates: {},
    filters: [],
    inFilter: null,
    matched: null,
  };

  function evaluateMatch() {
    // Resolve a row when we have an .id filter; obey .eq() and .in()
    // filters that match the existing grants table shape.
    const idFilter = pending.filters.find((f) => f.col === "id");
    if (!idFilter) return;
    const row = grants.get(idFilter.val);
    if (!row) return;
    const passesEq = pending.filters.every((f) => row[f.col] === f.val);
    const passesIn =
      pending.inFilter === null ||
      pending.inFilter.vals.includes(
        (row as unknown as Record<string, unknown>)[pending.inFilter.col] as string,
      );
    if (!passesEq || !passesIn) return;
    if (pending.type === "select") {
      pending.matched = row;
    } else {
      const updated = { ...row, ...pending.updates };
      grants.set(idFilter.val, updated);
      pending.matched = updated;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select(_cols: string) {
      pending.type = pending.type === "update" ? "update" : "select";
      return chain;
    },
    update(u: Partial<StubGrant>) {
      pending.type = "update";
      pending.updates = u;
      return chain;
    },
    eq(col: keyof StubGrant, val: string) {
      pending.filters.push({ col, val });
      return chain;
    },
    in(col: keyof StubGrant, vals: string[]) {
      pending.inFilter = { col, vals };
      return chain;
    },
    maybeSingle() {
      evaluateMatch();
      if (pending.type === "select" && pending.matched) {
        return Promise.resolve({
          data: { ...pending.matched },
          error: null,
        });
      }
      return Promise.resolve({
        data: pending.matched ? { id: pending.matched.id } : null,
        error: null,
      });
    },
    then(
      resolve: (value: { error: null }) => unknown,
      _reject?: (reason: unknown) => unknown,
    ) {
      evaluateMatch();
      return Promise.resolve({ error: null }).then(resolve);
    },
  };
  return chain;
}

// ============================================================
// Test setup
// ============================================================

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "11111111-1111-1111-1111-111111111111";
const GRANT_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  _resetStateMachineRegistryForTests();
  _resetStateMachinesForTests();
  registerKinetiksStateMachines();

  // The Action Class Registry is required by narrowGrant's structural
  // validator. Reset + re-register so each test runs against the same
  // canonical pack.
  _resetActionClassRegistryForTests();
  for (const descriptor of kinetiksIdActionClassDescriptors) {
    registerActionClass(descriptor);
  }
});

afterEach(() => {
  _resetStateMachineRegistryForTests();
  _resetStateMachinesForTests();
  _resetActionClassRegistryForTests();
});

// ============================================================
// pauseGrant
// ============================================================

describe("pauseGrant", () => {
  it("transitions active → paused and writes authority_grant_paused", async () => {
    const { admin, grants, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);

    await pauseGrant(admin as never, {
      account_id: ACCOUNT_ID,
      user_id: USER_ID,
      grant_id: GRANT_ID,
      reason: "winding down for the holiday",
    });

    expect(grants.get(GRANT_ID)!.status).toBe("paused");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      event_type: "authority_grant_paused",
      grant_id: GRANT_ID,
    });
    expect((ledger[0].detail as Record<string, unknown>).pause_reason).toBe(
      "winding down for the holiday",
    );
  });

  it("throws when no active grant matches (e.g. already paused)", async () => {
    const { admin, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "paused",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);

    await expect(
      pauseGrant(admin as never, {
        account_id: ACCOUNT_ID,
        user_id: USER_ID,
        grant_id: GRANT_ID,
      }),
    ).rejects.toThrow(/no active grant matched for pause/);
    expect(ledger).toHaveLength(0);
  });
});

// ============================================================
// resumeGrant
// ============================================================

describe("resumeGrant", () => {
  it("transitions paused → active and writes authority_grant_resumed", async () => {
    const { admin, grants, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "paused",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);

    await resumeGrant(admin as never, {
      account_id: ACCOUNT_ID,
      user_id: USER_ID,
      grant_id: GRANT_ID,
      reason: "back from PTO",
    });

    expect(grants.get(GRANT_ID)!.status).toBe("active");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      event_type: "authority_grant_resumed",
      grant_id: GRANT_ID,
    });
    expect((ledger[0].detail as Record<string, unknown>).resume_reason).toBe(
      "back from PTO",
    );
  });

  it("throws when no paused grant matches", async () => {
    const { admin, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);
    await expect(
      resumeGrant(admin as never, {
        account_id: ACCOUNT_ID,
        user_id: USER_ID,
        grant_id: GRANT_ID,
      }),
    ).rejects.toThrow(/no paused grant matched for resume/);
    expect(ledger).toHaveLength(0);
  });
});

// ============================================================
// revokeGrant
// ============================================================

describe("revokeGrant", () => {
  it("transitions active → revoked and writes authority_grant_revoked", async () => {
    const { admin, grants, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);

    await revokeGrant(admin as never, {
      account_id: ACCOUNT_ID,
      user_id: USER_ID,
      grant_id: GRANT_ID,
      reason: "found a tighter shape we want to use",
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
      "found a tighter shape we want to use",
    );
  });

  it("transitions paused → revoked", async () => {
    const { admin, grants } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "paused",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);

    await revokeGrant(admin as never, {
      account_id: ACCOUNT_ID,
      user_id: USER_ID,
      grant_id: GRANT_ID,
      reason: "no longer needed",
    });

    expect(grants.get(GRANT_ID)!.status).toBe("revoked");
  });

  it("throws when grant is already terminal", async () => {
    const { admin } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "revoked",
        granted_at: new Date().toISOString(),
        revoked_at: new Date().toISOString(),
        revocation_reason: "customer_revoked",
        expires_at: null,
      },
    ]);

    await expect(
      revokeGrant(admin as never, {
        account_id: ACCOUNT_ID,
        user_id: USER_ID,
        grant_id: GRANT_ID,
        reason: "trying again",
      }),
    ).rejects.toThrow(/cannot revoke grant in status 'revoked'/);
  });

  it("throws when grant not found", async () => {
    const { admin } = makeAdmin([]);
    await expect(
      revokeGrant(admin as never, {
        account_id: ACCOUNT_ID,
        user_id: USER_ID,
        grant_id: GRANT_ID,
        reason: "lost grant",
      }),
    ).rejects.toThrow(/grant not found for revoke/);
  });
});

// ============================================================
// narrowGrant
// ============================================================

const VALID_SUCCESSOR_PAYLOAD = {
  scope_type: "standing" as const,
  scope_id: null,
  scope_description: "Narrowed standing Slack permission",
  parent_grant_id: null,
  granted_capabilities: [
    {
      action_class: "kinetiks_id.send_slack_notification",
      description: "Send to #acme-team only",
      constraints: {
        channels: ["acme-team"],
        users: ["U123"],
        max_message_length: 1000,
        threading_allowed: true,
      },
      rate_limit: { count: 5, window: "day" as const },
    },
  ],
  escalation_triggers: [],
  max_unapproved_spend_per_day: null,
  max_unapproved_spend_per_action: null,
  spending_currency: "USD" as const,
  expires_at: null,
};

describe("narrowGrant", () => {
  it("revokes original with customer_narrowed and proposes a successor via RPC", async () => {
    const { admin, grants, ledger, rpcCalls } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);

    const result = await narrowGrant(admin as never, {
      account_id: ACCOUNT_ID,
      user_id: USER_ID,
      grant_id: GRANT_ID,
      successor: VALID_SUCCESSOR_PAYLOAD,
      reason: "tightening the channel allowlist",
    });

    expect(result.successor_grant_id).toBeDefined();
    expect(result.successor_approval_id).toMatch(/^appr_/);

    // Original revoked with customer_narrowed.
    const original = grants.get(GRANT_ID)!;
    expect(original.status).toBe("revoked");
    expect(original.revocation_reason).toBe("customer_narrowed");

    // RPC fired with the successor payload.
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("propose_authority_grants");

    // Ledger: narrowed + revoked.
    const eventTypes = ledger.map((l) => l.event_type);
    expect(eventTypes).toContain("authority_grant_narrowed");
    expect(eventTypes).toContain("authority_grant_revoked");
    // changes_summary present on the narrowed entry.
    const narrowedEntry = ledger.find((l) => l.event_type === "authority_grant_narrowed");
    expect(
      (narrowedEntry!.detail as Record<string, unknown>).changes_summary,
    ).toEqual(expect.arrayContaining([expect.stringContaining("scope: standing")]));
  });

  it("forces parent_grant_id to null on the successor (edits run flat)", async () => {
    const { admin, rpcCalls } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);

    await narrowGrant(admin as never, {
      account_id: ACCOUNT_ID,
      user_id: USER_ID,
      grant_id: GRANT_ID,
      // Even when caller passes a parent_grant_id, it must be nulled.
      successor: {
        ...VALID_SUCCESSOR_PAYLOAD,
        parent_grant_id: "99999999-9999-9999-9999-999999999999",
      },
      reason: "tighter shape",
    });

    const rpcPayload = rpcCalls[0].payload as {
      p_proposals: Array<{ grant: { parent_grant_id: string | null } }>;
    };
    expect(rpcPayload.p_proposals[0].grant.parent_grant_id).toBeNull();
  });

  it("rejects a successor that fails structural validation", async () => {
    const { admin, ledger, rpcCalls } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);

    await expect(
      narrowGrant(admin as never, {
        account_id: ACCOUNT_ID,
        user_id: USER_ID,
        grant_id: GRANT_ID,
        // Forbidden phrase "Authority Grant" — validator must reject.
        successor: {
          ...VALID_SUCCESSOR_PAYLOAD,
          scope_description: "An Authority Grant for Slack",
        },
        reason: "tighter shape",
      }),
    ).rejects.toThrow(/failed structural validation/);

    // Nothing wrote: no RPC, no ledger entries, original still active.
    expect(rpcCalls).toHaveLength(0);
    expect(ledger).toHaveLength(0);
  });

  it("rejects a successor whose action_class is not registered", async () => {
    const { admin, rpcCalls } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);

    await expect(
      narrowGrant(admin as never, {
        account_id: ACCOUNT_ID,
        user_id: USER_ID,
        grant_id: GRANT_ID,
        successor: {
          ...VALID_SUCCESSOR_PAYLOAD,
          granted_capabilities: [
            {
              ...VALID_SUCCESSOR_PAYLOAD.granted_capabilities[0],
              action_class: "implosion.adjust_bid",
            },
          ],
        },
        reason: "trying to expand",
      }),
    ).rejects.toThrow(/unregistered action_class/);
    expect(rpcCalls).toHaveLength(0);
  });

  it("narrows a PAUSED grant — accepted because pause is reversible and narrow commits to a tighter shape", async () => {
    // Bug class: an earlier draft of narrowGrant used `.eq("status",
    // "active")` on the revoke UPDATE. Narrowing a paused grant would
    // insert the successor RPC and silently leave the original
    // untouched — orphan successor in the queue. This test pins the
    // contract that narrow accepts paused too.
    const { admin, grants, ledger, rpcCalls } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "paused",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);

    const result = await narrowGrant(admin as never, {
      account_id: ACCOUNT_ID,
      user_id: USER_ID,
      grant_id: GRANT_ID,
      successor: VALID_SUCCESSOR_PAYLOAD,
      reason: "tightening from paused state",
    });

    expect(result.successor_grant_id).toBeDefined();
    const original = grants.get(GRANT_ID)!;
    expect(original.status).toBe("revoked");
    expect(original.revocation_reason).toBe("customer_narrowed");
    expect(rpcCalls).toHaveLength(1);
    expect(ledger.map((l) => l.event_type)).toEqual(
      expect.arrayContaining([
        "authority_grant_narrowed",
        "authority_grant_revoked",
      ]),
    );
  });

  it("throws when narrowing a grant already in terminal status", async () => {
    const { admin, rpcCalls, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "revoked",
        granted_at: new Date(Date.now() - 60_000).toISOString(),
        revoked_at: new Date().toISOString(),
        revocation_reason: "customer_revoked",
        expires_at: null,
      },
    ]);

    await expect(
      narrowGrant(admin as never, {
        account_id: ACCOUNT_ID,
        user_id: USER_ID,
        grant_id: GRANT_ID,
        successor: VALID_SUCCESSOR_PAYLOAD,
        reason: "too late",
      }),
    ).rejects.toThrow(/cannot narrow grant in status 'revoked'/);

    // Nothing wrote: no RPC, no ledger entries.
    expect(rpcCalls).toHaveLength(0);
    expect(ledger).toHaveLength(0);
  });
});

// ============================================================
// Ledger actor capture — covers all four lifecycle transitions
// ============================================================

describe("ledger actor_user_id capture", () => {
  it("writes actor_user_id on the authority_grant_paused entry (active → paused)", async () => {
    const { admin, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);
    await pauseGrant(admin as never, {
      account_id: ACCOUNT_ID,
      user_id: USER_ID,
      grant_id: GRANT_ID,
    });
    const entry = ledger.find((l) => l.event_type === "authority_grant_paused");
    expect((entry!.detail as Record<string, unknown>).actor_user_id).toBe(
      USER_ID,
    );
  });

  it("writes actor_user_id on the authority_grant_resumed entry (paused → active)", async () => {
    const { admin, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "paused",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);
    await resumeGrant(admin as never, {
      account_id: ACCOUNT_ID,
      user_id: USER_ID,
      grant_id: GRANT_ID,
    });
    const entry = ledger.find((l) => l.event_type === "authority_grant_resumed");
    expect((entry!.detail as Record<string, unknown>).actor_user_id).toBe(
      USER_ID,
    );
  });

  it("writes actor_user_id on the authority_grant_revoked entry (active → revoked)", async () => {
    const { admin, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);
    await revokeGrant(admin as never, {
      account_id: ACCOUNT_ID,
      user_id: USER_ID,
      grant_id: GRANT_ID,
      reason: "no longer needed",
    });
    const entry = ledger.find((l) => l.event_type === "authority_grant_revoked");
    expect((entry!.detail as Record<string, unknown>).actor_user_id).toBe(
      USER_ID,
    );
  });

  it("writes actor_user_id on both authority_grant_narrowed and the revoke pair (narrow flow)", async () => {
    const { admin, ledger } = makeAdmin([
      {
        id: GRANT_ID,
        account_id: ACCOUNT_ID,
        status: "active",
        granted_at: new Date().toISOString(),
        revoked_at: null,
        revocation_reason: null,
        expires_at: null,
      },
    ]);
    await narrowGrant(admin as never, {
      account_id: ACCOUNT_ID,
      user_id: USER_ID,
      grant_id: GRANT_ID,
      successor: VALID_SUCCESSOR_PAYLOAD,
      reason: "tighter shape",
    });
    const narrowed = ledger.find((l) => l.event_type === "authority_grant_narrowed");
    const revoked = ledger.find((l) => l.event_type === "authority_grant_revoked");
    expect((narrowed!.detail as Record<string, unknown>).actor_user_id).toBe(
      USER_ID,
    );
    expect((revoked!.detail as Record<string, unknown>).actor_user_id).toBe(
      USER_ID,
    );
  });
});
