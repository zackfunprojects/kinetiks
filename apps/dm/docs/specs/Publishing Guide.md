# Dark Madder — Publishing

> **Spec:** `specs/publishing.md` — subsystem spec 5 of 10 per `dark-madder-v2-doc-system.md` §7.
> **Date:** June 2026 · **Status:** Draft for approval
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > `platform-contract.md` and `dm-platform-integration.md` (binding at the app boundary — §4.4, §5, and §7 of the integration doc are the constitution of this spec's execution mechanics) > `ux/experience-architecture.md` (binding for surfaces; not yet written — primitives cited are the four from doc-system §3.3, to be reconciled) > `platform-asks.md` > this spec.
> **Sources consolidated:** ARCHIVE-Framer_Integration (entire — connection, CMS structure, schema markup, publish flow, updates, batching, health, formatting), ARCHIVE-PATCH-003 §1.3 (the `published_body` retention requirement), ARCHIVE-PATCH-004 §7 (the stored-body-after-CMS-success rollback discipline, promoted to law here). All superseded by this document for the territory it covers.
> **Depends on:** `specs/generation-engine.md` (it publishes that spec's output: the structured document, the stage-5 metadata/schema set, and `dm_images` in resolved states per its §2.7 handoff), `specs/editor-review.md` (the approval decision this spec executes; the canonical diff viewer this spec mounts for drift).
> **Decisions baked in (continuing the global series):** **D12** thin CMS provider interface with capability flags, Framer first. **D13** schema strategy is a provider capability (`cms_fields_template` for Framer, with guided setup and live verification). **D14** external drift is detected and resolved by human choice (adopt or restore), never silently. **D15** revert-first rollback; unpublish is recovery machinery and a human in-app action, not an agent tool. **D16** per-piece staged publish jobs, idempotent and resumable; batching is execution-level coalescing only. **D17** slug conflicts fail loud with a fix affordance, never auto-suffix. **D18** schema supports multiple connections with one default per content type; launch UI exposes one.
> **Locked decisions honored:** one approval decision (this spec executes it, never creates a second one); zero analytics ingestion (the v1 "begin analytics tracking" step is deleted); Cortex canonical (one light read, zero writes); standalone-first (CMS connections are DM-owned and fully functional standalone); single company per account.

---

## 1. Purpose

Publishing is Dark Madder's execution boundary — the only subsystem whose job is to change the outside world. Everything upstream proposes, reviews, and approves; this spec is where an approved artifact becomes a live URL, and where the system proves it actually happened. Five properties define it:

1. **It executes; it never decides.** The approve-and-publish decision belongs to the editor and the approval system (editor-review §2.5, integration §5). Publishing receives an approved action, gates it through Sentinel at the boundary (integration §4.4 — the actual `submitReview` call lives in this spec), executes it, verifies it, and reports. No publish path exists that does not pass through an approval; no code in this subsystem can be reached without one.
2. **The path is deterministic code.** Content transformation, field mapping, schema assembly, asset upload, and verification are code, not model calls. The riskiest boundary in the app is also the most predictable: given the same approved artifact, the same provider, and the same mappings, the same bytes ship every time. The near-empty §9 is a reliability property, stated deliberately.
3. **Jobs, not requests.** Every publish-class action runs as a persisted, staged, idempotent, resumable job (`dm_publish_jobs`) — the same pipeline discipline `dm_generation_runs` established, applied where failure costs the most. A publish that dies at the asset-upload stage resumes at the asset-upload stage; it never re-creates a duplicate CMS item and never leaves the user guessing what shipped.
4. **`published_body` is downstream truth.** What is actually live — retained on the piece only after the CMS confirms success — is the baseline for embeddings (research §2.7), claims extraction and freshness (lifecycle), refresh diffs, and verification's content-integrity check. This spec owns the retention discipline and the post-publish cascade that keeps every consumer current.
5. **Providers are abstracted honestly.** The CMS layer is a thin provider interface with capability flags (D12). Framer is provider #1; WordPress/Webflow are additive later. A capability a provider lacks surfaces as a stated degradation in the connection card and the relevant flows — it is never emulated, never hidden.

The `framer-api` validation spike is **the first build task of this subsystem** (doc-system §3.4, carried verbatim): publish one hardcoded piece to a real Framer project before anything is built on the integration. §2.12 enumerates exactly what the spike must answer.

---

## 2. Mechanism

### 2.1 The CMS provider interface (decision D12)

One internal **canonical publish payload** — the piece's structured document (the editor's document model rendered for export), the stage-5 metadata set (meta description, takeaways, FAQ pairs, slug, author attribution, transparency line), the schema data components (Article / FAQ / Breadcrumb / HowTo per template), and the resolved asset manifest (`dm_images` rows in `accepted`/`uploaded` states with alt text). Every provider consumes this one payload.

```typescript
// apps/dm/src/lib/cms/provider.ts (shape)
interface CmsProvider {
  key: string;                                  // 'framer' | future providers
  capabilities: CmsCapabilities;                // declared statically, verified at connect (§2.2)
  connect(credentialsRef: string): Promise<CmsConnectionInfo>;   // verify + enumerate
  listCollections(): Promise<CmsCollection[]>;
  introspectFields(collectionRef: string): Promise<CmsField[]>;
  uploadAsset?(asset: AssetUpload): Promise<{ assetRef: string; url: string }>;
  createItem(collectionRef: string, fields: FieldPayload, slug: string): Promise<{ itemRef: string }>;
  updateItem(itemRef: string, fields: Partial<FieldPayload>): Promise<void>;
  unpublishItem?(itemRef: string): Promise<void>;
  publishSite?(): Promise<void>;                // providers with explicit publish steps
  fetchLiveContent(url: string): Promise<{ html: string; status: number }>;  // verification + drift
  health(): Promise<{ healthy: boolean; message: string }>;
}

interface CmsCapabilities {
  supportsAssetUpload: boolean;
  supportsUnpublish: boolean;
  requiresSitePublish: boolean;                 // Framer: true (CMS write ≠ live until publish)
  supportsScheduledPublish: boolean;            // Framer: false at spike time — verify
  schemaStrategy: 'cms_fields_template' | 'head_jsonld_direct';   // D13
  richTextDialect: string;                      // which transform the converter targets
}
```

**Rules:** missing capabilities are stated, never emulated — no DM-side timers faking scheduled publish, no asset workarounds pretending to be uploads (see §2.7 for the honest fallback). Provider-specific behavior is allowed to leak into UI *states* (a Framer connection shows "site publish required — DM triggers it automatically"; a future WordPress one doesn't) because honest difference beats false uniformity. Adding a provider is one module implementing this interface plus a converter target; nothing upstream changes.

### 2.2 Connections and mapping setup (decision D18)

`dm_cms_connections` supports **multiple connections per account** with exactly **one default per content type** via `dm_cms_collection_mappings`; the launch UI exposes a single connection (the schema is the full vision; the second-connection UI is a build-phase unlock, not a migration). The v1 setup flow carries, account-scoped:

1. User opens **Settings → Publishing → Connect CMS**, picks the provider (Framer at launch), supplies the project reference and API key.
2. Credentials are stored via **Supabase Vault** through the `@kinetiks/supabase` helper — `dm_cms_connections.credentials_ref` holds the Vault reference, never ciphertext in-table, never plaintext anywhere. (CMS connections are DM-owned per integration §9; the platform's integration-credential store does not apply. This is a stated DM-internal convention, not a platform ask.)
3. DM connects, verifies, and enumerates collections; the user maps content types to collections ("blog posts → Blog", "playbooks → Playbooks").
4. Per mapped collection, DM introspects fields and **auto-maps** the obvious ones (title → Title, slug → Slug, body → Body…), proposed via a fast-tier suggestion pass for ambiguous names (§9); the user confirms or adjusts every mapping before it saves. The v1 recommended collection structure (ARCHIVE-Framer_Integration §3.1) carries as the **guided setup reference** DM shows users building collections from scratch — required fields flagged, optional ones explained.
5. Schema template setup runs per §2.4.
6. Connection saves with detected capabilities recorded; `/api/dm/status` features update (`cms_connected`, `cms_provider`, `cms_asset_upload_available` — the last is a flagged write-back to integration §2, §10).

**Health:** a scheduled check (daily, plus before every job's pre-flight) runs `provider.health()`; failures flip the connection status, surface on S1 and the status endpoint, and cause queued jobs to hold at validation with the reason named — Marcus's connection awareness (integration §2) reads this, which is what keeps it from promising a publish against a revoked key. Last-success timestamp retained (v1 §5.1 carried).

### 2.3 The Framer provider

Provider #1, implementing §2.1 over the Framer Server API (`framer-api` npm, WebSocket-based, open beta Feb 2026 — currency re-verified by the spike, §2.12):

- **Connection:** project ID + API key from Framer site settings.
- **Rich text:** the converter targets Framer's rich-text dialect — headings H2/H3, paragraphs, bold/italic, links, lists, tables, images; definition boxes render as styled blockquotes (or embedded components where the spike confirms component support); FAQ renders **both** as body content (visual) and as discrete CMS fields (schema, §2.4); internal links absolutize against the connection's `site_domain`; the sources section renders as the formatted closing block. All v1 §6.1 rules carried, implemented as deterministic transform code with golden-file tests.
- **Site publish:** `requiresSitePublish: true` — CMS writes go live only on `publishSite()`. Batch execution (§2.5) coalesces: N item pushes, one site publish.
- **The 5k head-script limit** (v1 §3.2): schema kept under it by design (concise FAQ answers are already a template requirement); the code-override append fallback documented in the guided setup for orgs that exceed it.

### 2.4 Schema strategy (decision D13)

`schemaStrategy` is a provider capability:

- **Framer — `cms_fields_template`** (v1 §3.2 carried, made verifiable): DM pushes the schema **data components** as CMS fields (FAQ question/answer pairs, author name and bio link, dates, meta description); the Framer template references them via `{{field | json}}` in the detail page's Custom Code. The **guided one-time setup** generates the exact JSON-LD script blocks for the user's mapped fields (copy-paste with per-collection instructions), tracks state on the mapping row (`unconfigured → guided_setup_done → verified | failed_verification`), and — the v2 addition — **verifies after the first publish**: DM fetches the live page, parses the JSON-LD, and confirms Article (always), FAQPage (when FAQ present), BreadcrumbList, and HowTo (playbooks) parse with the expected values. A silently-unconfigured template defeats the entire schema investment; verification makes that state impossible to miss. Failed verification is a connection-card warning with the re-setup affordance, never a publish blocker (the content is live and correct; the schema is the deficit, stated).
- **Future `head_jsonld_direct` providers** (WordPress class): DM assembles the complete JSON-LD from the same data components and injects it directly; the template step disappears.

Schema *content* is generation's stage-5 output (generation §2.4); this spec assembles and delivers it per provider, and never regenerates it.

### 2.5 The publish job pipeline (decision D16)

Every publish-class action is a `dm_publish_jobs` row. **Kinds:** `publish` (first publish of a draft) · `update_refresh` (an approved refresh diff — lifecycle-originated) · `update_metadata` (metadata-only) · `update_links` (a link micro-refresh batch — research §2.7-originated) · `rollback_revert` (verification recovery, §2.10) · `unpublish` (recovery or deliberate takedown, §2.10) · `restore` (drift resolution, §2.11 — mechanically an `update_refresh`).

**Stage model**, persisted per stage with status, timestamps, and output refs:

```
sentinel → validate → transform → assets → item_push → site_publish → record → verify
```

1. **Sentinel** (integration §4.4 — the boundary gate, executed here): `published_article` for publishes, `article_refresh_diff` for refreshes (diff-granularity per ask #9; interim: generic `blog_post`, diffs post-merge). `blocked` halts the job and surfaces the verdict in the editor and on the card with the path forward (edit and resubmit — never override); `flagged` pauses for explicit, logged user confirmation; `pass` records silently. Metadata-only and link-insertion jobs skip Sentinel (no prose leaves the system that wasn't already reviewed at its original publish) — `update_refresh` and `publish` never do.
2. **Validate:** connection healthy; mapping valid for the piece's content type; schema-template state known; **slug pre-flight** (§2.8); for updates, `cms_item_id` exists and resolves.
3. **Transform:** canonical payload → provider field payload via the converter (§2.3). Deterministic; the payload digest is stored for idempotency and audit.
4. **Assets** (§2.7).
5. **Item push:** `createItem` / `updateItem`.
6. **Site publish:** when `requiresSitePublish`; coalesced across a batch.
7. **Record:** only now — after the provider confirms — does the piece update: `cms_item_id`, `live_url`, `published_at` / updated-at, **`published_body` and `published_content_hash`** (the PATCH-004 §7 law: the stored body changes only after the CMS update succeeds; a failed publish leaves the prior truth intact). Then the post-publish cascade fires (§2.9).
8. **Verify** (§2.10).

**Idempotency:** `idempotency_key = (piece_id, approval_id, kind)` is unique; a re-dispatched approval execution attaches to the existing job. A partial unique index allows one live job per piece (the generation §2.1 pattern). **Retries:** bounded per stage with backoff (provider calls 3×); exhausted retries fail the stage loudly and resumably — the job surfaces in S2 and on the piece with the failed stage named and one-click resume. A `create` that may have partially succeeded re-checks for the item by slug before retrying — duplicates are structurally prevented, not cleaned up.

**Batching** (v1 §4.3, carried execution-level only): N individually-approved pieces become N jobs; the Framer provider coalesces their `site_publish` stages into one call. There is no batch approval — editor-review §2.11 already settled that every approve is an individual decision.

### 2.6 Update classes

One tool (`dm_update_article`), four job kinds, three approval scopes — the classification discipline from integration §5.2 carried: scope is derived from the actual diff, never caller-asserted.

| Change | Job kind | Approval type | Sentinel |
|---|---|---|---|
| Approved refresh diff (lifecycle) | `update_refresh` | review (`dm_content_refresh_publish`) | yes, as diff |
| Metadata-only (title tag, meta description, canonical, schema fields) | `update_metadata` | quick (`dm_content_metadata_update`) | no |
| Link micro-refresh batch (research §2.7 sweep approvals, batched per target piece) | `update_links` | review interim (research §5's filed write-back proposes a quick `dm_content_link_insertion` class) | no |
| Drift restore (§2.11) | `restore` | review (it changes the live site back to DM's version) | yes, as diff |

Every update writes the new `published_body` + hash on success and fires the cascade (§2.9), so embeddings, claims, and freshness always describe what is actually live.

### 2.7 Image and asset handoff

Publishing consumes `dm_images` rows in resolved states (generation §2.7's handoff, implemented here):

- **With `supportsAssetUpload`:** featured + in-content images upload via `uploadAsset` (bytes from Supabase storage paths — `dm_images` stores paths, never blobs); the featured asset ref populates the mapped Featured Image field; in-content references in the transformed body rewrite to the returned CMS asset URLs; `cms_asset_ref` writes back to each `dm_images` row. Alt text rides every upload (it is a verification check; it cannot be dropped here).
- **Without it (capability-flagged):** images serve from DM-owned Supabase public-storage CDN URLs referenced in the body; the featured field receives the URL where its type allows, else the limitation is stated on the connection card ("this CMS can't receive uploaded featured images — set them in {provider}"). Stated degradation, never silent, never emulated.
- Whether the Framer Server API supports asset upload is **spike question #1** (§2.12). The interface is correct either way.

### 2.8 Slugs and URLs (decision D17)

Generation's stage 5 proposes the slug; the architecture's URL pattern (research §2.5) supplies the path; publishing **validates at pre-flight**: the target collection is checked for an existing item with the slug. Conflict → the job **fails at validate** with the fix affordance — "slug already exists at {live url}" with *edit slug* (a metadata change; if the piece is already approved, the changed artifact re-enters the approval path rather than shipping something other than what was approved) and *view conflicting item*. **Never auto-suffix:** a silently different URL breaks the approved-content contract, the internal-link map, and the verification hash. `live_url` is constructed from the connection's `site_domain` + collection path pattern + slug, recorded at the `record` stage, and is the address verification and drift detection watch forever after.

### 2.9 The post-publish cascade

On every successful `record` stage, in order, each independently retried and visible in the job's stage detail:

1. **Corpus re-embed** — the research §2.7 pipeline trigger (publish → embed piece + chunks within minutes; updates → re-embed). Includes firing the backward **Link Sweep** on first publishes.
2. **Claims handoff** — `specs/lifecycle-freshness.md`'s claim-extraction trigger on the new `published_body` (its ledger resets to current on refresh publishes, per PATCH-004 carried there).
3. **Metric event** — the `dm_pieces_published` / `dm_refresh_diffs_shipped` transition events measurement's daily reporter aggregates (measurement §2.12).
4. **Program state** — `dm_pieces.status` transitions (`publishing → verifying → published`) mirror into `kinetiks_tasks` per integration §6.3.
5. **Verification job** (§2.10).

The v1 "begin analytics tracking" step is **deleted** — this cascade is its replacement, and none of it ingests anything.

### 2.10 Post-publish verification and recovery (integration §7, implemented; decision D15)

The `verify` stage implements DM's verification contract:

| Check | Method | Severity on fail |
|---|---|---|
| `page_availability` | `fetchLiveContent` returns 200 within SLA (config: 5 min, with Framer publish-propagation retries) | critical |
| `content_integrity` | Rendered content hash (normalized extraction) matches the approved version | critical |
| SEO meta sub-check | Title tag, meta description, canonical as approved | major |
| Images | All referenced images load; alt text present in markup | major |
| Index state | No accidental `noindex` (meta or header) | major |
| Schema (additive) | JSON-LD parses with expected types — feeds §2.4's verification state | major (recorded as schema-template state, not a piece incident, when the cause is template setup) |

**Responses** (programs-spec §3.4 semantics, carried via integration §7): **critical** → pause the Workflow, attempt rollback, notify urgently. **Major** → flag the Task; DM proposes the fix as a normal approval ("The post published with a broken image — republish with the corrected version?"), the P1 family. **Minor** → log; inform the next generation. Every resolved incident emits a postmortem whose standing contribution is a `quality_gate_updated` action — a new editor-review §2.4 registry item, so the same failure class cannot recur unchecked.

**Rollback — revert-first (D15):** rollback = republish the prior known-good `published_body` through the update machinery (`rollback_revert` job; always available once one good publish exists; system-initiated under critical failure with the incident as its provenance, visible everywhere the piece is). **Unpublish** exists in exactly two forms: (i) the automated recovery action when no prior good version exists (a first publish that failed content integrity comes *down*, not half-up), and (ii) a deliberate human takedown — an in-app consequential action with its own approval, internal route only. **No `dm_unpublish_article` agent tool ships** (D15): agents have no takedown use-case worth handing them a destructive verb; the day one appears, it is a write-back to integration §2–§3, not an ad-hoc addition here.

Standalone runs the same checks DM-side (they are DM code either way) and surfaces incidents in-app without the Program machinery (integration §7, carried).

### 2.11 External drift (decision D14)

The user (or a teammate) edits a piece directly in the CMS. v1 ignored this; v2 cannot — `published_body` now feeds embeddings, claims, and refresh diffs, and silent drift corrupts all three.

- **Detection:** the weekly health sweep and every verification run compare the live content hash against `published_content_hash`. Mismatch → a `dm_drift_events` row, a drift flag on the piece (S3, the library, the queue), and a Publish Activity entry.
- **The choice**, rendered on the **canonical diff viewer** in a new `external-drift` mounting mode (editor-review §2.9 — a flagged additive write-back, §10): live version vs DM's stored version, change blocks with no evidence chips (the evidence is "someone edited this in {provider} around {date}").
  - **Adopt** — DM's record updates to reality: `published_body` + hash update, re-embed, claims re-extract; the diff is offered to editor-review's edit-capture intake as learning signal (`capture_surface` gains an `external_cms` value — same write-back). Adopt changes nothing in the world; it is a logged in-app decision, not an approval.
  - **Restore** — DM's version goes back up: a `restore` job through the normal review approval (it changes the live site; it is consequential like any update).
  - **Dismiss** — acknowledged, left divergent, flag persists muted with the logged reason (legitimate for pages the org is deliberately hand-tuning); freshness and embedding consumers see the divergence stated.
- Propose-don't-publish, applied to **inbound** change: the system never clobbers human work in either direction without a human choosing.

### 2.12 The validation spike (first build task)

Publish one hardcoded piece end-to-end to a real Framer project before any of the above is built on the integration. The spike must answer, in writing:

1. Does the Server API support **asset upload**? (Sets `supportsAssetUpload`; decides §2.7's branch.)
2. Rich-text **fidelity**: which of the §2.3 constructs survive round-trip (tables, blockquote styling, embedded components)?
3. **Item update semantics**: partial field updates? Slug mutability? What does the API return for conflict states?
4. **Publish latency and propagation**: time from `publishSite()` to live URL serving new content (sets verification SLA/retry config).
5. **Slug behavior**: server-side uniqueness enforcement, normalization, collision response (shapes §2.8's pre-flight).
6. **Rate limits and connection lifecycle**: WebSocket session limits, key revocation signaling (shapes §2.2 health and §2.5 retry policy).
7. Any **external-edit signal** (webhooks, modified-at metadata) that could make §2.11's detection event-driven instead of sweep-driven — opportunistic, not assumed.

Spike findings write back into this spec's provider section in the same session (the CLAUDE.md canonical-doc rule).

---

## 3. Tools exposed

The `content_publishing` capability — two tools, defined canonically in `dm-platform-integration.md` §3.3 (descriptions final there; restated for completeness). Per integration decision C, `tools.ts` is the single definition. **No unpublish tool ships** (D15, §2.10).

| Tool | `isConsequential` / `autoApproveThreshold` | `surface` / `actionCategory` | Description (as shipped) | Returns |
|---|---|---|---|---|
| `dm_publish_article` | **`true`** / `null` | `consequential` / `dm_content_publish` | Publish an approved draft to the connected CMS with schema markup. Always consequential: creates an approval (or executes an existing approval decision) and only then pushes to the CMS; post-publish verification runs automatically. Use when the user asks to publish a specific approved draft. Fails with a clear reason if no CMS is connected or the draft has unresolved gates. | `{ piece_id, approval_id?, live_url?, verification, status }` |
| `dm_update_article` | **`true`** / `null` | `consequential` / `dm_content_refresh_publish` or `dm_content_metadata_update` (by change scope) | Push changes to an already-published piece: an approved refresh diff, or a metadata-only change (title tag, description, canonical, schema). Always consequential. The approval type depends on scope: refresh diffs are review approvals, metadata-only changes are quick approvals. Use for any change to live content. | `{ piece_id, change_scope, approval_id?, live_url, verification, status }` |

Both follow the contract's consequential pattern: invoked without a resolved approval they submit one and return `pending_approval`; invoked as the execution of a resolved approval they run the job (§2.5) and return its result with verification attached. Change scope on `dm_update_article` is derived from the actual diff (integration §5.2's discipline) — a body change can never masquerade as metadata. The CMS connection itself is a **configuration operation** (`dm_cms_connection` per integration §4.2), not a tool: connecting is a human credential flow.

Internal routes (not agent tools): `/api/dm/publishing/connections/*` (setup, mapping, schema-template state, health), `/api/dm/publishing/jobs/*` (state, resume, cancel-where-safe), `/api/dm/publishing/drift/*` (events, resolve), `/api/dm/publishing/verify/{piece_id}` (on-demand re-verification).

---

## 4. Cortex layers read and written

**Reads:** `org` only, and lightly — the publisher block of the Article schema (organization name, logo URL) and the site domain default at connection setup. Empty `org` degrades to the connection's own domain and a stated "publisher name not set — train your Org layer or set it in publishing settings" affordance; never an error, never a fabricated publisher.

**Writes: none — structurally.** Publishing is pure execution; it learns nothing about the business that belongs in Cortex. CMS payloads and credentials are on the integration §4.1 `filterProposal` blocklist (`cms_payload`, `cms_credentials`) *and* this spec contains no proposal constructor — the blocklist is the safety net, not the design.

---

## 5. Approval touchpoints

This spec **executes** the publish-class decisions and **originates** only recovery proposals:

| Moment | Type | Role here | Notes |
|---|---|---|---|
| Publish a draft (`dm_content_publish`) | review | **Executes.** The decision is editor-review §2.5's; this spec runs Sentinel, the job, the cascade, verification | 48h / `pause_workflow`; fast-track 24h / `cancel` (integration §5.6) |
| Refresh diff (`dm_content_refresh_publish`) | review | **Executes** (lifecycle owns the decision's content) | Sentinel reviews the diff |
| Metadata-only (`dm_content_metadata_update`) | quick | **Executes** | Scope derived from the diff; 72h / `reschedule` |
| Link micro-refresh | review (interim) | **Executes** research's approved sweep batches | Quick-class write-back already filed by research §5 |
| Verification major-fail fix | review or quick by scope | **Originates** — the P1 proposal ("republish with the corrected image?") | The flagship of even-recovery-is-a-proposal (integration §7) |
| Drift restore | review | **Originates** on the user's Restore choice (§2.11) | A normal update approval |
| Rollback (critical fail) | — | System recovery action under integration §7's contract, logged with incident provenance | Not a new approval: it restores the previously-approved state |
| Drift adopt / dismiss | — | Logged in-app decisions; nothing leaves the system | No cards |
| Deliberate unpublish | in-app consequential | Human-only, internal route, own approval (§2.10) | Not an agent tool (D15) |

Sentinel verdicts (`blocked` halts, `flagged` requires logged confirmation, `pass` silent) render where editor-review §2.6 specs them; the call itself executes here.

---

## 6. Data — Data Tables appendix

All tables `account_id`-scoped (`uuid not null references auth.users(id)`), **RLS mandatory** (`using (account_id = auth.uid())`), migrations sequential in the monorepo `supabase/migrations/`. SQL-sketch format for `specs/data-model.md` consolidation.

```sql
-- CMS connections (D18: multiple allowed; credentials in Vault, by reference only)
create table dm_cms_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  provider text not null,                    -- 'framer' | future
  display_name text not null,
  credentials_ref text not null,             -- Supabase Vault reference; never ciphertext in-table
  project_ref text not null,                 -- provider project/site identifier
  site_domain text not null,                 -- live URL construction (§2.8)
  capabilities jsonb not null,               -- detected CmsCapabilities at connect; re-verified on health
  status text not null default 'active' check (status in ('active','unhealthy','revoked','disabled')),
  last_health_at timestamptz,
  last_health_ok boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Content-type → collection mappings (one default per content type per account)
create table dm_cms_collection_mappings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  connection_id uuid not null references dm_cms_connections(id),
  content_type text not null,                -- template key: 'hub' | 'spoke' | 'playbook' | custom
  collection_ref text not null,
  field_mappings jsonb not null,             -- canonical field -> provider field, with types
  schema_strategy text not null check (schema_strategy in ('cms_fields_template','head_jsonld_direct')),
  schema_template_state text not null default 'unconfigured' check (schema_template_state in
    ('unconfigured','guided_setup_done','verified','failed_verification')),
  schema_verified_at timestamptz,
  is_default boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index idx_dm_cms_map_default on dm_cms_collection_mappings (account_id, content_type)
  where is_default;                          -- D18: exactly one default per content type

-- Publish jobs (D16: staged, idempotent, resumable; the execution record of every world-changing action)
create table dm_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,                    -- dm_pieces
  connection_id uuid not null references dm_cms_connections(id),
  kind text not null check (kind in
    ('publish','update_refresh','update_metadata','update_links','rollback_revert','unpublish','restore')),
  approval_id uuid,                          -- the platform approval this job executes (null only for
                                             -- system rollback under integration §7, which carries incident_ref)
  sentinel_review_id uuid,
  incident_ref uuid,                         -- verification incident provenance for recovery jobs
  correlation_id uuid,                       -- Task provenance (integration §6.5)
  idempotency_key text not null,             -- (piece_id, approval_id, kind) digest
  payload_digest text not null,              -- transform output hash: audit + retry safety
  status text not null default 'queued' check (status in
    ('queued','running','awaiting_sentinel_confirmation','completed','failed','cancelled')),
  stages jsonb not null,                     -- [{stage: sentinel|validate|transform|assets|item_push|
                                             --   site_publish|record|verify, status, started_at, finished_at,
                                             --   output_ref, failure?}]
  result jsonb,                              -- { live_url, cms_item_id, change_scope }
  verification jsonb,                        -- per-check results + severity + response taken
  error jsonb,                               -- actionable failure (never raw provider errors)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index idx_dm_publish_jobs_idem on dm_publish_jobs (account_id, idempotency_key);
create unique index idx_dm_publish_jobs_live on dm_publish_jobs (piece_id)
  where status in ('queued','running','awaiting_sentinel_confirmation');
create index idx_dm_publish_jobs_piece on dm_publish_jobs (account_id, piece_id, created_at desc);

-- External drift events (D14)
create table dm_drift_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,
  detected_at timestamptz not null default now(),
  detected_by text not null check (detected_by in ('weekly_sweep','verification_run','manual_check')),
  live_content_hash text not null,
  stored_content_hash text not null,
  diff_ref jsonb,                            -- change blocks for the external-drift diff mode
  resolution text not null default 'pending' check (resolution in
    ('pending','adopted','restored','dismissed')),
  dismissed_reason text,
  resolved_at timestamptz,
  resolved_by uuid
);
create index idx_dm_drift_pending on dm_drift_events (account_id, piece_id) where resolution = 'pending';
```

**Columns this spec contributes to `dm_pieces`** (canonical in `specs/data-model.md`): `cms_connection_id`, `cms_item_id`, `live_url`, `slug` (canonical post-publish), `published_at`, **`published_body`**, **`published_content_hash`** (the §2.9 retention law), `last_verified_at`, `verification_state` (`pending | passed | major_flagged | critical_incident`), `drift_state` (`none | pending | dismissed_divergent`), the `publishing` / `verifying` / `published` statuses and their transition discipline.

**v1 tables that do not return** (for `data-model.md`'s list): `framer_connections` (→ account-scoped `dm_cms_connections` + Vault), per-org sync-dashboard state (→ S2 over `dm_publish_jobs`), any analytics-tracking columns on publish records (→ deleted; the §2.9 cascade replaces them), Google Service Account artifacts (→ deleted; platform integrations own Google auth).

---

## 7. Surfaces & Explainability

Primitives per doc-system §3.3 (reconcile with `ux/experience-architecture.md` when it lands): **P1** propose→review→approve · **P2** diff surface (the canonical implementation is editor-review §2.9; this spec mounts its `external-drift` mode) · **P3** generation theater · **P4** evidence drawer. No parallel primitives. Visuals defer to `ux/design-language.md` (jobs in progress are the emerald live signal; drift and incident flags are semantic chips, never colored cards).

### S1 — CMS Connections (Settings → Publishing)
**Purpose:** connect, map, set up schema, and know the connection's true state. **Narrative moment:** first hour (both modes — publishing is the spine's last vertebra); the monthly ritual's "is everything healthy" glance. **Primary action:** connect (empty) / fix the named problem (unhealthy). **Primitives:** P1 (field-mapping confirmation is a propose→review micro-decision: auto-mapped fields are proposals the user confirms or adjusts), P4 (every detected capability, mapping, and schema state opens its evidence: what was introspected, when, what the guided setup generated, what verification found on the live page).
**Five states:** *Empty* — no connection: the provider picker with the guided collection-structure reference and the spike-honest capability notes; standalone and activated identical (CMS is DM-owned). *Loading* — connection card skeletons. *Populated* — connection cards: provider, domain, health with last-check time, capability list with stated absences ("asset upload: not supported — images serve from Dark Madder storage"), per-content-type mappings with schema-template state chips (`verified` / `setup needed` / `verification failed` with the re-run affordance). *In-progress* — connecting/introspecting/verifying with named steps. *Failed/partial* — health failure names the cause (revoked key, deleted project) and the recovery action; a failed schema verification isolates to its mapping card, the connection stays usable.
**Why:** "why can't I publish?" → the exact unhealthy/unmapped state with its fix; "why is my schema unverified?" → the live-page parse result.

### S2 — Publish Activity
**Purpose:** the truthful log of every world-changing action — jobs, verifications, incidents, drift. The v1 sync dashboard, grown into an instrument. **Narrative moment:** Tuesday morning's "did everything ship?"; the post-incident "what happened?". **Primary action:** resume the top failed job / resolve the top drift event, when any; otherwise none (watching is the point). **Primitives:** P3 (each running job renders as a scoped theater: the §2.5 stages live, Sentinel pause states named, the coalesced site-publish shown as the shared final step of a batch), P1 (verification fix proposals and pending drift resolutions render as decision cards), P2 (drift rows open the external-drift diff), P4 (every stage, verdict, check, and incident opens its evidence: the Sentinel reason, the payload digest, the per-check verification result, the rollback's incident provenance).
**Five states:** *Empty* — nothing published yet: "Approved pieces publish from the editor — activity lands here," with the connection state summarized. *Loading* — row skeletons. *Populated* — jobs grouped by day with kind, piece, stages, verification badges; pending drift events; incident history with postmortem links and the `quality_gate_updated` items they produced. *In-progress* — live jobs streaming stage state among completed ones. *Failed/partial* — failed jobs with the failed stage named, prior stage work intact, one-click resume; a log-fetch failure degrades to cached rows with a staleness banner, never blank.
**Why:** "why did this fail?" → the stage, the actionable error, the retry history; "why did this piece get republished at 3am?" → the critical incident, the rollback's provenance chain; "why is this job paused?" → the Sentinel flag awaiting confirmation, verbatim.

### S3 — Live Status (per-piece panel, mounted in the piece view and the editor's published-piece context)
**Purpose:** one piece's relationship with the world: where it lives, whether it's verified, whether it has drifted, what has shipped to it. **Narrative moment:** Tuesday morning, opening any published piece. **Primary action:** open live URL. **Primitives:** P4 (verification results, drift state, and every update in the history open their evidence), P2 (drift resolution and update history mount the diff viewer), P1 (a pending fix proposal or drift decision renders inline).
**Five states:** *Empty* — piece not yet published: the publish-readiness summary (approval state, gates) — never a blank panel pretending a URL exists. *Loading* — skeleton. *Populated* — live URL, published/updated dates, verification badge with per-check detail, schema state, drift state, the update history (each entry: kind, approval, what changed). *In-progress* — a live job for this piece streams its stages here too. *Failed/partial* — a verification incident renders with severity, the response taken, and the proposal if one is pending; a status-fetch failure shows last-known state with staleness named.
**Why:** "why does this say major-flagged?" → the failed check and the pending fix proposal; "why doesn't the live page match what I see in DM?" → the drift event and the three-way resolution.

---

## 8. Standalone mode

Publishing is **fully functional standalone** — CMS connections are DM-owned and account-scoped (integration §9); nothing here requires the orchestration layer:

- **Connections, mappings, schema setup, jobs, transformation, assets:** identical.
- **Approvals:** the in-app approval flow (integration §5.7) feeds the same job pipeline; `approval_id` references the in-app decision. On upgrade, history is already account-scoped and persists.
- **Sentinel:** runs identically (account-scoped, not orchestration-gated — integration §4.4).
- **Verification:** same checks, DM-side; **critical** failures roll back and surface as in-app incidents (no Workflow exists to pause — the piece holds at `failed` with the incident, stated); **major** failures propose fixes through the in-app flow; postmortem → checklist items, identically.
- **Programs:** no Task mirroring; `correlation_id` is null; provenance shows "user-initiated" honestly.
- **Drift:** identical.

No feature forks; the absences are the platform's, stated.

---

## 9. Model/task mapping (`@kinetiks/ai` configuration)

**The publish path is deterministic code — stated as a reliability property.** Transformation, schema assembly, validation, verification, and rollback contain zero model calls: the boundary where failure costs the most is the place least entitled to nondeterminism. Task keys, all peripheral:

| Task key | Tier | Used in |
|---|---|---|
| `field_mapping_suggestion` | fast | §2.2 — auto-map proposals for ambiguously named provider fields; always user-confirmed before saving |
| `drift_change_summary` | fast | §2.11 — one-line natural-language summary atop the external-drift diff ("3 paragraphs edited in the pricing section; a CTA was removed"); the diff itself is computed, not modeled |

No craft tier, no strategic tier, no thinking budgets. Fallback discipline per generation §9 (fast falls back to standard, logged) applies to these two trivially.

---

## 10. Platform dependencies and write-backs

**Existing asks this spec depends on:** **#6** (approval deep-link bidirectionality — this spec executes approved actions arriving from either resolution surface; interim per the ask is upstream's concern), **#8** (Programs — Workflow pause on critical verification failure and Task state mirroring; absent it, incidents surface in-app exactly as standalone), **#9** (Sentinel content types `published_article` / `article_refresh_diff`; interim: generic `blog_post`, diffs post-merge, accepted as the safe direction).

**No new platform asks.** CMS connections, jobs, verification, and drift are wholly DM-owned; the credential convention (Supabase Vault via `@kinetiks/supabase`) is DM-internal and stated in §2.2.

**Write-back flags (filed, not silently applied):**
1. `dm-platform-integration.md` §2: additive `/api/dm/status` features — `cms_asset_upload_available`, `cms_schema_verified` (Marcus connection awareness: don't promise schema-marked publishes against an unverified template).
2. `specs/editor-review.md` §2.9: additive `external-drift` mounting mode of the canonical diff viewer; §2.3: `capture_surface` gains `external_cms` for adopted-drift diffs offered to edit capture (a new capture consumer, same intake, same no-double-count discipline).
3. `specs/research-architecture.md` §2.7: clarifying cross-reference that the post-publish embed trigger and Link Sweep firing are invoked by this spec's §2.9 cascade (research owns the pipeline; publishing owns the trigger).
4. Spike write-back (§2.12): provider findings land in §2.3/§2.7 in the spike's session.

---

## 11. Self-check

| Mandatory section | Present |
|---|---|
| Purpose | §1 |
| Mechanism | §2 |
| Data (dm_* tables, SQL-sketch Data Tables appendix) | §6 |
| Tools exposed (names, consequential flags, Marcus-grade descriptions) | §3 |
| Cortex layers read/written, proposal shapes, evidence requirements | §4 (read: `org`, light, degradation stated; writes: none, structurally — no proposal shapes exist by design) |
| Approval touchpoints and types | §5 |
| Surfaces & Explainability (screens, five states each, evidence, "why", canonical primitives only) | §7 (S1–S3; P1–P4 only, P2 via the canonical viewer's new mode) |
| Standalone mode (exact empty-Cortex behavior) | §8 |
| Model/task mapping via `@kinetiks/ai` | §9 |

**Locked decisions:** one approval decision — this spec executes it and originates only recovery proposals; no publish path exists without an approval; no second decision surface created — §1, §2.5, §5 ✓ · zero analytics ingestion — the v1 tracking step deleted; the cascade ingests nothing — §2.9 ✓ · Cortex canonical — one light read, zero writes, blocklist + no constructor — §4 ✓ · standalone-first — fully functional, stated absences only — §8 ✓ · single company per account — §6 account-scoped throughout ✓ · Sentinel gates the publish boundary (integration decision A) — §2.5 stage 1 ✓.
**No surface without five states** — S1–S3 ✓. **No invented primitives** — P1–P4 only; the drift diff mounts the canonical viewer rather than forking it ✓. **New platform dependencies:** none assumed; none needed ✓. **Changes to approved/earlier docs** flagged for write-back, not silently applied — §10 ✓. **The spike precedes the build** — §2.12, carried from the doc-system verbatim ✓. **Boundary contracts stated from this side:** canonical publish payload (consumes generation's output), `dm_images` resolved states (consumes; writes `cms_asset_ref` back), the approval execution (consumes editor-review's decision), the post-publish cascade (provides triggers to research, lifecycle, measurement), `published_body` + hash (owns; lifecycle, research, and verification consume), the external-drift diff mode (mounts editor-review's viewer) ✓.

---

*Dark Madder v2 — specs/publishing.md — June 2026*
