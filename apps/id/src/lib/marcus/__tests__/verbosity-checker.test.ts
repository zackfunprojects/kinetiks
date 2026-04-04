import { describe, it, expect } from "vitest";
import {
  countSentences,
  checkVerbosity,
} from "../validators/verbosity-checker";

describe("countSentences", () => {
  it("counts simple sentences", () => {
    const text =
      "First sentence here. Second sentence here. Third one too.";
    expect(countSentences(text)).toBe(3);
  });

  it("ignores code blocks", () => {
    const text =
      "Here is the answer to your question. ```const x = 1. const y = 2. return x + y.``` That covers the implementation details.";
    expect(countSentences(text)).toBe(2);
  });

  it("handles newline-separated sentences", () => {
    const text =
      "First sentence here.\nSecond sentence here.\nThird one too.";
    expect(countSentences(text)).toBe(3);
  });
});

describe("checkVerbosity", () => {
  it("passes a concise strategic response", () => {
    const response =
      "Your pipeline needs 9 qualified prospects weekly to hit 3 calls. Target seed founders who raised in the last 6 months. Filter for companies with no marketing hire yet. Lead with scarcity - two April spots remaining. Start prospecting now while we build automation.";
    const result = checkVerbosity(response, "strategic");
    expect(result.passed).toBe(true);
    expect(result.sentence_count).toBeLessThanOrEqual(8);
  });

  it("fails a verbose strategic response", () => {
    const sentences = Array.from(
      { length: 12 },
      (_, i) =>
        `This is sentence number ${i + 1} with enough words to count as a real sentence.`
    );
    const response = sentences.join(" ");
    const result = checkVerbosity(response, "strategic");
    expect(result.passed).toBe(false);
    expect(result.excess_sentences).toBeGreaterThan(0);
  });

  it("uses stricter limits for data queries", () => {
    const response =
      "Your reply rate is 14%. This is above the 8-12% cold outbound benchmark. Pipeline has 23 active prospects. Five are in late stage.";
    const result = checkVerbosity(response, "data_query");
    expect(result.passed).toBe(true);
    expect(result.max_allowed).toBe(4);
  });
});
