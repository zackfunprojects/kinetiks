/**
 * Quora scraper — Playwright-based headless browser client.
 *
 * Quora has no public API for reading questions or posting answers.
 * DeskOf uses a Playwright-driven scraper for discovery and tracking
 * and a browser handoff for posting (the user pastes into the real
 * Quora site themselves and confirms the post inside DeskOf).
 *
 * Design rules per CLAUDE.md and Integration Architecture §3.2:
 *
 *   - Multiple CSS selector fallbacks per data point. Quora changes
 *     its markup frequently. If the primary selector fails, fall back
 *     to the secondary, then tertiary.
 *
 *   - Aggressive rate limiting: 20 req/min ceiling per scraper instance.
 *
 *   - Selector health: track success rate per selector. If overall
 *     success drops below 80% on any field, log a structured alert
 *     so we can repair quickly.
 *
 *   - Graceful degradation: if Quora is down, DeskOf must continue to
 *     work with Reddit-only opportunities. Throwing here is fine; the
 *     caller catches and falls back.
 */
import "server-only";
import type { Browser, Page } from "playwright";
import type { ThreadSnapshot } from "@kinetiks/deskof";

/**
 * Selector spec — multiple fallbacks per logical field. Order matters:
 * the first selector that matches wins.
 */
interface FieldSelectors {
  name: string;
  selectors: string[];
}

const QUESTION_FIELDS: FieldSelectors[] = [
  {
    name: "title",
    selectors: [
      'div.q-text[class*="qu-userSelect--text"]',
      'div[class*="QuestionPageQuestionHeader"] span',
      "h1",
    ],
  },
  {
    name: "body",
    selectors: [
      'div[class*="QuestionDetailContent"]',
      'div[class*="QuestionDescription"]',
    ],
  },
  {
    name: "view_count",
    selectors: [
      'span[class*="ViewCount"]',
      'div[class*="ViewerCount"] span',
    ],
  },
  {
    name: "answer_count",
    selectors: [
      'div[class*="AnswerCount"] span',
      'span[class*="AnswerCountHeader"]',
    ],
  },
];

const ANSWER_FIELDS: FieldSelectors[] = [
  {
    name: "answer_body",
    selectors: [
      'div[class*="Answer"][class*="content"]',
      'div[class*="puppeteer_test_answer_content"]',
      "div.q-box.spacing_log_answer_content",
    ],
  },
  {
    name: "author",
    selectors: [
      'a[class*="user_link"]',
      'div[class*="AuthorInfo"] a',
    ],
  },
  {
    name: "upvote_count",
    selectors: [
      'button[class*="upvote"] span',
      'div[class*="upvote_count"]',
    ],
  },
];

/**
 * Token-bucket rate limiter scoped to a scraper instance.
 * 20 req/min = 1 token per 3 seconds, bucket size 5.
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number = 5,
    private readonly refillIntervalMs: number = 3000
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens > 0) {
      this.tokens -= 1;
      return;
    }
    // Wait until next refill
    const wait = this.refillIntervalMs;
    await new Promise((r) => setTimeout(r, wait));
    return this.acquire();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refillCount = Math.floor(elapsed / this.refillIntervalMs);
    if (refillCount > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + refillCount);
      this.lastRefill += refillCount * this.refillIntervalMs;
    }
  }
}

/**
 * Selector health tracker. Records success/failure per field name.
 * Returns structured stats so monitoring can alert on degradation.
 */
class SelectorHealth {
  private hits = new Map<string, number>();
  private misses = new Map<string, number>();

  recordHit(field: string): void {
    this.hits.set(field, (this.hits.get(field) ?? 0) + 1);
  }

  recordMiss(field: string): void {
    this.misses.set(field, (this.misses.get(field) ?? 0) + 1);
  }

  /**
   * Returns the success rate per field as a 0-1 number, plus an
   * overall flag if any field is below the 80% threshold.
   */
  report(): {
    fields: Record<string, number>;
    overall_healthy: boolean;
  } {
    const fields: Record<string, number> = {};
    let healthy = true;
    const allKeys = new Set([
      ...this.hits.keys(),
      ...this.misses.keys(),
    ]);
    for (const key of allKeys) {
      const h = this.hits.get(key) ?? 0;
      const m = this.misses.get(key) ?? 0;
      const total = h + m;
      const rate = total === 0 ? 1 : h / total;
      fields[key] = rate;
      if (rate < 0.8 && total >= 5) healthy = false;
    }
    return { fields, overall_healthy: healthy };
  }
}

export interface QuoraScrapedAnswer {
  body: string;
  author_handle: string | null;
  upvote_count: number | null;
}

export interface QuoraScrapedQuestion {
  url: string;
  title: string;
  body: string | null;
  view_count: number | null;
  answer_count: number | null;
  answers: QuoraScrapedAnswer[];
  scraped_at: string;
}

export class QuoraScraper {
  private readonly limiter = new RateLimiter();
  private readonly health = new SelectorHealth();

  constructor(private readonly browser: Browser) {}

  /**
   * Scrape a single Quora question page including all visible answers.
   * Throws on hard failures (page won't load, no title found at all).
   * Caller is responsible for catching and falling back.
   */
  async scrapeQuestion(url: string): Promise<QuoraScrapedQuestion> {
    await this.limiter.acquire();

    const context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
    });

    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      const title = await this.tryFields(page, "title", QUESTION_FIELDS);
      if (!title) {
        this.health.recordMiss("title");
        throw new Error(`Could not extract title from ${url}`);
      }
      this.health.recordHit("title");

      const body = await this.tryFields(page, "body", QUESTION_FIELDS);
      if (body) this.health.recordHit("body");
      else this.health.recordMiss("body");

      const viewCountText = await this.tryFields(
        page,
        "view_count",
        QUESTION_FIELDS
      );
      const viewCount = parseCount(viewCountText);
      if (viewCountText) this.health.recordHit("view_count");
      else this.health.recordMiss("view_count");

      const answerCountText = await this.tryFields(
        page,
        "answer_count",
        QUESTION_FIELDS
      );
      const answerCount = parseCount(answerCountText);
      if (answerCountText) this.health.recordHit("answer_count");
      else this.health.recordMiss("answer_count");

      const answers = await this.scrapeAnswers(page);

      return {
        url,
        title,
        body,
        view_count: viewCount,
        answer_count: answerCount,
        answers,
        scraped_at: new Date().toISOString(),
      };
    } finally {
      await context.close();
    }
  }

  /**
   * Convert a scraped Quora question into the platform-agnostic
   * ThreadSnapshot used everywhere downstream.
   */
  toThreadSnapshot(
    scraped: QuoraScrapedQuestion,
    spaceSlug: string
  ): Omit<ThreadSnapshot, "id"> {
    return {
      platform: "quora",
      external_id: extractQuestionId(scraped.url),
      url: scraped.url,
      community: spaceSlug,
      title: scraped.title,
      body: scraped.body,
      score: scraped.view_count ?? 0,
      comment_count: scraped.answer_count ?? scraped.answers.length,
      created_at: scraped.scraped_at,
      fetched_at: scraped.scraped_at,
    };
  }

  /**
   * Surface the current selector health stats for monitoring/alerting.
   */
  health_report() {
    return this.health.report();
  }

  // ----------------------------------------------------------------
  // Internals
  // ----------------------------------------------------------------

  private async scrapeAnswers(page: Page): Promise<QuoraScrapedAnswer[]> {
    const answerSelector = ANSWER_FIELDS.find((f) => f.name === "answer_body");
    if (!answerSelector) return [];

    for (const sel of answerSelector.selectors) {
      const answerEls = await page.$$(sel);
      if (answerEls.length === 0) continue;

      this.health.recordHit("answer_body");
      const answers: QuoraScrapedAnswer[] = [];

      for (const el of answerEls.slice(0, 50)) {
        const body = (await el.innerText()).trim();
        if (!body) continue;

        // Author + upvote — best-effort, scoped to the answer container
        const author = await this.tryFieldsScoped(
          el,
          ANSWER_FIELDS.find((f) => f.name === "author")
        );
        const upvoteText = await this.tryFieldsScoped(
          el,
          ANSWER_FIELDS.find((f) => f.name === "upvote_count")
        );

        answers.push({
          body,
          author_handle: author,
          upvote_count: parseCount(upvoteText),
        });
      }
      return answers;
    }

    this.health.recordMiss("answer_body");
    return [];
  }

  private async tryFields(
    page: Page,
    fieldName: string,
    spec: FieldSelectors[]
  ): Promise<string | null> {
    const field = spec.find((f) => f.name === fieldName);
    if (!field) return null;
    for (const sel of field.selectors) {
      try {
        const el = await page.$(sel);
        if (!el) continue;
        const text = (await el.innerText()).trim();
        if (text) return text;
      } catch {
        // Selector parse error or element gone — try next fallback
      }
    }
    return null;
  }

  private async tryFieldsScoped(
    container: Awaited<ReturnType<Page["$"]>>,
    field: FieldSelectors | undefined
  ): Promise<string | null> {
    if (!container || !field) return null;
    for (const sel of field.selectors) {
      try {
        const el = await container.$(sel);
        if (!el) continue;
        const text = (await el.innerText()).trim();
        if (text) return text;
      } catch {
        // Try next
      }
    }
    return null;
  }
}

function parseCount(text: string | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/,/g, "").trim();
  const k = cleaned.match(/^([\d.]+)\s*[kK]$/);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  const m = cleaned.match(/^([\d.]+)\s*[mM]$/);
  if (m) return Math.round(parseFloat(m[1]) * 1_000_000);
  const n = parseInt(cleaned.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function extractQuestionId(url: string): string {
  // Quora URLs look like https://www.quora.com/<slug-with-question>
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? url;
  } catch {
    return url;
  }
}
