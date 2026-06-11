# Dark Madder — Knowledge Trainer

> **Spec:** `specs/knowledge-trainer.md` — subsystem spec 1 of 10 per `dark-madder-v2-doc-system.md` §7.
> **Date:** June 2026 · **Status:** Draft for approval
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > `platform-contract.md` and `dm-platform-integration.md` (binding at the app boundary) > `ux/experience-architecture.md` (binding for surfaces; not yet written — interaction primitives cited here are the four defined in doc-system §3.3 and must be reconciled when that doc lands) > `platform-asks.md` > this spec.
> **Sources consolidated:** ARCHIVE-Voice_Engine (the trainer flow, profile dimensions, voice application contract), ARCHIVE-Learning_Loop (corrections ledger, drift detection), ARCHIVE-PATCH-005 (customer language mining, mandatory redaction). All superseded by this document.
> **Depends on:** nothing. (One field, `dm_lexicon_entries.coverage_status`, is *computed by* research-architecture's corpus intelligence; this spec defines the field and renders it, and renders honestly without it.)
> **Locked decisions honored:** Cortex is canonical for voice/products/customers/competitive — DM is the trainer; the corrections ledger and author voice are dm-private; single company per account; standalone-first.

---

## 1. Purpose

The Knowledge Trainer is how Dark Madder learns who it is writing for and as. It is the v1 Voice Engine rebuilt around one inversion: **the trainer's primary output is no longer a DM-private profile — it is Cortex proposals.** Everything the trainer learns about the organization's voice, products, customers, competitive position, and narrative flows into the Context Structure through the Synapse proposal pipeline, with evidence, where every Kinetiks app benefits from it. DM keeps private only what is genuinely content-craft machinery: the corrections ledger, the author voice layer, refinement history, and the lexicon's craft view.

The trainer produces three knowledge products:

1. **Cortex proposals** (shared): voice calibration, product depth, customer personas and mined language themes, narrative elements, competitor observations from uploaded materials. Canonical home: the Context Structure. The trainer is, by locked decision, the platform's best trainer of these layers.
2. **The dm-private craft brain**: the corrections ledger with effectiveness decay, the author voice layer (per-human writing identity — Cortex has no Author concept yet; platform-ask #7), refinement-round history, and the customer lexicon's content-craft view. These are structurally unreachable by the proposal path (§5.4).
3. **The interim product-knowledge overlay** (`dm_product_knowledge`): expert-writer product depth per platform-ask #1, held dm-side only until the Cortex Products schema extension ships, then migrated in via proposals and dropped. A sunset table, designed as one.

Two consequences define the product experience. First, **standalone onboarding *is* the trainer**: a user who signs up at dm.kinetiks.ai and completes training has populated their Context Structure without ever hearing the word Kinetiks, and upgrades with layers already rich. Second, **training quality is the ceiling on everything downstream** — generation reads the Cortex Voice layer plus the ledger plus the author layer; research reads products, customers, and the lexicon. The trainer is where the ceiling is set.

---

## 2. Mechanism

### 2.1 The four training channels

| Channel | Time | What it produces |
|---|---|---|
| Website scan | ~2 min, automated | Initial Voice findings; org/product observations; the org-language baseline used by lexicon distinctiveness scoring |
| Refinement rounds | 15–30 min, iterative | Calibration deltas to Voice (org) and to the author layer; repeatable forever as recalibration |
| Document upload + guided intake | 5+ min, optional | Voice rules from style guides; product depth (ask #1 fields); narrative elements; competitor observations |
| Customer language mining | 2 min to start, continuous | The customer lexicon; Customers-layer proposals; curated vocabulary proposals to Voice |

A fifth, continuous channel — the learning loop — runs for the life of the account: every substantive edit captured in the editor (capture mechanics: `specs/editor-review.md`) is classified here, distilled into ledger rules, and periodically aggregated into Voice proposals. Drift detection (§2.8) watches the whole system and proposes recalibration when quality decays.

All channels converge on one pipeline: **extract → show the user with evidence → user confirms/adjusts → emit** (Cortex proposal, ledger rule, author-layer update, or overlay write, by destination). Nothing the trainer learns becomes canonical without passing a human checkpoint — in-DM confirmation for dm-private destinations, the Cortex evaluation pipeline for shared ones.

### 2.2 Website scan

Triggered at onboarding (domain provided) or on demand from the Trainer home.

1. Fetch the homepage plus up to 10 content pages (blog, about, key landing pages); strip nav/footer/boilerplate with readability-style extraction.
2. One extraction pass (`scan_voice_extraction`, §9) producing the ten-dimension voice read carried from v1: adjectives, tone, sentence patterns, vocabulary level, transition patterns, warmth style, banned patterns, unique markers, emotional register, formality spectrum — **each finding with quoted excerpts from the actual site text**. Findings without excerpts are discarded before display.
3. A second pass extracts org/product observations (positioning language, named products, claimed differentiators, stated audience) — candidate material for Products/Org confirmation, never auto-proposed.
4. The site's term-frequency baseline is computed and cached once per scan; it is the "org language" side of the lexicon's distinctiveness score (§2.6).

**Output surface:** the Scan Review screen (§7, S2) — a findings card per dimension with its excerpts, each confirmable, adjustable, or rejectable. Confirmed voice findings are bundled into a single `voice` proposal (shape in §4); confirmed product/org observations route into guided intake (§2.4) as pre-filled fields, because product facts deserve the structured treatment, not a scan guess.

The scan is honest about its nature: a read of public writing, weighted accordingly (`evidence.source: 'website_scan'`, lower confidence than refinement-derived findings). A site written by an agency three rebrands ago should lose to ten minutes of refinement rounds, and the confidence math makes it lose.

### 2.3 Refinement rounds

The v1 insight stands: people cannot describe their voice, but they can edit toward it. A refinement round:

1. Picks a section type not yet covered (opening / data-heavy body / closing — then transitions, FAQ) and a topic from the org's domain (Cortex products/org if present, scan topics otherwise).
2. Generates a ~200-word sample using the current calibration (Cortex Voice + author layer + active ledger rules). Generation streams — this is a small **generation theater** moment.
3. Presents it in the editor: *"Edit this until it sounds like you. Change anything."*
4. Analyzes the diff (`refinement_diff_analysis`, §9): what changed, why, expressed as calibration deltas (rhythm, vocabulary, transition style, warmth integration, structural preference) with the before/after as evidence.
5. Shows the deltas on the **diff surface** with plain-language interpretation ("You shortened every sentence over 25 words and cut both adjective pairs — reading this as a preference for compression and concrete nouns"). The user confirms or corrects the interpretation — correcting the interpretation is itself signal.
6. Confirmed deltas route by scope: org-voice deltas accumulate into a `voice` calibration proposal (batched per session, not per round); author-style deltas write to `dm_author_voice` directly (dm-private, no proposal).

Three rounds is the onboarding default; rounds remain available forever, and drift alerts (§2.8) schedule them. Every round is persisted (`dm_refinement_rounds`) — the refinement history is part of the craft brain and is evidence for any voice proposal it produced.

**Scope attribution** (org vs author) is the round's hardest judgment. Default heuristic: rounds run during org onboarding attribute to org voice; rounds run from an author's profile page attribute to the author. Ambiguous deltas (a delta contradicting the established org profile during an author session) are surfaced as an explicit question — "Is this how *you* write, or how the *brand* should write?" — never silently guessed.

### 2.4 Document upload and guided intake

**Uploads** (.docx, .pdf, .md, URLs): brand guidelines, style guides, writing samples, competitor content. Processing mirrors the scan — extract with excerpts, cross-reference against existing findings, **flag conflicts rather than resolving them** ("Your style guide bans first person; your last 8 blog posts use it constantly. Which is canonical?"). Style-guide rules extract into voice proposals; hard rules (banned phrases, required patterns) also seed `voice`-scoped ledger rules so generation enforces them mechanically from day one. Writing samples additionally yield `sample_excerpts` (labeled exemplars with what each demonstrates) for the voice proposal. Competitor documents yield `competitive` observations.

**Guided product intake** is the section-by-section pattern proven in v1 (PATCH-002), now targeting the ask #1 field set: problem dimensions and world-without-product; mechanism with ordered steps and features-with-why; detailed personas with objections and search behavior; differentiators with evidence and honest competitive landscape; common objections with honest answers; origin story; current state and limitations; terminology, banned terms, approved descriptions; proof points; content integration rules. Each section offers "AI: help me fill this in" drafting from the scan + uploads, completion is tracked per section, and the per-section profile-strength signal feeds §2.9.

Destination is conditional on ask #1: when the extended Cortex Products schema is live, confirmed sections submit as `products` enrich proposals; until then they write to `dm_product_knowledge` and queue as deferred proposals, exactly per the ask's interim clause. The intake UI is identical either way — the user never sees the plumbing difference.

### 2.5 Customer language mining

Carried from PATCH-005 with two structural changes: lexicon-derived shared knowledge exits via Cortex proposals, and connector-based sources route through platform integrations (decision below). The pipeline, intact:

**Sources.** Paste-first remains the design stance — the paste box is the hero, zero-setup, auto-detecting format (thread, review list, transcript, email chain) via a fast classification pass. File upload (CSV/TXT/MD with column mapping) handles Intercom/Zendesk/Typeform exports. **Connector sources (Gmail, Reddit, app-store reviews, Slack/Intercom/Gong) are platform integrations, not DM fetchers** — the platform owns all external data connections (the standing rationale of platform-ask #2; DM-side crawlers are deleted scope, not deferred scope). Filed as **proposed platform-ask #11** (§10). Until it ships: paste and file cover every source by manual export, stated plainly in the UI. `dm_language_sources` is connector-agnostic from day one so flipping a source from manual to platform-fed is a config change.

**Redaction — mandatory, pre-storage, non-optional.** Before any utterance persists: regex pass for structured PII (emails, phones, account ids, addresses, payment fragments) plus a model pass for names in prose, replaced with typed placeholders (`[NAME]`, `[EMAIL]`). Redaction runs in-memory during ingestion; **unredacted text is never written to the database.** For inbox-class sources, raw bodies are never stored at all — mined in memory, extractions only. Retention: extractions and up to 3 short redacted exemplar quotes per entry persist; raw redacted utterances live 30 days (re-mining window) then purge on a scheduled job. "We mine your inbox without warehousing your inbox" is stated at connection time, verbatim-grade plain.

**Segmentation** splits input into utterances and excludes org-authored text (agent replies, the org's own comments) — mining customer language, not the org echoing itself.

**Extraction** per batch produces typed entries: `term`, `phrase`, `question`, `objection`, `praise`, `emotion` — each with counts and source attribution.

**Scoring:** frequency × distinctiveness, where distinctiveness compares against (a) the org-site term baseline from the scan and (b) general English. High frequency + high distinctiveness is the gold: language customers use constantly that the org never does.

**The lexicon** aggregates entries with receipts — counts, source breakdown, exemplar quotes, trend — and computes **language gaps** ("they say *spare change apps* 247×; you say *micro-philanthropy*"). The coverage check (is this question answered anywhere in the corpus?) is computed by research-architecture's embeddings against `dm_lexicon_entries.coverage_status`; until corpus intelligence is live the field renders as "coverage unknown" — never a fabricated state.

**Where it flows:**
- **→ Cortex Customers:** mined themes, objections, and question patterns (always post-redaction) as `customers` enrich proposals with frequency counts and redacted exemplars as evidence (§4).
- **→ Cortex Voice:** the v1 "vocabulary layer" becomes **curated vocabulary proposals**. The user reviews each language-gap swap as a toggle (defaulted on for the top 10, evidence shown); the accepted set submits as a `voice` proposal (preferred/avoided term pairs with mirror-these-question-phrasings guidance). Rationale for the change: in Cortex, Harvest emails and Litmus pitches inherit customer vocabulary too — the whole point of DM being the platform's trainer. The learning-loop conflict check carries: if the user keeps editing a preferred term back out of drafts, the ledger rule wins and the trainer proposes withdrawing/amending the vocabulary entry rather than letting the two fight silently.
- **→ Research:** territory candidates from lexicon clusters and seed vocabulary, consumed by `specs/research-architecture.md` Discovery (the ear-icon evidence convention carries). The trainer exposes the data; Discovery owns the surface.
- **→ Product knowledge:** lexicon objections/praise not present in a product's objection/differentiator fields trigger enrichment prompts; accepting maps them into the ask #1 fields (overlay or proposal per §2.4).

### 2.6 The corrections ledger

The dm-private craft brain. Carried from Learning_Loop with renamed scopes and an account-scoped schema.

**Inputs.** Paragraph-level edits captured by the editor (`specs/editor-review.md` owns capture; the diff arrives here) plus refinement-round diffs. The noise filter runs first (fast classification: substantive voice/style change vs factual addition vs minor fix vs deletion); only substantive changes enter rule extraction. Factual additions route to product-knowledge enrichment prompts (§2.4) — the v1 "knowledge base" JSONB dies into that path. Deletions log separately and feed template-length signals to generation-engine via the monthly aggregate.

**Rule extraction** (per substantive edit): classify the edit type (`voice_correction | word_choice | transition_fix | rhythm_adjustment | structural_change | deletion`), extract a specific reusable rule (the v1 quality bar stands: "write more naturally" is rejected; "follow each statistic with a human-scale comparison" is the standard), keep the bad/good example pair, assign scope (`author | voice | product`) and category (`voice | structure | word_choice | transitions | tone | rhythm | formatting | terminology`), tag section type and content type.

**Dedup and conflict:** semantic similarity against active same-scope rules; >85% similar merges (examples appended, `times_applied` incremented); contradictions flag both for user resolution — never auto-resolved.

**Effectiveness decay:** rules start at 1.0; a same-category, same-section-type edit made despite the rule being injected drops it 0.15. Below 0.5 = decaying (injected, flagged); below 0.3 or manual deactivation = inactive. After 4–5 overrides a rule dies and a more specific one is extracted from the latest edit. Monthly maintenance deactivates never-applied rules after 60 days.

**Injection contract (consumed by generation-engine):** top-N active rules by effectiveness × times_applied, filtered to the generating scope chain (author if an author layer is active → voice → product), formatted as the Learned Preferences block. The query shape is defined here; generation-engine consumes it.

**Periodic aggregation → Cortex:** the ledger itself never leaves DM, but its *patterns* do. A monthly pass looks for stable, high-effectiveness org-scope patterns ("user softened the CTA in 9 of 11 drafts") and proposes them as `voice` calibration adjustments with edit-pattern counts as evidence — exactly the proposal class in dm-platform-integration §4.1. The proposal carries the pattern and counts, never raw edit diffs (blocked by `filterProposal` and, more importantly, never emitted: §5.4).

### 2.7 Author voice

Per-human writing identity, distinct from org voice — the proven v1 concept, dm-private until Cortex grows an Author concept (platform-ask #7, permanent interim acceptable).

- Keyed by `user_id` within the account; a single account can hold several authors.
- Built from **explicit, opt-in** signals only: refinement rounds run in author context, and author-scoped ledger rules. Never silently inferred from whoever edited last — attribution ambiguity is asked, not assumed (§2.3).
- Activated per piece ("write as Zack") in generation; when active, the stacking order from v1 holds with Cortex as the org layer: template → product knowledge → **Cortex Voice (org rules win on hard constraints)** → author characteristics. The org voice is the guardrail; the author voice is the personality inside it.
- Profile dimensions carry from v1: sentence rhythm (with the burstiness parameters: avg length, variation, fragments with examples, short-punch-after-long, max consecutive same-length), vocabulary tendencies, transition style, rhetorical patterns, warmth integration, structural preferences.

### 2.8 Voice drift detection

Generation quality decays for knowable reasons: contradictory accumulated rules, model updates, the org's style evolving past its calibration. Drift detection watches rolling 10-piece windows per account (and per author where active):

- **Metrics:** edits per draft (should fall), voice-match composite trend (should rise), edit-category distribution (one category >50% = a specific weakness), time-to-approval (should fall).
- **Alert thresholds (defaults, stored as config not constants):** edits/draft rising 3 consecutive pieces; voice match <80 for 3 consecutive; single category >50% over 10 pieces; time-to-approval rising 5 consecutive.
- **On alert:** the Trainer home shows drift status with the evidence (the trend charts and the dominant edit category); the suggested action is a recalibration session — refinement rounds seeded with the current calibration and targeted at the weak category. Completing it emits a `voice` recalibration proposal with drift scores and the refinement transcript as evidence.
- Drift comparisons run against the **Cortex Voice layer as it was at each piece's generation time** (the layer version rides on the piece record), so a Cortex recalibration mid-window doesn't read as drift.

### 2.9 Training strength signal

The trainer computes per-layer training coverage for everything it feeds: Voice (scan ✓ / rounds completed / samples uploaded / rules active), Products (intake section completion per ask #1's profile-strength signal), Customers (lexicon size, sources, persona enrichments accepted), Author (rounds per author). This signal drives: the Trainer home, activated-mode empty states elsewhere in DM ("Voice layer at 82% — generate your first draft"), the `untrained voice` flag on drafts (dm-platform-integration §9), Marcus's view via `dm_get_training_status` (§3), and `/api/dm/status` features (additive: `voice_training_strength`).

It is DM's *training-coverage* read, complementary to Cortex's own layer-confidence score — the spec never conflates the two, and the UI labels them distinctly.

---

## 3. Tools exposed

> **Write-back flag.** `dm-platform-integration.md` §2 marks its six capability descriptions final and §3 enumerates the tool surface; neither includes a trainer capability. The three tools below are filed as a **proposed write-back** adding a seventh capability, `content_knowledge`, to the manifest and `tools.ts` — not assumed. Until accepted, the trainer is reachable via UI and internal `/api/dm/trainer/*` routes only, and Marcus learns training state from the `/api/dm/status` features additions (also additive, also part of this write-back). Rationale: "is my voice trained?" and "learn from these support emails" are first-week Marcus flows; routing them through a vague non-answer wastes the capability registry's whole design.

| Tool | `isConsequential` / `autoApproveThreshold` | `surface` / `actionCategory` | Description (written for Marcus) | Returns |
|---|---|---|---|---|
| `dm_get_training_status` | `false` / `null` | `query` / — | Get Dark Madder's training coverage: voice training strength (website scan, refinement rounds completed, active learned rules), product knowledge completeness per product, customer lexicon size and sources, author voice profiles, and current voice drift status with evidence. Use this when the user asks whether their voice is trained, why drafts carry an "untrained voice" flag, what training steps remain, or before recommending content generation for a lightly-trained account. | `{ voice: {strength, scan_done, rounds_completed, active_rules, drift: {status, evidence}}, products: [{product, completion, missing_sections}], lexicon: {entries, sources, top_gaps}, authors: [{name, rounds}], next_best_action }` |
| `dm_get_customer_lexicon` | `false` / `null` | `query` / — | Get the mined customer lexicon: how customers actually phrase things versus how the org does (language gaps with frequency and distinctiveness), top customer questions with content-coverage status, and top objections — every entry with counts, source breakdown, and redacted exemplar quotes. Use this when the user asks what their customers actually say or ask, wants content ideas grounded in real demand, or asks about vocabulary mismatches. Returns redacted data only; raw customer communications are never stored or returned. | `{ language_gaps: [{customer_term, org_term, frequency, distinctiveness, sources, exemplars}], questions: [{text, frequency, coverage_status}], objections: [...], totals, sources }` |
| `dm_ingest_customer_language` | `false` / `null` | `draft` / — | Ingest pasted customer communications (reviews, support emails, community threads, call notes, survey answers) into the customer language mining pipeline: PII is redacted before anything is stored, customer statements are separated from org replies, and the lexicon updates with new terms, questions, and objections. Nothing is published or proposed automatically; lexicon-derived suggestions await user review. Use this when the user provides raw customer text and wants Dark Madder to learn from it. Long-running for large pastes; returns an ingestion id and streams progress. | `{ ingestion_id, source_id, utterances_accepted, utterances_excluded_as_org, redactions_applied, new_lexicon_entries, status }` |

None are consequential: nothing here leaves the system. The trainer's consequential-feeling output — changing the canonical Context Structure — is governed by the Cortex evaluation pipeline (§5), not the DM approval queue. Per integration decision C, registering these in `tools.ts` automatically extends the Synapse command handler and capability registration.

---

## 4. Cortex layers read and written

**Reads:** `org`, `products`, `voice`, `customers`, `competitive`, `narrative` (refinement topic selection, intake pre-fill, conflict detection against existing layer state, drift baselines). Reads handle empty/partial layers gracefully everywhere — an empty layer is the trainer's starting condition, not an error.

**Writes (proposals, per the binding rules: declared layers only, additive to arrays, never overwrite scalars, evidence mandatory):**

### 4.1 `voice`

```jsonc
{
  "targetLayer": "voice", "action": "enrich" | "calibrate",
  "confidence": 0.0-1.0,             // refinement-derived > document-derived > scan-derived
  "payload": {
    "adjectives": { "primary": [...], "anti_adjectives": [...] },
    "sentence_rhythm": { "avg_sentence_length": 18, "uses_fragments": true, "short_punch_after_long": true, "max_consecutive_same_length": 3, "rhythm_notes": "..." },
    "vocabulary": { "preferred_terms": [{"use": "spare change", "instead_of": "micro-donations"}], "avoided_words": [...], "avoided_connectors": ["furthermore", "additionally"] },
    "banned_phrases": [{"phrase": "...", "reason": "..."}],
    "required_patterns": [{"pattern": "...", "rule": "..."}],
    "tone_by_channel": { "blog": "...", "guide": "...", "playbook": "..." },
    "messaging_patterns": [{"pattern": "...", "context": "..."}],
    "sample_excerpts": [{"text": "...", "label": "...", "demonstrates": [...]}],
    "warmth_style": "...", "emotional_register": "...", "formality": "..."
  },
  "evidence": [
    {"source": "dm_trainer_website_scan", "detail": "quoted site excerpts per finding"},
    {"source": "dm_trainer_refinement_round", "detail": "round ids + before/after diffs + confirmed interpretation"},
    {"source": "dm_trainer_document_upload", "detail": "document name + extracted passages"},
    {"source": "dm_learning_loop_aggregate", "detail": "edit-pattern counts, e.g. 'user softened CTA in 9 of 11 drafts'"},
    {"source": "dm_lexicon_language_gap", "detail": "frequency × distinctiveness + redacted exemplars (vocabulary entries only)"},
    {"source": "dm_voice_drift", "detail": "drift scores + recalibration transcript (recalibrations only)"}
  ]
}
```

**Evidence floor:** every payload field traces to at least one evidence item; vocabulary entries from mining must carry frequency, distinctiveness, and ≥1 redacted exemplar; calibration adjustments from the learning loop must carry the pattern count. Fields that can't meet the floor are dropped from the proposal, not padded.

### 4.2 `products` (when ask #1 ships; deferred-queued against `dm_product_knowledge` until then)

```jsonc
{
  "targetLayer": "products", "action": "enrich", "confidence": 0.0-1.0,
  "payload": { "product_id": "...",
    "problem": { "statement": "...", "dimensions": [{"dimension","description","who_it_affects","severity"}], "world_without_product": "..." },
    "mechanism": { "how_it_works": "...", "steps": [...], "features": [{"name","why_it_matters"}] },
    "personas": [{"name","pain_points","goals","objections","where_they_hang_out","search_behavior"}],
    "differentiators": [{"claim","evidence"}], "competitive_landscape": { "honest": true, "where_they_win": [...] },
    "objections": [{"objection","honest_answer","evidence"}],
    "origin_story": "...", "current_state": "...", "limitations": [...],
    "terminology": { "approved": [...], "banned": [...], "approved_descriptions": [...] },
    "proof_points": [{"claim","public": true}], "content_integration_rules": [...] },
  "evidence": [
    {"source": "dm_trainer_guided_intake", "detail": "user-confirmed section + AI-assist provenance"},
    {"source": "dm_trainer_document_upload", "detail": "source document excerpts"},
    {"source": "dm_trainer_website_scan", "detail": "site passages"},
    {"source": "dm_lexicon_enrichment", "detail": "mined objections/praise with counts and redacted exemplars"}
  ]
}
```

### 4.3 `customers`

```jsonc
{
  "targetLayer": "customers", "action": "enrich", "confidence": 0.0-1.0,
  "payload": {
    "language_themes": [{"theme": "distrust of donation apps", "expressions": ["is it legit", "I don't trust these apps with my bank login"], "frequency": 127}],
    "persona_enrichments": [{"persona","objections": [...], "search_behavior": [...], "where_they_hang_out": [...]}],
    "top_questions": [{"question","frequency"}]
  },
  "evidence": [{"source": "dm_customer_language_mining", "detail": "source breakdown + counts + redacted exemplar quotes; redaction pipeline version stamped"}]
}
```

**Hard rule:** customers-layer payloads contain only post-redaction material. The proposal constructor reads exclusively from `dm_lexicon_entries` (which never held unredacted text); there is no path from raw input to a proposal.

### 4.4 `narrative` and `competitive`

`narrative`: origin story, founding insight, story elements extracted from uploads/intake — `enrich`, evidence = document excerpts + user confirmation. (Performance-validated angles are measurement's narrative proposals, not the trainer's.)
`competitive`: observations from *uploaded competitor materials only* (positioning, messaging patterns to differentiate from) — evidence = document excerpts. SERP- and discovery-derived competitive proposals belong to research-architecture; the boundary is the input's provenance.

### 4.5 What never becomes a proposal

The corrections ledger (rules, examples, effectiveness), author voice, refinement-round internals, lexicon craft internals (utterances, per-entry working state), redaction artifacts, prompts and pipeline state. Enforced structurally: proposals are constructed only by the trainer's explicit `toProposal()` outputs per §5.4 of the integration doc; the Synapse `filterProposal` blocklist (`correction`, `corrections_ledger`, `author_voice`, `refinement_round`, `lexicon_internal`, …) is the safety net, not the design.

---

## 5. Approval touchpoints

The trainer submits **no DM approval cards**: none of its actions touch the outside world, so none map to `dm_content_publish` / `dm_content_refresh_publish` / `dm_content_metadata_update` / `dm_program_change`. Its governance is two-stage by design:

1. **In-DM confirmation gates** (non-consequential UI checkpoints): scan findings confirmation, refinement-delta confirmation, intake section confirmation, vocabulary toggle curation, conflict resolutions, lexicon entry actions. These gate whether a proposal is *constructed at all*. They use the propose→review→approve primitive's component family for visual consistency but are not Kinetiks approvals.
2. **The Cortex evaluation pipeline** (platform-owned): every proposal then passes Cortex's confidence scoring, conflict detection, and optional human approval at kinetiks.ai. DM renders pending-proposal status on the Trainer home ("3 voice proposals awaiting Cortex review") but never re-implements the queue.

Standalone is identical: standalone users hold a Context Structure, and proposals flow the same way. The one orchestration difference — there is no central queue surface — is Cortex's concern, not the trainer's.

Routing event handled (`handleRoutingEvent`, integration §4.3 event 4): when the `voice` layer is updated from *any* source, the trainer recomputes training strength and drift baselines, and in-flight drafts get flagged for re-audit (generation-engine's concern, noted here for the dependency).

---

## 6. Data — Data Tables appendix

All tables `account_id`-scoped (`uuid not null references auth.users(id)`), **RLS mandatory** (`using (account_id = auth.uid())` for select/insert/update/delete policies), migrations sequentially numbered in the monorepo `supabase/migrations/`. SQL-sketch format for consolidation into `specs/data-model.md`.

```sql
-- Training sessions: one row per scan / upload batch / intake session / mining ingestion
create table dm_training_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  session_type text not null check (session_type in
    ('website_scan','document_upload','guided_intake','refinement','language_ingestion','recalibration')),
  status text not null default 'in_progress' check (status in
    ('in_progress','awaiting_review','confirmed','dismissed','failed')),
  input_ref jsonb,                    -- domain, document names, source_id — never raw bodies
  findings jsonb,                     -- structured findings with excerpts (the evidence)
  conflicts jsonb,                    -- flagged conflicts awaiting user resolution
  proposal_ids uuid[],                -- Cortex proposals emitted from this session
  created_at timestamptz default now(),
  completed_at timestamptz
);
create index idx_dm_training_sessions_account on dm_training_sessions (account_id, session_type, created_at desc);

-- Refinement rounds (craft brain; evidence source for voice proposals)
create table dm_refinement_rounds (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  session_id uuid references dm_training_sessions(id),
  author_user_id uuid,                -- null = org-voice round
  section_type text not null check (section_type in ('opening','body','transition','closing','faq')),
  topic text,
  generated_text text not null,
  edited_text text not null,
  deltas jsonb not null,              -- [{dimension, before, after, interpretation, scope: 'voice'|'author', confirmed}]
  created_at timestamptz default now()
);
create index idx_dm_refinement_rounds_account on dm_refinement_rounds (account_id, author_user_id, created_at desc);

-- Corrections ledger (dm-private; never proposal-reachable)
create table dm_corrections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  scope text not null check (scope in ('author','voice','product')),
  author_user_id uuid,                -- required when scope = 'author'
  product_id text,                    -- Cortex product id when scope = 'product'
  category text not null check (category in
    ('voice','structure','word_choice','transitions','tone','rhythm','formatting','terminology')),
  edit_type text not null check (edit_type in
    ('voice_correction','word_choice','transition_fix','rhythm_adjustment','structural_change','deletion')),
  section_type text check (section_type in ('opening','body','transition','closing','faq')),
  content_type text,                  -- blog / guide / playbook / split:<platform>
  rule_text text not null,
  bad_example text,
  good_example text,
  effectiveness_score float not null default 1.0,
  times_applied int not null default 0,
  status text not null default 'active' check (status in ('active','decaying','inactive')),
  source_piece_id uuid,               -- dm_pieces provenance
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_dm_corrections_injection on dm_corrections
  (account_id, status, scope, effectiveness_score desc, times_applied desc);

-- Author voice (dm-private; platform-ask #7 interim, permanent-ok)
create table dm_author_voice (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  user_id uuid not null,
  display_name text not null,
  sentence_rhythm jsonb,              -- avg length, variation, fragments+examples, short_punch_after_long, max_consecutive_same_length, notes
  vocabulary jsonb,                   -- preferred/avoided words, connectors, contraction use, jargon tolerance
  transition_style jsonb,
  rhetorical_patterns jsonb,
  warmth_integration jsonb,
  structural_preferences jsonb,
  rounds_completed int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (account_id, user_id)
);

-- Language sources (connector-agnostic; connector types activate via platform-ask #11)
create table dm_language_sources (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  source_type text not null check (source_type in
    ('paste','file','gmail','reddit','app_store','play_store','slack','intercom','gong')),
  transport text not null default 'manual' check (transport in ('manual','platform_integration')),
  label text not null,
  config jsonb,                       -- filters, subreddit lists, label selectors — never credentials (platform-owned)
  sync_cadence text not null default 'manual' check (sync_cadence in ('manual','daily','weekly')),
  last_synced_at timestamptz,
  utterance_count int not null default 0,
  status text not null default 'active' check (status in ('active','paused','error')),
  created_at timestamptz default now()
);

-- Redacted utterances (30-day re-mining window; purged on schedule; NEVER holds unredacted text)
create table dm_utterances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  source_id uuid not null references dm_language_sources(id) on delete cascade,
  redacted_text text not null,
  redaction_version text not null,    -- pipeline version stamp for auditability
  detected_kind text,                 -- review / ticket / thread_comment / transcript_turn / survey_answer
  created_at timestamptz default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index idx_dm_utterances_expiry on dm_utterances (expires_at);

-- Customer lexicon (the aggregated living output; the only proposal-readable mining table)
create table dm_lexicon_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  entry_type text not null check (entry_type in ('term','phrase','question','objection','praise','emotion')),
  text text not null,
  normalized_text text not null,
  frequency int not null default 0,
  distinctiveness float,
  source_breakdown jsonb,             -- {reddit: 201, app_store: 38, paste: 8}
  exemplar_quotes jsonb,              -- [{quote, source_type, date}] max 3, redacted
  org_equivalent text,                -- language gaps: what the org says instead
  coverage_status text check (coverage_status in ('covered','not_covered','partial')),  -- computed by research-architecture
  covered_by_piece_id uuid,
  trend_30d float,
  status text not null default 'active' check (status in ('active','dismissed','merged')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_dm_lexicon_account on dm_lexicon_entries (account_id, entry_type, status, frequency desc);

-- Interim product-knowledge overlay (platform-ask #1; SUNSET TABLE — migrates into Cortex via
-- the proposal pipeline and is dropped when the Products schema extension ships)
create table dm_product_knowledge (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  cortex_product_id text not null,
  sections jsonb not null,            -- the ask #1 field set, keyed by section
  section_completion jsonb,           -- per-section strength signal
  deferred_proposals jsonb,           -- proposals queued for when the schema ships
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (account_id, cortex_product_id)
);

-- Drift windows (rolling metrics; evidence for drift alerts and recalibration proposals)
create table dm_voice_drift_windows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  author_user_id uuid,                -- null = org-level window
  window_pieces uuid[] not null,
  edits_per_draft float,
  voice_match_avg float,
  edit_category_distribution jsonb,
  time_to_approval_avg interval,
  drift_status text not null check (drift_status in ('improving','plateau','drifting')),
  alert jsonb,                        -- triggered thresholds + evidence pointers
  computed_at timestamptz default now()
);
```

**v1 tables that do not return** (for `data-model.md`'s explicit list): `voice_profiles` (org/product scopes → Cortex Voice/Products; user scope → `dm_author_voice`), org-scoped `language_sources`/`lexicon_entries` (rebuilt account-scoped above), the org-record knowledge-base JSONB (→ product knowledge path).

---

## 7. Surfaces & Explainability

Interaction primitives per doc-system §3.3 (to be reconciled with `ux/experience-architecture.md` when it lands): **P1** propose→review→approve · **P2** diff surface · **P3** generation theater · **P4** evidence drawer. No parallel primitives are invented below. Every screen specifies its five states; full state copy lands in `ux/screen-system.md`.

### S1 — Trainer Home
**Purpose:** orientation — what DM knows, how well, what's next. **Narrative moment:** first hour (both modes); the monthly ritual (drift). **Primary action:** the single next-best training step. **Primitives:** P4 (every strength number opens its evidence: which scan, which rounds, which rules); P1 (pending Cortex proposal status).
**Five states:** *Empty* — standalone: the onboarding entry ("Let's learn your voice — 2 minutes to start"); activated: Cortex-aware ("Your Voice layer arrived at 74% from Kinetiks — two refinement rounds will push past 90"). *Loading* — skeleton of strength meters. *Populated* — per-layer strength, drift status (green/yellow/red with evidence), pending proposals, lexicon summary. *In-progress* — a live session (scan running, mining ingesting) renders inline via P3. *Failed/partial* — per-channel failure with retry ("Website scan failed: site unreachable — retry or paste content instead"); never a blank screen.
**Evidence per claim:** every strength score, drift status, and "next best action" opens its underlying data in the drawer. **Why affordance:** "Why is my voice 62%?" → the component breakdown with what's missing.

### S2 — Website Scan Review
**Purpose:** confirm/adjust/reject the scan's voice findings; route org/product observations to intake. **Primary action:** confirm findings → submit voice proposal. **Primitives:** P3 (scan progress: pages fetched → extraction → findings), P1 (the findings bundle is a proposal in review), P4 (each finding card opens its quoted site excerpts).
**Five states:** empty (no domain yet — prompt or skip to paste/upload) · loading (fetch skeleton) · in-progress (P3 staged progress) · populated (findings cards with excerpts, per-card confirm/adjust/reject) · failed/partial ("Read 4 of 10 pages — findings from those 4 only", clearly scoped).
**Evidence:** no finding renders without its excerpts (enforced upstream, §2.2). **Why:** each adjective/pattern answers "where did you get this?" with the exact quoted passages.

### S3 — Refinement Round
**Purpose:** the edit-toward-your-voice loop. **Primary action:** "Done editing — show me what you learned." **Primitives:** P3 (sample streams in), P2 (the delta review is the diff surface: before/after with interpreted deltas), P4 (each delta opens the exact text spans behind it).
**Five states:** empty (round picker: section types not yet covered, recommended next) · loading · in-progress (sample streaming; then user editing — both live sub-states of in-progress) · populated (delta review with confirm/correct per delta, scope attribution where ambiguous) · failed (generation failure → retry with same topic; analysis failure → edits preserved, re-analyze).
**Why:** every delta states its inference in plain language and is correctable — correcting the interpretation is captured as signal.

### S4 — Document Upload & Guided Intake
**Purpose:** extract from uploaded materials; complete the ask #1 product field set section by section. **Primary action:** confirm a section / resolve a conflict. **Primitives:** P1 (extractions and sections reviewed before becoming proposals), P4 (every extracted field opens its source passage), P3 (extraction progress on large uploads).
**Five states:** empty (upload affordance + section checklist at 0%, with "AI: help me fill this in" available from scan data) · loading · in-progress (extraction running; partially complete checklist) · populated (sections with completion %, conflicts flagged inline) · failed/partial (per-document failure isolated; other documents' extractions unaffected).
**Why:** conflicts show both sources verbatim and ask, never auto-resolve; every pre-filled field shows provenance (scan / document / AI-assist / user).

### S5 — Listening (sources & ingestion)
**Purpose:** add customer language; manage sources. **Primary action:** paste. **Primitives:** P3 (ingestion theater: segmenting → redacting → extracting → aggregating, with counts), P4 (source rows open sync history and exclusion counts).
**Five states:** empty (the paste box as hero, with the privacy posture stated: redaction before storage, 30-day raw window, inbox bodies never stored; connector sources listed with platform-integration status per ask #11 — "available when connected at the platform level", honest, no dead buttons) · loading · in-progress (P3 with live counts: "212 utterances · 38 org replies excluded · 491 redactions") · populated (sources with last-sync, counts, status) · failed (per-source error with the platform's actionable message passed through).
**Why:** "why were 38 excluded?" opens the org-reply detection explanation with examples.

### S6 — Customer Lexicon
**Purpose:** the receipts view — language gaps, questions, objections. **Primary action:** act on an entry (curate vocabulary toggle → voice proposal; send territory candidate to Discovery; enrich product objections; dismiss). **Primitives:** P4 throughout (counts, source breakdown, exemplars on every entry — *receipts or it didn't happen*), P1 (vocabulary curation set submits as a proposal).
**Five states:** empty (educational: what mining produces, with the paste CTA) · loading · populated (gaps / questions with coverage badges / objections; trend arrows) · in-progress (recompute after a sync: stale-data banner with progress) · failed/partial (coverage column shows "coverage unknown" when corpus intelligence is unavailable — stated, never faked).
**Why:** every coverage badge opens the matching corpus piece (or the absence); every "they say X, you say Y" opens both frequency computations.

### S7 — Corrections Ledger
**Purpose:** view, edit, deactivate, export the craft rules; resolve conflicts; see the learning curve. **Primary action:** resolve flagged conflicts. **Primitives:** P2 (every rule's bad/good example pair renders as a diff), P4 (effectiveness history per rule: which drafts applied it, which edits decayed it).
**Five states:** empty ("Rules appear as you edit drafts — the system learns from every correction") · loading · populated (rules by scope/category with effectiveness, the learning-curve chart: edits/draft trending down, voice match trending up, drift status) · in-progress (monthly maintenance running: banner) · failed (chart data unavailable → rules still listed; degradation isolated).
**Why:** every rule answers "where did this come from?" (the originating edit, piece, and date) and "is it working?" (applications vs overrides). Drift status opens the full metric windows.

---

## 8. Standalone mode

The trainer is the one subsystem with no degraded dimension in standalone, because **standalone onboarding is the trainer** (locked decision; integration §9 row 1):

- A dm.kinetiks.ai signup creates a Kinetiks ID and an empty Context Structure behind the scenes. The first-hour flow — scan → 2–3 refinement rounds → optional paste of customer language → optional intake — is the trainer, framed entirely as "teach Dark Madder your voice," never as "populate Kinetiks."
- Proposals flow identically: standalone users hold a Context Structure and the Cortex evaluation pipeline is account-scoped, not orchestration-gated. There is simply no central queue surface; proposal status renders in-DM only.
- Empty Cortex is the trainer's *starting condition*, not an exception path: every read handles empty layers, and topic selection falls back from Cortex products → scan topics → user-stated topic.
- Connector mining sources require platform integrations (ask #11) which standalone accounts can connect (they hold Kinetiks IDs, same posture as DataForSEO in ask #2); paste and file are always available.
- **Upgrade:** nothing migrates because nothing was siloed — the layers are already populated, author voice and the ledger are already account-scoped dm-private tables, and the activated experience inherits a trained system on day one. This is the doc-system's principle 4 made concrete.

---

## 9. Model/task mapping (`@kinetiks/ai` configuration)

The v1 tiering philosophy survives as configuration: fast tier for classification/filtering/redaction-assist, standard tier for extraction/analysis/proposal construction, strategic tier reserved for genuinely strategic judgment (none in this subsystem — territory work lives in research-architecture). No model string is ever hardcoded in application logic (CLAUDE.md rule); names below are task keys in DM's `@kinetiks/ai` config module.

| Task key | Tier | Used in |
|---|---|---|
| `scan_voice_extraction` | standard | §2.2 ten-dimension extraction with excerpts |
| `scan_org_product_observation` | standard | §2.2 candidate org/product facts |
| `refinement_sample_generation` | standard | §2.3 sample paragraphs (full voice stack applied) |
| `refinement_diff_analysis` | standard | §2.3 delta extraction + interpretation |
| `document_extraction` | standard | §2.4 style guides, samples, competitor docs |
| `intake_ai_assist` | standard | §2.4 "help me fill this in" drafting |
| `edit_noise_filter` | fast | §2.6 substantive / factual / minor / deletion classification |
| `edit_rule_extraction` | standard | §2.6 classification + reusable rule + examples |
| `rule_dedup_check` | fast | §2.6 semantic-similarity assist for merge/conflict |
| `ingest_format_detection` | fast | §2.5 what kind of paste is this |
| `utterance_segmentation` | fast | §2.5 split + org-vs-customer attribution |
| `pii_redaction` | fast | §2.5 names in prose, after the regex pass |
| `language_extraction` | standard | §2.5 typed entries per batch (50 utterances/call) |
| `lexicon_aggregation` | standard | §2.5 variant merging, language-gap naming |
| `drift_analysis` | standard | §2.8 window interpretation + recalibration framing |
| `proposal_construction` | standard | §4 payload assembly + evidence binding |

**Cost controls carried from v1:** extraction batches of 50, only new utterances since last sync; per-sync fetch caps when connector sources activate (500, oldest-first backfill on demand); the org-language distinctiveness baseline computed once per scan and cached; noise filter runs before any standard-tier call.

**Embeddings note:** rule dedup and lexicon variant-merging use embedding similarity where available, via the same embedding configuration research-architecture defines (proposed platform-ask #12); lexical fallback otherwise. No trainer feature hard-depends on embeddings.

---

## 10. Platform dependencies and write-backs

**Existing asks this spec depends on:** #1 (Cortex Products extension — interim overlay specced in §2.4/§6), #7 (Author concept — permanent interim acceptable).

**Proposed addition to `platform-asks.md` — Ask 11: customer-communication source connectors.**
*What DM needs:* Gmail read-scoped mining access, Reddit subreddit/keyword fetch, and app-store review fetch exposed as platform integration tools per the integration contract (flexible tools, platform-managed credentials/caching/rate limits), available to standalone-tier accounts. Slack/Intercom/Gong as later providers under the same contract. *Why:* the platform owns all external data connections (ask #2's standing rationale); DM-side fetchers would rebuild deleted scope, and Harvest (objection mining) and Litmus (community sentiment) want the same sources. *Depends on it:* this spec §2.5 (connector sources only). *Suggested owner:* platform; DM-contributed: the mining-specific requirements (read-only scopes, in-memory body handling for inbox sources, fetch caps). *If late:* paste and file cover every source via manual export — full mining capability, manual transport, stated plainly in the UI. No DM-side fetchers get built under any schedule pressure.

**Write-back flags (changes to approved v2 docs — filed, not silently applied):**
1. `dm-platform-integration.md` §2/§3: add the `content_knowledge` capability and the three §3 tools; add `voice_training_strength` and `lexicon_entries_count` to the `/api/dm/status` features list.
2. `platform-asks.md`: append Ask 11 above; note in Ask 12 (filed by research-architecture) that the trainer is a second consumer of embedding routing.

---

## 11. Self-check

| Mandatory section | Present |
|---|---|
| Purpose | §1 |
| Mechanism | §2 |
| Data (dm_* tables, SQL-sketch Data Tables appendix) | §6 |
| Tools exposed (names, consequential flags, Marcus-grade descriptions) | §3 |
| Cortex layers read/written, proposal shapes, evidence requirements | §4 |
| Approval touchpoints and types | §5 |
| Surfaces & Explainability (screens, five states each, evidence, "why", primitives from the canonical four) | §7 (S1–S7; P1–P4 only) |
| Standalone mode (exact empty-Cortex behavior) | §8 |
| Model/task mapping via `@kinetiks/ai` | §9 |

**Locked decisions:** Cortex canonical with DM as trainer — §1, §4 ✓ · corrections ledger and author voice dm-private — §2.6, §2.7, §4.5, §6 ✓ · single company per account (account-scoped everything, no org tier) — §6 ✓ · zero analytics ingestion (nothing here ingests analytics) ✓ · standalone-first (onboarding is the trainer) — §8 ✓ · one approval decision (no second approval surface created; Cortex pipeline governs proposals) — §5 ✓.
**No surface without five states** — S1–S7 each enumerate all five ✓. **No parallel primitives** — only P1–P4 used ✓. **New platform dependencies** written as proposed platform-asks, not assumed — §10 ✓. **Changes to approved docs** flagged for write-back, not silently diverged — §3, §10 ✓.

---

*Dark Madder v2 — specs/knowledge-trainer.md — June 2026*
