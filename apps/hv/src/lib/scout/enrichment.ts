/**
 * Enrichment waterfall orchestrator.
 * Runs enrichment sources in priority order, deduplicates contacts,
 * and resolves missing emails.
 *
 * Waterfall order: PDL -> Hunter -> (Apollo, LinkedIn, Clearbit, BuiltWith - future)
 */

import { enrichCompany, searchPeople, searchPeopleByCompanyName, searchPeopleAny } from "./pdl";
import { searchDomain, findEmail } from "./hunter";
import type { EnrichedCompany, ContactCandidate } from "./types";

interface EnrichmentResult {
  company: EnrichedCompany | null;
  contacts: ContactCandidate[];
  sources: string[];
}

/**
 * Deduplicate contacts by name (case-insensitive).
 * When duplicates exist, prefer the one with an email or more data.
 */
function deduplicateContacts(contacts: ContactCandidate[]): ContactCandidate[] {
  const seen = new Map<string, ContactCandidate>();

  for (const contact of contacts) {
    const key = (contact.name || "").toLowerCase().trim();
    if (!key) continue;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, contact);
    } else {
      // Prefer the one with more data
      const existingScore = (existing.email ? 2 : 0) + (existing.title ? 1 : 0) + (existing.linkedinUrl ? 1 : 0);
      const newScore = (contact.email ? 2 : 0) + (contact.title ? 1 : 0) + (contact.linkedinUrl ? 1 : 0);
      if (newScore > existingScore) {
        seen.set(key, contact);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Resolve missing emails using Hunter Email Finder.
 * Only resolves for contacts that have firstName + lastName but no email.
 */
async function resolveEmails(
  contacts: ContactCandidate[],
  domain: string
): Promise<ContactCandidate[]> {
  const resolved: ContactCandidate[] = [];

  for (const contact of contacts) {
    if (contact.email) {
      resolved.push(contact);
      continue;
    }

    // Need both names to use Hunter email finder
    if (!contact.firstName || !contact.lastName) {
      resolved.push(contact);
      continue;
    }

    try {
      const result = await findEmail(contact.firstName, contact.lastName, domain);
      if (result) {
        resolved.push({ ...contact, email: result.email, hasWorkEmail: true });
      } else {
        resolved.push(contact);
      }
    } catch {
      // Non-fatal - keep the contact without email
      resolved.push(contact);
    }
  }

  return resolved;
}

/**
 * Full enrichment pipeline for a domain.
 *
 * 1. Enrich company via PDL
 * 2. Search for contacts (PDL by domain, then by company name if < 3 results)
 * 3. Search Hunter as fallback/supplement
 * 4. Deduplicate across sources
 * 5. Resolve missing emails via Hunter Email Finder
 */
export async function enrichDomain(
  domain: string,
  titleKeywords: string[] = []
): Promise<EnrichmentResult> {
  const sources: string[] = [];
  let company: EnrichedCompany | null = null;
  let allContacts: ContactCandidate[] = [];

  // Step 1: Company enrichment
  try {
    company = await enrichCompany(domain);
    if (company) sources.push("pdl_company");
  } catch (err) {
    console.error("PDL company enrichment failed:", err);
  }

  // Step 2: PDL people search by domain
  try {
    const pdlByDomain = await searchPeople(domain, titleKeywords, 5);
    if (pdlByDomain.length > 0) {
      allContacts.push(...pdlByDomain);
      sources.push("pdl_people");
    }

    // If PDL returned < 3 contacts and we know the company name, search by name
    if (pdlByDomain.length < 3 && company?.name) {
      const pdlByName = await searchPeopleByCompanyName(company.name, titleKeywords, 5);
      allContacts.push(...pdlByName);
    }

    // If still < 3 contacts, try PDL without title filters
    if (allContacts.length < 3) {
      const pdlAny = await searchPeopleAny(domain, 5);
      allContacts.push(...pdlAny);
    }
  } catch (err) {
    console.error("PDL people search failed:", err);
  }

  // Step 3: Hunter domain search as supplement
  try {
    const hunterContacts = await searchDomain(domain, 10);
    if (hunterContacts.length > 0) {
      allContacts.push(...hunterContacts);
      sources.push("hunter_domain");
    }
  } catch (err) {
    console.error("Hunter domain search failed:", err);
  }

  // Step 4: Deduplicate
  const uniqueContacts = deduplicateContacts(allContacts);

  // Step 5: Resolve missing emails
  const contactsWithEmails = await resolveEmails(uniqueContacts, domain);

  return {
    company,
    contacts: contactsWithEmails,
    sources,
  };
}
