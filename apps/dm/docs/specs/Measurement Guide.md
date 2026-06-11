# Dark Madder — Measurement

> **Spec:** `specs/measurement.md` — subsystem spec 6 of 10 per `dark-madder-v2-doc-system.md` §7.
> **Date:** June 2026 · **Status:** Draft for approval
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > `platform-contract.md` and `dm-platform-integration.md` (binding at the app boundary — §8 of the integration doc is this spec's metric constitution, decision D therein included) > `ux/experience-architecture.md` (binding for surfaces; not yet written — primitives cited are the four from doc-system §3.3, to be reconciled) > `platform-asks.md` > this spec.
> **Sources consolidated:** ARCHIVE-Analytics_Adjuster (scoring model, trajectory, cadences, outliers, report structures, the Adjuster trigger table, dashboard intent — **with ALL ingestion deleted** per the locked decision), ARCHIVE-PATCH-003 (topical authority metrics — composition reported here, components computed by research), ARCHIVE-PATCH-007 §5 (the AI-citation scoring amendment and the snapshot shape this spec consumes), ARCHIVE-PATCH-004 §3 (the trajectory interface lifecycle-freshness consumes). All superseded by this document for the territory it covers.
> **Depends on:** `specs/publishing.md` (published pieces, live URLs, `published_body`, publish/refresh transition events). **Consumed contracts defined here, implemented elsewhere:** authority components from `specs/research-architecture.md` §2.7; AI-visibility snapshots from `specs/ai-visibility.md` (written after this spec; it implements the shape in §2.7 here).
> **Decisions baked in (continuing the global series):** **D19** snapshots store evidence-at-scoring-time (frozen input values with source + `fetched_at`), never pointers, never a metrics store. **D20** score weights, thresholds, and the authority composite are versioned config-as-data, seeded with v1 + PATCH-007 values. **D21** Program-mutating recommendations stage into a pending plan-change set submitted as one combined strategic proposal, with a per-rec submit-now shortcut. **D22** measurement owns the single daily metric reporter. **D23** the biweekly scan shares one clock with ai-visibility's probe cycle; monthly report; quarterly review; on-demand always. **D24** research owns keyword-opportunity detection; the health report renders, never recomputes. **D25** narrative proposals are structured-attributes-first; post-hoc angle classification phases in later, always labeled model-derived. **D26** quarterly thresholds (cluster kill, rebalance triggers) are seeded config under D20's mechanism.
> **Locked decisions honored:** **zero analytics ingestion** — every external number arrives through platform integration tools or the Oracle at computation time; nothing here connects, pulls on schedule into raw stores, or caches API responses; Cortex canonical (one proposal class, evidence-floored); one approval decision (recommendations route into existing approval machinery, never a parallel one); platform-owned sensing (competitor movement is a roll-up of A4 events, never DM watchers); calendar as Program (rebalancing mutates it through propose/approve only); standalone-first; single company per account.

---

## 1. Purpose

Measurement is the Adjuster reborn: Dark Madder's honest scoreboard and its steering-proposal engine. It answers *is the content working, where, and what should change* — computed from platform integration data (GA4, GSC, DataForSEO) and Oracle intelligence joined with `dm_*` production data, unified with the numbers DM's own intelligence layers produce (topical authority from research, AI share of voice from ai-visibility), and acted on exclusively through proposals into existing machinery. Four properties define it:

1. **Zero ingestion, total honesty.** v1's OAuth pipelines, scheduled pulls, raw snapshot stores, and API-cache tables are deleted, not ported. Scores compute from platform tool queries at scan time; what persists is the *derived judgment* with its frozen evidence (D19). Every output carries `sources_used` and `gaps` as first-class fields — the `dm_get_content_performance` return shape is the spec's character in miniature: scored, evidence-backed, and explicit about what was unavailable. Missing sources renormalize out of composites; they are never faked, zeroed punitively, or silently omitted.
2. **One owner per number.** Research computes cluster cohesion, drift, and orphan counts; ai-visibility computes citation rates, share of voice, and sentiment; the Oracle owns traffic, attribution, and goals. Measurement **composes and reports** — `dm_corpus_authority_score` from research's components, the unified report from all three, the seven integration §8 metric keys to Oracle daily (D22). It re-derives nothing another subsystem owns (D24 settles the last v1 overlap: keyword-opportunity detection belongs to research; the report renders it).
3. **It proposes; it never steers by hand.** The Adjuster trigger table carries intact as a recommendation engine whose every acceptance routes into existing v2 machinery: Program mutations through `dm_propose_calendar` (strategic, staged per D21), title/meta reworks through `dm_update_article` (quick), refresh-class findings into lifecycle-freshness jobs, indexing diagnoses into verification follow-ups. DM never silently edits a registered Program (integration §6.4), and measurement owns no second content system.
4. **Judgment is configuration; arithmetic is code.** Score weights, outlier thresholds, trigger conditions, and the authority composite ship as versioned, seeded config rows (D20) — changed through review, stamped on every snapshot they produced, tuned with the quarterly review's own evidence. The scoring math is deterministic; model calls diagnose and frame, never compute.

---

## 2. Mechanism

### 2.1 Cadence (decision D23)

| Cycle | When | What |
|---|---|---|
| **Biweekly tactical scan** | Shared clock with ai-visibility's probe cycle (PATCH-007 aligned probes to the Adjuster's pull; v2 keeps the shared clock with the dependency inverted, so the report's citation data is never half a cycle stale). Silent unless outliers fire. | Performance snapshots for every published piece (§2.3–2.4), outlier detection (§2.5), trigger evaluation (§2.10) |
| **Monthly health report** | 1st of the month (nearest weekday) | §2.8 — surfaced, persisted, the monthly-ritual narrative's anchor |
| **Quarterly strategic review** | Quarter end | §2.9 — the only point where the plan fundamentally changes, ending in a combined strategic proposal |
| **On-demand** | Always | Any scan, score, or report regenerates on request; `dm_get_content_performance` computes live |

Sub-biweekly scoring is deliberately rejected: GSC's 2–3 day lag and SEO's weekly timescales make faster cycles noise dressed as signal, at multiplied platform-tool cost. The Oracle's own 15-minute crons own real-time; measurement owns *judgment-grade* cycles.

### 2.2 Sources, and the honesty contract

Inputs, all read at computation time, none stored raw:

- **Platform integration tools:** GSC (impressions, clicks, CTR, position per page/query; index status), GA4 (engagement time, engagement rate, scroll events where configured), DataForSEO (rank tracking, backlinks/referring domains, SERP context) — asks **#4** and **#2**; interim behavior per those asks (DM production metrics only, with designed "Connect GA4 / GSC" empty states, never improvised).
- **Oracle:** routed insights arrive via `handleRoutingEvent` and land in research's Opportunities (integration §4.3 event 2 — not re-handled here); goal progress and content-attribution slices for the report's goal and ROI sections require the **proposed Ask 13** app-readable Oracle query surface (§10) — until it ships, those sections render stated absences.
- **DM production data:** `dm_pieces` (status, publish dates, voice scores, template, cluster, campaign, product integration level, correlation ids), `dm_generation_runs` (cost), publishing's transition events, research's authority components, ai-visibility's snapshots (§2.7).

**The line, stated:** measurement may *query* external sources and may *freeze the values it scored against* as evidence (D19). It may never build a pull schedule into a raw store, never serve frozen evidence as an analytics API, never backfill history from evidence rows. `dm_performance_snapshots` is work product — the research §2.3 "evidence at decision time" discipline, applied to scoring.

### 2.3 The performance score (decision D20)

The composite carries from v1 §3.1 with PATCH-007 §5.2's amendment applied, shipped as the **seeded default** in `dm_measurement_config` (versioned; every snapshot stamps the config version it was scored under):

| Signal | Seeded weight | Source | Scoring (seeded) |
|---|---|---|---|
| Search impressions | 15% | GSC tools | Logarithmic, relative to account average |
| Search clicks | 20% | GSC tools | Logarithmic, relative to account average |
| Average position | 20% | GSC tools | Top 3 = 100 · 4–10 = 70 · 11–20 = 40 · 21–50 = 20 · 50+ = 5 |
| Engagement time | 15% | GA4 tools | Above account average = 80+ · at = 50 · below = 20 |
| Scroll depth | 10% | GA4 tools (where configured) | >75% = 100 · 50–75% = 60 · <50% = 20 |
| Backlinks | 10% | DataForSEO tools | New referring domains weighted over raw links |
| AI citation | 10% | ai-visibility snapshots (§2.7) | **Continuous** (PATCH-007 §5.2): the piece's citation rate across probes where it is the `expected_piece` |

**Renormalization rule (the honesty mechanic):** any signal whose source is unavailable — GA4 not connected, DataForSEO not shipped, no probes map to the piece — is **omitted and the remaining weights renormalize**. A piece is never punished for an unconnected integration or an unprobed question space, and every snapshot records exactly which signals participated (`sources_used`) and which didn't and why (`gaps`). The v1 binary AI-citation bonus and the v1 ingestion that fed every row are dead.

Config rows cover: signal weights and scoring curves, trajectory thresholds (§2.4), outlier conditions (§2.5), trigger conditions (§2.10), the authority composite (§2.6), narrative-proposal evidence floors (§2.11), and the quarterly thresholds (D26: cluster-kill at 60+ days / multiple pieces / no positive trajectory; rebalance triggers). Changes version the config through review with the change's rationale recorded — the templates-as-data pattern (generation §2.2), applied to judgment.

### 2.4 Snapshots and trajectory (decision D19)

Each scan writes one `dm_performance_snapshots` row per published piece: the composite, per-signal subscores, **the input values used at scoring time** (impressions, clicks, position, engagement, backlink counts, citation rate — each stamped with its source and `fetched_at`), `sources_used`, `gaps`, and `config_version`. This is what makes three things possible without ingestion: trajectories (history of judgments), drawer-grade explainability ("why was this 28 in March?" answers with March's frozen inputs), and the voice correlation (§2.11).

**Trajectory** (config-thresholded, seeded at v1's ±15% between consecutive snapshots): `rising | stable | declining | new` (new = fewer than 3 snapshots). Trajectory is a **provided interface**: `specs/lifecycle-freshness.md` consumes it as the freshness score's position-trajectory input (PATCH-004 §3 weights it at 20% — that spec's call; this spec guarantees the feed), and the queue/library views render it (denormalized onto `dm_pieces`, §6).

### 2.5 Outlier flags

Evaluated every scan; each declares its required sources and degrades with a stated absence (an unconnected GA4 means the engagement anomaly *cannot fire*, shown as such, not silently skipped):

| Flag | Condition (seeded config) | Requires | Routed to |
|---|---|---|---|
| Positive outlier | Primary keyword reaches top 3 within 30 days of publish | GSC or DataForSEO | Expansion trigger (§2.10) |
| Zero-impression | 0 impressions 45 days post-publish | GSC | Indexing diagnosis → a verification follow-up on the piece (publishing's index-state check re-run, sitemap/crawl guidance) |
| CTR anomaly | Impressions > 500, CTR < 1% | GSC | Title/meta rework trigger (§2.10) |
| Engagement anomaly | Clicks > 100, engagement < 30s | GSC + GA4 | Hook/intent diagnosis → refresh-class trigger |

Flags surface as P1 cards on S1 and ride into the next health report; firing is silent otherwise (the v1 §4.1 posture, carried).

### 2.6 The authority composite

Research computes the components (research §2.7: per-cluster cohesion 0–100, the drift flag, orphan counts — "research computes, measurement reports"). Measurement **composes** `dm_corpus_authority_score`, seeded formula in config:

```
authority = sizeWeightedMean(cluster cohesion)
          − drift_penalty   (active drift flag, scaled by drift magnitude)
          − orphan_penalty  (orphan rate across published corpus)
          + ranking_breadth (distinct ranking keywords per published piece, normalized)
```

`ranking_breadth` requires GSC/DataForSEO and **renormalizes away** when absent (the §2.3 rule, applied to the composite). Recomputed weekly on research's cohesion cycle, carried forward daily in the metric report (integration §8's "recomputed weekly; value carried forward daily"). The composition formula and its weights are config; the components are research's numbers, consumed by reference with their computation timestamps in the evidence drawer. A clarifying write-back to integration §8 (composition owner) is filed in §10.

### 2.7 AI visibility, consumed (the contract `specs/ai-visibility.md` implements)

Measurement consumes per-cluster, per-cycle snapshots — the PATCH-007 §5.1/§5.3 shape, account-scoped:

```jsonc
// dm_ai_visibility_snapshots (owned and written by specs/ai-visibility.md; read here)
{ "cluster_id": "…", "cycle_date": "…",
  "citation_rate": 0.0-1.0, "share_of_voice": 0.0-1.0, "avg_position": float,
  "sentiment_factor": 0.0-1.0, "visibility_score": 0-100,
  "per_engine": { "...": { "cited": int, "of": int, "avg_position": float } },
  "expected_piece_rates": [{ "piece_id": "…", "citation_rate": 0.0-1.0 }],
  "unanswerable_core_questions": int }
```

Uses here: `expected_piece_rates` feeds the piece score's AI-citation signal (§2.3); cluster `visibility_score` and `share_of_voice` join the health report's cluster table (§2.8 — the doc-system's "AI share of voice unified here"); `unanswerable_core_questions` is the report's clearest demand-without-supply number. Ownership stays clean: ai-visibility computes everything in the snapshot and reports `dm_ai_citation_share` to Oracle (doc-system §3.4); measurement folds, joins, and renders. Since this spec ships first, the shape above is the binding consumer contract ai-visibility fills; deltas it needs are write-backs here, not silent divergence.

### 2.8 The monthly health report

Generated on the D23 cadence, persisted permanently (`dm_reports`), rendered on S3, surfaced through the platform notification path and Marcus's monthly-ritual narrative (no DM notification infrastructure — kill list). Sections, each with its sources and degradations stated inline:

1. **Cluster performance summary** — the strategic table, now three-dimensional (the unification): per cluster, pieces published/planned, mean performance score, trajectory, **authority cohesion** (research's number), **AI visibility score and share of voice** (ai-visibility's), and the standing recommendation. The v1 table's shape, with the two columns v1 couldn't have.
2. **Top performers** — the 5 best pieces with *what is working* (which signals drove it, from the snapshot's frozen inputs) and *replicable structural patterns* (template, section structure, citability traits the winners share — a standard-tier synthesis over production data).
3. **Underperformers requiring action** — live > 60 days, score below config threshold: diagnosed cause (from the outlier/trigger evidence) and the recommended action, each carrying its **execution arm** — *Queue Refresh* creates the lifecycle-freshness job with the diagnosis attached (PATCH-004 §4.1's handoff, kept), *Rework title/meta* stages a metadata recommendation, *Rewrite / pivot / kill* stages Program-mutating recommendations (§2.10).
4. **New opportunities** — **rendered from research** (D24): the month's new Opportunities (keyword gaps from GSC data, lexicon demand, AI citation gaps) with links into Research's surface. Measurement computes nothing here; one detector, one owner.
5. **Voice-quality correlation** — voice-match bands vs performance scores across the month's corpus (§2.11's first output): does the craft investment show up in outcomes? The validation loop the voice engine deserves, now with frozen-evidence rigor.
6. **Goal pace** *(connected mode, Ask 13)* — content-linked goal progress, pace, and the Oracle's top lever, read from the Oracle query surface; stated absence until the ask ships, and in standalone.

### 2.9 The quarterly strategic review

The only point where the plan fundamentally changes (v1 §4.3 carried, re-plumbed). Synthesized at **strategic tier** (§9 — the one direction-setting judgment task in DM so far), rendered on S4 as a guided flow ending in decisions, never auto-applied:

1. **Cluster map reassessment** — which clusters built real authority (ranking-keyword breadth, referring domains, citation share, cohesion trend), which stalled past the D26 thresholds (with the three-way options carried: rewrite the hub / pivot adjacent / kill and reallocate), what new territory signals accumulated (research signals, drift findings).
2. **Calendar rebalancing** — the proposed next-quarter shape: volume shifts toward winning clusters, away from killed ones, sequencing implications. Accepting stages the full delta.
3. **Competitor movement** — a **roll-up of A4 intelligence events** for the quarter (ask #3: `competitor_published` events against the org's territories, ranking changes vs named competitors from SERP data). Interim until A4 ships: research §2.9's quarterly SERP re-analysis snapshots provide the competitor delta, stated as the source.
4. **ROI summary** — pieces shipped, generation cost roll-up (generation §2.9's cost data, aggregated here), traffic and ranking aggregates (platform tools), citation share movement, velocity trend; content-attributed pipeline when Ask 13 ships, stated absence until.
5. **The decision** — every accepted change lands in the staging set (§2.10) and submits as **one combined strategic proposal** through `dm_propose_calendar` (D21): the `config_change` preview shows the full calendar/Program delta, affected clusters and dates, and each change's originating finding. Standalone: the identical flow mutates `dm_calendar` through the in-app approval.

### 2.10 The recommendation engine (decision D21)

The v1 §5.1 trigger table carries intact as seeded config; what changed is that every acceptance routes into machinery that already exists:

| Trigger (seeded condition) | Recommendation | Acceptance routes to |
|---|---|---|
| Top-3 within 30 days | Expand the cluster: N proposed spokes (research's brief generator drafts the candidates) | **Staged** Program mutation |
| High AI citation rate (2+ engines, same question — from ai-visibility snapshots) | Replicate the winning structure across named clusters | Staged Program mutation + template-guidance note to generation |
| Backlink magnet (5+ referring domains in 30 days) | Comprehensive version / internal-link beneficiaries (research's Link Sweep scoped to the magnet) | Staged Program mutation; the sweep is research's existing path |
| Zero impressions after 45 days | Indexing diagnosis: sitemap, crawl, request-indexing guidance | A verification follow-up on the piece (publishing §2.10) — no Program change |
| High impressions, low CTR | Title/meta rework with the proposed replacement shown | `dm_update_article` **metadata quick approval** — the v1 suggestion finally has a one-click execution arm |
| High clicks, low engagement | Hook/intent diagnosis; opening rework | A **lifecycle-freshness job** with the diagnosis attached (review approval downstream, lifecycle-owned) |
| Cluster stall (D26 thresholds) | The three-way: rewrite hub / pivot keywords / kill and reallocate | Staged Program mutation (rewrite = refresh job + Program note) |
| Ranking decline (10+ positions between snapshots) | Refresh with the SERP delta as evidence | Lifecycle-freshness job |

**Mechanics (D21):** every recommendation is a `dm_recommendations` row and a P1 card — the finding, *why* (named evidence chips opening the frozen inputs), estimated value, the suggested action, and its routing. **Accept** on a Program-mutating rec adds it to the **pending plan-change set** — a visible staging area on S1 ("3 staged changes — review and submit"); **Submit changes** produces **one** combined `dm_propose_calendar` strategic proposal covering the set (one editorial judgment, one heavyweight approval, full delta preview). A per-rec **Submit now** shortcut exists for the genuinely urgent single change. Non-Program classes route individually on accept — their approval types (quick, review-downstream) are already sized for it. **Dismiss** logs with optional reason; dismissal feedback weights future trigger ranking (v1 §5.1's spirit, research §2.4's convention). Staged recs that go stale (the underlying condition reversed before submission) flag themselves rather than riding silently into a proposal.

### 2.11 Voice correlation and narrative proposals (decision D25)

**Phase 1 — structured attributes (ships with this spec):** monthly, measurement correlates performance against attributes pieces already carry — cluster/territory, template type, campaign (and narrative-arc position), product integration level, lexicon-derived flag, voice-match band. A finding is **proposal-grade** only past the config evidence floor: **≥5 pieces per comparison arm, ≥2 consecutive cycles sustained, delta beyond the config threshold, computed only over signals available for every piece in the comparison** (no cross-arm source asymmetry). Grade-passing findings become `narrative` Cortex proposals (§4); sub-floor findings render in the report as observations, explicitly marked not-yet-evidence.

**Phase 2 — angle classification (phased in, gated):** once the published corpus crosses the config corpus-size gate, a monthly standard-tier pass labels each piece's framing (contrarian / data-led / story-led / how-to / comparison …); labels join the correlation **always marked model-derived in the evidence**, and angle-based findings carry both the statistical comparison and the labeling provenance. The classifier earns its way in against phase-1 outcomes before its findings reach proposal grade.

The voice-quality correlation (§2.8 section 5) is this machinery's report-facing output; the narrative proposals are its Cortex-facing output. One analysis, two consumers.

### 2.12 The daily metric reporter (decision D22)

Measurement owns the **single daily job** that reports DM's seven keys (integration §8, exactly — `dm_pieces_published`, `dm_drafts_awaiting_review`, `dm_avg_voice_match`, `dm_refresh_diffs_shipped`, `dm_corpus_authority_score`, `dm_ai_citation_share`, `dm_splits_generated`) via `synapse.reportMetrics`:

- Values are computed by their **owning subsystems** and read through internal accessors (publish/refresh counts from publishing's transition events, review counts and voice averages from `dm_pieces`/`dm_generation_runs`, the authority composite from §2.6, citation share from ai-visibility's latest snapshot, split counts from splits' queue transitions). The reporter aggregates and ships; it never re-derives.
- Weekly-cadence values carry forward daily per integration §8; dimensions (`content_topic`, `campaign`, `correlation_id`) attach where meaningful.
- Every report logs to `dm_metric_report_log` — the audit trail of exactly what DM told the Oracle, when, with which inputs. Partial-failure days report what computed and log what didn't; a silently incomplete report is the failure mode this design exists to prevent.
- The reporter reports **no traffic, rankings, or engagement** — the analytics-goals-spec §3.3 conflict and its correction are ask #4's bundled fix (integration §8's flag, restated, not re-litigated).

---

## 3. Tools exposed

This subsystem's agent-facing surface is one tool of the `content_performance` capability — defined canonically in `dm-platform-integration.md` §3.1 (description final there; restated for completeness). The capability's second command, `dm_get_ai_visibility`, is **owned by `specs/ai-visibility.md`** — one capability, two owning specs, stated to keep the one-definition rule clean.

| Tool | `isConsequential` / `autoApproveThreshold` | `surface` / `actionCategory` | Description (as shipped) | Returns |
|---|---|---|---|---|
| `dm_get_content_performance` | `false` / `null` | `query` / — | Get content performance: cluster health, topical authority trend, and piece trajectories, computed from platform integration tools and Oracle insights joined with DM production data. States explicitly which sources were available. Use for any question about whether content is working. | `{ clusters: [...], authority: {score, trend}, pieces: [...], sources_used, gaps }` |

Computes live (fresh tool queries + the latest snapshots for trajectory), never serves stale frozen evidence as current data. Recommendation acceptance is **not** a tool: accepting routes through the owning consequential surfaces (`dm_propose_calendar`, `dm_update_article`) — adding an acceptance tool would create a second path around the staging discipline. Internal routes (not agent tools): `/api/dm/measurement/scan` (on-demand), `/api/dm/measurement/snapshots/*`, `/api/dm/measurement/recommendations/*` (accept/stage/submit/dismiss), `/api/dm/measurement/reports/*`, `/api/dm/measurement/config/*` (versioned changes through review).

---

## 4. Cortex layers read and written

**Reads:** `narrative` (existing validated angles, so proposals enrich rather than duplicate), `competitive` (named competitors frame the quarterly movement section and the share-of-voice joins), `products` (light: product-association context when framing findings). Every read tolerates empty layers; emptiness degrades framing, never computation.

**Writes — `narrative` proposals only** (the integration §4.1 assignment: "validated angles, story elements that perform," originating subsystem: measurement):

```jsonc
{
  "targetLayer": "narrative", "action": "enrich", "confidence": 0.0-1.0,
  "payload": {
    "validated_angles": [{
      "attribute": "campaign_arc_position" /* | template_type | product_integration_level |
                       lexicon_derived | voice_match_band | angle_label (phase 2) */,
      "value": "origin_story_opening",
      "finding": "Pieces opening at the origin-story arc position outperform the corpus mean by 31% on the engagement components",
      "comparison": { "arm_a": {"n": 7, "mean_score": 64}, "arm_b": {"n": 22, "mean_score": 49},
                       "cycles_sustained": 3, "signals_compared": ["engagement_time","scroll_depth","clicks"] },
      "label_provenance": "structured" /* | "model_derived" (phase 2, always stated) */
    }]
  },
  "evidence": [{
    "source": "dm_performance_snapshots",
    "detail": "Snapshot ids, config_version, cycle range, per-arm piece lists, sources_used parity statement"
  }]
}
```

**Evidence floor (config, seeded):** ≥5 pieces per arm · ≥2 consecutive cycles · delta beyond threshold · source parity across arms · phase-2 labels always marked model-derived. Additive only; scalars never touched; sub-floor findings never propose. Raw snapshots, frozen analytics inputs, and report bodies never become proposals — blocked by `filterProposal` (additions to the integration §4.1 blocklist: `performance_snapshot`, `frozen_metric_input`, `report_body` — a flagged write-back, §10) *and* structurally unreachable: proposals construct only from §2.11's explicit grade-passing output.

---

## 5. Approval touchpoints

This subsystem decides nothing alone; it originates proposals into owned machinery:

| Action | Path | Type | Notes |
|---|---|---|---|
| Staged plan-change set submitted (recs + quarterly rebalance) | `dm_propose_calendar` via research's Program mutation machinery | **strategic** | One combined proposal per submission (D21); never auto-approved (integration §5.3); `config_change` preview carries each change's originating finding; no-timeout / `pause_workflow` |
| Single urgent rec, submit-now | Same path | **strategic** | The D21 shortcut; same weight, scoped delta |
| Title/meta rework accepted | `dm_update_article` | **quick** (`dm_content_metadata_update`) | The proposed replacement rides the card; scope verified from the diff (integration §5.2) |
| Refresh-class rec accepted | Originates a lifecycle-freshness job | review (downstream) | Lifecycle owns the refresh diff decision; the diagnosis and frozen evidence attach to the job |
| Indexing diagnosis accepted | Publishing verification follow-up | — | An internal re-check, nothing leaves the system |
| Narrative proposal | Cortex evaluation pipeline | — | Cortex's pipeline, not the approval system; evidence floor per §4 |
| Recommendation dismiss / stage / report generation / config change | In-app | — | Collaborative checkpoints on DM-internal state; config changes are reviewed in-app and versioned, no cards |

**Standalone:** the strategic type does not exist (integration §5.7); the staged set submits through the in-app approval and mutates `dm_calendar` with identical semantics; quick metadata reworks run the in-app flow. On upgrade, staged sets and history persist (account-scoped); the next submission registers against the Program per ask #8's backfill mapping.

---

## 6. Data — Data Tables appendix

All tables `account_id`-scoped (`uuid not null references auth.users(id)`), **RLS mandatory** (`using (account_id = auth.uid())`), migrations sequential in the monorepo `supabase/migrations/`. SQL-sketch format for `specs/data-model.md` consolidation.

```sql
-- Judgment as configuration (D20/D26): weights, curves, thresholds, triggers, floors — versioned, reviewed
create table dm_measurement_config (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  version int not null default 1,
  scope text not null check (scope in
    ('score_weights','scoring_curves','trajectory','outliers','triggers',
     'authority_composite','narrative_floor','quarterly_thresholds')),
  config jsonb not null,
  source text not null default 'seeded' check (source in ('seeded','user_edited','review_proposed')),
  change_rationale text,
  active boolean not null default true,
  created_at timestamptz default now(),
  unique (account_id, scope, version)
);

-- Performance snapshots (D19: derived judgment + frozen evidence; never a metrics store)
create table dm_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,                    -- dm_pieces
  cycle_date date not null,
  score int,                                 -- null when zero signals were available (stated, not zeroed)
  subscores jsonb not null,                  -- per signal: { value, weight_applied, curve_output }
  frozen_inputs jsonb not null,              -- per signal: { value, source, fetched_at } — evidence at scoring time
  sources_used text[] not null,
  gaps jsonb not null,                       -- [{ signal, reason }] — absences, named
  trajectory text not null check (trajectory in ('rising','stable','declining','new')),
  config_version int not null,               -- interpretability across config changes
  created_at timestamptz default now(),
  unique (account_id, piece_id, cycle_date)
);
create index idx_dm_perf_snap_piece on dm_performance_snapshots (account_id, piece_id, cycle_date desc);

-- Recommendations (the Adjuster's output; P1 cards; D21 staging)
create table dm_recommendations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  trigger_key text not null,                 -- §2.10 table row, from config
  class text not null check (class in
    ('program_mutation','metadata_rework','refresh_job','verification_followup','structure_replication')),
  scope jsonb not null,                      -- cluster_id / piece_id / proposed spokes / replacement meta
  finding text not null,
  evidence jsonb not null,                   -- snapshot ids, frozen inputs cited, ai-visibility snapshot refs
  estimated_value jsonb,
  status text not null default 'pending' check (status in
    ('pending','staged','submitted','executed','dismissed','stale')),
  dismissed_reason text,
  resulting_ref jsonb,                       -- { approval_id? , refresh_job_id?, update_job_id? }
  staleness_check jsonb,                     -- condition re-evaluation result when staged (D21)
  created_at timestamptz default now(),
  resolved_at timestamptz
);
create index idx_dm_recs_open on dm_recommendations (account_id, status)
  where status in ('pending','staged');

-- Reports (monthly + quarterly; persisted permanently per the v1 retention posture for derived artifacts)
create table dm_reports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  kind text not null check (kind in ('monthly_health','quarterly_review')),
  period_start date not null,
  period_end date not null,
  content jsonb not null,                    -- sections with their sources_used/gaps inline (§2.8/§2.9)
  recommendations uuid[],                    -- dm_recommendations surfaced in this report
  submitted_proposal_ref uuid,               -- the combined strategic proposal, when one resulted
  generated_at timestamptz default now(),
  unique (account_id, kind, period_start)
);

-- Metric report audit log (D22)
create table dm_metric_report_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  reported_at timestamptz not null default now(),
  period date not null,
  metrics jsonb not null,                    -- the seven keys with values, dimensions, carry-forward flags
  partial boolean not null default false,
  failures jsonb                             -- which accessors failed, named
);
```

**Columns this spec contributes to `dm_pieces`** (canonical in `specs/data-model.md`): `latest_performance_score int`, `latest_trajectory text`, `last_scored_at timestamptz` — denormalized for queue/library/Corpus-Map rendering (research §2.7's node sizing reads platform tools; trajectory chips read this).

**v1 tables that do not return** (for `data-model.md`'s list): `analytics_snapshots` (raw-data role → Oracle metric cache; derived-judgment role → `dm_performance_snapshots` under D19's discipline), `research_cache` (→ platform integration caching; already killed by research §2.3), GSC/GA4/Ahrefs connection tables (→ platform integrations), the v1 AI-citation check logs (→ ai-visibility's `dm_ai_probe_results`; PATCH-007's migrate-where-possible note carried to that spec), any auto-adjust flags (→ the propose/approve path, exclusively).

---

## 7. Surfaces & Explainability

Primitives per doc-system §3.3 (reconcile with `ux/experience-architecture.md` when it lands): **P1** propose→review→approve · **P2** diff surface (mounted for plan deltas) · **P3** generation theater (report generation only) · **P4** evidence drawer. No parallel primitives. Visuals defer to `ux/design-language.md`: charts monochrome-first per its color law (ink weight encodes value; semantic hues are status overlays only — no categorical rainbows; the v1 green/yellow/red cluster grid is reborn as trajectory chips on an ink table).

### S1 — Performance Overview (Analytics home)
**Purpose:** the section home that orients — is content working, what needs attention, what is staged. **Narrative moment:** the monthly ritual's opening screen; Monday planning's status check. **Primary action:** review the top pending recommendation; when none, open the latest report. **Primitives:** P1 (recommendation cards; the staged plan-change set with its Submit affordance), P4 (every score, trend, and flag opens its evidence: the composite's subscores and frozen inputs, the authority composition with research's component timestamps, the sources banner).
**Five states:** *Empty* — nothing published: standalone onboards ("Scores begin with your first published piece — here is what will be measured," the signal list with its source requirements); activated leverages Cortex and the plan ("4 pieces publish this month — first scores land after the first biweekly scan on {date}"). *Loading* — tile skeletons; the sources banner loads first (honesty before numbers). *Populated* — authority trend, output velocity, the cluster table (score · trajectory · cohesion · AI visibility), pending recommendations, the staged set, outlier flags. *In-progress* — a scan running renders as the live signal with scope ("scoring 23 pieces — GSC and DataForSEO available, GA4 not connected"). *Failed/partial* — a failed source query renders that column as unavailable-with-reason while the rest populate; a scan failure leaves prior snapshots authoritative with staleness named. Never blank, never silently partial.
**Why:** "why is this cluster declining?" → the per-piece trajectory breakdown with the frozen inputs that moved; "why is this number missing?" → the named gap and its connect affordance; "why are these three changes staged?" → each rec's finding and evidence.

### S2 — Cluster & Piece Performance Detail
**Purpose:** the drill-down — one cluster or one piece, every judgment explained. **Narrative moment:** the report's "underperformers" links land here; any "why is this piece at 28?" moment. **Primary action:** the diagnosed action when one exists (Queue Refresh / Rework meta); otherwise none. **Primitives:** P4 (constitutionally: every snapshot opens subscores → frozen inputs → source and `fetched_at`; the config version each score was judged under; the ai-visibility probe context via its snapshot ref), P1 (piece-scoped recommendations inline).
**Five states:** *Empty* — an unpublished piece: "scores begin at publish," with the readiness context — never a fake zero. *Loading* — chart skeletons. *Populated* — score history with config-version markers, trajectory, per-signal trends, the gaps timeline (when sources appeared/disappeared), keyword positions and citation rates where sourced. *In-progress* — a live rescore for this piece, scoped. *Failed/partial* — per-panel isolation; a failed live query degrades that panel to the last snapshot with its date.
**Why:** every number answers "computed from what, when, under which judgment?" — the D19/D20 design rendered.

### S3 — Health Report (monthly, with archive)
**Purpose:** the monthly ritual's document — §2.8's six sections, evidence-laden, action-armed. **Narrative moment:** the monthly ritual, verbatim from the doc-system's narratives. **Primary action:** act on section 3's top underperformer (its execution arm). **Primitives:** P1 (every recommendation and execution arm), P4 (every claim in the report opens its evidence; every section states its sources inline), P3 (generation renders as a brief staged theater: gathering → scoring joins → synthesis).
**Five states:** *Empty* — no report yet: the cadence stated, the next generation date, what the first report will contain given current connections. *Loading* — section skeletons. *Populated* — the six sections; the archive rail of prior reports (permanently retained). *In-progress* — generating, staged. *Failed/partial* — a section whose sources failed renders its stated absence while the rest of the report stands; a generation failure leaves the prior report authoritative and says so.
**Why:** "why does this section say 'unavailable'?" → the named gap and ask-status; "why is this piece in underperformers?" → the diagnosis chain back to frozen inputs.

### S4 — Quarterly Review
**Purpose:** §2.9's guided flow — reassessment → rebalancing → movement → ROI → the combined decision. **Narrative moment:** the quarter's close; the one moment the plan fundamentally changes. **Primary action:** submit the staged changes (one strategic proposal). **Primitives:** P1 (the flow *is* the primitive at strategic scale), P2 (the calendar delta renders as a diff: current plan vs proposed, each change block carrying its originating finding as the evidence chip — the `config_change` preview's in-app rendering), P4 (every kill/expand/pivot judgment opens its quarter of evidence).
**Five states:** *Empty* — mid-quarter: the review's date, what has accumulated so far (staged recs, drift flags, movement events), explicitly not a report yet. *Loading* — skeletons. *Populated* — the five sections with per-section decisions and the assembled delta. *In-progress* — synthesis running (strategic-tier, the longest model call in this spec — staged theater); or the submitted proposal pending (the approval's state rendered, deep-linked). *Failed/partial* — section-isolated failures (an Ask-13 absence renders the ROI attribution block as its stated absence); a synthesis failure preserves the gathered evidence and offers resume.
**Why:** "why kill this cluster?" → the D26 thresholds met, the quarter's snapshots, the SERP/movement evidence; "what exactly am I approving?" → the full delta diff, block by block, finding by finding.

---

## 8. Standalone mode

The instrument is the same; the sources and the orchestration differ, stated, never faked:

- **Always available (any mode, any Cortex state):** production metrics (output, velocity, voice averages, cost roll-ups), topical authority (research's components are Cortex-independent; pgvector is the gate per ask #5, same as connected), AI visibility joins (probing is DM-owned), the recommendation engine over whatever signals exist, the monthly report and quarterly review with their degradations stated.
- **Platform-integration-gated, not mode-gated:** GSC/GA4/DataForSEO-derived signals appear when the account has connected those integrations at the platform level — standalone accounts hold Kinetiks IDs and can (asks #2/#4); the designed "Connect GA4 / GSC" empty states render otherwise. The score renormalizes per §2.3 in every case.
- **Connected-only, stated:** Oracle goal-pace and attribution sections (Ask 13 + orchestration); the strategic approval type; A4 movement roll-ups (interim SERP-snapshot source applies in both modes until ask #3 ships).
- **The plan-change path:** staged sets submit through the in-app approval and mutate `dm_calendar` with identical UI semantics (integration §6.1/§9); on upgrade, registration backfills and the next submission is a Program mutation.
- **The reporter:** runs identically — metrics report via Synapse in standalone too (integration ask #8 interim: "metrics still report via Synapse so the Analytics tab sees content output"), so an upgrading user arrives with metric history.
- **Empty Cortex specifically:** changes nothing computational here (measurement reads Cortex only for framing, §4); narrative proposals still flow (proposals are account-scoped; they are how standalone trains Cortex).

---

## 9. Model/task mapping (`@kinetiks/ai` configuration)

**Scoring math is deterministic code; model calls diagnose, frame, and synthesize — they never compute a score.** The tier set per generation §9 (fast / standard / craft / strategic); this spec introduces DM's first **strategic-tier** task:

| Task key | Tier | Thinking budget | Used in |
|---|---|---|---|
| `outlier_diagnosis` | standard | — | §2.5 — cause analysis behind a fired flag (indexing vs intent vs title), over the frozen inputs |
| `recommendation_framing` | standard | — | §2.10 — finding → card prose with the evidence chips mapped; never invents numbers |
| `health_report_synthesis` | standard | — | §2.8 — section narratives over computed tables; sections 2–3's pattern extraction |
| `quarterly_review_synthesis` | **strategic** | high | §2.9 — direction-setting judgment over a quarter of evidence: the tier's defining use (generation §9's reserved meaning, now occupied) |
| `voice_correlation_analysis` | standard | — | §2.11 — comparison framing; the statistics are code |
| `angle_classification` | standard | — | §2.11 phase 2 — corpus-size-gated; outputs always marked model-derived |

Fallback discipline carried from generation §9: strategic and standard retry with backoff and fall back **up**, never down; exhausted retries fail the synthesis loudly and resumably (S3/S4 failed states). Cost controls: scans are batch-bounded by published-piece count; diagnosis runs only on fired flags; report synthesis runs once per cycle; the quarterly strategic call runs four times a year and is allowed to think.

---

## 10. Platform dependencies and write-backs

**Existing asks this spec depends on:** **#4 (central)** — GA4 + GSC extractors live, plus the bundled analytics-spec §3.3 correction to the seven `dm_` keys (this spec is that ask's primary consumer; the interim is designed in §2.3's renormalization and §7's empty states, not improvised). **#2** — DataForSEO for backlinks, rank tracking, SERP context (interim: those signals renormalize out, stated). **#3** — A4 agents for the competitor-movement roll-up (interim: research's quarterly SERP snapshots, stated as the source). **#8** — Programs, for the strategic mutations (interim: `dm_calendar` + in-app approval, the standalone path, costing nothing extra). **#5** — pgvector, transitively through research's authority components (interim: the composite renormalizes to its non-embedding terms with the absence stated).

**Proposed addition to `platform-asks.md` (filed, not assumed) — Ask 13: app-readable Oracle query surface.** *What DM needs:* read tools for apps covering (a) goal progress for goals linked to the app's Program (the analytics-goals §2.4 `GoalProgress` shape, scoped), (b) attribution slices filtered to the app's touchpoints (content-attribution level per analytics-goals §4.5), (c) metric-cache reads where reading the Oracle beats re-querying integrations. *Why:* the health report's goal-pace section and the quarterly ROI's attributed-pipeline figure are otherwise unbuildable without DM re-deriving what the Oracle owns — precisely the duplication the zero-ingestion decision forbids. *Depends on it:* this spec (§2.8.6, §2.9.4), `specs/ai-visibility.md` (organic-performance joins). *Suggested owner:* platform (Oracle). *If late:* both sections render stated absences; traffic-adjacent needs fall back to direct integration-tool queries. Acceptable indefinitely; the sections light up when the surface ships.

**Write-back flags (filed, not silently applied):**
1. `platform-asks.md`: add Ask 13 above; annotate ask #4 that `specs/measurement.md` is its primary consumer with the degradation behavior now specced.
2. `specs/research-architecture.md` §2.4: clarifying cross-reference — the monthly health report renders (never recomputes) research's Opportunities (D24).
3. `dm-platform-integration.md` §8: one clarifying line — `dm_corpus_authority_score` is *composed and reported* by measurement from components *computed* by research §2.7 (the table's "recomputed weekly (corpus intelligence)" parenthetical names the component owner; the composition owner is this spec).
4. `dm-platform-integration.md` §4.1: additive `filterProposal` blocklist entries — `performance_snapshot`, `frozen_metric_input`, `report_body` (§4 here).
5. `specs/ai-visibility.md` (forward): the §2.7 consumed-snapshot contract is binding on that spec; deltas it needs come back here as write-backs, plus PATCH-007's migrate-v1-citation-logs note is carried to its territory.

---

## 11. Self-check

| Mandatory section | Present |
|---|---|
| Purpose | §1 |
| Mechanism | §2 |
| Data (dm_* tables, SQL-sketch Data Tables appendix) | §6 |
| Tools exposed (names, consequential flags, Marcus-grade descriptions) | §3 (one read-only tool; the capability's second command's ownership stated; no acceptance tool, by design) |
| Cortex layers read/written, proposal shapes, evidence requirements | §4 (reads: narrative/competitive/products, light; writes: `narrative` proposals with concrete shape and a config-seeded evidence floor) |
| Approval touchpoints and types | §5 |
| Surfaces & Explainability (screens, five states each, evidence, "why", canonical primitives only) | §7 (S1–S4; P1–P4 only) |
| Standalone mode (exact empty-Cortex behavior) | §8 |
| Model/task mapping via `@kinetiks/ai` | §9 (first strategic-tier task; scoring deterministic, stated) |

**Locked decisions:** **zero analytics ingestion** — no connections, no pull-to-raw-store, no API cache; frozen evidence is work product under D19's stated line; the reporter ships app-produced keys only — §2.2, §2.4, §2.12 ✓ · **one approval decision** — recommendations route into existing approval machinery; no acceptance creates a parallel decision surface; Program changes go exclusively through propose/approve — §2.10, §5 ✓ · Cortex canonical — one proposal class, evidence-floored, additive, blocklisted-and-structurally-unreachable raw data — §4 ✓ · platform-owned sensing — competitor movement is an A4 roll-up with a stated interim; no DM watchers exist — §2.9 ✓ · calendar as Program — all mutations via `dm_propose_calendar`; DM never silently edits — §2.10, §5 ✓ · standalone-first — §8 (same instrument, sourced-gated sections, the reporter runs) ✓ · single company per account — §6 ✓.
**No surface without five states** — S1–S4 ✓. **No invented primitives** — P1–P4 only ✓. **New platform dependency filed as a proposed ask (Ask 13), never assumed; sections degrade with stated absences until it ships** — §10 ✓. **Changes to approved/earlier docs flagged for write-back, not silently applied** — §10 ✓. **One owner per number, stated from this side:** authority components (consumes research's; composes the composite), AI-visibility snapshots (consumes; binding contract in §2.7), trajectory (provides to lifecycle-freshness), opportunity detection (research owns; report renders — D24), the seven metric keys (owners compute; the reporter ships — D22), traffic/attribution (Oracle owns; Ask 13 reads) ✓.

---

*Dark Madder v2 — specs/measurement.md — June 2026*
