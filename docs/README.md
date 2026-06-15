# Kinetiks Documentation

This folder contains the canonical documentation for the Kinetiks platform. The structure mirrors how Daydreamer Labs organizes its docs: a single source-of-truth product spec, supporting subsystem specifications, and historical references preserved but never built from.

## Structure

### Root — Canonical operating documents

These canonical documents govern current work. Read these first.

- **`kinetiks-product-spec-v3.md`** — The definitive product specification. Supersedes all prior product specs (v1, v2, Terminal spec). When any other document conflicts with v3, v3 wins. If you think v3 is wrong, raise it in a PR — don't work around it.
- **`platform-contract.md`** — How apps, integrations, and agents plug into Kinetiks. Read before building anything that connects to the core.
- **`Kinetiks Contract Addendum.md`** — Part of the canonical contract. Introduces the Pattern Library, Authority Grants, Operator Workflows, and the multi-user placeholder schema. The platform-contract version bumps with its merger; read it before any work on Patterns, Authority, internal app workflows, or Implosion.
- **`kinetiks-core-architecture-v2.md`** — Technical architecture for the agent-native platform. Tool registry, agent runtime, insight store, approval membrane.
- **`collaborative-workspace-spec.md`** — The desktop app's defining interaction model. Split-panel collaboration, presence layer, annotations, task drawer with kill switch. This is what makes the desktop app worth installing.
- **`kinetiks-roadmap.md`** — Strategic roadmap and priority stack.

### `specs/` — Subsystem specifications

Detailed specifications for individual subsystems. Each spec sits inside the scope defined by `kinetiks-product-spec-v3.md` and elaborates on a specific area.

- `approval-system-spec.md` — The trust architecture (confidence-based autonomy, learning loop, quality gates)
- `cross-app-command-router-spec.md` — How Marcus orchestrates across Kinetiks apps and external connectors
- `analytics-goals-engine-spec.md` — Oracle architecture, KPI model, goal system
- `agent-communication-layer-spec.md` — Email, Slack, calendar integration
- `marcus-engine-v2-plan.md` — The current Marcus conversation engine
- `marcus-v2-testing-playbook.md` — Manual testing playbook for the v2 engine
- `programs-spec.md` — Programs / Workflows / Tasks hierarchy (formerly "Platform Addendum")
- `autopilot-spec.md` — GTM Autopilot specification
- `sneaky-spec.md` — Founder-only meta-agent that produces Claude-Code-ready feature proposals
- `spec-addendum-chat-ux.md` — Chat tab UX patterns and Marcus product-suite intelligence (intended to be merged into v3 — that merge is still pending)

### `archive/`

Documents that have been superseded but are kept as historical reference. **Never build from these.** Each file has a top-of-file note saying what supersedes it.

- `CLAUDE-v2-legacy.md` — the prior root `CLAUDE.md`, superseded by the current root `CLAUDE.md`
- `marcus-conversation-quality-plan.md` — Plan 1 for the Marcus engine, superseded by `specs/marcus-engine-v2-plan.md`
- `marcus-conversation-quality.md` — Plan 1 system summary, superseded by `specs/marcus-engine-v2-plan.md`

### `legacy/`

Older iterations of the product spec (v1, v2), older versions of canonical documents, and product directions that have been retired. See `legacy/README.md` for the full supersession map (binary `.docx` files cannot be annotated in place).

- `terminal/` — the retired Kinetiks Terminal product direction
- `deskof/` — DeskOf documentation, preserved here until the DeskOf spinoff repo is created
- Earlier `.docx` product/architecture/sentinel/marcus-operator specs (see `legacy/README.md` for what supersedes each)
- `KNOWLEDGE_INTEGRATION.md`, `Marcus Core Prompt.md`, `Marcus_CLAUDE_MD_Addendum.md`, `Slack_Setup_Guide.md` — older markdown references

### `build-phases/built/`

Implementation plans for phases 1 through 7 (including the sub-phases 1.5, 1.6, 1.7, 1.7.1, 4.5 and the parallel tracks at 2/3/4/5), all complete per the root `CLAUDE.md`. Reference material for understanding how the existing `apps/id` surfaces were built.

- `phase-1-core-shell.md`
- `phase-1.5-fixture-emitter.md`
- `phase-1.6-budget-and-authority-nav.md`
- `phase-1.7-kinetiks-internal-pattern-types.md`
- `phase-1.7.1-connection-evidence-close-signal.md`
- `phase-2-approval-system.md`
- `phase-2-empirical-decay-calibration.md`
- `phase-3-cortex-evolution.md`
- `phase-3-operator-workflows-platform.md`
- `phase-4-authority-grants.md`
- `phase-4-command-router.md`
- `phase-4.5-ledger-check-validate.md`
- `phase-5-default-standing-grants.md`
- `phase-5-oracle-analytics.md`
- `phase-6-communication-layer.md`
- `phase-7-nango-connect-end-to-end.md`

### `build-phases/upcoming/`

Implementation plans for sprints not yet built. Currently empty (placeholder `.gitkeep` only). New phase plans are authored here as each sprint is scoped.

---

## Working with this folder

- **Single source of truth.** `kinetiks-product-spec-v3.md` is the spec. Subsystem specs elaborate within v3's scope. Historical files are not authoritative.
- **Write back to canonical docs when something changes.** If a feature is reshaped during a sprint, the v3 product spec or the relevant subsystem spec gets updated. Don't let canonical docs drift from reality.
- **No silent deletion.** Files only ever move from canonical → archive or canonical → legacy. They don't disappear.
- **Annotated supersession.** Every legacy or archived file should have a top-of-file note saying what supersedes it. If you find one without that note, add it. Binary files are covered by `legacy/README.md` and `archive/`-level notes where applicable.

---

## See also

- Root `CLAUDE.md` — operating instructions for Claude Code in this repo
- Per-app `CLAUDE.md` files at `apps/{app-key}/CLAUDE.md` (where they exist)
