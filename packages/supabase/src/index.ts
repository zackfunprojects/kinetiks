export { createBrowserClient } from "./client";
export { createServerClient } from "./server";
export { createAdminClient } from "./admin";
export type { Database, Json } from "./types";

// Collaborative-workspace Realtime channels (spec §12)
export {
  COLLABORATIVE_CHANNEL_PREFIXES,
  presenceChannel,
  annotationsChannel,
  workspaceChannel,
  channelAccountId,
  publishAccountScoped,
  AccountScopeError,
} from "./realtime";
export type { CollaborativeChannelPrefix } from "./realtime";
