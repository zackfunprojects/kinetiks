import { describe, expect, it } from "vitest";
import type { MarcusThread, MarcusMessage } from "@kinetiks/types";
import { loadThreadView, type ThreadViewReader } from "./thread-view";

describe("loadThreadView", () => {
  it("denies a thread the account does not own and never reads its messages", async () => {
    let messagesRead = false;
    let threadsListed = false;
    const reader: ThreadViewReader = {
      isThreadOwned: async () => false,
      listThreads: async () => {
        threadsListed = true;
        return [];
      },
      listMessages: async () => {
        messagesRead = true;
        return [];
      },
    };

    const view = await loadThreadView(reader, "account-b", "victim-thread-id");

    // The bug this guards: a cross-tenant thread id must not yield messages.
    expect(view).toEqual({ owned: false });
    expect(messagesRead).toBe(false);
    expect(threadsListed).toBe(false);
  });

  it("loads threads and messages for an owned thread", async () => {
    const reader: ThreadViewReader = {
      isThreadOwned: async (accountId, threadId) =>
        accountId === "account-a" && threadId === "thread-1",
      listThreads: async () => [{ id: "thread-1" } as MarcusThread],
      listMessages: async () => [{ id: "message-1" } as MarcusMessage],
    };

    const view = await loadThreadView(reader, "account-a", "thread-1");

    expect(view.owned).toBe(true);
    if (view.owned) {
      expect(view.threads).toHaveLength(1);
      expect(view.messages).toEqual([{ id: "message-1" }]);
    }
  });

  it("passes the requesting account, not the thread id, to the ownership check", async () => {
    const seen: Array<{ accountId: string; threadId: string }> = [];
    const reader: ThreadViewReader = {
      isThreadOwned: async (accountId, threadId) => {
        seen.push({ accountId, threadId });
        return true;
      },
      listThreads: async () => [],
      listMessages: async () => [],
    };

    await loadThreadView(reader, "account-a", "thread-9");

    expect(seen).toEqual([{ accountId: "account-a", threadId: "thread-9" }]);
  });
});
