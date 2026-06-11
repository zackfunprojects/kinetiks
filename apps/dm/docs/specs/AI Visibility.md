# Dark Madder — AI Visibility

> **Spec:** `specs/ai-visibility.md` — subsystem spec 9 of 10 per `dark-madder-v2-doc-system.md` §7.
> **Date:** June 2026 · **Status:** Draft for approval
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > `platform-contract.md` and `dm-platform-integration.md` (binding at the app boundary — §3.1's `dm_get_ai_visibility` description and §9's standalone behavior are final there) > `ux/experience-architecture.md` (binding for surfaces; not yet written — primitives cited are the four from doc-system §3.3, to be reconciled) > `platform-asks.md` > this spec.
> **Sources consolidated:** ARCHIVE-PATCH-007 **intact** — question bank, probe engines, probe records, share of voice, diagnosis discipline, the AI Visibility Score, the closed loop, cost controls, UX laws — minus the citability audit's execution half, which `specs/generation-engine.md` §2.4/§2.6 already owns (this spec owns the tuning loop, per that contract). All superseded by this document for the territory it covers.
> **Depends on:** `specs/measurement.md` (its §2.7 snapshot contract is **binding and implemented verbatim here**; its D22 reporter ships `dm_ai_citation_share` from this spec's latest snapshot; its D23 clock is this spec's probe cadence; its §2.8/§2.9 render this spec's cluster numbers and competitor-surge records), `specs/lifecycle-freshness.md` (receives the citability handoff — D40's write-back adds the trigger row; the refresh machinery this spec's findings route into). **Consumed from elsewhere:** research's `dm_clusters` PAA, `dm_embeddings` (expected-piece mapping), `dm_opportunities` (`ai_citation_gap` — pre-plumbed per research §2.4), and the shared Corpus Map glow canvas (research §2.7); the trainer's `dm_lexicon_entries` (customer questions); generation's citability-rules config (revision proposals land there).
> **Decisions baked in (continuing the global series):** **D38** probe-engine clients (Perplexity Sonar, OpenAI search-enabled) are filed as a platform integration — **Ask 14** — with a DM-local `AI_ENGINES` config module as the interim, deleted when the platform surface ships (the generation/ask-12 `IMAGE_CONFIG` pattern, exactly); AI Overview probes ride the existing DataForSEO integration (ask #2) from day one. Probing remains DM-owned domain expertise per integration §9 — the question bank, scheduling, diagnosis, and findings never move; only the credentialed client does. **D39** findings surface on this spec's own surface as P1 cards; negative-sentiment findings additionally ride the platform notification path and Marcus's brief (the D36 pattern); competitor surge is **recorded here, rendered by measurement** (the D24 grammar); radar's intake stays purely the platform feed — an optional radar-S1 tile is filed as a flagged write-back, not assumed. **D40** citability-loss and buried-answer findings route **directly to lifecycle-freshness** as a new trigger row (write-back to its §2.5), the diagnosis and winning passage attached as the gap record and evidence chips — never laundered through measurement's trigger table. **D41** this spec writes `competitive` Cortex proposals, evidence-floored: a non-watchlist domain cited at or above the config floor (seeded: ≥3 citations across ≥2 clusters over ≥2 consecutive cycles) proposes as an observed competitor with probe records as evidence (additive write-back to integration §4.1's originating-subsystem column). **D42** v1 Perplexity-check logs are **dead, stated**: org-scoped data in an archived repo with no account mapping has no honest path into account-scoped tables; trends start at zero and the variance discipline makes early cycles appropriately cautious — measurement §10's forward flag resolves here, explicitly.
> **Locked decisions honored:** zero analytics ingestion — probe results are **DM-produced primary observations** (DM asked the question; the answer is the datum), work product under the D19 grammar, never a pull of someone's analytics into a raw store; no OAuth pipelines, no API caches (DataForSEO caching is the platform's); platform-owned sensing — the world-watching agents are A4's; probing the org's *own* question bank is response-side instrumentation, integration §9's stated DM-owned expertise; Cortex canonical — one proposal class, evidence-floored, additive; one approval decision — this spec originates zero approvals; every routed finding lands in machinery whose approval already exists; calendar as Program — untouched here; opportunities flow through research's normal path; standalone-first — §8; single company per account — §6.

---

## 1. Purpose

A growing share of the org's potential audience never reaches a SERP: they ask ChatGPT, Perplexity, or read an AI Overview, and the ranking that matters is whether the answer cites you. AI Visibility makes "are AI engines citing us?" a first-class, continuously measured, per-cluster instrument with a closed action loop — and supplies the empirical signal that keeps new content built citable rather than retrofitted. Four properties define it:

1. **It measures questions, not keywords.** The unit is a probe question a real person would ask an engine, banked per cluster from PAA data, verbatim customer language, generated candidates, and the org's own commercial questions. Keywords stay in Research where they belong.
2. **It diagnoses, never just scores.** "Not cited" is a feeling; "their 3-sentence direct answer under a question-matching H2 won — here it is, here's yours, buried in paragraph 9" is a plan. Every negative finding names the winner and the mechanical why, with the probe transcript as evidence.
3. **Findings end in buttons.** Every diagnosis terminates in existing machinery: a lifecycle citability refresh (D40), a research opportunity (`ai_citation_gap`), a Cortex `competitive` proposal (D41), a generation rules revision (§2.7), or a notification (D39). No finding above low severity is allowed to be purely informational — the Radar doctrine, shared.
4. **It is honest about variance.** Engine answers are stochastic. Trends render prominently; single-cycle results carry the variance caveat; automated routing fires only on state changes **confirmed across two cycles** — while the manual button always exists for the user who wants to act on one cycle deliberately.

This is the difference between a dashboard and an instrument.

---

## 2. Mechanism

### 2.1 The question bank

Each active cluster maintains a bank of 5–15 **probe questions**, assembled from four sources, each stamped:

| Source | Mechanism |
|---|---|
| `paa` | The cluster's People-Also-Ask set, already collected by research (`dm_clusters` SERP detail) — imported with one click, deduplicated |
| `lexicon` | Customer questions from `dm_lexicon_entries` mapped to this cluster — the highest-value source, verbatim real demand; the entry ref rides the question for provenance |
| `generated` | A standard-tier pass converts the cluster's head terms into natural question phrasings, deduplicated against the above |
| `user` | An "Add question" field — orgs know what matters commercially ("is {product} legit?") |

**Tiering is the cost lever:** `core` questions (max per cluster: config, seeded 5) probe every cycle; `extended` rotate round-robin within a fixed allowance; `retired` keep their history. Promote/demote/retire are in-app actions on S2; every question shows its source chip and probe history.

**Expected-piece mapping:** each question maps to the piece that *should* answer it — the nearest chunk in `dm_embeddings` (research §2.7). Distance > 0.3 marks the question **unanswerable by current corpus** — itself a first-class finding (§2.6): demand exists, supply doesn't. pgvector absent (ask #5 interim): keyword matching with a wider net and the lower confidence stated on every mapping — research's D34-adjacent fallback discipline, applied.

### 2.2 Probe engines and the Ask 14 boundary (D38)

| Engine | Mechanism | Default |
|---|---|---|
| Perplexity | Sonar API — answer + citations natively | On |
| ChatGPT | OpenAI API, search-enabled — cited URLs parsed from the response | On |
| Google AI Overviews | **Platform DataForSEO integration** (ask #2) — AI Overview presence + cited sources for the question as a query | On where ask #2 is live; stated absence otherwise |
| Claude (web search) | Anthropic API with web search | Off (per-account toggle) |

Engines are **config + adapter, never schema**: the `AI_ENGINES` config defines each engine's client, cadence participation, and cost model, so adding or removing an engine is a config change and one adapter. Per D38, the Perplexity/OpenAI clients belong to the platform as integrations (**Ask 14**, §10) — platform-managed credentials, caching, and rate limits under the integration contract, with Litmus and Hypothesis as obvious second consumers (brand monitoring probes the same engines). **Interim:** the DM-local `AI_ENGINES` module carries identical discipline — no hardcoded models, config-driven clients, per-call cost recording — and is deleted when the platform surface ships. The boundary is stated on S3: which engines are platform-backed, which are interim-local, which are unavailable.

Probe calls use the cheapest search-capable tier of each provider; stored answers truncate at a config length.

### 2.3 The probe cycle

Probes ride the **D23 shared biweekly clock** — measurement's scan, this spec's probes, lifecycle's SERP gaps; one clock, so the health report's citation data is never half a cycle stale (the dependency PATCH-007 aligned, kept with the v2 inversion measurement already states). On-demand cycles run any time from S3, budget-metered like any other.

For each (core question × enabled engine), plus the rotating extended set, a probe records: the answer text, the ordered citation list, whether and where the org was cited (`org_cited`, `org_cited_url`, `org_citation_position`), the org passage the answer drew on when identifiable (`org_passage_used`, standard-tier extraction — the tuning loop's raw material), competitor citations against the **Cortex `competitive` watchlist read at scoring time** (never a forked copy — radar's read-at-registration pattern, applied at scoring), unlinked brand mentions (`org_mentioned` — engines frequently name brands without linking), the sentiment of the org's framing whenever it appears (`positive | neutral | negative | absent`, fast-tier classification — being "critics note that apps like {Org}…" is a different outcome than being the recommended answer), and the call's cost.

Parsing is fast-tier (`citation_extraction`); diagnosis is *not* run per probe (§2.5).

### 2.4 Scoring and the snapshot contract

**AI Visibility Score** (per cluster, 0–100), seeded formula in `dm_ai_visibility_config` (versioned — the D20 mechanism, owned here; every snapshot stamps the config version it was scored under):

```
score = 50 × citation_rate        (cited probes ÷ core probes, enabled engines)
      + 25 × share_of_voice       (org citations ÷ all citations across the cluster's probes;
                                   "Other" = domains outside the competitive watchlist)
      + 15 × position_factor      (avg citation position: 1st = 1.0, decaying)
      + 10 × sentiment_factor     (positive/neutral = 1.0, negative = 0)
```

A **disabled or failed engine renormalizes out with the absence stated** on every number it would have fed — measurement §2.3's honesty mechanic, applied to probes. Scores never average over engines that didn't run.

Each cycle writes one `dm_ai_visibility_snapshots` row per probed cluster — **the measurement §2.7 contract, implemented verbatim**: `citation_rate`, `share_of_voice`, `avg_position`, `sentiment_factor`, `visibility_score`, `per_engine` breakdown, `expected_piece_rates` (the per-piece citation rate across probes where the piece is the expected answer — the piece score's AI-citation signal, continuous, renormalized away for unprobed pieces per measurement §2.3), and `unanswerable_core_questions` (the clearest single demand-without-supply number, the dashboard's corpus-level tile). Any delta this spec ever needs from that shape goes back to measurement as a write-back — never silent divergence.

**One owner per number, stated from this side:** this spec computes everything in the snapshot and `dm_ai_citation_share` (org-wide core-question citation rate, latest cycle); measurement's D22 reporter ships it daily (carried forward between cycles per integration §8) and its report joins and renders the cluster numbers. This spec renders its own surface; it never re-renders the health report's.

### 2.5 Findings, diagnosis, and honest variance

A **state change** is a core question that newly lost citation, newly won it, or moved ≥2 positions (config) on any engine. Diagnosis — the standard-tier passage comparison producing the winner, the winning passage, our nearest passage, and the **mechanical why** (directness, placement, structure, freshness, schema) — runs **only on state changes**, never per probe. That is the defining cost control and the defining product law at once: every diagnosis is expensive enough to be worth reading.

State changes write `dm_ai_visibility_findings` rows. **Automated routing requires confirmation in the next cycle** (`confirmed = true` after the second observation); unconfirmed findings render with the variance caveat ("observed once — engines vary; confirming next cycle") and their buttons live but deliberate. Findings whose underlying question flips back auto-resolve with the reversal logged. Finding types and the discipline they carry:

| Type | Trigger | Severity posture |
|---|---|---|
| `citability_loss` | Cited piece losing position / wrong page cited | Medium |
| `buried_answer` | Not cited; the expected piece answers it, structurally buried | Medium |
| `no_answering_piece` | Not cited; no chunk within mapping distance | Medium; high when lexicon-sourced (documented customer demand) |
| `unanswerable` | Question unmappable at bank time | Folds into `no_answering_piece` handling; counted on the corpus tile |
| `negative_sentiment` | Org framed negatively in any answer, cited or merely mentioned | **High — exempt from two-cycle confirmation for surfacing** (a reputation finding waits for no one); routing actions still confirm |
| `competitor_surge` | Watchlist domain's cluster share of voice rising past the config trend threshold | Recorded; rendered by measurement |
| `rule_revision` | §2.7's tuning analysis | In-app config proposal |

### 2.6 The closed loop (D39, D40)

Every finding terminates in existing machinery — this spec adds sensing of the org's own visibility, never a second content system:

| Finding | Button | Routes to |
|---|---|---|
| `citability_loss`, `buried_answer` | **Queue Citability Refresh** | A lifecycle-freshness job via the new trigger row (**D40 write-back to lifecycle §2.5**): the diagnosis, winning passage, and probe refs attach as the gap record and evidence chips; the operations are the citability restructure class (direct-answer lead, question-phrased H2, extractable summary) generation's rules define; review approval downstream is lifecycle-owned, as ever |
| `no_answering_piece` / `unanswerable` | **Create Content Piece** | A `dm_opportunities` row, `type: 'ai_citation_gap'` (research's pre-plumbed path, its §2.4) — the finding, evidence, and frequency ride the card; the resulting piece gets the question pre-attached as its expected probe, so the loop closes measurably |
| `negative_sentiment` | **View answer / acknowledge** | P1 card on S1 with the full answer text attached; rides the platform notification path and Marcus's brief (D36 pattern) — **never DM email, never injected into radar's feed** (D39) |
| `competitor_surge` | — (recorded) | Measurement renders it: the monthly report's cluster table trend and the quarterly competitor-movement section (its §2.9.3) read these rows; this spec records, measurement renders — D24's grammar |
| recurring non-watchlist citations | **Propose competitor** (or automatic at the evidence floor) | The D41 `competitive` Cortex proposal (§4) |

Routed findings carry `routed_to` refs; the next cycle's probe of the same question is the outcome check, rendered on the finding ("refreshed Jun 12 → cited on 2/3 engines Jun 21").

### 2.7 The citability tuning loop

Generation owns the citability rules config and its execution (gen §2.4 stage 7, §2.6); **this spec owns the empirical signal**: which passage structures *actually* win citations for this org is measurable from `org_passage_used` on won probes versus the winning passages on lost ones. On the quarterly boundary, or on demand once the evidence floor is met (config, seeded: ≥10 attributed passage outcomes since the last revision), a standard-tier analysis compares observed winning structures against the active rules and produces **rule-revision proposals** — P1 cards on S3 with the passage evidence attached. Acceptance versions generation's `citability-rules` config through review (a config change, the D20 discipline, generation's ownership untouched). Engine behavior shifts; the rules follow the org's own outcomes, never folklore.

### 2.8 Cost controls

Carried from PATCH-007 §7 and hardened, all config (S3-visible, stamped on the cycles they governed): **probe budget per account per cycle**, enforced server-side (seeded: 5 core × top 8 clusters × 3 engines = 120 probes), rendered as a meter with estimated cost · extended-tier rotation within a fixed extra allowance · cheapest search-capable provider tiers, truncated answer storage · diagnosis only on state changes · sentiment classification only where the org appears · `org_passage_used` extraction only on cited probes · the tuning analysis quarterly or floor-gated · on-demand cycles draw the same meter.

---

## 3. Tools exposed

One read-only tool of the `content_performance` capability — defined canonically in `dm-platform-integration.md` §3.1 (description final there; measurement §3 already states this spec's ownership of the capability's second command):

| Tool | `isConsequential` / `autoApproveThreshold` | `surface` / `actionCategory` | Description (as shipped) | Returns |
|---|---|---|---|---|
| `dm_get_ai_visibility` | `false` / `null` | `query` / — | Get AI engine citation share of voice: per-cluster question sets, which engines cite the org versus competitors, and probe transcripts as evidence. Use when the user asks about AI visibility, ChatGPT/Perplexity citations, or share of voice in AI answers. | `{ clusters: [{cluster_id, share_of_voice, vs_competitors, uncited_questions}], probes_url }` |

Reads from the latest snapshots plus open findings; it never triggers probes (probes cost money; spend routes through the budgeted cycle, not an agent's enthusiasm). Routing a finding is **not** a tool: each button invokes machinery other specs own (`dm_propose_refresh`-class lifecycle creation, research's opportunity path, the Cortex proposal pipeline) — a routing tool would be a second definition of those truths, radar's D35 logic verbatim. Internal routes (not agent tools): `/api/dm/ai-visibility/questions/*` (bank, generate, promote/demote/retire), `/api/dm/ai-visibility/probe/run` (on-demand cycle; also the D23 clock's entry point), `/api/dm/ai-visibility/results/*`, `/api/dm/ai-visibility/findings/*` (route, dismiss, acknowledge), `/api/dm/ai-visibility/config/*` (versioned changes through review).

---

## 4. Cortex layers read and written

**Reads:** `competitive` (the canonical watchlist, read at scoring time for `competitor_citations` and share-of-voice framing — "GiveWise — tracked competitor" vs "new domain"; never forked), `customers` (persona language shapes generated question phrasings — how *these* buyers actually ask), `products` (light: product names and problem framing in question generation; "is {product} legit?" candidates). Every read tolerates emptiness: no watchlist means share of voice computes against all cited domains with "Other" unsplit, stated on S1; the standalone degradations are §8's.

**Writes — `competitive` proposals only (D41),** the one knowledge class only this subsystem can see: who AI engines *actually* cite against the org's questions.

```jsonc
{
  "targetLayer": "competitive", "action": "enrich", "confidence": 0.0-1.0,
  "payload": {
    "observed_competitors": [{
      "domain": "givewise.org", "name": "GiveWise",
      "observation": "Cited on 11 probes across Bee Conservation and Effective Giving over 3 consecutive cycles; not on the competitive watchlist",
      "citation_stats": { "citations": 11, "clusters": ["…","…"], "cycles": 3,
                          "engines": {"perplexity": 6, "chatgpt": 3, "ai_overviews": 2},
                          "avg_position": 1.8 },
      "sample_answers": [{ "question": "…", "engine": "…", "probe_result_id": "…" }]
    }]
  },
  "evidence": [{ "source": "dm_ai_probe_results",
                 "detail": "probe ids, cited URLs, cycle dates, the watchlist state at scoring time" }]
}
```

**Evidence floor (config, seeded):** ≥3 citations across ≥2 clusters over ≥2 consecutive cycles — one stochastic answer never proposes a competitor. Additive only (new domains, new observations); scalar fields never touched; probe transcripts ride as evidence refs, never bulk-embedded (the integration §4.1 blocklist gains `probe_answer_text` as the safety net — §10; the design is that the constructor reads only the aggregate stats). Requires the additive write-back naming this spec as a `competitive` originator (integration §4.1 — §10).

---

## 5. Approval touchpoints

**This subsystem originates no approvals.** The map of how its outputs meet decision machinery:

| Moment | What happens | Owner |
|---|---|---|
| Queue Citability Refresh | Creates a lifecycle refresh draft (trigger: ai-visibility handoff, D40); the publish decision is `dm_content_refresh_publish` downstream | lifecycle-freshness / publishing |
| Create Content Piece | A research opportunity; Add-to-Architecture and the eventual Program slot follow research's normal paths and weights | research-architecture |
| Competitive proposal | The Cortex evaluation pipeline (account-scoped; standalone renders status in-DM per the trainer's pattern) | platform Cortex |
| Rule revision accepted | Versions generation's citability-rules config through review — an in-app config decision, no card | generation (config owner) |
| Negative-sentiment acknowledgment | A logged in-app act; nothing leaves the system | this spec |
| Question bank edits, dismissals, engine toggles, budget changes | In-app collaborative checkpoints on DM-internal state — non-consequential by the contract | this spec |

---

## 6. Data — Data Tables appendix

All tables `account_id`-scoped (`uuid not null references auth.users(id)`), **RLS mandatory** (`using (account_id = auth.uid())`), migrations sequential in the monorepo `supabase/migrations/`. SQL-sketch format for `specs/data-model.md` consolidation.

```sql
-- Probe questions (the unit of measurement)
create table dm_ai_probe_questions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  cluster_id uuid not null references dm_clusters(id) on delete cascade,
  question text not null,
  source text not null check (source in ('paa','lexicon','generated','user')),
  lexicon_entry_id uuid references dm_lexicon_entries(id),
  tier text not null default 'extended' check (tier in ('core','extended','retired')),
  expected_piece_id uuid,                 -- dm_pieces; null when unanswerable
  mapping_distance float,                 -- embedding distance at mapping time
  mapping_method text not null default 'embedding'
    check (mapping_method in ('embedding','keyword_fallback')),   -- ask #5 interim stated
  last_probed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_dm_probe_questions on dm_ai_probe_questions (account_id, cluster_id, tier);

-- Probe results (DM-produced primary observations; work product, never an analytics store)
create table dm_ai_probe_results (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  question_id uuid not null references dm_ai_probe_questions(id) on delete cascade,
  engine text not null,                   -- key into AI_ENGINES config
  cycle_date date not null,
  probed_at timestamptz default now(),
  answer_text text,                       -- truncated per config; diagnosis substrate
  cited_urls jsonb,                       -- ordered list of all citations
  org_cited boolean not null,
  org_cited_url text,
  org_citation_position int,
  org_passage_used text,                  -- our sentence(s) the answer drew on, when identifiable
  org_mentioned boolean not null default false,  -- unlinked brand mention
  competitor_citations jsonb,             -- [{domain, url, position}] vs the watchlist at scoring time
  sentiment text check (sentiment in ('positive','neutral','negative','absent')),
  cost_cents int,
  engine_source text not null default 'interim_local'
    check (engine_source in ('platform_integration','interim_local'))   -- the D38 boundary, recorded
);
create index idx_dm_probe_results on dm_ai_probe_results (account_id, question_id, cycle_date);
create index idx_dm_probe_results_cycle on dm_ai_probe_results (account_id, cycle_date, engine);

-- Per-cluster, per-cycle snapshots — measurement §2.7's binding contract, verbatim
create table dm_ai_visibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  cluster_id uuid not null references dm_clusters(id) on delete cascade,
  cycle_date date not null,
  citation_rate float,
  share_of_voice float,
  avg_position float,
  sentiment_factor float,
  visibility_score int,
  per_engine jsonb,                       -- {engine: {cited, of, avg_position}}
  expected_piece_rates jsonb,             -- [{piece_id, citation_rate}]
  unanswerable_core_questions int,
  engines_participated text[] not null,   -- renormalization honesty: who actually ran
  config_version int not null,
  unique (account_id, cluster_id, cycle_date)
);

-- Findings (state changes, diagnoses, routing — the closed loop's spine)
create table dm_ai_visibility_findings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  question_id uuid references dm_ai_probe_questions(id) on delete cascade,
  cluster_id uuid references dm_clusters(id),
  finding_type text not null check (finding_type in
    ('citability_loss','buried_answer','no_answering_piece','unanswerable',
     'negative_sentiment','competitor_surge','rule_revision')),
  severity text not null check (severity in ('low','medium','high')),
  first_observed_cycle date not null,
  confirmed boolean not null default false,
  confirmed_cycle date,
  diagnosis jsonb,                        -- {winner_domain, winning_passage, our_passage,
                                          --  mechanical_why[], engine_breakdown, probe_result_ids[]}
  status text not null default 'open' check (status in
    ('open','routed','dismissed','resolved','expired')),
  routed_to jsonb,                        -- {kind: refresh_draft|opportunity|cortex_proposal|
                                          --  config_revision|notification, ref, routed_at}
  outcome jsonb,                          -- next-cycle state of the same question post-routing
  dismissed_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_dm_av_findings_open on dm_ai_visibility_findings (account_id, status, severity)
  where status = 'open';

-- Judgment as configuration (D20 mechanism, owned here)
create table dm_ai_visibility_config (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  version int not null,
  score_weights jsonb not null,           -- seeded: PATCH-007 §5.1
  probe_budget jsonb not null,            -- core/cluster cap, clusters probed, extended allowance
  engine_toggles jsonb not null,          -- per-engine on/off; claude off by default
  state_change_thresholds jsonb not null, -- position delta, confirmation rule
  competitor_proposal_floor jsonb not null, -- D41 seeded floor
  tuning_floor jsonb not null,            -- §2.7 evidence floor
  rationale text,
  created_at timestamptz default now(),
  unique (account_id, version)
);
```

**Columns this spec contributes to shared tables** (canonical in `specs/data-model.md`): none — expected-piece refs live on this spec's tables; the Corpus Map's cited-glow reads `expected_piece_rates` from the latest snapshot, no `dm_pieces` column required. **v1 tables that do not return** (for data-model's explicit list): org-scoped `ai_probe_questions` / `ai_probe_results` / `ai_visibility_snapshots` (rebuilt account-scoped above); the v1 Perplexity-check log (dead per D42, no migration).

---

## 7. Surfaces & Explainability

Primitives per doc-system §3.3 (reconcile with `ux/experience-architecture.md` when it lands): **P1** propose→review→approve · **P2** diff surface · **P3** generation theater · **P4** evidence drawer. No parallel primitives. Visuals per `dm-design-language.md`: the share-of-voice table is ink-weight monochrome with trend chips; semantic color appears only on finding-severity chips, never whole cards. Everywhere this subsystem renders, the unit shown is a **question** — keywords never appear here.

### S1 — AI Visibility Home

**Purpose:** the instrument — share of voice per cluster with trends, the by-engine breakdown, the needs-attention findings with their buttons, the cycle clock and budget summary. **Narrative moment:** the monthly ritual's "AI share-of-voice movement" (doc-system narrative, verbatim); Tuesday morning's reputation check when a sentiment finding fired. **Primary action:** route the top confirmed finding; when none, review the latest cycle. **Primitives:** P1 (finding cards — Queue Citability Refresh / Create Content Piece / Propose competitor / acknowledge), P4 (every score opens the formula, weights, config version, and per-engine inputs; every finding opens the diagnosis with both passages side by side and the probe transcripts; every share-of-voice cell opens the citation list behind it).

**Five states:** *Empty* — no question bank yet: "Build your first question bank — {cluster} has {n} PAA questions and {m} customer questions ready to import," one click to S2; standalone keyword-fallback posture stated when applicable. *Loading* — table skeleton. *Populated* — as above; unconfirmed findings carry the variance caveat inline. *In-progress* — a running probe cycle renders as P3: questions → engines → parsing → scoring, with the budget meter draining live. *Failed/partial* — per-engine failure isolated and stated ("ChatGPT probes failed this cycle (provider error) — this cycle's scores computed from 2 engines, marked on every number"); retry per engine; never a blank instrument.

**Why:** "why this score?" → the formula with this cycle's inputs and `engines_participated`; "why is this a finding?" → the state change, both cycles, the diagnosis; "why was this routed?" → the `routed_to` ref and the outcome check.

### S2 — Question Bank

**Purpose:** the measurement unit's home — per-cluster banks with source provenance, tiers, expected-piece mapping, and probe history. **Narrative moment:** Monday planning's "are we measuring the right demand?"; the post-mining moment when fresh lexicon questions await import. **Primary action:** import the highest-frequency unbanked lexicon question; otherwise generate candidates for the thinnest bank. **Primitives:** P1 (lexicon-import suggestions render as accept/dismiss cards with frequency evidence), P4 (every question opens its source — the PAA SERP, the redacted lexicon exemplars with counts, the generation rationale — its mapping with distance and method, and its probe history sparkline), P3 (candidate generation streams).

**Five states:** *Empty* — the four sources listed with what each holds ("12 PAA · 7 customer questions · generate candidates"); *Loading* — bank skeleton; *Populated* — question rows with source chip, tier control, expected piece (or the unanswerable badge with its meaning), last result per engine; *In-progress* — candidate generation or lexicon import streaming inline; *Failed* — generation retryable; mapping failure renders "mapping unknown" honestly, never a fabricated piece ref.

**Why:** "why does this question exist?" → its source evidence; "why this piece?" → the mapping distance and method (keyword fallback stated); "why is this unanswerable?" → nearest chunk and distance, with Create Content Piece right there.

### S3 — Settings, Budget & Tuning

**Purpose:** engines, the budget meter, config versions, and the citability tuning proposals. **Narrative moment:** the quarterly "are the rules still right?" pass; the onboarding moment engines come online. **Primary action:** review the pending rule-revision proposal when one exists; otherwise none (settings are visited, not lived in). **Primitives:** P1 (rule-revision proposals with passage evidence; config-change review), P2 (a rule revision renders as a diff against the active rules config), P4 (the budget meter opens per-cycle spend by engine; every config version opens its rationale and the cycles it governed; each engine row opens its D38 status — platform-backed / interim-local / unavailable, with what that means).

**Five states:** *Empty* — seeded defaults shown as such; engines awaiting configuration state the Ask 14 boundary plainly. *Loading* — form skeleton. *Populated* — toggles, meter with estimated cost, config history, pending proposals. *In-progress* — a config change pending review; a tuning analysis running (P3, brief). *Failed* — config load failure with retry; the active version always renders from its stamp, never guessed.

**Why:** "why this budget?" → the cost math (questions × clusters × engines × provider rates); "why did the rules change?" → the revision's passage evidence and acceptance record.

---

## 8. Standalone mode

Fully functional — integration §9, verbatim: probing is DM-owned domain expertise. Exact empty-Cortex behavior:

- **Question banks** assemble from PAA and generated candidates; with no lexicon (no mining yet) and no `customers` layer, generated phrasings fall back to **cluster keywords without persona language** — stated on the bank ("persona phrasing unavailable — train customer language to sharpen these").
- **Watchlist empty:** share of voice computes against all cited domains; "Other" is everyone; the D41 proposal floor still operates (standalone accounts hold a Context Structure; the evaluation pipeline is account-scoped per the trainer's pattern) — which means standalone probing *builds* the competitive layer rather than waiting for it.
- **Engines:** Perplexity/ChatGPT run on the interim `AI_ENGINES` module (D38) day one; AI Overviews requires ask #2 and renders a stated absence until then.
- **pgvector absent** (ask #5): expected-piece mapping uses the keyword fallback, `mapping_method` stamped, confidence stated on every mapping and every `buried_answer` finding.
- **Routing:** lifecycle, research, and notification paths are all account-scoped and standalone-native; nothing here requires orchestration.
- **Upgrade:** nothing migrates because nothing was siloed — banks, results, snapshots, and findings are already account-scoped; the activated experience inherits a measured system on day one.

---

## 9. Model/task mapping (`@kinetiks/ai` configuration)

**The probe engines are not `@kinetiks/ai` tasks** — they are external services under the D38/Ask 14 boundary, config-routed via `AI_ENGINES`. The tasks below are DM's own model calls; scoring math is deterministic code throughout (the measurement doctrine — model calls diagnose and frame, never compute a score):

| Task key | Tier | Thinking budget | Used in |
|---|---|---|---|
| `probe_question_generation` | standard | — | §2.1 — cluster terms → natural questions, persona-phrased where `customers` exists |
| `citation_extraction` | fast | — | §2.3 — parse citations and mentions from answer text |
| `sentiment_classification` | fast | — | §2.3 — how the org was framed, only where it appears |
| `passage_extraction` | standard | — | §2.3 — identify `org_passage_used` on cited probes |
| `passage_diagnosis` | standard | medium | §2.5 — why their passage won vs ours; state changes only |
| `citability_tuning_analysis` | standard | medium | §2.7 — observed winning structures vs active rules → revision proposals |
| `competitor_observation_framing` | fast | — | §4 — aggregate stats → proposal prose; never invents numbers |
| *consumed, not owned:* `citability_audit`, `citability_rewrite` | per generation §9 | | generation owns execution; this spec supplies the tuning signal |

Fallback discipline per generation §9: standard falls back **up**, never down; fast falls back to standard; exhausted retries fail the cycle stage loudly and resumably (the S1 failed state). Cost controls are §2.8's, stamped per cycle.

---

## 10. Platform dependencies and write-backs

**Existing asks this spec depends on:** **#2** (DataForSEO — the AI Overviews engine; interim: stated absence, two-engine scoring with renormalization), **#5** (pgvector — expected-piece mapping; interim: keyword fallback, stamped and stated), **#3** (indirectly — competitor-surge context joins measurement's A4 roll-up; no DM watcher exists here or anywhere).

**Proposed addition to `platform-asks.md` (filed, not assumed) — Ask 14: AI-engine probe clients as platform integrations.** *What DM needs:* Perplexity (Sonar) and OpenAI (search-enabled) exposed as platform integration tools per the integration contract — platform-managed credentials, caching, rate limits, per-call cost accounting — available to standalone-tier accounts. Claude-with-web-search as a later provider under the same contract. *Why:* the platform owns all external service connections (the ask #2/#11 standing rationale); DM-side clients with DM-managed keys rebuild deleted scope. Litmus and Hypothesis are natural second consumers — brand and narrative monitoring probe the same engines. *Depends on it:* this spec §2.2. *Suggested owner:* platform; DM-contributed: the probe-specific requirements (cheapest search tiers, citation-bearing response modes, answer truncation). *If late:* the DM-local `AI_ENGINES` config module with identical discipline (no hardcoded models, config-driven clients, cost recorded per call), deleted when the surface ships — the generation `IMAGE_CONFIG` interim, mirrored exactly. Acceptable indefinitely; `engine_source` on every probe row keeps the boundary honest.

**Write-back flags (filed, not silently applied):**
1. `platform-asks.md`: Ask 14 above.
2. `specs/lifecycle-freshness.md` §2.5: a seventh trigger row — **AI-visibility handoff** — mirroring the radar and measurement rows: the D40 diagnosis, winning passage, and probe refs attach as the gap record and evidence chips; operations are the citability restructure class under generation's rules config.
3. `dm-platform-integration.md` §4.1: additive — this spec joins `competitive`'s originating subsystems (D41), and the blocklist gains `probe_answer_text` (the §4 safety net).
4. `dm-platform-integration.md` §2: `/api/dm/status` features — additive `probe_engines_configured` (Marcus connection-awareness: don't promise share-of-voice answers when no engine can run).
5. `specs/radar-response.md` S1 (**optional**, per D39): a tile reading open high-severity ai-visibility findings — a contribution to its surface in the pattern of its own tile on research's S1; filed for the integration pass to accept or decline, costing nothing either way.
6. `specs/measurement.md` §10: its forward flag on v1 citation-log migration resolves as **dead per D42** — recorded there so the flag doesn't dangle.

---

## 11. Self-check

| Mandatory section | Present |
|---|---|
| Purpose | §1 |
| Mechanism | §2 |
| Data (dm_* tables, SQL-sketch Data Tables appendix) | §6 |
| Tools exposed (names, consequential flags, Marcus-grade descriptions) | §3 (one read-only tool; ownership of the capability's second command stated; no probe or routing tools, by design) |
| Cortex layers read/written, proposal shapes, evidence requirements | §4 (reads: competitive/customers/products; writes: `competitive` with concrete shape and a config-seeded evidence floor — D41) |
| Approval touchpoints and types | §5 (none originated; full routing map) |
| Surfaces & Explainability (screens, five states each, evidence, "why", canonical primitives only) | §7 (S1–S3; P1–P4 only) |
| Standalone mode (exact empty-Cortex behavior) | §8 |
| Model/task mapping via `@kinetiks/ai` | §9 (probe engines explicitly outside it under D38; scoring deterministic, stated) |

**Locked decisions:** zero analytics ingestion — probe results are DM-produced primary observations, work product under the stated line; no pull schedules into raw stores, no API caches (DataForSEO caching is the platform's) — §2.3, §6 ✓ · platform-owned sensing — no DM watchers; probing the org's own bank is response-side instrumentation per integration §9; competitor surge is recorded here and rendered by measurement, never sensed — §2.5–2.6 ✓ · one approval decision — zero approvals originated; every routed finding lands in machinery whose approval already exists — §5 ✓ · Cortex canonical — one proposal class, evidence-floored, additive, transcript text blocklisted and structurally unreachable — §4 ✓ · calendar as Program — untouched; opportunities flow through research's path — §2.6 ✓ · standalone-first — fully functional with stated degradations — §8 ✓ · single company per account — §6 account-scoped throughout ✓.
**No surface without five states** — S1–S3 ✓. **No invented primitives** — P1–P4 only ✓. **New platform dependency filed as a proposed ask (Ask 14), never assumed; the interim is designed, stamped, and stated** — §10 ✓. **Changes to approved/earlier docs flagged for write-back, not silently applied** — §10 (six flags, one optional) ✓. **Binding contracts honored from this side:** measurement §2.7 snapshot shape implemented verbatim (deltas go back as write-backs) · `dm_ai_citation_share` computed here, shipped by measurement's D22 reporter · D23 shared clock joined, never a second scheduler · generation owns citability rules and execution, this spec owns tuning (gen §2.6's four-way split, two corners filled) · research's `ai_citation_gap` path consumed, the Corpus Map glow fed, `dm_embeddings` read · the trainer's lexicon read with provenance ✓. **Honest variance** — confirmation-before-automated-routing, single-cycle caveats, per-engine renormalization with `engines_participated` stamped ✓.

---

*Dark Madder v2 — specs/ai-visibility.md — June 2026*
