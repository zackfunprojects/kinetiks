import { describe, it, expect } from "vitest";
import {
  normalizeForFingerprint,
  similarity,
  classifySimilarity,
  findBestMatch,
} from "./quora";

describe("@kinetiks/deskof/fingerprint/quora", () => {
  describe("normalizeForFingerprint", () => {
    it("collapses whitespace, lowercases, and normalizes smart quotes/dashes", () => {
      const input = "  Hello\n\t World  \u2014 \u201Ctest\u201D \u2018ok\u2019  ";
      expect(normalizeForFingerprint(input)).toBe("hello world - \"test\" 'ok'");
    });

    it("normalizes ellipsis", () => {
      expect(normalizeForFingerprint("end\u2026 of line")).toBe(
        "end... of line"
      );
    });
  });

  describe("similarity", () => {
    it("returns 1.0 for identical strings after normalization", () => {
      expect(similarity("hello", "hello")).toBe(1);
      expect(similarity("Hello!", "  hello!  ")).toBe(1);
    });

    it("returns 0 for empty input", () => {
      expect(similarity("", "abc")).toBe(0);
      expect(similarity("abc", "")).toBe(0);
    });

    it("returns >= 0.75 for trivial edits (typo fixes, added punctuation)", () => {
      const original =
        "We launched our SaaS at $49/month and tripled the price after 30 customers";
      const edited =
        "We launched our SaaS at $49/month, and tripled the price after 30 customers.";
      expect(similarity(original, edited)).toBeGreaterThanOrEqual(0.75);
    });

    it("falls below 0.75 once a substantial edit is made", () => {
      const original = "the quick brown fox jumps over the lazy dog";
      const edited = "totally different sentence about something else";
      expect(similarity(original, edited)).toBeLessThan(0.5);
    });
  });

  describe("classifySimilarity", () => {
    it("matches the spec thresholds", () => {
      expect(classifySimilarity(1.0)).toBe("matched");
      expect(classifySimilarity(0.85)).toBe("matched");
      expect(classifySimilarity(0.75)).toBe("matched");
      expect(classifySimilarity(0.749)).toBe("ambiguous");
      expect(classifySimilarity(0.5)).toBe("ambiguous");
      expect(classifySimilarity(0.499)).toBe("unmatched");
      expect(classifySimilarity(0)).toBe("unmatched");
    });
  });

  describe("findBestMatch", () => {
    it("picks the highest-similarity candidate", () => {
      const ours = "We tripled our SaaS price after 30 customers";
      const candidates = [
        "I love ramen",
        "We tripled our SaaS price after thirty customers",
        "Marketing is hard",
      ];
      const result = findBestMatch(ours, candidates);
      expect(result.index).toBe(1);
      expect(result.match.status).toBe("matched");
    });

    it("returns unmatched on empty candidate list", () => {
      const result = findBestMatch("anything", []);
      expect(result.index).toBe(-1);
      expect(result.match.status).toBe("unmatched");
    });

    it("returns unmatched if every candidate is dissimilar", () => {
      const result = findBestMatch("hello world", ["foo", "bar", "baz"]);
      expect(result.match.status).toBe("unmatched");
    });
  });
});
