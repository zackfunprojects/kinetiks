import "server-only";

import { defineSocialReadTool } from "./_helpers/social-read";

/**
 * Marcus tool — read recent Instagram media + engagement.
 *
 * Source: `kinetiks_social_posts` (source='instagram'). Ranked by
 * likes (most reliable per-post metric across Image/Video/Carousel/Reel).
 */
export const instagramQueryTool = defineSocialReadTool({
  name: "instagram_query",
  description:
    "Read the customer's recent Instagram posts and reels (last 7/28/90 days). Returns total post count, total likes, top posts ranked by likes, and most-used hashtags. Includes posts of any media type (image, video, carousel, reel). Read-only. Use when the user asks about Instagram activity, top-performing posts, or hashtag performance. Returns `not_connected` when Instagram is not connected.",
  source: "instagram",
  provider: "instagram",
  connection_provider: "instagram",
  cortex_layer: "brand",
  primary_metric: "likes",
});
