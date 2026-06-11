# Dark Madder - Platform Asks

> **CANONICAL. Work Dark Madder needs from the Kinetiks core, tracked explicitly so nothing is assumed.**
> **Date:** June 2026
> **Authority:** subordinate to `dm-product-spec.md` and `dm-platform-integration.md`. Each ask states what DM needs, why, which DM specs depend on it, the suggested owner, and what DM does in the interim if it ships late. "DM-contributed" means the DM build supplies the spec or code, but it lands in platform-owned territory and the platform team reviews and owns it.
> Status values: `proposed` (filed, not scheduled), `planned` (on a platform roadmap or build order), `partial` (some of it exists), `shipped`.
> Nothing in DM's build plans may silently assume an ask has shipped. Build phases reference asks by number; the interim behavior below is the default until an ask flips to `shipped`.

---

## Ask 1 - Cortex Products layer schema extension

**Status:** proposed
**What DM needs:** the Products layer extended to expert-writer depth, generalizing PATCH-002's product profile: problem statement plus problem-depth dimensions (`{dimension, description, who_it_affects, severity}`) and world-without-product; mechanism (`how_it_works`, ordered steps, technical details, features with `why_it_matters`); detailed personas (`{pain_points, goals, objections, where_they_hang_out, search_behavior}`) and user journey; differentiators with evidence and honest competitive landscape (`where_they_win` included); common objections with honest answers and evidence; origin story and founding insight; current state, known limitations, and public-flagged roadmap; terminology, banned terms, approved descriptions; proof points with public flags; content integration rules. Plus a per-section profile-strength signal apps can read.
**Why:** the depth of product knowledge is the ceiling on content quality. An AI without the mechanism, the honest objections, and the language rules writes like it read the landing page once. Every app benefits: Harvest objection handling, Litmus pitch angles, Hypothesis page copy all draw on the same fields.
**Depends on it:** `specs/knowledge-trainer.md` (the trainer's guided intake populates these fields via proposals), `specs/generation-engine.md` (generation prompts consume them), `specs/research-architecture.md` (problem dimensions and personas seed territories).
**Suggested owner:** platform (Cortex schema and evaluation pipeline). DM-contributed: the field spec above, the section-by-section intake UX pattern, and "AI: help me fill this in" prompts, all proven in v1.
**If late:** DM stores the extended depth in a dm-private overlay (`dm_product_knowledge`, keyed to Cortex product ids) that generation reads alongside the shallow Cortex layer. Trainer output queues as deferred proposals. When the schema ships, the overlay migrates in via the proposal pipeline and the table is dropped. Cost of lateness: other apps don't benefit, and two reads where there should be one.

---

## Ask 2 - DataForSEO (and/or Ahrefs) as a platform integration, available to standalone-tier accounts

**Status:** proposed
**What DM needs:** keyword volume/difficulty, SERP, and backlink tools per the integration contract (flexible query tools, not canned reports; contract §11 checklist), with caching and rate limiting handled at the platform layer. Explicit requirement: available to standalone-tier accounts, since standalone users hold Kinetiks IDs and research is a first-hour standalone flow. Note the doc-system plan §3.2 contains a cross-reference typo ("see platform-asks §5" for this item; §5 is pgvector); this ask is the canonical home.
**Why:** research without keyword data is opinion. The platform owns all external data connections (locked decision: zero ingestion in DM); Litmus and Hypothesis will want the same tools.
**Depends on it:** `specs/research-architecture.md` (clusters, difficulty, opportunity ranking), `specs/measurement.md` (rank tracking inputs), `specs/lifecycle-freshness.md` (SERP-gap signals).
**Suggested owner:** platform integration; DM-contributed candidate for the provider implementation (the DM team knows the DataForSEO API surface from v1).
**If late:** research runs on LLM-derived territories plus GSC data where connected, with the evidence drawer stating "no keyword volume data" wherever numbers are missing. Never fabricated volumes, never a hidden degradation. Opportunity ranking falls back to corpus-gap and competitive signals.

---

## Ask 3 - A4 intelligence agents with subscribable event shapes

**Status:** planned (roadmap Phase A4) / proposed (event-shape and subscription contract)
**What DM needs:** the competitor monitor, SEO monitor, and content scanner shipping to `kinetiks_intelligence_feed`, plus two contracts DM consumes: (a) event shapes, generalized from PATCH-006's radar_events: `{event_type: competitor_published | news_story | keyword_spike | community_spike, title, summary, source_urls, relevance_to_subscription, severity, affected_entity?, expires_at}`, with same-story clustering so one regulation is one event citing five sources; (b) a topic-space subscription API so DM can register its territories and cluster embeddings and receive only events relevant to them. DM also asks that PATCH-006's relevance discipline become feed-level requirements: embedding pre-filter before any LLM call, severity caps per day, expiry on trend events, and dismissal feedback that the agents learn from.
**Why:** sensing is platform-owned (locked decision 4a); the same watchers serve Harvest (competitor pricing), Litmus (news hooks), and Marcus's briefs. DM owns only the response machinery.
**Depends on it:** `specs/radar-response.md` entirely; `specs/lifecycle-freshness.md` (competitor-published events against an existing piece are freshness signals); `specs/measurement.md` (quarterly competitor-movement roll-up is a roll-up of these events).
**Suggested owner:** platform (agents and feed). DM-contributed: the event-shape spec, the subscription requirements, and the relevance-discipline requirements, all carried from PATCH-006 into `specs/radar-response.md`.
**If late:** the radar response surface ships dark but complete: relevance scoring, the feed UI, and one-click responses are testable via manual event injection (`POST /api/dm/radar/inject`, dev-only). No DM-side crawlers get built under any schedule pressure; sensing in DM is deleted scope, not deferred scope.

---

## Ask 4 - GA4 + GSC extractors live (roadmap A1), and the analytics-spec DM metric table corrected

**Status:** planned (roadmap Phase A1)
**What DM needs:** GA4 and GSC integration tools live and queryable (sessions, page paths, conversions; search queries, page performance, index status), reachable through the Oracle and directly via integration tools. Bundled correction: `analytics-goals-engine-spec.md` §3.3's Dark Madder metric table predates the zero-ingestion decision; it uses `dark_madder.*` keys against the contract's binding `dm_` prefix and lists traffic/engagement metrics DM will not report. It should be revised to the seven `dm_*` keys in `dm-platform-integration.md` §8, with traffic and attribution owned by GA4/GSC plus the Oracle's attribution model.
**Why:** measurement and freshness consume this data through platform tools or not at all.
**Depends on it:** `specs/measurement.md` (performance scoring, health reports, recommendations), `specs/lifecycle-freshness.md` (decay trajectories, SERP gaps), `specs/ai-visibility.md` (joins citation share with organic performance).
**Suggested owner:** platform.
**If late:** measurement shows DM production metrics only with explicit "Connect GA4 / GSC" empty states (designed in `ux/screen-system.md`, not improvised); freshness runs on recency and claim-date signals only and says so.

---

## Ask 5 - pgvector enabled on the shared Supabase project

**Status:** proposed
**What DM needs:** the `vector` extension enabled project-wide, plus agreement on index conventions (HNSW vs IVFFlat, dimension standard) since enabling is project-wide and other apps will follow.
**Why:** `dm_embeddings` powers corpus intelligence (semantic cannibalization detection, corpus map, backward link sweep) and radar relevance scoring against territory centroids.
**Depends on it:** `specs/research-architecture.md` (corpus intelligence), `specs/radar-response.md` (relevance scoring), `specs/lifecycle-freshness.md` (related-piece detection).
**Suggested owner:** platform infrastructure. One migration; the ask exists because it is project-wide, not because it is hard.
**If late:** corpus features ship behind a feature flag; keyword clustering falls back to lexical methods; cannibalization detection is disabled rather than faked. Radar relevance falls back to keyword matching with a wider net and the severity cap doing more work.

---

## Ask 6 - Approval deep-link bidirectional resolution and collaborative-workspace rendering of DM surfaces

**Status:** partial
**What exists:** the approval-system spec already provides `deep_link` on submissions, "View in [App]" on review/strategic cards, inline editing, and `POST /api/approvals/action`.
**What DM still needs:** (a) a documented guarantee that app-side calls to `/api/approvals/action` resolve the queue item with identical learning-loop behavior (edit-diff classification, threshold effects) as card-side decisions, with idempotent double-action handling, because the locked one-decision rule makes the DM editor a first-class approval surface, not a viewer; (b) the collaborative workspace rendering the DM editor and draft queue in the desktop split panel with presence, annotations, and takeover per `collaborative-workspace-spec.md`, since those are the surfaces Marcus opens when discussing content.
**Depends on it:** `specs/editor-review.md` (the approval handoff is its central mechanism), `dm-platform-integration.md` §5.5.
**Suggested owner:** platform (approval API contract and workspace embedding); DM-contributed: the editor's embed mode (it is specced for both dm.kinetiks.ai and the panel).
**If late:** resolution runs one-directional (card deep-links into the editor; editor decisions post to `/api/approvals/action` best-effort with reconciliation on conflict) and the workspace opens DM in a plain webview without presence. Functional, not the product promise.

---

## Ask 7 - Author concept in Cortex (flag for future)

**Status:** proposed (flag, not scheduled)
**What DM needs:** eventually, a personal-voice concept in Cortex distinct from org voice: the human author behind the content, with their own calibration, usable across apps (Harvest emails in the founder's voice, Litmus pitches likewise).
**Why:** the v1 "user voice" proved that org voice alone flattens founder-led content. It is dm-private today only because Cortex has no Author concept.
**Depends on it:** nothing blocks on it. `specs/knowledge-trainer.md` and `specs/generation-engine.md` use the dm-private author layer indefinitely.
**Suggested owner:** platform (Cortex concept), whenever a second app wants it.
**If late:** permanent interim is acceptable: `dm_author_voice` stays dm-private. The ask exists so the platform knows the concept is proven and waiting.

---

## Ask 8 - Programs system shipped, with the app-facing surfaces DM needs

**Status:** planned (`programs-spec.md` exists; build steps 1-3 cover the hierarchy, 5-6 cover verification and incidents) / proposed (the three app-facing gaps below)
**What DM needs:** the Goal/Program/Workflow/Task hierarchy live (`kinetiks_programs/_workflows/_tasks`, policies, correlation IDs, approval windows), plus three things the spec implies but does not define for apps:
1. **App-initiated Program registration.** The Autopilot's compiler spawns Programs top-down; DM also registers bottom-up when a user commits a publishing plan (`dm_propose_calendar`). Needed: a registration/mutation API callable through the Synapse, and the coexistence rule (one content Program per goal; app proposals mutate an existing Program rather than duplicate, per `dm-platform-integration.md` §6.1).
2. **Bidirectional Task state sync.** Apps as source of truth for their work-product state, pushing transitions into `kinetiks_tasks`, with platform-initiated transitions (checkpoint timeouts, pause, cancel) delivered back as commands/routing events. The status mapping DM implements is in `dm-platform-integration.md` §6.3.
3. **Goal-less registration path.** `goal_id` is NOT NULL; accounts without a content goal need the goal-suggestion bundle at calendar approval (analytics-goals spec §2.3) formalized so the strategic approval can create goal and Program together.
**Why:** the locked decision makes the calendar a Program; Marcus's brief and goal tracking treating content as operated work depends entirely on this.
**Depends on it:** `dm-platform-integration.md` §6 and §7, `specs/research-architecture.md` (publishing plan commit), `specs/measurement.md` (Adjuster recommendations mutate the Program), `specs/radar-response.md` (fast-track slots inject into the Program).
**Suggested owner:** platform (the hierarchy and APIs). DM-contributed: the content Program and "{Cluster} Engine" Workflow templates, the status mapping, and DM's verification check implementations.
**If late:** `dm_calendar` and `dm_pieces` operate with identical user-facing semantics and no platform registration (exactly the standalone path, so this costs no extra build); metrics still report via Synapse so the Analytics tab sees content output. On shipping, registration backfills from existing state per the migration mapping in `specs/data-model.md`.

---

## Ask 9 - Sentinel content types for DM's external content

**Status:** proposed
**What DM needs:** three explicit Sentinel content types with review criteria: `published_article` (long-form web content; brand safety, claims, compliance at article length), `article_refresh_diff` (reviewed as a diff so Sentinel evaluates the changes in context rather than re-adjudicating an already-shipped piece), `social_split` (per-platform norms; what is fine on Reddit is not fine on LinkedIn). Marcus F2 currently infers `dark_madder -> blog_post` only.
**Why:** Sentinel gates DM's publish boundary (`dm-platform-integration.md` §4.4); wrong-granularity review either rubber-stamps or false-positives, and both erode the trust architecture.
**Depends on it:** `specs/publishing.md`, `specs/lifecycle-freshness.md`, `specs/splits.md`.
**Suggested owner:** platform (Sentinel). DM-contributed: the per-type review criteria.
**If late:** DM submits everything as `blog_post`, refresh diffs sent post-merge (whole-document review). Functional with weaker signal; splits get blog-post-grade review, which over-blocks Reddit-voice content, accepted as the safe direction for an interim.

---

## Ask 10 - Synapse command-handler template and capability registration in `@kinetiks/synapse`

**Status:** planned (command-router spec, Phase 4 build order item 4) - tracked here so it is sequenced, not assumed
**What DM needs:** the standard `SynapseCommandHandler` interface, the Realtime channel listener, capability registration (`POST /api/synapse/register`, `PUT /api/synapse/capabilities`), and `CommandProgress` streaming in the shared package, so DM's generated adapter (`dm-platform-integration.md` §4.2, decision C) is configuration on top of platform plumbing rather than bespoke transport code.
**Why:** the command router is how Marcus commands and Autopilot Tasks reach DM; per decision C DM maintains one capability definition and generates this surface from it, which only works if the surface's plumbing is shared.
**Depends on it:** `dm-platform-integration.md` §4.2 and §6, every chat-driven DM flow (`/dm draft ...`, "draft a post about X").
**Suggested owner:** platform (it is already in the Phase 4 build order).
**If late:** the Marcus tool path already works (tools.ts is registered and routed per Marcus F2), so chat-driven DM functions without the router. Command dispatch, multi-app orchestration, and Autopilot Task execution into DM activate when the template lands; because the adapter is generated, activation is a registration call, not a build.

---

## Summary table

| # | Ask | Status | Blocking for | Interim acceptable? |
|---|---|---|---|---|
| 1 | Cortex Products extension | proposed | Generation quality ceiling | Yes (dm-private overlay) |
| 2 | DataForSEO integration + standalone access | proposed | Research data quality | Yes (degraded, honest) |
| 3 | A4 agents + event/subscription contract | planned / proposed | Radar response | Yes (ships dark) |
| 4 | GA4 + GSC extractors + analytics-spec fix | planned | Measurement, freshness | Yes (empty states) |
| 5 | pgvector | proposed | Corpus intelligence | Yes (feature-flagged) |
| 6 | Approval bidirectionality + workspace rendering | partial | Editor-as-approval | Yes (one-directional) |
| 7 | Author concept | proposed (flag) | Nothing | Yes (permanent ok) |
| 8 | Programs system + app surfaces | planned / proposed | Calendar-as-Program | Yes (internal calendar) |
| 9 | Sentinel content types | proposed | Publish-gate precision | Yes (generic type) |
| 10 | Synapse command-handler template | planned | Command/Task dispatch | Yes (tool path works) |

---

*Dark Madder v2 - Platform Asks - June 2026*
