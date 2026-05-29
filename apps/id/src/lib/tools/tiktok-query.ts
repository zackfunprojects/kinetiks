import "server-only";

import { defineSocialReadTool } from "./_helpers/social-read";

/**
 * Marcus tool — read recent TikTok videos + engagement.
 *
 * Source: `kinetiks_social_posts` (source='tiktok'). Ranked by views,
 * the canonical TikTok success metric. The TikTok sync handler keeps
 * unknown engagement fields in metadata.extra so a quarterly API
 * drift doesn't break the read path.
 */
export const tiktokQueryTool = defineSocialReadTool({
  name: "tiktok_query",
  description:
    "Read the customer's recent TikTok videos (last 7/28/90 days). Returns total video count, total views, top videos ranked by views, and most-used hashtags. Read-only. Use when the user asks about TikTok activity, top-performing videos, what's going viral, or hashtag patterns. Returns `not_connected` when TikTok is not connected.",
  source: "tiktok",
  provider: "tiktok",
  connection_provider: "tiktok",
  cortex_layer: "brand",
  primary_metric: "views",
});
