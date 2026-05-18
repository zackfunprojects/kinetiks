/**
 * Tests for the HubSpot handler's pure normalizers.
 *
 * The handler's DB write path is covered by the integration test in
 * Slice 10 (analyze route end-to-end). Here we lock down:
 *   - normalizers map raw HubSpot fields to our PII-safe shape
 *   - bucket helpers classify deterministically
 *   - PII fields are hashed/stripped before they ever touch the data jsonb
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  _bandArr,
  _bucketEmployees,
  _normalizeCompany,
  _normalizeContact,
  _normalizeDeal,
  _normalizeOwner,
  _normalizePipeline,
} from "../handlers/hubspot";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

describe("HubSpot normalizers — PII guard", () => {
  it("normalizeContact hashes email + phone; never stores raw", () => {
    const result = _normalizeContact({
      id: "contact-1",
      email: "Buyer@Acme.Co",
      phone: "+1 (212) 555-3333",
      jobtitle: "Head of Ops",
      lifecyclestage: "opportunity",
      associatedcompanyid: "co-9",
      hubspot_owner_id: "owner-7",
      updatedAt: "2026-05-10T12:00:00Z",
    });
    expect(result.email_lower_hash).toBe(sha256("buyer@acme.co"));
    expect(result.phone_lower_hash).toBe(sha256("12125553333"));
    expect(result.domain).toBe("acme.co");
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("phone");
    expect(result.role_or_title).toBe("Head of Ops");
    expect(result.lifecycle_stage).toBe("opportunity");
    expect(result.company_id).toBe("co-9");
  });

  it("normalizeContact preserves null hashes for missing fields", () => {
    const result = _normalizeContact({
      id: "contact-2",
      email: "",
      phone: null,
    });
    expect(result.email_lower_hash).toBeNull();
    expect(result.phone_lower_hash).toBeNull();
    expect(result.domain).toBeNull();
  });

  it("normalizeCompany strips street + postal but keeps city/state/country/domain", () => {
    const result = _normalizeCompany({
      id: "co-1",
      name: "Acme Inc",
      domain: "https://acme.co/about?utm=test",
      website: null,
      industry: "Software",
      numberofemployees: 250,
      annualrevenue: 5_000_000,
      city: "Brooklyn",
      state: "NY",
      country: "US",
      street: "123 Main",
      postal_code: "11201",
    });
    expect(result.domain).toBe("acme.co");
    expect(result.city).toBe("Brooklyn");
    expect(result.state).toBe("NY");
    expect(result.country).toBe("US");
    expect(result).not.toHaveProperty("street");
    expect(result).not.toHaveProperty("postal_code");
    expect(result.size_bucket).toBe("mid");
    expect(result.arr_band).toBe("1-10m");
  });

  it("normalizeOwner hashes email; preserves id and updatedAt", () => {
    const result = _normalizeOwner({
      id: "owner-1",
      email: "RebeccaRep@Vendor.com",
      updatedAt: "2026-05-09T18:30:00Z",
    });
    expect(result.email_lower_hash).toBe(sha256("rebeccarep@vendor.com"));
    expect(result.external_id).toBe("owner-1");
    expect(result.external_updated_at).toBe("2026-05-09T18:30:00Z");
  });
});

describe("HubSpot deal classification", () => {
  it("normalizeDeal detects closedwon via dealstage suffix when is_won absent", () => {
    const result = _normalizeDeal({
      id: "deal-1",
      amount: "12500",
      deal_currency_code: "USD",
      pipeline: "default",
      dealstage: "closedwon",
      hubspot_owner_id: "owner-1",
      associatedcompanyid: "co-1",
      associatedcontactids: ["c-1", "c-2"],
      dealsource: "marketing-email",
      createdate: "2026-04-15T00:00:00Z",
      closedate: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
    });
    expect(result.is_closed).toBe(true);
    expect(result.is_won).toBe(true);
    expect(result.amount).toBe(12500);
    expect(result.contact_ids).toEqual(["c-1", "c-2"]);
    expect(result.closed_at).toBe("2026-05-01T00:00:00Z");
  });

  it("normalizeDeal honors is_closed=false on open deals", () => {
    const result = _normalizeDeal({
      id: "deal-2",
      amount: 8000,
      dealstage: "qualifiedtobuy",
      createdate: "2026-04-20T00:00:00Z",
    });
    expect(result.is_closed).toBe(false);
    expect(result.is_won).toBe(false);
    expect(result.closed_at).toBeNull();
  });

  it("normalizeDeal classifies closedlost as closed but not won", () => {
    const result = _normalizeDeal({
      id: "deal-3",
      dealstage: "closedlost",
      amount: 1000,
      closedate: "2026-04-29T00:00:00Z",
    });
    expect(result.is_closed).toBe(true);
    expect(result.is_won).toBe(false);
    expect(result.closed_at).toBe("2026-04-29T00:00:00Z");
  });
});

describe("Bucketing", () => {
  it("bucketEmployees buckets by headcount", () => {
    expect(_bucketEmployees(null)).toBeNull();
    expect(_bucketEmployees(5)).toBe("micro");
    expect(_bucketEmployees(25)).toBe("small");
    expect(_bucketEmployees(250)).toBe("mid");
    expect(_bucketEmployees(2500)).toBe("enterprise");
  });

  it("bandArr bands by annual revenue", () => {
    expect(_bandArr(null)).toBeNull();
    expect(_bandArr(0)).toBe("pre-revenue");
    expect(_bandArr(500_000)).toBe("0-1m");
    expect(_bandArr(5_000_000)).toBe("1-10m");
    expect(_bandArr(50_000_000)).toBe("10m+");
  });
});

describe("Pipeline normalization", () => {
  it("flattens stages with closed/won inference", () => {
    const result = _normalizePipeline({
      id: "default",
      label: "Sales Pipeline",
      stages: [
        { id: "appointmentscheduled", label: "Appt", metadata: { probability: 0.1 } },
        { id: "closedwon", label: "Won", metadata: { probability: 1.0 } },
        { id: "closedlost", label: "Lost", metadata: { probability: 0.0 } },
      ],
    });
    expect(result.external_id).toBe("default");
    expect(result.stages).toHaveLength(3);
    expect(result.stages[1]!.is_won).toBe(true);
    expect(result.stages[1]!.is_closed).toBe(true);
    expect(result.stages[2]!.is_won).toBe(false);
    expect(result.stages[2]!.is_closed).toBe(true);
  });
});
