import { describe, expect, it } from "vitest";
import {
  friendlyToolStatusLabel,
  statusEvent,
  toolExecStatusEvent,
} from "../chat-status";

describe("statusEvent", () => {
  it("builds a typed status event without tool_name", () => {
    expect(statusEvent("intent", "Reading your question")).toEqual({
      type: "status",
      stage: "intent",
      label: "Reading your question",
    });
  });
});

describe("toolExecStatusEvent", () => {
  it("carries the tool name and its customer-facing label", () => {
    expect(toolExecStatusEvent("ga4_query")).toEqual({
      type: "status",
      stage: "tool_exec",
      label: "Checking GA4",
      tool_name: "ga4_query",
    });
  });
});

describe("friendlyToolStatusLabel", () => {
  it("maps known read tools to plain-language sources", () => {
    expect(friendlyToolStatusLabel("ga4_query")).toBe("Checking GA4");
    expect(friendlyToolStatusLabel("gsc_query")).toBe("Checking Search Console");
    expect(friendlyToolStatusLabel("stripe_query")).toBe("Checking Stripe");
    expect(friendlyToolStatusLabel("query_patterns")).toBe(
      "Checking your pattern library",
    );
  });

  it("never implies a consequential action ran", () => {
    // Consequential tools may queue for approval rather than execute;
    // the label must say "Preparing", not "Sending" or "Posting".
    expect(friendlyToolStatusLabel("draft_email")).toBe(
      "Preparing an email draft",
    );
    expect(friendlyToolStatusLabel("send_slack_notification")).toBe(
      "Preparing a Slack notification",
    );
    expect(friendlyToolStatusLabel("add_calendar_event")).toBe(
      "Preparing a calendar event",
    );
  });

  it("falls back to a humanized label for unknown tools", () => {
    expect(friendlyToolStatusLabel("shopify_query")).toBe("Checking shopify");
    expect(friendlyToolStatusLabel("ad_spend_query")).toBe("Checking ad spend");
  });
});
