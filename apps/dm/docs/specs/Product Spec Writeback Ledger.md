# Dark Madder v2 — Product Spec Write-Back Ledger

> **Purpose:** `dm-product-spec.md` wins conflicts. Every Phase 2 ruling that contradicts or extends an approved document is an entry here, applied in follow-up sessions — never silently. Class N entries are new (this session's rulings); Class C entries consolidate write-backs previously filed inside approved specs but not yet applied, so they stop rotting in footnotes.
> **Convention:** one entry = target doc · section · change · origin. Apply in any order unless a dependency is noted. On application, annotate the target doc's changelog with the entry ID.

---

## Class N — New entries from this session's rulings

**N1 · `dm-platform-integration.md` · §2 (publishing capability text) + §11.1** — Rewrite "publishing always gated, no exceptions" and "nothing goes live without an approved card or an explicit user approval" to the constitutional wording: every publish-class action passes through the approval system as a decision; the decision may be human or earned auto-approval per §5.3's calibration; always Ledger-recorded. *Origin: F1.*

**N2 · `dm-platform-integration.md` · §5.3** — Add the flagged default: first publish into a newly created cluster asks regardless of category calibration (config-level, shipped on, reversible). Add the never-automatable floor cross-reference to product spec §1.1. *Origin: F1.*

**N3 · `approval-system-spec.md` · §7.1** — Extend both autonomy paths (automatic calibration + explicit user overrides) to standalone in-app approval flows: identical thresholds, contraction, Ledger recording, account-scoped. Note the existing upgrade-seeding clause (integration §5.7) as the shared counting machinery. Interim until applied: explicit grants only, absence of auto-calibration stated in-app. *Origin: F2. Platform-owned doc — file as a platform ask alongside N12 if the platform team prefers.*

**N4 · `dm-platform-integration.md` · §5.7** — Update standalone approval description to match N3 (remove "no confidence-based autonomy" once the platform applies it; until then, state the interim). *Origin: F2. Depends on N3.*

**N5 · `screen-system.md` · §9.1 OV1** — Add the **DM Briefing** component above the decision stack: 2–4 narrated sentences in the L10 register, generated from owner-figures only (owns-no-numbers law holds — the briefing references, never recomputes), every claim P4-openable. Add to all five states (empty states already narrate; populated/in-progress gain the briefing). *Origin: F3.*

**N6 · `screen-system.md` · §9.1 OV1** — Decision-stack source list gains (a) the scheduled weekly plan-review entry (Monday cadence; renders until resolved; missed-Monday behavior per programs-spec missed-day handling), and (b) the Bench entry point as a standing quick action (also added to editor-review S1 Draft Queue). *Origin: F12, F4.*

**N7 · `generation-engine.md` · §2 templates + §7 S3** — Add template *families*: the seeded three become the `architecture` family; new `bench` family ships with the **whitepaper** template (sections, length range, schema posture, gating-page metadata — full template spec to be authored in that doc's session). `dm_pieces` gains `origin: 'architecture' | 'one_off'`. *Origin: F4.*

**N8 · `research-architecture.md` · §2.5/§2.7** — `origin: one_off` pieces are excluded from cluster-cohesion and architecture math; the legacy-adoption path explicitly admits Bench pieces ("adopt into cluster"). *Origin: F4.*

**N9 · `measurement.md` · §2.3/§2.8** — `origin` becomes a reporting dimension; Bench pieces fully enrolled in piece scoring, freshness, and the health report (a Bench activity line where volume warrants). *Origin: F4.*

**N10 · `dm-platform-integration.md` · §2 capability descriptions** — `content_generation` (and `content_research` where calendar-relevant) gain the cross-app sentence: content pieces supporting other Kinetiks programs (outbound, advertising, PR) requested by Marcus or any Program via the standard command channel, correlation IDs end-to-end. Note the designated growth path (visible request-for-content surface) as scoped, sequenced later. *Origin: F5.*

**N11 · `publishing.md` · §2.5 stage 2 (validate)** — Add the tier cadence check: published pieces in the rolling window vs. tier cap (Orbit 1/2wk · Momentum 1/wk · Gravity 3/wk), failing with an honest upgrade-aware message; drafting and review never capped. *Origin: F6.*

**N12 · `platform-asks.md` · append** — **Ask 15:** tier entitlement surface — DM tier names (Orbit/Momentum/Gravity) mapped to platform tiers (free/standard/pro) in billing; entitlement readable beyond `ToolContext.tier` if cadence windows need server-side enforcement support. **Ask 16:** clarify `platform-contract.md` §9.3's "always needs approval" against §9.2's confidence escalation (one-line contract fix; DM's reading per product spec §1.1). **Ask 17 (carries N3 if platform prefers the ask route):** standalone autonomy extension. *Origin: F6, F9, F2.*

**N13 · All ten subsystem specs + `screen-system.md` · authority headers** — One sweep: remove "ux/experience-architecture.md (binding…; not yet written — to be reconciled when it lands)" clauses; primitives now cite `dm-product-spec.md` §6. `dark-madder-v2-doc-system.md` §2/§3.3 gets a supersession note (experience-architecture retired into product spec §6 + screen-system + design-language §8). *Origin: F7.*

**N14 · `dm-platform-integration.md` · §2 manifest** — `color: '#4E49A4'` (iris), icon: dark-matter halo mark with `flask-conical` as Lucide fallback. (Resolves the conflict design-language §2 filed.) *Origin: F8.*

**N15 · Repo/project housekeeping** — Delete the duplicate `DM_Design_Language.md`; canonical file is `ux/design-language.md`. *Origin: F10.*

**N16 · Glossary sweep, all specs (cosmetic, lowest priority)** — Canonical forms per product spec §9: **fast-track** (always hyphenated) · **voice-match score** · **monthly health report** (lowercase generic) · **piece** as canonical noun ("article" only in shipped CMS-facing tool names). *Origin: F11.*

---

## Class C — Previously filed write-backs, consolidated (confirmed this session)

**C1 · `dm-platform-integration.md` · §2/§3** — Add `content_knowledge` capability + tools `dm_get_training_status`, `dm_get_customer_lexicon`, `dm_ingest_customer_language`; status features `voice_training_strength`, `lexicon_entries_count`. *Filed by trainer §10.*

**C2 · `platform-asks.md`** — Ask 11 (customer-communication connectors: Gmail/Reddit/app-store, standalone-accessible); Ask 12 annotated with trainer as second embedding consumer. *Filed by trainer §10.*

**C3 · `dm-platform-integration.md` · §5.2** — Add `dm_content_link_insertion` quick-approval row (link micro-refresh batches; `change_scope` derived from actual diff); status feature `legacy_pieces_count`. *Filed by research §10.*

**C4 · `platform-asks.md`** — Ask 12 (embedding routing in `@kinetiks/ai`, voyage-3-large config); Ask 3 cross-reference (territory embeddings as radar's subscription payload). *Filed by research §10.*

**C5 · `dm-platform-integration.md` · §2** — Status features `image_generation_available`, `templates_customized`. *Filed by generation §10.*

**C6 · `platform-asks.md`** — Ask 12 amendment: broaden to non-completion model routing (embeddings *and* image generation); splits named second consumer. *Filed by generation §10.*

**C7 · `dm-platform-integration.md` · §5.4** — Submission payload references `submitted_content_hash` as the canonical anchor for card-side edit diffs. *Filed by editor-review §10.*

**C8 · `knowledge-trainer.md` · §2.6** — Cross-reference: capture contract lives at editor-review §2.3 (`capture_surface`, no-double-count reconciler). **`platform-asks.md` #6** — append DM's concrete reconciliation rule as the DM-contributed half of guarantee (a). *Filed by editor-review §10.*

**C9 · `dm-platform-integration.md` · §2/§10** — Status feature `cms_asset_upload_available`. (No `dm_unpublish_article` tool — D15 declines it; takedown is in-app consequential, internal route.) *Filed by publishing.*

**C10 · `dm-platform-integration.md` · §2–§3** — Add read-only `dm_get_radar_events` with radar's shipped description, under a **new `content_radar` capability** (audit recommendation: keep `content_freshness`'s description load-bearing as-is); status feature `radar_events_pending`. **§4.1** — `filterProposal` blocklist additions `radar_event`, `dismissal_pattern`, `subscription_payload`. *Filed by radar D35/§10; capability-home decision made here.*

**C11 · `research-architecture.md` · §2.5/§7-S5** — Approval-time cannibalization check gains the `track='fast'` exclusion with merge-later flag (consumed at convert-to-evergreen, lifecycle §2.5). **`platform-asks.md` #3** — annotate radar §2.2 as the DM-contributed event-shape/subscription/feed-discipline contract. *Filed by radar §10.*

**C12 · `lifecycle-freshness.md` · §2.5** — New trigger row: AI-visibility citability findings (D40) — diagnosis, winning passage, probe refs attach as gap record and evidence chips. *Filed by ai-visibility.*

**C13 · `dm-platform-integration.md` · §4.1** — Originating-subsystem column gains ai-visibility's D41 `competitive` proposer (evidence-floored observed-competitor proposals). **`platform-asks.md`** — Ask 14 (probe-engine clients as platform integration; `AI_ENGINES` interim). *Filed by ai-visibility.*

**C14 · `editor-review.md`** — Capture intake admits `capture_surface: 'split_queue'`; checklist engine registers the split item family with `invocation: 'split'`. *Filed by splits §10/D48.*

**C15 · `measurement.md` · §2.8** — Splits activity line joins the monthly health report (explicitly marked manual until agent-communication distribution data exists). *Filed by splits D49.*

**C16 · `dm-platform-integration.md` · §8** — Authority-composite ownership clarification (research computes components; measurement composes; the composition formula's owner stated). *Filed by measurement.*

**C17 · `platform-asks.md`** — Ask 13 (Oracle goal/attribution query surface for the report's goal-pace section). *Filed by measurement.*

**C18 · `analytics-goals-engine-spec.md` · §3.3** *(platform-owned doc)* — Dark Madder metric table corrected to the seven `dm_`-prefixed keys; traffic/engagement rows removed per zero-ingestion (GA4/GSC via Oracle, joined by URL/topic dimensions). *Flagged by integration §8; route via platform-asks if the platform team owns the edit.*

---

## Suggested application order

1. **N15** (one-minute dedup) → 2. **Integration-doc batch** (N1, N2, N4, N10, N14, C1, C3, C5, C7, C9, C10, C13, C16 — one session, one doc) → 3. **platform-asks batch** (N12, C2, C4, C6, C8b, C11b, C13b, C17, C18-route) → 4. **Subsystem batch** (N7, N8, N9, N11, C8a, C11a, C12, C14, C15) → 5. **screen-system batch** (N5, N6) → 6. **Header sweep** (N13) → 7. **Glossary sweep** (N16, lowest priority). **N3** rides the platform's schedule; N4 waits on it.

---

*Dark Madder v2 — write-back ledger — June 2026*
