# Dark Madder — Lifecycle & Freshness

> **Spec:** `specs/lifecycle-freshness.md` — subsystem spec 7 of 10 per `dark-madder-v2-doc-system.md` §7.
> **Date:** June 2026 · **Status:** Draft for approval
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > `platform-contract.md` and `dm-platform-integration.md` (binding at the app boundary — §3 defines this spec's two tools canonically; §5 its approval mechanics; §7 the verification context its publishes inherit) > `ux/experience-architecture.md` (binding for surfaces; not yet written — primitives cited are the four from doc-system §3.3, to be reconciled) > `platform-asks.md` > this spec.
> **Sources consolidated:** ARCHIVE-PATCH-004 (entire — claims ledger, verification passes, freshness score, refresh pipeline, diff review, trigger modes, legacy adoption, cost/safety controls, UX principles), ARCHIVE-PATCH-007 §6 (the refresh-time citability variant, per generation §2.6's contract), ARCHIVE-PATCH-003 §1.3 (`published_body` as the scan substrate — retention discipline already owned by `specs/publishing.md`). All superseded by this document for the territory it covers.
> **Depends on:** `specs/publishing.md` (executes every refresh publish as an `update_refresh` job; its §2.9 cascade fires this spec's claims extraction; its §2.11 drift states gate this spec's scans), `specs/measurement.md` (the trajectory interface its §2.4 guarantees; the refresh-class recommendation handoff its §2.10 originates; the D23 shared biweekly clock this spec joins). **Consumed from elsewhere:** editor-review's canonical diff viewer (§2.9 there, refresh-diff mode) and checklist engine (`invocation: 'refresh'`); generation's craft rewrite path and citability rules (gen §2.6). **Contract defined here, implemented later:** the external-pressure gap record `specs/radar-response.md` attaches (§2.3).
> **Decisions baked in (continuing the global series):** **D27** split cadence — claims verification weekly (date math is free), SERP gaps on measurement's biweekly shared clock (D23 gains a third rider), freshness score recomputed weekly. **D28** the >40%-change abort converts to a lifecycle-owned "rewrite, not refresh" proposal; the health report renders the finding, never recomputes it. **D29** resolve-then-submit — per-block resolution is an in-app collaborative checkpoint; one review approval covers the merged accepted set. **D30** claims extract on publish; backfill is an explicit, capped, cost-stated batch action. **D31** freshness judgment ships as versioned seeded config in `dm_freshness_config` (the D20 mechanism, owned here). **D32** pending drift holds refresh proposals; dismissed-divergent pieces scan the stored body with the divergence stated on every output.
> **Locked decisions honored:** **propose-don't-publish at its flagship** — a cron that proposes, a human who publishes, and no path between them that skips the approval; **zero analytics ingestion** — every external number arrives through platform integration tools at scan time and persists only as frozen evidence; **one approval decision** — block resolution never creates a second decision surface; Cortex canonical (product facts verify against the Products layer; nothing forks it); platform-owned sensing (this spec watches nothing — it consumes measurement's trajectory, platform tools, and radar's delivered events); standalone-first; single company per account.

---

## 1. Purpose

Lifecycle & Freshness closes the loop v1 left open: the system could *say* content was decaying and then hand the human a vague verb. This spec makes "refresh" a defined, evidenced, reviewable unit of work — and it is the clearest demonstration in the product of why propose-don't-publish is a superpower rather than a constraint. A cron job that rewrites live content unsupervised is terrifying; a queue of evidence-backed diffs awaiting one decision is leverage. Four properties define it:

1. **Staleness is decomposed, never gestured at.** The atomic unit is the **claim** — a dated, factual, or perishable statement with a location, a source, and an expiry model. "This piece is stale" always resolves to named problems: *this* statistic superseded by *this* newer figure from *this* source, *this* PAA question unanswered while three of the top five answer it, *this* link dead. No problem without evidence; no refresh without problems.
2. **Refreshes are surgical, and surgery uses the same instruments.** Every refresh operation executes through generation's craft path — new sections through the standard section pipeline with the transition audit so insertions never read as bolted-on, the whole piece through the voice audit, the corrections ledger applying — so a refresh honors everything the user has ever taught the system. Speed and scope never lower the bar.
3. **The review is a diff, not a document.** Reviewing a refresh takes two minutes, not twenty: independently resolvable change blocks, each carrying its evidence, rendered on the **canonical diff viewer** (editor-review §2.9's refresh-diff mode — this spec owns the semantics, never the surface). One submission, one approval, one execution through publishing's machinery.
4. **Honesty under partial data.** The freshness score renormalizes when sources are absent (the measurement §2.3 mechanic, adopted whole): a piece is never punished for an unconnected GSC, and every score records `sources_used` and `gaps`. In standalone-without-integrations the engine still runs — recency and claim-date signals are real signals — and says exactly what it is running on.

This spec also owns **legacy adoption**: the bridge that lets Dark Madder take over an *existing* blog. Research's import made legacy pieces visible, mappable, and linkable; adoption makes them manageable — and nothing changes on the org's site until a specific refresh is approved.

---

## 2. Mechanism

### 2.1 The claims ledger

At publish time — fired by publishing's §2.9 cascade, step 2 — a claim-extraction pass reads the new `published_body` and writes every perishable statement to `dm_claims`:

| Claim type | Example | Default expiry model |
|---|---|---|
| `statistic` | "41% of millennial donors gave through an app in 2025" | `data_superseded` |
| `dated_reference` | "as of early 2026", "last year", "the latest iPhone" | `calendar` |
| `external_fact` | "Charity Navigator rates organizations on four dimensions" | `data_superseded` |
| `price_or_number` | "plans start at $9/month" | `calendar` (short) or `profile_linked` when it states the org's own pricing |
| `product_fact` | claims about the org's own product — features, limits, pricing | `profile_linked` |
| `recommendation` | "the best tool for X is Y" | `data_superseded` |
| `link_rot` | created by the link-health pass, not extraction | `link_health` |

Each claim stores its location (chunk anchor + sentence), its citation when one exists, its expiry model, and — once verified stale — the **proposed replacement with its source**, frozen at verification time. Evergreen definitional claims are extracted and marked `evergreen` so the extraction is auditable ("why wasn't this flagged?" has an answer), but never verified on a schedule.

**Backfill (D30):** extraction runs automatically only at publish. Existing published pieces and newly adopted legacy pieces gain ledgers through an explicit **batch backfill action** — scoped (all / by cluster / selected pieces), capped per run (config), with the model-call cost stated before the run starts and the run resumable like any pipeline. Silent corpus-wide extraction on feature enable does not exist; cost honesty is the same law here as everywhere.

**Reset on refresh:** when a refresh publishes, the cascade re-fires extraction on the new body and the prior ledger rows for changed spans close as `superseded_by_refresh` — the ledger always describes what is live.

### 2.2 Verification passes (weekly — D27)

A weekly job verifies only claims that are `expiring` or past `expires_at` — never the full ledger:

- **Dated references:** pure date math, zero API cost, runs first. "Last year" written in 2025 is wrong in 2026 by arithmetic; flagged with the corrected absolute phrasing proposed.
- **Statistics and external facts:** a web search at verification time for newer figures from the original source or a better one; a standard-tier comparison call classifies *current / superseded (with the new figure + source) / unverifiable*. What persists is the **judgment and its frozen evidence** — the replacement text, the source URL, the `verified_at` stamp — never cached search results. The D19 line, applied to verification: this spec may query and may freeze what it judged against; it may never build a search-result store.
- **Product facts:** diffed against the **Cortex Products layer** at ask #1 depth, read through the trainer's accessor (so the `dm_product_knowledge` interim is invisible here). The claim row stores the layer fields it asserts; when those fields change, the claim flags mechanically — no model call needed for the detection, one standard-tier call to draft the corrected sentence. The **cascade trigger** is the `products`-layer-updated routing event (integration §4.3 event 4): update the layer once and every piece asserting the old fact queues a correction, **capped per cascade** (config, default 10 queued; overflow ranked by traffic weight) and **user-notified** ("Your pricing change affects 7 published pieces — review queued refreshes"). This is what makes product-led content safe to scale.
- **Link health:** monthly HTTP checks on external links; 404s and permanent redirects become `link_rot` claims with the response code as evidence.

**Budgets:** a hard cap on web-search calls per verification batch (config); batches process highest-traffic pieces first so budget exhaustion degrades from the bottom, stated on the run record.

### 2.3 External pressure: SERP gaps and radar events

**SERP gap monitoring** runs on the **D23 shared biweekly clock** (measurement's scan and ai-visibility's probe cycle; this spec is the third rider — one clock, one shared API budget, and the freshness picture is never half a cycle staler than the performance picture). Per published piece's primary keyword, via the platform DataForSEO tools:

- **New PAA questions** absent at publish time and unanswered by the piece — checked against chunk embeddings (research §2.7's table; a question whose embedding has no chunk within cosine distance 0.3 is unanswered). pgvector-gated (ask #5): the fallback is lexical matching with the lower confidence stated on the gap record, never a silently weaker check presented as the real one.
- **Coverage gaps:** topics the current top-5 results cover (fast-tier extraction from their H2s/snippets) that the piece doesn't.
- **Position movement:** read from measurement's snapshots (its §2.4 trajectory interface and frozen position inputs) — never re-pulled here. One owner per number.

Output is a set of **gap records** on the scan row, each with named evidence ("3 of the top 5 results now have a section on reef-safe sunscreen regulations; you don't — URLs attached").

**The external-pressure record (contract for `specs/radar-response.md`):** radar's *Queue Refresh* action attaches an event-sourced gap record to the target piece:

```jsonc
{ "source": "radar_event", "event_ref": "dm_radar_events.id",
  "summary": "GiveWise published a 4,200-word guide targeting your hub's parent term",
  "coverage_delta": ["state-level pollinator programs", "native bee ID"],
  "evidence_urls": ["…"], "severity": "high", "detected_at": "…" }
```

A competitor publishing against your piece *is* a freshness event. Since this spec ships first, this shape is the binding consumer contract radar fills; deltas it needs come back here as write-backs, never silent divergence. Standalone and pre-ask-#3 accounts simply have no records of this source — an absence, not an error.

### 2.4 The freshness score (D31, D27)

Recomputed weekly per published piece, written as a `dm_freshness_scans` row (the D19 discipline: derived judgment + frozen inputs + `sources_used` + `gaps` + `config_version`), denormalized onto `dm_pieces` for queue/library/Corpus-Map rendering. Seeded weights, carried from PATCH-004 into `dm_freshness_config`:

| Signal | Seeded weight | Source | Scoring (seeded) |
|---|---|---|---|
| Stale/superseded claims | 30% | `dm_claims` | 100 minus 12 per stale claim (floor 0) |
| SERP + pressure gaps | 25% | §2.3 records | 100 minus 15 per significant gap |
| Content age | 15% | `dm_pieces` dates | <3mo = 100 · 3–6mo = 80 · 6–12mo = 55 · >12mo = 30 |
| Position trajectory | 20% | measurement's interface | rising = 100 · stable = 70 · declining = 25 |
| Link health | 10% | `dm_claims` link_rot | 100 minus 20 per dead link |

**Renormalization (the honesty mechanic, adopted from measurement §2.3):** signals whose sources are unavailable — DataForSEO not shipped, GSC not connected, a `new` trajectory with fewer than 3 snapshots — drop out and the remaining weights renormalize; the scan records which signals participated and why the others didn't. Claims and age are always available, so the engine always runs.

**Refresh Priority** = `(100 − freshness score) × traffic weight`, traffic weight from the piece's share of account clicks via the platform GSC tools, log-scaled, frozen on the scan. GSC absent → uniform weights, priority degrades to score ordering, **stated on the queue header** ("ranked by freshness only — connect GSC for traffic weighting"). A rotting piece nobody reads ranks below a slightly-stale piece driving 30% of traffic — that judgment requires the data and is never faked without it.

### 2.5 The refresh queue and trigger modes

The queue is the priority-ordered set of pieces below the refresh threshold (config, seeded 65). Six triggers create `dm_refresh_drafts`, one pipeline underneath:

| Trigger | Path | Notes |
|---|---|---|
| **Scheduled** | Daily cron takes the top N below threshold (config; seeded N=1/day) | The Ryan Law cron, with the guardrails. The cron *proposes*; it cannot publish. |
| **Manual** | "Refresh now" on any managed piece (queue, library, Corpus Map panel, piece view) | |
| **Measurement handoff** | Its §2.10 refresh-class recommendations (engagement anomaly, ranking decline, underperformer actions) | **Receiving contract:** the rec's diagnosis and frozen-evidence refs attach to the draft and render in the brief and the diff's evidence chips — the report finally has an execution arm, and the arm carries the report's evidence. |
| **Product cascade** | §2.2's Products-layer event | Capped, notified |
| **Radar Queue Refresh** | §2.3's pressure record | The event rides as a gap record and an evidence chip |
| **Cannibalization Merge** | Research §2.5's checkpoint ("expand the existing piece instead") | The overlapping brief's material attaches as the gap to fill |

**Fast-track exclusion:** pieces with `track = 'fast'` (radar's column) are excluded from the scheduled queue by default — timely pieces are expected to age. **Convert-to-evergreen** is owned here: it clears the track to `standard`, runs the deferred cannibalization check (the three-way checkpoint fires now if overlap exists — the merge-later flag radar set is consumed at this moment), and enrolls the piece in normal freshness management.

### 2.6 Refresh generation

A refresh is **surgical, not a rewrite**. The pipeline, persisted per stage on `dm_refresh_drafts` (the `dm_generation_runs` discipline applied — resumable, cancellable, theater-rendered):

1. **Assemble the refresh brief:** the piece's stale claims with frozen replacements and sources; gap records (SERP, radar, merge material); the measurement diagnosis when handoff-originated (a CTR anomaly adds a title/meta rework operation with the proposed replacement); and the full voice context per generation §2.3 — Cortex Voice with the layer version stamped, corrections ledger injection, author layer, the works.
2. **Scope the operations:** a standard-tier pass maps each named problem to exactly one operation — `replace_sentence` (claim updates), `insert_section` (gap fills), `rewrite_section` (sections the diagnosis named weak), `update_metadata` (title/meta/schema fields), `fix_link`. Every operation carries its originating problem ref; an operation without a problem cannot exist (schema-enforced).
3. **Generate:** sentence replacements via this spec's standard-tier task; new and rewritten sections via **generation's craft pipeline** (`section_generation` / `section_rewrite`, full thinking budgets — the same bar as original writing). Insertions pass the transition audit on both seams; the merged piece passes the full voice audit with the rewrite loop and cap; the **citability refresh variant** runs on added sections (gen §2.6's explicit second site — this spec invokes the rules config, generation owns it); the checklist engine runs with `invocation: 'refresh'` (editor-review §2.4), so an edit-broken FAQ or a policy violation introduced by an insertion blocks exactly as it would on a fresh draft.
4. **Assemble the diff** — operations become change blocks, each with its evidence chip — and the draft lands `awaiting_review` with the estimated post-refresh score shown beside the current one ("Freshness 48 → est. 92").

**The >40% abort (D28):** a refresh whose operations would change more than 40% of the piece's text (config) **aborts before generation completes** and converts to a lifecycle-owned **"rewrite, not refresh" proposal** — a P1 card on S1 stating the finding with the full problem set as evidence. Accepting routes to generation's `full_regen` with the freshness diagnosis injected as directed feedback (a drafting action — no approval needed to write); the resulting draft's publish is an `update_refresh` approval like any other, reviewed as the (large) diff it honestly is, Sentinel included. The finding also rides into the monthly health report's underperformers section through the diagnosis attachment measurement already renders — lifecycle owns the finding, the report renders it (the D24 ownership grammar). The system never quietly replaces a piece wholesale, and never re-launders the decision through another subsystem's trigger table.

### 2.7 Review and the one decision (D29)

The refresh review mounts **editor-review's canonical diff viewer in refresh-diff mode** — this spec defines what the blocks mean and which are actionable; the surface is built once, there.

- **Block resolution is an in-app collaborative checkpoint.** Accept / edit / reject per block, with every block's evidence chip (the superseded source, the SERP data, the radar event, the diagnosis) opening in the drawer. Nothing leaves the system at this stage; no cards exist yet. Block **edits** feed editor-review's edit-capture intake with refresh context (a flagged additive write-back: `capture_surface` gains `refresh_diff` — §10) — refresh edits teach the ledger exactly as draft edits do.
- **Submit for publish** is the single decision: the merged accepted set snapshots (the editor-review §2.3 anchor discipline), the approval submits as `dm_content_refresh_publish` (review type; `source_operator: 'lifecycle_freshness'`; `agent_confidence` from the voice composite + checklist completion; `correlation_id` when Task- or rec-originated), and the **card preview is the accepted-block diff** — what the reviewer on the card sees is exactly what was resolved in-app. Rejected blocks log with the rejection as learning signal; unresolved drafts save and resume.
- **"Accept all & publish"** survives as a gesture, not a mechanism: it resolves every block accepted and submits, through identical machinery.
- **Execution is publishing's:** on approval, the `update_refresh` job runs — Sentinel reviews the diff at the boundary (`article_refresh_diff` per ask #9; interim post-merge as `blog_post`, the safe direction), the CMS updates, `published_body` + hash update only on success, the cascade re-embeds and re-extracts, verification runs. The category is integration §5.3's named first candidate to earn publish-class autonomy — scoped, evidence-tied diffs are where trust is built — and that calibration belongs entirely to the approval system. The v1 "no auto-publish toggle" posture survives as the absence of any DM-side switch.
- **Changelog and transparency:** every published refresh appends a `refresh_history` entry on the piece (operations, problems addressed, approval ref). When the org toggle (config) is on, the approved artifact includes a visible "Last updated {month year} — {summary}" block — an E-E-A-T signal, shipped through the normal payload, never injected post-approval.

### 2.8 Legacy adoption

Research's import created legacy pieces — read-only guests, embedded, mappable, linkable, **freshness-scored but not refreshable**. Adoption makes them citizens:

- **Matching** runs through publishing's provider interface (D12 — never Framer-specific code here): the piece's slug/URL is matched against the connected CMS's collections via `listCollections` + introspection. Matched pieces show the match evidence ("`/blog/help-pollinators` ✓ in collection *Blog*"); unmatched pieces stay read-only with the reason stated and a manual-match affordance.
- **Adopt** (single or "adopt all matched", each a logged in-app decision — nothing changes in the world): the piece gains a `cms_item_id` and managed status, a claims backfill is **offered** (capped, cost-stated — D30), the refresh queue admits it, and research's Link Sweep suggestions into it upgrade from the manual-export checklist to the normal batched `dm_update_article` path (a clarifying cross-reference write-back to research §2.7 — §10).
- **The promise, kept verbatim from v1:** *nothing changes on your site until you approve a specific refresh.* Adoption is permission to propose, never permission to act.

### 2.9 Drift interplay (D32)

`published_body` is this spec's substrate, and publishing §2.11 defines the three states where reality may have diverged:

- **Pending drift** on a piece **holds** its refresh proposals: scans still run and score, but no `dm_refresh_drafts` row is created — you cannot generate a diff against contested truth. The hold renders on the queue row and the piece panel, naming the drift event with its resolve affordance; resolving (adopt or restore) releases the hold and, on adopt, triggers re-extraction so the ledger describes the adopted reality.
- **Dismissed-divergent** pieces scan the stored `published_body` with the divergence **stated on every output** — the score, the queue row, any resulting diff carries the chip ("this piece is deliberately divergent from DM's record since {date}"). The org chose divergence; the system respects it and never pretends otherwise.
- Scanning live content is structurally absent: it would create a second source of truth and break the `published_body` law. Drift detection is publishing's; this spec consumes its verdicts.

### 2.10 Cost and safety controls

Carried from PATCH-004 §7 and hardened: per-account daily scheduled-refresh cap (seeded 1) · verification only on `expiring`/expired claims · web-search budget per batch · the >40% abort (§2.6) · the cascade cap (§2.2) · rollback is publishing's revert-first law (its §2.5 stage 7: the stored body changes only after the CMS confirms — a failed refresh publish leaves prior truth intact) · scan batches bounded by published-piece count with per-stage resumability. Every control is config (D31), visible in S4, and stamped on the runs it governed.

---

## 3. Tools exposed

The `content_freshness` capability — two tools, defined canonically in `dm-platform-integration.md` §3 (descriptions final there; restated for completeness). Per integration decision C, `tools.ts` is the single definition.

| Tool | `isConsequential` / `autoApproveThreshold` | `surface` / `actionCategory` | Description (as shipped) | Returns |
|---|---|---|---|---|
| `dm_scan_freshness` | `false` / `null` | `query` / — | Scan published pieces for decay and stale claims using publish-date signals, claim extraction, and platform GSC/SERP data where connected. Returns scores and named, evidenced problems per piece; takes no action. Use when the user asks what content is stale or before proposing refreshes. | `{ pieces: [{piece_id, title, freshness_score, problems: [{claim, why_stale, evidence}]}], summary }` |
| `dm_propose_refresh` | `false` / `null` | `draft` / — | Generate a complete refresh draft for a stale published piece as a reviewable diff: every change shown against the live version, each tied to a named problem from the freshness scan. Returns a diff awaiting review; publishing the refresh is a separate consequential action. Use after `dm_scan_freshness`, or when an intelligence event warrants updating a piece. | `{ refresh_id, piece_id, diff_url, problems_addressed, status: 'pending_review' }` |

`dm_scan_freshness` computes live (fresh tool queries + the latest scan rows), states `sources_used`/`gaps` in its summary, and respects D32 holds (a drift-held piece returns its score with the hold named). `dm_propose_refresh` is drafting — never consequential (contract §9.3); the publish belongs to `dm_update_article` (publishing's tool), and invoking it on a drift-held piece returns the hold as the actionable error, never a draft against contested truth. **No publish tool ships here** — execution is publishing's, structurally. Internal routes (not agent tools): `/api/dm/freshness/claims/*` (ledger, backfill), `/api/dm/freshness/scans/*`, `/api/dm/freshness/queue`, `/api/dm/freshness/refresh/*` (drafts, block resolution, submit), `/api/dm/freshness/adopt`, `/api/dm/freshness/config/*` (versioned changes through review).

---

## 4. Cortex layers read and written

**Reads:** `products` (the §2.2 product-fact verification substrate, at ask #1 depth through the trainer's accessor — the one read this spec cannot do without; empty Products means `profile_linked` claims simply verify as `unverifiable` with the absence stated, never as current), `competitive` (light: naming the competitor on SERP-gap and pressure evidence where the domain is known; emptiness degrades framing, never detection), `org` (light: the transparency-note phrasing default). Every read tolerates emptiness.

**Writes: none — structurally.** Freshness learns about *content state*, not about the business; nothing it produces belongs in Cortex. Claims, scans, refresh operations, and diffs are operational data — on the integration §4.1 blocklist by class (a flagged additive entry: `claim_record`, `refresh_operations` — §10) *and* structurally unreachable: this spec contains no proposal constructor. What refreshes teach about voice flows out exclusively through editor-review's capture → the trainer.

---

## 5. Approval touchpoints

| Moment | Type | Role here | Notes |
|---|---|---|---|
| Refresh diff publish (`dm_content_refresh_publish`) | **review** | **Originates and owns the content**; submits per §2.7; publishing executes | 48h / `pause_workflow`; Sentinel as diff at execution; the named first candidate for earned autonomy (integration §5.3) — calibration is the platform's |
| Rewrite-not-refresh acceptance (D28) | — | A P1 card routing to generation's `full_regen` — drafting, non-consequential; the eventual publish is the row above | No second decision surface; the heavyweight moment is the publish, where it belongs |
| Measurement refresh-class handoff | review (downstream) | **Receives** the rec; this spec owns the resulting diff decision | Diagnosis + frozen evidence attach (§2.5) — already specced from measurement's side (its §2.10/§5) |
| Metadata-only operations submitted alone | quick (`dm_content_metadata_update`) | A refresh scoped purely to metadata submits at quick weight — scope derived from the actual diff, never asserted (integration §5.2) | The CTR-rework path's natural shape |
| Block accept / edit / reject; draft save/resume | — | In-app collaborative checkpoints (§2.7) — nothing leaves the system | No cards, constitutionally |
| Adoption; backfill; config changes | — | Logged in-app decisions; config versions through review (D31) | Adoption changes nothing in the world |
| Scheduled scan/generation | — | The cron proposes; it holds no approvals and can reach no boundary | The §1 property, restated as a guarantee |

**Standalone:** the identical flow through the in-app approval surface (integration §5.7) — block resolution, submission, Sentinel (account-scoped, runs in both modes), execution, verification. No Program holds exist; the strategic type never appears here in any mode (this spec proposes no Program mutations — the D28 finding reaches the Program only if measurement's machinery stages it).

---

## 6. Data — Data Tables appendix

All tables `account_id`-scoped (`uuid not null references auth.users(id)`), **RLS mandatory** (`using (account_id = auth.uid())`), migrations sequential in the monorepo `supabase/migrations/`. SQL-sketch format for `specs/data-model.md` consolidation.

```sql
-- The claims ledger (the atomic unit of staleness; judgment + frozen evidence, never a search cache)
create table dm_claims (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,                    -- dm_pieces
  claim_type text not null check (claim_type in
    ('statistic','dated_reference','external_fact','price_or_number',
     'product_fact','recommendation','link_rot')),
  claim_text text not null,                  -- the sentence as published
  chunk_anchor text,                         -- location (research §2.7 chunk identity)
  source_url text,                           -- citation, if any
  expiry_model text not null check (expiry_model in
    ('calendar','data_superseded','profile_linked','link_health','evergreen')),
  expires_at timestamptz,                    -- calendar-model claims
  product_field_refs jsonb,                  -- profile_linked: the Cortex Products fields asserted (§2.2)
  status text not null default 'current' check (status in
    ('current','expiring','stale','superseded','unverifiable','superseded_by_refresh')),
  replacement_text text,                     -- frozen at verification (D19 discipline)
  replacement_source_url text,
  verification_evidence jsonb,               -- { judged_against, fetched_at, method } — frozen, never re-served
  last_verified_at timestamptz,
  created_at timestamptz default now()
);
create index idx_dm_claims_piece on dm_claims (account_id, piece_id, status);
create index idx_dm_claims_due on dm_claims (account_id, status, expires_at)
  where status in ('current','expiring');

-- Freshness scans (D19 applied: derived judgment + frozen inputs + honesty fields; weekly per D27)
create table dm_freshness_scans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,
  cycle_date date not null,
  freshness_score int,                       -- null only when zero signals available (stated, not zeroed)
  subscores jsonb not null,                  -- per signal: { value, weight_applied }
  frozen_inputs jsonb not null,              -- per signal: { value, source, fetched_at }
  gap_records jsonb not null default '[]',   -- §2.3: SERP gaps + external-pressure records, evidence inline
  refresh_priority float,                    -- (100 - score) × traffic weight; null when GSC absent (stated)
  sources_used text[] not null,
  gaps jsonb not null,                       -- [{ signal, reason }]
  drift_state text not null default 'none' check (drift_state in ('none','held_pending','dismissed_divergent')),
  config_version int not null,
  created_at timestamptz default now(),
  unique (account_id, piece_id, cycle_date)
);
create index idx_dm_fresh_scans_piece on dm_freshness_scans (account_id, piece_id, cycle_date desc);

-- Refresh drafts (the proposal record; publishing's dm_publish_jobs is the execution record)
create table dm_refresh_drafts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,
  trigger text not null check (trigger in
    ('scheduled','manual','measurement_rec','product_cascade','radar_event','cannibalization_merge','rewrite_path')),
  origin_ref jsonb,                          -- rec id / radar event ref / cascade event / merge brief — attribution
  scan_id uuid references dm_freshness_scans(id),
  freshness_score_before int,
  estimated_score_after int,
  operations jsonb not null,                 -- [{op: replace_sentence|insert_section|rewrite_section|
                                             --   update_metadata|fix_link, anchor, before, after,
                                             --   problem_ref, evidence, resolution: pending|accepted|edited|rejected,
                                             --   edited_text?}] — no operation without problem_ref (enforced)
  stages jsonb not null,                     -- pipeline state: brief → scope → generate → audit → checklist → assembled
  voice_audit jsonb,                         -- composite + violations (generation's audit output)
  checklist_invocation_id uuid,              -- editor-review's dm_checklist_results (invocation: 'refresh')
  status text not null default 'queued' check (status in
    ('queued','generating','awaiting_review','partially_resolved','submitted',
     'published','discarded','aborted_rewrite','failed')),
  approval_id uuid,                          -- the dm_content_refresh_publish approval (one per submission)
  submitted_diff_hash text,                  -- the merged accepted set's anchor (editor-review §2.3 discipline)
  correlation_id uuid,                       -- Task provenance (integration §6.5)
  created_at timestamptz default now(),
  resolved_at timestamptz
);
create index idx_dm_refresh_open on dm_refresh_drafts (account_id, status)
  where status in ('queued','generating','awaiting_review','partially_resolved','submitted');
create unique index idx_dm_refresh_live on dm_refresh_drafts (piece_id)
  where status in ('queued','generating','awaiting_review','partially_resolved','submitted');
  -- one live refresh per piece, structurally (the generation §2.1 pattern)

-- Freshness judgment as configuration (D31: the D20 mechanism, owned here)
create table dm_freshness_config (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  version int not null default 1,
  scope text not null check (scope in
    ('score_weights','refresh_threshold','daily_cap','cascade_cap','search_budget',
     'abort_threshold','changelog_visibility','backfill_cap')),
  config jsonb not null,
  source text not null default 'seeded' check (source in ('seeded','user_edited','review_proposed')),
  change_rationale text,
  active boolean not null default true,
  created_at timestamptz default now(),
  unique (account_id, scope, version)
);
```

**Columns this spec contributes to `dm_pieces`** (canonical in `specs/data-model.md`): `freshness_score int` + `last_freshness_scan_at timestamptz` (denormalized — the queue, library column, and Corpus Map glow read these), `refresh_history jsonb default '[]'`, `adopted_at timestamptz` + `cms_match_state text` (legacy adoption — `unmatched | matched | adopted`), `refresh_hold text` (`none | drift_pending` — D32, derived from publishing's drift state, denormalized for queue queries).

**v1 tables that do not return** (for `data-model.md`'s list): `content_claims` (→ account-scoped `dm_claims` with frozen-evidence discipline), `refresh_jobs` (→ `dm_refresh_drafts` for the proposal + publishing's `dm_publish_jobs` for execution — the v1 conflation of proposing and executing is the thing v2 deletes), any freshness settings org rows (→ `dm_freshness_config`), the Adjuster-snapshot inputs to the score (→ measurement's trajectory interface), any SERP-pull cache (→ platform integration caching; gap records are decision evidence, not a cache).

---

## 7. Surfaces & Explainability

Primitives per doc-system §3.3 (reconcile with `ux/experience-architecture.md` when it lands): **P1** propose→review→approve · **P2** diff surface (the canonical implementation is editor-review §2.9; this spec mounts its refresh-diff mode and defines its semantics) · **P3** generation theater · **P4** evidence drawer. No parallel primitives. The Corpus Map's freshness glow and the library's freshness column are contributions to research's and editor-review's surfaces, not surfaces here.

### S1 — Freshness Home (the queue)
**Purpose:** the section home that orients — corpus freshness at a glance, the ranked refresh queue with each piece's *named* problems, drafts awaiting review, holds, and the rewrite proposals. **Narrative moment:** Tuesday morning ("freshness diffs queued" — the doc-system narrative, verbatim); the monthly ritual's "what's rotting" check. **Primary action:** review the top awaiting-review draft; when none, refresh the top queue piece. **Primitives:** P1 (awaiting-review drafts and D28 rewrite proposals render as decision cards), P4 (every score opens its subscores → frozen inputs → sources and `fetched_at`; every queue position opens the priority arithmetic; every named problem opens its claim or gap evidence).
**Five states:** *Empty* — nothing published: standalone onboards ("Freshness begins with your first published piece — here is what will be watched," the signal list with source requirements); activated states the first-scan date against the publish plan. *Loading* — queue skeletons; the sources banner first (honesty before numbers). *Populated* — corpus freshness, the ranked queue (score, trajectory chip, problem summary like "3 stale stats · 1 SERP gap · 1 dead link", traffic weight where sourced), drift holds grouped and named, pending drafts, rewrite proposals, the cap/settings summary. *In-progress* — a running scan or backfill renders as the live signal with scope and budget state ("verifying 14 claims — 9 free date checks, 5 searched, budget 5/40"). *Failed/partial* — a failed source query renders that signal column unavailable-with-reason while the rest populate; a scan failure leaves prior scans authoritative with staleness named. Never blank, never silently partial.
**Why:** "why is this piece ranked first?" → the priority formula with its inputs; "why can't this piece be refreshed?" → the drift hold, the event, the resolve affordance; "why is the ranking score-only?" → the GSC gap and its connect affordance.

### S2 — Refresh Review (the diff mount)
**Purpose:** resolve a refresh — the §2.7 experience on the canonical viewer. **Narrative moment:** Tuesday morning's two-minute review; the propose-don't-publish flagship rendered. **Primary action:** Submit for publish (stating unresolved blocks when blocked); per-block accept as the unit gesture. **Primitives:** P2 (constitutionally — the refresh-diff mode), P1 (the submission and its approval state, deep-linked to the card), P4 (every block's evidence chip: the superseded source with its date, the SERP read, the radar event, the measurement diagnosis; the estimated score delta opens its arithmetic), P3 (a still-generating draft renders its pipeline stages; a resumable failure names the stage).
**Five states:** *Empty* — no draft for this piece: the piece's problems listed with "Generate refresh" and the cost/scope it would take (never a blank diff). *Loading* — block skeletons with the before-side rendered first. *Populated* — change blocks grouped by operation type, resolutions live, the running tally ("6 accepted · 1 edited · 1 rejected"), the submit affordance with the merged-set summary. *In-progress* — generation streaming blocks in; or submitted-and-pending with the approval card's state rendered and deep-linked; or executing with publishing's job stages streamed. *Failed/partial* — a generation failure names the stage with prior operations intact and resumable; a Sentinel `blocked` at execution renders the verdict verbatim with edit-and-resubmit as the path (never override); a failed publish leaves prior truth intact, stated.
**Why:** every block answers "why this change?" with its problem and evidence; "what exactly am I approving?" → the merged accepted set, block by block; "why did this come back?" → the Sentinel reason or the verification incident, verbatim.

### S3 — Piece Freshness Panel (mounted in the piece view, beside publishing's Live Status)
**Purpose:** one piece's decay picture — score history, the claims ledger, gap records, refresh history. **Narrative moment:** any "how stale is this, exactly?" moment; the post-refresh "what changed?". **Primary action:** Refresh now (or the hold's resolve affordance). **Primitives:** P4 (the ledger *is* an evidence surface: every claim with its status, replacement, and source; every gap with its data; score history with config-version markers), P2 (refresh-history entries open their diffs), P1 (a pending draft or rewrite proposal renders inline).
**Five states:** *Empty* — an unpublished piece: "the ledger begins at publish," with what extraction will look for — never a fake zero. *Loading* — panel skeletons. *Populated* — score with trajectory, the ledger grouped by status, gaps, history, the next-scan date. *In-progress* — a verification or refresh touching this piece, scoped and live. *Failed/partial* — per-section isolation; an unverifiable claim renders as exactly that, with the attempt's evidence.
**Why:** every claim answers "why is this stale?" with its expiry model and the verification evidence; "why hasn't this been checked?" → evergreen marking or the next batch date.

### S4 — Settings & Adoption (Freshness settings; the adoption flow lives in Content Library where research's import lives)
**Purpose:** the levers (cadence, threshold, caps, budgets, changelog visibility — all D31 config with versions) and the legacy-adoption flow. **Primary action:** adopt matched legacy pieces, when any await; otherwise review a pending config change. **Primitives:** P1 (adoption is a propose→confirm micro-decision stating exactly what changes — "the Freshness Engine can propose updates; nothing changes until you approve a specific refresh"; config changes preview before versioning), P4 (every config value opens its provenance and the runs it governed; every match opens its slug evidence).
**Five states:** *Empty* — no legacy pieces and seeded config: the seeded values stated as such with the import cross-link. *Loading* — skeletons. *Populated* — config cards with versions and rationale; the adoption list (matched with evidence / unmatched with reasons / adopted with dates). *In-progress* — a backfill running with its cap and cost ticking. *Failed/partial* — a provider-introspection failure degrades matching to manual with the connection error surfaced from publishing's health, named.
**Why:** "why is this piece unmatched?" → the slug comparison shown; "why did the cron only do one refresh?" → the cap, its value, its version.

---

## 8. Standalone mode

The engine is identical; the sources are platform-integration-gated, not mode-gated, and every absence is stated:

- **Always running (any mode, any Cortex state):** claim extraction and the calendar/link verification passes (no external dependencies beyond web search and HTTP), content-age scoring, the refresh pipeline, the diff review, adoption, the changelog. The score renormalizes per §2.4 — integration §9's row ("recency and claim-date signals only, stated in the evidence drawer") is exactly this mechanic.
- **Integration-gated:** SERP gaps and traffic weighting appear when DataForSEO/GSC are connected at the platform level — standalone accounts hold Kinetiks IDs and can connect them (asks #2/#4); designed empty states otherwise.
- **Cortex-gated, stated:** product-fact verification needs the Products layer; with it empty, `profile_linked` claims verify `unverifiable` with the trainer CTA — never silently current.
- **Connected-only, stated:** radar pressure records (ask #3 + orchestration), measurement-handoff provenance from a registered Program (`correlation_id` null, "user-initiated" honestly), Program holds (never occur).
- **Approvals:** the in-app flow per §5 — same blocks, same submission, same Sentinel, same execution through publishing's standalone path. On upgrade everything persists (account-scoped); the category's approval history seeds confidence per integration §5.7.

No feature forks; the absences are the platform's, named.

---

## 9. Model/task mapping (`@kinetiks/ai` configuration)

**Scoring, priority, date math, link checks, diff assembly, and block resolution are deterministic code.** Model calls extract, verify, scope, and write — and the writing reuses generation's craft tasks rather than duplicating them at a lower bar. Task keys:

| Task key | Tier | Used in |
|---|---|---|
| `claim_extraction` | standard | §2.1 — identify and type claims at publish/backfill |
| `claim_verification` | standard | §2.2 — claim vs fresh search results: current / superseded / unverifiable |
| `serp_gap_extraction` | fast | §2.3 — topics from competitor H2s/snippets |
| `refresh_scoping` | standard | §2.6 — problems → operations, one-to-one |
| `refresh_sentence_write` | standard | §2.6 — surgical sentence replacements (a sentence is not a section) |
| *consumed, not owned:* `section_generation`, `section_rewrite`, `transition_audit`, `voice_audit`, `citability_rewrite`, `metadata_generation` | craft / standard per generation §9 | §2.6 — insertions and rewrites at the original bar, thinking budgets included |
| `rewrite_finding_framing` | standard | §2.6 D28 — the abort finding → proposal prose; never invents numbers |

Fallback discipline per generation §9 (standard falls back up to craft, fast to standard, logged; craft tasks inherit generation's no-downward-fallback law). **Cost controls:** verification scoped to due claims with the search budget; extraction bounded by publish events + capped backfills; gap extraction only on the biweekly clock; refresh generation bounded by the daily cap and the one-live-refresh-per-piece index; the rewrite path is a deliberate human acceptance, never automatic.

---

## 10. Platform dependencies and write-backs

**Existing asks this spec depends on:** **#4** (GSC — trajectory inputs via measurement, traffic weighting; interim: priority degrades to score ordering, stated), **#2** (DataForSEO — SERP gaps; interim: the gap signal renormalizes out, stated), **#5** (pgvector — PAA-answered checks; interim: lexical fallback with stated confidence), **#1** (Products depth — product-fact verification through the trainer's accessor; interim invisible here), **#9** (Sentinel `article_refresh_diff`; interim: post-merge `blog_post`, the safe direction), **#3** (radar pressure records — absent it, that source simply has no records), **#8** (Programs — holds and Task mirroring on refresh pieces; absent it, standalone semantics).

**No new platform asks.** Every external need routes through existing asks; verification's web search is an agent capability under the contract, used at computation time with frozen evidence.

**Write-back flags (filed, not silently applied):**
1. `specs/editor-review.md` §2.3/§6: additive `capture_surface` value `refresh_diff` and intake from the refresh-diff mode's block-edit action (same no-double-count discipline; refresh edits teach the ledger).
2. `specs/research-architecture.md` §2.7: clarifying cross-reference — adoption upgrades Link Sweep suggestions into adopted pieces from manual-export to the batched `dm_update_article` path (research already states adoption is this spec's; this names the consequence).
3. `dm-platform-integration.md` §4.1: additive `filterProposal` blocklist entries `claim_record`, `refresh_operations` (§4 here).
4. `dm-platform-integration.md` §2: additive `/api/dm/status` feature `refreshes_awaiting_review` (Marcus connection-awareness: the Tuesday-morning brief should know the diff count without a tool call).
5. `specs/radar-response.md` (forward): the §2.3 external-pressure record is the binding consumer contract that spec fills; deltas come back here as write-backs.

---

## 11. Self-check

| Mandatory section | Present |
|---|---|
| Purpose | §1 |
| Mechanism | §2 |
| Data (dm_* tables, SQL-sketch Data Tables appendix) | §6 |
| Tools exposed (names, consequential flags, Marcus-grade descriptions) | §3 (two tools, both non-consequential by design; no publish tool — execution is publishing's, structurally) |
| Cortex layers read/written, proposal shapes, evidence requirements | §4 (reads: products/competitive/org, light, degradations stated; writes: none, structurally — no proposal shapes exist by design) |
| Approval touchpoints and types | §5 |
| Surfaces & Explainability (screens, five states each, evidence, "why", canonical primitives only) | §7 (S1–S4; P1–P4 only; the diff is the canonical viewer's mode, never a fork) |
| Standalone mode (exact empty-Cortex behavior) | §8 |
| Model/task mapping via `@kinetiks/ai` | §9 (craft writing consumed from generation, never duplicated at a lower bar) |

**Locked decisions:** **propose-don't-publish** — the cron proposes, the human publishes; no path from scan to CMS exists that skips the approval; no DM-side autonomy switch exists (the platform's category threshold is the only dial) — §2.5, §2.7, §5 ✓ · **one approval decision** — block resolution is in-app; one review approval per submission; the rewrite path's heavyweight moment is its publish — §2.7, §5 ✓ · **zero analytics ingestion** — platform tools at scan time; frozen evidence under the D19 line; trajectory consumed from measurement, never re-pulled — §2.2–§2.4 ✓ · Cortex canonical — product facts verify against the layer; nothing forked, nothing proposed — §2.2, §4 ✓ · platform-owned sensing — this spec watches nothing; radar's events arrive as records, drift verdicts arrive from publishing — §2.3, §2.9 ✓ · standalone-first — §8 ✓ · single company per account — §6 ✓.
**No surface without five states** — S1–S4 ✓. **No invented primitives** — P1–P4 only ✓. **New platform dependencies:** none assumed; none needed ✓. **Changes to approved/earlier docs flagged for write-back, not silently applied** — §10 ✓. **Boundary contracts stated from this side:** claims extraction trigger (consumed from publishing's cascade) · trajectory (consumed from measurement's guaranteed interface) · refresh-class handoff (receiving contract for measurement's recs) · external-pressure record (binding forward contract radar fills) · the refresh-diff mode (mounts editor-review's viewer; owns the semantics) · craft tasks (consumed from generation, with the citability refresh variant run here per gen §2.6) · `update_refresh` execution + `published_body` law (publishing's; this spec decides, never executes) · drift verdicts (publishing's; D32 consumes) · `track`/convert-to-evergreen (radar's column; this spec owns enrollment) ✓.

---

*Dark Madder v2 — specs/lifecycle-freshness.md — June 2026*
