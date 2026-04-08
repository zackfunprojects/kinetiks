/**
 * Link presence check (computational, runs on every tier).
 *
 * Counts unique URLs in the draft and flags those whose hostname
 * matches one of the operator's product associations. The score is
 * `promotional_links / 3`, capped at 1 — meaning 1 link is fine, 2
 * is informational, 3+ trips the blocking threshold.
 *
 * The exact mapping is intentionally conservative: a single product
 * link in a long substantive reply is normal and citation-positive.
 * The check exists to catch the "drop a link and run" antipattern.
 */

import type { GateCheck } from "../../types/gate";
import type { LensConfig, LensInput } from "../types";

const URL_REGEX = /\bhttps?:\/\/[^\s<>()"']+/gi;

export function checkLinkPresence(
  input: LensInput,
  config: LensConfig
): GateCheck | null {
  const matches = input.content.match(URL_REGEX) ?? [];
  if (matches.length === 0) return null;

  const productHosts = new Set(
    input.operator.product_names
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  );

  const seenUrls = new Set<string>();
  const promotional: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?)\]]+$/, "");
    if (seenUrls.has(cleaned)) continue;
    seenUrls.add(cleaned);
    const host = safeHostname(cleaned);
    if (!host) continue;
    if (matchesProduct(host, productHosts)) {
      promotional.push(host);
    }
  }

  if (promotional.length === 0) {
    return {
      type: "link_presence",
      passed: true,
      severity: "info",
      message: "Your reply contains links, but none point at your products.",
      recommendation: "",
    };
  }

  // Convention: higher sensitivity → MORE strict. Multiplying the
  // score works for this check because the thresholds are fixed
  // (0.34/0.67) — bumping the score up makes them easier to trip,
  // matching the divide-thresholds approach used elsewhere.
  const sensitivity = config.sensitivity.link_presence ?? 1.0;
  const score = Math.min(1, promotional.length / 3) * sensitivity;

  if (score >= 0.67) {
    return {
      type: "link_presence",
      passed: false,
      severity: "blocking",
      message: `Your reply links to your products ${promotional.length} times.`,
      recommendation:
        "Drop the extra links — one product mention is enough. Multiple links to the same product reads as a drive-by promo.",
    };
  }
  if (score >= 0.34) {
    return {
      type: "link_presence",
      passed: false,
      severity: "warning",
      message: `Your reply links to your products ${promotional.length} times.`,
      recommendation:
        "Consider whether more than one product link is necessary. The first one carries most of the weight.",
    };
  }
  return {
    type: "link_presence",
    passed: true,
    severity: "info",
    message: "Your reply links to your products once.",
    recommendation: "",
  };
}

function matchesProduct(host: string, productHosts: Set<string>): boolean {
  // Conservative: exact host match or strict subdomain match only.
  // Substring matching ("app" matches "apple.com") was too loose and
  // CodeRabbit flagged the false-positive risk on short product names.
  if (productHosts.size === 0) return false;
  for (const product of productHosts) {
    if (!product || product.length < 3) continue;
    if (host === product || host.endsWith(`.${product}`)) return true;
  }
  return false;
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
