import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const { decryptCredentialsMock } = vi.hoisted(() => ({
  decryptCredentialsMock: vi.fn(),
}));
vi.mock("@/lib/connections/encryption", () => ({
  decryptCredentials: decryptCredentialsMock,
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSlackSendCredentials } from "../slack-credential-source";

const mockCreateAdmin = vi.mocked(createAdminClient);

interface StubOptions {
  connection?: { credentials: string | null; status: string } | null;
  connectionError?: { message: string } | null;
  systemName?: string | null;
  accountMissing?: boolean;
}

function stubAdmin(options: StubOptions) {
  const from = vi.fn((table: string) => {
    if (table === "kinetiks_accounts") {
      const maybeSingle = vi.fn(async () => ({
        data: options.accountMissing ? null : { system_name: options.systemName ?? null },
        error: null,
      }));
      const eq = vi.fn(() => ({ maybeSingle }));
      return { select: vi.fn(() => ({ eq })) };
    }
    const maybeSingle = vi.fn(async () => ({
      data: options.connection ?? null,
      error: options.connectionError ?? null,
    }));
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const neq = vi.fn(() => ({ order }));
    const eqProvider = vi.fn(() => ({ neq }));
    const eqAccount = vi.fn(() => ({ eq: eqProvider }));
    return { select: vi.fn(() => ({ eq: eqAccount })) };
  });
  mockCreateAdmin.mockReturnValue({ from } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  decryptCredentialsMock.mockReturnValue({ bot_token: "xoxb-decrypted" });
});

describe("resolveSlackSendCredentials", () => {
  it("returns the decrypted bot token paired with the system name", async () => {
    stubAdmin({
      connection: { credentials: "encrypted-blob", status: "active" },
      systemName: "Kit",
    });

    await expect(resolveSlackSendCredentials("acc-1")).resolves.toEqual({
      bot_token: "xoxb-decrypted",
      post_as_name: "Kit",
    });
    expect(decryptCredentialsMock).toHaveBeenCalledWith("encrypted-blob");
  });

  it("falls back to Kinetiks when the system is unnamed (never the operator name)", async () => {
    stubAdmin({
      connection: { credentials: "blob", status: "active" },
      systemName: null,
    });
    await expect(resolveSlackSendCredentials("acc-1")).resolves.toMatchObject({
      post_as_name: "Kinetiks",
    });
  });

  it("returns null when there is no live connection", async () => {
    stubAdmin({ connection: null });
    await expect(resolveSlackSendCredentials("acc-1")).resolves.toBeNull();
    expect(decryptCredentialsMock).not.toHaveBeenCalled();
  });

  it("returns null for a non-active row or an empty credential blob", async () => {
    stubAdmin({ connection: { credentials: "blob", status: "error" } });
    await expect(resolveSlackSendCredentials("acc-1")).resolves.toBeNull();

    stubAdmin({ connection: { credentials: null, status: "active" } });
    await expect(resolveSlackSendCredentials("acc-1")).resolves.toBeNull();
  });

  it("throws when the account row is missing (CR: data integrity, not a silent fallback)", async () => {
    stubAdmin({
      connection: { credentials: "blob", status: "active" },
      accountMissing: true,
    });
    await expect(resolveSlackSendCredentials("acc-1")).rejects.toThrow("not found");
  });

  it("throws on infrastructure failures (read error, decrypt failure)", async () => {
    stubAdmin({ connectionError: { message: "db down" } });
    await expect(resolveSlackSendCredentials("acc-1")).rejects.toThrow(
      "slack connection read failed",
    );

    stubAdmin({ connection: { credentials: "blob", status: "active" } });
    decryptCredentialsMock.mockImplementation(() => {
      throw new Error("bad auth tag");
    });
    await expect(resolveSlackSendCredentials("acc-1")).rejects.toThrow("bad auth tag");
  });
});
