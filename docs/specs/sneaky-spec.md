# Sneaky Spec

> **Sneaky is a founder-only meta-agent that watches the world and generates Claude-Code-ready feature proposals for Kinetiks.**
> It is not part of the user-facing product. It exists to keep Kinetiks evolving as the landscape changes.
> Runs weekly. Delivers structured, buildable proposals.

---

## 1. What Sneaky Is

Sneaky is your private product evolution engine. It scans the technology, AI, and marketing landscape on a weekly cadence, cross-references what it finds against the current Kinetiks codebase and roadmap, and produces structured feature proposals that are detailed enough to take directly into a Claude Code session.

It is not an idea generator. It is a spec writer. Every proposal includes what to build, why, which files it touches, and a mini-spec you can hand to Claude Code.

---

## 2. What Sneaky Monitors

### 2.1 Sources

**Tech & API landscape:**
- Hacker News (top stories, Show HN, launches)
- Product Hunt (daily top launches, weekly roundup)
- GitHub trending (new tools, libraries, frameworks relevant to the stack)
- Platform developer blogs (Google, Meta, LinkedIn, Slack, Stripe, Anthropic, OpenAI, Vercel, Supabase)
- API changelog feeds (Anthropic API, Supabase, Vercel, Twilio, ElevenLabs, Firecrawl, People Data Labs)

**AI developments:**
- Anthropic blog and release notes
- AI research highlights (new capabilities, benchmarks, techniques)
- Claude feature releases (new API parameters, tools, model versions)
- MCP ecosystem (new MCP servers, tools, patterns)
- AI agent frameworks and patterns (new approaches to orchestration, memory, planning)

**Marketing industry:**
- Marketing industry publications (MarTech, HubSpot blog, Drift, Gong research)
- GTM thought leaders (RSS, newsletters, social)
- Email deliverability ecosystem (sending best practices, platform changes, compliance)
- SEO/content landscape (algorithm updates, new content formats, distribution channels)
- Outbound landscape (new enrichment providers, new outreach tools, regulatory changes)
- Ad platform updates (new ad formats, targeting options, API capabilities, policy changes)

**Competitor intelligence:**
- Competitor product changelogs and release notes
- Competitor funding/hiring signals (Crunchbase, LinkedIn)
- G2/Capterra new entrants in relevant categories
- Product review sites for emerging tools

**Kinetiks internal:**
- Usage patterns (if analytics are available — what users do, where they struggle)
- Support/feedback signals (what users ask for)
- Codebase health (dependency updates, security advisories, deprecation warnings)

### 2.2 Source Management

Sources are configured as a list of URLs, RSS feeds, and API endpoints in a config file. Sneaky can be pointed at new sources at any time. Each source has:
- URL or API endpoint
- Scan frequency (some sources are daily, aggregated into weekly report)
- Relevance filter (keywords and topics that matter to Kinetiks)
- Priority weight (Anthropic blog is higher priority than a random HN post)

---

## 3. What Sneaky Produces

### 3.1 The Weekly Report

Every Monday morning, Sneaky delivers a report containing:

**Executive summary:** 3-5 sentences. What happened this week that matters for Kinetiks.

**Proposals:** 2-5 ranked feature proposals. Each one is a buildable unit.

**Signals:** 5-10 things worth knowing that aren't actionable yet but might be soon. "Keep an eye on X."

**Codebase health:** Any dependency updates, security advisories, or deprecation warnings that need attention.

### 3.2 Proposal Structure

Every proposal follows a strict format:

```markdown
## Proposal: [Title]

**Trigger:** What in the world prompted this. Link to source.

**What to build:** 2-3 paragraph description of the feature/change.

**Why it matters:** Impact on Kinetiks — user value, competitive advantage, technical improvement.

**Priority:** Urgent / Important / Nice-to-have

**Estimated effort:** Small (1 session) / Medium (2-3 sessions) / Large (1+ week)

**Which apps/systems it affects:**
- [ ] Core Kinetiks app (apps/id)
- [ ] Harvest
- [ ] Dark Madder
- [ ] Ads app
- [ ] Hypothesis
- [ ] Litmus
- [ ] Adventure
- [ ] Shared packages
- [ ] Database migrations
- [ ] Approval system
- [ ] Oracle / Analytics
- [ ] Command router
- [ ] Agent communication layer

**Files likely touched:**
- `path/to/file.ts` — what changes
- `path/to/other/file.ts` — what changes

**Mini-spec:**
[Detailed enough for a Claude Code session to execute. Includes:
- Data model changes (new tables, new fields)
- API endpoints needed
- UI components needed
- Agent/prompt changes
- Integration details
- Edge cases to handle]

**Risks/considerations:**
- What could go wrong
- What this depends on
- What to watch out for

**Source links:**
- [Link to the thing that triggered this]
- [Supporting context]
```

### 3.3 Signal Structure

Signals are lighter — just awareness items:

```markdown
**Signal:** [One-line summary]
**Source:** [Link]
**Relevance:** [Why this might matter for Kinetiks in the future]
**Watch for:** [What would make this actionable]
```

---

## 4. How Sneaky Works

### 4.1 Weekly Pipeline

**Stage 1: Scan (automated, runs Saturday)**
- Hit all configured sources
- Extract new content since last scan
- Filter by relevance keywords and topics
- Store raw signals in a local database

**Stage 2: Analyze (automated, runs Sunday)**
- Claude Sonnet processes all raw signals
- Cross-references against the current CLAUDE.md and spec docs (reads the actual codebase context)
- Cross-references against the current roadmap (what's planned, what's built, what's not)
- Identifies actionable opportunities (could become proposals)
- Identifies watch items (signals)
- Ranks by priority and estimated impact

**Stage 3: Generate (automated, runs Sunday)**
- For each actionable opportunity, Claude Sonnet generates a full proposal in the standard format
- For each watch item, generates a signal entry
- Compiles the weekly report with executive summary
- Runs a self-review pass: is each proposal actually buildable? Does the mini-spec make sense? Are the file paths real?

**Stage 4: Deliver (Monday morning)**
- Report delivered to configured channel (Slack DM, email, or a dedicated web page)
- Proposals also saved as individual markdown files in `docs/sneaky/proposals/` for easy Claude Code ingestion

### 4.2 Technical Implementation

Sneaky runs as a standalone script or lightweight service. Not part of the main Kinetiks monorepo deployment — it's a founder tool.

**Option A: Claude Code script**
A script in the Kinetiks repo (e.g., `tools/sneaky/`) that you run weekly or schedule via cron. It:
- Uses web_fetch to scan sources
- Uses Claude API to analyze and generate proposals
- Writes output to `docs/sneaky/` and sends a Slack message

**Option B: Standalone service**
A small Node.js service that runs on a schedule (Railway, Fly.io, or a simple cron server). Has its own Claude API key. Delivers via Slack webhook or email.

**Option A is simpler to start.** You run it when you want it, or set up a cron job. It lives in the monorepo so it always has access to the latest CLAUDE.md and specs for context.

### 4.3 Codebase Awareness

Sneaky's key advantage over generic trend-watching is that it knows your codebase. Before generating proposals, it reads:

- `CLAUDE.md` — full architecture context
- `docs/kinetiks-product-spec-v3.md` — product vision
- All system specs — approval system, command router, analytics engine
- `package.json` files — current dependencies and versions
- Recent git log — what's been worked on lately

This means proposals are grounded in reality. "Add WebSocket support for real-time chat" won't be proposed if the system already uses Supabase Realtime. "Upgrade to Claude Sonnet 4" will be proposed the day it's available because Sneaky knows you're on Sonnet 3.5.

---

## 5. Example Proposals

### Example 1: New capability

```markdown
## Proposal: Add AI-Generated Video Shorts to Dark Madder

**Trigger:** Anthropic announced multimodal output support in Claude Sonnet 4.
Short-form video is now the highest-engagement content format on LinkedIn and X.
[link to announcement]

**What to build:** A new content type in Dark Madder that generates short (30-60s)
video scripts from existing blog content, creates visual storyboards, and outputs
to a format ready for video generation tools (Runway, Pika). The system repurposes
high-performing written content into video scripts optimized for each platform.

**Priority:** Important
**Estimated effort:** Medium (2-3 sessions)

**Files likely touched:**
- `apps/dm/src/lib/content/types.ts` — add 'video_short' content type
- `apps/dm/src/lib/content/generators/video-script.ts` — new generator
- `apps/dm/src/components/editor/VideoScriptEditor.tsx` — new editor component
- `packages/types/src/content.ts` — shared type update

**Mini-spec:**
[Detailed generation pipeline, script format, platform variants, etc.]
```

### Example 2: Infrastructure improvement

```markdown
## Proposal: Migrate Oracle CRON Functions to Supabase pg_cron

**Trigger:** Supabase released native pg_cron support with monitoring dashboard.
Current Edge Function CRONs have cold start issues and no built-in monitoring.
[link to Supabase blog post]

**What to build:** Migrate Oracle's scheduled functions from Edge Function CRONs
to pg_cron for lower latency and better reliability. Keep the TypeScript logic
in Edge Functions but trigger them from pg_cron instead of external schedulers.

**Priority:** Nice-to-have
**Estimated effort:** Small (1 session)

**Files likely touched:**
- `supabase/migrations/000XX_oracle_pgcron.sql` — new migration
- `supabase/functions/oracle-metrics/index.ts` — add HTTP trigger support
- Remove external CRON configuration

**Mini-spec:**
[Migration steps, rollback plan, monitoring setup]
```

### Example 3: Competitive response

```markdown
## Proposal: Add LinkedIn Inbox Monitoring to Harvest

**Trigger:** Apollo.io just launched LinkedIn DM integration. Three competitors
now offer this. LinkedIn's API opened new messaging endpoints in March.
[link to Apollo changelog, LinkedIn API docs]

**What to build:** Allow Harvest to monitor LinkedIn InMail/connection request
responses alongside email responses. Unified inbox showing all prospect
communication regardless of channel.

**Priority:** Urgent
**Estimated effort:** Large (1+ week)

**Files likely touched:**
- `apps/hv/src/lib/channels/linkedin.ts` — new channel integration
- `apps/hv/src/components/inbox/UnifiedInbox.tsx` — multi-channel inbox
- `packages/types/src/channels.ts` — add linkedin channel type
- Database migration for linkedin message storage

**Mini-spec:**
[LinkedIn API integration details, auth flow, message sync, unified inbox UX]
```

---

## 6. Delivery Configuration

```typescript
// tools/sneaky/config.ts
interface SneakyConfig {
  sources: Source[];
  delivery: {
    slack_webhook: string | null;      // Slack incoming webhook URL
    email: string | null;              // Email address for delivery
    output_dir: string;                // Where to write proposal files (default: docs/sneaky/)
  };
  codebase: {
    claude_md_path: string;            // Path to CLAUDE.md
    specs_dir: string;                 // Path to docs/
    package_json_paths: string[];      // All package.json files to read
  };
  schedule: {
    scan_day: 'saturday';
    deliver_day: 'monday';
    deliver_time: '08:00';
    timezone: string;
  };
  filters: {
    relevance_keywords: string[];      // Topics that matter
    ignore_keywords: string[];         // Topics to skip
    min_priority: 'urgent' | 'important' | 'nice-to-have';
  };
}
```

---

## 7. What Sneaky Is NOT

- Not user-facing. No user ever sees Sneaky or its output.
- Not an auto-builder. Sneaky proposes. You decide. Claude Code builds.
- Not a replacement for product thinking. Sneaky finds inputs. You set direction.
- Not comprehensive market research. It's targeted scanning with actionable output.
- Not connected to the Kinetiks production system. It reads the codebase but never writes to it.
