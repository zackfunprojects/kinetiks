import { describe, expect, it } from "vitest";
import { cosineSimilarity, vectorize } from "./vectorize";

describe("@kinetiks/deskof/lens/vectorize", () => {
  it("is deterministic", () => {
    const a = vectorize("Hello world this is a test of the vectorizer");
    const b = vectorize("Hello world this is a test of the vectorizer");
    expect(a.vector).toEqual(b.vector);
  });

  it("returns L2-normalized vectors so cosine == dot", () => {
    const v = vectorize("foo bar baz qux quux corge");
    const norm = Math.sqrt(v.vector.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("near-identical text scores high similarity", () => {
    const a = vectorize("postgres pgvector index strategy for similarity");
    const b = vectorize("postgres pgvector index strategy for similarity search");
    expect(cosineSimilarity(a.vector, b.vector)).toBeGreaterThan(0.6);
  });

  it("unrelated text scores low similarity", () => {
    const a = vectorize("react hooks useEffect dependency array");
    const b = vectorize("baseball world series pitching rotation strategy");
    expect(cosineSimilarity(a.vector, b.vector)).toBeLessThan(0.3);
  });

  it("returns top topic strings", () => {
    const v = vectorize("react react react hooks useEffect dependency");
    expect(v.topics.length).toBeGreaterThan(0);
    expect(v.topics).toContain("react");
  });

  it("handles empty content gracefully", () => {
    const v = vectorize("");
    expect(v.vector.every((x) => x === 0)).toBe(true);
    expect(v.topics).toEqual([]);
  });

  it("cosine of empty vectors is 0", () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });
});
