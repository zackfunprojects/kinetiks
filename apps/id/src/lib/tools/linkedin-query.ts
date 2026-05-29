import "server-only";

import { defineSocialReadTool } from "./_helpers/social-read";

/**
 * Marcus tool — read recent LinkedIn posts and engagement.
 *
 * Source: `kinetiks_social_posts` (source='linkedin'). Ranked by
 * reactions (LinkedIn's most reliable engagement metric — impressions
 * are page-level and don't break down per-post).
 */
export const linkedinQueryTool = defineSocialReadTool({
  name: "linkedin_query",
  description:
    "Read the customer's recent LinkedIn posts (last 7/28/90 days). Returns total post count, total reactions, top posts ranked by reactions, and most-used hashtags. Read-only. Use when the user asks about their LinkedIn activity, top-performing posts, or audience engagement on LinkedIn. Returns a structured `not_connected` status when LinkedIn is not connected.",
  source: "linkedin",
  provider: "linkedin",
  connection_provider: "linkedin",
  cortex_layer: "voice",
  primary_metric: "reactions",
});
