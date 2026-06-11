# Dark Madder — Screen System (`ux/screen-system.md`)

> **Status:** Complete draft for approval — all 45 entries, the shared degradation library, and the empty-state matrix. Slice provenance retained in the registry and §12.
> **Date:** June 2026
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > platform docs (`platform-contract.md`, `dm-platform-integration.md` at the boundary) > `ux/design-language.md` (visual law) > this doc (state and copy law) > subsystem specs' S-sections. Division of labor: **the subsystem spec wins on what a surface contains and does** (its S-section is the behavioral source; conflicts here are write-backs, never silent divergence); **the design language wins on how it looks**; **this doc owns per-screen completeness** — the five states' full copy, the register and chrome-mode declarations, the data + evidence source columns, and the mobile behavior. Where a spec's S-section is summary-level ("loading · populated"), this doc is the elaboration the spec delegated ("full state copy lands in `ux/screen-system.md`" — knowledge-trainer §7, design-language §9).
> **Reconciliation note:** `ux/experience-architecture.md` is not yet written. Per the convention every subsystem spec adopted: primitives cited are the four from doc-system §3.3 (P1 propose→review→approve · P2 diff surface · P3 generation theater · P4 evidence drawer); nav homes follow design-language §6.2's IA proposal. Reconcile both when experience-architecture lands. The Corpus Map / Link Sweep nav home (Research vs Monitor) is carried IA-agnostic — their entries are complete regardless of where nav houses them.
> **Role:** this is the build gate. Per `apps/dm/CLAUDE.md`: *no screen is built before it exists here with all five states defined.* Per design-language §11, every entry below satisfies Phase 2 (register + chrome mode declared) and feeds Phase 4 (states via StateFrame) for its screen's build task. Platform-asks #4's mandate ("Connect GA4 / GSC empty states designed in `ux/screen-system.md`, not improvised") is honored in §10's shared degradation library.
> **Sources consolidated:** the ten subsystem specs' §7 S-sections (verbatim behavioral source), `dm-design-language.md` (StateFrame, P1–P4 visual treatments, registers, §6.5 embed mode, §9 voice, §10 mobile), `dm-platform-integration.md` §5 and §9–10, `collaborative-workspace-spec.md` §4–5 via the integration doc, `platform-asks.md` #4, #6, #8. No ARCHIVE- material consumed.

---

## 1. The entry schema

Every screen in this document is one entry with exactly these fields. A build task for a screen copies its entry; a missing field is a spec bug here, not a decision deferred to the component.

| Field | What it carries | Source of authority |
|---|---|---|
| **ID & name** | `{owning-spec}/S{n}` + the spec's name, unchanged. Specs cross-reference these IDs; this doc never renumbers. | Owning spec §7 |
| **Type** | `screen` (nav-reachable), `panel` (mounted inside another screen's view), or `canvas` (full-bleed pan/zoom surface) | This doc |
| **Register & chrome modes** | R1/R2/R3 per design-language §3; which of full / embedded / mobile the screen serves. Embedded is a *mode*, never a fork (editor-review §7: "the embed-collaborative rendering is a mode of S2 and S1, not a fifth surface"). | Design-language §3, §6.5, §11 Phase 2 |
| **Purpose / narrative moment / primary action** | Carried from the owning S-section. Exactly one primary action per surface — the design-language §11 standing regression check. "None" is a legal value and is stated, never left blank (radar's quiet feed, the theater while healthy). | Owning spec §7 |
| **Primitives** | Which of P1–P4 the screen mounts, and as what. No parallels — a screen needing a fifth primitive is a write-back to experience-architecture, not an invention here. | Owning spec §7 + design-language §8 |
| **Data + evidence sources** | The `dm_*` tables, internal routes, platform tools, and foreign-spec contracts the screen reads — split into *surface data* (what renders) and *drawer data* (what P4 opens). Every evidence claim names where the receipt comes from. | Owning spec §6 + this doc |
| **Components** | The design-language §7 primitives and gap components the screen binds to (DividedList, ProposalCard, PipelineTheater, ScoreFigure, EvidenceDrawer, DiffViewer, InstrumentStrip, CanvasShell, StateFrame). | Design-language §7 |
| **Five states** | Empty (mode-split) / Loading / Populated / In-progress / Failed-or-partial — behavior from the spec, **copy from this doc**. Verbatim copy for Empty and Failed (the high-stakes, frequently-improvised states); intent + key lines for Loading, Populated, In-progress. | Spec §7 + this doc |
| **Why affordances** | The screen's answerable "why" questions and what each opens. | Owning spec §7 |
| **Mobile** | The screen's <768px behavior per design-language §10: docked primary action, sheet conversions, table→card conversions, canvas touch behavior. | Design-language §10 + this doc |

**Copy conventions** (binding, from design-language §9): *you* for the user; *we / the agents / madder-0N* for the system, never "I". Sentence case everywhere except the mono eyebrow. Numbers over adjectives. No emoji, no exclamation hype. Errors are flat and actionable. Template variables render in `{braces}`; every variable names the field it binds to in the entry's data sources. Empty-state copy is always mode-split: **[SA]** standalone onboards, **[ACT]** activated leverages Cortex.

---

## 2. State laws (global, lintable)

These hold on every entry. A screen violating one fails design-language §11 Phase 5 review.

1. **Never blank.** Every state renders something that explains itself. An empty state is a designed moment (SA onboards, ACT leverages Cortex); a failed state names what failed and what to do; a loading state is a skeleton in the populated layout's shape (no spinners for layout loads — the halo Spinner is for in-flight actions only).
2. **Degradation is stated, never faked.** Missing sources render as named absences with their reason and, where one exists, the connect affordance ("no keyword volume data", "coverage unknown", "GA4 not connected"). Numbers never silently zero; composites renormalize and say so. The shared degradation states are designed once in §10 and referenced by ID — improvising one per-screen is a violation.
3. **Failure is scoped.** A failing element fails alone: per-source, per-stage, per-slot, per-cluster, per-side. The rest of the screen stays truthful and interactive. Prior truth survives failure (cached rows with a staleness banner beat a blank queue; a failed scan leaves prior snapshots authoritative with staleness named).
4. **In-progress is P3, scoped to its region.** The rest of the screen stays interactive. Emerald appears if and only if something is running (the no-emerald-at-rest regression check). A pause is a state with a name and a deep link, never a stall (`awaiting_outline_checkpoint` is the canonical example).
5. **Exactly one primary action per surface**, in the thumb zone on mobile (docked full-width bottom bar above the tab bar). Blocked primary actions state their blockers enumerably — "Approve & publish" never disables silently.
6. **Every claim carries its receipt.** Every evidence-bearing number is a ScoreFigure; every flag, badge, and "based on your Context Structure" phrase opens the EvidenceDrawer with the four-part content pattern (claim restated · computation in mono · underlying material verbatim in inset wells · provenance line with source, `fetched_at`, layer + confidence). A claim whose entry doesn't name its drawer data source is incomplete.
7. **StateFrame renders the discipline.** No screen hand-rolls empty/loading/failed framing. The entry's state copy is StateFrame's content contract.
8. **The pill's exclusion zone holds in every state** — 72px bottom-right clear on every screen, every state, both modes (design-language §6.4).

---

## 3. Global screen registry

Forty-five entries: forty-three owned by subsystem specs (IDs unchanged), two owned by this doc (the Overview home and App Settings — the inventory's honest gaps, specced here in slice 6, flagged for reconciliation with `dm-product-spec.md` when written). Type: screen unless noted.

| Nav section | ID | Name | Type | Slice |
|---|---|---|---|---|
| Overview | `screen-system/OV1` | App Home | screen | **6 ✓** |
| Train | `knowledge-trainer/S1` | Trainer Home | screen | **2 ✓** |
| Train | `knowledge-trainer/S2` | Website Scan Review | screen | **2 ✓** |
| Train | `knowledge-trainer/S3` | Refinement Round | screen | **2 ✓** |
| Train | `knowledge-trainer/S4` | Document Upload & Guided Intake | screen | **2 ✓** |
| Train | `knowledge-trainer/S5` | Listening (sources & ingestion) | screen | **2 ✓** |
| Train | `knowledge-trainer/S6` | Customer Lexicon | screen | **2 ✓** |
| Train | `knowledge-trainer/S7` | Corrections Ledger | screen | **2 ✓** |
| Research | `research-architecture/S1` | Research Overview | screen | **3 ✓** |
| Research | `research-architecture/S2` | Discovery | screen | **3 ✓** |
| Research | `research-architecture/S3` | Keywords | screen | **3 ✓** |
| Research | `research-architecture/S4` | Opportunities | screen | **3 ✓** |
| Research | `research-architecture/S5` | Architecture | canvas | **3 ✓** |
| Research | `research-architecture/S6` | Publishing Plan | screen | **3 ✓** |
| Research* | `research-architecture/S7` | Corpus Map | canvas | **3 ✓** |
| Research* | `research-architecture/S8` | Link Sweep | screen | **3 ✓** |
| Research | `research-architecture/S9` | Campaigns | screen | **3 ✓** |
| Build | `editor-review/S1` | Draft Queue | screen | **1 ✓** |
| Build | `editor-review/S2` | The Editor | canvas | **1 ✓** |
| Build | `editor-review/S3` | Diff Review | screen | **1 ✓** |
| Build | `editor-review/S4` | Version History | screen | **1 ✓** |
| Build | `generation-engine/S1` | Generation Theater | screen | **1 ✓** |
| Build | `generation-engine/S2` | Image Review | screen | **1 ✓** |
| Publish | `publishing/S1` | CMS Connections | screen | **4 ✓** |
| Publish | `publishing/S2` | Publish Activity | screen | **4 ✓** |
| Publish | `publishing/S3` | Live Status | panel | **4 ✓** |
| Publish | `splits/S1` | Split Queue | screen | **4 ✓** |
| Publish | `splits/S2` | Split Composer | screen | **4 ✓** |
| Publish | `splits/S3` | Split Settings & Templates | screen | **4 ✓** |
| Monitor | `lifecycle-freshness/S1` | Freshness Home | screen | **5 ✓** |
| Monitor | `lifecycle-freshness/S2` | Refresh Review | screen | **5 ✓** |
| Monitor | `lifecycle-freshness/S3` | Piece Freshness Panel | panel | **5 ✓** |
| Monitor | `lifecycle-freshness/S4` | Freshness Settings & Adoption | screen | **5 ✓** |
| Monitor | `radar-response/S1` | Radar (the feed) | screen | **5 ✓** |
| Monitor | `radar-response/S2` | Event Detail & Response | screen | **5 ✓** |
| Monitor | `radar-response/S3` | Subscriptions & Tuning | screen | **5 ✓** |
| Monitor | `ai-visibility/S1` | AI Visibility Home | screen | **5 ✓** |
| Monitor | `ai-visibility/S2` | Question Bank | screen | **5 ✓** |
| Monitor | `ai-visibility/S3` | AIV Settings, Budget & Tuning | screen | **5 ✓** |
| Monitor | `measurement/S1` | Performance Overview | screen | **5 ✓** |
| Monitor | `measurement/S2` | Cluster & Piece Performance Detail | screen | **5 ✓** |
| Monitor | `measurement/S3` | Health Report | screen | **5 ✓** |
| Monitor | `measurement/S4` | Quarterly Review | screen | **5 ✓** |
| Settings | `generation-engine/S3` | Generation Settings | screen | **6 ✓** |
| Settings | `screen-system/ST1` | App Settings | screen | **6 ✓** |

\* Nav home (Research vs Monitor) is experience-architecture's call per design-language §12.6; entries are IA-agnostic.

Panels (`publishing/S3`, `lifecycle-freshness/S3`) are first-class entries — they carry five states like any screen — mounted in the piece view and the editor's published-piece context rather than reached by nav.

---

## 4. Build — the proving slice

The Build section houses the Tuesday-morning spine: queue → editor → theater → image review, with diff review and version history as the editor's memory surfaces. Editor-review S1–S2 are the two surfaces Marcus renders in the collaborative split panel (integration §5, ask #6b) — their R3 mode is part of their entry, not a separate spec.

---

### 4.1 `editor-review/S1` — Draft Queue

**Type:** screen · **Register:** R1 · **Chrome modes:** full / **embedded (R3)** / mobile
**Purpose:** the review entry point — everything awaiting human judgment, honestly stated.
**Narrative moment:** Tuesday morning, the first screen of the ritual.
**Primary action:** open the top blocked-or-expiring draft.
**Primitives:** P1 (the queue *is* the review stage: each row a pending decision with its state) · P4 (every flag, score, and hold opens its evidence) · P3 (generating rows render live stage inline).

**Data + evidence sources.**
*Surface:* `dm_pieces` (status, blockers, `untrained_voice`, `voice_layer_stale`, `images_resolved`), generation run records (live stage per generating row), `dm_radar_events` (fast-track 24h clocks), Program/Workflow holds via the integration's Task state mirror, approval state via the stored `approval_id` pointer.
*Drawer:* training-strength breakdown (knowledge-trainer's strength components), the radar event with its severity scoring, the holding Workflow with its timeout, the checklist blocker items with their evidence, Sentinel verdicts verbatim.

**Components:** DividedList + ListRow (the queue — one card, hairline rows, never a card grid), ScoreFigure (voice composites, clocks), Badge/Tag (blockers, holds, fast-track), LiveDot + a row-scale StageRow for generating rows, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* —
**[SA]** Headline: `Drafts land here for your review.` Body: `Generate your first piece — we write it, you decide what ships.` CTA is trainer-aware: voice strength ≥ threshold → `Generate your first draft` (→ generation theater); below threshold → `Train your voice first — {n} minutes to your first usable draft` (→ trainer home). One CTA renders, never both.
**[ACT]** Headline: `{n} pieces scheduled this week.` Body: `First draft generates {weekday} — it will land here for your review.` Secondary line when the plan is empty but Cortex is rich: `Your Voice layer is at {voice_strength}% — generate a draft now or build your publishing plan first.`

*Loading* — row skeletons in the populated layout's shape; the queue header (counts strip) resolves first.

*Populated* — rows per editor-review §2.11: title, voice composite (ScoreFigure), status, blocker chips, clocks (fast-track countdown in mono), Program holds grouped under their Workflow with the hold stated. Sort: blocked-or-expiring first. Counts strip as InstrumentStrip: `{n} awaiting review · {n} blocked · {n} generating · {n} on hold`.

*In-progress* — live generation rows stream their current stage inline (`outline → sections (3/7) → voice audit`) with the emerald live dot, interleaved among reviewable rows in their sort position. The rest of the queue stays interactive.

*Failed/partial* — failed runs render as rows, never disappear: `Generation failed at {stage} — resume` inline on the row, prior stages' work intact. Queue-fetch failure: cached rows render with a banner — `Showing the queue as of {time} — live refresh failed. Retry.` Never blank.

**Why affordances:** "why is this held?" → the Workflow and its timeout · "why is this fast-tracked ahead of mine?" → the radar event and its clock · "why does this row say untrained voice?" → the training-strength breakdown.

**Embedded (R3):** the queue is one of the two panel-mountable surfaces (`/embed?entity=queue`). Sidebar and pill suppressed; the 44px context strip carries `Build · Draft queue · {n} awaiting` + the primary action. Rows open the editor in the same panel. Minimum 480px; below comfortable width the counts strip folds into the context strip's subtitle.

**Mobile:** rows keep title + composite + the single most urgent chip; secondary metadata folds into the row sheet. Primary action docks: `Open next: {title}`.

---

### 4.2 `editor-review/S2` — The Editor

**Type:** canvas (full-bleed minus gutters) · **Register:** R1 (the document canvas renders publish typography per design-language §5 — the room is ink; the page is the page) · **Chrome modes:** full / **embedded (R3)** / mobile
**Purpose:** review, shape, decide.
**Narrative moment:** the heart of Tuesday morning; the approval card's deep-link destination; the panel Marcus opens when content is discussed.
**Primary action:** **Approve & publish** — exactly one, stating its blockers when blocked.
**Primitives:** P1 (the approve action *is* the primitive's approve stage; the iris-tinted banner state when card-linked) · P2 (submitted-vs-current, version compare, rewrite explanations — all mounting §2.9's canonical viewer) · P3 (section regeneration streams in place) · P4 (voice score → violations; checklist items → evidence; provenance → the correlation chain; Sentinel verdicts → reasons).

**Data + evidence sources.**
*Surface:* `dm_pieces` (body, `body_format`, metadata, voice scores and flags), the brief (research's contract), `dm_checklist_results`, `dm_piece_versions` (rail), `dm_images` resolution meter, approval state via `approval_id` + the submission's `submitted_content_hash`, Sentinel verdict, run annotations and `agent_confidence`.
*Drawer:* per-dimension voice breakdown with violations and spans, each checklist item's evidence, the correlation chain (Task → brief → run → draft), the Sentinel reason verbatim, each annotation's run evidence.

**Components:** the document canvas (content stylesheet, design-language §12.5), context rail (brief / score / checklist / versions — tab-stacked below 1280px and in the panel), ProposalCard linkage for the approval banner, DiffViewer mounts, ScoreFigure throughout, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — a piece with no draft yet renders **the brief, not a blank canvas**: the brief's full contract (keywords, structure requirements, required questions with their frequencies, link plan) with primary action `Generate` and the context summary the run would use (`{template} · voice at {voice_strength}% · {n} required questions from your customers`). Mode split is upstream (the brief differs, the room doesn't): **[SA]** the brief panel notes which fields came from your training; **[ACT]** provenance lines name the Cortex layers.

*Loading* — document-model skeleton; context panels load independently — a slow brief never blocks the body.

*Populated* — the full room: document, brief, score, checklist, versions, approval state. When card-linked, the iris `--surface-accent` approval banner renders the card's state with its deep-link, per P1's visual law.

*In-progress* — regeneration streaming into a section (the section is the live region; the typing-indicator treatment in the panel), re-audit running, or approval submission in flight. Each is a labeled, scoped live region; the rest of the room stays interactive.

*Failed/partial* —
Autosave failure: persistent banner — `We can't reach the server — your edits are safe in this browser. Retrying… · Retry now` (the local buffer is named; work is never silently lost).
Checklist-engine failure: items render `unverified` with `We couldn't verify these {n} items — unverified is not passed. Re-run checks.` (the lie is structurally impossible).
Regen failure: the prior section intact, error and retry scoped to it — `Rewrite failed at the voice audit — your current section is unchanged. Retry.`

**Why affordances:** "why is approve blocked?" → the hard items enumerated, each with its fix affordance · "why does this draft exist?" → the correlation chain walked · "why did the system write it this way?" → annotations and the run's evidence.

**Embedded (R3):** `/embed?entity={piece_id}&mode=collaborative`. Context strip carries the approval banner state. Presence per the workspace spec: agent cursor on the section being operated, regeneration as the typing indicator (read along, interrupt), the uncertainty pulse anchored to low-confidence spans with `uncertainty_reason`; the user clicking into a paragraph is the yield signal — no dialog. Presence renders in iris (the sanctioned exception). Context rail tabs per §10's narrow rules.

**Mobile:** `Approve & publish` docks full-width in the thumb zone; brief/checklist/versions become bottom sheets; the diff mounts unified-only.

---

### 4.3 `editor-review/S3` — Diff Review

**Type:** screen · **Register:** R1 · **Chrome modes:** full / embedded (when mounted inside S2's panel context) / mobile (unified-only)
**Purpose:** the one diff viewer in its standalone uses — version compare/restore, refresh-diff review (mounted with lifecycle-freshness's semantics), submitted-vs-final audit.
**Narrative moment:** "what changed, exactly?" — post-regen, post-refresh, post-approval audit.
**Primary action:** context-dependent and declared by the mounting mode — restore / approve refresh / close. One renders.
**Primitives:** P2 (constitutionally — this is §2.9's canonical surface) · P4 (every change block's evidence chip) · P1 (when the diff *is* a pending decision — refresh mode).

**Data + evidence sources.**
*Surface:* `dm_piece_versions` (both sides), refresh-draft change blocks with their named problems (lifecycle's contract), `submitted_content_hash` for the submitted-vs-final anchor.
*Drawer:* each block's problem/rule/violation with its source (the superseded claim and its date, the SERP read, the radar event, the violation span), comparison metadata.

**Components:** DiffViewer + ChangeBlock (divided-list rows; insertions/deletions as tinted text spans, never whole-block fills), evidence chips → EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — two identical versions: `No differences between {version_a} and {version_b}.` with the comparison metadata (triggers, dates, scores) still rendered — the metadata is the content.

*Loading* — block skeletons; the before-side renders first.

*Populated* — change blocks with evidence chips; per-block actions only where the mounting context grants them (accept/reject in refresh mode; none in audit mode); refresh mode carries the running tally (`{n} accepted · {n} edited · {n} rejected`).

*In-progress* — a re-audit or regeneration mutating one side: affected blocks marked live, comparison suspended for them only — `These {n} blocks are changing — comparison resumes when the rewrite lands.` The rest of the diff stays comparable.

*Failed/partial* — a side failing to load renders the loadable side read-only with the failure named: `Couldn't load {version} — showing {other_version} read-only. Retry.` Never a half-diff presented as whole.

**Why affordances:** every change block answers "why this change?" with its problem/rule/violation chip; refresh mode inherits lifecycle's named-problem evidence per block.

**Mobile:** unified-only; per-block actions in the block's row; the mode's primary action docks.

---

### 4.4 `editor-review/S4` — Version History

**Type:** screen · **Register:** R1 · **Chrome modes:** full / embedded (rail tab in the panel) / mobile (sheet)
**Purpose:** the piece's memory — every version, its trigger, its cause.
**Narrative moment:** "when did this change, and why?" — the audit walk.
**Primary action:** compare (→ S3).
**Primitives:** P2 (comparison) · P4 (each version's trigger evidence: the regen feedback verbatim, the run, the restore source).

**Data + evidence sources.**
*Surface:* `dm_piece_versions` — trigger (`initial | full_regen | section_regen | restore | pre_submission`), voice composite at snapshot, run id, directed feedback.
*Drawer:* the feedback that caused each regen verbatim, the run's evidence, the restore's source version.

**Components:** DividedList timeline, ScoreFigure (composite per version), Badge (the `pre_submission` marker), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — one version: `This is the original. Versions appear as you regenerate or restore.`

*Loading* — timeline skeleton.

*Populated* — the timeline with triggers, scores, and the pre-submission marker; any two versions selectable into S3.

*In-progress* — a regeneration writing the next version renders as a pending live entry at the timeline head.

*Failed* — history unavailable: `Version history is unreachable — the editor still works; your current draft is unaffected. Retry.` Degradation isolated and stated; the editor never inherits this failure.

**Why affordances:** every version answers "what caused you?" — the trigger, the feedback verbatim, the run.

**Mobile:** the timeline as a bottom sheet from the editor; compare opens S3 unified.

---

### 4.5 `generation-engine/S1` — Generation Theater

**Type:** screen (and the P3 reference implementation at full scale) · **Register:** R1 · **Chrome modes:** full / embedded (rendered inline where queue rows and the editor deep-link it) / mobile
**Purpose:** the flagship P3 — watch a draft come to life, stage by stage, with control.
**Narrative moment:** Tuesday morning (drafts arriving); first hour in both modes — the first draft is the product's first proof.
**Primary action:** none while healthy (watching is the point — stated, per the schema); cancel / resume when not. Cancel is a ghost action in the theater header, per P3's visual law.
**Primitives:** P3 (staged progress: outline → sections streaming → transition audit → voice audit with live composite → metadata → images; cancel; resume-from-failed-stage) · P4 (every stage row opens its evidence: the outline with metaphor and link plan; each section's voice brief and retrieved chunks; the transition fix report; each audit violation with its span; the cost ledger).

**Data + evidence sources.**
*Surface:* the generation run record (stages, states, timings, cost rollup), streaming section content, the live voice composite, `dm_images` slot states (stage 6).
*Drawer:* the outline's rationale, per-section voice briefs and retrieved corpus chunks with similarities, audit violations with spans, the cost ledger in mono, the brief's evidence.

**Components:** PipelineTheater + StageRow (the canonical full-scale mount: glyph stage icon, 13px name, mono right-aligned state, live region; completed stages collapse to one line with their key figure as a ScoreFigure), LiveDot, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — no run for this piece: the `Generate now` entry with the context summary it would use — `{template} · voice at {voice_strength}% · brief from {brief_source} · {n} link targets ready`. **[SA]** the summary lines name your training as the source; **[ACT]** they name the Cortex layers with confidence.

*Loading* — run-record fetch skeleton in the stage rail's shape.

*In-progress* — the living pipeline: the running stage carries the emerald dot and streams (sections render in as they generate); `awaiting_outline_checkpoint` renders as a named amber pause row — `Paused: outline checkpoint awaiting your review → open checkpoint` — a pause is a state, never a stall.

*Populated* — completed run: final composite with breakdown, the stage timeline with per-stage figures, primary affordance `Open in editor`.

*Failed/partial* — the failed stage shows its error inline with **Resume from here** as the row's action; prior stages' work intact and inspectable — `Voice audit failed: {error}. Sections 1–7 are intact — resume from the audit.` Image-slot failures render per slot without failing the page.

**Why affordances:** "why did section 3 get rewritten?" → the must-fix violation, its span, and the before/after via the shared diff family · the voice score → per-dimension breakdown and violations · every placed link → the chunk similarity that earned it · the metaphor choice → its outline rationale.

**Mobile:** the stage rail is already vertical — it ports intact; stage evidence opens as sheets; cancel stays in the header; resume docks when a stage has failed.

---

### 4.6 `generation-engine/S2` — Image Review

**Type:** screen · **Register:** R1 (the images themselves are R4 artifacts, governed by the style profile — the chrome around them is R1) · **Chrome modes:** full / mobile
**Purpose:** resolve every slot — the review loop of generation §2.7.
**Narrative moment:** Tuesday morning, the last step before approve.
**Primary action:** accept (per slot — the unit gesture; the screen-level action is the resolution meter's completion).
**Primitives:** P1 (each slot is a propose→review micro-decision: accept / regenerate-with-notes / upload / waive) · P3 (regeneration as a small per-slot theater) · P4 (every image opens its concept rationale, style-profile version, and — for in-content slots — why the outline flagged this section as visual).

**Data + evidence sources.**
*Surface:* `dm_images` (slots, states, alt-text, regeneration notes, waive reasons), the style profile version, the resolution meter derived from slot states.
*Drawer:* concept jsonb (subject, composition, rationale), the style profile's Cortex Brand provenance (**[ACT]**) or its R2-derived defaults (**[SA]**, stated), the outline's visual-section reasoning.

**Components:** the slot grid (the sanctioned grid — slots are peers, not a divided list), per-slot ProposalCard actions, small-scale PipelineTheater per regenerating slot, Progress (the resolution meter), Input (alt-text inline, mandatory before accepted/uploaded counts as resolved), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — no slots planned: `The outline planned no images for this piece — {outline_reasoning}. Add a slot if you disagree.` Stated with the reasoning, not blank.

*Loading* — slot-grid skeleton.

*In-progress* — slots generating/regenerating with per-slot progress; resolved slots stay actionable.

*Populated* — the slot grid with states, alt-text fields inline, the resolution meter: `{n} of {total} resolved — featured image required before publish.`

*Failed/partial* — failed slots carry retry — `This slot failed to generate — retry or upload your own.` The rest of the grid unaffected.

**Why affordances:** "why is publish blocked?" → the unresolved slots named · "why does this image look like this?" → profile + concept · waives show their logged reason forever.

**Mobile:** the grid goes single-column; per-slot actions in the slot's sheet; the resolution meter docks above the tab bar as the screen's status line.

---

## 5. Train

The Train section is the trainer's seven surfaces — the first hour in both modes, and the monthly drift ritual thereafter. One structural fact governs every entry here: **standalone onboarding *is* the trainer** (knowledge-trainer §8, locked). The trainer is the one subsystem with no degraded standalone dimension, so its `[SA]` empty states are not consolation copy — they are the product's opening move, framed entirely as "teach Dark Madder your voice," never as "populate Kinetiks." `[ACT]` empties leverage the Cortex layers that arrived from the platform. The training-strength signal computed here (per-layer coverage: Voice, Products, Customers, Author) is what every *other* section's `[ACT]` empty state quotes ("Voice layer at 82% — generate your first draft"); its component breakdown is therefore drawer-openable everywhere it appears, starting on S1.

---

### 5.1 `knowledge-trainer/S1` — Trainer Home

**Type:** screen · **Register:** R1 (a `.dm-cosmos` tonal wash behind the section-home header is sanctioned, per R1's backdrop allowance) · **Chrome modes:** full / mobile
**Purpose:** orientation — what DM knows, how well, what's next.
**Narrative moment:** first hour (both modes); the monthly ritual (drift).
**Primary action:** the single next-best training step (`next_best_action` from the strength computation — one renders, computed, never a menu).
**Primitives:** P4 (every strength number opens its evidence: which scan, which rounds, which rules) · P1 (pending Cortex proposal status, with the iris banner when a proposal awaits platform decision).

**Data + evidence sources.**
*Surface:* the `dm_get_training_status` shape (per-layer strength, drift status, `next_best_action`), `dm_voice_drift_windows` (drift green/yellow/red), pending proposal states via Synapse, lexicon summary from `dm_lexicon_entries`, live session state from `dm_training_sessions`.
*Drawer:* each strength score's component breakdown (Voice: scan ✓ / rounds completed / samples / active rules; Products: intake section completion; Customers: lexicon size, sources, enrichments; Author: rounds per author) with what's missing named; drift's full metric windows with evidence; each proposal's evidence bundle.

**Components:** InstrumentStrip (the per-layer strength meters — one surface, hairline cells, never four stat cards), ScoreFigure (every strength number), semantic chips for drift status (color on the chip, never the card), ProposalCard (pending proposals), inline small-scale PipelineTheater for live sessions, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* —
**[SA]** Headline: `Let's learn your voice.` Body: `2 minutes to start — we scan your site, you confirm what we found.` Primary action: `Scan {domain}` when a domain is known from signup, else `Start with your website`. Secondary, quiet: `No site? Paste writing samples instead.`
**[ACT]** Headline: `Your Voice layer arrived at {voice_strength}% from Kinetiks.` Body: `Two refinement rounds will push past 90 — each takes about ten minutes.` Primary action: `Start a refinement round`. The strength figure is a ScoreFigure even here — the empty state's claim carries its receipt.

*Loading* — skeleton of the strength meters in the populated layout's shape.

*Populated* — per-layer strength, drift status (green/yellow/red chip with evidence), pending proposals, lexicon summary, the next-best-action card.

*In-progress* — a live session (scan running, mining ingesting) renders inline via P3, scoped; the strength meters stay interactive.

*Failed/partial* — per-channel failure with retry, the spec's canonical line verbatim: `Website scan failed: site unreachable — retry or paste content instead.` Never a blank screen; channels fail alone.

**Why affordances:** "why is my voice 62%?" → the component breakdown with what's missing · drift status → the full metric windows · the next-best action → why it's next (the gap it closes).

**Mobile:** strength strip stacks to two cells per row; the next-best action docks in the thumb zone.

---

### 5.2 `knowledge-trainer/S2` — Website Scan Review

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** confirm/adjust/reject the scan's voice findings; route org/product observations to intake.
**Narrative moment:** minutes two through ten of the first hour — the product's first proof that it reads carefully.
**Primary action:** confirm findings → submit voice proposal.
**Primitives:** P3 (scan progress: pages fetched → extraction → findings) · P1 (the findings bundle is a proposal in review — per-card confirm/adjust/reject, then one submission) · P4 (each finding card opens its quoted site excerpts — no finding renders without them, enforced upstream at §2.2).

**Data + evidence sources.**
*Surface:* the scan session (`dm_training_sessions`), findings with their quoted excerpts, the org/product observations routed to S4's intake.
*Drawer:* the exact quoted passages per adjective/pattern, page provenance (URL, fetched count), the proposal payload the confirmations will assemble.

**Components:** PipelineTheater (scan stages), ProposalCard per finding (confirm/adjust/reject as the card's action set; the bundle submission is the screen's one primary), EvidenceDrawer (excerpts in inset wells), StateFrame.

**Five states.**

*Empty* — no domain yet: `What's your website?` with the input as hero. Quiet secondary: `Skip — paste writing or upload documents instead` (→ S3/S4 paths). Mode-identical by design: the scan is the same instrument in both modes; **[ACT]** adds one provenance line when a domain arrived from Cortex Org: `From your Kinetiks profile: {domain} — scan it?`

*Loading* — fetch skeleton.

*In-progress* — P3 staged progress: `pages fetched ({n}/{total}) → extraction → findings`, live counts in mono.

*Populated* — findings cards with excerpts, per-card confirm/adjust/reject; the running confirmation tally; the submit affordance stating the bundle (`Submit {n} confirmed findings as your voice proposal`).

*Failed/partial* — scoped honestly, the spec's framing verbatim: `Read 4 of 10 pages — findings from those 4 only.` The partial findings are fully workable; the unread pages are listed with retry.

**Why affordances:** each adjective/pattern answers "where did you get this?" with the exact quoted passages.

**Mobile:** finding cards single-column; per-card actions inline; the bundle submit docks.

---

### 5.3 `knowledge-trainer/S3` — Refinement Round

**Type:** screen · **Register:** R1 (the sample renders in content typography — the page is the page, as in the editor) · **Chrome modes:** full / mobile
**Purpose:** the edit-toward-your-voice loop.
**Narrative moment:** the heart of the first hour; the drift ritual's prescription.
**Primary action:** `Done editing — show me what you learned.`
**Primitives:** P3 (the sample streams in) · P2 (the delta review is the diff surface in delta-review mode: before/after with interpreted deltas) · P4 (each delta opens the exact text spans behind it).

**Data + evidence sources.**
*Surface:* `dm_refinement_rounds` (round record, topic, sample, edits, deltas), the round picker's coverage map (section types covered vs not), topic fallback chain (Cortex products → scan topics → user-stated).
*Drawer:* per-delta text spans, the delta's plain-language inference, scope attribution evidence where ambiguous (org voice vs author voice).

**Components:** PipelineTheater (sample generation), the editing canvas, DiffViewer in delta-review mode (each delta a ChangeBlock with confirm/correct), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — the round picker: section types not yet covered, with the recommended next one marked and why (`Openings — not yet covered; your drafts will lean on this most`). **[SA]** the picker frames rounds as onboarding (`Round {n} of 3`); **[ACT]** as targeted (`Your drift flag points at conclusions — round recommended`).

*Loading* — round-record skeleton.

*In-progress* — two live sub-states, both named: the sample streaming in (P3), then `You're editing — take your time. Done editing — show me what you learned` as the persistent docked action.

*Populated* — the delta review: each delta as a before/after block with its inference stated in plain language, confirm/correct per delta, scope attribution control where ambiguous (`This sounds like {org} house style / This is your personal style` — the routing consequence stated: org deltas batch into a voice proposal; author deltas write to your author profile directly).

*Failed* — split by stage, edits sacred: generation failure → `The sample failed to generate — retry with the same topic.` Analysis failure → `Your edits are saved — analysis failed. Re-analyze.` Edits are never lost to an analysis failure.

**Why affordances:** every delta states its inference in plain language and is correctable — correcting the interpretation is itself captured as signal, and the UI says so (`Your correction teaches us too`).

**Mobile:** editing in the full-width canvas; the delta review unified; the done-editing action docked throughout.

---

### 5.4 `knowledge-trainer/S4` — Document Upload & Guided Intake

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** extract from uploaded materials; complete the ask #1 product field set section by section.
**Narrative moment:** the optional deepening pass of the first hour; the return visit when a product changes.
**Primary action:** confirm a section / resolve a conflict (the checklist's next incomplete item — one renders).
**Primitives:** P1 (extractions and sections reviewed before becoming proposals) · P4 (every extracted field opens its source passage) · P3 (extraction progress on large uploads).

**Data + evidence sources.**
*Surface:* `dm_product_knowledge` (the ask #1 field set, per-section completion), upload extractions with source passages, conflict pairs, scan-derived pre-fills.
*Drawer:* each field's source passage verbatim, the provenance tag per pre-filled field (`scan / document / AI-assist / user`), both sources verbatim on every conflict.

**Components:** the section checklist with completion percentages (Progress per section), upload affordance, ProposalCard (section confirmations), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — the upload affordance + the section checklist at 0%, with `AI: help me fill this in` available from scan data when a scan exists. **[SA]** framing: `The more Dark Madder knows about what you sell, the less generic your drafts.` **[ACT]** the checklist arrives partially pre-filled from Cortex Products, each pre-fill carrying its provenance tag — completion starts where the platform left off, stated.

*Loading* — checklist skeleton.

*In-progress* — extraction running on large uploads (P3 with per-document progress); the checklist partially complete and fully workable.

*Populated* — sections with completion %, conflicts flagged inline. A conflict shows **both sources verbatim and asks** — `Your site says {a}; the uploaded deck says {b}. Which is current?` — never auto-resolved.

*Failed/partial* — per-document failure isolated: `{filename} couldn't be processed — {reason}. Retry or re-export.` Other documents' extractions unaffected.

**Why affordances:** every pre-filled field shows its provenance; every conflict shows both sources verbatim; every confirmed section states what proposal it feeds.

**Mobile:** checklist as the screen spine; sections open as sheets; the next-incomplete action docked.

---

### 5.5 `knowledge-trainer/S5` — Listening (sources & ingestion)

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** add customer language; manage sources.
**Narrative moment:** the optional close of the first hour ("paste a support thread — watch what we hear in it"); the recurring drop-in whenever raw customer language crosses the user's desk.
**Primary action:** paste.
**Primitives:** P3 (the ingestion theater: segmenting → redacting → extracting → aggregating, with live counts) · P4 (source rows open sync history and exclusion counts).

**Data + evidence sources.**
*Surface:* `dm_language_sources` (sources, last-sync, status), `dm_utterances` (post-redaction, 30-day raw window), ingestion run counts, connector availability per platform-integration status (ask #11).
*Drawer:* per-source sync history, exclusion counts with the org-reply detection explanation and examples, the redaction posture record.

**Components:** the paste box as hero, DividedList (source rows), PipelineTheater (ingestion), Badge (connector status — **DG-7**), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — the paste box as hero, with the privacy posture stated up front, verbatim commitments: `Customer language is redacted before storage. Raw text is kept 30 days, then deleted. Inbox bodies are never stored.` Connector sources listed below with their platform-integration status per **DG-7** — `Available when {platform} is connected at the platform level` — honest, no dead buttons. **[SA]** and **[ACT]** are identical here by design (standalone accounts hold Kinetiks IDs and can connect integrations — knowledge-trainer §8); the only mode difference is which connectors are already live.

*Loading* — source-list skeleton.

*In-progress* — the ingestion theater with live counts, the spec's example verbatim as the format: `212 utterances · 38 org replies excluded · 491 redactions.`

*Populated* — sources with last-sync, counts, status.

*Failed* — per-source error with the platform's actionable message passed through unedited (the platform owns connector errors; DM never paraphrases them into vagueness).

**Why affordances:** "why were 38 excluded?" opens the org-reply detection explanation with examples.

**Mobile:** paste box stays the hero; source rows compact; ingestion counts as the docked status line while running.

---

### 5.6 `knowledge-trainer/S6` — Customer Lexicon

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** the receipts view — language gaps, questions, objections. *Receipts or it didn't happen* is this screen's constitution: no entry renders without counts, source breakdown, and exemplars.
**Narrative moment:** the post-mining "what did we hear?"; the pre-research pass that seeds Discovery.
**Primary action:** act on an entry — curate vocabulary toggle (→ voice proposal) / send territory candidate to Discovery / enrich product objections / dismiss.
**Primitives:** P4 throughout (counts, source breakdown, exemplars on every entry) · P1 (the vocabulary curation set submits as a proposal).

**Data + evidence sources.**
*Surface:* `dm_lexicon_entries` (gaps, questions with coverage badges, objections; frequency, trend), `coverage_status` computed by research's corpus intelligence.
*Drawer:* every count's source breakdown, redacted exemplar quotes in inset wells, both frequency computations behind every "they say X, you say Y" gap, the matching corpus piece (or its absence) behind every coverage badge.

**Components:** DividedList grouped by entry type, ScoreFigure (frequencies, trend arrows), coverage Badge, ProposalCard (the curation set), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — educational, with the paste CTA: `Nothing mined yet. Paste a support thread, a call transcript, or reviews — we'll surface the words your customers actually use, the questions they ask, and the objections they raise.` **[ACT]** adds the connector shortcut when integrations are live: `Or sync {connected_source} — {n} conversations available.`

*Loading* — entry-list skeleton.

*Populated* — gaps (`they say "{customer_term}" {n}× · you say "{org_term}"`), questions with coverage badges, objections; trend arrows in mono.

*In-progress* — recompute after a sync: stale-data banner with progress; existing entries stay actionable.

*Failed/partial* — the coverage column shows `coverage unknown` when corpus intelligence is unavailable (**DG-2** — stated, never faked); everything else on the entry renders fully.

**Why affordances:** every coverage badge opens the matching corpus piece or names its absence (with `Create content piece` as the bridge) · every gap opens both frequency computations.

**Mobile:** entry types as segmented tabs; entries as cards with the same mono figures; entry actions in the row sheet.

---

### 5.7 `knowledge-trainer/S7` — Corrections Ledger

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** view, edit, deactivate, export the craft rules; resolve conflicts; see the learning curve.
**Narrative moment:** the monthly ritual's "is it actually learning?" — the screen that answers with a chart, not an assurance.
**Primary action:** resolve flagged conflicts (when none: none — the ledger is visited, not lived in).
**Primitives:** P2 (every rule's bad/good example pair renders as a diff — the canonical viewer's rule-example mode) · P4 (effectiveness history per rule: which drafts applied it, which edits decayed it).

**Data + evidence sources.**
*Surface:* `dm_corrections` (rules by scope/category, effectiveness with decay, conflict flags), the learning-curve series (edits-per-draft trending, voice match trending), `dm_voice_drift_windows` (drift status).
*Drawer:* per-rule provenance (the originating edit, piece, and date), applications vs overrides, the full drift metric windows.

**Components:** DividedList (rules by scope/category), DiffViewer in rule-example mode (bad/good pairs), the learning-curve chart (monochrome-first per the color law — ink weight, no categorical hues), ScoreFigure (effectiveness), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — `Rules appear as you edit drafts — the system learns from every correction.` **[ACT]** with editing history elsewhere but no rules yet distilled: the same line plus the next-distillation timing.

*Loading* — rule-list skeleton.

*Populated* — rules by scope/category with effectiveness figures, conflict flags, and the learning-curve chart: edits/draft trending down, voice match trending up, drift status.

*In-progress* — monthly maintenance running: a banner, scoped; rules stay readable.

*Failed* — chart data unavailable → rules still listed: `The learning curve is unavailable right now — your rules are unaffected. Retry.` Degradation isolated.

**Why affordances:** every rule answers "where did this come from?" (the originating edit, piece, date) and "is it working?" (applications vs overrides) · drift status opens the full metric windows.

**Mobile:** the chart first (it's the answer to the visit's question), rules below as cards; conflict resolution actions inline.

---

## 6. Research

Nine surfaces covering the spine PATCH-001 rebuilt — Discovery → Keywords → Opportunities → Architecture → Publishing Plan — plus the corpus-intelligence pair (Corpus Map, Link Sweep; nav home IA-agnostic per §3) and Campaigns. Two laws govern the section's copy everywhere: **every "based on your Context Structure" phrase is a P4 opener** (the exact Cortex fields, lexicon counts, and signals behind it), and **"why is this piece on this date" is answerable for every piece** — the PATCH-001 law, rendered. The section is fully standalone (research-architecture §8): DataForSEO is available to standalone accounts, so SEO-data degradation (**DG-3**) is a connection state, not a mode difference.

---

### 6.1 `research-architecture/S1` — Research Overview

**Type:** screen · **Register:** R1 (section-home cosmos wash sanctioned) · **Chrome modes:** full / mobile
**Purpose:** the research home — stage progress, key metrics, recent activity, quick actions; the orientation PATCH-001 found missing.
**Narrative moment:** Monday planning.
**Primary action:** the current stage's next step (computed from stage states — one renders).
**Primitives:** P4 (every metric opens its computation; the drift flag opens the centroid evidence) · P3 (a running discovery/refresh renders inline).

**Data + evidence sources.**
*Surface:* stage states across `dm_territories` / `dm_seeds` / `dm_clusters` / `dm_opportunities` / `dm_pillars` / `dm_calendar`, the activity log, drift/refresh flags, the radar tile (open medium+ event counts — radar-response's stated contribution to this screen, rendered here, owned there).
*Drawer:* each metric's computation, the drift flag's centroid math (last-10-pieces centroid vs territory centroids, the drifting pieces named), each flagged item's evidence, the radar tile's events.

**Components:** the stage status bar (clickable stages, each stating what it produces), InstrumentStrip (metrics), DividedList (activity log), semantic chips (flags), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* —
**[SA]** Primary: `Start Discovery.` Framing body: `Discovery finds your authority territories — the subjects you can credibly own — then turns them into data-backed keyword seeds. About 15 minutes, and you confirm everything.`
**[ACT]** Headline: `Your Context Structure already suggests {n} territories.` Body: `Review them — confirm, adjust, or reject; then we generate seeds.` Primary: `Review territories`. The count is a ScoreFigure opening the candidates' provenance.

*Loading* — status-bar and metric skeletons.

*Populated* — the status bar with clickable stages, metrics, activity log, drift/refresh flags, the radar tile when events are open.

*In-progress* — a running discovery/refresh renders inline via P3, scoped; stages already complete stay clickable.

*Failed/partial* — stage-scoped errors with retry; completed stages unaffected: `Keywords refresh failed — Discovery and your existing clusters are untouched. Retry.`

**Why affordances:** the status bar explains what each stage produces · every flagged item links to its evidence · the radar tile opens its events.

**Mobile:** the status bar becomes a vertical stage list; the current stage's next step docks.

---

### 6.2 `research-architecture/S2` — Discovery

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** territories (conversation + cards) and data-backed seeds.
**Narrative moment:** the first-hour research opener; the quarterly territory review.
**Primary action:** define/confirm territories → generate seeds.
**Primitives:** P3 (the discovery run: Cortex read → candidates → conversation → seed generation with per-territory progress) · P1 (territory candidates and the competitive proposals they yield) · P4 (every candidate opens its provenance — Cortex fields, lexicon counts with exemplars, signals; every seed opens its keyword data with `fetched_at`).

**Data + evidence sources.**
*Surface:* `dm_territories` (cards: name, description, estimated search potential, relevance score, status, source), `dm_seeds` (the grid: include/exclude, ear icons with lexicon frequency, composite ranking), the conversation thread.
*Drawer:* per-candidate Cortex fields and lexicon counts with redacted exemplars, per-seed keyword data with `fetched_at` (via the platform DataForSEO tools), the ear icon's frequency computation, the composite ranking's inputs.

**Components:** the conversation surface, territory cards, the seed grid (DividedList with include/exclude toggles, ear-icon Badge, sort/filter, `Generate more`), PipelineTheater (the run), ProposalCard (candidates; competitive proposals), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — the conversation opener.
**[SA]** First-principles: `What does your organization want to be known for? Start anywhere — we'll shape it into territories together.` (When Cortex is thin, the opener routes through the minimum-viable-context prompt — org + one product — with the trainer as the fill path, per research §8.)
**[ACT]** Cortex-aware: `From your Context Structure: you sell {product} to {audience}, and your customers keep asking about {top_lexicon_topic}. Here are {n} territory candidates — let's pressure-test them.` Every quoted field is a P4 opener.

*Loading* — card and grid skeletons.

*In-progress* — P3: `Cortex read → candidates → conversation → seeds`, with per-territory seed progress.

*Populated* — territory cards + the seed grid: include/exclude, ear icons (`♪ {n}× from your customers` — frequency as demand evidence keyword tools can't provide), sort/filter, `Generate more`.

*Failed/partial* — **DG-3**: SEO tool unavailable → seeds render with explicit `no keyword volume data` badges and the fallback ranking explained (`ranked on corpus gaps and competitive signals — volume data unavailable`). Degraded and honest, never fabricated.

**Why affordances:** every relevance score, every seed's composite ranking, every "based on your Context Structure" phrase opens the exact inputs.

**Mobile:** conversation full-width; territory cards single-column; the seed grid as cards with the same mono figures; generate-seeds docks.

---

### 6.3 `research-architecture/S3` — Keywords

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** enriched clusters; the end of "7 keywords" opacity.
**Narrative moment:** the shaping pass between Discovery and Architecture.
**Primary action:** expand and shape clusters.
**Primitives:** P4 (the expanded cluster detail *is* an evidence surface: full keyword table, PAA, SERP analysis, AI Overview state) · P1 (split/merge confirmations).

**Data + evidence sources.**
*Surface:* `dm_clusters` (membership, opportunity score, intent), `dm_seeds`, `dm_research_snapshots` (keyword/SERP data with `fetched_at` — snapshots are decision evidence, not caches).
*Drawer:* the opportunity score's formula and inputs, cluster-membership intent rationale, the full keyword table with per-keyword data states, PAA, the SERP read, AI Overview presence and sources.

**Components:** cluster cards expanding into the detail surface, the keyword table (mono figures, tabular), ScoreFigure (opportunity scores), Dialog (split/merge confirmations stating their consequences), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — no seeds included yet: `Clusters form from included seeds — you haven't included any. Back to Discovery.` Route, with the dependency stated, not a dead end.

*Loading* — clustering progress with the method stated: `clustering {n} seeds — semantic` or, under **DG-2**, `clustering {n} seeds — lexical (corpus intelligence unavailable)`. The method is never silent.

*Populated* — clusters with scores, intent, and expandable detail.

*In-progress* — re-cluster/refresh running with a stale-data banner; existing clusters stay readable and shapeable.

*Failed/partial* — per-cluster data gaps stated: `difficulty unavailable for 3 keywords` — the gap named on the exact rows, the rest of the table authoritative.

**Why affordances:** the opportunity score shows its formula and inputs · cluster membership answers "why are these grouped?" with the intent rationale.

**Mobile:** clusters as cards; the expanded detail's dense table becomes a card list with the same mono figures (design-language §10's table rule); split/merge in the cluster sheet.

---

### 6.4 `research-architecture/S4` — Opportunities

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** evidenced, actionable findings.
**Narrative moment:** Monday planning's "what should we chase?"; the post-refresh harvest.
**Primary action:** Add to Architecture.
**Primitives:** P1 (each card is a proposal: add / dismiss / research more) · P4 (the *why*, the value estimate, and the origin — Oracle insight, lexicon entry with counts and quotes, SERP read — every claim opens its data).

**Data + evidence sources.**
*Surface:* `dm_opportunities` (cards with mandatory `why` — schema-enforced: no `why`, no row), grouped/filterable by source.
*Drawer:* the originating Oracle insight, the lexicon entry with counts and redacted quotes, the SERP read, the value estimate's arithmetic, probe data for AI-citation gaps.

**Components:** ProposalCard (each opportunity: title, the mandatory why line, evidence chips, add/dismiss/research-more), source filter as Segmented, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — what detection looks for + which sources are currently feeding it, with connect-state honesty per source: `Opportunities surface from four places: your customers' unanswered questions ({lexicon_state}), Oracle insights ({oracle_state}), SERP movement ({serp_state}), and AI citation gaps ({probe_state}).` Each source line carries its honest state — feeding, needs connection (**DG-1**/**DG-3**), or runs-after (`AI citation gaps need probe data — runs after your first ai-visibility cycle`).

*Loading* — card skeletons.

*Populated* — cards grouped/filterable by source, each with its why line rendered (it exists by schema).

*In-progress* — detection running post-refresh, scoped banner; existing cards actionable.

*Failed/partial* — source-scoped: a failed source's group states its failure; other sources' cards unaffected.

**Why affordances:** every card's *why this is an opportunity* is mandatory at creation and rendered without exception — the schema is the copy guarantee.

**Mobile:** cards single-column; source filter as a segmented strip; add-to-architecture inline per card.

---

### 6.5 `research-architecture/S5` — Architecture

**Type:** canvas · **Register:** R1, full-bleed minus gutters · **Chrome modes:** full / mobile (touch-native pan/zoom)
**Purpose:** the collaborative structure canvas — hubs, spokes, pillars, the linking map.
**Narrative moment:** the planning session's centerpiece; where research becomes structure.
**Primary action:** build/confirm hubs and spokes.
**Primitives:** P1 (AI-suggested structures and pillar proposals reviewed before acceptance; the cannibalization checkpoint is a three-option proposal) · P4 (hub/spoke nodes open keyword data, the linking map, association badges; the summary's pillar-gap flags open the distribution math) · P2 (the cannibalization checkpoint renders the overlapping pieces side-by-side).

**Data + evidence sources.**
*Surface:* `dm_pillars` (generated per org, the v1 four as worked example only), `dm_clusters` (unassigned sidebar), hub/spoke structures with the linking map, product/campaign association badges (`dm_cluster_products`, `dm_piece_products`, `dm_piece_campaigns`), pillar distribution with gap flags.
*Drawer:* per-node keyword data, the linking map's edges, association levels with their generation effects, the pillar-distribution math behind every gap flag (`Trust: 0 hubs`), the cannibalization flag's similarity + overlapping piece + its live performance where platform data is connected (**DG-1** otherwise).

**Components:** CanvasShell (pan/zoom, overlay toggles, side investigation panel), node/edge rendering per the color law (ink-weight, iris = selected), ProposalCard (suggested hubs; the three-option checkpoint: Merge / Differentiate / Proceed anyway, each stating its consequence), DiffViewer side-by-side mount (the checkpoint's overlap view), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — unassigned clusters in the sidebar + `AI: suggest structure`. Truly empty (no clusters yet): territory ghosts on the canvas — structure implied, honestly labeled `Your clusters will assemble here`.

*Loading* — canvas skeleton; the sidebar resolves first.

*Populated* — the canvas + summary panel with pillar distribution and gap flags; every proposed hub stating why this cluster, why this title, why these spokes — all modifiable before confirming.

*In-progress* — structure suggestion computing across clusters: the affected region live, manual building uninterrupted elsewhere.

*Failed/partial* — suggestion failure leaves manual creation fully functional: `Structure suggestion failed — build manually or retry; nothing you've placed is affected.` The canvas never blanks.

**Why affordances:** every proposed hub states its three whys · every cannibalization flag shows similarity, the overlapping piece, and its live performance where connected · every gap flag opens the distribution math.

**Mobile:** pan/zoom native; node investigation via the bottom sheet; the overlay toolbar collapses to a toggle row; the checkpoint renders as a sheet with the three options stacked.

---

### 6.6 `research-architecture/S6` — Publishing Plan

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** pacing → sequenced preview with rationale → commit.
**Narrative moment:** the moment planning becomes operated work — the canonical propose→review→approve.
**Primary action:** Commit to Calendar (→ strategic approval).
**Primitives:** P1 (the commit: preview, approval, Program registration) · P4 (every placed piece's date opens its sequencing rationale; every phase opens its strategy; pace projections open their arithmetic).

**Data + evidence sources.**
*Surface:* the pace presets with honest framing (who each suits, total-completion projections for *this* architecture), the phased sequence with per-piece rationale, the sequencing-rules panel with per-rule overrides, `dm_calendar`, the commit preview's exact consequence statement.
*Drawer:* per-piece sequencing rationale (hub-before-spoke, opportunity rank, seasonal evidence, link dependency), per-phase strategy, pace arithmetic, the Program action the commit performs (create vs mutate — integration §6.1's one-Program-per-goal rule, stated in the preview).

**Components:** Segmented (pace presets), the sequence timeline with drag/reorder/remove and buffer/blackout controls, the rules panel (Switch per rule), ProposalCard (the commit preview — its blast radius is the full consequence list: pieces created, generation dates, first draft date, last publish date, the Program action), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — no architecture yet: `The plan sequences your architecture — there's nothing to sequence yet. Build your architecture first.` Route back, with the why.

*Loading* — timeline skeleton.

*Populated* — pace selector with honest framing, the phased sequence, drag/reorder/blackout controls, the rules panel.

*In-progress* — recompute after a pace change (the timeline live, scoped); or **pending approval**: the awaiting-decision state with the card deep-link rendered as the P1 iris banner — the plan is read-only-with-reason until decided.

*Failed/partial* — **DG-4**: Program registration unavailable (ask #8 interim) → commits to `dm_calendar` with the difference stated, not hidden: `Committed to your calendar. Program registration isn't available yet — your plan runs identically; Marcus's Program view arrives when the platform ships it.`

**Why affordances:** the rules panel shows which sequencing rules are active and lets you override each · "why is this piece on this date" is answerable for every piece — the PATCH-001 law, structurally honored.

**Mobile:** the sequence as a vertical timeline; drag becomes reorder controls; Commit docks with the consequence count (`Commit {n} pieces`).

---

### 6.7 `research-architecture/S7` — Corpus Map

**Type:** canvas · **Register:** R1, full-bleed minus gutters · **Chrome modes:** full / mobile (touch-native) · **Nav home:** IA-agnostic (Research vs Monitor — experience-architecture's call)
**Purpose:** the org's content as navigable structure; the shared canvas for the intelligence layer (freshness glow, AI-cited glow, radar pressure treatment all render here — computed by their owners, rendered on this canvas).
**Narrative moment:** the monthly "what do we actually own?" survey; the post-import reveal.
**Primary action:** investigate (hover/click → side panel → act: open, refresh, sweep links).
**Primitives:** P4 (overlays *are* evidence renderings: cohesion scores per cluster, drift with its centroid math, orphan lists).

**Data + evidence sources.**
*Surface:* `dm_corpus_positions` (weekly snapshot + post-import; never computed client-side), `dm_pieces` (status rings, legacy badges), `dm_embeddings`-derived overlays (per-cluster cohesion, drift, orphans), traffic sizing from platform GA4/GSC tools where connected, glow inputs from lifecycle-freshness / ai-visibility / radar.
*Drawer:* each overlay score's computation, the drift flag's named pieces and nearest territory, each node's stats, links in/out, similar pieces.

**Components:** CanvasShell (overlay toggles, investigation panel), nodes per the color law (size = clicks where **DG-1** permits, uniform with the stated note otherwise; color = cluster; ring = status; glow = flagged), edges (internal links; dotted = approved-but-unpublished suggestions), super-node clustering past ~500 nodes, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — territory centroids as ghost structure: `Your first pieces appear here.` An instrument warming up, not a blank error.

*Loading* — positions from snapshot, with the stamp rendered: `map updated weekly · last projection {date}`.

*Populated* — nodes, bonds, overlays toggleable. Traffic sizing only with GA4/GSC connected; otherwise uniform sizes with **DG-1**'s note: `connect GA4 for traffic sizing`.

*In-progress* — post-import re-projection running: stale-positions banner; the current map stays navigable.

*Failed/partial* — **DG-2**: pgvector unavailable → the map is feature-flagged off with the honest explanation — a designed absence screen, never a broken view: `The corpus map needs the platform's vector infrastructure — it isn't enabled yet. Your content and links are unaffected; the map lights up when it ships.`

**Why affordances:** every overlay score opens its computation · the drift flag names the drifting pieces and the nearest territory · an orphan's glow is one click from a sweep scoped to it.

**Mobile:** pan/zoom native; investigation via sheet; overlay toggles as a collapsed row; super-nodes earlier on small viewports.

---

### 6.8 `research-architecture/S8` — Link Sweep

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile · **Nav home:** IA-agnostic (paired with S7)
**Purpose:** the backward-linking queue.
**Narrative moment:** the post-publish "what should now point here?"; the post-import full-corpus pass.
**Primary action:** approve suggestions (batched per target piece → `dm_update_article`).
**Primitives:** P1 + P2 (each suggestion is a proposal rendered as a diff: the exact insertion sentence with the link in place) · P4 (similarity, rationale, the chunk it matched).

**Data + evidence sources.**
*Surface:* `dm_link_suggestions` (grouped by new piece, then by target; similarity, proposed anchor, the insertion sentence), sweep run state with candidate counts.
*Drawer:* per-suggestion similarity and rationale (mandatory), the matched chunk, the batch's exact membership.

**Components:** DividedList (the grouped queue), DiffViewer in link-insertion mode (the sentence with the link in place — tinted span, never a whole-block fill), per-suggestion actions (approve / edit anchor / skip), the batch confirm Dialog stating blast radius, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — `Suggestions appear when new pieces publish — each publish sweeps your corpus for places the new piece belongs.` Post-import variant adds the CTA: `Run a full-corpus sweep across your {n} imported pieces.`

*Loading* — queue skeleton.

*Populated* — the grouped queue; approve / edit anchor / skip per suggestion; `Approve all` scoped to DM-managed targets only, its confirm dialog stating exactly which live pieces change and that **one approval covers one target piece's batch** (the P1 blast-radius law, applied).

*In-progress* — sweep running with live candidate counts in mono.

*Failed/partial* — legacy targets route to the manual-export checklist with the why stated verbatim: `Dark Madder never modifies pages you haven't handed over.` Copy-paste export per target, adoption offered where the piece lives in the connected CMS.

**Why affordances:** every suggestion's rationale is mandatory · batch approvals state their exact blast radius.

**Mobile:** groups collapse to target-piece cards; the diff renders unified; batch approve docks per group.

---

### 6.9 `research-architecture/S9` — Campaigns

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** campaign intake and association management.
**Narrative moment:** the launch-prep session; the "why does this draft sound urgent?" answer.
**Primary action:** complete sections / associate pieces (the next-incomplete pattern, as trainer S4).
**Primitives:** P1 (intake section confirmations) · P4 (readiness % opens the section breakdown; association badges open generation-effect explanations).

**Data + evidence sources.**
*Surface:* `dm_campaigns` (identity, timeline, key dates, goals, audience with `audience_difference`, key messages, narrative arc, CTA, tone shift, urgency, themes; readiness %), `dm_piece_campaigns` (associations).
*Drawer:* the readiness breakdown by section, each association level's generation effect (`mention level — the product appears as one option among several`), the campaign fields behind any affected draft's tone/CTA.

**Components:** the section-by-section intake (trainer S4's pattern reused — completion Progress, AI-assist), campaign list (DividedList with readiness ScoreFigures and timelines), association Badge, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — what campaigns change about generation, with an example: `A campaign reshapes how associated pieces are written — tone, urgency, CTA, key messages. Example: a launch campaign turns "{neutral_line}" into "{campaign_line}".`

*Loading* — list skeleton.

*Populated* — the campaign list with readiness, timeline, associated pieces.

*In-progress* — AI-assist drafting a section: scoped live region in the intake.

*Failed/partial* — incomplete campaigns generate with defaults for missing soft dimensions, **stated on associated briefs**: the campaign card carries `generating with defaults for {missing_sections}` so the consequence is visible where the association is made, not discovered in a draft.

**Why affordances:** every campaign-affected draft can answer "why this tone/CTA" — the campaign association and its fields, in the drawer.

**Mobile:** intake sections as sheets; the list compact; next-incomplete docks.

## 7. Publish

Six surfaces: the publishing trio (the connection, the truthful activity log, the per-piece Live Status panel) and the splits trio (queue, composer, templates). This is the section where DM touches the world, so its state language is the most consequential in the app: **jobs in progress are the emerald live signal; drift and incident flags are semantic chips, never colored cards** (publishing §7's visual law), every Sentinel verdict renders verbatim with no override path, and every world-changing action leaves a row in the log. Both subsystems are fully standalone — CMS connections are DM-owned, and splits post manually by design (no social APIs) — so `[SA]`/`[ACT]` splits below are rare and stated where they occur.

---

### 7.1 `publishing/S1` — CMS Connections

**Type:** screen (Settings → Publishing) · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** connect, map, set up schema, and know the connection's true state.
**Narrative moment:** first hour, both modes — publishing is the spine's last vertebra; the monthly ritual's "is everything healthy" glance.
**Primary action:** connect (empty) / fix the named problem (unhealthy). One renders.
**Primitives:** P1 (field-mapping confirmation is a propose→review micro-decision: auto-mapped fields are proposals the user confirms or adjusts) · P4 (every detected capability, mapping, and schema state opens its evidence: what was introspected, when, what the guided setup generated, what verification found on the live page).

**Data + evidence sources.**
*Surface:* `dm_cms_connections` (provider, domain, health, last-check), `dm_cms_collection_mappings` (per-content-type mappings, schema-template state), introspected capability lists.
*Drawer:* the introspection record with its timestamp, each auto-mapping's source fields, the guided setup's generated structure, the live-page parse result behind every schema verification.

**Components:** the provider picker, connection cards, mapping rows with state chips (`verified` / `setup needed` / `verification failed` + re-run), Badge (capability absences), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — no connection: the provider picker with the guided collection-structure reference and the spike-honest capability notes (publishing §2.12's findings rendered, not marketing). Standalone and activated identical by design — CMS is DM-owned.

*Loading* — connection card skeletons.

*Populated* — connection cards: provider, domain, health with last-check time, the capability list with stated absences — `asset upload: not supported — images serve from Dark Madder storage` — and per-content-type mappings with their schema-template state chips.

*In-progress* — connecting / introspecting / verifying, each a named step.

*Failed/partial* — health failure names the cause and the recovery action: `Connection unhealthy: API key revoked — generate a new key in {provider} and reconnect.` A failed schema verification isolates to its mapping card; the connection stays usable.

**Why affordances:** "why can't I publish?" → the exact unhealthy/unmapped state with its fix · "why is my schema unverified?" → the live-page parse result.

**Mobile:** connection cards stack; mapping detail as sheets; the fix/connect action docks.

---

### 7.2 `publishing/S2` — Publish Activity

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** the truthful log of every world-changing action — jobs, verifications, incidents, drift. The v1 sync dashboard, grown into an instrument.
**Narrative moment:** Tuesday morning's "did everything ship?"; the post-incident "what happened?".
**Primary action:** resume the top failed job / resolve the top drift event, when any; otherwise none (watching is the point).
**Primitives:** P3 (each running job renders as a scoped theater: the publish stages live, Sentinel pause states named, the coalesced site-publish shown as the shared final step of a batch) · P1 (verification fix proposals and pending drift resolutions render as decision cards) · P2 (drift rows open the external-drift diff — the canonical viewer's mode, mounted) · P4 (every stage, verdict, check, and incident opens its evidence: the Sentinel reason, the payload digest, the per-check verification result, the rollback's incident provenance).

**Data + evidence sources.**
*Surface:* `dm_publish_jobs` (jobs by day: kind, piece, stages, verification badges), `dm_drift_events` (pending resolutions), incident history with postmortem links and the `quality_gate_updated` items they produced.
*Drawer:* per-stage errors and retry history, Sentinel verdicts verbatim, payload digests, per-check verification results, rollback provenance chains.

**Components:** DividedList grouped by day, scoped PipelineTheater per running job (batch site-publish rendered as the shared final step), ProposalCard (fix proposals, drift decisions), DiffViewer in external-drift mode, semantic chips (drift, incidents), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — nothing published yet: `Approved pieces publish from the editor — activity lands here.` With the connection state summarized below (healthy / the §7.1 fix link / not connected), so the path to a first publish is visible from the empty log.

*Loading* — row skeletons.

*Populated* — jobs grouped by day with kind, piece, stages, verification badges; pending drift events; incident history with postmortem links.

*In-progress* — live jobs streaming stage state among completed ones; a Sentinel pause renders as the named amber state with the verdict's deep-link — a pause, never a stall.

*Failed/partial* — failed jobs with the failed stage named, prior stage work intact, one-click resume. A log-fetch failure degrades to cached rows with a staleness banner — `Showing activity as of {time} — live refresh failed. Retry.` Never blank.

**Why affordances:** "why did this fail?" → the stage, the actionable error, the retry history · "why did this piece get republished at 3am?" → the critical incident and the rollback's provenance chain · "why is this job paused?" → the Sentinel flag awaiting confirmation, verbatim.

**Mobile:** day groups as the spine; job rows compact to piece + stage + badge; the resume/resolve action docks when one exists.

---

### 7.3 `publishing/S3` — Live Status

**Type:** **panel** (mounted in the piece view and the editor's published-piece context — beside lifecycle's Piece Freshness Panel) · **Register:** R1 · **Chrome modes:** full / embedded (inherits the editor's mode) / mobile (sheet)
**Purpose:** one piece's relationship with the world: where it lives, whether it's verified, whether it has drifted, what has shipped to it.
**Narrative moment:** Tuesday morning, opening any published piece.
**Primary action:** open live URL.
**Primitives:** P4 (verification results, drift state, and every update in the history open their evidence) · P2 (drift resolution and update history mount the diff viewer) · P1 (a pending fix proposal or drift decision renders inline).

**Data + evidence sources.**
*Surface:* the piece's `dm_publish_jobs` history (each entry: kind, approval, what changed), `dm_cms_connections` health for its target, verification badge with per-check detail, schema state, `dm_drift_events` for this piece.
*Drawer:* per-check verification results, the drift event with the live page's parse, each update's approval and diff.

**Components:** the panel card (hairline-divided sections: URL/dates · verification · schema · drift · history), Badge per check, DiffViewer mounts, inline ProposalCard, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — piece not yet published: the publish-readiness summary (approval state, gates remaining) — never a blank panel pretending a URL exists.

*Loading* — panel skeleton.

*Populated* — live URL, published/updated dates, verification badge with per-check detail, schema state, drift state, the update history.

*In-progress* — a live job for this piece streams its stages here too (the same run-state machinery, panel scale).

*Failed/partial* — a verification incident renders with severity, the response taken, and the pending proposal if one exists; a status-fetch failure shows last-known state with staleness named.

**Why affordances:** "why does this say major-flagged?" → the failed check and the pending fix proposal · "why doesn't the live page match what I see in DM?" → the drift event and the three-way resolution.

**Mobile:** the panel is a sheet from the piece view; open-live-URL stays the one action.

---

### 7.4 `splits/S1` — Split Queue

**Type:** screen · **Register:** R1 (generated cards preview under **R4**, never product chrome — splits §7's visual note) · **Chrome modes:** full / mobile
**Purpose:** the working surface — splits by source piece × platform × status, cadence suggestions, the ready/posted pipeline at a glance.
**Narrative moment:** Tuesday morning's "the fast-track piece shipped — its splits are waiting"; Monday planning's distribution pass over last week's publishes.
**Primary action:** review the oldest draft split; when none, act on the top cadence suggestion.
**Primitives:** P3 (in-flight batches render as scoped theater: insights → platforms → hooks → cards, live per stage) · P1 (template-adjustment proposals and cadence suggestions render as cards with evidence) · P4 (every row opens its provenance: source insights with passage refs, template version, author stamp, voice composite, Sentinel verdict with reason, the radar event when one originated it).

**Data + evidence sources.**
*Surface:* `dm_splits` (rows by source piece × platform × status), batch run states, cadence suggestions, `dm_split_templates` versions (stamps per row).
*Drawer:* source insights with passage refs into the published piece, the template version, the author stamp, the voice composite breakdown, Sentinel verdicts verbatim, the originating radar event, D47's corpus-distance statement on declined Reddit rows.

**Components:** DividedList (queue rows on hairline-divided surfaces, never card grids), scoped PipelineTheater (batches), ProposalCard (cadence suggestions, template proposals), semantic chips (Sentinel and flags carry the only semantic color), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — no splits yet: `Turn published pieces into platform-native social content.` The account's published pieces listed as one-click batch starts, with the auto-split and fast-track posture stated (`auto-split: {on/off} — fast-tracked pieces always queue their splits`). **[SA]/[ACT]** identical; the only variance is which pieces exist to list.

*Loading* — queue skeleton.

*Populated* — rows by source × platform × status; `flagged` rows carry the verdict chip and the confirm affordance; `declined` Reddit rows state D47's reason (the corpus-distance statement, verbatim).

*In-progress* — running batches inline as P3; per-platform completion staggers visibly.

*Failed/partial* — per-platform failure isolated: `LinkedIn and Reddit generated; TikTok failed at the script stage — resume.` The batch resumable per stage, never all-or-nothing.

**Why affordances:** "why is this ready/not ready?" → the checklist items with evidence and the Sentinel verdict verbatim · "why did this auto-generate?" → the trigger (fast-track event / toggle) with its ref · "why was this declined?" → the corpus-distance statement.

**Mobile:** rows group by source piece; platform chips inline; review-oldest docks.

---

### 7.5 `splits/S2` — Split Composer

**Type:** screen · **Register:** R1 (cards preview as R4 artifacts in R1 chrome) · **Chrome modes:** full / mobile
**Purpose:** one split, fully workable — body editor, hook picker, slides and cards, posting notes, the checklist panel, the ready action.
**Narrative moment:** the five minutes between "drafted" and "ready" where the user makes it theirs — every edit teaching the ledger.
**Primary action:** select a hook and mark ready; when blocked, resolve the top hard item.
**Primitives:** P1 (the mark-ready checkpoint with the checklist's state and the Sentinel step rendered as consequences-before-the-act) · P3 (regeneration of a hook, a slide, or the body streams scoped — the theater at paragraph scale) · P4 (every element opens its evidence: the insight behind the body with its source passage, each hook's rationale, each card's style-profile and template stamp, each checklist item's check and quote, the audit's per-dimension breakdown with the template's relaxations named).

**Data + evidence sources.**
*Surface:* the `dm_splits` record (body, hooks with alternatives, slides/cards, posting notes, checklist state, author stamp / no-author flag), `dm_split_templates` (the governing version), `dm_images` (social cards).
*Drawer:* the source insight's passage in the published piece, per-hook rationale with the alternatives kept, card style-profile + template stamps, per-item checklist evidence and quotes, the voice audit's per-dimension breakdown with the template's relaxations named.

**Components:** the body editor, the hook picker (Segmented over alternatives), the card/slide strip (R4 previews), the checklist panel, per-element small-scale PipelineTheater, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — a queued-but-ungenerated platform slot: the template's shape previewed (`LinkedIn: hook → 3–5 insight paragraphs → discussion prompt · 800–1,500 characters`) with the generate affordance — the shape is the promise, shown before the spend.

*Loading* — content skeleton.

*Populated* — the full composer; the author stamp and the no-author flag render at the top when applicable.

*In-progress* — scoped regeneration or card rendering live; the rest of the split sits still.

*Failed* — stage failure with resume; card failure degrades per D45 with the partial state named (`text ready — card rendering failed; mark ready without the card or retry`); edits always preserved.

**Why affordances:** "why this hook?" → its rationale and the alternatives kept · "why can't I mark ready?" → the hard items, each with its evidence and fix path · "why is this flagged?" → Sentinel's reason verbatim, with the logged-confirmation affordance and what confirming means.

**Mobile:** hook picker above the body; cards as a swipe strip; mark-ready docks with the blocker count when blocked.

---

### 7.6 `splits/S3` — Split Settings & Templates

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** the platform default set, the auto-split toggle, and the template editor with versions and system proposals.
**Narrative moment:** the monthly ritual's "the deletion patterns say tighten LinkedIn"; onboarding's "which platforms are yours?".
**Primary action:** review the pending template proposal when one exists; otherwise none (settings are visited, not lived in).
**Primitives:** P1 (template proposals with the edit-pattern evidence; version changes through review) · P2 (a template change renders as a diff against the active version) · P4 (every template rule opens its provenance — seeded v1 best practice, user edit with rationale, or system proposal with the deletion aggregate; every version opens the splits it produced).

**Data + evidence sources.**
*Surface:* the platform default set, the auto-split toggle with its cost note, `dm_split_templates` (versions, pending proposals).
*Drawer:* per-rule provenance, the deletion aggregate (counts and examples) behind system proposals, each version's produced splits.

**Components:** Switch (platforms, auto-split), the template list with version stamps, ProposalCard (system proposals), DiffViewer (template-change mode), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — seeded defaults active, stated as such: `The four platforms ship with current best practices — edit anything.`

*Loading* — form skeleton.

*Populated* — platform toggles, the auto-split toggle with its cost note, the template list with versions and pending proposals.

*In-progress* — a template change pending review: banner, scoped.

*Failed* — config load failure with retry; the active versions always render from their stamps, never guessed.

**Why affordances:** "why does LinkedIn cap at 1,500?" → the template rule and its provenance · "why did the system propose this?" → the deletion aggregate, counts and examples.

**Mobile:** toggles and list stack; the pending proposal, when one exists, leads.

## 8. Monitor

Fourteen surfaces across four specs — the lab's sensing wall. Three section-wide characters govern the copy: **honesty before numbers** (the sources banner loads first on every scoring surface; every score opens subscores → frozen inputs → source and `fetched_at` — the D19/D20 design rendered), **consequences before the act** (every response path, recommendation, and staged change states exactly what clicking it does, before the click — D33's transparency), and **sparse is a feature** (the radar's quiet feed and the settings screens' "otherwise none" primary actions are designed restraint, not missing content). Standalone postures differ by spec and are stated per entry: ai-visibility and lifecycle run fully standalone with **DG-1**/**DG-3** gaps named; measurement degrades to production-metrics-only with connect affordances; radar is the one Monitor surface with a hard mode split — sensing is platform-owned, so its standalone state is the honest inert instrument.

---

### 8.1 `lifecycle-freshness/S1` — Freshness Home

**Type:** screen · **Register:** R1 (section-home wash sanctioned) · **Chrome modes:** full / mobile
**Purpose:** the section home that orients — corpus freshness at a glance, the ranked refresh queue with each piece's *named* problems, drafts awaiting review, holds, and the rewrite proposals.
**Narrative moment:** Tuesday morning ("freshness diffs queued" — the doc-system narrative, verbatim); the monthly ritual's "what's rotting" check.
**Primary action:** review the top awaiting-review draft; when none, refresh the top queue piece.
**Primitives:** P1 (awaiting-review drafts and D28 rewrite proposals render as decision cards) · P4 (every score opens its subscores → frozen inputs → sources and `fetched_at`; every queue position opens the priority arithmetic; every named problem opens its claim or gap evidence).

**Data + evidence sources.**
*Surface:* `dm_freshness_scans` (scores, trajectories), `dm_claims` (the problem summaries), `dm_refresh_drafts` (pending), drift holds from radar's `merge_later`/track semantics, `dm_freshness_config` (the cap/settings summary), traffic weight via platform GSC where connected.
*Drawer:* per-score subscores with frozen inputs, the priority formula with its inputs, per-problem claim/gap evidence, the hold's originating event.

**Components:** InstrumentStrip (corpus freshness), DividedList (the ranked queue: score · trajectory chip · problem summary · traffic weight where sourced), ProposalCard (drafts, rewrite proposals), the sources banner, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — nothing published:
**[SA]** `Freshness begins with your first published piece — here is what will be watched.` The signal list rendered with each signal's source requirement (**DG-1**/**DG-3** states inline).
**[ACT]** the same signal list plus the first-scan date set against the publish plan: `First scan runs {date} — {n} pieces will be enrolled as they publish.`

*Loading* — queue skeletons; **the sources banner first** — honesty before numbers.

*Populated* — corpus freshness, the ranked queue (problem summaries in the spec's format: `3 stale stats · 1 SERP gap · 1 dead link`), drift holds grouped and named, pending drafts, rewrite proposals, the cap/settings summary.

*In-progress* — a running scan or backfill as the live signal with scope and budget state, verbatim format: `verifying 14 claims — 9 free date checks, 5 searched, budget 5/40.`

*Failed/partial* — a failed source query renders that signal column unavailable-with-reason while the rest populate; a scan failure leaves prior scans authoritative with staleness named. Never blank, never silently partial.

**Why affordances:** "why is this piece ranked first?" → the priority formula with its inputs · "why can't this piece be refreshed?" → the drift hold, the event, the resolve affordance · "why is the ranking score-only?" → the GSC gap and its connect affordance (**DG-1**).

**Mobile:** the queue is the spine; the freshness strip compacts; review-top docks.

---

### 8.2 `lifecycle-freshness/S2` — Refresh Review

**Type:** screen (the canonical viewer's refresh-diff mount — semantics owned here, surface owned by editor-review §2.9) · **Register:** R1 · **Chrome modes:** full / mobile (unified-only)
**Purpose:** resolve a refresh — the propose-don't-publish flagship rendered.
**Narrative moment:** Tuesday morning's two-minute review.
**Primary action:** Submit for publish (stating unresolved blocks when blocked); per-block accept as the unit gesture.
**Primitives:** P2 (constitutionally — the refresh-diff mode) · P1 (the submission and its approval state, deep-linked to the card) · P4 (every block's evidence chip: the superseded source with its date, the SERP read, the radar event, the measurement diagnosis; the estimated score delta opens its arithmetic) · P3 (a still-generating draft renders its pipeline stages; a resumable failure names the stage).

**Data + evidence sources.**
*Surface:* `dm_refresh_drafts` (change blocks by operation type, resolutions, the running tally), the approval state via the card, publishing's job stages when executing.
*Drawer:* per-block problem evidence (superseded source + date / SERP read / radar event / measurement diagnosis), the score-delta arithmetic, the merged accepted set.

**Components:** DiffViewer in refresh mode + ChangeBlock (per-block accept/edit/reject), the tally strip, ProposalCard (the submission), scoped PipelineTheater (generation; execution), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — no draft for this piece: the piece's problems listed with `Generate refresh` and the cost/scope it would take — never a blank diff.

*Loading* — block skeletons with the before-side rendered first.

*Populated* — change blocks grouped by operation type, resolutions live, the running tally (`6 accepted · 1 edited · 1 rejected`), the submit affordance with the merged-set summary.

*In-progress* — three named live forms: generation streaming blocks in; submitted-and-pending with the approval card's state rendered and deep-linked (**DG-6**); executing with publishing's job stages streamed.

*Failed/partial* — a generation failure names the stage with prior operations intact and resumable; a Sentinel `blocked` at execution renders the verdict verbatim with edit-and-resubmit as the path, never override (**DG-5**); a failed publish leaves prior truth intact, stated.

**Why affordances:** every block answers "why this change?" with its problem and evidence · "what exactly am I approving?" → the merged accepted set, block by block · "why did this come back?" → the Sentinel reason or the verification incident, verbatim.

**Mobile:** unified diff; per-block actions in the row; Submit docks with the tally (`Submit — 6 accepted`).

---

### 8.3 `lifecycle-freshness/S3` — Piece Freshness Panel

**Type:** **panel** (mounted in the piece view, beside publishing's Live Status — the two panels follow one shape) · **Register:** R1 · **Chrome modes:** full / embedded (inherits) / mobile (sheet)
**Purpose:** one piece's decay picture — score history, the claims ledger, gap records, refresh history.
**Narrative moment:** any "how stale is this, exactly?" moment; the post-refresh "what changed?".
**Primary action:** Refresh now (or the hold's resolve affordance).
**Primitives:** P4 (the ledger *is* an evidence surface: every claim with its status, replacement, and source; every gap with its data; score history with config-version markers) · P2 (refresh-history entries open their diffs) · P1 (a pending draft or rewrite proposal renders inline).

**Data + evidence sources.**
*Surface:* `dm_claims` (the ledger grouped by status), `dm_freshness_scans` (score history with config-version markers, trajectory, next-scan date), gap records, refresh history.
*Drawer:* per-claim expiry model and verification evidence, per-gap data, each history entry's diff.

**Components:** the panel card (hairline-divided: score/trajectory · ledger · gaps · history · next scan), ScoreFigure with config-version markers, DiffViewer mounts, inline ProposalCard, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — an unpublished piece: `The ledger begins at publish.` With what extraction will look for — never a fake zero.

*Loading* — panel skeletons.

*Populated* — score with trajectory, the ledger grouped by status, gaps, history, the next-scan date.

*In-progress* — a verification or refresh touching this piece, scoped and live.

*Failed/partial* — per-section isolation; an unverifiable claim renders as exactly that, with the attempt's evidence — `couldn't verify: {attempt_summary}` is a truthful terminal state, not an error.

**Why affordances:** every claim answers "why is this stale?" with its expiry model and verification evidence · "why hasn't this been checked?" → evergreen marking or the next batch date.

**Mobile:** sheet from the piece view; the ledger leads.

---

### 8.4 `lifecycle-freshness/S4` — Freshness Settings & Adoption

**Type:** screen (the adoption flow cross-links to Content Library, where research's import lives) · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** the levers (cadence, threshold, caps, budgets, changelog visibility — all D31 config with versions) and the legacy-adoption flow.
**Narrative moment:** the post-import "which of these are mine to maintain?"; the budget-tuning pass.
**Primary action:** adopt matched legacy pieces, when any await; otherwise review a pending config change.
**Primitives:** P1 (adoption is a propose→confirm micro-decision stating exactly what changes — `the Freshness Engine can propose updates; nothing changes until you approve a specific refresh`; config changes preview before versioning) · P4 (every config value opens its provenance and the runs it governed; every match opens its slug evidence).

**Data + evidence sources.**
*Surface:* `dm_freshness_config` (cards with versions and rationale), the adoption list (matched with evidence / unmatched with reasons / adopted with dates), backfill run state with cap and cost.
*Drawer:* per-value provenance and governed runs, per-match slug comparisons, the connection error from publishing's health when introspection fails.

**Components:** config cards with version stamps, DividedList (adoption list), Dialog (adoption confirm — the exact-consequence statement is its body), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — no legacy pieces and seeded config: the seeded values stated as such, with the import cross-link (`Import existing content in Content Library — matched pieces appear here for adoption`).

*Loading* — skeletons.

*Populated* — config cards with versions and rationale; the adoption list in its three groups.

*In-progress* — a backfill running with its cap and cost ticking, in mono.

*Failed/partial* — a provider-introspection failure degrades matching to manual with the connection error surfaced from publishing's health, named — one error, one owner, rendered where it bites.

**Why affordances:** "why is this piece unmatched?" → the slug comparison shown · "why did the cron only do one refresh?" → the cap, its value, its version.

**Mobile:** adoption list leads when matches await; config cards stack.

---

### 8.5 `radar-response/S1` — Radar (the feed)

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** the instrument panel — severity-ranked events, each with its attribution, evidence, and one obvious action; the collapsed low-relevance roll-up; the health line. **Sparse by design: what it doesn't show is the feature.**
**Narrative moment:** Tuesday morning ("radar events with one-click respond" — the doc-system narrative, verbatim).
**Primary action:** the top high-severity event's recommended response; when the feed is quiet, none — the health line is the content.
**Primitives:** P1 (every medium+ event card is a proposal: the recommended response with alternatives, dismiss) · P4 (every severity opens its scoring — platform prior, DM re-score, method, the attribution chain; every recommendation opens its rationale and the coverage analysis; every clustered story opens its sources).

**Data + evidence sources.**
*Surface:* the platform intelligence feed joined with `dm_radar_events` (DM's response state), `dm_radar_subscriptions` (the health line), `dm_radar_dismissal_patterns` (the dampening behind the roll-up).
*Drawer:* the full scoring chain (platform prior → DM re-score → method), the attribution chain (your hub, your ranking, their coverage delta), the coverage analysis, clustered sources.

**Components:** event cards (the PATCH-006 anatomy carried: event, attribution, coverage delta, recommended response with rationale, alternatives, source links, dismiss), the health line, the collapsed roll-up, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — the section's hard mode split:
**[ACT — connected, quiet]** the health line: `subscriptions healthy · last delivery {time} · no events need attention — a quiet feed means a quiet week.` Watch coverage summarized. Never a blank that could mean broken.
**[SA]** the honest instrument: what Radar watches when connected (competitor publishes, news, spikes, community), rendered as the inert panel with the upgrade CTA naming the concrete gain — no dead buttons, no fake events.

*Loading* — card skeletons, health line first.

*Populated* — severity-grouped cards, the capped overflow expandable, the low-relevance roll-up collapsed (`37 low-relevance events this week`).

*In-progress* — a response executing renders its routing live on the card (`refresh queued — generating`, `fast track: drafting now`) with the downstream theater deep-linked.

*Failed/partial* — a subscription failure or stale registration renders on the health line with the re-register affordance; a failed response action surfaces the downstream error verbatim on the card with retry; scoring under keyword fallback (**DG-2** pre-pgvector) states itself on every affected card.

**Why affordances:** "why is this high severity?" → the attribution · "why am I not seeing more?" → the cap, the dampened patterns (each reversible), the pre-filter · "why did this disappear?" → expiry, with the event retrievable in the closed list.

**Mobile:** cards single-column, severity groups as the spine; the top recommended response docks when one exists.

---

### 8.6 `radar-response/S2` — Event Detail & Response

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** one event, fully evidenced, and the response launched from inside the evidence — the coverage analysis side by side with our piece, the auto-brief previewed before anything routes.
**Narrative moment:** the minute between noticing and deciding.
**Primary action:** execute the recommended response.
**Primitives:** P4 (the analysis *is* an evidence surface: their coverage vs ours, recency, format, the clustered sources, the scoring chain in full) · P2 (competitor-vs-ours coverage renders on the canonical viewer's rendering conventions — a comparison view, not a new primitive) · P1 (each response path is a proposal with its consequence stated: the fast track names its 24h clock and the Workflow it will register on approval; the standard track names the strategic proposal it will submit; Queue Refresh names the lifecycle job) · P3 (a launched fast track streams generation's theater, scoped here).

**Data + evidence sources.**
*Surface:* the event payload (renders immediately), the coverage analysis (loads independently — never blocks the card), the auto-brief preview, response routing state.
*Drawer:* the scoring chain, source-by-source coverage reads, the rationale with the alternatives' tradeoffs, each path's full consequence.

**Components:** the event anatomy card, the comparison view (DiffViewer conventions), the response launcher (ProposalCards per path, each stating its consequence — **the D33 transparency rendered: "what exactly will happen if I click this" is answered before the click, on the button's card, every time**), scoped PipelineTheater, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — n/a by construction (the surface mounts on an event). The specced boundary state is an **expired/closed event**: rendered read-only with its outcome and `this window has closed` — never a live action on a dead trend.

*Loading* — the event renders immediately from the feed payload; the coverage analysis loads independently.

*Populated* — the full anatomy + response launcher with the auto-brief preview.

*In-progress* — analysis running (`reading their piece — 2 of 3 sources`), or a response routing with the downstream state live.

*Failed/partial* — an unreachable source URL degrades the analysis to the reachable sources with the gap named; a downstream failure (lifecycle at cap, generation failed) surfaces the owning subsystem's actionable error and **the event stays open** — a failed response never closes the window.

**Why affordances:** "why this response and not that one?" → the rationale with the alternatives' tradeoffs · "what exactly will happen if I click this?" → the stated consequence per path, before the click.

**Mobile:** the anatomy first, comparison as a sheet, the recommended response docked with its consequence line above it.

---

### 8.7 `radar-response/S3` — Subscriptions & Tuning

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** the user calibrates the instrument — what is registered, coverage per territory, dampened patterns, caps. Radar feels like equipment, not a black-box news service.
**Narrative moment:** Monday planning's "is the sensor array pointed right?"; the post-dismissal "stop showing me these."
**Primary action:** re-register when stale; otherwise review dampened patterns.
**Primitives:** P1 (re-registration previews the payload delta; pattern reversal confirms) · P4 (every topic space opens what was registered and when; every pattern opens the dismissals that built it; the competitor list opens its Cortex provenance).

**Data + evidence sources.**
*Surface:* `dm_radar_subscriptions` (topic spaces, registration state, the Cortex read-time stamp on competitor domains), event-type toggles, caps (visible config), `dm_radar_dismissal_patterns`.
*Drawer:* per-space registration payloads with timestamps, per-pattern dismissal histories, Cortex competitive-layer provenance.

**Components:** DividedList (topic spaces, patterns), Switch (event types), the re-registration preview (DiffViewer on the payload delta), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — no architecture yet: `Radar watches what Research defines — define territories first.` Routed, with the why. **[SA]** the registration this account *would* make, rendered inert with the upgrade CTA — the same honest-instrument posture as S1.

*Loading* — skeletons.

*Populated* — topic spaces with registration state, competitor domains with the Cortex read-time stamp, event-type toggles, caps, dampened patterns with reversal.

*In-progress* — a re-registration running with the payload diff shown.

*Failed/partial* — a failed registration names the platform error with retry; `unavailable` (ask #3 pre-ship) states exactly that — and the inject-route note is visible **only in dev builds**, never production chrome.

**Why affordances:** "why isn't Radar covering this topic?" → the registration state and the territory it lacks · "why did severity drop on these?" → the pattern, its dismissals, its reversal.

**Mobile:** spaces lead; patterns and toggles stack; re-register docks when stale.

---

### 8.8 `ai-visibility/S1` — AI Visibility Home

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** the instrument — share of voice per cluster with trends, the by-engine breakdown, the needs-attention findings with their buttons, the cycle clock and budget summary.
**Narrative moment:** the monthly ritual's "AI share-of-voice movement" (doc-system narrative, verbatim); Tuesday morning's reputation check when a sentiment finding fired.
**Primary action:** route the top confirmed finding; when none, review the latest cycle.
**Primitives:** P1 (finding cards — Queue Citability Refresh / Create Content Piece / Propose competitor / acknowledge) · P4 (every score opens the formula, weights, config version, and per-engine inputs; every finding opens the diagnosis with both passages side by side and the probe transcripts; every share-of-voice cell opens the citation list behind it).

**Data + evidence sources.**
*Surface:* `dm_ai_visibility_snapshots` (per-cluster share of voice, trends, per-engine breakdown), `dm_ai_visibility_findings` (cards with confirmation state), the cycle clock and budget summary from `dm_ai_visibility_config`.
*Drawer:* the score formula with this cycle's inputs and `engines_participated`, probe transcripts from `dm_ai_probe_results`, both passages side by side per diagnosis, the citation list per cell, the `routed_to` ref and outcome check.

**Components:** the cluster table (mono, trajectory chips per the color law — no categorical hues), ProposalCard (findings; unconfirmed ones carry the variance caveat inline), the budget meter, PipelineTheater (cycles), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — no question bank yet: `Build your first question bank — {cluster} has {n} PAA questions and {m} customer questions ready to import.` One click to S2. **[SA]** adds the keyword-fallback posture statement when applicable (**DG-2**), stated, not silent.

*Loading* — table skeleton.

*Populated* — the full instrument; unconfirmed findings carry the variance caveat inline.

*In-progress* — a running probe cycle as P3: `questions → engines → parsing → scoring`, the budget meter draining live.

*Failed/partial* — per-engine failure isolated and stated: `ChatGPT probes failed this cycle (provider error) — this cycle's scores computed from 2 engines, marked on every number.` Retry per engine; never a blank instrument.

**Why affordances:** "why this score?" → the formula with this cycle's inputs and `engines_participated` · "why is this a finding?" → the state change, both cycles, the diagnosis · "why was this routed?" → the `routed_to` ref and the outcome check.

**Mobile:** the cluster table becomes cards with the same figures; the top finding docks.

---

### 8.9 `ai-visibility/S2` — Question Bank

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** the questions the engines get asked — four sources, tiering, expected-piece mapping, probe history.
**Narrative moment:** the post-mining moment when fresh lexicon questions await import; the bank-thinning pass.
**Primary action:** import the highest-frequency unbanked lexicon question; otherwise generate candidates for the thinnest bank.
**Primitives:** P1 (lexicon-import suggestions render as accept/dismiss cards with frequency evidence) · P4 (every question opens its source — the PAA SERP, the redacted lexicon exemplars with counts, the generation rationale — its mapping with distance and method, and its probe history sparkline) · P3 (candidate generation streams).

**Data + evidence sources.**
*Surface:* `dm_ai_probe_questions` (rows with source chip, tier control, expected piece or the unanswerable badge, last result per engine), lexicon-import suggestions from `dm_lexicon_entries`.
*Drawer:* per-question source evidence (PAA SERP / redacted exemplars with counts / generation rationale), the mapping's distance and method (keyword fallback stated), probe-history sparklines, the nearest chunk behind every unanswerable badge.

**Components:** DividedList (question rows), source chips, Segmented (tier control), ProposalCard (import suggestions), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — the four sources listed with what each holds: `12 PAA · 7 customer questions · generate candidates.` The bank starts as an inventory of what's ready, not a blank list.

*Loading* — bank skeleton.

*Populated* — question rows: source chip, tier control, expected piece (or the unanswerable badge with its meaning), last result per engine.

*In-progress* — candidate generation or lexicon import streaming inline.

*Failed* — generation retryable; a mapping failure renders `mapping unknown` honestly — never a fabricated piece ref.

**Why affordances:** "why does this question exist?" → its source evidence · "why this piece?" → the mapping distance and method · "why is this unanswerable?" → the nearest chunk and distance, with `Create Content Piece` right there — demand without supply, one click from supply.

**Mobile:** rows compact to question + source + result; the import suggestion leads when one exists.

---

### 8.10 `ai-visibility/S3` — AIV Settings, Budget & Tuning

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** engines, the budget meter, config versions, and the citability tuning proposals.
**Narrative moment:** the quarterly "are the rules still right?" pass; the onboarding moment engines come online.
**Primary action:** review the pending rule-revision proposal when one exists; otherwise none (settings are visited, not lived in).
**Primitives:** P1 (rule-revision proposals with passage evidence; config-change review) · P2 (a rule revision renders as a diff against the active rules config) · P4 (the budget meter opens per-cycle spend by engine; every config version opens its rationale and the cycles it governed; each engine row opens its D38 status — platform-backed / interim-local / unavailable, with what that means).

**Data + evidence sources.**
*Surface:* `dm_ai_visibility_config` (engine toggles, budget, versions, pending proposals), per-engine D38 status.
*Drawer:* per-cycle spend by engine, per-version rationale and governed cycles, the cost math (questions × clusters × engines × provider rates), revision passage evidence and acceptance records.

**Components:** Switch (engines), the budget meter, config history (DividedList), ProposalCard (revisions), DiffViewer (rule-revision mode), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — seeded defaults shown as such; engines awaiting configuration state the Ask 14 boundary plainly — what's platform-backed, what's interim-local, what's unavailable, and what each means.

*Loading* — form skeleton.

*Populated* — toggles, the meter with estimated cost, config history, pending proposals.

*In-progress* — a config change pending review; a tuning analysis running (P3, brief).

*Failed* — config load failure with retry; the active version always renders from its stamp, never guessed.

**Why affordances:** "why this budget?" → the cost math · "why did the rules change?" → the revision's passage evidence and acceptance record.

**Mobile:** the pending proposal leads; meter and toggles stack.

---

### 8.11 `measurement/S1` — Performance Overview

**Type:** screen (the Analytics home) · **Register:** R1 (charts monochrome-first per the color law: ink weight encodes value; semantic hues are status overlays only; the v1 green/yellow/red cluster grid is reborn as trajectory chips on an ink table) · **Chrome modes:** full / mobile
**Purpose:** the section home that orients — is content working, what needs attention, what is staged.
**Narrative moment:** the monthly ritual's opening screen; Monday planning's status check.
**Primary action:** review the top pending recommendation; when none, open the latest report.
**Primitives:** P1 (recommendation cards; the staged plan-change set with its Submit affordance) · P4 (every score, trend, and flag opens its evidence: the composite's subscores and frozen inputs, the authority composition with research's component timestamps, the sources banner).

**Data + evidence sources.**
*Surface:* `dm_performance_snapshots` (authority trend, cluster table: score · trajectory · cohesion · AI visibility), `dm_recommendations` (pending; the staged set), output velocity from `dm_pieces`, the sources banner (`sources_used` / `gaps` as first-class fields — the spec's character in miniature).
*Drawer:* composite subscores → frozen inputs → source and `fetched_at`, the authority composition with research's component timestamps (research computes, measurement composes — by reference, stamped), per-rec finding and evidence.

**Components:** InstrumentStrip (authority trend, velocity), the cluster table (ink table, trajectory chips), ProposalCard (recommendations; the staged set with Submit), the sources banner, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — nothing published:
**[SA]** `Scores begin with your first published piece — here is what will be measured.` The signal list with its source requirements (**DG-1** inline per signal).
**[ACT]** leverages Cortex and the plan: `{n} pieces publish this month — first scores land after the first biweekly scan on {date}.`

*Loading* — tile skeletons; **the sources banner loads first** — honesty before numbers.

*Populated* — authority trend, output velocity, the cluster table, pending recommendations, the staged set, outlier flags.

*In-progress* — a scan running as the live signal with scope: `scoring 23 pieces — GSC and DataForSEO available, GA4 not connected.`

*Failed/partial* — a failed source query renders that column unavailable-with-reason while the rest populate; a scan failure leaves prior snapshots authoritative with staleness named. Never blank, never silently partial.

**Why affordances:** "why is this cluster declining?" → the per-piece trajectory breakdown with the frozen inputs that moved · "why is this number missing?" → the named gap and its connect affordance · "why are these three changes staged?" → each rec's finding and evidence.

**Mobile:** the cluster table to cards; the top recommendation docks.

---

### 8.12 `measurement/S2` — Cluster & Piece Performance Detail

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** the drill-down — one cluster or one piece, every judgment explained.
**Narrative moment:** the report's "underperformers" links land here; any "why is this piece at 28?" moment.
**Primary action:** the diagnosed action when one exists (Queue Refresh / Rework meta); otherwise none.
**Primitives:** P4 (constitutionally: every snapshot opens subscores → frozen inputs → source and `fetched_at`; the config version each score was judged under; the ai-visibility probe context via its snapshot ref) · P1 (piece-scoped recommendations inline).

**Data + evidence sources.**
*Surface:* `dm_performance_snapshots` (score history with config-version markers, trajectory, per-signal trends, the gaps timeline — when sources appeared/disappeared), keyword positions and citation rates where sourced.
*Drawer:* every number's full provenance: subscores, frozen inputs, source, `fetched_at`, judging config version, the probe-context snapshot ref.

**Components:** the score-history chart (ink-weight, config-version markers as quiet mono stamps), per-signal trend rows, the gaps timeline, inline ProposalCard, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — an unpublished piece: `Scores begin at publish.` With the readiness context — never a fake zero.

*Loading* — chart skeletons.

*Populated* — score history with config-version markers, trajectory, per-signal trends, the gaps timeline, keyword positions and citation rates where sourced.

*In-progress* — a live rescore for this piece, scoped.

*Failed/partial* — per-panel isolation; a failed live query degrades that panel to the last snapshot with its date.

**Why affordances:** every number answers "computed from what, when, under which judgment?" — the D19/D20 design rendered.

**Mobile:** chart first; signal rows stack; the diagnosed action docks when one exists.

---

### 8.13 `measurement/S3` — Health Report

**Type:** screen (monthly, with archive) · **Register:** R1 (the report reads as a document: content typography for prose sections, ink tables for data) · **Chrome modes:** full / mobile
**Purpose:** the monthly ritual's document — six sections, evidence-laden, action-armed.
**Narrative moment:** the monthly ritual, verbatim from the doc-system's narratives.
**Primary action:** act on section 3's top underperformer (its execution arm).
**Primitives:** P1 (every recommendation and execution arm) · P4 (every claim in the report opens its evidence; every section states its sources inline) · P3 (generation renders as a brief staged theater: gathering → scoring joins → synthesis).

**Data + evidence sources.**
*Surface:* `dm_reports` (the six sections, permanently retained; the archive rail), per-section `sources_used`/`gaps` inline.
*Drawer:* every claim's evidence; the diagnosis chain behind every underperformer, back to frozen inputs.

**Components:** the document surface, section-inline source statements, ProposalCard execution arms, the archive rail (DividedList), brief PipelineTheater, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — no report yet: the cadence stated, the next generation date, and what the first report will contain given current connections — the contents-given-connections framing makes **DG-1** a preview, not a surprise.

*Loading* — section skeletons.

*Populated* — the six sections; the archive rail of prior reports.

*In-progress* — generating, staged: `gathering → scoring joins → synthesis.`

*Failed/partial* — a section whose sources failed renders its stated absence while the rest of the report stands; a generation failure leaves the prior report authoritative and says so.

**Why affordances:** "why does this section say 'unavailable'?" → the named gap and ask-status · "why is this piece in underperformers?" → the diagnosis chain back to frozen inputs.

**Mobile:** the document scrolls; execution arms inline per section; the archive rail folds to a picker.

---

### 8.14 `measurement/S4` — Quarterly Review

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** the guided flow — reassessment → rebalancing → movement → ROI → the combined decision. P1 at strategic scale: the quarter's one moment the plan fundamentally changes, assembled as a single reviewable delta.
**Narrative moment:** the quarter's close.
**Primary action:** submit the staged changes (one strategic proposal).
**Primitives:** P1 (the flow *is* the primitive at strategic scale) · P2 (the calendar delta renders as a diff: current plan vs proposed, each change block carrying its originating finding as the evidence chip) · P4 (every kill/expand/pivot judgment opens its quarter of evidence).

**Data + evidence sources.**
*Surface:* the five flow sections, the assembled delta, `dm_recommendations` (staged), the quarter's `dm_performance_snapshots`, the competitor-movement roll-up (radar's events with outcomes — radar records, measurement renders), D26 thresholds from `dm_measurement_config`.
*Drawer:* per-judgment quarters of evidence (snapshots, SERP/movement events, thresholds met), per-block originating findings, the ROI attribution inputs (or the Ask-13 absence, stated).

**Components:** the guided-flow stepper, per-section decision cards, DiffViewer (the calendar delta, each ChangeBlock chip-carrying its finding), PipelineTheater (synthesis — the longest model call in the spec, staged), ProposalCard (the one strategic submission), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — mid-quarter: the review's date, what has accumulated so far (staged recs, drift flags, movement events) — **explicitly not a report yet**; accumulation rendered as accumulation.

*Loading* — skeletons.

*Populated* — the five sections with per-section decisions and the assembled delta.

*In-progress* — synthesis running (staged theater); or the submitted proposal pending — the approval's state rendered and deep-linked (**DG-6**).

*Failed/partial* — section-isolated failures (an Ask-13 absence renders the ROI attribution block as its stated absence); a synthesis failure preserves the gathered evidence and offers resume.

**Why affordances:** "why kill this cluster?" → the D26 thresholds met, the quarter's snapshots, the SERP/movement evidence · "what exactly am I approving?" → the full delta diff, block by block, finding by finding.

**Mobile:** the stepper is the spine; the delta unified; Submit docks with the change count.

## 9. Overview & Settings

Three entries: the App Home (owned by this doc — no spec claims it, the nav table names it, and doc-system §3.1's law says every screen traces to a narrative moment, so the home is built *from* the narratives: it is where Tuesday morning, Monday planning, and the monthly ritual each begin), Generation Settings (generation-engine's S3, housed under Settings per the nav table), and App Settings (owned by this doc — the honest remainder after the kill list). Both `screen-system/`-owned entries are flagged in §12 for reconciliation with `dm-product-spec.md` when its narratives are written.

The home's structural law: **it owns no numbers.** Every tile is a rendering of an owning subsystem's figure, P4-openable to that owner's evidence, deep-linking into that owner's section. The home orients; it never recomputes (the one-owner-per-number rule, applied to the front door).

---

### 9.1 `screen-system/OV1` — App Home

**Type:** screen · **Register:** R1 (the `.dm-cosmos` tonal wash behind the header — the section-home allowance, used here if anywhere) · **Chrome modes:** full / mobile
**Purpose:** the Tuesday-morning orientation — what needs you, what the lab is doing, what's next. The five narratives' shared front door.
**Narrative moment:** all five, at their opening beat: *Tuesday morning* (the decision stack), *Monday planning* (the plan tile), *the monthly ritual* (the report tile when fresh), *first hour standalone* (the [SA] empty state), *first hour activated* (the [ACT] empty state).
**Primary action:** the day's top decision — computed, one renders, in narrative priority order: the top blocked-or-expiring draft (→ editor) → the top high-severity radar event (→ event detail) → the top awaiting refresh review (→ diff mount) → the next-best training step (→ trainer). The home never shows a menu where a decision will do.
**Primitives:** P4 (every tile figure opens the owning subsystem's evidence — the home's drawer content *is* the owner's drawer content, by reference) · P1 (the pending-approvals tile renders platform approval state with deep links; never a second decision surface — tiles route to the deciding surfaces).

**Data + evidence sources.**
*Surface (all by reference, owners named):* queue counts (editor-review: awaiting / blocked / generating), the radar tile (radar: open medium+ counts — the same tile research S1 mounts), freshness queued count (lifecycle), today's and this week's calendar (`dm_calendar` / Program state, research), training strength + drift chip (trainer's `dm_get_training_status`), AI share-of-voice movement when a cycle is fresh (ai-visibility), the latest health report link when fresh (measurement), pending approval count (platform), live runs (the same run-state machinery feeding the sidebar's live-agents block — the home shows *what*, the sidebar shows *that*).
*Drawer:* each tile defers to its owner's evidence pattern, unchanged.

**Components:** the decision stack (DividedList of the day's pending decisions, the top one being the primary action), InstrumentStrip (the orientation figures), tiles as quiet cards (no competing chrome — fewer boxes, more lines), LiveDot rows for running work, EvidenceDrawer (by deferral), StateFrame.

**Five states.**

*Empty* — the first-hour fork, the two narratives verbatim from the doc-system:
**[SA]** *signup → trainer → first draft.* Headline: `Welcome to the lab.` Body: `Dark Madder writes publish-ready content in your voice — first it has to learn your voice. About 15 minutes: we scan your site, you confirm what we found, then your first draft.` Primary: `Start — teach it your voice` (→ trainer S1's [SA] flow). Below, the road rendered as inert-but-honest steps: `train → research → first draft → publish`, each with one line of what it produces.
**[ACT]** *Cortex-rich → first draft in minutes.* Headline: `Your Context Structure is already here.` Body: `Voice at {voice_strength}% · {n} products known · {n} territory candidates ready.` Each figure a ScoreFigure opening its provenance. Primary: the computed best first move — `Generate your first draft` when voice clears threshold, `Review your {n} territories` otherwise. The activated first hour is minutes, and the empty state behaves like it.

*Loading* — the decision stack's skeleton first (decisions before figures — the home's own loading-order rule), then tile skeletons.

*Populated* — the decision stack, the orientation strip, the calendar tile, the section tiles with their owners' figures, live runs.

*In-progress* — live runs render as scoped rows with their stage lines (the P3 machinery at row scale); everything else stays interactive. The home is often in this state, and it should feel like a lab at work, not a dashboard refreshing.

*Failed/partial* — per-tile isolation: a tile whose owner's fetch failed renders that tile's last-known state with staleness named, or its named absence — `Freshness unavailable — retry` — while every other tile stands. The home never inherits a subsystem's failure wholesale; orientation degrades tile by tile.

**Why affordances:** every tile answers through its owner: "why is this the top decision?" → the priority order stated with the item's own clock/severity/evidence · "why is my voice 62%?" → the trainer's component breakdown · "why two radar events?" → the feed's scoring chains.

**Mobile:** the home is the mobile app's anchor — per design-language §10, **Publish and Settings fold into Overview's quick actions and the identity sheet**, so OV1 carries a quick-actions row on <768px (`Publish activity · Splits · Settings`) that desktop doesn't need. The decision stack leads; the top decision docks; tiles compact to figure + delta.

---

### 9.2 `generation-engine/S3` — Generation Settings

**Type:** screen (Settings) · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** templates, lead time, queue, and the image style profile — the levers behind every run.
**Narrative moment:** the monthly ritual's lever check; the post-Brand-update "did the style follow?".
**Primary action:** review a pending template-adjustment proposal, when one exists; otherwise edit.
**Primitives:** P1 (template adjustments from deletion patterns are proposals with evidence; style-profile changes preview before applying) · P2 (template edits render as diffs against the prior version) · P4 (every template default opens its provenance: seeded v1 / user edit / system proposal with its deletion-pattern counts).

**Data + evidence sources.**
*Surface:* templates with versions, lead-time and publishing-days config, the generation queue with positions, the style profile card (`dm_image_style_profiles`) with its derivation statement (Cortex Brand-derived, or R2-default with the source stated).
*Drawer:* per-default provenance, deletion-pattern aggregates behind proposals, fast-track justifications behind queue jumps, the profile's Brand-layer inputs and version.

**Components:** template cards with version stamps, ProposalCard (adjustments), DiffViewer (template-edit mode), the queue list with jump explanations, the style profile card, EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — n/a in practice: seeded templates always exist. The specced state is the pre-migration instant, rendering the seeding progress — the doc's second n/a-by-construction case (after radar S2), handled the same way: the boundary state designed, never faked.

*Loading* — card skeletons.

*Populated* — templates with versions, lead-time and publishing-days config, the queue with positions and fast-track jumps explained, the style profile card with its derivation statement.

*In-progress* — a profile re-derivation after a Brand layer update, with the routing event named (`re-deriving style profile — your Brand layer changed {time}`).

*Failed* — per-card isolation; a profile derivation failure leaves the prior version active and says so.

**Why affordances:** every proposed template change answers "what made you suggest this?" with the deletion aggregate · the queue answers "why is this piece ahead of mine?" with the fast-track justification.

**Mobile:** the pending proposal leads; cards stack; queue compact.

---

### 9.3 `screen-system/ST1` — App Settings

**Type:** screen · **Register:** R1 · **Chrome modes:** full / mobile
**Purpose:** the honest remainder — what DM itself configures after the kill list removed everything the platform owns. This screen is deliberately small, and says why.
**Narrative moment:** onboarding's "where do I set things?"; the occasional preference change.
**Primary action:** none (settings are visited, not lived in — the established pattern).
**Primitives:** P4 (the mode card opens the account's connection facts — the `/api/dm/status` features rendered human: CMS connected, DataForSEO available, pgvector enabled, pieces published).

**Data + evidence sources.**
*Surface:* the identity/mode card (standalone at dm.kinetiks.ai vs activated from Kinetiks, with the Kinetiks ID fact stated plainly), theme preference (**user-set in standalone; follows the Kinetiks-wide preference when activated — rendered as read-only-with-reason in activated mode**, per design-language §2), the settings directory (links to the domain settings surfaces: Generation S3 · CMS Connections 7.1 · Freshness 8.4 · Radar tuning 8.7 · AI Visibility 8.10 · Split templates 7.6 — settings live with their owners; this screen is the index, not a duplicate), the Content Library import cross-link.
*Drawer:* the status features behind the mode card, each with its meaning.

**Components:** the mode card, Switch/Segmented (theme, standalone only), DividedList (the settings directory), EvidenceDrawer, StateFrame.

**Five states.**

*Empty* — n/a by construction: the mode card and directory always exist. The boundary state is a fresh account, which simply renders defaults stated as defaults.

*Loading* — card skeletons.

*Populated* — the mode card, theme control (per mode), the directory, the import cross-link, and the **what-isn't-here note**, rendered as user-facing honesty rather than absence: `Notifications, billing, and team members are managed in Kinetiks — Dark Madder doesn't duplicate them.` (Standalone variant: `…arrive with the platform — your account is already a Kinetiks ID.`) The kill list, made legible.

*In-progress* — n/a beyond control feedback; no long operations live here.

*Failed* — a status-fetch failure renders the mode card's last-known facts with staleness named; the directory always works (it's navigation, not data).

**Why affordances:** "why can't I change the theme?" → the activated-mode rule, stated with where to change it · "why are there so few settings?" → the what-isn't-here note · "what does 'pgvector enabled' mean for me?" → the feature's plain-language meaning in the drawer.

**Mobile:** reached via the identity sheet per design-language §10; the directory is the body.

## 10. Shared degradation library

Seven states designed once, referenced by ID throughout §§4–9. Each member: the trigger, the render rule, the canonical copy (adapted per surface only in the bracketed variables, never in posture), and where it's exercised. Improvising a variant of any of these per-screen is a state-law-2 violation. The library is closed by this draft — a new degradation discovered in build files a write-back here first.

**DG-1 — GA4 / GSC not connected** *(platform-asks #4's mandated design)*
*Trigger:* the platform GA4/GSC extractors aren't connected for this account.
*Render:* the dependent signal/column/sizing renders as a named absence with the connect affordance; composites renormalize and state it; nothing zeroes.
*Canonical copy:* `{signal} needs {GA4|GSC} — connect it at the platform level to light this up.` Inline column form: `unavailable — GSC not connected.` Sizing form (Corpus Map): `connect GA4 for traffic sizing.`
*Exercised:* 6.4, 6.5, 6.7, 8.1 ("why is the ranking score-only?"), 8.11, 8.13 (the contents-given-connections preview), 9.1 (tile pass-through).

**DG-2 — pgvector / corpus intelligence unavailable** *(ask #5 pre-ship; feature-flagged, never faked)*
*Trigger:* the `vector` extension isn't enabled on the shared project.
*Render:* corpus features render their designed off-state; dependent computations fall back with the method stated; dependent fields render `unknown`, never fabricated.
*Canonical copy:* off-state (Corpus Map): `The corpus map needs the platform's vector infrastructure — it isn't enabled yet. Your content and links are unaffected; the map lights up when it ships.` Fallback form: `clustering {n} seeds — lexical (corpus intelligence unavailable).` Field form: `coverage unknown.` Scoring form (radar): keyword-fallback stated on every affected card.
*Exercised:* 5.6, 6.3, 6.7, 8.5, 8.8 ([SA] keyword-fallback posture).

**DG-3 — DataForSEO unavailable** *(ask #2 pre-ship or tool failure; identical in both modes — a connection state, not a mode difference)*
*Trigger:* the platform keyword/SERP tools aren't available.
*Render:* seeds/keywords render with explicit no-data badges; rankings fall back with the fallback explained; numbers never invented.
*Canonical copy:* badge: `no keyword volume data.` Explanation: `ranked on corpus gaps and competitive signals — volume data unavailable.` Row form: `difficulty unavailable for {n} keywords.`
*Exercised:* 6.2, 6.3, 8.1's signal list, 8.11's scan scope line.

**DG-4 — Program registration interim** *(ask #8 pre-ship)*
*Trigger:* the Programs API isn't available; commits write `dm_calendar` only.
*Render:* the action succeeds with the difference stated, not hidden; semantics identical, registration deferred.
*Canonical copy:* `Committed to your calendar. Program registration isn't available yet — your plan runs identically; Marcus's Program view arrives when the platform ships it.`
*Exercised:* 6.6.

**DG-5 — Sentinel `blocked` / `flagged` rendering** *(integration decision A: Sentinel gates the publish boundary)*
*Trigger:* a Sentinel verdict on externally-bound content.
*Render:* the verdict verbatim, never paraphrased; `blocked` → edit-and-resubmit as the only path, **no override anywhere**; `flagged` → the logged-confirmation affordance with what confirming means, where the owning spec grants it (splits).
*Canonical copy:* the verdict itself, plus the path line: `Edit and resubmit — blocked content can't be overridden.` Flagged form (splits): `Confirming posts this anyway and logs your confirmation with the verdict.`
*Exercised:* 4.1, 4.2, 7.2 (paused jobs), 7.4, 7.5, 8.2.

**DG-6 — Approval pending** *(the P1 banner state)*
*Trigger:* a submitted decision awaits the platform approval system.
*Render:* the iris-tinted `--surface-accent` banner with the card's state and deep-link; the affected surface read-only-with-reason where the decision locks it; resolution is bidirectional (deciding in-app resolves the card and vice versa, ask #6a).
*Canonical copy:* `Awaiting decision — {approval_type} submitted {time}. View the card.`
*Exercised:* 4.2, 6.6, 7.3, 8.2 (submitted-and-pending), 8.14, 9.1 (the approvals tile routes, never decides).

**DG-7 — Platform connector absent** *(ask #11 posture: honest, no dead buttons)*
*Trigger:* a listed integration source isn't connected at the platform level.
*Render:* the source listed with its true state and the platform-level path; never a dead button, never hidden.
*Canonical copy:* `Available when {platform} is connected at the platform level.`
*Exercised:* 5.5, 5.6's connector shortcut (inverse case), 6.4's source states, 9.3's what-isn't-here note (the posture generalized).

*Resolved candidate:* the **sources-banner-first loading order** (8.1, 8.11) stays a stated character of scoring surfaces rather than becoming an eighth member or ninth law — it's a loading-order rule bound to surfaces whose populated content is composed scores; OV1's figures are owners' renderings, and its own loading order (decisions first) is declared in its entry.

## 11. The empty-state matrix

Every screen's `[SA]`/`[ACT]` posture in one table, harvested from §§4–9 — one row per registry entry, all forty-five. This is the audit view, the doc-system's signature requirement made checkable at a glance. Legend: **=** mode-identical by design, with the reason; **n/a** the entry's boundary state stands in for empty (designed, never faked); **→** routes with the dependency stated.

| Entry | [SA] empty | [ACT] empty |
|---|---|---|
| 9.1 OV1 App Home | First-hour onboarding: "Welcome to the lab" → trainer | Cortex-rich: strengths as ScoreFigures → first draft in minutes |
| 5.1 Trainer Home | "Let's learn your voice — 2 minutes to start" | "Voice arrived at {n}% from Kinetiks — two rounds push past 90" |
| 5.2 Scan Review | "What's your website?" + skip-to-paste | **=** (one provenance line when the domain came from Cortex Org) |
| 5.3 Refinement Round | Round picker framed as onboarding (round n of 3) | Round picker framed as targeted (the drift flag's prescription) |
| 5.4 Intake | Checklist at 0% + the why ("less generic drafts") | Checklist pre-filled from Cortex Products, provenance-tagged |
| 5.5 Listening | **=** — privacy posture + DG-7 connector states (standalone holds a Kinetiks ID; only which connectors are live varies) | **=** |
| 5.6 Customer Lexicon | Educational + paste CTA | + connector shortcut when sources are live |
| 5.7 Corrections Ledger | "Rules appear as you edit drafts" | + next-distillation timing when edit history exists |
| 6.1 Research Overview | "Start Discovery" + what-this-does framing | "{n} territories suggested — review them" (ScoreFigure) |
| 6.2 Discovery | First-principles conversation opener | Cortex-aware opener, every quoted field a P4 opener |
| 6.3 Keywords | **→** Discovery (no seeds included) | **→** same — the dependency is the same in both modes |
| 6.4 Opportunities | **=** — the four sources with per-source connect-state honesty (the states vary, the design doesn't) | **=** |
| 6.5 Architecture | **=** — unassigned clusters + suggest; truly-empty = territory ghosts | **=** |
| 6.6 Publishing Plan | **→** Architecture (nothing to sequence) | **→** same |
| 6.7 Corpus Map | **=** — territory centroids as ghost structure | **=** |
| 6.8 Link Sweep | **=** — "suggestions appear when new pieces publish" + post-import sweep CTA | **=** |
| 6.9 Campaigns | **=** — what campaigns change, with the example pair | **=** |
| 4.1 Draft Queue | "Generate your first" with the trainer-aware CTA fork | "{n} scheduled this week — first draft {weekday}" |
| 4.2 Editor | **=** — the brief rendered with Generate (the brief differs by mode; the room doesn't) | **=** |
| 4.3 Diff Review | **=** — "no differences" with comparison metadata | **=** |
| 4.4 Version History | **=** — "this is the original" | **=** |
| 4.5 Generation Theater | "Generate now" + context summary naming your training | Same, naming Cortex layers with confidence |
| 4.6 Image Review | **=** — no slots planned, with the outline's reasoning | **=** |
| 7.1 CMS Connections | **=** — provider picker (CMS is DM-owned in both modes) | **=** |
| 7.2 Publish Activity | **=** — "approved pieces publish from the editor" + connection state | **=** |
| 7.3 Live Status | **=** — publish-readiness summary (panel; pre-publish) | **=** |
| 7.4 Split Queue | **=** — published pieces as batch starts; posture stated | **=** |
| 7.5 Split Composer | **n/a** — ungenerated slot = the template's shape previewed | **n/a** |
| 7.6 Split Settings | **=** — seeded defaults stated as such | **=** |
| 8.1 Freshness Home | Signal list + source requirements | + first-scan date against the publish plan |
| 8.2 Refresh Review | **=** — the piece's problems + "Generate refresh" with cost/scope | **=** |
| 8.3 Freshness Panel | **=** — "the ledger begins at publish" (panel; pre-publish) | **=** |
| 8.4 Freshness Settings | **=** — seeded config + import cross-link | **=** |
| 8.5 Radar | Inert instrument + upgrade CTA naming the concrete gain | Quiet health line — "a quiet feed means a quiet week" |
| 8.6 Event Detail | **n/a** — boundary state = the expired event, read-only | **n/a** |
| 8.7 Radar Tuning | The would-be registration, inert + upgrade CTA | **→** Research ("define territories first") |
| 8.8 AIV Home | Bank CTA + keyword-fallback posture when applicable | Bank CTA with the cluster's ready imports counted |
| 8.9 Question Bank | **=** — the four sources inventoried with counts | **=** |
| 8.10 AIV Settings | **=** — seeded defaults + the Ask-14 engine boundary stated | **=** |
| 8.11 Performance Overview | Signal list + source requirements | "{n} pieces publish this month — first scores {date}" |
| 8.12 Performance Detail | **=** — "scores begin at publish" + readiness context | **=** |
| 8.13 Health Report | **=** — cadence, next date, contents-given-connections | **=** |
| 8.14 Quarterly Review | **=** — mid-quarter accumulation, explicitly not a report | **=** |
| 9.2 Generation Settings | **n/a** — pre-migration seeding progress | **n/a** |
| 9.3 App Settings | **n/a** — fresh-account defaults stated as defaults | **n/a** |

The audit this table enables, run on this draft: **every mode split is motivated** (onboard vs leverage-Cortex), **every `=` carries its reason** (DM-owned capability, shared dependency, or pre-publish boundary), and **every `n/a` has a designed boundary state** — no entry fell back to an unconsidered blank. Radar is the only hard split in the app (sensing is platform-owned); the trainer's near-identity across modes is the standalone-is-the-trainer principle made visible in a column.

## 12. Open items & write-backs

1. **`experience-architecture.md` reconciliation** — primitives, nav homes, and the Corpus Map / Link Sweep section home, when it lands.
2. **OV1 / ST1 ownership** — specced here in slice 6; reconcile with `dm-product-spec.md`'s narratives when written (the App Home orients around them).
3. **Behavioral deltas filed:** none in slices 1–2. Elaborations within spec scope, for the record: the queue's counts strip (4.1) and image-grid sanction (4.6); the trainer-home empty state rendering its strength figure as a ScoreFigure (5.1 — the receipt rule applied to empty-state claims); the refinement round's scope-attribution copy stating its routing consequence (5.3); S5's connector errors passed through unedited (5.5 — an explicitness the spec implies via "the platform's actionable message"). Any spec conflict found in later slices files as a write-back to the owning spec, never resolved silently here.
4. **DG-7 promoted by slice 2** — the connector-absence pattern (knowledge-trainer S5) is confirmed as a library member; S6's `coverage unknown` confirmed as a **DG-2** rendering (pgvector/corpus-intelligence unavailability), not a new member.
5. **Slice 3 confirmations:** DG-1 (Corpus Map traffic sizing, Architecture's live-performance evidence), DG-2 (Keywords' lexical-fallback statement, the Corpus Map's designed off-state), DG-3 (Discovery's no-volume badges + fallback-ranking explanation), and DG-4 (Publishing Plan's interim commit copy) all exercised — library holds at seven. Cross-ownership renderings noted for the record, no deltas: S1's radar tile (radar computes, research renders), S7's glow inputs (lifecycle/ai-visibility/radar compute, the map renders) — one owner per number, honored at the pixel level.
6. **Slice 4 confirmations:** DG-5 exercised three ways (the activity log's paused jobs, the splits queue's flagged rows, the composer's mark-ready consequences — verdicts verbatim everywhere, the splits surfaces additionally carrying the logged-confirmation affordance their spec grants); DG-6 in the Publishing Plan and Live Status pending states. Elaborations within scope: the empty activity log summarizing connection state (7.2 — the path to a first publish visible from the empty state); the composer's empty state previewing the template's shape before the spend (7.5). Library holds at seven.
7. **Slice 5 confirmations:** the two scoring homes (8.1, 8.11) share the sources-banner-first loading order — "honesty before numbers" is now a stated section character, candidate for promotion to a ninth state law if Overview (slice 6) needs it too. The panel shape proved twice (7.3, 8.3 — side-by-side mounts, one anatomy). Radar S2's empty state is the doc's first n/a-by-construction case, specced via its boundary state (the expired event) rather than faked. Per-engine isolation (8.8) and per-section report isolation (8.13, 8.14) are state law 3 at their finest grain. No new library members; no behavioral deltas.
8. **Slice 6 closures:** OV1 specced on the owns-no-numbers law (every tile a P4 deferral to its owner; the primary action computed in narrative priority order); ST1 specced as the honest remainder with the kill list rendered as the what-isn't-here note and the theme rule per design-language §2 (user-set standalone, host-following activated, read-only-with-reason). Two further n/a-by-construction empties handled via designed boundary states (9.2 pre-migration seeding, 9.3 fresh-account defaults). The sources-banner-first candidate resolved in §10: stays a scoring-surface character, not promoted. **The library is closed; the matrix audit passed** (§11's closing paragraph is the record). This doc is ready for approval; on approval, the archive pass and build-phase planning per doc-system §7 steps 7–8 can proceed against it.

---

## 13. Self-check

| Requirement | Source | Present |
|---|---|---|
| Every screen: purpose, narrative moment, primary action (one), data + evidence source, five states | doc-system §3.3 | §§4–9, all 45 entries; "none" stated where legal, never blank |
| Empty states mode-split: standalone onboards, activated leverages Cortex | doc-system §3.3 | Per entry + the §11 audit (every `=` reasoned, every `n/a` designed) |
| Full state copy lands here | knowledge-trainer §7, design-language §9 | Verbatim copy on every Empty and Failed state; intent + key lines elsewhere |
| Register + chrome mode declared per screen | design-language §11 Phase 2 | Every entry's header line |
| States via StateFrame; primitives P1–P4 named, no parallels | design-language §11 Phase 4 | Every entry; two boundary patterns named (n/a-by-construction ×4), zero new primitives |
| Connect-state empty states designed, not improvised | platform-asks #4 | §10 DG-1 (and the closed seven-member library) |
| Exactly one primary action per surface | design-language §11 Phase 5 | State law 5 + per-entry declarations |
| Build gate satisfiable | CLAUDE.md UX gating | Any build task can copy its entry whole; a missing field is a bug here |
| One owner per number | measurement §1, research §2.7 | Cross-ownership renderings logged (§12 items 5, 8); OV1's owns-no-numbers law |
| No ARCHIVE- material consumed | conversation authority chain | Header sources line; behavioral source is the v2 S-sections throughout |

**Reconciliation surface, restated:** `ux/experience-architecture.md` (primitives, nav homes, S7/S8 housing) and `dm-product-spec.md` (OV1's narratives, ST1's ownership) — §12 items 1–2. Everything else in this doc is decided.

---

*Dark Madder v2 — `ux/screen-system.md` — Complete draft · June 2026*
