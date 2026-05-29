import { describe, expect, it, vi } from "vitest";

import { handleNangoAuthEvent } from "../handlers/auth";
import type { NangoAuthWebhook } from "../types";

// ── Mock the triggerSync side-effect so tests don't hit Nango ──
vi.mock("../client", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    triggerSync: vi.fn().mockResolvedValue(undefined),
  };
});

const TEST_ACCOUNT_ID = "11111111-2222-3333-4444-555555555555";
const TEST_NANGO_CONN_ID = "nango_conn_abc123";

function makeWebhook(overrides: Partial<NangoAuthWebhook> = {}): NangoAuthWebhook {
  return {
    type: "auth",
    operation: "creation",
    success: true,
    connectionId: TEST_NANGO_CONN_ID,
    providerConfigKey: "twitter",
    endUser: { endUserId: `kt_${TEST_ACCOUNT_ID}` },
    ...overrides,
  } as NangoAuthWebhook;
}

interface MockAdminCalls {
  upserts: Array<{ table: string; rows: Record<string, unknown> }>;
  updates: Array<{ table: string; patch: Record<string, unknown>; matchers: Array<[string, unknown]> }>;
  inserts: Array<{ table: string; rows: Record<string, unknown> }>;
}

function makeAdmin(opts: { upsertId?: string; updateId?: string | null } = {}) {
  const calls: MockAdminCalls = { upserts: [], updates: [], inserts: [] };
  const admin = {
    from: vi.fn((table: string) => {
      return {
        upsert: (rows: Record<string, unknown>) => {
          calls.upserts.push({ table, rows });
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: opts.upsertId ?? "row-1" },
                  error: null,
                }),
            }),
          };
        },
        update: (patch: Record<string, unknown>) => {
          const matchers: Array<[string, unknown]> = [];
          const builder = {
            eq: (col: string, val: unknown) => {
              matchers.push([col, val]);
              return builder;
            },
            neq: (col: string, val: unknown) => {
              matchers.push([`!${col}`, val]);
              return builder;
            },
            select: () => ({
              maybeSingle: () => {
                calls.updates.push({ table, patch, matchers });
                if (opts.updateId === null) {
                  return Promise.resolve({ data: null, error: null });
                }
                return Promise.resolve({
                  data: { id: opts.updateId ?? "row-1" },
                  error: null,
                });
              },
            }),
          };
          return builder;
        },
        insert: (rows: Record<string, unknown>) => {
          calls.inserts.push({ table, rows });
          return Promise.resolve({ error: null });
        },
      };
    }),
  };
  return { admin: admin as unknown as Parameters<typeof handleNangoAuthEvent>[0]["admin"], calls };
}

describe("handleNangoAuthEvent", () => {
  describe("operation=refresh", () => {
    it("returns refreshed with no DB writes", async () => {
      const { admin, calls } = makeAdmin();
      const result = await handleNangoAuthEvent({
        admin,
        webhook: makeWebhook({ operation: "refresh" }),
        arrivedAt: new Date(),
      });
      expect(result.outcome).toBe("refreshed");
      expect(calls.upserts).toHaveLength(0);
      expect(calls.inserts).toHaveLength(0);
    });
  });

  describe("operation=creation", () => {
    it("upserts the connection row and emits a connection_created ledger entry", async () => {
      const { admin, calls } = makeAdmin({ upsertId: "conn-1" });
      const result = await handleNangoAuthEvent({
        admin,
        webhook: makeWebhook({ operation: "creation", providerConfigKey: "twitter" }),
        arrivedAt: new Date(),
      });
      expect(result.outcome).toBe("created");
      expect(result.account_id).toBe(TEST_ACCOUNT_ID);
      expect(result.connection_id).toBe("conn-1");
      expect(calls.upserts).toHaveLength(1);
      expect(calls.upserts[0].table).toBe("kinetiks_connections");
      const row = calls.upserts[0].rows as Record<string, unknown>;
      expect(row.account_id).toBe(TEST_ACCOUNT_ID);
      expect(row.provider).toBe("twitter");
      expect(row.status).toBe("active");
      expect(row.nango_connection_id).toBe(TEST_NANGO_CONN_ID);
      expect(row.credentials).toBe(null);
      expect(calls.inserts).toHaveLength(1);
      expect(calls.inserts[0].table).toBe("kinetiks_ledger");
      expect(
        (calls.inserts[0].rows as Record<string, unknown>).event_type,
      ).toBe("connection_created");
    });

    it("ignores creation when success=false", async () => {
      const { admin, calls } = makeAdmin();
      const result = await handleNangoAuthEvent({
        admin,
        webhook: makeWebhook({ operation: "creation", success: false, failureReason: "OAuth declined" }),
        arrivedAt: new Date(),
      });
      expect(result.outcome).toBe("failed");
      expect(result.reason).toContain("OAuth declined");
      expect(calls.upserts).toHaveLength(0);
    });
  });

  describe("operation=deletion", () => {
    it("flips the row to revoked and emits connection_revoked", async () => {
      const { admin, calls } = makeAdmin({ updateId: "conn-1" });
      const result = await handleNangoAuthEvent({
        admin,
        webhook: makeWebhook({ operation: "deletion" }),
        arrivedAt: new Date(),
      });
      expect(result.outcome).toBe("revoked");
      expect(calls.updates).toHaveLength(1);
      expect(calls.updates[0].patch.status).toBe("revoked");
      expect(calls.inserts).toHaveLength(1);
      expect(
        (calls.inserts[0].rows as Record<string, unknown>).event_type,
      ).toBe("connection_revoked");
    });

    it("returns ignored when no active row matches (idempotent)", async () => {
      const { admin, calls } = makeAdmin({ updateId: null });
      const result = await handleNangoAuthEvent({
        admin,
        webhook: makeWebhook({ operation: "deletion" }),
        arrivedAt: new Date(),
      });
      expect(result.outcome).toBe("ignored");
      expect(calls.inserts).toHaveLength(0);
    });

    it("classifies auth_expired in the failure reason", async () => {
      const { admin, calls } = makeAdmin({ updateId: "conn-1" });
      await handleNangoAuthEvent({
        admin,
        webhook: makeWebhook({
          operation: "deletion",
          failureReason: "auth_expired: refresh failed",
        }),
        arrivedAt: new Date(),
      });
      const insertDetail = (calls.inserts[0].rows as Record<string, unknown>)
        .detail as Record<string, unknown>;
      expect(insertDetail.revocation_reason).toBe("auth_expired");
    });
  });

  describe("end_user.id parsing", () => {
    it("ignores webhooks whose end_user.id is missing", async () => {
      const { admin } = makeAdmin();
      const result = await handleNangoAuthEvent({
        admin,
        webhook: makeWebhook({ endUser: undefined }),
        arrivedAt: new Date(),
      });
      expect(result.outcome).toBe("ignored");
      expect(result.reason).toContain("unparseable");
    });

    it("ignores webhooks whose end_user.id is not a kt_<uuid>", async () => {
      const { admin } = makeAdmin();
      const result = await handleNangoAuthEvent({
        admin,
        webhook: makeWebhook({ endUser: { endUserId: "bogus_format" } }),
        arrivedAt: new Date(),
      });
      expect(result.outcome).toBe("ignored");
    });

    it("ignores webhooks for unknown Nango integrations", async () => {
      const { admin } = makeAdmin();
      const result = await handleNangoAuthEvent({
        admin,
        webhook: makeWebhook({ providerConfigKey: "definitely-not-real" }),
        arrivedAt: new Date(),
      });
      expect(result.outcome).toBe("ignored");
      expect(result.reason).toContain("unknown Nango integration");
    });
  });
});
