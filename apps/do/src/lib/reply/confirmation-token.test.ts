import { describe, it, expect, beforeEach } from "vitest";
import {
  hashReplyContent,
  issueConfirmationToken,
  consumeConfirmationToken,
  __testHelpers,
} from "./confirmation-token";

describe("confirmation-token", () => {
  beforeEach(() => {
    __testHelpers().clear();
  });

  it("hashes deterministically and ignores leading/trailing whitespace", () => {
    expect(hashReplyContent("hello world")).toBe(
      hashReplyContent("  hello world  ")
    );
    expect(hashReplyContent("hello world")).not.toBe(
      hashReplyContent("hello world!")
    );
  });

  it("issues unique tokens bound to user_id + opportunity_id + content", () => {
    const a = issueConfirmationToken({
      user_id: "u1",
      opportunity_id: "op1",
      content: "first reply",
    });
    const b = issueConfirmationToken({
      user_id: "u1",
      opportunity_id: "op1",
      content: "first reply",
    });
    expect(a.token).not.toBe(b.token);
    expect(a.expires_at).toBeGreaterThan(Date.now());
    expect(__testHelpers().size()).toBe(2);
  });

  it("consumes a token exactly once and binds to the matching user", () => {
    const issued = issueConfirmationToken({
      user_id: "u1",
      opportunity_id: "op1",
      content: "hello",
    });

    const wrongUser = consumeConfirmationToken({
      token: issued.token,
      user_id: "u2",
      content: "hello",
    });
    expect(wrongUser.ok).toBe(false);
    // The wrong-user attempt still consumes the token (single-use)
    expect(__testHelpers().size()).toBe(0);

    const replay = consumeConfirmationToken({
      token: issued.token,
      user_id: "u1",
      content: "hello",
    });
    expect(replay.ok).toBe(false);
  });

  it("rejects a token whose content has changed since issuance", () => {
    const issued = issueConfirmationToken({
      user_id: "u1",
      opportunity_id: "op1",
      content: "hello world",
    });

    const result = consumeConfirmationToken({
      token: issued.token,
      user_id: "u1",
      content: "hello world!", // edited
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/content changed/i);
    }
  });

  it("accepts a valid token exactly once and returns the bound opportunity_id", () => {
    const issued = issueConfirmationToken({
      user_id: "u1",
      opportunity_id: "op-42",
      content: "valid reply text",
    });

    const result = consumeConfirmationToken({
      token: issued.token,
      user_id: "u1",
      content: "valid reply text",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.opportunity_id).toBe("op-42");
    }
    // Single use — second consume fails
    const replay = consumeConfirmationToken({
      token: issued.token,
      user_id: "u1",
      content: "valid reply text",
    });
    expect(replay.ok).toBe(false);
  });

  it("normalizes whitespace before hashing so trivial edits are accepted", () => {
    // hashReplyContent trims, so leading/trailing whitespace edits
    // should NOT invalidate the token (the user often hits enter
    // before clicking Post)
    const issued = issueConfirmationToken({
      user_id: "u1",
      opportunity_id: "op1",
      content: "hello",
    });

    const result = consumeConfirmationToken({
      token: issued.token,
      user_id: "u1",
      content: "  hello  ",
    });

    expect(result.ok).toBe(true);
  });
});
