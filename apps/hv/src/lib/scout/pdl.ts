/**
 * People Data Labs API client.
 * Transplanted from Bloomify utils/pdl.js, converted to TypeScript.
 * Direct API calls (no proxy) - PDL key stored server-side.
 */

import type { EnrichedCompany, ContactCandidate } from "./types";

const PDL_BASE = "https://api.peopledatalabs.com/v5";

function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPdlApiKey(): string {
  const key = process.env.PDL_API_KEY;
  if (!key) throw new Error("PDL_API_KEY not set");
  return key;
}

export async function enrichCompany(domain: string): Promise<EnrichedCompany | null> {
  const url = `${PDL_BASE}/company/enrich?website=${encodeURIComponent(domain)}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": getPdlApiKey() },
  });

  if (res.status === 404) return null;
  if (res.status === 401) throw new Error("Invalid PDL API key");
  if (res.status === 429) throw new Error("PDL rate limit exceeded");
  if (!res.ok) throw new Error(`PDL company enrich failed (${res.status})`);

  const data = await res.json();
  return {
    name: data.name || domain,
    website: data.website || domain,
    industry: data.industry || "",
    size: data.employee_count || null,
    location: (data.location && (data.location.metro || data.location.name)) || "",
    description: data.summary || "",
    founded: data.founded || null,
    linkedinUrl: data.linkedin_url || "",
  };
}

interface PdlSearchResult {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  work_email?: boolean;
  job_title_sub_role?: string;
  job_title_role?: string;
  linkedin_url?: string;
  job_company_name?: string;
}

function mapSearchResult(p: PdlSearchResult): ContactCandidate {
  return {
    name: titleCase(p.full_name || ""),
    firstName: p.first_name || "",
    lastName: p.last_name || "",
    title: p.job_title || "",
    email: "",
    hasWorkEmail: p.work_email === true,
    seniority: p.job_title_sub_role || p.job_title_role || "",
    linkedinUrl: p.linkedin_url || "",
    company: p.job_company_name || "",
    source: "pdl",
  };
}

function buildTitleQuery(titleKeywords: string[]): Record<string, unknown> | null {
  if (!titleKeywords || titleKeywords.length === 0) return null;
  if (titleKeywords.length === 1) {
    return { match_phrase: { job_title: titleKeywords[0] } };
  }
  return {
    bool: {
      should: titleKeywords.map((kw) => ({ match_phrase: { job_title: kw } })),
    },
  };
}

async function pdlPersonSearch(
  mustClauses: Record<string, unknown>[],
  size: number
): Promise<ContactCandidate[]> {
  const url = `${PDL_BASE}/person/search`;
  const body = {
    query: { bool: { must: mustClauses } },
    size,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Api-Key": getPdlApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) throw new Error("Invalid PDL API key");
  if (res.status === 429) throw new Error("PDL rate limit exceeded");
  if (res.status === 404 || res.status === 402) return [];
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("PDL search error:", res.status, errBody);
    throw new Error(`PDL person search failed (${res.status})`);
  }

  const data = await res.json();
  return ((data.data || []) as PdlSearchResult[]).map(mapSearchResult);
}

export async function searchPeople(
  domain: string,
  titleKeywords: string[],
  size = 5
): Promise<ContactCandidate[]> {
  const mustClauses: Record<string, unknown>[] = [{ term: { job_company_website: domain } }];
  const titleQ = buildTitleQuery(titleKeywords);
  if (titleQ) mustClauses.push(titleQ);
  return pdlPersonSearch(mustClauses, size);
}

export async function searchPeopleByCompanyName(
  companyName: string,
  titleKeywords: string[],
  size = 5
): Promise<ContactCandidate[]> {
  const mustClauses: Record<string, unknown>[] = [{ match_phrase: { job_company_name: companyName } }];
  const titleQ = buildTitleQuery(titleKeywords);
  if (titleQ) mustClauses.push(titleQ);
  return pdlPersonSearch(mustClauses, size);
}

export async function searchPeopleAny(
  domain: string,
  size = 5
): Promise<ContactCandidate[]> {
  return pdlPersonSearch([{ term: { job_company_website: domain } }], size);
}
