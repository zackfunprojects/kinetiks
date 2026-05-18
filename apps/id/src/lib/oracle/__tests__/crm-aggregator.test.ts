/**
 * Tests for the CRM aggregator's pure snapshot computation.
 *
 * The DB-write side (writeCachedMetric calls) is covered by the
 * integration test in Slice 10 (Oracle runner end-to-end). Here we lock
 * down the math: open/won/created counts, win rate, avg close days.
 */

import { describe, expect, it } from "vitest";

import { computeSnapshot } from "../crm-aggregator";

const NOW = new Date("2026-05-17T12:00:00Z");
const TWENTY_EIGHT_DAYS_AGO = new Date(NOW.getTime() - 28 * 24 * 60 * 60 * 1000);
const NINETY_DAYS_AGO = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000);

function dealRow(deal: Record<string, unknown>) {
  return { data: deal, external_updated_at: null };
}

function contactRow(updatedAt: string) {
  return { data: { external_updated_at: updatedAt }, external_updated_at: updatedAt };
}

describe("computeSnapshot — empty inputs", () => {
  it("returns zeros and null derivatives when there are no deals or contacts", () => {
    const snap = computeSnapshot({
      deals: [],
      contacts: [],
      twentyEightDaysAgo: TWENTY_EIGHT_DAYS_AGO,
      ninetyDaysAgo: NINETY_DAYS_AGO,
      now: NOW,
    });
    expect(snap.hubspot_deals_open).toBe(0);
    expect(snap.hubspot_deal_value_open).toBe(0);
    expect(snap.hubspot_deals_won_28d).toBe(0);
    expect(snap.hubspot_deal_value_won_28d).toBe(0);
    expect(snap.hubspot_deals_created_28d).toBe(0);
    expect(snap.hubspot_contacts_created_28d).toBe(0);
    expect(snap.hubspot_avg_deal_close_days).toBeNull();
    expect(snap.hubspot_win_rate_28d).toBeNull();
  });
});

describe("computeSnapshot — open + won + created math", () => {
  const open1 = dealRow({
    amount: 5000,
    is_closed: false,
    is_won: false,
    created_at: "2026-05-01T00:00:00Z",
    closed_at: null,
  });
  const open2 = dealRow({
    amount: 12000,
    is_closed: false,
    is_won: false,
    created_at: "2026-05-15T00:00:00Z",
    closed_at: null,
  });
  // Won within 28 days
  const won1 = dealRow({
    amount: 8000,
    is_closed: true,
    is_won: true,
    created_at: "2026-04-25T00:00:00Z",
    closed_at: "2026-05-10T00:00:00Z",
  });
  // Lost within 28 days
  const lost1 = dealRow({
    amount: 3000,
    is_closed: true,
    is_won: false,
    created_at: "2026-04-25T00:00:00Z",
    closed_at: "2026-05-05T00:00:00Z",
  });
  // Old won deal (>28d but within 90d) — counts toward avg close, not 28d window
  const oldWon = dealRow({
    amount: 20000,
    is_closed: true,
    is_won: true,
    created_at: "2026-03-01T00:00:00Z",
    closed_at: "2026-03-30T00:00:00Z",
  });

  it("counts open deals + sums open pipeline value", () => {
    const snap = computeSnapshot({
      deals: [open1, open2, won1, lost1, oldWon],
      contacts: [],
      twentyEightDaysAgo: TWENTY_EIGHT_DAYS_AGO,
      ninetyDaysAgo: NINETY_DAYS_AGO,
      now: NOW,
    });
    expect(snap.hubspot_deals_open).toBe(2);
    expect(snap.hubspot_deal_value_open).toBe(17000);
  });

  it("counts won deals in last 28d + their revenue", () => {
    const snap = computeSnapshot({
      deals: [open1, won1, lost1, oldWon],
      contacts: [],
      twentyEightDaysAgo: TWENTY_EIGHT_DAYS_AGO,
      ninetyDaysAgo: NINETY_DAYS_AGO,
      now: NOW,
    });
    expect(snap.hubspot_deals_won_28d).toBe(1);
    expect(snap.hubspot_deal_value_won_28d).toBe(8000);
  });

  it("computes win rate over deals CLOSED in last 28d", () => {
    const snap = computeSnapshot({
      deals: [won1, lost1, oldWon],
      contacts: [],
      twentyEightDaysAgo: TWENTY_EIGHT_DAYS_AGO,
      ninetyDaysAgo: NINETY_DAYS_AGO,
      now: NOW,
    });
    // Closed in 28d: won1 + lost1 = 2. Won = 1 → 50%.
    expect(snap.hubspot_win_rate_28d).toBe(50);
  });

  it("avg deal close days uses all won deals in last 90d (not just 28d)", () => {
    const snap = computeSnapshot({
      deals: [won1, oldWon],
      contacts: [],
      twentyEightDaysAgo: TWENTY_EIGHT_DAYS_AGO,
      ninetyDaysAgo: NINETY_DAYS_AGO,
      now: NOW,
    });
    // won1: 2026-04-25 → 2026-05-10 = 15 days
    // oldWon: 2026-03-01 → 2026-03-30 = 29 days
    // Mean: 22 days
    expect(snap.hubspot_avg_deal_close_days).toBe(22);
  });

  it("counts deals created in last 28d", () => {
    const snap = computeSnapshot({
      deals: [open1, open2, won1, oldWon],
      contacts: [],
      twentyEightDaysAgo: TWENTY_EIGHT_DAYS_AGO,
      ninetyDaysAgo: NINETY_DAYS_AGO,
      now: NOW,
    });
    // open1 (2026-05-01), open2 (2026-05-15), won1 (2026-04-25) → all within 28d
    // oldWon (2026-03-01) → outside
    expect(snap.hubspot_deals_created_28d).toBe(3);
  });

  it("counts contacts created in last 28d via external_updated_at fallback", () => {
    const snap = computeSnapshot({
      deals: [],
      contacts: [
        contactRow("2026-05-10T00:00:00Z"),
        contactRow("2026-05-01T00:00:00Z"),
        contactRow("2026-04-01T00:00:00Z"), // outside
      ],
      twentyEightDaysAgo: TWENTY_EIGHT_DAYS_AGO,
      ninetyDaysAgo: NINETY_DAYS_AGO,
      now: NOW,
    });
    expect(snap.hubspot_contacts_created_28d).toBe(2);
  });
});

describe("computeSnapshot — defensive", () => {
  it("tolerates malformed deal rows (missing fields, non-string dates)", () => {
    const snap = computeSnapshot({
      deals: [
        { data: null, external_updated_at: null },
        { data: { amount: "not-a-number" }, external_updated_at: null },
        { data: { is_closed: true, is_won: true, closed_at: "garbage" }, external_updated_at: null },
      ],
      contacts: [],
      twentyEightDaysAgo: TWENTY_EIGHT_DAYS_AGO,
      ninetyDaysAgo: NINETY_DAYS_AGO,
      now: NOW,
    });
    expect(snap.hubspot_deals_open).toBe(1); // amount=null is_closed=false default
    expect(snap.hubspot_deal_value_open).toBe(0);
    expect(snap.hubspot_deals_won_28d).toBe(0); // closed_at didn't parse
  });
});
