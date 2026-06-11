# Dark Madder — Generation Engine

> **Spec:** `specs/generation-engine.md` — subsystem spec 3 of 10 per `dark-madder-v2-doc-system.md` §7.
> **Date:** June 2026 · **Status:** Draft for approval
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > `platform-contract.md` and `dm-platform-integration.md` (binding at the app boundary) > `ux/experience-architecture.md` (binding for surfaces; not yet written — primitives cited are the four from doc-system §3.3, to be reconciled) > `platform-asks.md` > this spec.
> **Sources consolidated:** ARCHIVE-Content_Generator §§1–4, 6–8 (templates, pipeline, scheduling, cost, content types, regeneration), ARCHIVE-Voice_Engine §§5–7 (voice application, differentiation strategy, voice metrics — the *application* half; calibration was consolidated into `specs/knowledge-trainer.md`), ARCHIVE-Model_Strategy (tiering philosophy, as `@kinetiks/ai` configuration), ARCHIVE-PATCH-007 §6 (citability gate). All superseded by this document for the territory it covers.
> **Image Engine provenance note:** the merge map points "Image Engine (doc 12) → this spec," but doc 12 is **absent from the archive corpus** (the only v1 image material is the explicit non-support in ARCHIVE-Framer_Integration §6.2). The Image Engine here (§2.7) is therefore *designed* from the doc-system §3.4 requirements — visual style profile reads Cortex Brand; review loop = accept / regenerate-with-notes / upload-own; publish gated on resolved images; social cards for splits — not consolidated. If doc 12 surfaces, reconcile against §2.7 and note deltas in the archive supersession pass.
> **Depends on:** `specs/knowledge-trainer.md` (Cortex Voice via its proposals; the corrections-ledger injection contract §2.6; the author layer §2.7; the product-knowledge accessor §2.4), `specs/research-architecture.md` (the brief contract §2.6; corpus retrieval and link-target APIs §2.7; the approval-time cannibalization check §2.5).
> **Locked decisions honored:** Cortex canonical — generation reads the shared layers, never forks them; corrections ledger and author voice consumed as dm-private inputs; zero analytics ingestion (nothing here touches analytics); one approval decision (drafting never creates one); standalone-first; single company per account.

---

## 1. Purpose

The Generation Engine turns a brief into a complete, publish-ready draft — body, images, metadata, schema — that could pass as expert human writing, and does it as a pipeline the user can watch, cancel, and resume, not a prompt behind a spinner. It is the consumer end of everything the trainer and research build: the brief tells it *what* to write, Cortex plus the craft brain tell it *how*, and the corpus tells it what already exists so it adds new ground instead of repeating old.

Three properties define it:

1. **Craft is enforced, not requested.** Per-section voice briefs, transition continuity, rhythm enforcement, the recurring metaphor, specificity over adjectives — executed stage by stage, audited by a separate pass with composite scoring, and auto-rewritten when violated. Off-voice drafts never reach the editor (integration §5.1 stage 1). The v1 differentiation strategy (burstiness, transition authenticity, controlled imperfection, specificity, recurring imagery) survives intact as generation-time law.
2. **Drafting is never consequential.** Every output terminates in the editor or a queue, never in the world (contract §9.3; integration §3.2). This spec originates zero approvals and writes zero Cortex layers — it is structurally a consumer, and §4 states that as a guarantee.
3. **The pipeline is a first-class operation.** State persists per stage (`dm_generation_runs`); generation streams, cancels, and resumes from the failed stage; the five-minute generation is the flagship of the **generation theater** primitive (P3), alive rather than opaque.

New in v2 beyond the re-plumbing: the **Image Engine** (§2.7 — featured and in-content visuals in the brand's visual identity, with a human review loop and a publish gate), the **citability gate** (§2.6 — new content is built citable, not retrofitted), and **templates as data** (§2.2 — the deletion-feedback loop from the learning loop finally lands somewhere).

---

## 2. Mechanism

### 2.1 Triggers and idempotency

Five ways a generation starts, one pipeline underneath:

| Trigger | Path | Notes |
|---|---|---|
| Platform Task dispatch | Autopilot/Program Task → Synapse command → `dm_draft_article` | **Primary trigger for pieces in a registered Program.** `correlation_id` rides the run, the piece, and every downstream artifact (integration §6.5). |
| DM scheduler | Daily job: `dm_pieces` where `scheduled_generate_at <= now()` and `status in ('planned','brief_ready')` | **The trigger for standalone mode and unregistered pieces** — and the ask #8-late interim for connected mode, so it exists unconditionally. Lead time default 3 days pre-publish (research §2.6), configurable in Generation Settings. |
| Marcus / chat | `dm_draft_article` tool call (topic or brief id) | Topic-only calls get a minimal brief synthesized via research's brief generator before the pipeline starts; the synthesized brief is stored like any other (`dm_briefs`) so evidence and provenance hold. |
| Radar fast-track | `specs/radar-response.md` auto-brief → this pipeline | Compressed scheduling, identical quality gates — speed never skips craft (integration §6.2). |
| Manual | "Generate now" from the calendar, architecture, or piece view | |

**Idempotency guard:** a generation may start only by transitioning `dm_pieces.status` to `generating` with a compare-and-set on the prior status. If the platform dispatches a Task for a piece the DM scheduler already started (or vice versa), the second trigger attaches to the in-flight run (returning its `run_id` and progress stream) instead of starting a duplicate. One piece, one live run, ever; concurrent triggers are harmless by construction.

**Account queue:** one pipeline runs at a time per account (carried — quality and rate-limit discipline). Queued pieces are visible with position; radar fast-tracks jump the queue (their schedule is their justification), stated on the queue surface, never silent.

### 2.2 Templates as data

The three v1 templates — **hub** (2,500–4,000 words), **spoke** (1,200–2,000), **playbook** (2,000–3,500) — ship as seeded rows in `dm_templates`, carrying their full v1 structure: required sections with order, target word counts, per-section structural requirements (AI hook in the first 150 words, key takeaways as standalone claims, body headings as searchable questions, definition-box and data-point requirements, FAQ shaped for schema, sources discipline), and the metadata set (meta description 140–155 chars, AI transparency line, internal links, schema data).

Templates are **user-editable through review** (section targets, word counts, additional sections) and **system-proposable**: the trainer's monthly deletion-pattern aggregate (knowledge-trainer §2.6 — "users delete the last paragraph of body sections in 7 of 9 pieces") produces template-adjustment proposals (tighten that section's word target) that the user accepts or rejects on the Generation Settings surface, with the deletion evidence attached. This closes Learning_Loop §3.3's loop, which v1 left dangling. Edits to templates version the row (`version` increments; pieces stamp the template version they generated against), so "why is this draft shaped this way?" always resolves to a specific template state.

Content-type generation notes carry as template-level voice guidance: guides weigh `tone_by_channel.guide` and structural clarity; playbooks shift toward "the coach giving the actual plays" with HowTo-schema step delineation; blogs are the primary voice vehicle with craft enforcement at maximum.

### 2.3 Knowledge assembly — the generation context

Before stage 1, the engine assembles the full context once per run and snapshots what it used (auditability; the evidence drawer reads this):

1. **The brief** — research §2.6's shape, consumed as a contract: keywords, SERP context, structural requirements, `customer_language` (required questions and objections with frequencies — the generator writes toward documented doubts), `associations` (products with integration level, campaigns), `campaign_context`, `differentiation_constraint` (from the cannibalization checkpoint, injected as a hard section-planning constraint), `applicable_policies`, `correlation_id`.
2. **The voice stack**, in the locked order (research §2.8): template guidance → campaign adjustments (soft dimensions only) → product knowledge → **Cortex Voice (org hard rules — banned phrases, required patterns — always win)** → author characteristics when an author is active ("write as Zack"). The Cortex Voice **layer version is stamped on the run and the piece** — the trainer's drift math (knowledge-trainer §2.8) and the re-audit flow (§2.10) depend on it.
3. **Corrections-ledger injection** — the trainer's contract verbatim (knowledge-trainer §2.6): top-N active rules by effectiveness × times_applied, filtered to the generating scope chain (author → voice → product) and the section type, formatted as the Learned Preferences block per section call.
4. **Product knowledge** — Cortex Products at ask #1 depth, read through the trainer's accessor so the `dm_product_knowledge` interim is invisible here. Integration level governs usage exactly per the PATCH-002 semantics carried into research §2.8: `none` = knowledge informs, product unnamed; `mention` = one option among several; `feature` = meaningful depth; `primary` = the subject.
5. **Corpus context** — research §2.7's APIs: per-section retrieval (top 3 most-similar chunks with the add-new-ground instruction — reference and link instead of repeating) and link targets (8 most-similar chunks; natural anchors, ≤1 link per 250 words, relevance over quota). Internal links are real semantic links from day one — the v1 placeholder posture is dead.
6. **Policies** — `applicable_policies` from the Task's ContextPack (integration §6.4) injected as hard constraints in every prompt ("all content references SOC 2," cadence caps, banned terms) and re-verified by the checklist (§2.6 of `specs/editor-review.md`) — enforcement points 2 and 3 of programs-spec §2.5.
7. **Untrained-voice check** — if the Voice layer is empty or training strength is below threshold (the trainer's §2.9 signal), the run proceeds but the piece carries the prominent `untrained_voice` flag (integration §9): the audit scores against documented defaults, the editor shows the trainer CTA, and the capability description's promise ("flagged for voice training first") is kept.

### 2.4 The pipeline

Seven stages, each persisted (`dm_generation_runs.stages`), each streaming progress (`CommandProgress` over the command channel; rendered as P3 in Marcus chat and in-app), each independently resumable.

**Stage 1 — Outline.** Brief + template → exact headings (searchable questions for body sections), key points per section, source/data-point placement, definition-box placement, the recurring metaphor (established in the opening, referenced mid-body and in the closing), link placements from the corpus link targets, and the per-section word budgets. The `differentiation_constraint`, when present, shapes section selection here — overlapping sections with the similar piece are avoided at the outline, the cheapest place to avoid them.

**Outline checkpoint (decision D4):** when the originating Task declares an outline checkpoint (the "{Cluster} Engine" Workflow template does — integration §6.2), the pipeline **pauses post-outline** in state `awaiting_outline_checkpoint`, the checkpoint resolves through the platform (48h, `pause_workflow` on timeout), and the run resumes on approval — a normal persisted pause, not a special case. Runs with no checkpoint (manual, chat, scheduler, fast-track) auto-proceed; an org setting can force the pause for manual runs. The outline is always stored and always visible in the theater regardless.

**Stage 2 — Section-by-section generation.** One call per section. Each call carries: the section's outline slice; the **per-section voice brief** (the Voice_Engine §5.1 pattern — the focused, relevant subset of the stack for *this* section type: how this voice opens, how it weaves texture through data, how it earns the closing); the previous section's last paragraph (transition continuity); the section-filtered Learned Preferences block; corpus context and link targets for this section; keyword and definition-box assignments; the craft rules as system law (rhythm variation with the short-punch-after-long pattern, no structural transition words, warmth woven not bolted, specificity over adjectives, data inside sentences that carry context and scale); and the word budget with the no-padding instruction. Sections stream into the theater as they complete. Per-section state (`dm_piece_sections`) records the voice brief used, the chunks retrieved, and the links placed — the evidence behind every later "why."

**Stage 3 — Assembly and transition audit.** Sections assemble; a dedicated pass rates every paragraph boundary (smooth / acceptable / jarring) and rewrites only the connecting tissue of jarring receivers — first 1–2 sentences, content untouched — returning the fix report (theater-visible, drawer-inspectable).

**Stage 4 — Voice audit.** The full-piece consistency check against the assembled voice stack, producing the **voice match composite** (0–100; components per Voice_Engine §7, carried intact): banned-phrase violations (binary deductions), rhythm match (statistical comparison against the profile, including the 4+-consecutive-similar-length detector), transition quality (% thought-bridges vs structural markers), warmth integration (paragraph-level information+warmth co-occurrence), vocabulary alignment. Plus the structural checks: recurring metaphor present, closing pays off earlier specifics, claims sourced.

- **Must-fix violations** (any banned phrase; flat-rhythm stretch; structural transition word; bolted-on warmth; missing metaphor) trigger automatic section rewrite — targeted, constraint-carrying, continuity-preserving — then re-audit. **Rewrite loop cap: 3 passes**; a piece still violating after 3 enters review with the violations *visibly unresolved* rather than looping forever — the editor shows them as blocking checklist items. Never silently shipped, never infinitely retried.
- **Warnings** (composite < 85; readability outside the org's range; word count > 20% over target) flag for review without auto-fix. **Composite < 75 triggers a full-section rewrite pass** before queueing (the v1 floor, carried).
- The composite, per-dimension breakdown, and every violation with its text span persist on the run — this is the evidence the editor's voice score opens (P4), the `agent_confidence` input (integration §5.4), and the `dm_avg_voice_match` metric source (integration §8).

**Stage 5 — Metadata.** Meta description (140–155, keyword included), Article / FAQ / Breadcrumb schema (HowTo for playbooks), key-takeaways and definition-box extraction, internal-link map, slug/URL confirmation, author attribution, the AI transparency line (template-configurable, on by default). Stored structured on the piece; the citability audit *verifies* this output, never regenerates it (PATCH-007 §9 discipline).

**Stage 6 — Images (§2.7).** Runs **in parallel with stage 5** — concepts derive from the finished, audited body, which is why this stage sits after the voice audit (decision D3a). The draft never waits in `generating` for image review: it enters the queue with images attached in their initial review states; *resolution* gates publish (editor-side), not review.

**Stage 7 — Checklist invocation.** The engine invokes the checklist engine (owned by `specs/editor-review.md` §2.4 — decision D9) over the complete artifact. Two classes of outcome at pipeline time:

- **Citability gate failures** (the five PATCH-007 §6 checks: direct-answer lead on probe-mapped sections; question-shaped H2s; self-contained passages — no orphan pronouns or "as mentioned above" in answer passages; schema completeness *verified*; attribution surface) produce specific fix operations executed by the craft rewrite path **now**, so the user sees a passing checklist, not homework. Rules live in versioned config (`citability-rules.ts`); `specs/ai-visibility.md` owns the tuning signal (which passage structures actually win citations for this org, from `org_passage_used`) and proposes rule revisions; this spec owns the config. One owner each.
- All other auto-items are computed and stored; hard failures that survive (e.g., a must-fix voice violation past the rewrite cap) ride into review as blocking items.

The run completes: `dm_pieces.status → 'in_review'`, the version snapshot is written (`dm_piece_versions`, owned by editor-review; this spec writes on completion and regeneration), and the platform notification path fires (no DM notification infrastructure exists — kill list).

### 2.5 Regeneration and versioning

**Full regeneration** (user-initiated from the editor, or `dm_draft_article` re-invoked on a drafted piece): the current draft snapshots as a version, the pipeline re-runs with the *current* calibration — including any ledger rules extracted from this draft's edits, which is the learning loop visibly paying off — and optional directed feedback ("the opening was too generic") injected as outline-stage constraints.

**Section regeneration** (`dm_regenerate_section`, with optional direction — tone, angle, length): only the target section re-runs with its voice brief plus the direction; the transition audit re-runs **on both seams** (incoming and outgoing boundaries); the voice audit re-runs scoped to the section plus the composite recompute. Everything else untouched. In the collaborative panel this is the agent typing in one section while the rest of the document sits still — the theater scoped down to a paragraph.

Versions are restorable (editor-review §2.9); every version records its trigger (initial / full_regen / section_regen / restore) and, for regens, the directed feedback given — feedback that is itself learning-loop signal.

### 2.6 The citability gate (carried from PATCH-007 §6)

Specified in §2.4 stage 7; restated as a contract because three specs touch it: **this spec owns** the rules config, the audit execution at pipeline end, and the fix-operation path through the craft rewrite. **`specs/editor-review.md` owns** the checklist item's surface, its re-run on edit (edits can break citability), and its block semantics. **`specs/lifecycle-freshness.md` runs** the refresh-time variant on refreshes that add sections (PATCH-007 §6's explicit second site). **`specs/ai-visibility.md` owns** the empirical tuning loop. The audit verifies metadata/schema output; it never duplicates generation.

### 2.7 The Image Engine

Designed per the provenance note; requirements from doc-system §3.4.

**The visual style profile** (`dm_image_style_profiles`, one active per account) is derived from the **Cortex Brand layer** — palette, visual motifs, photography vs illustration posture, mood — plus user adjustments on the Generation Settings surface (style keywords, negative constraints, reference images). When Brand is empty (standalone day one): documented, deliberately restrained defaults (clean editorial illustration, palette from the org's site scan when available), the profile card states "derived from defaults — train your Brand layer to make this yours," and nothing pretends to brand knowledge that does not exist. The profile versions; images stamp the profile version that produced them.

**Slots.** Stage 1 plans them; stage 6 fills them: one **featured image** (mandatory slot) and zero or more **in-content slots** where the outline flagged genuine visual value (a diagram, a comparison, a process figure) — the v1 `[IMAGE: …]` placeholder instinct, now executed instead of deferred. Slot plans carry the concept rationale (drawer-inspectable: "why does this section get an image?").

**Generation.** Per slot: a concept pass (standard tier — subject, composition, text-free constraint, style-profile application) then the image call through the image-model configuration (§9; ask #12 amendment). Alt text is generated for every image (fast tier) and is **mandatory at resolution** — it is also a post-publish verification check (integration §7), so it cannot be an afterthought.

**The review loop** (editor-side surface, S2 in §7; semantics defined here): every slot is in exactly one state —

`generated` → user action → `accepted` | `regenerating` (with notes — notes append to the concept, not replace the profile) | `uploaded` (user-supplied file replaces the generated image; alt text still required) | `waived` (in-content slots only; an explicit, reasoned decision, logged — never a default).

**The resolution gate (decision D3c):** a piece is image-resolved when the featured slot is `accepted` or `uploaded` and every in-content slot is `accepted`, `uploaded`, or `waived`, with alt text present on all non-waived slots. Resolution is a **hard pre-publish checklist item** — it blocks the approve action (editor-review §2.4), not the review. Refreshes that add sections re-open the gate for new slots only.

**Social cards:** the engine exposes a card-generation capability (source piece + insight text + platform dimensions → on-profile card) that `specs/splits.md` invokes per split. Cards follow the same review-state machine inside the split queue; this spec owns the generator and the profile, splits owns the queue semantics.

**Publishing handoff:** `specs/publishing.md` consumes `dm_images` rows in resolved states — uploads to the CMS, populates the Featured Image field, rewrites in-content references to CMS asset URLs, and records `cms_asset_ref` back. Image bytes live in Supabase storage under the account's prefix; `dm_images` stores paths and state, never blobs.

### 2.8 Pipeline state, failure, and resume

`dm_generation_runs` persists per-stage status, inputs digest, outputs pointer, model/task usage, and cost. The run state machine: `queued → running → (awaiting_outline_checkpoint) → running → completed | failed | cancelled`, with `stages[]` carrying per-stage `pending | running | done | failed`.

- **Cancel** is user-initiated from the theater or the Task drawer; partial work persists (a cancelled run resumes, it does not restart).
- **Resume-from-failed-stage** is the P3 contract: a stage-4 failure resumes at stage 4 with stages 1–3 outputs intact. Retries within a stage: craft-tier tasks retry 3× with backoff and **never fall back to a lesser tier** — quality is non-negotiable for writing tasks; exhausted retries fail the stage loudly (`generation_failed`, surfaced with the failed stage named and a resume action). Standard tier falls back to craft on exhaustion (up, never down); fast falls back to standard. Logged always. Never silently degrade and never ship a lesser-tier draft unannounced (Model_Strategy §7, carried verbatim in spirit).
- Image-stage failures degrade *per slot* (a failed slot renders as failed-with-retry in the review loop) and never fail the run — the body's readiness is not hostage to an image API.

### 2.9 Re-audit on Cortex change, and cost

**Voice-layer-updated routing event** (integration §4.3 event 4): in-flight runs at stage ≤ 3 swap to the new layer version at the next stage boundary (cheap, correct); runs at stage ≥ 4 and completed drafts in review are flagged `voice_layer_stale` — the editor shows "Voice layer changed since this draft was generated" with a one-click re-audit (stage 4 re-run against the new version, rewrite loop included). Nothing regenerates silently.

**Cost tracking** (carried, expanded): every run logs per-task calls, input/output/thinking tokens, model, latency, and estimated cost, rolled up on the run and the piece. Surfaced in the theater's evidence drawer ("what did this draft cost?") and aggregated by `specs/measurement.md`. Visibility, not control — but the data is what makes tier optimization (Model_Strategy §5's reassignment triggers, carried as living practice) an evidence-based decision.

---

## 3. Tools exposed

The `content_generation` capability — three tools, defined canonically in `dm-platform-integration.md` §3 (descriptions final there; restated for completeness). Per integration decision C, `tools.ts` is the single definition.

| Tool | `isConsequential` / `autoApproveThreshold` | `surface` / `actionCategory` | Description (as shipped) | Returns |
|---|---|---|---|---|
| `dm_draft_article` | `false` / `null` | `draft` / — | Generate a complete long-form draft for a brief, cluster slot, or topic, in the calibrated brand voice with the full craft pipeline (outline, per-section generation with voice briefs, transition audit, voice audit with auto-rewrite, images, metadata). Returns a draft in the review queue, never a published piece. Use when the user asks to write or draft an article; pass a topic or a brief id. Five-minute-scale operation; returns a piece id immediately and streams stage progress. | `{ piece_id, status: 'generating', stages, review_url }` |
| `dm_regenerate_section` | `false` / `null` | `draft` / — | Regenerate one section of an existing draft with optional direction (tone, angle, length). The rest of the draft is untouched; the voice audit re-runs on the result. Use when the user wants one part of a draft redone rather than the whole piece. | `{ piece_id, section_id, status, voice_match }` |
| `dm_get_draft_status` | `false` / `null` | `query` / — | Get pipeline status for one draft or all in-flight drafts: stage (outline, sections, transitions, voice audit, metadata), voice-match score so far, blockers, and review link. Use when the user asks whether a draft is ready or what generation is doing. | `{ drafts: [{piece_id, title, stage, progress, voice_match, blockers, review_url}] }` |

None are consequential — per contract §9.3, drafting never is. Long-running tools return immediately and stream `CommandProgress` (integration §3.4). Internal routes (not agent tools): `/api/dm/generation/runs/*` (state, cancel, resume), `/api/dm/generation/templates/*`, `/api/dm/generation/images/*` (slot states, regenerate-with-notes, upload, waive), `/api/dm/generation/style-profile`.

---

## 4. Cortex layers read and written

**Reads:** `voice` (the org layer of the stack; hard rules; layer version stamped per run), `products` (ask #1 depth via the trainer's accessor), `customers` (persona grounding where the brief's customer_language is thin), `narrative` (validated angles inform framing), `brand` (the image style profile's source), `market` (light: seasonal framing where the brief flags it). Every read tolerates empty/partial layers; emptiness produces the documented degradations (§8), never errors.

**Writes: none — structurally.** The Generation Engine is the consumer end of the trainer's loop. It contains no `toProposal()` path; pipeline artifacts (outlines, section content, voice briefs, prompts, image prompts, run state) are all on the integration §4.1 blocklist *and* are never offered to the proposal constructor in the first place — the blocklist is the safety net, not the design. Everything generation learns about voice flows out through the editor's edit capture → the trainer's classification → the trainer's aggregated `voice` proposals. One trainer, one proposal source per knowledge class.

---

## 5. Approval touchpoints

**This subsystem originates no approvals.** The map of how its outputs meet the approval system:

| Moment | What happens | Owner |
|---|---|---|
| Outline checkpoint (Task-driven runs) | Pipeline pauses `awaiting_outline_checkpoint`; the platform checkpoint (review, 48h, `pause_workflow`) resolves it; resume on approval | Platform checkpoint; this spec implements the pause/resume |
| Draft completes | `in_review`; **no approval card is created by generation** — the approve-and-publish decision is the editor's one decision and the publish submission belongs to `specs/editor-review.md` §5 / `specs/publishing.md` | editor-review |
| Voice violations past the rewrite cap | Ride into review as blocking checklist items; the approve action is blocked until resolved or the items are consciously overridden where the checklist engine permits | editor-review §2.4 |
| Image resolution | Hard checklist item gating the approve action | editor-review §2.4; semantics §2.7 here |
| `agent_confidence` | The voice composite + checklist completion, normalized 0–100, computed here, submitted by the editor's approval payload (integration §5.4) | computed here, consumed there |

---

## 6. Data — Data Tables appendix

All tables `account_id`-scoped (`uuid not null references auth.users(id)`), **RLS mandatory** (`using (account_id = auth.uid())`), migrations sequential in the monorepo `supabase/migrations/`. SQL-sketch format for `specs/data-model.md` consolidation.

```sql
-- Content templates (decision D2: data, not code; seeded with the v1 three)
create table dm_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  key text not null,                   -- 'hub' | 'spoke' | 'playbook' | custom
  name text not null,
  version int not null default 1,
  word_count_range int4range not null,
  sections jsonb not null,             -- ordered: {key, heading_style, word_target, requirements[], metaphor_role?, schema_role?}
  metadata_requirements jsonb not null,-- meta description, transparency line toggle, link count, schema set
  voice_guidance jsonb,                -- content-type tone notes (tone_by_channel key, structural emphasis)
  source text not null default 'seeded' check (source in ('seeded','user_edited','system_proposed')),
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (account_id, key, version)
);

-- Generation runs (per-stage pipeline state; resume + cost + evidence)
create table dm_generation_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,              -- dm_pieces
  trigger text not null check (trigger in
    ('task_dispatch','scheduler','marcus','fast_track','manual','full_regen','section_regen','re_audit')),
  correlation_id uuid,                 -- Task provenance (integration §6.5)
  brief_id uuid,                       -- dm_briefs
  template_id uuid references dm_templates(id),
  template_version int,
  voice_layer_version text not null,   -- Cortex Voice version stamped at assembly (drift + re-audit contract)
  author_user_id uuid,                 -- active author layer, when any
  context_digest jsonb not null,       -- what was assembled: ledger rule ids, chunks retrieved, policies, lexicon items
  status text not null default 'queued' check (status in
    ('queued','running','awaiting_outline_checkpoint','completed','failed','cancelled')),
  stages jsonb not null,               -- [{stage, status, started_at, finished_at, output_ref, failure?}]
  voice_audit jsonb,                   -- composite, per-dimension scores, violations with spans, rewrite passes
  checklist_invocation_id uuid,        -- editor-review's dm_checklist_results
  cost jsonb,                          -- per-task: calls, tokens (in/out/thinking), model, latency, est_cost; rollup
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_dm_gen_runs_piece on dm_generation_runs (account_id, piece_id, created_at desc);
create unique index idx_dm_gen_runs_live on dm_generation_runs (piece_id)
  where status in ('queued','running','awaiting_outline_checkpoint');  -- the idempotency guard, in the schema

-- Per-section state (regeneration unit; per-section evidence)
create table dm_piece_sections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,
  run_id uuid not null references dm_generation_runs(id),
  position int not null,
  section_key text not null,           -- template section key
  heading text not null,
  content text not null,
  word_count int not null,
  voice_brief jsonb not null,          -- the focused stack subset used (evidence)
  corpus_context jsonb,                -- chunks retrieved, links placed (evidence)
  transition_report jsonb,             -- seam ratings + fixes applied
  regen_history jsonb,                 -- [{run_id, direction, at}]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_dm_sections_piece on dm_piece_sections (account_id, piece_id, position);

-- Image style profile (Cortex Brand-derived; versioned; one active per account)
create table dm_image_style_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  version int not null default 1,
  derived_from jsonb not null,         -- {brand_layer_version | 'defaults', site_scan_palette?}
  style jsonb not null,                -- palette, motifs, medium (photo/illustration), mood, negative constraints
  reference_images jsonb,              -- storage paths of user-provided references
  active boolean not null default true,
  created_at timestamptz default now(),
  unique (account_id, version)
);

-- Images (slots + review-state machine; publishing consumes resolved states)
create table dm_images (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid,                       -- null for split social cards
  split_id uuid,                       -- specs/splits.md
  slot text not null check (slot in ('featured','in_content','social_card')),
  section_id uuid references dm_piece_sections(id),
  concept jsonb not null,              -- subject, composition, rationale ("why this section gets an image")
  style_profile_version int not null,
  state text not null default 'generated' check (state in
    ('planned','generating','generated','regenerating','accepted','uploaded','waived','failed')),
  storage_path text,
  alt_text text,                       -- mandatory before accepted/uploaded counts as resolved
  regeneration_notes jsonb,            -- appended user notes per regeneration round
  waive_reason text,                   -- in_content only; explicit, logged
  cms_asset_ref text,                  -- written back by specs/publishing.md
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_dm_images_piece on dm_images (account_id, piece_id, slot);
```

**Columns this spec contributes to `dm_pieces`** (canonical definition in `specs/data-model.md`): `template_id` + `template_version`, `voice_layer_version`, `voice_match_score`, `untrained_voice boolean`, `voice_layer_stale boolean`, `images_resolved boolean` (derived, denormalized for queue queries), `generation_cost jsonb` (rollup), `body`, `body_format`, `metadata jsonb` (the stage-5 structured set), the `generating` status and its compare-and-set transition discipline (§2.1).

**v1 tables that do not return** (for `data-model.md`'s list): `content_pieces` (→ account-scoped `dm_pieces`, shared), generation-cost columns on org dashboards (→ run-level `cost` + measurement roll-up), any `model_config` table or constants module (→ `@kinetiks/ai` configuration).

---

## 7. Surfaces & Explainability

Primitives per doc-system §3.3 (reconcile with `ux/experience-architecture.md` when it lands): **P1** propose→review→approve · **P2** diff surface · **P3** generation theater · **P4** evidence drawer. No parallel primitives below; the editor and queue belong to `specs/editor-review.md` (decision D6).

### S1 — Generation Theater (per-piece pipeline view)
**Purpose:** the flagship P3 — watch a draft come to life, stage by stage, with control. **Narrative moment:** Tuesday morning (drafts arriving); first hour both modes (the first draft is the product's first proof). **Primary action:** none while healthy (watching is the point); cancel / resume when not. **Primitives:** P3 (staged progress: outline → sections streaming in → transition audit → voice audit with live composite → metadata → images; cancel; resume-from-failed-stage), P4 (every stage row opens its evidence: the outline with metaphor and link plan; each section's voice brief and retrieved chunks; the transition fix report; each audit violation with its span; the cost ledger).
**Five states:** *Empty* — no run for this piece: the "Generate now" entry with the context summary it would use (which template, voice strength, brief evidence). *Loading* — run record fetch skeleton. *In-progress* — the living pipeline; `awaiting_outline_checkpoint` renders as a named pause with the checkpoint's status and deep link, never a stall. *Populated* — completed run: final composite with breakdown, stage timeline, "Open in editor." *Failed/partial* — the failed stage named, prior stages' work intact and inspectable, one-click resume; image-slot failures shown per slot without failing the page.
**Evidence per claim:** the voice score opens the per-dimension breakdown and violations; every placed link opens the chunk similarity that earned it; the metaphor choice opens its outline rationale. **Why affordance:** "why did section 3 get rewritten?" → the must-fix violation, its span, and the before/after (P2 rendering via the shared diff family).

### S2 — Image Review
**Purpose:** resolve every slot — the review loop of §2.7. **Narrative moment:** Tuesday morning, the last step before approve. **Primary action:** accept (per slot). **Primitives:** P1 (each slot is a propose→review micro-decision: accept / regenerate-with-notes / upload / waive), P3 (regeneration renders as a small theater per slot), P4 (every image opens its concept rationale, style-profile version, and — for in-content slots — why the outline flagged this section as visual).
**Five states:** empty (no slots planned — stated with the outline's reasoning, not blank) · loading · in-progress (slots generating/regenerating with per-slot progress) · populated (the slot grid with states, alt-text fields inline, the resolution meter: "2 of 3 resolved — featured image required before publish") · failed/partial (failed slots carry retry; the rest of the grid unaffected).
**Why:** "why is publish blocked?" → the unresolved slots named; "why does this image look like this?" → profile + concept; waives show their logged reason forever.

### S3 — Generation Settings
**Purpose:** templates, lead time, queue, and the image style profile — the levers behind every run. **Primary action:** review a pending template-adjustment proposal, when one exists; otherwise edit. **Primitives:** P1 (template adjustments from deletion patterns are proposals with evidence; style-profile changes preview before applying), P2 (template edits render as diffs against the prior version), P4 (every template default opens its provenance: seeded v1 / user edit / system proposal with its deletion-pattern counts).
**Five states:** empty (n/a in practice — seeded templates always exist; the state is specced as the pre-migration instant and renders the seeding progress) · loading · populated (templates with versions, lead-time and publishing-days config, the queue with positions and fast-track jumps explained, the style profile card with its derivation statement) · in-progress (a profile re-derivation after a Brand layer update, with the routing event named) · failed (per-card isolation; a profile derivation failure leaves the prior version active and says so).
**Why:** every proposed template change answers "what made you suggest this?" with the deletion aggregate; the queue answers "why is this piece ahead of mine?" with the fast-track justification.

---

## 8. Standalone mode

Generation is fully functional standalone; the differences are inputs, not capability:

- **Voice:** standalone accounts that completed the trainer have a populated Voice layer (proposals are account-scoped) — generation reads it identically. An account that skipped training generates with the `untrained_voice` flag, default-scored audits, and the trainer CTA on the draft (integration §9). The flag clears when training strength crosses threshold, retroactively for drafts re-audited.
- **Triggers:** the DM scheduler is *the* trigger (no Tasks); `awaiting_outline_checkpoint` never occurs (no checkpoints exist); the org setting can still force a manual outline pause, resolved in-app.
- **Policies:** no ContextPacks exist; the policy injection step is empty and the checklist's policy items render "no Program policies — connected-mode feature," stated, never faked.
- **Images:** fully functional — the style profile derives from the site scan + defaults when Brand is empty, with the honest derivation statement (§2.7).
- **Corpus context:** identical (corpus intelligence is Cortex-independent; pgvector is the only gate, same as connected — research §8).
- **Upgrade:** nothing migrates; runs, templates, and images are already account-scoped. Registration backfills Task mirroring from `dm_pieces` state (ask #8 mapping in `specs/data-model.md`); future runs gain checkpoints and correlation ids.

---

## 9. Model/task mapping (`@kinetiks/ai` configuration)

**Decision D1: this spec introduces the `craft` tier in DM's `@kinetiks/ai` configuration** — the quality-ceiling tier (strongest available writing model, extended thinking enabled, per-task thinking budgets). Tiers are app configuration, so this is a DM config addition, not a platform ask. The v2 tier set for DM is therefore **fast / standard / craft / strategic**, with `strategic` retaining its established meaning (direction-setting judgment — none in this subsystem) and `craft` carrying the v1 Tier-1 rationale verbatim: these are the tasks where thinking through rhythm, constraints, and transitions before writing is the difference between content that passes as human and content that doesn't. Thinking output is never shown to the user — a quality investment, not a feature. No hardcoded model strings anywhere (CLAUDE.md rule); names below are task keys.

| Task key | Tier | Thinking budget | Used in |
|---|---|---|---|
| `outline_generation` | standard | — | §2.4 S1 — structural, important, not craft |
| `section_generation` | **craft** | high | §2.4 S2 — the core product |
| `transition_audit` | **craft** | medium | §2.4 S3 — tonal-whiplash detection and thought bridges |
| `voice_audit` | **craft** | medium | §2.4 S4 — subtle-violation detection across dimensions |
| `section_rewrite` | **craft** | high | §2.4 S4 / §2.6 — constrained rewriting with continuity |
| `metadata_generation` | standard | — | §2.4 S5 |
| `citability_audit` | standard | — | §2.4 S7 — mechanical structural checks |
| `citability_rewrite` | **craft** | high | §2.6 — the existing rewrite bar, carried from PATCH-007 |
| `image_concept_generation` | standard | — | §2.7 — subject/composition from final content + profile |
| `image_generation` | image-model config | — | §2.7 — via the ask #12 amendment routing; interim `IMAGE_CONFIG` module |
| `alt_text_generation` | fast | — | §2.7 |
| `style_profile_derivation` | standard | — | §2.7 — Brand layer → profile |
| `template_adjustment_framing` | standard | — | §2.2 — deletion aggregate → proposal prose |
| `directed_feedback_parsing` | fast | — | §2.5 — user regen direction → structured constraints |

**Per-task thinking budgets** are configuration (the Model_Strategy §4 pattern carried): generation and rewrites high, audits medium — tuned with cost data, never hardcoded.

**Fallback discipline (carried verbatim in spirit):** craft retries 3× with backoff, **no downward fallback ever** — exhausted retries fail the stage loudly and resumably. Standard falls back *up* to craft; fast falls back to standard. Every fallback logged. The user is never given a lesser-tier draft without being told; mostly they are simply not given one — they are given a resume button.

**Cost controls:** one run at a time per account; per-section calls bounded by template section count; corpus retrieval capped (3 + 8 chunks per section); citability fix ops run only on failed checks; image generation bounded by planned slots; the rewrite loop capped at 3.

---

## 10. Platform dependencies and write-backs

**Existing asks this spec depends on:** #1 (Products depth — read through the trainer's accessor; interim invisible here), #5 (pgvector — corpus context degrades to none-with-statement per research's interim), #8 (Programs — Task dispatch and outline checkpoints; the DM scheduler is the interim and the standalone path, so lateness costs nothing), #10 (command-handler template — `CommandProgress` streaming; the tool path works without it).

**Proposed amendment to `platform-asks.md` Ask 12 (filed, not assumed):** broaden "embedding routing in `@kinetiks/ai`" to **non-completion model routing** — embeddings *and* image generation as configured task classes (provider/model/size/safety settings as config), so the no-hardcoded-models rule holds for every model class DM calls. *Why:* the Image Engine's provider will change; that must be a config change, not a code hunt — the exact rationale ask 12 already states for embeddings. *Second consumer:* `specs/splits.md` (social cards). *If late:* a DM-local `IMAGE_CONFIG` module with identical discipline, deleted when the package surface ships — mirroring the embedding interim precisely.

**Write-back flags (filed, not silently applied):**
1. `dm-platform-integration.md` §2: `/api/dm/status` features — additive `image_generation_available` and `templates_customized` (Marcus connection-awareness: don't promise on-brand imagery when the image provider isn't configured).
2. `platform-asks.md`: the Ask 12 amendment above.
3. Archive pass: the doc-12 absence (header note) recorded in the archive README so the merge map's dangling pointer is documented, not mysterious.

---

## 11. Self-check

| Mandatory section | Present |
|---|---|
| Purpose | §1 |
| Mechanism | §2 |
| Data (dm_* tables, SQL-sketch Data Tables appendix) | §6 |
| Tools exposed (names, consequential flags, Marcus-grade descriptions) | §3 |
| Cortex layers read/written, proposal shapes, evidence requirements | §4 (reads enumerated; writes: none, structurally — no proposal shapes exist by design) |
| Approval touchpoints and types | §5 |
| Surfaces & Explainability (screens, five states each, evidence, "why", canonical primitives only) | §7 (S1–S3; P1–P4 only) |
| Standalone mode (exact empty-Cortex behavior) | §8 |
| Model/task mapping via `@kinetiks/ai` | §9 |

**Locked decisions:** drafting never consequential, no approvals originated (one-decision rule untouched) — §3, §5 ✓ · Cortex canonical, generation never forks shared layers and never proposes (the trainer is the sole voice-knowledge proposer) — §4 ✓ · corrections ledger and author voice consumed as dm-private inputs, never re-emitted — §2.3, §4 ✓ · zero analytics ingestion (nothing here reads or stores analytics) ✓ · standalone-first — §8 ✓ · single company per account — §6 account-scoped throughout ✓.
**No surface without five states** — S1–S3 ✓. **No invented primitives** — P1–P4 only ✓. **New platform dependencies** filed as a proposed ask amendment, not assumed — §10 ✓. **Changes to approved docs** flagged for write-back — §10 ✓. **Boundary contracts stated from this side:** brief (consumes), ledger injection (consumes), corpus APIs (consumes), checklist engine (invokes; editor-review owns), citability rules (owns; ai-visibility tunes), `dm_images` (owns; publishing and splits consume), `dm_piece_versions` (writes; editor-review owns) ✓.

---

*Dark Madder v2 — specs/generation-engine.md — June 2026*
