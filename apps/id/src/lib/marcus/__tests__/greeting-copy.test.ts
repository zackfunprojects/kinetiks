import { describe, expect, it } from "vitest";
import { buildFirstRunGreeting } from "../greeting-copy";

describe("buildFirstRunGreeting", () => {
  it("greets around the customer's company when the org layer knows it", () => {
    const greeting = buildFirstRunGreeting("Acme Robotics");
    expect(greeting).toContain("Acme Robotics");
    expect(greeting).toContain("go-to-market");
  });

  it("falls back to the generic line without a company", () => {
    expect(buildFirstRunGreeting(null)).toContain("I'm ready");
    expect(buildFirstRunGreeting("")).toContain("I'm ready");
    expect(buildFirstRunGreeting("   ")).toContain("I'm ready");
  });

  it("trims the company name", () => {
    expect(buildFirstRunGreeting("  Acme  ")).toContain("Acme's go-to-market");
  });

  it("never uses em dashes in customer copy", () => {
    expect(buildFirstRunGreeting("Acme")).not.toContain("—");
    expect(buildFirstRunGreeting(null)).not.toContain("—");
  });
});
