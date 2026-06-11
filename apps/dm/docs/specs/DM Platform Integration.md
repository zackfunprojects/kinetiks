# Dark Madder - Platform Integration

> **CANONICAL. This document is the authoritative mapping of Dark Madder onto the Kinetiks platform.**
> **Date:** June 2026
> **Authority:** `dm-product-spec.md` wins conflicts about what DM is and does. `platform-contract.md` is binding for everything in this document. Where this document and a subsystem spec disagree about a platform boundary, this document wins.
> **Platform corpus implemented here:** `platform-contract.md` (binding), `kinetiks-product-spec-v3.md` §13, `kinetiks-core-architecture-v2.md`, `approval-system-spec.md`, `cross-app-command-router-spec.md`, `programs-spec.md`, `autopilot-spec.md`, `analytics-goals-engine-spec.md`, `agent-communication-layer-spec.md`, `marcus-engine-v2-plan.md` (F2 changelog), `collaborative-workspace-spec.md`.
> **Locked decisions baked in:** single company per account, no DM-internal multi-org. Cortex is canonical for voice/products/customers/competitive; DM is the trainer; corrections ledger and author voice stay dm-private. Zero analytics ingestion in DM. Sensing is platform-owned (A4); DM owns the response. One approval decision, deep-linked both ways. The content calendar registers as a Kinetiks Program. Standalone-first.
> **Architecture decisions made in this document:** (A) DM gates run pre-submission, platform brand and quality gates run at submission, Sentinel gates the publish boundary. (B) Every consequential tool ships `autoApproveThreshold: null`; runtime autonomy is governed by per-category approval thresholds. (C) `tools.ts` is the single source of truth for DM's capability surface; the Synapse command handler and capability registration are generated from it. (D) Metric keys follow the contract (`dm_` prefix); DM reports app-produced metrics only.

---

## 1. Purpose and Authority

Every way Dark Madder touches the Kinetiks core is defined here: the manifest Marcus reads, the tools agents call, the Synapse surfaces (context, proposals, commands, routing events, metrics, Sentinel), the approval integration, the Programs mapping, verification, and standalone behavior. Subsystem specs in `specs/` describe DM's internal machinery; when that machinery crosses the app boundary, it crosses through a surface defined in this document.

Anything in DM that duplicates a platform capability is deleted, not ported. The kill list from the doc-system plan stands: no auth pages, no org tenancy, no analytics ingestion, no SEO API connection management, no competitor watchers, no billing, no app switcher, no notification infrastructure, no second learning ledger.

Two conventions used throughout:

- **"Connected mode"** means the account has activated Dark Madder from Kinetiks (or upgraded). **"Standalone mode"** means the user signed up at dm.kinetiks.ai; a Kinetiks ID and Context Structure exist, but the orchestration layer (central approval queue, Programs, Marcus, Autopilot, agent communication) is not unlocked.
- Section 11 closes the document with a line-by-line self-check against the platform contract §10 checklist and product spec v3 §13.1.

---

## 2. Manifest

`apps/dm/src/manifest.ts`. The capability descriptions below are final. They are written for Marcus per contract §3.3, and they matter more than usual prose: Marcus v2 injects tool and capability descriptions verbatim into the pre-analysis brief adjacent to the user's question, and its tool decision is a single pre-decided pick. A description that is vague about what is returned or when to use it means Marcus picks wrong or not at all.

```typescript
import type { KineticsAppManifest } from '@kinetiks/types';

export const manifest: KineticsAppManifest = {
  key: 'dark_madder',
  prefix: 'dm',
  display: {
    name: 'Dark Madder',
    tagline: 'Content engine',
    description: 'Elite long-form content: research, generation in your voice, publishing, and continuous improvement.',
    color: '#8B1A1A',
    icon: 'flask-conical',
  },
  url: 'https://dm.kinetiks.ai',

  context: {
    readLayers: ['org', 'products', 'voice', 'customers', 'narrative', 'competitive', 'market', 'brand'],
    writeLayers: ['voice', 'products', 'customers', 'competitive', 'narrative'],
  },

  capabilities: [
    {
      key: 'content_research',
      description: 'Discover the topics this business has authority to own, build keyword clusters around them, map a hub-and-spoke content architecture, and propose a publishing calendar. Returns territories, clusters with keyword and difficulty data, opportunity rankings, and calendar proposals. Use this when the user asks what content to create, which topics to target, where content gaps or opportunities are, or wants a content plan or calendar. Requires org and products context; results improve with customers and competitive layers populated.',
      commands: ['dm_run_discovery', 'dm_get_architecture', 'dm_propose_calendar'],
      requiredContext: ['org', 'products'],
    },
    {
      key: 'content_generation',
      description: 'Generate publish-ready long-form drafts (blog posts, guides, playbooks) in the calibrated brand voice, with craft-level quality enforcement: per-section voice briefs, transition and voice audits with composite scoring, resolved images, and metadata. Returns a draft with voice-match score, audit evidence, and a review link; drafting never publishes anything. Use this when the user asks to write, draft, or create an article or long-form piece, or to regenerate a section of an existing draft. Requires voice and products context; an empty voice layer produces a draft flagged for voice training first.',
      commands: ['dm_draft_article', 'dm_regenerate_section', 'dm_get_draft_status'],
      requiredContext: ['voice', 'products'],
    },
    {
      key: 'content_publishing',
      description: 'Publish approved content to the connected CMS with schema markup, and push updates or metadata changes to already-published pieces. Returns the live URL, publish status, and post-publish verification results. Every call is consequential and goes through the approval system; nothing goes live without an approved card or an explicit user approval in the DM editor. Use this when the user asks to publish, update, or fix a live piece. Requires a connected CMS (reported by the status endpoint), not a Cortex layer.',
      commands: ['dm_publish_article', 'dm_update_article'],
      requiredContext: [],
    },
    {
      key: 'content_freshness',
      description: 'Scan published pieces for content decay and stale claims (dated statistics, superseded facts, competitor movement against a piece), and generate complete refresh drafts as reviewable diffs through the standard approval path. Scanning returns a freshness score per piece with named, evidenced problems; proposing a refresh returns a diff awaiting review, never an auto-applied change. Use this when the user asks what content is stale, wants published content updated or improved, or when an intelligence event indicates a piece is under pressure.',
      commands: ['dm_scan_freshness', 'dm_propose_refresh'],
      requiredContext: [],
    },
    {
      key: 'content_performance',
      description: 'Report content performance computed from platform integration data (GA4, GSC, DataForSEO) joined with DM production data: cluster health, topical authority, piece-level trajectory, and AI engine citation share of voice versus competitors with probe transcripts as evidence. Returns scored, evidence-backed metrics, not raw analytics. Use this when the user asks how content is performing, whether content drives results, how topical authority is trending, or how often AI engines cite them. Degrades gracefully and says so when GA4/GSC are not connected.',
      commands: ['dm_get_content_performance', 'dm_get_ai_visibility'],
      requiredContext: [],
    },
    {
      key: 'content_splits',
      description: 'Decompose published long-form pieces into platform-specific social content (LinkedIn, TikTok, Reddit, Instagram) with platform-voice stacking, alternative hooks, social card images, and posting notes. Returns a queue of ready-to-post splits; splits are marked ready only after Sentinel review, and DM does not post them directly (copy-to-clipboard until the agent communication layer supports direct posting). Use this when the user asks to turn an article into social posts, promote a published piece, or fill a social queue from existing content. Requires voice context.',
      commands: ['dm_generate_splits', 'dm_get_split_queue'],
      requiredContext: ['voice'],
    },
  ],

  statusEndpoint: '/api/dm/status',
};
```

`GET /api/dm/status` returns `{ healthy, version, features }` where `features` includes the dynamic facts agents need before choosing a tool: `cms_connected`, `cms_provider`, `pgvector_enabled`, `dataforseo_available`, `pieces_published_count`. Marcus's manifest builder reads this to populate connection awareness, which is what keeps Marcus from promising a publish when no CMS is connected.

---

## 3. Tool Surface

`apps/dm/src/tools.ts`. One `AgentTool[]` array, registered via `registerAppTools('dark_madder', darkMadderTools)`. Naming is `dm_<verb>_<noun>` per contract §3.2. Per decision C, this file is the single source of truth: the Synapse command handler (§4.2) and the `SynapseCapabilities` registration are generated from the metadata here, so a tool added here is automatically callable by Marcus, the command router, and the Autopilot's Task executor with no second definition.

Each tool carries two pieces of DM-local metadata beyond the contract type: `surface` (`query` | `draft` | `consequential`), used to generate the capability registration, and `actionCategory`, used when submitting approvals (§5.3).

### 3.1 Read-only tools (`isConsequential: false`, `autoApproveThreshold: null`)

| Tool | Description (as shipped, written for LLM consumption) | Returns |
|---|---|---|
| `dm_run_discovery` | Run content discovery: derive authority territories from Cortex (products, customers, competitive, market) plus mined customer language, and score them. Use when the user wants to know what topics to own or to start a content strategy. Long-running; returns a discovery id and streams progress. | `{ discovery_id, territories: [{name, rationale, evidence, score}], status }` |
| `dm_get_architecture` | Get the current content architecture: clusters, hub-and-spoke structure, keyword data per cluster, cluster health, and gaps. Use when the user asks about content structure, coverage, or what exists versus what is planned. | `{ clusters: [{id, name, hub, spokes, keywords, health, gaps}], summary }` |
| `dm_get_draft_status` | Get pipeline status for one draft or all in-flight drafts: stage (outline, sections, transitions, voice audit, metadata), voice-match score so far, blockers, and review link. Use when the user asks whether a draft is ready or what generation is doing. | `{ drafts: [{piece_id, title, stage, progress, voice_match, blockers, review_url}] }` |
| `dm_scan_freshness` | Scan published pieces for decay and stale claims using publish-date signals, claim extraction, and platform GSC/SERP data where connected. Returns scores and named, evidenced problems per piece; takes no action. Use when the user asks what content is stale or before proposing refreshes. | `{ pieces: [{piece_id, title, freshness_score, problems: [{claim, why_stale, evidence}]}], summary }` |
| `dm_get_content_performance` | Get content performance: cluster health, topical authority trend, and piece trajectories, computed from platform integration tools and Oracle insights joined with DM production data. States explicitly which sources were available. Use for any question about whether content is working. | `{ clusters: [...], authority: {score, trend}, pieces: [...], sources_used, gaps }` |
| `dm_get_ai_visibility` | Get AI engine citation share of voice: per-cluster question sets, which engines cite the org versus competitors, and probe transcripts as evidence. Use when the user asks about AI visibility, ChatGPT/Perplexity citations, or share of voice in AI answers. | `{ clusters: [{cluster_id, share_of_voice, vs_competitors, uncited_questions}], probes_url }` |
| `dm_get_split_queue` | Get the social split queue: ready and pending splits per platform with Sentinel verdicts and posting notes. Use when the user asks what social content is ready to post. | `{ splits: [{id, platform, source_piece, status, sentinel_verdict, hook_variants}] }` |

### 3.2 Drafting tools (`isConsequential: false`, `autoApproveThreshold: null`)

Per contract §9.3, generating drafts is never consequential; nothing leaves the system. All four return work products that terminate in the editor or a queue, never in the world.

| Tool | Description (as shipped) | Returns |
|---|---|---|
| `dm_draft_article` | Generate a complete long-form draft for a brief, cluster slot, or topic, in the calibrated brand voice with the full craft pipeline (outline, per-section generation with voice briefs, transition audit, voice audit with auto-rewrite, images, metadata). Returns a draft in the review queue, never a published piece. Use when the user asks to write or draft an article; pass a topic or a brief id. Five-minute-scale operation; returns a piece id immediately and streams stage progress. | `{ piece_id, status: 'generating', stages, review_url }` |
| `dm_regenerate_section` | Regenerate one section of an existing draft with optional direction (tone, angle, length). The rest of the draft is untouched; the voice audit re-runs on the result. Use when the user wants one part of a draft redone rather than the whole piece. | `{ piece_id, section_id, status, voice_match }` |
| `dm_propose_refresh` | Generate a complete refresh draft for a stale published piece as a reviewable diff: every change shown against the live version, each tied to a named problem from the freshness scan. Returns a diff awaiting review; publishing the refresh is a separate consequential action. Use after `dm_scan_freshness`, or when an intelligence event warrants updating a piece. | `{ refresh_id, piece_id, diff_url, problems_addressed, status: 'pending_review' }` |
| `dm_generate_splits` | Generate platform-specific social splits from a published piece: insight extraction, per-platform voice stacking, alternative hooks, social card images. Splits enter the queue and are marked ready only after Sentinel review. Use when the user wants social content from a published article. | `{ split_ids, platforms, queue_url, status }` |

### 3.3 Consequential tools (`isConsequential: true`, `autoApproveThreshold: null`)

Per decision B, every consequential tool ships with `autoApproveThreshold: null` in code. Autonomy is not a per-tool constant; it is governed at runtime by the approval system's per-category thresholds (§5.3), which calibrate with evidence and contract under failure. Hardcoding a number here would freeze a judgment the platform is designed to learn.

| Tool | Description (as shipped) | actionCategory | Returns |
|---|---|---|---|
| `dm_publish_article` | Publish an approved draft to the connected CMS with schema markup. Always consequential: creates an approval (or executes an existing approval decision) and only then pushes to the CMS; post-publish verification runs automatically. Use when the user asks to publish a specific approved draft. Fails with a clear reason if no CMS is connected or the draft has unresolved gates. | `dm_content_publish` | `{ piece_id, approval_id?, live_url?, verification, status }` |
| `dm_update_article` | Push changes to an already-published piece: an approved refresh diff, or a metadata-only change (title tag, description, canonical, schema). Always consequential. The approval type depends on scope: refresh diffs are review approvals, metadata-only changes are quick approvals. Use for any change to live content. | `dm_content_refresh_publish` or `dm_content_metadata_update` (by change scope) | `{ piece_id, change_scope, approval_id?, live_url, verification, status }` |
| `dm_propose_calendar` | Propose creating or changing the content publishing calendar, which is registered as the account's content Program (clusters as Workflows, pieces as Tasks). Always a strategic approval: it changes direction and affects many future outputs. Use when the user wants to commit a publishing plan, change cadence, or restructure the calendar. Returns the proposal and its approval id; nothing changes until approved. | `dm_program_change` | `{ proposal_id, approval_id, program_id?, summary, status: 'pending_approval' }` |

### 3.4 Tool return discipline

All tools return structured data agents can reason about (contract §3.5): never `{ success: true }`, always ids, scores, evidence pointers, and a summary. Long-running tools (`dm_run_discovery`, `dm_draft_article`) return immediately with an id and stream progress through the command channel (`CommandProgress`, command router spec §7.1), which Marcus renders as generation theater in chat. Errors return actionable messages (`"No CMS connected. Connect Framer in Dark Madder settings."`), never raw API errors.

---

## 4. Synapse Surface

DM's Synapse is the membrane for five flows: context pulls, proposals, commands, routing events, and metric reports, plus Sentinel submission. The preset lives at `packages/synapse/src/presets/dark-madder.ts`, replacing the v1 stub.

### 4.1 Preset: layers, proposal filter, proposal shapes

```typescript
import type { SynapseConfig } from '../types';

export const darkMadderPreset: Partial<SynapseConfig> = {
  appName: 'dark_madder',
  baseUrl: process.env.KINETIKS_ID_URL || 'https://kinetiks.ai',
  readLayers: ['org', 'products', 'voice', 'customers', 'narrative', 'competitive', 'market', 'brand'],
  writeLayers: ['voice', 'products', 'customers', 'competitive', 'narrative'],

  filterProposal: (data) => {
    // Operational data and dm-private intelligence never become Cortex proposals.
    const BLOCKED_KEYS = new Set([
      // operational
      'draft_body', 'section_content', 'edit_diff', 'generation_prompt',
      'pipeline_state', 'outline', 'image_prompt', 'cms_payload', 'cms_credentials',
      // dm-private by locked decision
      'correction', 'corrections_ledger', 'author_voice', 'refinement_round',
      'lexicon_internal', 'probe_transcript',
    ]);
    const hasBlocked = Object.keys(data).some((k) => BLOCKED_KEYS.has(k));
    if (hasBlocked) return { shouldPropose: false };
    return { shouldPropose: true, proposal: buildDmProposal(data) };
  },

  handleRoutingEvent: async (event) => { /* §4.3 */ },
};
```

Proposal rules per contract §2.2 apply without exception: declared write layers only, additive to arrays, never overwrite scalars, evidence mandatory. What DM proposes, per layer:

| Layer | Proposal content | Originating subsystem | Typical evidence |
|---|---|---|---|
| `voice` | Tone calibration adjustments, new messaging patterns, vocabulary additions, drift recalibrations | Trainer refinement rounds; learning loop edit analysis; voice drift detection | Refinement transcripts, edit-pattern counts ("user softened CTA in 9 of 11 drafts"), drift scores |
| `products` | Depth enrichment per the extended Products schema (problem dimensions, mechanism steps, personas, objections with honest answers, terminology) | Trainer document upload and guided intake | Source document excerpts, website scan passages, user confirmations |
| `customers` | Persona enrichments, mined customer-language themes (always post-redaction) | Customer language mining (redaction pipeline is non-optional) | Redacted source excerpts, frequency counts |
| `competitive` | New competitors, competitor content strategies, positioning observations | Discovery; radar response context | Competitor URLs, content analyses, SERP evidence |
| `narrative` | Validated angles, story elements that perform | Measurement; trainer | Performance comparisons by angle |

The corrections ledger, author voice layer, refinement history, and content-craft lexicon views are dm-private (`dm_*` tables) and are structurally unreachable by the proposal path: the blocklist is the safety net, not the design. The design is that proposal construction only ever reads from the trainer and learning-loop modules' explicit `toProposal()` outputs.

### 4.2 Command handler and capability registration (generated from tools.ts)

Per decision C, DM implements the command router's `SynapseCommandHandler` as a thin adapter over the tool registry. Operation names are tool names. There is exactly one definition of what DM can do.

```typescript
// apps/dm/src/synapse.ts (shape; generation logic in @kinetiks/synapse once the
// command-handler template ships - see platform-asks #10)

export const dmCommandHandler: SynapseCommandHandler = {
  async handleCommand(command) {
    const tool = darkMadderTools.find((t) => t.name === command.operation);
    if (!tool) return failure(command, `Unknown operation ${command.operation}`);
    // Consequential tools are not executed here; they submit an approval and
    // return status 'pending_approval' with the ApprovalSubmission attached (§5.4).
    return executeAsCommand(tool, command);
  },
  getCapabilities: () => generateCapabilities(darkMadderTools),
  ping: async () => (await fetch('/api/dm/status')).ok,
};

// generateCapabilities maps tool metadata -> SynapseCapabilities:
//   queries        = tools with surface 'query'
//   actions        = tools with surface 'draft' | 'consequential'
//   configurations = ['dm_cms_connection', 'dm_publishing_schedule', 'dm_split_platforms']
//   entity_types   = ['piece', 'cluster', 'brief', 'refresh_diff', 'split', 'calendar', 'territory']
```

Configuration operations are the only handler entries not in `tools.ts`, because they are app-settings mutations with no agent-facing value outside direct user commands ("pause publishing", "connect Framer" is OAuth and stays human). They are applied immediately for direct user commands per command-router spec §2.3 and logged to the Ledger.

The dispatch channel is `synapse:dark_madder:{account_id}` over Supabase Realtime, with the HTTP fallback at `POST /api/dm/synapse/command`. Tasks from the Autopilot arrive through this same handler (programs-spec §8.3): a Task's `SynapseCommand` is indistinguishable from a Marcus-originated one except for `correlation_id`, which DM persists (§6.5).

### 4.3 handleRoutingEvent

DM consumes routed intelligence; it never ingests raw feeds. Concrete handled events:

1. **Cross-app learning** (`type: 'cross_app_learning'`, e.g. Harvest: "security messaging resonates with fintech buyers"). Stored as a research signal (`dm_research_signals`); Discovery weights matching territories and the signal appears in the evidence drawer of any cluster it influenced. Never triggers generation by itself.
2. **Oracle insight with suggested action** (`suggested_action.app === 'dark_madder'`, e.g. "developer-tools content converts 3.2x; recommend a follow-up series"). Surfaces as a proposed brief in the research Opportunities surface with the Oracle evidence attached. Accepting it follows the normal brief, then draft, then approval path; the insight id rides along for attribution.
3. **Intelligence feed event** (A4 agents: `competitor_published`, `news_story`, `keyword_spike`, `community_spike`). Handed to radar-response relevance scoring against the org's territories and clusters. Above threshold it appears in the Radar surface with one-click responses (refresh, outwrite, fast-track). Below threshold it is logged only. Event shapes and subscriptions are platform-asks #3.
4. **Cortex layer updated** (`layer: 'voice'` recalibrated, or `products` enriched). In-flight drafts are flagged for voice re-audit; the editor shows "Voice layer changed since this draft was generated" with a re-audit action. Nothing regenerates silently.
5. **Sentinel-tagged brief routing** (Marcus F2: routing events carrying `sentinel_verdict` and `sentinel_review_id` on content briefs routed to DM). The review surface displays the verdict inline; `held` briefs require explicit user acknowledgment before generation proceeds.

Unknown event types are logged and dropped, never errored: forward compatibility with future agents is free.

### 4.4 Sentinel submission points

Per decision A, Sentinel gates the external boundary, not the approval queue. DM submits to `synapse.submitReview` at exactly three points: before a publish executes (`content_type: 'published_article'`), before a refresh executes (`content_type: 'article_refresh_diff'`, submitted as a diff), and before a split is marked ready (`content_type: 'social_split'`). Verdicts: `blocked` halts execution and surfaces the reason in the editor and on the card; `flagged` surfaces inline and requires explicit user confirmation to proceed; `pass` is recorded silently. The three content types are platform-asks #9; until they ship, DM submits as the generic `blog_post` type with refresh diffs sent post-merge.

In standalone mode Sentinel still runs: standalone users have Kinetiks IDs and the review endpoint is account-scoped, not orchestration-gated.

---

## 5. Approval Integration

One human decision (locked): the approve-and-publish action in the DM editor IS the Kinetiks approval. The card and the editor are two views of the same decision, deep-linked both ways. This section defines the pipeline order, classification, autonomy categories, the submission payload, bidirectional resolution, and timeout behavior.

### 5.1 Pipeline order (decision A)

DM-side gates run before submission; the platform pipeline (approval-system spec §4) runs at submission; Sentinel gates execution. The seed plan's stage names map onto this order without loss; what changes from the seed is Sentinel's position, moved from pre-queue to the publish boundary to match the approval-system spec and the contract's "before sending" framing.

```
GENERATION TIME (DM)
  1. Voice audit - composite scoring against Cortex Voice + corrections ledger
     + author layer, with auto-rewrite loop. Off-voice drafts never reach the editor.

EDITOR TIME (DM)
  2. Pre-publish checklist - craft items, citability gate (AI-visibility spec),
     image resolution gate, claim-evidence checks. Hard items block the approve action.

SUBMISSION (platform, approval-system spec §4)
  3. Brand consistency gate - platform Haiku check against Cortex Voice/Brand;
     revise-and-resubmit loop (max 3) is invisible to the user.
  4. Quality gate - DM's registered checks: factual accuracy (no hallucinated
     statistics), SEO basics (title, meta, heading structure), readability range,
     plagiarism flags. DM contributes these checks; the platform runs them.
  5. Classification - quick / review / strategic (§5.2).
  6. Confidence check - category threshold comparison (§5.3); queue or auto-approve.
  7. Queue and notify - card in the central queue (connected) or the in-app
     approval surface (standalone).

EXECUTION (publish boundary)
  8. Sentinel review (§4.4) - blocked halts, flagged requires confirmation.
  9. CMS publish, then post-execution verification (§7).
```

Stages 1-2 and 3-4 are intentionally redundant in the same way the approval spec intends: DM's gates are the craft ceiling, the platform's gates are the floor that holds even if an agent path bypasses DM's editor (e.g. an Autopilot-generated piece). The user never sees work that failed either.

### 5.2 Approval type classification

Assigned at submission time per approval-system spec §3, from the change scope, not the tool:

| DM action | Type | Rationale |
|---|---|---|
| Publish a draft (`dm_content_publish`) | **review** | Substantial work product; full-content preview with inline edit |
| Publish a refresh diff (`dm_content_refresh_publish`) | **review** | Presented as a diff against the live piece, each change tied to its evidenced problem |
| Metadata-only update (`dm_content_metadata_update`) | **quick** | Short, routine, fully visible in the card |
| Calendar / Program change (`dm_program_change`) | **strategic** | Changes direction, affects many future outputs; never auto-approved |
| Adjuster recommendation accepted into the Program | **strategic** | Same reasoning; flows through the Program propose/approve path (§6.4) |

One tool, two types: `dm_update_article` submits with `changes_strategy: false` and a `change_scope` field; the platform classifier sees `content_length` and scope and lands on review or quick accordingly. DM never self-classifies as quick to dodge review; the scope field is derived from the actual diff, not caller input.

### 5.3 Autonomy categories and thresholds (decision B)

`tools.ts` carries `autoApproveThreshold: null` everywhere. Runtime autonomy lives in `kinetiks_approval_thresholds` per action category. DM declares these defaults at registration:

| Category | Default threshold | Calibration | Ceiling behavior |
|---|---|---|---|
| `dm_content_publish` | 100 (always ask) | Standard (-5 after 20 clean approvals, -5 after 50) | May calibrate down over time; trust contraction per spec §2.4 applies |
| `dm_content_refresh_publish` | 100 (always ask) | Standard | Expected to be the first publish-class category to earn autonomy: diffs are scoped and evidence-tied |
| `dm_content_metadata_update` | 100 (always ask) | Standard | Earliest auto-approval candidate overall; lowest blast radius |
| `dm_program_change` | strategic | None | Never auto-approved, regardless of confidence (spec §3.3) |

Drafting categories (`content_draft`) inherit the platform default (85) and are largely moot since drafting is non-consequential. User overrides ("never auto-publish", "auto-approve metadata fixes") are policies of type `approval_override` and beat calibration, per programs-spec §2.

### 5.4 Approval submission payload

DM submits via `POST /api/approvals/submit` (approval-system spec §8.1) with DM-specific previews:

- `source_app: 'dark_madder'`, `source_operator`: the generating subsystem (`generation_engine`, `lifecycle_freshness`, `radar_response`, `measurement`).
- `preview.type`: `'content'` for drafts (full rendered piece, voice-match score, checklist state, image thumbnails), a diff structure for refreshes (per-change blocks with problem evidence), `'config_change'` for calendar proposals (calendar delta, affected clusters and dates, sequencing rationale).
- `deep_link`: the DM editor URL for this exact piece or diff (`https://dm.kinetiks.ai/editor/{piece_id}?approval={approval_id}`).
- `agent_confidence`: the voice audit composite plus checklist completion, normalized 0-100.
- `expires_in_hours` and timeout behavior per §5.6.
- `correlation_id` when the work originated from a Task (§6.5).

### 5.5 Bidirectional resolution

Card to editor: the card's "View in Dark Madder" deep link opens the editor with the approval banner active; approving or rejecting there calls `POST /api/approvals/action` with edits captured as the diff between submitted and final content, so the learning loop (edit classification, voice proposals) fires identically regardless of where the decision happened. Editor to card: when the decision is made on the card (inline edit or plain approve), the platform executes the approved tool; DM receives the execution as a command, updates `dm_pieces.status`, and the editor reflects the resolved state in real time. Double-action is idempotent: the second actor sees "Already approved" (approval-spec §11.4 pattern). The remaining platform work to guarantee this contract (idempotency, identical learning-loop firing from app-side actions) plus the collaborative-workspace rendering of the editor in the split panel is platform-asks #6.

### 5.6 Timeout windows

Per programs-spec §6, DM declares per-category defaults: `dm_content_publish` 48h / `pause_workflow` (don't publish stale content; the piece's Workflow holds at the checkpoint), `dm_content_refresh_publish` 48h / `pause_workflow`, `dm_content_metadata_update` 72h / `reschedule`, `dm_program_change` no timeout / `pause_workflow` (strategic decisions wait). Fast-track radar pieces override to 24h / `cancel` with regenerate-on-return, because a trend response older than a day is a post-mortem, not content. Away Mode semantics follow programs-spec §6.5 unchanged.

### 5.7 Standalone mode

Per approval-system spec §7.1, standalone DM runs the in-app approval flow: the same editor approve-and-publish surface, no confidence-based autonomy (significant actions always ask), no strategic type, no central queue. The brand gate still runs against the Context Structure (which standalone users have) and the quality gate still runs. On upgrade (§7.3): pending in-app approvals migrate to the central queue, and standalone approval history seeds the initial category confidence so a heavy standalone user does not restart trust from zero. This is the precise reading of the locked "one approval decision" rule: the editor decision is always the decision; connected mode adds a second synchronized view of it, standalone mode has only the one.

---

## 6. Programs Mapping

The publishing calendar is not a report; it registers as operated work. Per programs-spec, the hierarchy is Goal, then Program, then Workflow, then Task, and DM maps onto it natively. Marcus's daily brief and goal tracking see content as work in motion, not numbers after the fact.

### 6.1 Registration and coexistence

`dm_propose_calendar` produces a strategic approval; on approval, DM registers or mutates the account's content Program ("Content - {quarter}") through the platform Programs API (platform-asks #8 for the app-registration path). Rules:

- **One content Program per goal.** If the Autopilot's compiler already spawned a content Program for the goal (autopilot spec §4), `dm_propose_calendar` mutates that Program: adds or revises Workflows, never creates a duplicate. The proposal preview states which it will do.
- **Goal linkage.** `kinetiks_programs.goal_id` is NOT NULL. If no content-relevant goal exists, the calendar proposal bundles a goal suggestion (analytics-goals spec §2.3 path, e.g. "Publish 8 posts/month" or an organic-traffic KPI) and the strategic approval covers both. The user can swap the suggested goal before approving.
- **Standalone.** Programs are an orchestration surface; standalone mode keeps the calendar in `dm_calendar` with identical UI semantics and no platform registration. Upgrade triggers registration from existing calendar state (mapping documented in `specs/data-model.md`).

### 6.2 Clusters as Workflows

Each active cluster registers a recurring Workflow ("{Cluster} Engine") from a DM-contributed template that matches the programs-spec's own Dark Madder example:

```
Workflow: "{Cluster} Engine" (recurring, cadence from the publishing plan)
  Task: identify target keywords and angle from GSC + cluster gaps   (research)
  Task: draft outline                                                 (draft)
  Checkpoint: approve outline                          (review, 48h, pause_workflow)
  Task: draft full piece                                              (draft)
  Checkpoint: approve piece                            (review, 48h, pause_workflow)
  Task: publish to CMS                                                (publish)
  Task: verify publication and index status                           (monitor)
```

One-shot Workflows cover campaign pushes and radar fast-tracks (compressed schedule, 24h checkpoint timeouts, same quality gates; speed never skips craft).

### 6.3 Pieces as Tasks, with state mirroring

`dm_pieces` is the source of truth for content state; `kinetiks_tasks` mirrors it. Mapping:

| `dm_pieces.status` | `kinetiks_tasks.status` |
|---|---|
| `planned` | `planned` |
| `brief_ready` / `queued` | `queued` |
| `generating` | `generating` |
| `in_review` | `pending_approval` |
| `approved` | `approved` |
| `publishing` | `executing` |
| `verifying` | `verifying` |
| `published` | `completed` |
| `failed` | `failed` |
| `cancelled` / `archived` | `cancelled` |

DM pushes every transition through the Synapse. Platform-initiated transitions flow the other way as commands or routing events and DM honors them: a checkpoint timeout that pauses the Workflow holds the piece at `in_review` with a visible "held by Program" state; a cancel cancels. Bidirectional sync is part of platform-asks #8; until it ships, DM operates `dm_pieces` standalone-style and backfills on registration.

### 6.4 Policies, ContextPacks, and the Adjuster

Tasks arrive with ContextPacks (programs-spec §4) carrying `applicable_policies`; DM's generation pipeline injects them as hard constraints into generation prompts (cadence caps, banned terms, requirement rules like "all content references SOC 2") and the pre-publish checklist re-verifies them, satisfying enforcement points 2 and 3 of programs-spec §2.5. Program-scoped learned constraints ("long-form preferred" in the content Program) ride the same path.

The Adjuster's accepted recommendations mutate the Program exclusively through the propose/approve path as strategic approvals: cadence changes, cluster pauses, effort reallocation. DM never silently edits a registered Program.

### 6.5 Correlation IDs

`dm_pieces`, `dm_briefs`, `dm_refresh_drafts`, and `dm_splits` carry a nullable `correlation_id`, inherited from the originating Task (or Marcus command) and stamped on every approval submission, Sentinel review, and metric dimension DM emits. "Why was this published?" then resolves end-to-end: goal, Program, Workflow, Task, approval, execution, verification, outcome (programs-spec §5.4).

---

## 7. Verification and Recovery

DM implements the post-execution verification contract for its `publish`-type Tasks (programs-spec §3.3, Dark Madder rows) and reports results in the `CommandResponse` execution result (programs-spec §8.5):

| Check | Expected | Severity on fail |
|---|---|---|
| `page_availability` | Live URL returns 200 within SLA | critical |
| `content_integrity` | Rendered content hash matches the approved version | critical |
| SEO meta (`content_integrity` sub-check) | Title tag, meta description, canonical set as approved | major |
| Images | All images load; alt text present | major |
| Index state | No accidental `noindex` | major |

Responses follow programs-spec §3.4: critical fails pause the Workflow, attempt rollback (unpublish or revert via the CMS layer), and notify urgently; major fails flag the Task and DM proposes the fix as a normal approval ("The post published with a broken image. Republish with the corrected version?"); minor issues log and inform the next generation. Every resolved incident emits a postmortem; DM's standing contribution is `quality_gate_updated` actions (a verification failure class becomes a pre-publish checklist item, so the same failure cannot recur). This is the flagship operational expression of propose-don't-publish: even recovery is an evidence-backed proposal.

Standalone mode runs the same checks DM-side (they are DM code either way) and surfaces incidents in-app without the Program machinery.

---

## 8. Metric Reporting (decision D)

Daily via `synapse.reportMetrics`, `dm_`-prefixed per the binding contract §2.3. App-produced metrics only; traffic, rankings, and engagement come from platform integrations through the Oracle and are never reported by DM.

| Key | Definition | Category / Unit / Funnel | Computation |
|---|---|---|---|
| `dm_pieces_published` | Pieces published that day | content / count / top | `dm_pieces` transitions to `published` |
| `dm_drafts_awaiting_review` | Drafts in review at report time | content / count / n.a. | `dm_pieces.status = 'in_review'` snapshot |
| `dm_avg_voice_match` | Mean voice-audit composite of drafts completed that day | content / score / n.a. | Generation pipeline outputs |
| `dm_refresh_diffs_shipped` | Refresh diffs published that day | content / count / top | Refresh executions |
| `dm_corpus_authority_score` | Topical authority composite | content / score / top | Recomputed weekly (corpus intelligence); value carried forward daily |
| `dm_ai_citation_share` | AI engine share of voice across probed clusters | brand / score / top | Recomputed per probe cycle; carried forward daily |
| `dm_splits_generated` | Splits marked ready that day | content / count / top | Split queue transitions |

Each registers as a `MetricDefinition` in the unified schema with `source: 'dark_madder'`, the category/unit/funnel above, `cadence: 'daily'`, and `direction: 'higher_is_better'` (except `dm_drafts_awaiting_review`, `neutral`). Dimensions where meaningful: `content_topic`, `campaign`, `correlation_id`.

**Flagged conflict with `analytics-goals-engine-spec.md` §3.3.** That spec's Dark Madder table uses `dark_madder.*` keys and includes `total_traffic`, `organic_traffic`, `avg_time_on_page`, and `content_leads`. The contract's `dm_` prefix rule is binding, and the traffic/engagement rows contradict the locked zero-ingestion decision: that data belongs to GA4/GSC via the Oracle, joined to content by URL and topic dimensions, with attribution owned by the Oracle's model (spec §4.5), not by DM self-reporting. The analytics spec's DM table should be corrected to the seven keys above; filed alongside platform-asks #4 rather than silently contradicted here. DM's own analytics screens visualize the joined picture; the Kinetiks Analytics tab gets the same via the Oracle. Same metrics, one owner each.

---

## 9. Standalone Mode, Per Flow

Standalone is not a degraded mode; it is the same design with an empty Cortex and no orchestration layer. Standalone onboarding IS Cortex training: a standalone user who upgrades arrives with populated layers. Per-flow behavior:

| Flow | Standalone behavior | Empty-Cortex behavior (either mode) |
|---|---|---|
| Trainer | Fully functional; it is the onboarding. Populates Cortex via proposals from day one. | n.a. (the trainer is the fill mechanism) |
| Research | Functional. SEO data via the DataForSEO platform integration, available to standalone accounts since they hold Kinetiks IDs (platform-asks #2). Until that ships: LLM-derived territories with explicit "no keyword volume data" evidence states; never fabricated numbers. | Discovery prompts for minimum viable context (org + one product) and routes to the trainer first |
| Generation | Functional once Voice has signal. | Empty voice layer: drafting is allowed but the draft carries a prominent "untrained voice" flag and the trainer CTA; voice audit scores against defaults |
| Editor / approvals | In-app approval flow per §5.7. Same surface, no queue mirror. | Checklist runs; voice score shows "needs training" state |
| Publishing | Fully functional; CMS connections are DM-owned. | n.a. |
| Freshness | Functional. GSC/SERP signals only if the user connected GSC at the platform level; otherwise recency and claim-date signals only, stated in the evidence drawer. | Works on published corpus regardless of Cortex |
| Radar response | Connected-mode surface (sensing is platform A4). Standalone shows the instrument with an honest empty state: what it watches when connected, upgrade CTA. No DM-side crawlers exist in any mode. | Same |
| AI visibility | Fully functional; probing is DM-owned domain expertise. | Question sets fall back to cluster keywords without persona language |
| Splits | Functional; Sentinel runs in both modes (§4.4). | Platform voice stacking uses defaults, flagged |
| Measurement | DM production stats always; integration-derived metrics appear only for platform-connected sources, with explicit "connect GA4/GSC" empty states. | Same |
| Calendar / Programs | `dm_calendar` internal, identical UI semantics, no Program registration (§6.1). | Same |

Every screen's five states (empty/loading/populated/in-progress/failed) are specced in `ux/screen-system.md`; the standalone empty states onboard, the activated empty states leverage Cortex.

---

## 10. Floating Pill

`<FloatingPill />` from `@kinetiks/ui`, mounted in the root layout, both modes. Standalone: minimal upgrade-CTA mode (contract §7.2), with copy that names the concrete gain ("Your content would know what your outreach is learning"), never a generic ad; recommendation cadence respects the platform's rules (max one, 30-day cooldown on dismissal). Connected: system name, approval count badge (live via Realtime), quick-chat access. The pill is the only cross-app navigation; DM builds no app switcher.

---

## 11. Self-Check

### 11.1 Platform contract §10 checklist

| Item | Status | Where |
|---|---|---|
| App directory at `apps/dm/` with Next.js App Router | Planned | Repo scaffold; CLAUDE.md tech stack |
| `manifest.ts` with complete capabilities | ✓ | §2 |
| `tools.ts` with all capabilities exposed as tools | ✓ | §3 (capability `commands` ↔ tool names 1:1) |
| Synapse preset at `packages/synapse/src/presets/dark-madder.ts` | ✓ | §4.1 |
| `filterProposal` blocks internal operational data | ✓ | §4.1 |
| `handleRoutingEvent` handles Cortex events | ✓ | §4.3 |
| All API routes under `/api/dm/` | ✓ | Convention; §2, §4.2 |
| Status endpoint `/api/dm/status` | ✓ | §2 |
| Tables prefixed `dm_` | ✓ | `specs/data-model.md`; §6.5 adds correlation_id columns |
| RLS on every user-owned table | ✓ | `specs/data-model.md` (mandatory, account-scoped) |
| Migrations sequential in `supabase/migrations/` | ✓ | `specs/data-model.md` |
| Floating pill in root layout | ✓ | §10 |
| Auth via shared Kinetiks ID cookie | ✓ | Product spec §3.2/§13.1; no DM auth pages exist |
| Dark mode | ✓ | `ux/design-language.md` constraint (CSS custom properties) |
| Mobile-responsive | ✓ | `ux/design-language.md` constraint |
| Consequential tools marked `isConsequential: true` | ✓ | §3.3; publishing always gated, no exceptions |
| Sentinel review for externally-sent content | ✓ | §4.4 (publish, refresh, splits) |
| Error states defined, no blank screens | ✓ | `ux/screen-system.md` five-state requirement |
| Analytics events instrumented | ✓ | §8 + product analytics per platform convention |
| Tests for critical business logic | ✓ | CLAUDE.md testing requirements (RLS, approval gating, Sentinel gating, resumable pipelines) |

### 11.2 Product spec v3 §13.1 (eight musts)

| Must | Where |
|---|---|
| A Synapse (context, proposals, routing, commands, metrics) | §4 |
| Shared auth (`.kinetiks.ai` cookie, redirect to id.kinetiks.ai) | §11.1 row; no app-level auth |
| Floating pill | §10 |
| App-prefixed tables | §11.1 row |
| Metric reporting at defined intervals | §8 (daily) |
| Command handling via Synapse to internal operators | §4.2 |
| Approval generation with correct type classification | §5.2, §5.4 |
| Brand/voice validation against Cortex before the approval queue | §5.1 stages 1 and 3 |

---

*Dark Madder v2 - Platform Integration - June 2026*
