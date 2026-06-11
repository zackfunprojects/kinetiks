# Dark Madder — Editor & Review

> **Spec:** `specs/editor-review.md` — subsystem spec 4 of 10 per `dark-madder-v2-doc-system.md` §7.
> **Date:** June 2026 · **Status:** Draft for approval
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > `platform-contract.md` and `dm-platform-integration.md` (binding at the app boundary — §5 of the integration doc is the constitution of this spec's approval mechanics) > `ux/experience-architecture.md` (binding for surfaces; not yet written — primitives cited are the four from doc-system §3.3, to be reconciled) > `platform-asks.md` > this spec.
> **Sources consolidated:** ARCHIVE-Content_Generator §5 (the draft editor, edit capture, pre-publish checklist, approval flow), ARCHIVE-Learning_Loop §2 (capture mechanics and noise filtering — capture lands here; classification and the ledger live in `specs/knowledge-trainer.md`), `collaborative-workspace-spec.md` (the embed contract, presence, annotations, modes — binding platform material, implemented here for DM's surfaces). All superseded by this document for the territory it covers.
> **Depends on:** `specs/generation-engine.md` (it reviews that spec's output; voice-audit evidence, image review-loop semantics, regeneration tools, `agent_confidence`).
> **Locked decisions honored:** **one approval decision** — the approve-and-publish action in this editor IS the Kinetiks approval, deep-linked both ways; Cortex canonical (edits reach Cortex only through the trainer); corrections ledger dm-private (this spec captures, the trainer classifies); zero analytics ingestion; standalone-first; single company per account.

---

## 1. Purpose

The editor is the most important surface in Dark Madder — the room where the human and the system meet over actual work — and v1 never specced it like it mattered. This spec does. Four responsibilities:

1. **Review and shape.** A rich-text editor with the brief alongside, the voice score with its evidence one click deep, version history, and per-section regeneration — the draft is a starting position the user can move, not a take-it-or-leave-it.
2. **Capture everything the human teaches.** Every substantive edit is captured at paragraph granularity and handed to the trainer's learning loop. The editor is the learning loop's sensory organ; the trainer is its brain. The system should produce noticeably fewer edits per draft over time, and the capture here is what makes that measurable.
3. **Hold the line.** The checklist engine — structure, voice, tone, citability, images, policies, cannibalization, claim-evidence — computed at pipeline end, **re-verified incrementally on every edit** (a static checklist lies after the first keystroke), with hard items blocking the approve action.
4. **Be the decision.** Approve-and-publish here *is* the Kinetiks approval (locked). The card in the central queue and this editor are two views of one decision, deep-linked both ways, resolving identically from either side, with the learning loop firing identically regardless of where the human clicked.

And one architectural responsibility for the whole app: this spec owns the **canonical diff viewer** (the P2 primitive's single implementation — decision D8) and the **collaborative embed mode** (the workspace contract — decision D11), both built once here and mounted everywhere else.

---

## 2. Mechanism

### 2.1 Editor requirements

The engine choice (Tiptap or successor) is **deferred to build planning by the doc-system** — this spec defines requirements any candidate must meet:

- Rich-text WYSIWYG over a structured document model (sections, paragraphs, headings, definition boxes, FAQ blocks, image slots as first-class nodes) — never raw markdown editing, never a model so loose that paragraph-level diffing becomes guesswork.
- Paragraph-stable identity across edits (capture and annotation anchoring depend on it).
- Autosave with offline-tolerant local buffering; explicit version snapshots distinct from autosaves.
- A read-only render mode (approval-card preview parity: what the card shows is what the editor shows).
- Suspendable/instrumentable input layer (the embed mode's presence, drag-to-delegate, and shared-undo hooks — §2.10).
- Diff-mode rendering of the same document model (§2.9).

### 2.2 The review context

Around the document, always one glance away, never modal:

- **The brief panel** — the research §2.6 brief rendered with its evidence (keyword data with `fetched_at`, lexicon questions with their ear-icon frequencies, the differentiation constraint when one exists, applicable policies). The writer-side question "what was this supposed to be?" never requires leaving the room.
- **The voice score** — the composite from the generation run, with P4 wiring: the number opens the per-dimension breakdown; every violation and warning opens its exact text span; the `untrained_voice` flag, when present, opens the trainer CTA with the training-strength breakdown. If `voice_layer_stale` is set (generation §2.9), the banner — "Voice layer changed since this draft was generated" — offers the one-click re-audit; nothing re-runs silently.
- **The checklist sidebar** (§2.4).
- **Version history** (§2.8) and the regeneration affordances: per-section ("redo this section" with optional direction → `dm_regenerate_section`, the section re-streaming in place as a scoped generation theater) and full ("regenerate the draft" with feedback → versioned, re-run with current calibration).
- **Provenance**: when `correlation_id` exists, the drawer answers "why does this draft exist?" end-to-end — goal → Program → Workflow → Task → brief (integration §6.5).

### 2.3 Edit capture

The Learning_Loop §2 mechanics, carried and sharpened, with the ownership boundary explicit: **this spec captures; the trainer classifies.**

- **Granularity:** paragraph-level. On autosave (and on explicit save), the current document diffs against the last captured state; each changed paragraph yields a candidate `dm_edits` record with original text, edited text, section type (opening / body / transition / closing / faq), paragraph index, and content type.
- **Cheap pre-filter, here:** Levenshtein distance < 5% of paragraph length with no token-level semantic delta → discarded as typo/formatting noise before anything ships. Whitespace/punctuation-only changes likewise. This is heuristic and local — no model call in the editor's save path.
- **Handoff:** surviving candidates post to the trainer's intake (knowledge-trainer §2.6), where the fast-tier noise classifier (substantive / factual addition / minor / deletion) and rule extraction run asynchronously. Factual additions route to product-knowledge enrichment; deletions log for the template-length aggregate (generation §2.2's input). The editor never writes the corrections ledger directly.
- **No-double-count rule (decision D10):** in-editor edits are captured continuously as above. When the decision happens **card-side** with inline edits, the platform's approval action carries the submitted-vs-final diff (integration §5.5); DM ingests that diff as `dm_edits` records with `capture_surface = 'approval_card'` — and the reconciler drops any card-side paragraph diff already covered by a live in-editor capture for the same paragraph and content hash. One stream reaches the trainer; the learning loop fires identically from either surface, which is ask #6(a)'s contract made concrete.
- **The submitted snapshot:** at approval submission, `dm_pieces.submitted_content_hash` and a content snapshot are recorded — the fixed reference both the card preview and the card-side diff are computed against. Without a pinned "submitted" state, "edits made during approval" is undefined; with it, it is a diff.

### 2.4 The checklist engine (decision D9 — owned here, invoked by generation)

One engine: an **item registry** (each item: key, family, check implementation, severity, evidence shape, fix affordance), an **invocation API** (full run — generation calls it at pipeline end, including the citability fix loop's re-checks — and incremental run — the editor calls it on save, scoped to items whose inputs the edit touched), and **results** (`dm_checklist_results`, versioned per invocation, every item carrying its evidence pointer).

**Severity semantics:** `hard` items **block the approve action** — the button states exactly which items block and each names its fix affordance ("Resolve 2 image slots" → S2 of generation; "1 banned phrase reintroduced by your edit" → the span). `warn` items surface and are dismissible with a logged acknowledgment. `manual` items are human attestations (checkboxes with the v1 prompts — "read it aloud: does it sound like a person?") — never auto-checked, never blocking, always shown.

**The registry at launch** (families carried from v1 §5.3, extended per integration §5.1 stage 2):

| Family | Items (severity) |
|---|---|
| Structure | AI hook answers the query in first 150 words (hard) · headings as searchable questions (hard) · key takeaways present (hard) · definition boxes for key terms (warn) · FAQ with 3–6 concise answers (hard) · internal links present and resolving (hard) · sources complete — org, year, link (hard) · meta description 140–155 with keyword (hard) · keyword/URL/author/dates present (hard) · AI transparency line per template config (hard when enabled) |
| Voice | composite ≥ 85 (warn; <75 after the rewrite cap = hard) · zero banned phrases (hard) · no structural transition words (hard) · rhythm variation present (hard) · recurring metaphor present (hard) · *manual:* sounds like a person · *manual:* warmth woven, not bolted |
| Tone | zero guilt/pity/shame language (hard, automated scan) · tradeoffs named honestly (warn) · *manual:* would described people feel respected · *manual:* worth reading without the brand mentions |
| Citability | the five PATCH-007 §6 checks (hard; pipeline-time failures already fixed by generation's craft path — what survives to the editor is what an edit broke) |
| Images | resolution gate per generation §2.7 (hard) · alt text on all non-waived slots (hard) |
| Policies | every `applicable_policies` entry re-verified against the final content (hard) — enforcement point 3 of programs-spec §2.5; absent Programs, renders as stated absence, never as passed |
| Cannibalization | approval-time embedding check against the actual draft (research §2.5; warn with the three-way affordance — merge routes to lifecycle-freshness, differentiate routes to section regen with the constraint, proceed logs the decision) |
| Claim–evidence | every statistical claim carries a source link (hard) · hallucination spot-check flags unsourced precise numbers (warn with span) |

**Incremental re-run honesty:** edits can break items (delete the FAQ, reintroduce a banned phrase, orphan a pronoun in an answer passage). The sidebar reflects reality within one autosave cycle; a checklist that passed at generation and stays green through arbitrary edits is the lie this design exists to prevent. The registry is extensible by verification postmortems: integration §7's `quality_gate_updated` actions land as new registry items, so a publish-time failure class can never recur unchecked.

### 2.5 The approval handoff — one decision

The constitutional mechanism, implementing integration §5 end to end:

- **Approve-and-publish** in the editor submits the approval (`POST /api/approvals/submit`, payload per integration §5.4: `source_app: 'dark_madder'`, `source_operator: 'generation_engine'` (or the originating subsystem for non-draft content), `preview.type: 'content'` with the full rendered piece, voice score, checklist state, image thumbnails; `deep_link` to this editor with `?approval={id}`; `agent_confidence` = voice composite + checklist completion normalized 0–100; `expires_in_hours` per the category defaults; `correlation_id` when Task-originated). Pipeline order is integration §5.1: the platform's brand and quality gates run at submission (the floor under DM's craft ceiling; the revise-and-resubmit loop is invisible to the user); classification lands per §5.2 (publish = review); the confidence check queues or auto-approves per the category threshold.
- **Threshold state is reflected, never owned.** The editor shows the current `dm_content_publish` autonomy posture ("always asks" at launch; calibration state as it earns down) read from the approval system. The v1 auto-publish org toggle is dead — autonomy is per-category thresholds plus user `approval_override` policies (integration decision B), and the editor links to those, it does not duplicate them.
- **Bidirectional resolution (integration §5.5):** opened via the card's deep link, the editor mounts with the **approval banner** active — approve/reject here calls `POST /api/approvals/action`, edits since submission captured per §2.3's rule. Decided on the card, the platform executes; DM receives the execution as a command, updates `dm_pieces.status`, and the open editor reflects the resolved state in real time. Double-action is idempotent — the second actor sees "Already approved." Until ask #6(a) ships its documented guarantee, resolution runs one-directional (card → editor deep link; editor → `/api/approvals/action` best-effort with reconciliation on conflict), stated in the UI as a sync caveat only when a conflict actually occurs.
- **Timeouts and Away Mode** render in the editor, not just the queue: a `dm_content_publish` approval at 48h `pause_workflow` shows the held state with the "held by Program" treatment (§2.7); fast-track pieces show their 24h clock prominently, because a trend response older than a day is a post-mortem.
- **After approval:** execution belongs to `specs/publishing.md`; Sentinel gates it (§2.6); post-publish verification results (integration §7) surface back on the piece — a major-severity fail arrives as a normal proposal ("the post published with a broken image — republish with the corrected version?"), the P1 family again.

### 2.6 Sentinel, inline

Sentinel gates the publish boundary, not the queue (integration decision A, §4.4). The editor surfaces it exactly there:

- `blocked` → execution halts; the verdict and reason render in the editor (and on the card) with the affected spans highlighted where Sentinel provides them; the path forward is edit-and-resubmit, never override.
- `flagged` → execution pauses for explicit user confirmation, rendered inline with the flag's substance; confirming is a logged decision.
- `pass` → recorded silently; the drawer can show it ("Sentinel: passed, {date}") for the trust-architecture-curious.
- **Held briefs** (routing event 5): a brief arriving with `sentinel_verdict: held` renders the verdict on the brief panel and **requires explicit acknowledgment before generation proceeds** — the editor/queue is where that acknowledgment lives.

### 2.7 Program-aware states

Platform-initiated transitions are honored visibly (integration §6.3): a checkpoint timeout holds the piece at `in_review` with the **"held by Program"** banner naming the Workflow and the timeout that caused it; a Program cancel cancels the piece with the cancellation's provenance in the drawer. The queue groups Program-held pieces distinctly. Nothing about Program state is ever inferred-and-hidden; the orchestration layer's hand is always visible when it moves something.

### 2.8 Version history

`dm_piece_versions` is owned here (generation writes on run completion and every regeneration; restores write here too). Each version: full content snapshot, trigger (`initial | full_regen | section_regen | restore | pre_submission`), the directed feedback that caused regens, voice composite at snapshot, and the generation run id. The history surface renders versions on the **canonical diff viewer** (§2.9) — any two versions comparable, restore one click with the restore itself versioned. Approval submission always snapshots (`pre_submission`) — the §2.3 anchor.

### 2.9 The canonical diff viewer (decision D8 — the P2 implementation)

One component family, specced here, mounted everywhere P2 appears:

- **Modes:** version-vs-version (this spec, §2.8) · submitted-vs-current (the approval banner's "what changed since submission") · **refresh-diff** (per-change blocks, each tied to its named, evidenced problem — `specs/lifecycle-freshness.md` mounts this mode for refresh review; the card's diff preview renders the same structure) · rule-example (the trainer's bad/good pairs, S7 there) · delta-review (refinement rounds, trainer S3) · rewrite-explanation (generation theater's "why was this section rewritten").
- **Invariants:** every change block can carry an evidence chip (the problem, the rule, the violation) opening in the drawer; blocks are individually actionable where the mounting context allows (accept/reject per change in refresh mode); the same document model as the editor renders both sides, so a diff never disagrees typographically with the editor.
- Consumer specs define *what* their diffs mean and *which* blocks are actionable; this spec defines the surface. One diff viewer — the primitive system's promise kept structurally, not aspirationally.

### 2.10 The collaborative embed (decision D11 — the full contract)

The editor and the draft queue are the DM surfaces Marcus mounts in the desktop split panel (integration §5; ask #6(b)). Specced complete; build sequencing lives in phase plans, scope lives here.

- **Mount:** `dm.kinetiks.ai/embed?entity={piece_id}&mode=collaborative` (and `entity=queue`), per workspace §4.4: own top nav hidden (the shell provides it), shared `.kinetiks.ai` session, Electron webview on desktop / iframe + postMessage on web. The same routes serve approval deep-links into the panel (workspace §4.2.3).
- **Presence (workspace §5):** the agent cursor moves to the section it is operating on; **regeneration renders as the typing indicator** — the section re-streams character-wise where the user can read along and interrupt; the **uncertainty pulse** anchors to low-confidence spans (audit warnings, sub-threshold sections) with `uncertainty_reason` carrying the violation. User presence events (focus, edit-start, scroll, hover) stream back; the agent yields any paragraph the user clicks into — the click is the signal, no dialog (workspace §7.2 inverse).
- **Annotations (workspace §6), mapped to editor semantics:** *decision notes* on voice choices ("opened with the sensory hook — your profile prefers it over direct questions for openings," anchored to the opening) · *data references* to Cortex/lexicon evidence ("this objection appears 88× in your customer language — addressed here") · *skip notes* ("no in-content image for this section — the outline found no visual concept worth the space") · *suggestions* (non-blocking: "consider a definition box for 'topical authority' — first use is undefined"). All dismissible (learned), pinnable (pins persist to the platform Learning Ledger — no DM annotation table; annotations are workspace-layer state), replyable (the reply is a micro-conversation routed through Marcus), collapsible. Density follows workspace §6.3: more in Human-Drive, fewer in Autopilot, high-stakes always annotated (a first publish to a new CMS gets annotations regardless).
- **Tempo modes (workspace §7.1)** apply natively: *System Leads* when a Task or Marcus initiated (the agent works the document, the user watches and grabs) · *User Leads* when the user opened the panel (suggestion chips on touched elements; the agent never fills a paragraph uninvited) · *Pair Mode* with contested-paragraph negotiation.
- **Drag-to-delegate:** select a section, drag to the agent → scoped section regeneration with the selection as context. The inverse — the user clicks into a section mid-regeneration — cancels that section's stream and preserves their edit.
- **Shared undo (workspace §7.3):** editor actions (both participants) enter the workspace action stack with paragraph-level targets; agent-only undo, user-only undo, and the timeline all function over the editor's document model. Undo of an agent regeneration restores the prior section version (a `dm_piece_versions` restore under the hood — one history, two views).
- **Interim (ask #6 late):** the embed routes serve a plain webview without presence/annotations; everything else in this spec functions identically. The interim is a rendering downgrade, never a behavioral fork.

### 2.11 The draft queue (decision D6)

The review entry point and the second panel-mounted surface. Rows: title, cluster/Program badges, status (including `generating` with live stage, `awaiting_outline_checkpoint`, held-by-Program, fast-track with its clock), voice composite, checklist blockers count, image resolution, age-in-review, `untrained_voice` and `voice_layer_stale` flags. Sort/filter by status, cluster, campaign, blocker presence, approval expiry. Bulk actions are deliberately absent from approval (every approve is an individual decision — the one-decision rule does not batch); bulk *dismiss-warnings* and *re-audit* exist. The queue is also where held briefs (§2.6) await acknowledgment and where in-app approvals live in standalone (§5).

---

## 3. Tools exposed

**None — deliberately.** The editor is a surface, not an agent capability: its agent-facing output is the approval payload (§2.5) and the workspace contract (§2.10), and its inputs arrive through generation's tools. Review state is queryable via `dm_get_draft_status` (generation's tool — blockers, review_url) and the approval system's own APIs; duplicating either as a DM tool would create a second definition of the same truth. Internal routes: `/api/dm/editor/{piece_id}` (document, autosave), `/api/dm/editor/{piece_id}/checklist` (incremental invocation), `/api/dm/editor/{piece_id}/versions`, `/api/dm/queue`, `/embed` per §2.10. Should a future Marcus flow genuinely need a review-state tool beyond `dm_get_draft_status`, it gets filed as a write-back to integration §3 — not added here ad hoc.

---

## 4. Cortex layers read and written

**Reads:** `voice` — solely to *render evidence*: the calibration behind the score's dimensions, the banned phrase a violation cites, the layer version the draft was audited against. The editor never re-derives voice judgments; it displays the generation run's, against the layer state stamped on the run.

**Writes: none.** Edits reach Cortex exclusively through the trainer's path: capture here (§2.3) → trainer classification and ledger → the trainer's monthly aggregated `voice` proposals with edit-pattern counts as evidence (knowledge-trainer §2.6/§4.1). Raw edit diffs are blocked by `filterProposal` (integration §4.1) and, more importantly, never emitted — this spec contains no proposal constructor. One trainer, one proposal source.

---

## 5. Approval touchpoints

This spec is the **home surface** of DM's publish-class approvals (the machinery is integration §5; the lived experience is here):

| Decision | Type | Where it renders | Notes |
|---|---|---|---|
| Publish a draft (`dm_content_publish`) | **review** | The editor's approve action ↔ the queue card, one decision, two views | Always-ask at launch; standard calibration; 48h / `pause_workflow`; fast-track override 24h / `cancel` with regenerate-on-return |
| Refresh diff (`dm_content_refresh_publish`) | **review** | The diff viewer's refresh mode (§2.9), mounted by `specs/lifecycle-freshness.md`, which owns the refresh decision's content | This spec owns the surface; lifecycle owns the semantics |
| Metadata-only update (`dm_content_metadata_update`) | **quick** | Card-resolvable; opening it lands in the editor's metadata panel | Scope derived from the actual diff (integration §5.2) — the editor never lets a body change masquerade as metadata |
| Card-side inline edit | — | Captured as approval-action diff per §2.3's no-double-count rule | Learning loop fires identically from either surface |
| Checklist `hard` items / image resolution / Sentinel | — | Pre- and post-decision gates around the one decision (§2.4, §2.6) | Gates are not approvals; they shape when the one decision is offerable and executable |

Everything else in the editor — edits, version restores, regenerations, warning dismissals, held-brief acknowledgments — is a non-consequential in-app collaborative checkpoint: nothing leaves the system, no cards.

**Standalone (integration §5.7):** the same editor approve-and-publish surface runs the in-app approval flow — significant actions always ask, no strategic type, no central queue, no confidence autonomy. The brand and quality gates still run (standalone accounts hold a Context Structure); Sentinel still gates the boundary (§4.4 there). On upgrade, pending in-app approvals migrate to the central queue and standalone approval history seeds category confidence — a heavy standalone user does not restart trust from zero. This is the precise reading of the one-decision rule: the editor decision is always *the* decision; connected mode adds a second synchronized view of it.

---

## 6. Data — Data Tables appendix

All tables `account_id`-scoped (`uuid not null references auth.users(id)`), **RLS mandatory** (`using (account_id = auth.uid())`), migrations sequential in `supabase/migrations/`. SQL-sketch format for `specs/data-model.md`.

```sql
-- Captured edits (the learning loop's raw signal; trainer consumes asynchronously)
create table dm_edits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,              -- dm_pieces
  version_id uuid,                     -- dm_piece_versions context at capture
  paragraph_ref text not null,         -- stable paragraph identity (editor model)
  paragraph_index int not null,
  section_type text not null check (section_type in ('opening','body','transition','closing','faq')),
  content_type text not null,          -- template key
  original_text text not null,
  edited_text text not null,
  capture_surface text not null default 'editor' check (capture_surface in ('editor','approval_card')),
  prefilter text not null default 'passed' check (prefilter in ('passed','discarded_noise')),
  trainer_status text not null default 'pending' check (trainer_status in
    ('pending','classified_substantive','classified_factual','classified_minor','classified_deletion')),
  editor_user_id uuid not null,
  created_at timestamptz default now()
);
create index idx_dm_edits_piece on dm_edits (account_id, piece_id, created_at);
create index idx_dm_edits_trainer on dm_edits (account_id, trainer_status) where trainer_status = 'pending';
-- No-double-count guard: reconciler skips approval_card rows whose (paragraph_ref, md5(edited_text))
-- already exists for the piece from the editor surface.

-- Versions (owned here; generation writes on completion/regeneration; restores versioned too)
create table dm_piece_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,
  version_number int not null,
  content jsonb not null,              -- full document-model snapshot (body + structure + metadata)
  trigger text not null check (trigger in
    ('initial','full_regen','section_regen','restore','pre_submission')),
  directed_feedback text,              -- the user's regen direction, when any (itself learning signal)
  generation_run_id uuid,              -- dm_generation_runs
  voice_match_score float,
  restored_from_version_id uuid,
  created_at timestamptz default now(),
  unique (account_id, piece_id, version_number)
);

-- Checklist results (engine owned here; invoked full by generation, incrementally by the editor)
create table dm_checklist_results (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,
  invocation text not null check (invocation in ('pipeline','editor_incremental','refresh')),
  registry_version text not null,      -- the item registry is versioned; postmortem items extend it
  items jsonb not null,                -- [{key, family, severity, status: pass|fail|warn|attested|dismissed|stated_absent,
                                       --   evidence_ref, fix_affordance?, dismissed_by?, dismissed_reason?}]
  blocking_count int not null default 0,
  generation_run_id uuid,
  created_at timestamptz default now()
);
create index idx_dm_checklist_piece on dm_checklist_results (account_id, piece_id, created_at desc);

-- Editor sessions (autosave buffer + embed/collaboration context; pruned on resolution)
create table dm_editor_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,
  user_id uuid not null,
  surface text not null default 'app' check (surface in ('app','embed_collaborative','embed_webview')),
  autosave jsonb,                      -- unflushed document delta
  last_captured_at timestamptz,
  thread_id text,                      -- workspace presence channel context (presence:{account}:{thread})
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**Columns this spec contributes to `dm_pieces`** (canonical in `specs/data-model.md`): `submitted_content_hash` + `submitted_at` (§2.3 anchor), `approval_id` (the live publish-class approval), `held_by_program boolean` + `hold_reason jsonb` (§2.7), `in_review` / `approved` statuses and their transition discipline, `current_version_id`, `warnings_dismissed jsonb`.

**Deliberately absent tables:** annotations and presence (workspace-layer state — pins persist to the platform Learning Ledger, presence is Realtime-ephemeral; a DM mirror would be the "second learning ledger" the kill list forbids); a DM approvals table (the approval system owns approvals; DM stores only the `approval_id` pointer).

**v1 tables that do not return** (for `data-model.md`'s list): `content_edits` (→ account-scoped `dm_edits` with capture-surface and trainer-status discipline), any auto-publish org flag (→ approval thresholds + `approval_override` policies), editor-local approval state columns (→ the platform approval, pointed at).

---

## 7. Surfaces & Explainability

Primitives per doc-system §3.3 (reconcile with `ux/experience-architecture.md` when it lands): **P1** propose→review→approve · **P2** diff surface (the canonical implementation is §2.9, this spec's) · **P3** generation theater · **P4** evidence drawer. No parallel primitives. The embed-collaborative rendering (§2.10) is a *mode* of S2 and S1, not a fifth surface.

### S1 — Draft Queue
**Purpose:** the review entry point — everything awaiting human judgment, honestly stated. **Narrative moment:** Tuesday morning, the first screen of the ritual. **Primary action:** open the top blocked-or-expiring draft. **Primitives:** P1 (the queue *is* the review stage of the primitive: each row a pending decision with its state), P4 (every flag, score, and hold on a row opens its evidence), P3 (generating rows render live stage inline).
**Five states:** *Empty* — standalone: "Drafts land here for your review — generate your first" with the trainer-aware CTA; activated: Cortex-aware ("3 pieces scheduled this week — first draft generates Thursday"). *Loading* — row skeletons. *Populated* — rows per §2.11 with blockers, clocks, and Program holds grouped. *In-progress* — live generation rows streaming stage progress among reviewable ones. *Failed/partial* — failed runs as rows with the failed stage named and resume inline; a queue-fetch failure degrades to cached rows with a staleness banner, never blank.
**Evidence / why:** "why is this held?" → the Workflow and timeout; "why is this fast-tracked ahead of mine?" → the radar event and its clock; "why does this row say untrained voice?" → the training-strength breakdown.

### S2 — The Editor
**Purpose:** review, shape, decide. **Narrative moment:** the heart of Tuesday morning; the approval card's deep-link destination; the panel Marcus opens when content is discussed. **Primary action:** **Approve & publish** — exactly one, stating its blockers when blocked. **Primitives:** P1 (the approve action is the primitive's approve stage; the banner state when card-linked), P2 (submitted-vs-current; version compare; rewrite explanations), P3 (section regeneration streams in place), P4 (voice score → violations; checklist items → evidence; provenance → the correlation chain; Sentinel verdicts → reasons).
**Five states:** *Empty* — a piece with no draft yet: the brief rendered with "Generate" (never a blank canvas pretending a draft exists). *Loading* — document-model skeleton with the context panels loading independently (a slow brief never blocks the body). *Populated* — the full room: document, brief, score, checklist, versions, approval state. *In-progress* — regeneration streaming into a section, re-audit running, or approval submission in flight (each a labeled, scoped live region; the rest of the room stays interactive). *Failed/partial* — autosave failure surfaces a persistent local-buffer banner with retry (work is never silently lost); a checklist-engine failure renders items as "unverified" (distinct from passed — the lie is structurally impossible); a regen failure leaves the prior section intact with the error and retry scoped to it.
**Evidence per claim:** every number, flag, badge, and verdict opens its source — no claim in this room is unaccompanied. **Why affordance:** "why is approve blocked?" enumerates the hard items with fix affordances; "why does this draft exist?" walks the correlation chain; "why did the system write it this way?" → annotations and the run's evidence.

### S3 — Diff Review (the P2 surface)
**Purpose:** the one diff viewer in its standalone uses — version compare/restore, refresh-diff review (mounted with lifecycle-freshness's semantics), submitted-vs-final audit. **Primary action:** context-dependent (restore / approve refresh / close). **Primitives:** P2 (constitutionally), P4 (every change block's evidence chip), P1 (when the diff *is* a pending decision — refresh mode).
**Five states:** empty (two identical versions: "no differences," stated, with the comparison metadata) · loading · populated (change blocks with evidence chips; per-block actions where the mounting context grants them) · in-progress (a re-audit or regeneration mutating one side: the affected blocks marked live, comparison suspended for them only) · failed/partial (a side failing to load renders the loadable side read-only with the failure named — never a half-diff presented as whole).
**Why:** every change block answers "why this change?" with its problem/rule/violation chip; refresh mode inherits lifecycle's named-problem evidence per block.

### S4 — Version History
**Purpose:** the piece's memory — every version, its trigger, its cause. **Primary action:** compare (→ S3). **Primitives:** P2 (comparison), P4 (each version's trigger evidence: the regen feedback, the run, the restore source).
**Five states:** empty (one version: "this is the original — versions appear as you regenerate or restore") · loading · populated (the timeline with triggers, scores, and the pre-submission marker) · in-progress (a regeneration writing the next version: a pending entry, live) · failed (history unavailable → the editor still functions; degradation isolated and stated).
**Why:** every version answers "what caused you?" — the trigger, the feedback verbatim, the run.

---

## 8. Standalone mode

The room is the same; the orchestration around it is absent, stated, never faked:

- **Approvals:** the in-app flow per §5 — the approve action is the whole decision, no queue mirror, no thresholds, no strategic type. The approval banner state never occurs (no cards exist); the submitted snapshot is still taken (it anchors the audit trail and seeds upgrade trust).
- **Sentinel:** runs identically (account-scoped, not orchestration-gated — integration §4.4); `blocked`/`flagged` render exactly as §2.6.
- **Program states:** never occur; the queue has no held grouping; provenance shows "user-initiated" honestly instead of a correlation chain.
- **Embed/collaboration:** the workspace is a connected-mode shell surface; standalone has no panel to mount in. The embed routes exist and degrade to the webview mode (they are the same build); presence simply has no participants. No feature forks.
- **Edit capture and the checklist:** identical — the learning loop and the craft floor are not connected-mode privileges. The policies family renders its stated absence.
- **Upgrade:** pending in-app approvals migrate to the central queue; approval history seeds category confidence; `dm_edits`, versions, and checklist history are already account-scoped and simply persist (integration §5.7 / §9).

---

## 9. Model/task mapping (`@kinetiks/ai` configuration)

This subsystem is deliberately light on model calls — its intelligence is mostly *other subsystems' evidence, rendered*. The save path contains **zero model calls** (the pre-filter is local Levenshtein + token heuristics; latency in the editor is sacred). Task keys:

| Task key | Tier | Used in |
|---|---|---|
| `checklist_tone_scan` | fast | §2.4 — guilt/pity/shame language scan, incremental on edited paragraphs only |
| `checklist_claim_evidence` | fast | §2.4 — unsourced precise-number detection, incremental |
| `checklist_citability_recheck` | standard | §2.4 — re-running the PATCH-007 checks on edit-touched sections (full pipeline-time runs belong to generation's `citability_audit`) |
| `annotation_reply` | standard | §2.10 — inline replies to annotation micro-conversations when not routed through Marcus |

Everything else consumed, not called: edit classification is the trainer's (`edit_noise_filter`, `edit_rule_extraction`); re-audit is generation's (`voice_audit`); regeneration is generation's pipeline. Incremental checks run only on paragraphs the edit touched — the cost profile of the editor is bounded by typing, not by document size.

---

## 10. Platform dependencies and write-backs

**Existing asks this spec depends on:** **#6 (central)** — both halves: (a) the documented guarantee that app-side `/api/approvals/action` calls resolve identically (learning loop, idempotency) — §2.3 and §2.5 implement DM's side of that contract and degrade per the ask's interim (one-directional with reconciliation); (b) the collaborative-workspace rendering of the editor and queue — §2.10 is DM's embed-mode contribution, complete, with the webview interim. Also #8 (Program holds and checkpoint states — absent it, those states simply never occur), #9 (Sentinel content types — interim: generic `blog_post`, verdicts render identically).

**No new platform asks.** This spec's needs are fully covered by #6, #8, #9 — a deliberate outcome of building on the integration doc rather than around it.

**Write-back flags (filed, not silently applied):**
1. `specs/knowledge-trainer.md` §2.6: a cross-reference noting the capture contract now lives at editor-review §2.3 with the `capture_surface` and no-double-count discipline (the trainer's intake should reference the reconciler rule). Clarification, not a behavior change.
2. `dm-platform-integration.md` §5.4: additive — the submission payload's preview should reference `submitted_content_hash` as the canonical anchor for card-side edit diffs (it strengthens §5.5's "diff between submitted and final" with a defined reference point).
3. `platform-asks.md` #6: append DM's concrete reconciliation rule (§2.3) as the DM-contributed half of guarantee (a), so the platform team implements against a stated contract rather than an implied one.

---

## 11. Self-check

| Mandatory section | Present |
|---|---|
| Purpose | §1 |
| Mechanism | §2 |
| Data (dm_* tables, SQL-sketch Data Tables appendix) | §6 |
| Tools exposed (names, consequential flags, Marcus-grade descriptions) | §3 (none — deliberate, with the rationale and the future write-back path stated) |
| Cortex layers read/written, proposal shapes, evidence requirements | §4 (read: voice, evidence-rendering only; writes: none, structurally — the trainer is the sole proposer) |
| Approval touchpoints and types | §5 |
| Surfaces & Explainability (screens, five states each, evidence, "why", canonical primitives only) | §7 (S1–S4; P1–P4 only; embed is a mode, not a primitive) |
| Standalone mode (exact empty-Cortex behavior) | §8 |
| Model/task mapping via `@kinetiks/ai` | §9 |

**Locked decisions:** **one approval decision** — the editor action IS the approval, two synchronized views, identical learning-loop firing, idempotent double-action; no second approval surface created anywhere in this spec — §2.5, §5 ✓ · Cortex canonical, edits reach it only through the trainer; this spec proposes nothing — §4 ✓ · corrections ledger dm-private — capture here, ledger there, raw diffs never proposed — §2.3, §4 ✓ · zero analytics ingestion ✓ · standalone-first — §8 (same room, stated absences, trust seeds the upgrade) ✓ · single company per account — §6 ✓.
**No surface without five states** — S1–S4 ✓. **No invented primitives** — P1–P4; the canonical P2 implementation defined once (§2.9) and mounted by consumers ✓. **No new platform dependencies assumed** — needs covered by existing asks; DM-contributed contract language filed to ask #6 — §10 ✓. **Changes to approved/earlier docs** flagged for write-back, not silently applied — §10 ✓. **Boundary contracts stated from this side:** edit capture → trainer intake (provides) · checklist engine (owns; generation invokes; lifecycle's refresh variant mounts) · diff viewer (owns; lifecycle and trainer mount) · `dm_piece_versions` (owns; generation writes) · `agent_confidence` (consumes from generation) · image resolution gate (renders; generation defines) ✓.

---

*Dark Madder v2 — specs/editor-review.md — June 2026*
