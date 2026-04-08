# DeskOf - CLAUDE.md

> AI-powered discovery, human-only publishing.

DeskOf is the expert routing and authority-building app in the Kinetiks AI ecosystem. It surfaces conversations across Reddit and Quora where a specific human's expertise is the right answer, helps them show up effectively, and tracks the compounding value of their contributions.

**DeskOf does not generate content. It does not post autonomously. Every published word is written by a human.**

---

## App Location

```
apps/deskof/          # Next.js app (deskof.kinetiks.ai)
packages/deskof/      # Shared DeskOf logic, types, utilities
```

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript (strict mode)
- **Database:** Supabase (shared Kinetiks project, `deskof_` prefixed tables)
- **Auth:** Kinetiks ID shared cookie auth (.kinetiks.ai)
- **Styling:** Tailwind CSS + Geist font stack
- **State:** Zustand for client state
- **API Layer:** tRPC for internal, REST for MCP surface
- **Queue/Jobs:** Supabase Edge Functions + pg_cron for scheduled work
- **Scraping:** Playwright (headless browser for Quora)
- **External APIs:** Reddit API (OAuth2), Quora (web scraping + browser handoff), OpenAI API, Anthropic API, Google Custom Search API, Perplexity API, Google Search Console API (Hero tier)
- **Deployment:** PWA-first (standalone display, service worker, push notifications)

## Architecture Principles

### Human-Only Publishing

This is the defining constraint. No code path exists where an agent or automated process publishes content to any platform without human-written text and explicit human confirmation. This is enforced at:

1. **Database level:** `deskof_replies` table requires `human_confirmed_at` timestamp before `posted_at` can be set
2. **API level:** `deskof_post` endpoint validates human confirmation token
3. **MCP level:** `deskof_post` tool requires human confirmation, enforced server-side
4. **UI level:** Post button requires explicit tap after quality gate review

Any PR that introduces a code path bypassing human confirmation will be rejected.

### Agent-Native but Human-Centric

DeskOf follows the Kinetiks Agent-Native Architecture but inverts the typical flow:

- **Standard Kinetiks:** Agent does work -> Human approves -> Agent executes
- **DeskOf:** Agent does intelligence -> Human does creative work -> Agent handles distribution mechanics

### Cortex Integration

DeskOf introduces the **Operator Profile** to Cortex. This is NOT a DeskOf-owned model - it lives in `packages/cortex/` as a shared primitive. DeskOf is the first consumer.

```
packages/cortex/
  src/
    operator-profile/     # NEW - Operator Profile module
      types.ts
      builder.ts          # Dynamic profile construction
      expertise-tiers.ts  # Core Authority / Credible Adjacency / Genuine Curiosity
      personal-identity.ts
```

### Tier-Gated Architecture

Every feature checks the user's billing tier before serving. A centralized `TierGate` middleware reads the tier from the Kinetiks ID session and exposes a `canAccess(feature)` function used across all components.

Tiers: `free` (Minimal track only), `standard` ($40/mo), `hero` ($80/mo).

Feature gating is defined in a single config file (`lib/tier-config.ts`). Never hard-code tier checks in components - always go through the centralized config.

---

## Pricing

| Tier | Price | Track Access | Platforms |
|------|-------|-------------|-----------|
| Free | $0 | Minimal only | Reddit only |
| Standard | $40/mo | Minimal or Standard | Reddit + Quora |
| Hero | $80/mo | Any track | Reddit + Quora |

### Key Feature Gates

| Feature | Free | Standard | Hero |
|---------|------|----------|------|
| Suggested angles | Locked | Yes | Yes |
| Full gate (tone, CPPI, spacing) | No (basic only) | Yes | Yes |
| Triage intelligence | No | Yes | Yes |
| Citation feed details | Teaser only | Full | Full + priority checking |
| Reputation dimensions | Score only | Full | Full + GSC correlation |
| Personal interest surfacing | No | Yes | Yes |
| Content URL ingestion | No | Yes (10 URLs) | Yes (unlimited) |
| MCP read tools | No | Yes | Yes |
| MCP write tools | No | No | Yes |
| Driving modes | Human Drive | + Approvals | + Autopilot (not posting) |
| Weekly strategy brief | No | No | Yes |
| Custom scoring weights | No | No | Yes |
| Webhook events | No | No | Yes |
| Exportable analytics | No | No | Yes |

Components use `<UpgradeGate feature="feature_name" />` to show locked states with contextual CTAs.

---

## Core Domain Objects

### Operator Profile (Cortex-level)

```typescript
interface OperatorProfile {
  id: string;
  professional: {
    expertise_tiers: ExpertiseTier[];
    products: ProductAssociation[];
    writing_voice: VoiceFingerprint;
    platform_history: PlatformHistory[];
  };
  personal: {
    interests: Interest[];
    communities: Community[];
    engagement_style: EngagementPrefs;
  };
  gate_adjustments: GateAdjustments;   // per-user gate calibration from override accuracy
  confidence: number;                   // 0-1
  last_updated: string;
}

type ExpertiseTierLevel = 'core_authority' | 'credible_adjacency' | 'genuine_curiosity';

interface ExpertiseTier {
  topic: string;
  tier: ExpertiseTierLevel;
  evidence: string[];
  confidence: number;
}
```

### Opportunity

```typescript
interface Opportunity {
  id: string;
  thread: ThreadSnapshot;
  match_score: number;                  // 0-100, composite
  match_breakdown: {
    expertise_fit: number;
    timing_score: number;
    citation_probability: number;
    answer_gap_score: number;
    anti_signal_flags: string[];
  };
  suggested_angle: string | null;       // null for free tier (gated)
  expertise_tier_matched: ExpertiseTierLevel;
  opportunity_type: 'professional' | 'personal' | 'crossover';
  surfaced_at: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'skipped' | 'expired';
  skip_reason?: SkipReason;
}

type SkipReason = 'already_well_answered' | 'not_my_expertise' | 'too_promotional' | 'bad_timing' | 'other';
```

### Reply

```typescript
interface Reply {
  id: string;
  opportunity_id: string;
  operator_id: string;
  platform: 'reddit' | 'quora';
  thread_url: string;
  content: string;                      // human-written text
  content_fingerprint: string;          // normalized hash for Quora answer matching
  gate_result: GateResult;
  gate_overrides: string[];
  human_confirmed_at: string | null;
  posted_at: string | null;
  platform_reply_id: string | null;
  quora_match_status?: 'matched' | 'ambiguous' | 'unmatched' | 'pending';
  status: 'draft' | 'gate_pending' | 'ready' | 'posted' | 'removed' | 'untracked';
  tracking: ReplyTracking;
}

interface GateResult {
  status: 'clear' | 'advisory' | 'blocked';
  checks: GateCheck[];
}

interface GateCheck {
  type: 'self_promo_ratio' | 'tone_mismatch' | 'redundancy' | 'question_responsiveness'
      | 'link_presence' | 'cppi' | 'topic_spacing';
  passed: boolean;
  severity: 'info' | 'warning' | 'blocking';
  message: string;
  recommendation: string;
}
```

### CPPI (Cross-Platform Promotional Index)

```typescript
interface CPPI {
  score: number;                        // 0-1 composite
  volume: number;                       // promotional / total (7-day rolling)
  concentration: number;                // product concentration
  clustering: number;                   // temporal clustering
  level: 'low' | 'moderate' | 'high' | 'critical';
}
// CPPI = (volume * 0.4) + (concentration * 0.35) + (clustering * 0.25)
// low < 0.40, moderate 0.40-0.60, high 0.60-0.80, critical > 0.80
```

### Track

```typescript
type TrackLevel = 'minimal' | 'standard' | 'hero';
type BillingTier = 'free' | 'standard' | 'hero';

const TRACK_CONFIGS: Record<TrackLevel, Track> = {
  minimal:  { level: 'minimal',  weekly_budget: { professional: 2, personal: 1, total: 3 },   discovery_aperture: 0.15 },
  standard: { level: 'standard', weekly_budget: { professional: 5, personal: 2, total: 7 },   discovery_aperture: 0.40 },
  hero:     { level: 'hero',     weekly_budget: { professional: 11, personal: 4, total: 15 },  discovery_aperture: 0.75 },
};

const TIER_MAX_TRACK: Record<BillingTier, TrackLevel> = { free: 'minimal', standard: 'standard', hero: 'hero' };
```

---

## Database Schema (Supabase)

All tables prefixed with `deskof_`:

```
# Core
deskof_opportunities          # scored thread-operator matches
deskof_replies                # replies with gate results, fingerprints, draft status
deskof_reply_tracking         # performance across time horizons
deskof_threads                # cached thread snapshots (Reddit + Quora)
deskof_platform_accounts      # connected accounts (encrypted tokens)
deskof_platform_health        # rolling health metrics
deskof_authority_scores       # per-topic scores over time
deskof_skip_log               # skip reasons for feedback loop
deskof_citation_checks        # LLM citation results
deskof_operator_tracks        # track selection per operator

# Quality gate
deskof_cppi_log               # CPPI snapshots
deskof_topic_vectors          # reply topic vectors for spacing detection
deskof_community_gate_config  # per-subreddit gate overrides (auto-learned)
deskof_gate_health            # weekly Gate Trust Score

# Quora matching
deskof_quora_match_attempts   # fingerprint matching attempts and outcomes

# Privacy and analytics
deskof_analytics_events       # product events (anonymized after 90 days)
deskof_data_deletion_requests # GDPR deletion tracking

# Filtered threads
deskof_filtered_threads       # today's filtered threads with reasons
```

---

## Operators

| Operator | Role | Runs |
|----------|------|------|
| **Scout** | Discovery engine. Scores threads, manages queue, anti-signal filtering, personal interest surfacing. | Continuous background |
| **Lens** | Quality gate. Self-promo, tone, redundancy, CPPI, topic spacing, links. Advisory-only first 30 days. | On-demand |
| **Pulse** | Tracking engine. Removal detection, citation checks, Authority Scores, Quora answer matching. | Scheduled |
| **Mirror** | Operator Profile. Content ingestion, history import, calibration, behavioral learning, gate adjustments. | Events + periodic |

### Boundaries

- All four operate autonomously within their domains
- **None can generate reply text or trigger a post**
- Lens analyzes text but never modifies it
- Scout generates `suggested_angle` strings but never draft replies

---

## Platform Integration

### Reddit

- OAuth2 (read, submit, history, identity scopes)
- 60 req/min rate limit. Target < 30 req/min sustained.
- Posting via API with human confirmation token
- Token refresh automatic, revocation detected and surfaced

### Quora

- No API. Playwright-based headless scraper for discovery.
- Browser handoff for posting: clipboard + open URL + user confirms
- Three-layer answer matching: content fingerprinting (0.75+ auto-match) > URL fallback > timed retry (48hr)
- Tracking via periodic scraping: 6hr first week, daily first month, weekly after
- Multiple CSS selector fallbacks. Alert if success rate < 80%.

### Platform Abstraction

Both implement `PlatformInterface` with `fetchThreads`, `fetchThreadDetail`, `postReply`, `checkReplyStatus`, `importHistory`. All Scout/Lens/Pulse/Mirror logic operates on this interface, platform differences isolated to client implementations.

---

## Quality Gate

### Checks

| Check | Tiers | Powered By |
|-------|-------|-----------|
| Self-promotion ratio | All | Computation |
| Link presence | All | Pattern matching |
| Tone mismatch | Standard+ | LLM |
| Redundancy | Standard+ | LLM |
| Question responsiveness | Standard+ | LLM |
| CPPI cross-platform | Standard+ | Computation |
| Topic spacing | Standard+ | NLP vectors |

### Calibration

- **Days 1-30 per user:** Advisory-only mode. No blocking. Feature flag `gate_blocking_enabled` auto-transitions.
- **Days 31-60:** Blocking enabled for self-promo ratio only.
- **Days 61-90:** Blocking enabled incrementally per check (2-week monitoring each).
- **Day 91+:** Steady-state. Calibration adjustments when metrics leave target ranges.
- **Community calibration:** Auto-learned from removal data, stored in `deskof_community_gate_config`.
- **User calibration:** Stored in Operator Profile `gate_adjustments`, from override accuracy.
- **Gate Trust Score:** F1 of predictions vs outcomes, computed weekly. Alert if < 0.50.

### Target Rates

Advisory: 15-25%. Block: 1-3%. Override: 30-50%. Post-gate removal: 5-10%.

---

## Onboarding (6 steps, < 8 min)

1. **Privacy + Connect** (~2 min): Disclosure, Reddit OAuth (required), Quora URL (optional). History imports in background.
2. **Content Import** (~1 min): 1-5 URLs of user's writing. Kinetiks context inherited if available.
3. **Expertise Calibration** (~2-3 min): 10 real threads. User labels: sweet spot / could contribute / not for me.
4. **Personal Interests** (~30 sec): Free-text + suggested communities. Pre-populated from history.
5. **Track Selection** (~15 sec): Default Standard with 7-day trial.
6. **First Card** (immediate): Land on Write tab.

Operator Profile confidence after onboarding: ~0.55-0.65.

---

## Error Handling

- **Platform API failures:** Show cached data with "Last updated" indicator. Never blank screens.
- **Quora scraper down:** Degrade to Reddit-only silently. Quora is additive.
- **LLM failures:** Features become less smart silently. Gate runs non-LLM checks only.
- **Post failures:** Reply text NEVER lost. Always saved as draft with retry/copy options.
- **Auth expiry:** Inline reconnect prompts. Preserve user state.
- **Degraded mode:** Persistent amber banner when multiple systems fail. Posting disabled until recovery.

Drafts saved in Zustand + service worker cache for PWA offline.

---

## Analytics

Instrument events during each phase's component build, not as a retrofit. Shared `analytics.ts` wrapper queues events locally, flushes in batches. Never block UI.

Key events: `opportunity_surfaced`, `opportunity_skipped`, `reply_posted`, `reply_post_failed`, `gate_check_completed`, `gate_advisory_overridden`, `upgrade_prompt_shown`, `upgrade_completed`, `citation_event_tapped`, `removal_notification_viewed`.

All events include: timestamp, session_id, user_tier, user_track, platform. User_id hashed, anonymized after 90 days.

---

## Privacy and Data Deletion

On account deletion via Kinetiks ID:
1. Tokens revoked + deleted (1 hour)
2. All deskof_ rows for user deleted (24 hours)
3. Operator Profile purged from Cortex (7 days)
4. Analytics anonymized immediately

Data export available: Profile (JSON), Replies (JSON), Scores (CSV), Health (CSV), Skips (CSV). ZIP via email within 24 hours.

Privacy disclosure shown during onboarding before any platform connection.

---

## MCP Tools

```
deskof_get_opportunities    # Standard+
deskof_check_draft          # Hero only
deskof_get_authority        # Standard+
deskof_get_thread_status    # Standard+
deskof_get_platform_health  # Standard+
deskof_post                 # Hero only. Human confirmation token required (5-min TTL, single-use, content-hash bound).
```

---

## Discovery Engine Scoring

```
match_score = (
  expertise_fit      * 0.30 +
  timing_score       * 0.20 +
  citation_prob      * 0.25 +
  answer_gap         * 0.20 +
  anti_signal_penalty * 0.05
)
```

Free tier: expertise_fit + thread_freshness only. Hero: weights customizable.

Weights are initial estimates. Feedback loop from skip reasons + outcome tracking informs adjustments.

---

## Testing Strategy

- Unit tests: scoring, gate (including CPPI, topic spacing), authority calculation
- Integration: Reddit API (test subreddit), Quora scraper (saved HTML snapshots), answer matching (test corpus)
- E2E: full Write flow, Quora handoff flow
- **Mandatory: no code path allows posting without human confirmation**
- **Mandatory: tier gating enforced for every gated feature**
- Gate calibration: advisory-only flag, community config, trust score
- Analytics: all key events fire with correct properties

---

## Common Pitfalls

1. **Don't cache thread data too aggressively.** Re-fetch before surfacing.
2. **Don't assume Reddit API stability.** Build abstraction layers.
3. **Don't let the gate become annoying.** Monitor advisory rate (15-25%) and block rate (1-3%).
4. **Don't expose the Operator Profile externally.** Stays within Kinetiks.
5. **Don't treat Quora like Reddit.** Scraping is fragile. Multiple selector fallbacks. Expect breakage.
6. **Don't hard-code tier checks.** Use `lib/tier-config.ts` and `<UpgradeGate>`.
7. **Don't defer analytics.** Instrument during each phase.
8. **Don't skip advisory-only period.** 30-day feature flag per user.
9. **Don't lose drafts.** Every error path saves the reply.
10. **Don't show blank screens.** Every error state has defined behavior and copy.
