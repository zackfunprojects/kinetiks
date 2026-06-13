import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(async () => undefined),
  USER_SAFE: { GENERIC_ERROR: "Something went wrong. Try again in a moment." },
}));
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn(async () => undefined) }));
vi.mock("../model-assignment-reader", () => ({ refreshModelAssignments: refreshMock }));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyModelFlip,
  recordFlipRejection,
  overrideRoleModel,
  setRoleFrozen,
} from "../model-flip-apply";

const mockAdmin = vi.mocked(createAdminClient);

/** A per-table chainable stub: `.maybeSingle()` resolves `single`,
 *  awaiting a terminal `.eq()/.insert()` resolves `write`. */
function tableStub(opts: { single?: unknown; write?: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "update", "insert", "order", "limit", "gte", "neq"]) {
    b[m] = () => b;
  }
  b.maybeSingle = async () => opts.single ?? { data: null, error: null };
  b.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(opts.write ?? { error: null }).then(resolve);
  return b;
}

function stub(byTable: Record<string, { single?: unknown; write?: unknown }>) {
  const from = vi.fn((table: string) => tableStub(byTable[table] ?? {}));
  mockAdmin.mockReturnValue({ from } as never);
  return from;
}

const PROPOSAL = {
  id: "p1",
  role: "balanced",
  to_model: "claude-sonnet-4-7",
  family: "sonnet",
  released_at: "2026-06-01T00:00:00Z",
  status: "pending",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyModelFlip", () => {
  it("claims the proposal then updates the assignment + refreshes", async () => {
    stub({
      // read → pending; claim (.select('id')) → one row claimed.
      kinetiks_model_flip_proposals: { single: { data: PROPOSAL, error: null }, write: { data: [{ id: "p1" }], error: null } },
      kinetiks_model_assignments: { write: { error: null } },
    });
    const res = await applyModelFlip("p1", "admin-user-1");
    expect(res.ok).toBe(true);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("refuses when the proposal does not exist", async () => {
    stub({ kinetiks_model_flip_proposals: { single: { data: null, error: null } } });
    const res = await applyModelFlip("missing", "admin-user-1");
    expect(res).toMatchObject({ ok: false });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refuses a proposal that is no longer pending", async () => {
    stub({
      kinetiks_model_flip_proposals: { single: { data: { ...PROPOSAL, status: "approved" }, error: null } },
    });
    const res = await applyModelFlip("p1", "admin-user-1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already approved/);
  });

  it("aborts (no assignment touch) when a concurrent decision claims the proposal first", async () => {
    stub({
      // read → still pending, but the guarded claim returns zero rows.
      kinetiks_model_flip_proposals: { single: { data: PROPOSAL, error: null }, write: { data: [], error: null } },
      kinetiks_model_assignments: { write: { error: null } },
    });
    const res = await applyModelFlip("p1", "admin-user-1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/someone else/);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("returns a safe error (not raw DB text) and does not refresh on an assignment write failure", async () => {
    stub({
      kinetiks_model_flip_proposals: { single: { data: PROPOSAL, error: null }, write: { data: [{ id: "p1" }], error: null } },
      kinetiks_model_assignments: { write: { error: { message: "raw pg detail" } } },
    });
    const res = await applyModelFlip("p1", "admin-user-1");
    expect(res.ok).toBe(false);
    expect(res.error).not.toContain("raw pg detail");
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("recordFlipRejection", () => {
  it("marks the proposal rejected", async () => {
    stub({ kinetiks_model_flip_proposals: { write: { error: null } } });
    const res = await recordFlipRejection("p1", "too new");
    expect(res.ok).toBe(true);
  });
});

describe("overrideRoleModel", () => {
  it("rejects a family that does not match the role", async () => {
    stub({});
    const res = await overrideRoleModel("balanced", "claude-haiku-4-5", "haiku", "admin-user-1");
    expect(res.ok).toBe(false);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("applies a matching override and refreshes", async () => {
    stub({ kinetiks_model_assignments: { write: { error: null } } });
    const res = await overrideRoleModel("balanced", "claude-sonnet-4-9", "sonnet", "admin-user-1");
    expect(res.ok).toBe(true);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

describe("setRoleFrozen", () => {
  it("updates the frozen flag", async () => {
    stub({ kinetiks_model_assignments: { write: { error: null } } });
    const res = await setRoleFrozen("fast", true);
    expect(res.ok).toBe(true);
  });
});
