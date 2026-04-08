/**
 * Quora PlatformClient — implements the unified PlatformInterface
 * for Quora using the Playwright scraper for reads and a browser
 * handoff for writes.
 *
 * Posting flow per CLAUDE.md and Integration Architecture §3.2:
 *   1. User writes reply in DeskOf editor
 *   2. Reply passes the quality gate
 *   3. User clicks Post → DeskOf returns a `browser_handoff` result
 *      with the clipboard text and the question URL to open
 *   4. The DeskOf UI copies the text to the user's clipboard and
 *      opens the URL in a new tab
 *   5. User pastes and submits on Quora manually
 *   6. User returns to DeskOf and confirms the post
 *   7. Pulse begins tracking via 3-layer answer matching
 *
 * Phase 1 ships the client surface and the registration. The actual
 * Playwright Browser instance is injected from a server-only factory
 * so cold starts can lazily boot the browser.
 */
import "server-only";
import type { Browser } from "playwright";
import {
  platformRegistry,
  type PlatformClient,
  type FetchThreadsOptions,
  type PostReplyInput,
  type PostReplyResult,
  type PlatformReplyStatus,
  type ImportHistoryResult,
  type PlatformIdentity,
  type ThreadSnapshot,
} from "@kinetiks/deskof";
import { QuoraScraper } from "./scraper";

export class QuoraClient implements PlatformClient {
  readonly platform = "quora" as const;
  private scraper: QuoraScraper;

  constructor(browser: Browser) {
    this.scraper = new QuoraScraper(browser);
  }

  async fetchThreads(_opts: FetchThreadsOptions): Promise<ThreadSnapshot[]> {
    // Phase 2 (Scout v1) wires the actual Quora topic monitor that
    // discovers question URLs from the configured space slug. For Phase 1
    // we ship the client interface; bulk discovery is built once Scout
    // exists.
    return [];
  }

  async fetchThreadDetail(threadIdOrUrl: string): Promise<ThreadSnapshot> {
    const url = threadIdOrUrl.startsWith("http")
      ? threadIdOrUrl
      : `https://www.quora.com/${threadIdOrUrl}`;
    const scraped = await this.scraper.scrapeQuestion(url);
    const snapshot = this.scraper.toThreadSnapshot(scraped, "unknown");
    return { id: "", ...snapshot };
  }

  async postReply(input: PostReplyInput): Promise<PostReplyResult> {
    if (!input.human_confirmation_token) {
      throw new Error(
        "QuoraClient.postReply: missing human_confirmation_token"
      );
    }
    // Quora has no posting API. We never submit on the user's behalf.
    // Return a browser_handoff so the UI can copy + open the question.
    return {
      kind: "browser_handoff",
      handoff_url: input.thread.url,
      clipboard_text: input.content,
      pending_confirmation: true,
    };
  }

  async checkReplyStatus(
    _platformReplyId: string
  ): Promise<PlatformReplyStatus> {
    // Phase 5 (Pulse) wires the periodic re-scrape that re-finds the
    // user's fingerprinted answer on the question page and reports
    // whether it's still live. Phase 1 returns 'unknown'.
    return { kind: "unknown" };
  }

  async importHistory(
    _identity: PlatformIdentity,
    _cursor: string | null
  ): Promise<ImportHistoryResult> {
    // Phase 2 wires the user's profile-page scrape that imports their
    // answer history.
    return { imported_count: 0, next_cursor: null };
  }

  scraperHealth() {
    return this.scraper.health_report();
  }
}

let registered = false;

/**
 * Register the Quora client. Call once at server startup with a
 * lazily-instantiated Playwright Browser. Idempotent.
 */
export function registerQuoraClient(browser: Browser): void {
  if (registered) return;
  platformRegistry.register(new QuoraClient(browser));
  registered = true;
}
