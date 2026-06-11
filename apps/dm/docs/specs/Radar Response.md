# Dark Madder — Radar Response

> **Spec:** `specs/radar-response.md` — subsystem spec 8 of 10 per `dark-madder-v2-doc-system.md` §7.
> **Date:** June 2026 · **Status:** Draft for approval
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > `platform-contract.md` and `dm-platform-integration.md` (binding at the app boundary — §4.3 event 3 is this spec's intake; §5.6's fast-track override and §6.2's one-shot Workflows are its Program mechanics) > `ux/experience-architecture.md` (binding for surfaces; not yet written — primitives cited are the four from doc-system §3.3, to be reconciled) > `platform-asks.md` > this spec.
> **Sources consolidated:** ARCHIVE-PATCH-006 **response machinery only** — the feed surface character, relevance/severity discipline, the response-action table, the Fast Track, dismissal learning, integration surfaces. Its sensing half (watches, crons, story clustering, event creation) is **deleted scope**, superseded by platform A4 agents per the locked decision and platform-ask #3; this spec writes the contract DM asks of those agents (§2.2), mirrored into the ask. All superseded by this document for the territory it covers.
> **Depends on:** `specs/research-architecture.md` (territory centroids and cluster/piece embeddings for scoring; the brief generator the auto-brief invokes; the calendar/Program path for standard-track responses), `specs/generation-engine.md` (the fast-track trigger and queue-jump its §2.1 already carries; the pipeline every response draft runs). **Consumed:** `specs/lifecycle-freshness.md` §2.3's external-pressure record (Queue Refresh fills it). **Contract defined here, implemented later:** the Reddit-answer invocation `specs/splits.md` fills (§2.5).
> **Decisions baked in (continuing the global series):** **D33** the single-slot Program problem splits by urgency — standard-track responses (Outwrite / Add to Calendar) submit a scoped single-slot `dm_propose_calendar` (strategic); Fast Track drafts immediately (drafting is never consequential) and the one-shot Workflow registration rides the publish approval's preview as a stated consequence, so the 24h clock sits on the one decision that matters and the Program is never silently edited. **D34** full DM-side re-scoring against territory/cluster/piece embeddings with platform relevance as the prior; keyword-matching fallback when pgvector is absent. **D35** zero agent tools ship; a read-only `dm_get_radar_events` is filed as a write-back proposal to the integration doc — never added ad hoc. **D36** the v1 digest dies as DM infrastructure; high-severity events ride the platform notification path and Marcus's brief. **D37** dismissal learning runs at both layers — DM-local severity patterning (logged, reversible) and feedback forwarded through the subscription API per ask #3.
> **Locked decisions honored:** **sensing is platform-owned, DM owns the response** — no watcher, crawler, or feed-builder exists in this spec under any schedule pressure; deleted scope, not deferred scope; one approval decision (every response routes into existing decision surfaces; this spec creates none); calendar as Kinetiks Program (D33's two paths are the only ways a response touches it); Cortex canonical (competitive proposals through the pipeline; subscription payloads read the layer, never fork it); zero analytics ingestion; standalone-first; single company per account.

---

## 1. Purpose

Radar Response is what turns Dark Madder from a planner that executes into an operator that notices — without building a single sensor. The platform's A4 agents watch the world (competitor publishes, news, keyword spikes, community surges) and write to `kinetiks_intelligence_feed`; this spec is everything that happens after an event arrives: scoring it against what *this* org owns, attributing it to the cluster or piece it threatens, recommending the response with the reasoning attached, and collapsing "this happened" → "here's the draft" into one click through machinery that already exists. Four properties define it:

1. **Radar adds no second content pipeline.** Every response action is a thin, evidence-carrying invocation of another subsystem: refreshes are lifecycle's, briefs and calendar slots are research's, generation is generation's, Reddit answers are splits'. This spec owns the *routing and the urgency*, never a parallel path — which is why a radar piece meets every quality gate a planned piece meets.
2. **Attribution is the product.** The platform can say "this is relevant to your subscription"; only DM can say "this targets your Bee Conservation hub, which ranks #3 for the parent term, and covers two subtopics you don't." The event without the attribution is news; with it, it is a decision. D34's piece-level scoring is what every card, severity, and recommendation stands on.
3. **Severity, then silence.** The instrument earns trust by what it doesn't show: hard presentation caps, expiry on trends, dismissal that teaches at both layers (D37), low-relevance events collapsed and never notified, and the persistent "last delivery" health line so a quiet feed provably means a quiet week, not a broken pipe.
4. **Reaction uses the planning bar, at emergency speed.** The Fast Track compresses *scheduling* — brief now, generation now, queue head, a 24h decision window — and compresses nothing else: full craft pipeline, voice audit, checklist, Sentinel, verification. A trend piece that embarrasses the org is worse than no trend piece; that v1 law is carried verbatim.

---

## 2. Mechanism

### 2.1 The boundary, drawn exactly

**Platform-owned (ask #3, deleted from DM scope):** watching competitor sitemaps/RSS, news querying, keyword-velocity and community-velocity detection, article fetch-and-extract for *discovery*, same-story clustering, event summarization, feed-level relevance pre-filtering, and writing `kinetiks_intelligence_feed`. None of this exists in DM in any mode, on any schedule, under any pressure.

**DM-owned (this spec):** subscription registration (§2.2), intake and re-scoring (§2.3), attribution, severity, the recommendation, the feed surface, the response actions, the Fast Track, dismissal patterning, and response-outcome records. One deliberately stated edge: **on-demand analysis of a delivered event's `source_urls`** — fetching the competitor piece an event already names, to compare its coverage against ours (`competitor_piece_analysis`) — is response machinery, not sensing. The test is direction and trigger: the platform discovers URLs by watching; DM reads URLs an event handed it, when crafting the response to that event. DM never enumerates, polls, or diffs anyone's site.

**The interim ships dark but complete** (ask #3's clause, implemented): scoring, the feed UI, and every response action are buildable and testable now via `POST /api/dm/radar/inject` — a dev-only route accepting ask #3-shaped events, excluded from production builds, never a user-facing feature. When A4 ships, activation is a subscription call, not a build.

### 2.2 The subscription contract (the ask #3 mirror)

This section is the spec ask #3 points to — what DM registers, what it expects back, and the discipline it asks the feed to hold. Filed as the DM-contributed half of the ask (§10).

**Registration payload** (re-registered on territory/cluster/architecture changes, debounced daily):

```jsonc
{
  "app": "dark_madder", "account_id": "…",
  "topic_spaces": [
    { "kind": "territory", "ref": "dm_territories.id", "label": "…",
      "embedding": [/* 1024d, the research §2.2 territory centroid */], "phrases": ["…"] },
    { "kind": "cluster", "ref": "dm_clusters.id", "label": "…",
      "embedding": [/* piece-level centroid */], "primary_keyword": "…" }
  ],
  "competitor_domains": [/* read from Cortex competitive at registration time — the canonical list;
                            DM registers a read, never a fork */],
  "event_types": ["competitor_published","news_story","keyword_spike","community_spike"],
  "delivery": "routing_event"            // integration §4.3 event 3
}
```

**Event shape consumed** (generalized from PATCH-006, as ask #3 already records): `{ event_type, title, summary, source_urls, relevance_to_subscription, severity_hint?, affected_entity?, clustered_story_count?, expires_at?, feed_event_id }` — with same-story clustering done feed-side, so one regulation is one event citing five sources.

**Feed discipline requested** (and enforced DM-side regardless, §2.4): embedding pre-filter before any LLM call · per-day delivery caps · expiry on trend events · dismissal feedback the agents learn from (D37's upward half). The phrases list rides alongside embeddings so the platform's fallback matching works pre-pgvector too.

### 2.3 Intake, re-scoring, attribution (D34)

`handleRoutingEvent` event 3 (integration §4.3) delivers the event; DM writes a `dm_radar_events` row referencing `feed_event_id` — **DM never writes response state into the platform table** — and scores:

1. **Relevance, re-scored:** the event's content embedding (computed DM-side from title + summary via the shared embedding config, ask #12) against every territory centroid and cluster embedding, with the platform's `relevance_to_subscription` as the prior. For `competitor_published` events, the piece-level pass also runs: nearest published piece within distance 0.3 → the event **targets a specific piece**, the strongest attribution there is. pgvector absent (ask #5 interim): keyword/phrase matching with a wider net, the severity cap doing more work, and the lower confidence stated on every score.
2. **Severity** (fast-tier classification over the attribution + org context, never over the raw event alone): does it target a keyword the org ranks for (high)? Does it land in a cluster with a hub (high)? Does it threaten a specific piece (high)? Adjacent only (low)? Dismissal patterns (§2.4) dampen before surfacing.
3. **The recommendation** (standard tier): one suggested response from the §2.5 table with its rationale — "their piece is newer, longer, and covers two subtopics your hub doesn't: refresh the hub" — written against the attribution evidence, never inventing data. Every medium+ event ships actionable or it isn't surfaced as medium+ (the v1 law, carried).
4. **For competitor events, on demand or at high severity automatically:** `competitor_piece_analysis` reads the event's source URLs and produces the coverage delta against our piece/cluster (what they cover that we don't, format, recency) — the evidence behind "Refresh My Hub" and the material the auto-brief's `serp_context` consumes.

Events below the relevance floor are logged-only (`status: 'logged'`), visible under the collapsed roll-up, never notified, never sent to an LLM.

### 2.4 Presentation discipline

Enforced DM-side even if the feed is noisier than ask #3 requests: **max 5 medium+ events surfaced per day** (config; overflow ranks into the feed's expandable remainder, never notifies) · **trend expiry** (the event's `expires_at`, defaulting 14 days for trend types when absent; expired events close as `expired` — a stale "trending" alert is worse than none) · **the health line** ("last delivery: 4h ago ✓" / "no events in 6 days — subscriptions healthy", persistent, so silence is provably quiet) · **dismissal patterning (D37):** a dismissal logs with optional reason; three dismissals matching a pattern (event_type × nearest topic space × source domain) dampen that pattern's severity — logged, listed, and reversible in S3 — *and* the dismissal forwards through the subscription feedback API so the platform tightens at the source. Two layers, each owning its own.

### 2.5 Response actions — one click, existing machinery

| Action | Routes to | What rides along |
|---|---|---|
| **Queue Refresh / Refresh My Hub** | A lifecycle-freshness job (`trigger: 'radar_event'`) | The §2.3 attribution + coverage delta as lifecycle's external-pressure record (its §2.3 contract, filled verbatim) — the event becomes named, evidenced gaps in the diff |
| **Outwrite: New Piece / Add to Calendar** (standard track) | Research's brief generator → a **scoped single-slot `dm_propose_calendar`** (strategic; D33) | The auto-brief (below); the proposal's `config_change` preview shows the one-slot delta with the event as the originating evidence — the measurement §2.10 submit-now shape, reused. The piece then enters the architecture as a normal piece (research §2.10's rule, honored) |
| **Fast Track a Response** | §2.6 | |
| **Generate Reddit Answer** | Splits' Reddit generator (forward contract: `{ thread_url, thread_language_excerpts, mapped_piece_id?, event_ref }` — since this spec ships first, the shape is the binding consumer contract `specs/splits.md` fills) | The thread's actual language; Sentinel gates readiness in splits, per its territory |
| **Dismiss** | §2.4 | Pattern learning, both layers |

**The auto-brief:** research's brief generator invoked with event evidence injected — clustered sources and the coverage delta into `serp_context` and `content_gap_opportunities`, the event ref into the brief's provenance, the org's territory context and product knowledge exactly as any brief (research §2.6's shape, no fork). The brief is stored in `dm_briefs` like any other; evidence and provenance hold end to end.

### 2.6 The Fast Track (D33)

Trend content has a shelf life measured in days; the standard pipeline is built for evergreen pacing. Fast Track is the same quality pipeline at emergency speed:

1. **Now:** a `dm_pieces` row (`track: 'fast'`, `radar_event_id` set), the auto-brief synthesized, and generation starts immediately — `fast_track` trigger, queue jump per generation §2.1, the jump stated on the queue surface, never silent. Drafting is never consequential: no approval gates the *writing*.
2. **The draft lands at the review-queue head** with the 24h clock rendered prominently (editor-review §2.11 already carries fast-track rows and their clocks) and the platform notification path fires.
3. **The one decision:** the publish approval — `dm_content_publish`, fast-track override 24h / `cancel` with regenerate-on-return (integration §5.6, verbatim: a trend response older than a day is a post-mortem). In connected mode, **the card's preview states the Program consequence**: "approving publishes today and registers a one-shot Workflow ('Respond: {event title}') in {content Program}." On approval, publishing executes and DM registers the one-shot Workflow via the Programs API (ask #8) with the approval as provenance — the mutation is *on the card*, never silent, and never a separate strategic gate that would outlive the trend. Standalone: the identical flow writes `dm_calendar`, in-app approval, no registration.
4. **On publish:** splits auto-queue (`dm_generate_splits` invoked — drafting, non-consequential; Sentinel gates readiness in splits' queue), because trend pieces earn their traffic from distribution, not from waiting for rankings.

**`timely` semantics:** fast pieces are **excluded from cannibalization blocking** — they may deliberately overlap evergreen pieces; overlap detected at the approval-time check logs a **merge-later flag** instead of the three-way checkpoint — and **excluded from the refresh queue by default** (lifecycle honors the track). **Convert-to-evergreen** is lifecycle's action (its §2.5): it clears the track, fires the deferred cannibalization checkpoint against the merge-later flag, and enrolls the piece in freshness. The winners graduate; the rest age as intended.

### 2.7 Outcomes and the integration surfaces

Every executed response writes its outcome refs onto the event (`response_refs`: refresh draft id / piece id / proposal id / split ids) and closes it `responded`. These records are what the rest of the system renders:

- **Measurement's quarterly competitor-movement section** (its §2.9.3) rolls up the quarter's events with outcomes — "GiveWise published 6 pieces into your clusters; you responded to 3" — from these rows joined with the feed. Measurement renders; this spec records. One owner per number.
- **Research Overview** gains the radar tile ("2 events need attention") reading open medium+ counts — a contribution to research's S1, not a surface here.
- **The Corpus Map** renders pieces with an open high-severity event with the pressure treatment (research §2.7 already reserves the shared glow canvas; the exact rendering is `ux/design-language.md`'s call) — the sensor layer made visible.
- **Marcus and notifications (D36):** the v1 digest is deleted as DM infrastructure. High-severity events ride the platform notification path; the roll-up view is Marcus's daily brief (Marcus reads the feed natively; the *attributed* view reaches him via the D35 write-back when accepted). "No digest is good news" survives as notification-path behavior, not DM email.

---

## 3. Tools exposed

**None ship (D35) — deliberately.** Radar's response actions are invocations of tools other specs own (`dm_propose_refresh`, `dm_draft_article`, `dm_propose_calendar`, `dm_generate_splits`), and duplicating any as a radar tool would create a second definition of the same truth. Marcus reads `kinetiks_intelligence_feed` natively for raw events.

What the raw feed cannot answer is the *attributed* question — "what content threats need attention, against which clusters, with what recommended response" — which is exactly what Marcus's daily brief and "should we respond to X?" need. Accordingly, **a write-back proposal is filed to `dm-platform-integration.md` §2–§3** (§10): a read-only **`dm_get_radar_events`** — *Get content-relevant intelligence events scored against this account's territories and clusters: severity, the threatened cluster or piece, the recommended response with its rationale, and response status. Use when the user asks about competitor moves, trends affecting their content, or what needs a response.* Returns `{ events: [{event_id, type, severity, affected_cluster_id?, affected_piece_id?, suggested_response, rationale, status, expires_at}], summary }`. Its capability home (the `content_freshness` capability's description already says "when an intelligence event indicates a piece is under pressure"; a distinct capability is the alternative) is the integration doc's decision to make. Until accepted: internal routes only — `/api/dm/radar/events/*` (feed, detail, respond, dismiss), `/api/dm/radar/subscriptions/*`, `/api/dm/radar/patterns/*` (list, reverse), `/api/dm/radar/inject` (dev-only, §2.1).

---

## 4. Cortex layers read and written

**Reads:** `competitive` (the canonical competitor list seeds the subscription's `competitor_domains` at registration — a read at registration time, never a forked copy; known competitors also frame event cards: "GiveWise — tracked competitor" vs "new domain"), `products` and `customers` (indirectly, through research's brief generator when a response drafts — not re-read here), `market` (light: seasonal framing on trend-event recommendations). Every read tolerates emptiness: no competitive layer means the subscription registers topic spaces only and the platform's competitor monitor has less to go on — stated on S3, never an error.

**Writes — `competitive` proposals only**, per the integration §4.1 assignment (originating subsystem: "Discovery; **radar response context**"). The provenance boundary with research holds: research proposes what Discovery's deliberate analysis found; radar proposes what *sustained inbound pressure* revealed — typically a previously-unknown domain repeatedly publishing into the org's territories:

```jsonc
{
  "targetLayer": "competitive", "action": "enrich", "confidence": 0.0-1.0,
  "payload": {
    "competitors": [{ "name": "…", "website": "spareapp.io",
                      "positioning": "…",
                      "content_strategy": { "territories_active": ["Trust & Transparency"],
                                            "publishing_cadence": "~2/week observed", "formats": ["guides"] },
                      "observed_via": "intelligence_feed" }],
    "positioning_observations": [{ "observation": "…", "territory": "…" }]
  },
  "evidence": [{ "source": "dm_radar_events",
                 "detail": "event ids, feed_event_ids, source URLs, the coverage analyses, observation window" }]
}
```

**Evidence floor:** ≥3 distinct events from the domain into the org's topic spaces within the observation window, named URLs, at least one coverage analysis. Additive only; scalars never touched. Raw events, dismissal patterns, and subscription payloads never become proposals — blocked by `filterProposal` (additive entries `radar_event`, `dismissal_pattern`, `subscription_payload` — a flagged write-back, §10) *and* structurally unreachable: proposals construct only from this explicit pressure-aggregation output.

---

## 5. Approval touchpoints

This spec **originates urgency and routing; it owns no decision surface:**

| Moment | Type | Role here | Notes |
|---|---|---|---|
| Fast-track publish (`dm_content_publish`, fast-track override) | **review**, 24h / `cancel` | **Originates** the piece and the clock; editor-review hosts the decision; publishing executes | The one-shot Workflow registration is stated on the card's preview and executes with the approval (D33) — on the card, never silent |
| Standard-track response (Outwrite / Add to Calendar) | **strategic** (`dm_program_change`) | **Originates** a scoped single-slot `dm_propose_calendar` through research's Program path | The right weight for a deliberate plan addition; the event is the proposal's originating evidence |
| Queue Refresh | review (downstream) | **Originates** the lifecycle job; lifecycle owns the diff decision | The pressure record attaches (lifecycle §2.3) |
| Reddit answer readiness | Sentinel-gated (downstream) | **Originates** the split; splits owns queue semantics and the `social_split` gate (ask #9) | |
| Competitive proposal | Cortex pipeline | §4's evidence-floored aggregation | Not the approval system |
| Dismiss / acknowledge / pattern reversal / subscription edits | — | In-app collaborative checkpoints; nothing leaves the system | Dismissal feedback to the platform is telemetry under ask #3's contract, not an action requiring approval |

**Standalone:** no feed exists (sensing requires the platform agents — orchestration-gated by nature), so no events, no responses, no clocks. The surfaces render the honest empty state (§8); nothing here forks.

---

## 6. Data — Data Tables appendix

All tables `account_id`-scoped (`uuid not null references auth.users(id)`), **RLS mandatory** (`using (account_id = auth.uid())`), migrations sequential in the monorepo `supabase/migrations/`. SQL-sketch format for `specs/data-model.md` consolidation.

```sql
-- DM's response state over platform feed events (the feed row is platform-owned; never written by DM)
create table dm_radar_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  feed_event_id uuid not null,               -- kinetiks_intelligence_feed reference (or inject-route synthetic in dev)
  event_type text not null check (event_type in
    ('competitor_published','news_story','keyword_spike','community_spike')),
  title text not null,
  summary text,                              -- platform-side summary, carried for rendering
  source_urls jsonb not null,
  platform_relevance float,                  -- the prior (relevance_to_subscription)
  dm_relevance float,                        -- D34 re-score; null + method stated when pgvector absent
  scoring_method text not null check (scoring_method in ('embedding','keyword_fallback')),
  severity text not null check (severity in ('high','medium','low')),
  severity_dampened_by uuid,                 -- dm_radar_dismissal_patterns, when a pattern applied (auditable)
  affected_territory_id uuid,                -- dm_territories
  affected_cluster_id uuid,                  -- dm_clusters
  affected_piece_id uuid,                    -- dm_pieces — the strongest attribution
  coverage_analysis jsonb,                   -- competitor_piece_analysis output: deltas, format, recency, urls read
  suggested_response text not null check (suggested_response in
    ('respond_new_piece','refresh_existing','fast_track','reddit_answer','monitor','none')),
  response_rationale text not null,          -- no medium+ event without it (the v1 law, schema-enforced)
  status text not null default 'new' check (status in
    ('logged','new','seen','responded','dismissed','expired')),
  response_refs jsonb,                       -- { refresh_draft_id?, piece_id?, proposal_id?, split_ids? } — §2.7
  dismissed_reason text,
  expires_at timestamptz,                    -- honored from the feed; default 14d for trend types
  created_at timestamptz default now(),
  resolved_at timestamptz
);
create index idx_dm_radar_open on dm_radar_events (account_id, status, severity)
  where status in ('new','seen');
create index idx_dm_radar_piece on dm_radar_events (account_id, affected_piece_id)
  where affected_piece_id is not null;       -- the Corpus Map pressure treatment + lifecycle's record source
create unique index idx_dm_radar_feed on dm_radar_events (account_id, feed_event_id);

-- Dismissal patterns (D37's local layer: logged, listed, reversible; forwarded upstream separately)
create table dm_radar_dismissal_patterns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  pattern jsonb not null,                    -- { event_type, topic_space_ref, source_domain? }
  dismissal_count int not null default 1,
  severity_adjustment text not null default 'none' check (severity_adjustment in ('none','dampen_one_level')),
  example_event_ids uuid[] not null,         -- the dismissals that built it (evidence)
  reversed_at timestamptz,                   -- reversal restores severity prospectively, logged
  forwarded_to_platform boolean not null default false,  -- D37's upward half, per ask #3
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Subscription registration state (what DM told the platform, when — the audit of §2.2; not a watch table)
create table dm_radar_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  payload_digest text not null,              -- hash of the registered §2.2 payload
  topic_space_count int not null,
  competitor_domain_count int not null,      -- read from Cortex competitive at registration time
  event_types text[] not null,
  status text not null default 'registered' check (status in ('registered','stale','failed','unavailable')),
  registered_at timestamptz not null default now(),
  platform_ack jsonb                         -- the subscription API's response, when ask #3 ships
);
```

**Columns this spec contributes to `dm_pieces`** (canonical in `specs/data-model.md`): `track text not null default 'standard' check (track in ('standard','fast'))`, `radar_event_id uuid` (response provenance — "why does this piece exist?" answers with the event), `merge_later_flag jsonb` (the deferred cannibalization overlap, consumed by lifecycle's convert-to-evergreen).

**v1 tables that do not return** (for `data-model.md`'s list): `radar_watches` (→ platform A4 agents + `dm_radar_subscriptions` as the registration audit — watches are deleted scope, and the table's absence is the proof), org-scoped `radar_events` (→ `kinetiks_intelligence_feed` for the event + `dm_radar_events` for DM's response state — the v1 conflation of sensing and responding, split at the table level), digest state/crons (→ the platform notification path, D36).

---

## 7. Surfaces & Explainability

Primitives per doc-system §3.3 (reconcile with `ux/experience-architecture.md` when it lands): **P1** propose→review→approve · **P2** diff surface · **P3** generation theater · **P4** evidence drawer. No parallel primitives. The Research Overview tile and the Corpus Map pressure treatment are contributions to research's surfaces (§2.7), not surfaces here; the fast-track clock on queue rows is editor-review's S1, fed from here.

### S1 — Radar (the feed)
**Purpose:** the instrument panel — severity-ranked events, each with its attribution, evidence, and one obvious action; the collapsed low-relevance roll-up; the health line. Sparse by design: what it doesn't show is the feature. **Narrative moment:** Tuesday morning ("radar events with one-click respond" — the doc-system narrative, verbatim). **Primary action:** the top high-severity event's recommended response; when the feed is quiet, none (the health line is the content). **Primitives:** P1 (every medium+ event card is a proposal: the recommended response with alternatives, dismiss), P4 (every severity opens its scoring — platform prior, DM re-score, method, the attribution chain; every recommendation opens its rationale and the coverage analysis; every clustered story opens its sources).
**Five states:** *Empty* — **connected, quiet:** the health line ("subscriptions healthy · last delivery {time} · no events need attention — a quiet feed means a quiet week"), watch coverage summarized, never a blank that could mean broken. **Standalone:** the honest instrument — what Radar watches when connected (competitor publishes, news, spikes, community), rendered as the inert panel with the upgrade CTA naming the concrete gain; no dead buttons, no fake events. *Loading* — card skeletons, health line first. *Populated* — severity-grouped cards (the PATCH-006 anatomy carried: event, attribution, coverage delta, recommended response with rationale, alternatives, source links, dismiss), the capped overflow expandable, the low-relevance roll-up collapsed ("37 low-relevance events this week"). *In-progress* — a response executing renders its routing live on the card ("refresh queued — generating," "fast track: drafting now," with the downstream theater deep-linked). *Failed/partial* — a subscription failure or stale registration renders on the health line with the re-register affordance; a failed response action surfaces the downstream error verbatim on the card with retry; scoring under keyword fallback states itself on every affected card.
**Why:** "why is this high severity?" → the attribution (your hub, your ranking, their coverage delta); "why am I not seeing more?" → the cap, the dampened patterns (each reversible), the pre-filter; "why did this disappear?" → expiry, with the event retrievable in the closed list.

### S2 — Event Detail & Response
**Purpose:** one event, fully evidenced, and the response launched from inside the evidence — the coverage analysis side by side with our piece, the auto-brief previewed before anything routes. **Narrative moment:** the minute between noticing and deciding. **Primary action:** execute the recommended response. **Primitives:** P4 (the analysis *is* an evidence surface: their coverage vs ours, recency, format, the clustered sources; the scoring chain in full), P2 (competitor-vs-ours coverage renders as a comparison on the canonical viewer's rendering conventions — a comparison view, not a new primitive), P1 (each response path is a proposal with its consequence stated: the fast track names its 24h clock and the Workflow it will register on approval; the standard track names the strategic proposal it will submit; Queue Refresh names the lifecycle job), P3 (a launched fast track streams generation's theater scoped here).
**Five states:** *Empty* — n/a by construction (the surface mounts on an event); the specced state is an expired/closed event: rendered read-only with its outcome and "this window has closed," never a live action on a dead trend. *Loading* — the event renders immediately from the feed payload; the coverage analysis loads independently and never blocks the card. *Populated* — the full anatomy + response launcher with the auto-brief preview. *In-progress* — analysis running ("reading their piece — 2 of 3 sources"), or a response routing with the downstream state live. *Failed/partial* — an unreachable source URL degrades the analysis to the reachable sources with the gap named; a downstream failure (lifecycle at cap, generation failed) surfaces the owning subsystem's actionable error and the event stays open.
**Why:** "why this response and not that one?" → the rationale with the alternatives' tradeoffs; "what exactly will happen if I click this?" → the stated consequence per path, before the click — the D33 transparency rendered.

### S3 — Subscriptions & Tuning
**Purpose:** the user calibrates the instrument — what is registered, coverage per territory, dampened patterns, caps. Radar feels like equipment, not a black-box news service (the v1 principle, carried). **Narrative moment:** Monday planning's "is the sensor array pointed right?"; the post-dismissal "stop showing me these." **Primary action:** re-register when stale; otherwise review dampened patterns. **Primitives:** P1 (re-registration previews the payload delta; pattern reversal confirms), P4 (every topic space opens what was registered and when; every pattern opens the dismissals that built it; the competitor list opens its Cortex provenance).
**Five states:** *Empty* — no architecture yet: "Radar watches what Research defines — define territories first," routed, with the why. Standalone: the registration this account *would* make, rendered inert with the upgrade CTA. *Loading* — skeletons. *Populated* — topic spaces with registration state, competitor domains with the Cortex read-time stamp, event-type toggles, caps (visible, config), dampened patterns with reversal. *In-progress* — a re-registration running with the payload diff shown. *Failed/partial* — a failed registration names the platform error with retry; `unavailable` (ask #3 pre-ship) states exactly that, with the inject-route note visible only in dev builds.
**Why:** "why isn't Radar covering this topic?" → the registration state and the territory it lacks; "why did severity drop on these?" → the pattern, its dismissals, its reversal.

---

## 8. Standalone mode

Sensing requires the platform's A4 agents — orchestration by nature, not by gating choice — so standalone Radar is **the instrument shown honestly, inert** (integration §9's row, implemented):

- **S1/S3 render the honest empty states:** what Radar watches when connected, the registration this account would make from its existing territories, the upgrade CTA naming the concrete gain ("Your content would know the day a competitor publishes into your clusters"). No fake events, no dead buttons, no DM-side crawlers in any mode — the absence is the platform's, named.
- **Everything downstream of an event is mode-independent and ships anyway:** the fast-track pipeline path (generation §2.1's trigger exists unconditionally), the `track` column and merge-later semantics, lifecycle's pressure-record contract, the splits invocation shape — all exercised in dev via the inject route, all live the moment an upgraded account's subscription registers.
- **On upgrade:** registration fires from existing territories/clusters/competitive (the §2.2 payload), and the feed begins. Nothing migrates because nothing accumulated; `dm_radar_subscriptions` records the first registration like any other.
- **Cortex emptiness (either mode):** no competitive layer → topic-space-only registration, stated; no territories → S3's routed empty state. Degraded framing, never degraded honesty.

---

## 9. Model/task mapping (`@kinetiks/ai` configuration)

**Scoring is embeddings and arithmetic before it is ever a model call** — the relevance pre-filter runs first, so the LLM never sees (and the user never pays for) an irrelevant event. Summarization and story clustering are platform-side (ask #3); they do not appear here. Task keys:

| Task key | Tier | Used in |
|---|---|---|
| `severity_classification` | fast | §2.3 — high/medium/low over the attribution + org context |
| `response_recommendation` | standard | §2.3 — which response, and why; rationale written against the evidence, never inventing data |
| `competitor_piece_analysis` | standard | §2.3/§2.5 — coverage delta from the event's source URLs vs our piece/cluster |
| *consumed, not owned:* `brief_generation` (research §9), the full generation pipeline (generation §9), splits' tasks | per their owners | §2.5–§2.6 — Fast Track reuses the standard task models unchanged (the PATCH-006 rule, carried verbatim) |

**Embeddings** via the shared configuration (ask #12 — radar is its named third consumer; the DM-local `EMBEDDING_CONFIG` interim applies identically). **Fallback discipline** per generation §9 (fast → standard, standard → craft, logged). **Cost controls:** the pre-filter gates every LLM call · severity and recommendation run once per surfaced event · coverage analysis runs automatically only at high severity, on demand otherwise, bounded by the event's source list · re-registration debounced daily · the presentation cap bounds the daily ceiling structurally.

---

## 10. Platform dependencies and write-backs

**Existing asks this spec depends on:** **#3 (central, entirely)** — the A4 agents, the event shapes, the subscription API, the feed discipline; the interim is §2.1's dark-but-complete build with the dev inject route, and DM-side crawlers remain deleted scope under any pressure. **#5** — pgvector for D34's scoring; interim: keyword fallback, wider net, the cap working harder, stated per card. **#8** — one-shot Workflow registration for fast tracks and the Programs path for standard-track proposals; interim: `dm_calendar` + in-app approval, the standalone path, costing nothing extra. **#9** — `social_split` for Reddit answers (splits' territory, noted for the chain). **#12** — embedding routing (third consumer, already annotated there by research).

**No new platform asks.** Sensing needs are ask #3's, whole; everything else routes through existing asks.

**Write-back flags (filed, not silently applied):**
1. `platform-asks.md` #3: annotate that §2.2 of this spec is the DM-contributed event-shape, subscription, and feed-discipline contract the ask references — the ask's "(defined in radar-response.md)" pointer now resolves.
2. `dm-platform-integration.md` §2–§3 (the D35 proposal): add read-only `dm_get_radar_events` with the §3 description and decide its capability home (`content_freshness`'s description already gestures at it; a distinct capability is the alternative); additive `/api/dm/status` feature `radar_events_pending` for Marcus's connection awareness. Until accepted: internal routes only.
3. `dm-platform-integration.md` §4.1: additive `filterProposal` blocklist entries `radar_event`, `dismissal_pattern`, `subscription_payload` (§4 here).
4. `specs/research-architecture.md` §2.5/§7-S5: additive — the approval-time cannibalization check gains the `track='fast'` exclusion with the merge-later flag in place of the three-way checkpoint (consumed at convert-to-evergreen, lifecycle §2.5). Behavior change to an approved spec, flagged, never silently applied.
5. `specs/splits.md` (forward): the §2.5 Reddit-answer invocation shape is the binding consumer contract that spec fills; deltas come back here as write-backs.
6. `specs/lifecycle-freshness.md` §2.3: confirmation that this spec fills the external-pressure record verbatim — no delta needed (recorded so the forward contract closes cleanly).

---

## 11. Self-check

| Mandatory section | Present |
|---|---|
| Purpose | §1 |
| Mechanism | §2 |
| Data (dm_* tables, SQL-sketch Data Tables appendix) | §6 |
| Tools exposed (names, consequential flags, Marcus-grade descriptions) | §3 (none ship — deliberate, with the rationale, the attributed-view gap named, and the D35 write-back proposal carrying a Marcus-grade description) |
| Cortex layers read/written, proposal shapes, evidence requirements | §4 (reads: competitive/market, light, degradations stated; writes: `competitive` proposals with concrete shape and an event-count evidence floor) |
| Approval touchpoints and types | §5 |
| Surfaces & Explainability (screens, five states each, evidence, "why", canonical primitives only) | §7 (S1–S3; P1–P4 only; comparisons render on the canonical viewer's conventions, never a fifth primitive) |
| Standalone mode (exact empty-Cortex behavior) | §8 |
| Model/task mapping via `@kinetiks/ai` | §9 (sensing-side tasks absent by design; response drafting consumed from its owners) |

**Locked decisions:** **sensing platform-owned, response DM-owned** — no watcher exists in any mode; the boundary's one edge (reading delivered URLs) is stated and tested by direction-and-trigger; the interim is dark-but-complete, never a stopgap crawler — §2.1 ✓ · **one approval decision** — every response routes into existing decision surfaces; the fast track's Program mutation rides the publish approval's card; this spec creates no decision surface — §2.5, §2.6, §5 ✓ · **calendar as Program** — D33's two paths are the only Program touches; nothing mutates silently — §2.5, §2.6 ✓ · Cortex canonical — competitive read at registration, proposed through the pipeline with an evidence floor, never forked — §2.2, §4 ✓ · zero analytics ingestion — nothing here reads or stores analytics ✓ · standalone-first — §8 (honest inert instrument; downstream machinery mode-independent) ✓ · single company per account — §6 ✓.
**No surface without five states** — S1–S3 ✓. **No invented primitives** — P1–P4 only ✓. **New platform dependencies:** none assumed; none needed — ask #3 covers sensing whole, with this spec supplying its DM-contributed contract ✓. **Changes to approved/earlier docs flagged for write-back, not silently applied** — §10 (including the research §2.5 behavior change and the D35 tool proposal) ✓. **Boundary contracts stated from this side:** the subscription/event contract (provides to ask #3) · feed events (consumes via routing event 3; never writes the platform table) · the external-pressure record (fills lifecycle's contract verbatim) · the auto-brief (consumes research's generator and brief shape, no fork) · the fast-track trigger and queue jump (consumes generation §2.1) · the Reddit-answer invocation (binding forward contract splits fills) · `track`/merge-later (owns the columns; lifecycle owns convert-to-evergreen) · the quarterly roll-up (records outcomes; measurement renders) ✓.

---

*Dark Madder v2 — specs/radar-response.md — June 2026*
