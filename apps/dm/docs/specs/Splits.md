# Dark Madder — Splits

> **Spec:** `specs/splits.md` — subsystem spec 10 of 10 per `dark-madder-v2-doc-system.md` §7 (data-model follows as the union).
> **Date:** June 2026 · **Status:** Draft for approval
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > `platform-contract.md` and `dm-platform-integration.md` (binding at the app boundary — §3's tool descriptions, §4.4's `social_split` Sentinel point, §4.2's `dm_split_platforms` configuration entity and `split` entity type, and §8's `dm_splits_generated` definition are final there) > `ux/experience-architecture.md` (binding for surfaces; not yet written — primitives cited are the four from doc-system §3.3, to be reconciled) > `platform-asks.md` > this spec.
> **Sources consolidated:** ARCHIVE-Splits_Engine (entire — platforms, formats, voice adaptations, best practices, generation flow, queue, posting notes, cadence suggestions, quality standards), plus the two doc-system §3.4 additions: **Sentinel gating** before anything is marked ready, and **social card images** from generation's Image Engine. The v1 subreddit-monitoring aside (§5) is **deleted scope** — sensing is platform-owned; `community_spike` is an A4 event and radar attributes it. All superseded by this document for the territory it covers.
> **Depends on:** `specs/publishing.md` (splits generate from published pieces; publish-verification transition events are the D46 auto-split trigger). **Consumed from elsewhere:** generation's Image Engine and `dm_images` (§2.7 there — card slots fill through it; the Ask 12 amendment already names this spec as its second consumer), generation's `voice_audit` and craft tasks, the trainer's corrections-ledger injection contract (`content_type` already admits `split:<platform>` — pre-plumbed) and `dm_author_voice`, editor-review's edit-capture intake and checklist engine (two additive write-backs, §10), research's corpus retrieval (D47). **Binding inbound contracts implemented here:** radar §2.5's Reddit-answer invocation `{ thread_url, thread_language_excerpts, mapped_piece_id?, event_ref }`; radar §2.6.4's auto-queue on fast-track publish.
> **Decisions baked in (continuing the global series):** **D43** platform templates ship as **seeded data rows** (`dm_split_templates`) — structure, length ranges, hook rules, best-practice constraints, voice-stack weights, and card formats as versioned, user-editable, system-proposable configuration; splits stamp the template version that produced them (generation's D2, applied to the fastest-shifting content surface DM touches). **D44** authorship is a **generation-time selection, defaulting to the source piece's author attribution, stamped on the split**; with no author layer, the split generates from org voice with conversational adaptation and a visible flag (integration §9's "defaults, flagged," made concrete). **D45** Instagram carousels are **rendered slide images** through the Image Engine under the style profile and design-language R4; when image generation is unavailable, the split degrades to text-per-slide with design notes **as a stated partial state, never silently**. **D46** an **auto-split-on-publish toggle** (config, default off) generates the account's default platform set on publish verification; **fast-track publishes always auto-queue** (radar §2.6.4, carried verbatim — trend pieces earn their traffic from distribution). **D47** Reddit answers **without a mapped piece are corpus-retrieval-backed**: research §2.7's retrieval supplies the sourced claims with chunk provenance; when the corpus genuinely cannot support a helpful answer, the split is declined with that stated — never a thin promotional comment. **D48** quality standards run through **editor-review's single checklist engine** — a registered split item family plus `invocation: 'split'` (write-backs, §10); hard items block the ready transition. **D49** post-post tracking carries as **manual engagement notes** on posted splits, rendered on the queue and the piece view, and a **splits activity line joins the monthly health report** (write-back to measurement §2.8) — explicitly marked manual until the agent-communication layer delivers real distribution data into the same line.
> **Locked decisions honored:** one approval decision — splits originate no approvals; review is an in-app collaborative checkpoint and **the human posting manually is the external boundary**, which is why integration §5.2 carries no split approval type by design; Sentinel gates ready at that boundary (integration decision A, applied to the only externally-bound content that leaves by hand); zero analytics ingestion — engagement notes are user-entered observations, nothing is pulled; Cortex canonical — org hard rules win on every platform; split edits teach the one trainer through the one capture intake; platform-owned sensing — subreddit monitoring deleted into ask #3/radar; calendar as Program — cadence here is suggestion, never schedule; standalone-first — §8; single company per account — §6.

---

## 1. Purpose

Splits implement the repurposing flywheel: deep research once, adapted to every format. A published 3,000-word piece yields a LinkedIn post, a TikTok script, a Reddit answer, and an Instagram carousel — each platform-native, each in the right voice for that territory, each with its social card, none of them a summary. Dark Madder generates them, holds them to the craft bar, gates them through Sentinel, and hands the user copy-ready content with posting notes; the user posts. Four properties define it:

1. **Adaptation, never summarization.** Generation works from **extracted insights**, never the full piece — one powerful idea presented as standalone platform content. The split is useful even if the reader never clicks through.
2. **The right voice for the territory.** Reddit and TikTok are author-dominant; LinkedIn stacks author over org; Instagram keeps the org layer active. Org hard rules — banned phrases, emotional boundaries — win everywhere, on every platform, in every register (the locked Cortex-canonical order, applied at social scale).
3. **Externally bound means fully gated.** Every split passes the checklist's split family and a scoped voice audit; **Sentinel reviews before anything is marked ready** (`social_split`); ready is the promise that this content can leave the building. The human carrying it out the door is the one decision, and it stays human until the agent-communication layer earns the handoff.
4. **Platform truth is data.** Sweet-spot lengths, hook rules, link etiquette, hashtag mixes — the things that shift with every algorithm change — live in versioned template rows (D43), tunable through review, proposable from the org's own edit patterns, never buried in prompt strings.

---

## 2. Mechanism

### 2.1 Triggers (D46)

Four ways a split batch starts, one pipeline underneath:

| Trigger | Path | Notes |
|---|---|---|
| Manual | "Generate Splits" on any published (or approved) piece — queue, library, piece view | The v1 default posture, carried; platform subset selectable per batch |
| Marcus / Task | `dm_generate_splits` tool call | Drafting, never consequential; `correlation_id` rides the splits (integration §6.5) |
| Fast-track publish | Radar §2.6.4 — splits auto-queue on every fast-track publish | **Always on**, carried verbatim; the default platform set generates; `radar_event_id` rides |
| Auto-split on publish | Publish-verification success event (publishing §2.10's transition) with the account toggle on | Config, **default off**; gates cost and queue noise, not safety — checklist, audit, and Sentinel still gate ready |

One batch per piece at a time (the generation §2.1 idempotency instinct, scaled down): a second trigger attaches to the in-flight batch rather than duplicating it. The default platform set is the `dm_split_platforms` configuration entity (integration §4.2 — applied immediately for direct user commands, logged to the Ledger).

### 2.2 Platform templates as data (D43)

`dm_split_templates` ships seeded with the four v1 platforms, carrying their full v1 substance:

| Platform | Format | Length (seeded) | Structure (seeded) | Voice stack (seeded) |
|---|---|---|---|---|
| LinkedIn | Post (+ link card) | 800–1,500 chars | Hook line (pre-"see more") → 3–5 insight paragraphs → clear perspective (opinion, not summary) → discussion prompt (never generic) → 3–5 hashtags | author over org |
| TikTok | Script (voiceover + overlay notes) | 30–90s spoken (~75–200 words) | 2-second hook (line + screen text) → problem/misconception → the insight → payoff/CTA | author-dominant; org hard rules apply |
| Reddit | Answer | 200–500 words | Direct answer first → specific supporting detail → sourced claims with links → optional soft org reference, one of several resources | author only; no org branding |
| Instagram | Carousel (5–10 slides) or caption | 20–40 words/slide · 300–800 char caption | Hook slide (≤8 words) → one insight per slide → takeaway → save/follow CTA; caption: hook → context → 15–25 mixed-reach hashtags | org active |

Best-practice constraints ride each row as enforceable rules, not prose: LinkedIn body carries **no external links** (link-in-first-comment posting note generated instead), line breaks as formatting, opinion in the first two lines; TikTok jargon-free with overlay text per beat and visual-friendly points; Reddit complete-without-clicking, disclosure language when org content is linked, Reddit-markdown formatting, subreddit-culture adaptation; Instagram slides as standalone visual statements with forward pull, save-worthy design.

Templates are **user-editable through review** (versioned; rationale recorded) and **system-proposable**: the trainer's monthly deletion-pattern aggregate, which the ledger's `split:<platform>` content types make platform-aware ("you cut the hashtags in 8 of 9 LinkedIn splits"), produces template-adjustment proposals on S3 with the edit evidence attached — generation §2.2's loop, extended to social. Every split stamps `template_id` + `template_version`; "why is this shaped this way?" always resolves to a specific template state.

### 2.3 Voice stacking and authorship (D44)

The stack assembles per platform from the template's weights, in the locked order: **template platform guidance → author layer (`dm_author_voice`) at the template's dominance → Cortex Voice org hard rules — banned phrases, required patterns, emotional boundaries — always win** → corrections-ledger injection via the trainer's contract verbatim (top-N active rules by effectiveness × times_applied, filtered to the scope chain and `content_type: 'split:<platform>'`).

**Authorship (D44):** the batch carries an author selection — defaulting to the source piece's author attribution, switchable at generation time, stamped on every split (`author_user_id`). LinkedIn, TikTok, and Reddit are personal-brand territory; "post as Zack" versus "post as Maya" is a real choice and never a guess. **No author layer** (common early): the split generates from org voice with the template's conversational adaptation and carries the visible flag — "generated from org voice defaults; train an author profile to make this personal" — integration §9's standalone row, honored in every mode. The Cortex Voice layer version stamps the batch (the trainer's drift math reaches social too).

### 2.4 The generation flow

Per batch, persisted per stage (the `dm_generation_runs` discipline applied — resumable, cancellable, theater-rendered as P3):

1. **Insight extraction — once per piece per batch, shared across platforms.** A standard-tier pass identifies the 5–8 most compelling standalone insights, ranked by uniqueness × specificity × engagement potential, **each carrying its source-passage ref** (section and paragraph) — the provenance behind every later "where did this come from?" (P4).
2. **Per-platform adaptation** — one craft-tier call per selected platform, fed the **insights, never the full piece** (the structural guarantee against summarization), the template row, the assembled voice stack, and the ledger block. Each split develops one insight with a concrete data point or example and a clear perspective.
3. **Alternative hooks** — 2–3 per LinkedIn and TikTok split (craft tier; hooks are the highest-leverage element of social content); the user picks on S2; the choice is learning signal.
4. **Cards** — §2.7's slots fill in parallel (the generation stage-6 pattern: drafting never waits on image review; *resolution* gates ready).
5. **Audit and checklist** — §2.5. The batch lands in the queue as `draft`.

**Posting notes** generate with each split (fast tier, template-driven): suggested posting window, the link-in-first-comment instruction where the template demands it, subreddit suggestions with fit rationale (and the thread URL when radar-originated), carousel assembly notes when D45's degradation is active.

### 2.5 Quality: the checklist and the voice audit (D48)

**One checklist engine** (editor-review's, D9) gains a registered **split item family** and `invocation: 'split'` (write-backs, §10). The v1 §6 standards become registered items with evidence shapes:

| Item | Check | Severity |
|---|---|---|
| `no_brand_first` | Org/product unnamed in the first half | **Hard — blocks ready** |
| `banned_phrases` | Org hard rules, binary | **Hard** |
| `platform_conformance` | Length, structure, link etiquette, hashtag rules vs the template row | **Hard** |
| `standalone_value` | Useful without the click-through (model-assessed, evidence quoted) | Warning |
| `voice_match_floor` | Scoped audit composite ≥ template floor | Warning; hard below the template's must-fix floor |
| `disclosure_present` | Reddit, when org content is linked | **Hard** |
| `card_resolution` | Every planned card slot resolved (accepted / uploaded / waived) | **Hard — the generation §2.7 gate, applied to ready** |

**The voice audit** is generation's `voice_audit` task, scoped to the split with **per-platform expectations from the template row** — a TikTok script is *supposed* to break blog rhythm rules; the template says which dimensions relax and which never do (banned phrases never). The composite, breakdown, and violations persist on the split (P4 evidence; must-fix violations auto-rewrite through the craft path with the generation §2.4 cap of 3, surviving violations blocking as checklist items, never silently shipped).

### 2.6 The queue and the ready gate

The queue (S1) organizes by source piece × platform × status. The status spine:

```
generating → draft → ready → posted → archived
```

- **Review is an in-app collaborative checkpoint.** The user edits in S2 — **every substantive edit feeds editor-review's capture intake with `capture_surface: 'split_queue'`** (write-back, §10), classified by the trainer with the `split:<platform>` content type, so social edits teach the ledger exactly as draft and refresh edits do. Hook selection, slide reorders, and note edits are all capturable signal. Nothing leaves the system at this stage; no cards exist.
- **Mark ready** requires the checklist's hard items passing, then submits to Sentinel — `synapse.submitReview`, `content_type: 'social_split'` (integration §4.4; ask #9 interim: generic `blog_post`, the safe direction). `pass` → `ready`, recorded silently; `flagged` → explicit, logged user confirmation to proceed; `blocked` → stays `draft` with the verdict and the path forward rendered (edit and resubmit — **never override**). The `ready` transition is what `dm_splits_generated` counts (integration §8 — owned compute here, shipped by measurement's D22 reporter).
- **Copy-ready output:** the split body, the selected hook, the cards, and the posting notes — one copy action per artifact. DM does not post; the tool description already says so.
- **Mark posted** records `posted_at` and opens the engagement-notes field (§2.9). **Archive** retires without posting (a logged choice, optional reason — learning signal for template proposals).

### 2.7 Social cards (D45)

Card slots are planned per the template's `card_formats` and filled through **generation's Image Engine** (§2.7 there — this spec owns the slot plan and per-platform formats; generation owns the tasks, `dm_images`, the style profile, and the review loop):

- **LinkedIn:** one link/quote card (1200×627) — the post's insight as a typographic card under the style profile.
- **TikTok:** one cover frame (1080×1920) with the hook as overlay text.
- **Instagram (D45):** the carousel's slides render as **actual slide images** (1080×1080 or 1080×1350 per template) — templated text-on-brand-surface cards are precisely what a versioned style profile plus design-language **R4** exist for (R4 governs generated artifacts; Brand-empty defaults derive from its rules, never improvised). The per-slide review loop is generation's verbatim: accept / regenerate-with-notes / upload-own; `card_resolution` gates ready.
- **Degradation, stated:** when `image_generation_available` is false (generation's status feature), Instagram degrades to text-per-slide plus design notes (suggested layout, emphasis, palette refs), LinkedIn/TikTok cards waive — each rendered as the **partial state with the reason**, never a silent absence. Images stamp the style-profile version; "why does this card look like this?" resolves to profile + template.

### 2.8 Reddit answers (radar's contract, D47)

Radar's **Generate Reddit Answer** invokes this spec with the binding shape — `{ thread_url, thread_language_excerpts, mapped_piece_id?, event_ref }` — and this spec fills it:

- **Thread language injected:** the excerpts shape the answer's register and the specific question actually being asked; the subreddit's culture adaptation comes from the template plus a fit analysis (which subreddit norms apply, formatted accordingly).
- **Sourcing:** with `mapped_piece_id`, insights extract from that piece. **Without it (D47), research §2.7's corpus retrieval supplies the material** — the top relevant chunks become the sourced claims, with **chunk provenance rendered in the drawer** ("this answer draws on {piece} §3 and {piece} §1"). The v1 completeness law holds: the answer must be helpful without any click; an org link, when included, is one of several resources, with disclosure language per the template.
- **Declining honestly:** when retrieval returns nothing within the relevance threshold, the invocation returns a declined split with the reason stated on the radar event ("corpus can't support a substantive answer — nearest material: {piece}, distance {d}") — a thin promotional comment is worse than silence, and Reddit knows the difference.
- **Provenance end to end:** `radar_event_id` and the thread URL ride the split and the posting notes; radar's `response_refs` receive the split ids (its §2.7); Sentinel gates ready as on any split.

### 2.9 Posted, tracking, and the posting future (D49)

- **Engagement notes** are user-entered observations on posted splits — optional structured counts (likes, comments, shares) plus free text ("the contrarian hook drove 40 comments") — zero-ingestion by definition. They render on the queue row, the split detail, and the source piece's view.
- **The health report's splits line** (write-back to measurement §2.8, D49): splits generated / ready / posted per platform from queue transitions, with engagement notes surfaced as observations **explicitly marked manual** — never joined into scores, never proposal-grade on their own (measurement's D25 floor applies if they ever feed a comparison).
- **The posting future, designed for and not built:** the doc-system names the agent-communication layer as the direct-posting hook. The affordance is already here — `split` is a registered entity type, ready is Sentinel-gated, and the `posted` transition is an internal route a future executor can call with the same precondition (`status = 'ready'`). When that layer ships, posting becomes a consequential action with its own approval category, filed then as a write-back to integration §3/§5 — **not pre-built, not pre-assumed**, and the manual notes line is where its real data will land.

### 2.10 Cadence suggestions and cost controls

**Cadence is suggestion, never schedule** (the calendar-as-Program rule's social corollary): template-data-driven prompts render post-publish and on the queue — LinkedIn day-of plus 3–5 days later with a different hook; TikTok one script per piece, batchable; Instagram may lag a week; Reddit is **opportunistic only**, arriving exclusively through radar's `community_spike` attribution (the v1 monitoring aside is deleted scope — no DM watcher exists in any mode, on any schedule, under any pressure). The user decides when and what to post, always.

**Cost controls,** all config: one batch per piece at a time · insight extraction once per batch, shared across platforms · craft calls bounded by platforms selected · hooks capped at 3 · card generation bounded by the template's slots · the rewrite loop capped at 3 (generation's cap, inherited) · auto-split default off with the fast-track exception stated.

---

## 3. Tools exposed

Both tools of the `content_splits` capability — defined canonically in `dm-platform-integration.md` §3 (descriptions final there; restated for completeness):

| Tool | `isConsequential` / `autoApproveThreshold` | `surface` / `actionCategory` | Description (as shipped) | Returns |
|---|---|---|---|---|
| `dm_generate_splits` | `false` / `null` | `draft` / — | Generate platform-specific social splits from a published piece: insight extraction, per-platform voice stacking, alternative hooks, social card images. Splits enter the queue and are marked ready only after Sentinel review. Use when the user wants social content from a published article. | `{ split_ids, platforms, queue_url, status }` |
| `dm_get_split_queue` | `false` / `null` | `query` / — | Get the social split queue: ready and pending splits per platform with Sentinel verdicts and posting notes. Use when the user asks what social content is ready to post. | `{ splits: [{id, platform, source_piece, status, sentinel_verdict, hook_variants}] }` |

Generation is drafting, never consequential (contract §9.3); long batches return immediately and stream `CommandProgress`. **Mark-ready is not a tool:** ready is the Sentinel-gated human checkpoint at the external boundary, and an agent path to it would let enthusiasm outrun the one human in the loop — should a future Marcus flow genuinely need it, it gets filed as a write-back to integration §3, not added here ad hoc (the editor-review posture, applied). The radar Reddit-answer intake arrives as an internal invocation, not a tool. Internal routes (not agent tools): `/api/dm/splits/batches/*` (state, cancel, resume), `/api/dm/splits/{id}` (edit, hooks, cards, notes, ready, posted, archive), `/api/dm/splits/templates/*` (versioned changes through review), `/api/dm/splits/settings` (`dm_split_platforms`, auto-split toggle).

---

## 4. Cortex layers read and written

**Reads:** `voice` (the org layer's hard rules — binding on every platform at every register; layer version stamped per batch), `brand` (indirectly — the card style profile is generation's read; this spec consumes the profile, never the layer), `products` (light: integration-level semantics when an insight touches a product — `none/mention` discipline carries; Reddit never exceeds `mention`), `customers` (light: persona language sharpens hooks where it exists). Every read tolerates emptiness; degradations are §8's, stated, never errors.

**Writes: none — structurally.** Splits contain no `toProposal()` path. Everything social teaches flows through the one intake: queue edits → editor-review's capture (`split_queue`) → the trainer's classification with `split:<platform>` context → the trainer's aggregated proposals and template-adjustment proposals. One trainer, one capture stream, one proposal source per knowledge class — generation's §4 guarantee, restated here for the other end of the funnel. Split bodies, hooks, insights, and posting notes join the integration §4.1 blocklist as the safety net (§10); the design is that nothing here ever reaches a proposal constructor.

---

## 5. Approval touchpoints

**This subsystem originates no approvals** — and the absence is load-bearing: the human posting manually *is* the external boundary, so the queue checkpoint plus Sentinel is the complete gate, and integration §5.2's lack of a split approval type is the design, not a gap. The map:

| Moment | What happens | Owner |
|---|---|---|
| Batch generation | Drafting; no approval exists or is created | this spec |
| Queue review and edits | In-app collaborative checkpoint; edits captured to the learning loop | this spec / editor-review intake |
| Mark ready | Checklist hard items, then Sentinel `social_split` — `pass` silent, `flagged` requires logged confirmation, `blocked` stays draft with the path forward | this spec submits; Sentinel verdicts per integration §4.4 |
| Posting | A human act outside the system; `posted` is a recorded observation, not an execution | the user |
| Template changes | Versioned config through review (in-app); system proposals carry edit-pattern evidence | this spec (D43) |
| Future direct posting | A consequential action with its own category, filed as a write-back when the agent-communication layer ships — not pre-assumed | future write-back |

---

## 6. Data — Data Tables appendix

All tables `account_id`-scoped (`uuid not null references auth.users(id)`), **RLS mandatory** (`using (account_id = auth.uid())`), migrations sequential in the monorepo `supabase/migrations/`. SQL-sketch format for `specs/data-model.md` consolidation.

```sql
-- Platform templates as data (D43; seeded with the four v1 platforms)
create table dm_split_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  platform text not null check (platform in ('linkedin','tiktok','reddit','instagram')),
  version int not null default 1,
  format text not null,                  -- 'post' | 'script' | 'answer' | 'carousel' | 'caption'
  length_rules jsonb not null,           -- char/word/duration ranges
  structure jsonb not null,              -- ordered beats: hook, body, perspective, cta, hashtags…
  best_practices jsonb not null,         -- enforceable rules: link etiquette, disclosure, overlay notes…
  voice_stack jsonb not null,            -- layer dominance weights; relaxed/never-relaxed audit dimensions
  hook_rules jsonb,                      -- count, character of alternatives (linkedin, tiktok)
  card_formats jsonb,                    -- slots with dimensions per §2.7
  source text not null default 'seeded'
    check (source in ('seeded','user_edited','system_proposed')),
  rationale text,                        -- recorded on every version change
  active boolean not null default true,
  created_at timestamptz default now(),
  unique (account_id, platform, version)
);

-- Splits
create table dm_splits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  source_piece_id uuid,                  -- dm_pieces; null only for corpus-backed Reddit answers (D47)
  batch_id uuid not null,                -- one batch per piece per run; stage state lives per batch
  platform text not null check (platform in ('linkedin','tiktok','reddit','instagram')),
  template_id uuid not null references dm_split_templates(id),
  template_version int not null,
  author_user_id uuid,                   -- D44; null = org-voice defaults, flagged
  voice_layer_version int,               -- Cortex Voice version stamped at generation
  insights jsonb not null,               -- [{insight, source_passage_ref | corpus_chunk_refs}]
  content jsonb not null,                -- {body, hooks[], selected_hook, slides[], overlays[],
                                         --  hashtags[], subreddit_suggestions[]}
  posting_notes jsonb not null,
  card_image_ids uuid[],                 -- dm_images (generation-owned); slot states live there
  voice_match int,                       -- scoped audit composite
  checklist_result_id uuid,              -- dm_checklist_results, invocation 'split' (D48)
  status text not null default 'generating' check (status in
    ('generating','draft','ready','posted','archived','declined')),  -- 'declined': D47's honest no
  sentinel_review_id uuid,
  sentinel_verdict text check (sentinel_verdict in ('pass','flagged','blocked')),
  flagged_confirmation jsonb,            -- {user, at, note} when proceeding past 'flagged'
  radar_event_id uuid references dm_radar_events(id),
  reddit_context jsonb,                  -- {thread_url, excerpts, event_ref} — radar's contract, stored
  correlation_id uuid,                   -- integration §6.5
  engagement_notes jsonb,                -- D49: {counts?, notes, entered_at} — manual, marked as such
  posted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_dm_splits_queue on dm_splits (account_id, status, platform);
create index idx_dm_splits_piece on dm_splits (account_id, source_piece_id);
create index idx_dm_splits_batch on dm_splits (batch_id);
```

**Columns this spec contributes to shared tables** (canonical in `specs/data-model.md`): none — `dm_splits.correlation_id` is already named by integration §6.5; `dm_pieces` gains nothing. **Foreign data consumed, never owned:** `dm_images` (generation), `dm_checklist_results` and `dm_edits` (editor-review, with the §10 extensions), `dm_radar_events` (radar). **v1 tables that do not return** (for data-model's list): org-scoped `splits` and any split-queue/status sidecar (rebuilt account-scoped above, single-table).

---

## 7. Surfaces & Explainability

Primitives per doc-system §3.3 (reconcile with `ux/experience-architecture.md` when it lands): **P1** propose→review→approve · **P2** diff surface · **P3** generation theater · **P4** evidence drawer. No parallel primitives. Visuals per `dm-design-language.md`: queue rows on hairline-divided surfaces, not card grids; Sentinel and flag chips carry the only semantic color; generated cards render under **R4**, never product chrome.

### S1 — Split Queue

**Purpose:** the working surface — splits by source piece × platform × status, cadence suggestions, the ready/posted pipeline at a glance. **Narrative moment:** Tuesday morning's "the fast-track piece shipped — its splits are waiting"; Monday planning's distribution pass over last week's publishes. **Primary action:** review the oldest draft split; when none, act on the top cadence suggestion. **Primitives:** P3 (in-flight batches render as scoped theater: insights → platforms → hooks → cards, live per stage), P1 (template-adjustment proposals and cadence suggestions render as cards with evidence), P4 (every row opens its provenance: source insights with passage refs, template version, author stamp, voice composite, Sentinel verdict with reason, the radar event when one originated it).

**Five states:** *Empty* — no splits yet: "Turn published pieces into platform-native social content," with the account's published pieces listed as one-click batch starts; auto-split and fast-track posture stated. *Loading* — queue skeleton. *Populated* — as above; `flagged` rows carry the verdict chip and the confirm affordance; `declined` Reddit rows state D47's reason. *In-progress* — running batches inline as P3; per-platform completion staggers visibly. *Failed/partial* — per-platform failure isolated ("LinkedIn and Reddit generated; TikTok failed at the script stage — resume"), the batch resumable per stage, never all-or-nothing.

**Why:** "why is this ready/not ready?" → the checklist items with evidence and the Sentinel verdict verbatim; "why did this auto-generate?" → the trigger (fast-track event / toggle) with its ref; "why was this declined?" → the corpus-distance statement.

### S2 — Split Composer

**Purpose:** one split, fully workable — body editor, hook picker, slides and cards, posting notes, the checklist panel, the ready action. **Narrative moment:** the five minutes between "drafted" and "ready" where the user makes it theirs — every edit teaching the ledger. **Primary action:** select a hook and mark ready; when blocked, resolve the top hard item. **Primitives:** P1 (the mark-ready checkpoint with the checklist's state and the Sentinel step rendered as consequences-before-the-act), P3 (regeneration of a hook, a slide, or the body streams scoped — the theater at paragraph scale), P4 (every element opens its evidence: the insight behind the body with its source passage, each hook's rationale, each card's style-profile and template stamp, each checklist item's check and quote, the audit's per-dimension breakdown with the template's relaxations named).

**Five states:** *Empty* — a queued-but-ungenerated platform slot: the template's shape previewed, generate affordance. *Loading* — content skeleton. *Populated* — as above; the author stamp and the no-author flag render at the top when applicable. *In-progress* — scoped regeneration or card rendering live; the rest of the split sits still. *Failed* — stage failure with resume; card failure degrades per D45 with the partial state named; edits always preserved.

**Why:** "why this hook?" → its rationale and the alternatives kept; "why can't I mark ready?" → the hard items, each with its evidence and fix path; "why is this flagged?" → Sentinel's reason verbatim, with the logged-confirmation affordance and what confirming means.

### S3 — Split Settings & Templates

**Purpose:** `dm_split_platforms` (the default set), the auto-split toggle, and the template editor with versions and system proposals. **Narrative moment:** the monthly ritual's "the deletion patterns say tighten LinkedIn"; onboarding's "which platforms are yours?". **Primary action:** review the pending template proposal when one exists; otherwise none. **Primitives:** P1 (template proposals with the edit-pattern evidence; version changes through review), P2 (a template change renders as a diff against the active version), P4 (every template rule opens its provenance — seeded v1 best practice, user edit with rationale, or system proposal with the deletion aggregate; every version opens the splits it produced).

**Five states:** *Empty* — seeded defaults active, stated as such ("the four platforms ship with current best practices — edit anything"); *Loading* — form skeleton; *Populated* — platform toggles, auto-split toggle with its cost note, template list with versions and pending proposals; *In-progress* — a template change pending review, banner; *Failed* — config load failure with retry; the active versions always render from their stamps.

**Why:** "why does LinkedIn cap at 1,500?" → the template rule and its provenance; "why did the system propose this?" → the deletion aggregate, counts and examples.

---

## 8. Standalone mode

Fully functional — integration §9, verbatim: Sentinel runs in both modes (account-scoped, never orchestration-gated); voice stacking uses defaults, flagged. Exact empty-Cortex behavior:

- **Voice:** empty org layer → splits generate against documented defaults with the `untrained_voice`-class flag; no author layer → D44's org-voice flag; both flags render on the split and the queue row, and the trainer CTA is one click away. Banned-phrase enforcement is simply empty until rules exist — never faked.
- **Brand empty:** cards render under the style profile's documented defaults (R4's derivation), each stamped "derived from defaults — train your Brand layer to make this yours" (generation §2.7's line, inherited).
- **Radar absent** (ask #3 not live / no events): the Reddit path simply has no opportunistic intake — manual Reddit splits from a piece still work; the queue states that opportunistic answers arrive via intelligence events.
- **Programs absent:** nothing changes — cadence was never a schedule; auto-split rides publishing's own transition events, which exist in standalone.
- **Upgrade:** nothing migrates because nothing was siloed — templates, splits, and notes are account-scoped from day one; connected mode adds Marcus invocation, `correlation_id` provenance, and the report line's central rendering.

---

## 9. Model/task mapping (`@kinetiks/ai` configuration)

| Task key | Tier | Thinking budget | Used in |
|---|---|---|---|
| `split_insight_extraction` | standard | — | §2.4.1 — once per batch, shared; ranked, passage-ref'd |
| `split_generation` | **craft** | medium | §2.4.2 — externally-bound brand voice; the per-platform adaptation |
| `split_hook_generation` | **craft** | medium | §2.4.3 — the highest-leverage element earns the craft bar |
| `subreddit_fit_analysis` | standard | — | §2.8 — culture and format adaptation; fit rationale |
| `posting_note_framing` | fast | — | §2.4 — template-driven; never invents platform rules |
| *consumed, not owned:* `voice_audit`, `section_rewrite` (the must-fix loop) | craft per generation §9 | | §2.5 — scoped to the split with template relaxations |
| *consumed, not owned:* `image_concept_generation`, `image_generation`, `alt_text_generation` | per generation §9 / Ask 12 routing | | §2.7 — cards through the Image Engine |
| *consumed, not owned:* `standalone_value` check | per editor-review's item registry | | §2.5 — the checklist engine runs it |

Fallback discipline per generation §9: craft retries 3× with backoff, **no downward fallback ever**; standard falls back up; fast to standard; exhausted retries fail the platform's stage loudly and resumably (S1's partial state). Cost controls are §2.10's.

---

## 10. Platform dependencies and write-backs

**Existing asks this spec depends on:** **#9** (Sentinel `social_split`; interim: generic `blog_post`, the safe direction, stated on the verdict chip), **#7** (Author in Cortex — flag for future; `dm_author_voice` is the dm-private present, D44 built on it), **#3** (indirectly — the Reddit opportunistic intake arrives only through radar's attribution of A4 `community_spike` events; absent it, the path is honestly dormant), **#12 as amended by generation** (image routing — this spec is the amendment's named second consumer; interim: generation's `IMAGE_CONFIG`, invisible here), **#8** (nothing required — cadence is suggestion; stated for completeness).

**No new platform asks.** The agent-communication direct-posting hook is deliberately **not** filed: the layer's own spec owns that timeline, and this spec's contribution is the ready-gated `posted` transition designed to receive it (§2.9) plus the commitment that posting-as-execution arrives as a future write-back to integration §3/§5 with its own consequential category — never assumed early.

**Write-back flags (filed, not silently applied):**
1. `specs/editor-review.md` §2.3 / `dm_edits`: additive — `capture_surface` gains `'split_queue'` (the `'refresh_diff'` precedent, third surface; the reconciler and no-double-count rule apply unchanged).
2. `specs/editor-review.md` §2.4 / `dm_checklist_results`: additive — `invocation` gains `'split'`, and the split item family (§2.5's table) registers in the item registry with evidence shapes and severities.
3. `specs/measurement.md` §2.8: additive — the splits activity line (D49): generated/ready/posted per platform from queue transitions; engagement notes as observations, explicitly marked manual.
4. `dm-platform-integration.md` §4.1: additive blocklist entries — `split_body`, `split_hooks`, `split_insights`, `posting_notes` (§4's safety net).
5. `specs/radar-response.md` §2.5: a confirming cross-reference — the Reddit-answer contract is implemented here as specified, with D47's corpus-backed and declined behaviors as the optional-piece semantics (no shape change; clarification only).

---

## 11. Self-check

| Mandatory section | Present |
|---|---|
| Purpose | §1 |
| Mechanism | §2 |
| Data (dm_* tables, SQL-sketch Data Tables appendix) | §6 |
| Tools exposed (names, consequential flags, Marcus-grade descriptions) | §3 (both capability tools; mark-ready deliberately not a tool, with the future path filed-not-assumed) |
| Cortex layers read/written, proposal shapes, evidence requirements | §4 (reads enumerated; writes: none, structurally — no proposal shapes exist by design; blocklist additions filed) |
| Approval touchpoints and types | §5 (none originated; the absence stated as design — the human posting is the boundary) |
| Surfaces & Explainability (screens, five states each, evidence, "why", canonical primitives only) | §7 (S1–S3; P1–P4 only) |
| Standalone mode (exact empty-Cortex behavior) | §8 |
| Model/task mapping via `@kinetiks/ai` | §9 |

**Locked decisions:** one approval decision — zero approvals originated; review is an in-app checkpoint; Sentinel gates the external boundary; no second decision surface exists — §2.6, §5 ✓ · zero analytics ingestion — engagement notes are user-entered observations; no social API pulls exist in any mode — §2.9 ✓ · Cortex canonical — org hard rules win on every platform; no writes; the blocklist is the safety net, the absent constructor is the design — §2.3, §4 ✓ · platform-owned sensing — subreddit monitoring is deleted scope; the only opportunistic intake is radar's attribution of platform events — §2.8, §2.10 ✓ · calendar as Program — cadence is suggestion, never schedule or mutation — §2.10 ✓ · standalone-first — fully functional, Sentinel both modes, defaults flagged — §8 ✓ · single company per account — §6 account-scoped throughout ✓.
**No surface without five states** — S1–S3 ✓. **No invented primitives** — P1–P4 only ✓. **New platform dependencies:** none assumed; none filed (the direct-posting future explicitly deferred to its owning spec, the receiving affordance designed) ✓. **Changes to approved/earlier docs flagged for write-back, not silently applied** — §10 (five flags) ✓. **Binding contracts honored from this side:** radar's Reddit-answer shape implemented verbatim with D47's optional-piece semantics · radar's fast-track auto-queue carried (always on) · integration's tool descriptions, `social_split` Sentinel point, `dm_split_platforms` entity, and `dm_splits_generated` definition restated, never redefined · `dm_splits_generated` computed here (ready transitions), shipped by measurement's D22 reporter · the trainer's `split:<platform>` ledger context consumed through the one capture intake · generation's Image Engine, audit, and rewrite path consumed with template relaxations, never forked ✓.

---

*Dark Madder v2 — specs/splits.md — June 2026*
