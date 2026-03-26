/**
 * Hunter.io API client.
 * Transplanted from Bloomify utils/hunter.js, converted to TypeScript.
 * Direct API calls - Hunter key stored server-side.
 */

import type { HunterEmailResult, ContactCandidate } from "./types";

const HUNTER_BASE = "https://api.hunter.io/v2";

function getHunterApiKey(): string {
  const key = process.env.HUNTER_API_KEY;
  if (!key) throw new Error("HUNTER_API_KEY not set");
  return key;
}

/**
 * Hunter Email Finder: given a person's name and company domain,
 * returns their verified work email address.
 */
export async function findEmail(
  firstName: string,
  lastName: string,
  domain: string
): Promise<HunterEmailResult | null> {
  const url = `${HUNTER_BASE}/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${getHunterApiKey()}`;

  const res = await fetch(url);

  if (res.status === 401) throw new Error("Invalid Hunter API key");
  if (res.status === 429) throw new Error("Hunter rate limit exceeded");
  if (!res.ok) return null;

  const json = await res.json();
  const data = json.data;

  if (!data || !data.email) return null;

  return {
    email: data.email,
    score: data.score || 0,
    position: data.position || "",
    company: data.company || "",
  };
}

/**
 * Hunter Domain Search: find all contacts at a domain.
 * Fallback when PDL returns no results.
 */
export async function searchDomain(
  domain: string,
  limit = 10
): Promise<ContactCandidate[]> {
  const url = `${HUNTER_BASE}/domain-search?domain=${encodeURIComponent(domain)}&limit=${limit}&api_key=${getHunterApiKey()}`;

  const res = await fetch(url);

  if (res.status === 401) throw new Error("Invalid Hunter API key");
  if (res.status === 429) throw new Error("Hunter rate limit exceeded");
  if (!res.ok) return [];

  const json = await res.json();
  const emails = (json.data?.emails || []) as Array<{
    first_name?: string;
    last_name?: string;
    value?: string;
    position?: string;
    seniority?: string;
    linkedin?: string;
  }>;

  const orgName = (json.data?.organization || "") as string;

  return emails
    .filter((e) => e.value)
    .map((e) => {
      const firstName = e.first_name || "";
      const lastName = e.last_name || "";
      const name = (firstName + " " + lastName).trim();
      return {
        name,
        firstName,
        lastName,
        title: e.position || "",
        email: e.value!,
        hasWorkEmail: true,
        seniority: e.seniority || "",
        linkedinUrl: e.linkedin || "",
        company: orgName,
        source: "hunter" as const,
      };
    });
}
