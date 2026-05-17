/**
 * Tests for the Nango handler registry + dispatcher.
 *
 * The barrel `handlers/index.ts` registers 6 stub handlers at module
 * load. We use `_resetNangoHandlerRegistryForTests()` to start each test
 * clean and verify the registration / dispatch contract in isolation.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  _resetNangoHandlerRegistryForTests,
  dispatchNangoSyncWebhook,
  getNangoHandler,
  listNangoHandlers,
  registerNangoHandler,
} from "../handlers";
import type {
  NangoHandlerContext,
  NangoHandlerFn,
  NangoSyncWebhook,
} from "../types";

function makeCtx(
  overrides: Partial<NangoSyncWebhook> = {}
): NangoHandlerContext {
  return {
    accountId: "acct-test",
    webhook: {
      type: "sync",
      connectionId: "conn-test",
      providerConfigKey: "google-analytics",
      syncName: "ga4-daily-metrics",
      success: true,
      ...overrides,
    } as NangoSyncWebhook,
    arrivedAt: new Date("2026-05-17T12:00:00Z"),
    payloadSha256: "deadbeef".repeat(8),
  };
}

const okHandler: NangoHandlerFn = async () => ({
  status: "succeeded",
  recordsAdded: 3,
  recordsUpdated: 1,
  recordsDeleted: 0,
});

beforeEach(() => {
  _resetNangoHandlerRegistryForTests();
});

describe("registry", () => {
  it("stores and resolves a registration", () => {
    registerNangoHandler({
      providerConfigKey: "google-analytics",
      syncName: "ga4-daily-metrics",
      handler: okHandler,
    });
    expect(getNangoHandler("google-analytics", "ga4-daily-metrics")).toBe(okHandler);
  });

  it("returns null for an unknown key", () => {
    expect(getNangoHandler("nope", "nada")).toBeNull();
  });

  it("is idempotent on duplicate registration (last wins) so hot reload doesn't crash boot", () => {
    const h2: NangoHandlerFn = async () => ({
      status: "skipped",
      recordsAdded: 0,
      recordsUpdated: 0,
      recordsDeleted: 0,
    });
    registerNangoHandler({
      providerConfigKey: "stripe",
      syncName: "stripe-charges",
      handler: okHandler,
    });
    registerNangoHandler({
      providerConfigKey: "stripe",
      syncName: "stripe-charges",
      handler: h2,
    });
    expect(getNangoHandler("stripe", "stripe-charges")).toBe(h2);
    // Only one entry in the registry for this key.
    expect(
      listNangoHandlers().filter(
        (r) => r.providerConfigKey === "stripe" && r.syncName === "stripe-charges"
      )
    ).toHaveLength(1);
  });

  it("listNangoHandlers reports every registered (provider, sync) pair", () => {
    registerNangoHandler({
      providerConfigKey: "hubspot",
      syncName: "deals",
      handler: okHandler,
    });
    registerNangoHandler({
      providerConfigKey: "hubspot",
      syncName: "contacts",
      handler: okHandler,
    });
    const all = listNangoHandlers();
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.syncName).sort()).toEqual(["contacts", "deals"]);
  });
});

describe("dispatchNangoSyncWebhook", () => {
  it("returns skipped/no_handler_registered when nothing matches", async () => {
    const result = await dispatchNangoSyncWebhook(makeCtx());
    expect(result.status).toBe("skipped");
    expect(result.errorClass).toBe("no_handler_registered");
  });

  it("runs the registered handler and returns its result", async () => {
    registerNangoHandler({
      providerConfigKey: "google-analytics",
      syncName: "ga4-daily-metrics",
      handler: okHandler,
    });
    const result = await dispatchNangoSyncWebhook(makeCtx());
    expect(result).toEqual({
      status: "succeeded",
      recordsAdded: 3,
      recordsUpdated: 1,
      recordsDeleted: 0,
    });
  });

  it("catches a throwing handler and surfaces failed/handler_threw", async () => {
    const boom: NangoHandlerFn = async () => {
      throw new Error("kaboom");
    };
    registerNangoHandler({
      providerConfigKey: "google-analytics",
      syncName: "ga4-daily-metrics",
      handler: boom,
    });
    const result = await dispatchNangoSyncWebhook(makeCtx());
    expect(result.status).toBe("failed");
    expect(result.errorClass).toBe("handler_threw");
    expect(result.errorMessage).toBe("kaboom");
  });

  it("dispatches by both providerConfigKey AND syncName (mismatched syncName falls through)", async () => {
    registerNangoHandler({
      providerConfigKey: "google-analytics",
      syncName: "ga4-daily-metrics",
      handler: okHandler,
    });
    const result = await dispatchNangoSyncWebhook(
      makeCtx({ syncName: "ga4-something-else" })
    );
    expect(result.status).toBe("skipped");
    expect(result.errorClass).toBe("no_handler_registered");
  });
});
