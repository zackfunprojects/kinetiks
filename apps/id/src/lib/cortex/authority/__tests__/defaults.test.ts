import { describe, expect, it, vi } from "vitest";

import type { DefaultStandingGrant } from "@kinetiks/types";

import {
  assertNoAuthorityGrantPhrase,
  buildAcceptDefaultProposal,
  buildProposeDefaultPayload,
  emitDefaultAcceptLedgerEntries,
  emitDefaultRejectedLedgerEntries,
  emitDefaultSkippedLedgerEntries,
} from "../defaults";

const baseDefault = (): DefaultStandingGrant => ({
  key: "test_key",
  description: "Plain-language headline for tests.",
  granted_capabilities: [
    {
      action_class: "kinetiks_id.send_slack_notification",
      description: "Send you Slack messages.",
      constraints: {
        channels: "any",
        users: "any",
        max_message_length: 1000,
        threading_allowed: true,
      },
      rate_limit: { count: 5, window: "day" },
    },
  ],
  escalation_triggers: [],
  expires_at: null,
});

describe("authority/defaults", () => {
  describe("assertNoAuthorityGrantPhrase", () => {
    it("passes for plain-language strings", () => {
      expect(() =>
        assertNoAuthorityGrantPhrase("Set up permissions easily.", "test"),
      ).not.toThrow();
    });

    it("throws on 'Authority Grant' case-insensitive", () => {
      expect(() =>
        assertNoAuthorityGrantPhrase("Set up your Authority Grant now.", "test"),
      ).toThrow(/banned phrase "Authority Grant"/);
      expect(() =>
        assertNoAuthorityGrantPhrase("AUTHORITY GRANT please", "test"),
      ).toThrow(/banned phrase "Authority Grant"/);
      expect(() =>
        assertNoAuthorityGrantPhrase("authority    grant", "test"),
      ).toThrow(/banned phrase "Authority Grant"/);
    });

    it("includes the context in the error", () => {
      expect(() =>
        assertNoAuthorityGrantPhrase("Authority Grant here.", "manifest.foo"),
      ).toThrow(/manifest\.foo/);
    });
  });

  describe("buildAcceptDefaultProposal", () => {
    it("shapes the manifest default into the RPC envelope", () => {
      const out = buildAcceptDefaultProposal({
        default: baseDefault(),
        app: "kinetiks_id",
      });
      expect(out.grant_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(out.default_origin_app).toBe("kinetiks_id");
      expect(out.default_origin_key).toBe("test_key");
      expect(out.grant.scope_description).toBe(
        "Plain-language headline for tests.",
      );
      expect(out.grant.granted_capabilities).toHaveLength(1);
      expect(out.grant.escalation_triggers).toEqual([]);
    });

    it("generates a fresh grant_id each call", () => {
      const a = buildAcceptDefaultProposal({ default: baseDefault(), app: "kinetiks_id" });
      const b = buildAcceptDefaultProposal({ default: baseDefault(), app: "kinetiks_id" });
      expect(a.grant_id).not.toBe(b.grant_id);
    });

    it("throws when description contains 'Authority Grant'", () => {
      expect(() =>
        buildAcceptDefaultProposal({
          default: { ...baseDefault(), description: "Set up the Authority Grant." },
          app: "kinetiks_id",
        }),
      ).toThrow(/banned phrase "Authority Grant"/);
    });

    it("throws when a capability description contains 'Authority Grant'", () => {
      const d = baseDefault();
      const bad = {
        ...d,
        granted_capabilities: [
          { ...d.granted_capabilities[0], description: "your Authority Grant here" },
        ],
      };
      expect(() =>
        buildAcceptDefaultProposal({ default: bad, app: "kinetiks_id" }),
      ).toThrow(/banned phrase "Authority Grant"/);
    });
  });

  describe("buildProposeDefaultPayload", () => {
    it("shapes the manifest default into the cron-propose envelope", () => {
      const out = buildProposeDefaultPayload({
        default: baseDefault(),
        app: "kinetiks_id",
        reasoning: "test reasoning",
      });
      expect(out.grant.scope_type).toBe("standing");
      expect(out.grant.scope_id).toBeNull();
      expect(out.grant.parent_grant_id).toBeNull();
      expect(out.grant.expires_at).toBeNull();
      expect(out.grant.max_unapproved_spend_per_day).toBeNull();
      expect(out.default_origin_app).toBe("kinetiks_id");
      expect(out.default_origin_key).toBe("test_key");
      expect(out.evidence.source_label).toBe("default_manifest_diff");
      expect(out.reasoning).toBe("test reasoning");
      expect(out.approval_title).toBe("Plain-language headline for tests.");
      expect(out.approval_description).toMatch(/1 permission:/);
    });

    it("produces a future-dated approval_expires_at (7 days)", () => {
      const before = Date.now();
      const out = buildProposeDefaultPayload({
        default: baseDefault(),
        app: "kinetiks_id",
        reasoning: "x",
      });
      const stamp = new Date(out.approval_expires_at).getTime();
      const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
      const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
      expect(stamp).toBeGreaterThan(before + sixDaysMs);
      expect(stamp).toBeLessThan(before + eightDaysMs);
    });
  });

  describe("emitDefaultAcceptLedgerEntries", () => {
    it("inserts two rows per grant (proposed + approved)", async () => {
      const insert = vi.fn().mockReturnValue({ error: null });
      const admin = {
        from: vi.fn().mockReturnValue({ insert }),
      };
      await emitDefaultAcceptLedgerEntries({
        admin: admin as unknown as Parameters<typeof emitDefaultAcceptLedgerEntries>[0]["admin"],
        account_id: "acc-1",
        invocation_id: "inv-1",
        grants: [
          {
            grant_id: "g1",
            default_origin_app: "kinetiks_id",
            default_origin_key: "k1",
            action_classes: ["kinetiks_id.send_slack_notification"],
          },
        ],
      });
      expect(admin.from).toHaveBeenCalledWith("kinetiks_ledger");
      const rows = insert.mock.calls[0][0] as Array<{ event_type: string; detail: Record<string, unknown> }>;
      expect(rows).toHaveLength(2);
      expect(rows[0].event_type).toBe("authority_grant_proposed");
      expect(rows[1].event_type).toBe("authority_grant_approved");
      expect(rows[0].detail.source_label).toBe("default_at_signup");
      expect(rows[1].detail.source_label).toBe("default_at_signup");
      expect(rows[1].detail.approval_id).toBeNull();
      expect(rows[0].detail.action_classes).toEqual([
        "kinetiks_id.send_slack_notification",
      ]);
    });

    it("no-ops on empty input", async () => {
      const insert = vi.fn();
      const admin = { from: vi.fn().mockReturnValue({ insert }) };
      await emitDefaultAcceptLedgerEntries({
        admin: admin as unknown as Parameters<typeof emitDefaultAcceptLedgerEntries>[0]["admin"],
        account_id: "acc",
        invocation_id: "inv",
        grants: [],
      });
      expect(insert).not.toHaveBeenCalled();
    });

    it("throws on ledger insert failure", async () => {
      const insert = vi.fn().mockReturnValue({ error: { message: "boom" } });
      const admin = { from: vi.fn().mockReturnValue({ insert }) };
      await expect(
        emitDefaultAcceptLedgerEntries({
          admin: admin as unknown as Parameters<typeof emitDefaultAcceptLedgerEntries>[0]["admin"],
          account_id: "acc",
          invocation_id: "inv",
          grants: [
            {
              grant_id: "g1",
              default_origin_app: "kinetiks_id",
              default_origin_key: "k1",
              action_classes: [],
            },
          ],
        }),
      ).rejects.toThrow(/boom/);
    });
  });

  describe("emitDefaultRejectedLedgerEntries", () => {
    it("inserts one row per rejected key", async () => {
      const insert = vi.fn().mockReturnValue({ error: null });
      const admin = { from: vi.fn().mockReturnValue({ insert }) };
      await emitDefaultRejectedLedgerEntries({
        admin: admin as unknown as Parameters<typeof emitDefaultRejectedLedgerEntries>[0]["admin"],
        account_id: "acc",
        app: "kinetiks_id",
        rejected_keys: ["k1", "k2"],
      });
      const rows = insert.mock.calls[0][0] as Array<{ event_type: string }>;
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.event_type === "authority_default_rejected")).toBe(true);
    });
  });

  describe("emitDefaultSkippedLedgerEntries", () => {
    it("inserts one row per skipped key", async () => {
      const insert = vi.fn().mockReturnValue({ error: null });
      const admin = { from: vi.fn().mockReturnValue({ insert }) };
      await emitDefaultSkippedLedgerEntries({
        admin: admin as unknown as Parameters<typeof emitDefaultSkippedLedgerEntries>[0]["admin"],
        account_id: "acc",
        app: "kinetiks_id",
        skipped_keys: ["k1"],
      });
      const rows = insert.mock.calls[0][0] as Array<{ event_type: string; detail: Record<string, unknown> }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].event_type).toBe("authority_default_skipped");
      expect(rows[0].detail.source_label).toBe("default_at_signup");
    });
  });
});
