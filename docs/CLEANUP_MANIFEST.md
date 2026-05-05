# Docs Cleanup — Inventory Manifest (Phase 1 working file)

> **Temporary working file.** Will be deleted at the end of the cleanup (Phase 9).
> This is the inventory the Cowork plan asks for: every file, what it covers, when it was last touched, what it references, what references it, where it should live, and a confidence read.

Date generated: 2026-05-04
Cleanup plan: `Kinetiks Docs Cleanup Plan.md` (uploaded by user, not in repo)

---

## Reading the table

- **Refs out** = other docs/code this file links to
- **Refs in** = other docs/code that link to this file (excluding `node_modules`, `.git`, `.next`)
- **Proposed destination** is per the Cowork plan's target structure
- **Confidence**: high / medium / low — how sure the destination is

---

## A. Files at `docs/` root

### A1. `docs/Collaborative Workspace Spec - Claude.md`

- **Summary:** Defines the split-panel, shared-surface interaction model for the Kinetiks desktop and web app — the workspace where the named system and the user co-occupy app surfaces with presence, annotations, and a kill-switch task drawer.
- **Last meaningful update:** No git-tracked history (file present but never committed; `git log` returns nothing for this path).
- **Refs out:** `cross-app-command-router-spec.md`, `approval-system-spec.md`, `CLAUDE-v2.md` (the last reference points to a doc that no longer exists at root — the v2 CLAUDE was moved to `docs/archive/CLAUDE-v2-legacy.md`).
- **Refs in:** None found in repo. The current root `CLAUDE.md` does not reference it. The current `kinetiks-product-spec-v3.md` does not reference it.
- **Proposed destination:** `docs/collaborative-workspace-spec.md` (rename, stay at root).
- **Confidence:** high. The plan calls this rename out explicitly and says v3 should pick up a reference to it in Section 4.

### A2. `docs/kinetiks-core-architecture-v2.md`

- **Summary:** The 2026 agent-native technical architecture — tool registry, agent runtime, insight store, metric cache, approval membrane.
- **Last meaningful update:** 2026-04-08
- **Refs out:** None to other docs (self-contained architecture doc).
- **Refs in:** Root `CLAUDE.md` (line 427).
- **Proposed destination:** Stay at `docs/` root (canonical operating doc).
- **Confidence:** high.

### A3. `docs/kinetiks-product-spec-v3.md`

- **Summary:** The unified product specification — the canonical product source of truth that supersedes v1, v2, and the Terminal spec.
- **Last meaningful update:** 2026-04-03
- **Refs out:** None to other docs in this folder structure (it is the top of the chain).
- **Refs in:** Root `CLAUDE.md`; every spec in `docs/specs/` (`agent-communication-layer-spec`, `analytics-goals-engine-spec`, `approval-system-spec`, `cross-app-command-router-spec`, `sneaky-spec`).
- **Proposed destination:** Stay at `docs/` root (CANONICAL).
- **Confidence:** high.

### A4. `docs/kinetiks-roadmap.md`

- **Summary:** Strategic roadmap and priority stack (tool infrastructure first, then GA4/Stripe/GSC integrations, then Harvest fix, then Dark Madder migration, then background agents, then suite expansion).
- **Last meaningful update:** 2026-04-08
- **Refs out:** None inside docs/.
- **Refs in:** Root `CLAUDE.md` (line 410, 428).
- **Proposed destination:** Stay at `docs/` root.
- **Confidence:** high.

### A5. `docs/platform-contract.md`

- **Summary:** How apps, integrations, and agents plug into Kinetiks — the integration contract every app and connector follows.
- **Last meaningful update:** 2026-04-08
- **Refs out:** None inside docs/.
- **Refs in:** Root `CLAUDE.md` (lines 5, 78, 168, 290, 426).
- **Proposed destination:** Stay at `docs/` root.
- **Confidence:** high.

---

## B. Files in `docs/specs/`

### B1. `docs/specs/GTM Autopilot Specification.md`

- **Summary:** Specifies the autonomous execution layer — the system that continuously generates work that advances the user's goals and fills the approval queue without prompting.
- **Last meaningful update:** No git-tracked history (file added since last commit).
- **Refs out:** Approval System Spec, Analytics & Goals Engine Spec, Cross-App Command Router Spec.
- **Refs in:** Referenced by name from `Kinetiks Programs Spec.md` (line 5, 948).
- **Proposed destination:** `docs/specs/autopilot-spec.md` (rename per plan §3.2).
- **Confidence:** high.

### B2. `docs/specs/Kinetiks Programs Spec.md`

- **Summary:** Introduces the Goal → Program → Workflow → Task four-level execution hierarchy and the persistent-orchestration architecture that sits above ephemeral workstreams. The file's H1 still reads "Kinetiks Platform Addendum" — it was the file the plan calls "Platform Addendum."
- **Last meaningful update:** No git-tracked history.
- **Refs out:** GTM Autopilot Spec, Approval System Spec, Analytics & Goals Engine Spec, Cross-App Command Router Spec, Platform Contract.
- **Refs in:** None outside its own self-references.
- **Proposed destination:** `docs/specs/programs-spec.md` (rename per plan §3.1).
- **Confidence:** high. The plan asked to confirm the file's primary subject is the four-level hierarchy — confirmed.

### B3. `docs/specs/agent-communication-layer-spec.md`

- **Summary:** Email, Slack, calendar integration as first-class agent communication surfaces.
- **Last meaningful update:** 2026-04-08
- **Refs out:** `docs/kinetiks-product-spec-v3.md` (Sections 2, 3.4, 10).
- **Refs in:** Root `CLAUDE.md` (line 433).
- **Proposed destination:** Stay in `docs/specs/`.
- **Confidence:** high.

### B4. `docs/specs/analytics-goals-engine-spec.md`

- **Summary:** Oracle architecture — KPI model, goal system, insight surfacing.
- **Last meaningful update:** 2026-04-08
- **Refs out:** `docs/kinetiks-product-spec-v3.md` (Sections 7, 8.3, 10.7).
- **Refs in:** Root `CLAUDE.md` (line 432); referenced by Programs spec and GTM Autopilot spec.
- **Proposed destination:** Stay in `docs/specs/`.
- **Confidence:** high.

### B5. `docs/specs/approval-system-spec.md`

- **Summary:** The trust architecture — confidence-based autonomy, learning loop, quality gates.
- **Last meaningful update:** 2026-04-08
- **Refs out:** `docs/kinetiks-product-spec-v3.md` (Sections 6, 14).
- **Refs in:** Root `CLAUDE.md` (line 430); collaborative workspace spec; Programs spec; GTM Autopilot spec.
- **Proposed destination:** Stay in `docs/specs/`.
- **Confidence:** high.

### B6. `docs/specs/cross-app-command-router-spec.md`

- **Summary:** How Marcus orchestrates across Kinetiks apps and external connectors via tool calls.
- **Last meaningful update:** 2026-04-08
- **Refs out:** `docs/kinetiks-product-spec-v3.md` (Sections 5.4, 10.3-10.6).
- **Refs in:** Root `CLAUDE.md` (line 431); collaborative workspace spec; Programs spec; GTM Autopilot spec.
- **Proposed destination:** Stay in `docs/specs/`.
- **Confidence:** high.

### B7. `docs/specs/marcus-conversation-quality-plan.md`

- **Summary:** Plan 1 for the Marcus engine — implementation plan for the conversation quality enforcement pipeline (manifest → system prompt → post-generation validator → rewrite).
- **Last meaningful update:** 2026-04-08
- **Refs out:** Internal references to `docs/marcus-conversation-quality.md` (a downstream summary).
- **Refs in:** Root `CLAUDE.md` (line 435).
- **Proposed destination:** `docs/archive/marcus-conversation-quality-plan.md` per plan §3.4 (Plan 1 was superseded by Plan 2 / `marcus-engine-v2-plan.md`).
- **Confidence:** high.
- **Note:** Move requires updating the root `CLAUDE.md` reference (Phase 7) and adding a top-of-file supersession note.

### B8. `docs/specs/marcus-conversation-quality.md`

- **Summary:** A short (61-line) summary of the Plan 1 quality-enforcement system architecture — three layers (manifest, system prompt, post-gen validator), key files, monitoring guidance.
- **Last meaningful update:** 2026-04-08
- **Refs out:** None.
- **Refs in:** None outside the Plan 1 doc that defined it.
- **Proposed destination:** **AMBIGUOUS — flag for user judgment.** The Cowork plan does not mention this short summary file. Two options: (a) move it alongside Plan 1 to `docs/archive/` since it summarizes Plan 1's now-superseded approach, or (b) keep it in `docs/specs/` as the lightweight system-overview doc. Recommendation: **move to `docs/archive/marcus-conversation-quality.md`** because Plan 1 it summarizes is superseded; the v2 plan supersedes it.
- **Confidence:** medium.

### B9. `docs/specs/marcus-engine-v2-plan.md`

- **Summary:** Plan 2 — the current Marcus conversation engine. Replaces "generate then validate" with "pre-compute then generate" via a Haiku pre-analysis brief, separates actions from response text, and adds a conversation memory system.
- **Last meaningful update:** 2026-04-08
- **Refs out:** Internal references to `docs/marcus-v2-testing-playbook.md` (a sibling testing doc).
- **Refs in:** Root `CLAUDE.md` (line 434).
- **Proposed destination:** Stay in `docs/specs/`.
- **Confidence:** high.
- **Plan §4 banner:** Pending. The plan asks for a banner only IF a Marcus 2.5 patch doc exists. See Phase 4 outcome below.

### B10. `docs/specs/marcus-v2-testing-playbook.md`

- **Summary:** Manual testing playbook (six pass/fail tests) to verify the v2 engine — disconnected app awareness, memory persistence, evidence grounding, brevity, anti-sycophancy, action separation.
- **Last meaningful update:** 2026-04-08
- **Refs out:** None.
- **Refs in:** Referenced by `marcus-engine-v2-plan.md`.
- **Proposed destination:** **AMBIGUOUS — flag for user judgment.** Not mentioned in the cleanup plan. It is a live operational doc that pairs with the v2 engine plan. Recommendation: **keep in `docs/specs/`** since it directly supports the canonical v2 spec.
- **Confidence:** medium.

### B11. `docs/specs/sneaky-spec.md`

- **Summary:** Founder-only meta-agent that scans the AI/marketing/tech landscape weekly and produces Claude-Code-ready feature proposals for Kinetiks.
- **Last meaningful update:** 2026-04-08
- **Refs out:** `docs/kinetiks-product-spec-v3.md`.
- **Refs in:** None outside this folder.
- **Proposed destination:** Stay in `docs/specs/`.
- **Confidence:** high. The plan's specs/ enumeration ends with "[any other specs already in specs/]" — this file qualifies.

### B12. `docs/specs/spec-addendum-chat-ux.md`

- **Summary:** Two-part addendum to the v3 spec: (A) Marcus's awareness of the product suite + ability to recommend app activations; (B) Chat tab UX patterns for discoverability, onboarding, power-user efficiency.
- **Last meaningful update:** 2026-04-08
- **Refs out:** v3 product spec (instructed insertions into Sections 5 and 10).
- **Refs in:** None outside this folder.
- **Proposed destination:** **AMBIGUOUS — flag for user judgment.** This file is explicitly an addendum that asked to be merged into the v3 spec but appears never to have been merged. Two choices: (a) keep in `docs/specs/` as a live supplementary spec, or (b) flag to the user that the merge into v3 is still pending. Recommendation: **keep in `docs/specs/`** for now and note in the final summary that the merge into v3 is an outstanding edit.
- **Confidence:** medium.

### B13. `docs/specs/archive/` (empty directory)

- **Summary:** Empty subdirectory inside `docs/specs/`.
- **Proposed destination:** Either remove or move into `docs/archive/`. Recommendation: **leave as-is** (empty directories are not the cleanup target), but flag for user.
- **Confidence:** low.

---

## C. Files in `docs/archive/`

### C1. `docs/archive/CLAUDE-v2-legacy.md`

- **Summary:** The previous (v2) root `CLAUDE.md`. Superseded by the current root `CLAUDE.md`.
- **Last meaningful update:** 2026-04-08
- **Refs out:** Many internal architecture references; references context layer table names like `kinetiks_context_voice`.
- **Refs in:** None outside the archive itself.
- **Proposed destination:** Stay in `docs/archive/`. Per plan §5.1, add a top-of-file supersession note.
- **Confidence:** high.

---

## D. Files in `docs/legacy/`

All files here have last-meaningful-update of 2026-04-03 and have no inbound references from canonical docs.

### D1. `docs/legacy/KNOWLEDGE_INTEGRATION.md`

- **Summary:** How the marketing knowledge layer (`packages/ai/src/knowledge/`, 13 modules / 35 markdown files) is loaded by operators on demand.
- **Proposed destination:** Stay in `docs/legacy/` (per the plan: legacy preserves historical context). Add a supersession note.
- **Confidence:** medium. **Open question:** this is technically still-accurate operational guidance for `@kinetiks/ai` knowledge loading. If the user considers it active, it could move to `docs/specs/`. The plan defaults legacy items to legacy unless surfaced.

### D2. `docs/legacy/Kinetiks Agent Architecture v2.docx` (binary)
### D3. `docs/legacy/Kinetiks Cross App Intelligence Spec.docx` (binary)
### D4. `docs/legacy/Kinetiks Product Spec (1).docx` (binary)
### D5. `docs/legacy/Kinetiks Product Spec Addendum.docx` (binary)
### D6. `docs/legacy/Kinetiks Sentinel Spec.docx` (binary)
### D7. `docs/legacy/Kinetiks_Agent_Native_Architecture.docx` (binary)
### D8. `docs/legacy/Marcus Operator Spec.docx` (binary)

- **Summary:** Older `.docx` versions of product, agent architecture, sentinel, cross-app intelligence, and Marcus operator specs. All predate the markdown rewrites that became the current canonical docs.
- **Proposed destination:** Stay in `docs/legacy/`. Cannot edit `.docx` content to add a top-of-file supersession note (binary). **Open question for user:** how should supersession be annotated for `.docx` files? Options: (a) leave `.docx` alone (the plan's supersession-note step doesn't translate to binary docs), (b) add a sibling `.docx.SUPERSEDED.md` companion file per binary, (c) add a single `docs/legacy/README.md` listing what supersedes each binary. Recommendation: **option (c)** — one `docs/legacy/README.md` covering all binary supersessions plus a uniform note for any `.md` file in `docs/legacy/`.
- **Confidence:** medium.

### D9. `docs/legacy/Marcus Core Prompt.md`

- **Summary:** Earlier static + dynamic prompt definition for Marcus the Cortex Operator.
- **Proposed destination:** Stay in `docs/legacy/`. Add a supersession note pointing to `docs/specs/marcus-engine-v2-plan.md`.
- **Confidence:** high.

### D10. `docs/legacy/Marcus_CLAUDE_MD_Addendum.md`

- **Summary:** Older addendum that asked Claude Code to integrate Marcus into the live `CLAUDE.md`. The integration happened — this addendum is historical.
- **Proposed destination:** Stay in `docs/legacy/`. Add supersession note pointing to current root `CLAUDE.md`.
- **Confidence:** high.

### D11. `docs/legacy/Slack_Setup_Guide.md`

- **Summary:** Setup guide for the Marcus Slack bot — how to create the Slack app and connect it.
- **Proposed destination:** **AMBIGUOUS — flag for user judgment.** This is operational, not historical. Could be a live runbook. Two options: (a) leave in `docs/legacy/` and add supersession note pointing to the agent communication layer spec, (b) promote it to `docs/specs/agent-communication-layer-spec/` as a runbook. Recommendation: **keep in legacy** with a note pointing to `agent-communication-layer-spec.md` for live behavior; if the setup steps are still current, the user can promote later.
- **Confidence:** medium.

---

## E. Build phases (currently at `kinetiks/build-phases/`, NOT under `docs/`)

The cleanup plan's target structure puts these under `docs/build-phases/built/`. They are currently at the repo root.

### E1–E6. `build-phases/phase-{1..6}-{...}.md`

- **Summary:** Implementation plans for phases 1-6 (Core Shell, Approval System, Cortex Evolution, Command Router, Oracle Analytics, Communication Layer). Per `CLAUDE.md` Current State table, all six phases are complete.
- **Last meaningful update:** 2026-04-04 (all six)
- **Refs out:** Phase 1 and Phase 3 reference `docs/specs/kinetiks-product-spec-v3.md` — but the v3 spec is at `docs/kinetiks-product-spec-v3.md`. **These are broken references** that need updating in Phase 7.
- **Refs in:** None.
- **Proposed destination:** `docs/build-phases/built/` (move and create the directory structure). Plan §6 says the phases-1-6 belong in `built/`.
- **Confidence:** high.
- **Open question:** Is the `kinetiks/build-phases/` directory at the repo root supposed to move under `docs/`, or just be reorganized in place? The plan's target tree puts `build-phases/` inside `docs/`. Recommendation: **move into `docs/build-phases/`** (matches plan target structure).

---

## F. Files outside `docs/` flagged by the plan

### F1. DeskOf documents

- **Plan §5 step 3:** "If they are still in the kinetiks docs folder, move them all to `docs/legacy/deskof/`."
- **Reality:** DeskOf docs live in `apps/do/` (and `apps/do/docs/specs/`), NOT in the kinetiks `docs/` folder.
  - `apps/do/DeskOf-Build-Companion.docx`, `DeskOf-Build-Plan.md`, `DeskOf-CLAUDE.md`, `DeskOf-Final-Supplement.docx`, `DeskOf-Integration-Architecture.docx`, `DeskOf-Product-Brief.docx`, `DeskOf-Quality-Addendum.docx`, `DeskOf-Research-Spike.docx` (8 files in `apps/do/`)
  - Plus duplicates in `apps/do/docs/specs/`
- **Recommendation:** **Do not move.** The plan's instruction was conditional on them being in `docs/`. They are not. Leave them in `apps/do/` for the eventual DeskOf spinoff repo. Surface this in the final summary.

### F2. Terminal spec

- **Plan §5 step 3:** "Any older Terminal spec" should live in `docs/legacy/`.
- **Reality:** `apps/terminal/kinetiks-terminal-spec-v2.md` exists (68k file).
- **Recommendation:** **Open question — flag for user.** Two options: (a) leave at `apps/terminal/` since it's an app-scoped spec, (b) move to `docs/legacy/` since the Terminal product direction was retired per the plan's intent. The plan implies (b) but the file is not currently in `docs/`. Recommendation: **leave in place** until the user confirms.
- **Confidence:** low.

### F3. Per-app `CLAUDE.md` files

- `apps/do/CLAUDE.md` (DeskOf — being spun out)
- `apps/do/DeskOf-CLAUDE.md`
- These are out of scope for the docs cleanup but the plan calls them out for cross-reference checking in Phase 7.

---

## G. Marcus 2.5 patch search (Phase 4 dry run)

Per plan §4 step 1, searched the entire kinetiks repo (not just docs/) for these strings:

| Search string | Hits |
|---|---|
| `kinetiks_context_voice` | `docs/archive/CLAUDE-v2-legacy.md` (line 503, in a SQL example), and code files in `apps/id/src/lib/` (live code, not a doc) |
| `manifest builder` | `docs/specs/marcus-engine-v2-plan.md` (lines 130, 1453, references "keep existing manifest builder from Plan 1") |
| `sparse-data` | Code files in `apps/id/src/lib/`; not a doc |
| `double footer` / `double-footer` | None |
| `v2.5` | None in docs or app code |
| `2.5 patch` | None |
| `action-extractor.ts` | Code files in `apps/id/src/lib/`; not a doc |

**Conclusion:** **No Marcus 2.5 patch doc exists in the repo.** Per plan §4 step 3, this is the path that gets surfaced to the user. Cowork must NOT write the patch itself.

---

## H. Cross-reference issues already detected

These will be addressed in Phase 7 but are flagged here so the user knows what's coming.

1. **`build-phases/phase-1-core-shell.md` line 12** — references `docs/specs/kinetiks-product-spec-v3.md` (broken; actual path is `docs/kinetiks-product-spec-v3.md`).
2. **`build-phases/phase-3-cortex-evolution.md` line 12** — same broken reference.
3. **`docs/Collaborative Workspace Spec - Claude.md` line 5** — references `CLAUDE-v2.md` (broken; the v2 CLAUDE was archived to `docs/archive/CLAUDE-v2-legacy.md`).
4. **Root `CLAUDE.md` lines 434, 435** — points to `docs/specs/marcus-engine-v2-plan.md` (correct) and `docs/specs/marcus-conversation-quality-plan.md` (will move to `docs/archive/` in Phase 3, so the line needs updating).
5. **`docs/specs/marcus-conversation-quality-plan.md` lines 1741, 1745, 1813** — internal references to `docs/marcus-conversation-quality.md` (the short summary file currently at `docs/specs/marcus-conversation-quality.md` — already moved into specs/, so the path in the Plan 1 doc is stale).

---

## I. Files surfaced for user judgment before Phase 2 begins

These are the items the plan asks me to flag before proceeding. **Phase 2 does not begin until the user gives direction.**

1. **`docs/specs/marcus-conversation-quality.md`** (B8) — short summary of Plan 1. Move to `archive/` alongside Plan 1, or keep in `specs/`? **Recommendation:** archive.
2. **`docs/specs/marcus-v2-testing-playbook.md`** (B10) — manual test playbook for the v2 engine. Stay in `specs/`? **Recommendation:** yes, keep in specs.
3. **`docs/specs/spec-addendum-chat-ux.md`** (B12) — addendum that should have been merged into v3 but never was. Keep as live spec, or surface that the merge into v3 is the real next step? **Recommendation:** keep, and call out the unmerged addendum as a follow-up edit.
4. **`docs/specs/archive/`** — empty subdirectory. Leave as-is or remove?
5. **`docs/legacy/KNOWLEDGE_INTEGRATION.md`** (D1) — operationally still accurate. Stay in legacy or promote to specs?
6. **`docs/legacy/*.docx` (D2–D8)** — seven binary files. How to annotate supersession? **Recommendation:** create a single `docs/legacy/README.md` that lists what supersedes each binary.
7. **`docs/legacy/Slack_Setup_Guide.md`** (D11) — possibly still a live runbook. Keep in legacy or promote to specs/runbooks?
8. **`apps/terminal/kinetiks-terminal-spec-v2.md`** (F2) — Terminal direction retired. Move to `docs/legacy/` per plan intent, or leave at `apps/terminal/`? **Recommendation:** move to `docs/legacy/terminal/` after user confirms; the plan implies this.
9. **`apps/do/` DeskOf docs** (F1) — plan said move "if in docs/." They're in `apps/do/`. **Recommendation:** leave alone.
10. **`build-phases/`** at repo root (E) — move under `docs/build-phases/` per plan target tree, or reorganize in place? **Recommendation:** move under `docs/build-phases/` (matches target structure).
11. **No Marcus 2.5 patch doc exists** (G) — plan says: stop here and surface this. The user (in chat with Claude, not Cowork) needs to write that doc against actual code. **Recommendation:** Phase 4 will skip the move and add no banner; just surface the gap.
12. **`docs/Collaborative Workspace Spec - Claude.md`** references `CLAUDE-v2.md`. The reference is broken whether or not we rename the file. Update it to `archive/CLAUDE-v2-legacy.md` during Phase 7.

---

## J. Summary count

- 5 files at `docs/` root (4 stay, 1 renames)
- 13 entries in `docs/specs/` (one of which is an empty `archive/` subdir)
- 1 file in `docs/archive/`
- 11 files in `docs/legacy/` (7 binary, 4 markdown)
- 6 files in `build-phases/` (currently outside `docs/`)
- 8 files in `apps/do/` (DeskOf, out of scope)
- 1 file in `apps/terminal/` (Terminal spec)

Total docs touched by Phase 2-9 work: ~25 markdown files moved/renamed/edited, ~7 binary files annotated indirectly via a `legacy/README.md`, plus 6 build-phase files moved into a new structure.

---

## Stop point

Per plan §1 step 4: **Stop and ask the user to review this manifest before proceeding to Phase 2.** Specifically requesting direction on items 1–11 in section I.
