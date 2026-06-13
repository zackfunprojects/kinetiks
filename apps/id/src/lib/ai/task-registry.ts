/**
 * Prompt task registry for every Claude call that flows through
 * `routeAskClaude` / `routeAskClaudeMultiTurn` / `routeStreamClaude` in
 * apps/id.
 *
 * Per CLAUDE.md, every task surfaced by the router must be registered
 * before first call. Unregistered tasks fail at the router boundary
 * with `AITaskError('missing_prompt')` rather than at Anthropic.
 *
 * Add new tasks here, then update the call site to pass the task name.
 * The task naming convention is `<surface>.<short_purpose>`:
 *   - `marcus.*` — the Marcus engine v2 pipeline
 *   - `cartographer.*` — onboarding intake
 *   - Future: `archivist.*`, `oracle.*`, `authority_agent.*`
 *
 * Versions are pinned strings committed alongside the prompt code.
 * Bump the version when the prompt's behavior changes materially.
 */

import { registerPromptTask } from "@kinetiks/ai";

let _registered = false;

export function registerKinetiksPromptTasks(): void {
  if (_registered) return;
  _registered = true;

  // ── Marcus engine v2 ──────────────────────────────────────
  // Persona response — the primary Sonnet streaming call.
  registerPromptTask({
    task: "marcus.persona_stream",
    version: "v2-2026-05",
    role: "balanced",
  });
  // Non-streaming persona response (legacy + cron paths).
  registerPromptTask({
    task: "marcus.persona_response",
    version: "v2-2026-05",
    role: "balanced",
  });
  // Pre-analysis evidence brief.
  registerPromptTask({
    task: "marcus.pre_analysis",
    version: "v2-2026-05",
    role: "fast",
  });
  // Intent classification.
  registerPromptTask({
    task: "marcus.intent",
    version: "v2-2026-05",
    role: "fast",
  });
  // Tool decision — D1's step 7.5. Picks which (single) tool best
  // answers the user question, then the Runtime invokes it before Sonnet
  // generates the response.
  registerPromptTask({
    task: "marcus.tool_decision",
    version: "v2-2026-05",
    role: "fast",
  });
  // Action generation (v2 — separate Haiku pass, output schema is constrained).
  registerPromptTask({
    task: "marcus.action_generate",
    version: "v2-2026-05",
    role: "fast",
  });
  // Action extraction (legacy v1 path; remains while v1 callers exist).
  registerPromptTask({
    task: "marcus.action_extract",
    version: "v1-legacy",
    role: "fast",
  });
  // Thread memory write-back.
  registerPromptTask({
    task: "marcus.memory_extract",
    version: "v2-2026-05",
    role: "fast",
  });
  // Auto-title for new threads.
  registerPromptTask({
    task: "marcus.thread_title",
    version: "v2-2026-05",
    role: "fast",
  });
  // Command translation (intent → structured Synapse command).
  registerPromptTask({
    task: "marcus.command_translate",
    version: "v2-2026-05",
    role: "balanced",
  });

  // ── Cartographer onboarding ──────────────────────────────
  // Adaptive conversation (followups, voice probes). Runs at `fast`: the
  // sole call site always overrode the registered model to Haiku, so the
  // role now reflects reality (the override is dropped at the call site).
  registerPromptTask({
    task: "cartographer.conversation",
    version: "v1-2026-05",
    role: "fast",
  });
  // Voice calibration (writing-sample analysis).
  registerPromptTask({
    task: "cartographer.calibrate",
    version: "v1-2026-05",
    role: "balanced",
  });
  // Voice extraction (from crawled site copy).
  registerPromptTask({
    task: "cartographer.extract_voice",
    version: "v1-2026-05",
    role: "balanced",
  });
  // Brand extraction.
  registerPromptTask({
    task: "cartographer.extract_brand",
    version: "v1-2026-05",
    role: "balanced",
  });
  // Brand extraction — subjective fields second-pass.
  registerPromptTask({
    task: "cartographer.extract_brand_subjective",
    version: "v1-2026-05",
    role: "balanced",
  });
  // Org extraction.
  registerPromptTask({
    task: "cartographer.extract_org",
    version: "v1-2026-05",
    role: "balanced",
  });
  // Positioning + market extraction.
  registerPromptTask({
    task: "cartographer.extract_positioning",
    version: "v1-2026-05",
    role: "balanced",
  });
  // Social handles extraction.
  registerPromptTask({
    task: "cartographer.extract_social",
    version: "v1-2026-05",
    role: "fast",
  });

  // ── Oracle (D2 Slice 10) ──────────────────────────────────
  // Signal polish — one batched Haiku call per Oracle run that takes
  // deterministic detector signals and produces customer-facing summary
  // text + a one-sentence suggested_action label. Falls back to
  // deterministic detector output if Haiku fails.
  registerPromptTask({
    task: "oracle.signal_polish",
    version: "v1-2026-05",
    role: "fast",
  });

  // ── Cortex Identity ───────────────────────────────────────
  // Layer reflection: a single Haiku call that reads one Context layer's
  // data and reflects back, in one plain sentence, what the system
  // understands about the business from it ("KIT KNOWS THIS"). On-demand
  // only (button-triggered), so no auto-cost on every page view.
  registerPromptTask({
    task: "cortex.layer_reflection",
    version: "v1-2026-05",
    role: "fast",
  });

  // ── Authority Agent (Phase 4 — Kinetiks Contract Addendum §2.5) ──
  // Evidence summarizer: a single Haiku call that compresses the
  // Learning Ledger's authority-event history (last 90 days) into a
  // short narrative of "what the customer keeps editing / rejecting,"
  // fed into the proposal prompt's evidence block. Cheap; runs only
  // when ledger events exist.
  registerPromptTask({
    task: "authority_agent.evidence_summarize",
    version: "v1-2026-05",
    role: "fast",
  });
  // Proposal generator: the structured Sonnet call that produces the
  // GrantProposalEnvelope. Forced JSON output via prompt rules + a
  // retry-on-validation-failure loop in the executor. The cost of a
  // bad proposal is the customer losing trust in the proposal
  // pipeline — exactly the case where the extra Sonnet $ pays off.
  registerPromptTask({
    task: "authority_agent.propose",
    version: "v1-2026-05",
    role: "balanced",
  });
}
