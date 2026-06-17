import { describe, it, expect } from "vitest";
import { buildEmbedSrc } from "./embed-src";

describe("buildEmbedSrc", () => {
  it("includes mode + account always, app/entity/thread when present", () => {
    const src = buildEmbedSrc({
      app: "hv",
      entity: "seq_1",
      mode: "collaborative",
      threadId: "thr_9",
      accountId: "acct_1",
    });
    const params = new URLSearchParams(src.split("?")[1]);
    expect(src.startsWith("/embed?")).toBe(true);
    expect(params.get("mode")).toBe("collaborative");
    expect(params.get("account")).toBe("acct_1");
    expect(params.get("app")).toBe("hv");
    expect(params.get("entity")).toBe("seq_1");
    expect(params.get("thread")).toBe("thr_9");
  });

  it("omits entity + thread when absent", () => {
    const src = buildEmbedSrc({ app: "dm", mode: "collaborative", accountId: "acct_1" });
    const params = new URLSearchParams(src.split("?")[1]);
    expect(params.has("entity")).toBe(false);
    expect(params.has("thread")).toBe(false);
    expect(params.get("app")).toBe("dm");
  });

  it("encodes values safely", () => {
    const src = buildEmbedSrc({ app: "hv", entity: "a b&c", mode: "collaborative", accountId: "x/y" });
    const params = new URLSearchParams(src.split("?")[1]);
    expect(params.get("entity")).toBe("a b&c");
    expect(params.get("account")).toBe("x/y");
  });
});
