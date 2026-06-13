import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "../admin";

const mockAdmin = vi.mocked(createAdminClient);

/** Stub kinetiks_admins lookup: `.maybeSingle()` resolves `result`. */
function stubAdminsLookup(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is"]) b[m] = () => b;
  b.maybeSingle = async () => result;
  mockAdmin.mockReturnValue({ from: () => b } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("isAdmin", () => {
  it("returns ok + role for an active admin", async () => {
    stubAdminsLookup({ data: { role: "superuser" }, error: null });
    await expect(isAdmin("u1")).resolves.toEqual({ ok: true, role: "superuser" });
  });

  it("returns not-ok for a non-admin (no row)", async () => {
    stubAdminsLookup({ data: null, error: null });
    await expect(isAdmin("u2")).resolves.toEqual({ ok: false });
  });

  it("returns not-ok on a read error (fail closed)", async () => {
    stubAdminsLookup({ data: null, error: { message: "db down" } });
    await expect(isAdmin("u3")).resolves.toEqual({ ok: false });
  });

  it("rejects an unrecognized role value", async () => {
    stubAdminsLookup({ data: { role: "intern" }, error: null });
    await expect(isAdmin("u4")).resolves.toEqual({ ok: false });
  });
});
