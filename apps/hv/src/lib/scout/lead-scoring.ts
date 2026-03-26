/**
 * Lead scoring engine.
 * Two-axis scoring: Fit (static ICP match) + Intent (dynamic signals).
 * Based on the lead-scoring-methodology knowledge module.
 */

import { guessSeniority } from "./pairing";

interface FitCriteria {
  target_industries: string[];
  company_size_min: number;
  company_size_max: number;
  target_geographies: string[];
  target_seniorities: string[];
  complementary_tech: string[];
}

interface ContactData {
  title: string;
  seniority?: string;
  org_industry?: string;
  org_employee_count?: number;
  org_geography?: string;
  org_tech_stack?: string[];
}

interface SignalEvent {
  type: string;
  age_days: number;
}

/**
 * Calculate fit score (0-100) based on ICP match.
 * Static - only changes when enrichment data refreshes.
 */
export function calculateFitScore(contact: ContactData, criteria: FitCriteria): number {
  let score = 0;
  let totalWeight = 0;

  // Industry match (20%)
  const weight_industry = 20;
  totalWeight += weight_industry;
  if (contact.org_industry) {
    if (criteria.target_industries.some((i) => i.toLowerCase() === contact.org_industry!.toLowerCase())) {
      score += weight_industry;
    } else if (criteria.target_industries.some((i) => contact.org_industry!.toLowerCase().includes(i.toLowerCase()))) {
      score += weight_industry * 0.5;
    } else {
      score += weight_industry * 0.1;
    }
  }

  // Company size (20%)
  const weight_size = 20;
  totalWeight += weight_size;
  if (contact.org_employee_count != null) {
    if (contact.org_employee_count >= criteria.company_size_min && contact.org_employee_count <= criteria.company_size_max) {
      score += weight_size;
    } else {
      // Adjacent ranges get partial credit
      const midpoint = (criteria.company_size_min + criteria.company_size_max) / 2;
      const distance = Math.abs(contact.org_employee_count - midpoint) / midpoint;
      score += weight_size * Math.max(0, 1 - distance) * 0.6;
    }
  }

  // Tech stack compatibility (15%)
  const weight_tech = 15;
  totalWeight += weight_tech;
  if (contact.org_tech_stack && contact.org_tech_stack.length > 0 && criteria.complementary_tech.length > 0) {
    const matches = criteria.complementary_tech.filter((t) =>
      contact.org_tech_stack!.some((ot) => ot.toLowerCase().includes(t.toLowerCase()))
    );
    score += weight_tech * Math.min(1, matches.length / Math.min(3, criteria.complementary_tech.length));
  }

  // Geography (10%)
  const weight_geo = 10;
  totalWeight += weight_geo;
  if (contact.org_geography && criteria.target_geographies.length > 0) {
    if (criteria.target_geographies.some((g) => contact.org_geography!.toLowerCase().includes(g.toLowerCase()))) {
      score += weight_geo;
    } else {
      score += weight_geo * 0.2;
    }
  }

  // Role seniority (20%)
  const weight_seniority = 20;
  totalWeight += weight_seniority;
  const seniority = contact.seniority || guessSeniority(contact.title);
  const seniorityScores: Record<string, number> = {
    cxo: 100,
    vp: 90,
    director: 80,
    manager: 60,
    senior: 50,
    entry: 40,
    training: 20,
  };
  const seniorityValue = seniorityScores[seniority] || 40;
  // Check if this seniority matches target
  if (criteria.target_seniorities.length > 0) {
    if (criteria.target_seniorities.includes(seniority)) {
      score += weight_seniority;
    } else {
      score += weight_seniority * (seniorityValue / 100) * 0.7;
    }
  } else {
    score += weight_seniority * (seniorityValue / 100);
  }

  return totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 0;
}

/**
 * Signal type to base intent points mapping.
 */
const SIGNAL_POINTS: Record<string, number> = {
  pricing_page_visit: 30,
  content_download: 20,
  webinar_attendance: 25,
  job_posting: 25,
  funding_announcement: 20,
  tech_stack_change: 15,
  email_opened: 5,
  email_clicked: 15,
  email_replied_positive: 40,
  social_engagement: 10,
  executive_hire: 20,
  competitor_churn: 25,
};

/**
 * Signal decay rates (points lost per day).
 */
const SIGNAL_DECAY: Record<string, number> = {
  pricing_page_visit: 5,
  content_download: 3,
  webinar_attendance: 2,
  job_posting: 1,
  funding_announcement: 0.5,
  tech_stack_change: 0.5,
  email_opened: 2,
  email_clicked: 3,
  email_replied_positive: 1,
  social_engagement: 2,
  executive_hire: 0.5,
  competitor_churn: 0.5,
};

/**
 * Calculate intent score (0-100) from signals.
 * Dynamic - decays over time, spikes on new events.
 */
export function calculateIntentScore(signals: SignalEvent[]): number {
  let totalPoints = 0;

  for (const signal of signals) {
    const basePoints = SIGNAL_POINTS[signal.type] || 10;
    const decayRate = SIGNAL_DECAY[signal.type] || 1;
    const decayedPoints = Math.max(0, basePoints - decayRate * signal.age_days);
    totalPoints += decayedPoints;
  }

  return Math.min(100, Math.round(totalPoints));
}

/**
 * Calculate composite lead score from fit and intent.
 * Weighted: Fit 40%, Intent 35%, Engagement 25%.
 */
export function calculateLeadScore(
  fitScore: number,
  intentScore: number,
  engagementScore: number
): number {
  return Math.round(fitScore * 0.4 + intentScore * 0.35 + engagementScore * 0.25);
}
