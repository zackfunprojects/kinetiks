import "server-only";

import { defineSocialReadTool } from "./_helpers/social-read";

/**
 * Marcus tool — read recent Twitter/X posts and engagement.
 *
 * Source: `kinetiks_social_posts` (source='twitter'), populated by the
 * `twitter-recent-posts` sync handler. Marcus uses this when the
 * customer asks about their tweets, engagement, top performers, or
 * recent activity on Twitter/X.
 */
export const twitterQueryTool = defineSocialReadTool({
  name: "twitter_query",
  description:
    "Read the customer's recent Twitter/X posts (last 7/28/90 days). Returns total post count, total impressions, top posts ranked by impressions, and most-used hashtags. Read-only. Use when the user asks about their Twitter/X activity, engagement, what they posted, or their best-performing tweets. Returns a structured `not_connected` status when Twitter is not connected — surface that to the user rather than computing.",
  source: "twitter",
  provider: "twitter",
  connection_provider: "twitter",
  cortex_layer: "voice",
  primary_metric: "impressions",
});
