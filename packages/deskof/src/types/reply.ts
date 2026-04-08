import type { Platform } from "./platform";
import type { GateResult } from "./gate";

export type ReplyStatus =
  | "draft"
  | "gate_pending"
  | "ready"
  | "posted"
  | "removed"
  | "untracked";

export type QuoraMatchStatus =
  | "matched"
  | "ambiguous"
  | "unmatched"
  | "pending";

export interface ReplyTracking {
  /** 0-24 hour metrics */
  immediate?: {
    upvote_velocity: number | null;
    op_engagement: boolean;
    early_replies: number;
  };
  /** 1-4 week metrics */
  short_term?: {
    google_indexed: boolean;
    google_position: number | null;
    reply_position: number | null;
    secondary_engagement: number;
  };
  /** 1-3 month metrics */
  medium_term?: {
    citation_count: number;
    citing_models: string[];
  };
  /** 3+ month metrics */
  long_term?: {
    organic_mentions: number;
    branded_search_lift: number | null;
  };
}

export interface Reply {
  id: string;
  opportunity_id: string;
  operator_id: string;
  platform: Platform;
  thread_url: string;
  /**
   * The human-written reply text. The hard constraint is that this
   * field is ALWAYS filled by a human via the DeskOf UI editor.
   * No code path may write LLM-generated content here.
   */
  content: string;
  /** Normalized hash of content used for Quora answer matching */
  content_fingerprint: string;
  gate_result: GateResult;
  /** Names of advisory checks the user explicitly overrode */
  gate_overrides: string[];
  /**
   * Set the moment the user clicks Post in the UI. The DB constraint
   * forbids posted_at being set unless human_confirmed_at is also set
   * in the same transaction. This is the human-only-publishing enforcement
   * at the data layer.
   */
  human_confirmed_at: string | null;
  posted_at: string | null;
  /** Reddit comment ID or Quora answer URL once the post lands */
  platform_reply_id: string | null;
  quora_match_status?: QuoraMatchStatus;
  status: ReplyStatus;
  tracking: ReplyTracking;
}
