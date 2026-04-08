import type { Platform } from "../types/platform";
import type { ThreadSnapshot } from "../types/opportunity";

/**
 * The unified platform abstraction. Both Reddit and Quora implement
 * this interface so all of Scout / Lens / Pulse / Mirror operate on
 * platform-agnostic data. Platform-specific differences (Reddit OAuth
 * vs Quora scraping, Reddit API posting vs Quora browser handoff)
 * are isolated to the client implementations.
 *
 * The actual Reddit and Quora client implementations live under
 * apps/do/src/lib/reddit/ and apps/do/src/lib/quora/. They register
 * themselves with PlatformRegistry at module load.
 */

/** A user-side identity bound to a connected platform account. */
export interface PlatformIdentity {
  user_id: string;
  platform: Platform;
  /** Reddit username or Quora profile URL slug */
  account_handle: string;
}

export interface FetchThreadsOptions {
  /** subreddit name or Quora topic slug */
  community: string;
  /** Maximum threads to return per call */
  limit?: number;
  /** Don't return threads older than this many days */
  max_age_days?: number;
}

export interface PostReplyInput {
  identity: PlatformIdentity;
  /** Thread to reply to (must come from prior fetchThreads/fetchThreadDetail) */
  thread: ThreadSnapshot;
  /** Human-written reply text */
  content: string;
  /**
   * Single-use, content-hash-bound human confirmation token. The
   * platform client must verify this token belongs to this content.
   * Generated only by the DeskOf UI session — never by code or MCP.
   */
  human_confirmation_token: string;
}

export type PostReplyResult =
  | {
      kind: "posted";
      platform_reply_id: string;
      posted_at: string;
    }
  | {
      kind: "browser_handoff";
      /** URL to open in the user's browser */
      handoff_url: string;
      /** The text the user pastes */
      clipboard_text: string;
      /** Pulse will start tracking once the user confirms posting in DeskOf */
      pending_confirmation: true;
    };

export type ReplyStatus =
  | { kind: "live" }
  | { kind: "removed"; cause?: string }
  | { kind: "unknown" };

export interface ImportHistoryResult {
  imported_count: number;
  /** Last cursor for resuming pagination */
  next_cursor: string | null;
}

/**
 * The contract every platform client must satisfy.
 */
export interface PlatformClient {
  readonly platform: Platform;

  /** Discover threads in a community matching the user's expertise. */
  fetchThreads(opts: FetchThreadsOptions): Promise<ThreadSnapshot[]>;

  /** Get full detail (with comments/answers) for a single thread. */
  fetchThreadDetail(threadId: string): Promise<ThreadSnapshot>;

  /**
   * Post a reply OR (for Quora) hand off to the user's browser.
   * Implementations MUST verify human_confirmation_token before any
   * external state is modified.
   */
  postReply(input: PostReplyInput): Promise<PostReplyResult>;

  /** Check whether a previously posted reply is still live. */
  checkReplyStatus(platformReplyId: string): Promise<ReplyStatus>;

  /** Import the user's posting history (initial connection only). */
  importHistory(
    identity: PlatformIdentity,
    cursor: string | null
  ): Promise<ImportHistoryResult>;
}

/**
 * Registry of platform clients. Apps/do/src/lib/reddit and quora
 * register their implementations once at module load.
 */
class PlatformRegistry {
  private clients = new Map<Platform, PlatformClient>();

  register(client: PlatformClient): void {
    this.clients.set(client.platform, client);
  }

  get(platform: Platform): PlatformClient {
    const client = this.clients.get(platform);
    if (!client) {
      throw new Error(
        `No platform client registered for "${platform}". ` +
          `Did you forget to import the client module?`
      );
    }
    return client;
  }

  has(platform: Platform): boolean {
    return this.clients.has(platform);
  }

  registered(): Platform[] {
    return Array.from(this.clients.keys());
  }
}

export const platformRegistry = new PlatformRegistry();
