import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { platformAvailabilityResolvers } from "../availability";

const mockCreateAdmin = vi.mocked(createAdminClient);

function stubLookup(result: { data?: unknown; error?: unknown }) {
  const maybeSingle = vi.fn(async () => ({
    data: result.data ?? null,
    error: result.error ?? null,
  }));
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const neq = vi.fn(() => ({ order }));
  const eqProvider = vi.fn(() => ({ neq }));
  const eqAccount = vi.fn(() => ({ eq: eqProvider }));
  const select = vi.fn(() => ({ eq: eqAccount }));
  mockCreateAdmin.mockReturnValue({ from: vi.fn(() => ({ select })) } as never);
  return { neq, order, limit };
}

const ctx = { accountId: "acc-1", userId: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("platformAvailabilityResolvers.connection_required", () => {
  it("is true for an active connection", async () => {
    stubLookup({ data: { status: "active" } });
    await expect(
      platformAvailabilityResolvers.connection_required(ctx, "google_workspace"),
    ).resolves.toBe(true);
  });

  it("is false when no live row exists", async () => {
    stubLookup({ data: null });
    await expect(
      platformAvailabilityResolvers.connection_required(ctx, "calendar"),
    ).resolves.toBe(false);
  });

  it("is false for a non-active live row (error/pending)", async () => {
    stubLookup({ data: { status: "error" } });
    await expect(
      platformAvailabilityResolvers.connection_required(ctx, "slack"),
    ).resolves.toBe(false);
  });

  it("excludes revoked history from the read (regression: disconnect → reconnect)", async () => {
    // The query must filter revoked rows and bound itself to one row;
    // a bare maybeSingle() on (account, provider) errors with
    // "multiple rows" once history exists and the tool silently
    // vanishes from the manifest.
    const { neq, order, limit } = stubLookup({ data: { status: "active" } });
    await platformAvailabilityResolvers.connection_required(ctx, "google_workspace");
    expect(neq).toHaveBeenCalledWith("status", "revoked");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("fails closed on a query error", async () => {
    stubLookup({ error: { code: "PGRST000", message: "boom" } });
    await expect(
      platformAvailabilityResolvers.connection_required(ctx, "google_workspace"),
    ).resolves.toBe(false);
  });
});
