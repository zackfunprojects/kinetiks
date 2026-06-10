/**
 * B3 — the first-run greeting line shown in the empty chat state.
 * Client-safe (no server-only import): ChatArea renders it directly.
 *
 * With a known company, the system greets around the customer's actual
 * business - evidence it onboarded - instead of a generic line. Plain
 * dashes only; no em dashes in customer copy.
 */
export function buildFirstRunGreeting(companyName: string | null): string {
  if (companyName && companyName.trim()) {
    return `I'm set up around ${companyName.trim()}'s go-to-market. Ask about your goals, your traffic, or where to focus, and I'll work from what I know.`;
  }
  return "I'm ready. Ask about your goals, your traffic, or what to focus on, and I'll work from what I know about your business.";
}
