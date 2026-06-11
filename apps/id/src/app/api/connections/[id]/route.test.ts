import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));
vi.mock("@/lib/integrations/nango/client", () => ({
  deleteConnection: vi.fn(),
  triggerSync: vi.fn(),
}));

const { revokeSystemCredentialsMock } = vi.hoisted(() => ({
  revokeSystemCredentialsMock: vi.fn(),
}));
vi.mock("@/lib/connections/system-oauth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/connections/system-oauth")>();
  return { ...original, revokeSystemCredentials: revokeSystemCredentialsMock };
});

const { decryptCredentialsMock } = vi.hoisted(() => ({
  decryptCredentialsMock: vi.fn(),
}));
vi.mock("@/lib/connections/encryption", () => ({
  decryptCredentials: decryptCredentialsMock,
}));

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteConnection as nangoDeleteConnection } from "@/lib/integrations/nango/client";
import { DELETE } from "./route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockCreateAdmin = vi.mocked(createAdminClient);
const mockNangoDelete = vi.mocked(nangoDeleteConnection);

const CONN_ID = "0b6f9a3e-8f1c-4f4e-9d8a-2b7c6e5d4f3a";

function makeRequest(): Request {
  return new Request(`https://id.kinetiks.test/api/connections/${CONN_ID}`, {
    method: "DELETE",
  });
}

interface RowShape {
  id: string;
  account_id: string;
  provider: string;
  status: string;
  credentials: string | null;
  nango_connection_id: string | null;
  nango_provider_config_key: string | null;
  last_sync_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function makeRow(overrides: Partial<RowShape>): RowShape {
  return {
    id: CONN_ID,
    account_id: "acc-1",
    provider: "google_workspace",
    status: "active",
    credentials: "encrypted-blob",
    nango_connection_id: null,
    nango_provider_config_key: null,
    last_sync_at: null,
    metadata: {},
    created_at: "2026-06-10T00:00:00Z",
    ...overrides,
  };
}

function stubAdmin(row: RowShape) {
  const updates: Array<Record<string, unknown>> = [];
  const ledger: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    if (table === "kinetiks_ledger") {
      return {
        insert: vi.fn((entry: Record<string, unknown>) => {
          ledger.push(entry);
          return Promise.resolve({ error: null });
        }),
      };
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: row, error: null })),
          })),
        })),
      })),
      update: vi.fn((patch: Record<string, unknown>) => {
        updates.push(patch);
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }),
    };
  });
  mockCreateAdmin.mockReturnValue({ from } as never);
  return { updates, ledger };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    auth: { account_id: "acc-1" },
    error: null,
  } as never);
  decryptCredentialsMock.mockReturnValue({ refresh_token: "1//r" });
  revokeSystemCredentialsMock.mockResolvedValue("revoked");
});

describe("DELETE /api/connections/[id] — system connections (D1)", () => {
  it("revokes the provider grant, nulls the credentials, and flips the row", async () => {
    const base = makeRow({});
    const { updates, ledger } = stubAdmin({ ...base, provider: "google_workspace" });

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: CONN_ID }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ deleted: true, system_revoke_outcome: "revoked" });

    expect(decryptCredentialsMock).toHaveBeenCalledWith("encrypted-blob");
    expect(revokeSystemCredentialsMock).toHaveBeenCalledWith({
      provider: "google_workspace",
      credentials: { refresh_token: "1//r" },
    });
    expect(mockNangoDelete).not.toHaveBeenCalled();

    expect(updates).toHaveLength(1);
    const patch = updates[0]!;
    expect(patch.status).toBe("revoked");
    // Encrypted tokens do not outlive the connection.
    expect(patch.credentials).toBeNull();
    expect((patch.metadata as Record<string, unknown>).system_revoke_outcome).toBe("revoked");

    expect(ledger[0]).toMatchObject({
      event_type: "connection_revoked",
      detail: expect.objectContaining({
        method: "direct_oauth",
        system_revoke_outcome: "revoked",
      }),
    });
  });

  it("still revokes locally when the decrypt fails (rotated key)", async () => {
    decryptCredentialsMock.mockImplementation(() => {
      throw new Error("bad auth tag");
    });
    const base = makeRow({});
    const { updates } = stubAdmin({ ...base, provider: "slack" });

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: CONN_ID }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ deleted: true, system_revoke_outcome: "failed" });
    expect(updates[0]!.status).toBe("revoked");
    expect(updates[0]!.credentials).toBeNull();
  });

  it("leaves the Nango path untouched for data providers", async () => {
    const base = makeRow({});
    const { updates } = stubAdmin({
      ...base,
      provider: "ga4",
      credentials: null,
      nango_connection_id: "nango-1",
      nango_provider_config_key: "google-analytics",
    });
    mockNangoDelete.mockResolvedValue(undefined as never);

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: CONN_ID }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ deleted: true, nango_outcome: "deleted" });
    expect(revokeSystemCredentialsMock).not.toHaveBeenCalled();
    // Nango rows keep credentials untouched (they have none).
    expect("credentials" in updates[0]!).toBe(false);
  });
});
