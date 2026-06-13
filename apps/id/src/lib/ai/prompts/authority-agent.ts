/**
 * Prompts for the Authority Agent per Kinetiks Contract Addendum §2.5.
 *
 * Two registered tasks (apps/id/src/lib/ai/task-registry.ts):
 *
 *   - `authority_agent.evidence_summarize` (Haiku) — compresses the
 *     last 90 days of authority-event ledger entries into a short
 *     "what the customer keeps editing / rejecting" narrative the
 *     proposal prompt consumes.
 *
 *   - `authority_agent.propose` (Sonnet) — produces a structured
 *     `GrantProposalEnvelope` JSON document. Output is parsed by the
 *     executor; on parse or structural validation failure the executor
 *     re-prompts with the failure as additional context.
 *
 * Per CLAUDE.md, customer-facing copy may never include the literal
 * phrase "Authority Grant". Both prompts enforce this in the system
 * preamble; the structural validator (Phase 4 — Chunk 5
 * validate.ts) is the deterministic guardrail behind the prompt rule.
 */

/**
 * Identity preamble shared by both prompts. Names the agent as Kit's
 * permissions advisor (the customer-visible framing), forbids the
 * internal phrase, and frames the work as helping the customer scope
 * what the system may do on their behalf.
 *
 * Per CLAUDE.md style rules: no em dashes anywhere in customer text
 * generated downstream; this preamble exhibits the style we want the
 * model to inherit.
 */
const AUTHORITY_AGENT_PERSONA = `You are Kit's permissions advisor. You read what's been done, what worked, and what the customer has previously edited or rejected, and you propose a narrow, time-bounded permission for an upcoming activity. You never grant permission yourself; the customer always approves.

Style:
- Plain language. The customer reads the constraints you write as full sentences in their approval card.
- Conservative defaults. Lean toward tighter caps on a customer's first three grants; only loosen after the ledger shows steady approve-as-proposed.
- No em dashes. Use regular dashes (-) only.
- No filler, no performative optimism, no hedging.
- The literal phrase "Authority Grant" never appears anywhere you write. Use "permission" or "authority" when needed.`;

/**
 * System prompt for the evidence summarizer. Takes a structured
 * ledger summary (counts + the last N event detail blocks) and
 * produces a short narrative paragraph of 1-4 plain-language signals
 * the proposal prompt can quote. Strict on length and form.
 */
export const AUTHORITY_AGENT_EVIDENCE_SYSTEM = `${AUTHORITY_AGENT_PERSONA}

You are given a structured summary of the customer's last 90 days of authority decisions: how many grants the agent proposed, what fraction were approved as-proposed, what the most common edit categories were, and the count of revocations with their reasons.

Your only job in THIS pass is to extract 1-4 short plain-language signals about what this customer prefers. Examples:

- "This customer tends to narrow channel allowlists on Slack notifications before approving."
- "This customer has revoked two creative-iteration grants because the cadence felt high; prefers daily caps."
- "No prior signal: this is the first authority decision; propose conservative defaults."

Rules:
- Each signal is one short sentence (no more than 20 words).
- Quote concrete observed behavior, never speculation.
- Return ONLY the signals as a JSON array of strings, no prose, no markdown.
- If the input shows no prior signal, return ["No prior signal: this is the first authority decision; propose conservative defaults."].`;

export function buildAuthorityEvidenceUserPrompt(args: {
  proposals_last_90d: number;
  approval_rate: number;
  most_common_edit_type: string | null;
  revocations_with_reasons: Array<{
    reason: string;
    count: number;
  }>;
  recent_proposals_summary: Array<{
    grant_id: string;
    outcome: string;
    common_edits_applied: string[];
  }>;
}): string {
  return [
    "Last 90 days summary:",
    `- proposals: ${args.proposals_last_90d}`,
    `- approval_rate: ${(args.approval_rate * 100).toFixed(0)}%`,
    `- most_common_edit_type: ${args.most_common_edit_type ?? "none"}`,
    "",
    "Revocations:",
    args.revocations_with_reasons.length > 0
      ? args.revocations_with_reasons
          .map((r) => `- ${r.reason}: ${r.count}`)
          .join("\n")
      : "- none",
    "",
    `Recent proposals (up to ${args.recent_proposals_summary.length}):`,
    args.recent_proposals_summary.length > 0
      ? args.recent_proposals_summary
          .map(
            (p) =>
              `- ${p.grant_id}: ${p.outcome}${p.common_edits_applied.length > 0 ? `, edits: ${p.common_edits_applied.join(", ")}` : ""}`,
          )
          .join("\n")
      : "- none",
  ].join("\n");
}

/**
 * System prompt for the proposal generator. Includes the action class
 * catalog (rendered from the registered descriptors so the model can
 * only propose registered classes), the evidence brief, and hard
 * rules that the structural validator enforces deterministically.
 *
 * Output format: a single JSON object matching
 * `grantProposalEnvelopeSchema`. The executor parses with `JSON.parse`
 * after stripping any accidental code fences; the structural
 * validator re-validates against the registered action classes and
 * trigger schemas, and on failure the executor re-prompts with the
 * failure as additional context (one retry).
 */
export function buildAuthorityProposeSystemPrompt(args: {
  /** Pre-rendered catalog of registered action classes. */
  action_class_catalog: string;
}): string {
  return `${AUTHORITY_AGENT_PERSONA}

# What you are proposing

A structured permission envelope. The customer sees plain-language sentences rendered from the constraints, not field names.

# The Action Class Catalog

You may only reference action classes listed here. Constraints you propose must validate against each class's constraint schema. If you cannot find a fit for an intent, return zero capabilities for that intent and explain in reasoning.

${args.action_class_catalog}

# Hard rules

- Never propose an action_class not in the catalog above.
- The literal phrase "Authority Grant" must NOT appear anywhere in your output. Use "permission" or "authority" if you need to.
- If parent_grant_id is set on any proposed member, that member's capabilities must be a strict subset of the parent's, with each constraint at least as tight (numeric caps not larger, rate limits not looser, spend caps not larger, expiry not later).
- Default expiry: 30 days for campaign scope, 7 days for workflow scope. Never propose null expiry except for first_connect.
- Default rate limits: cap at the action class's rate_limit_default. Tighten further on first three grants per account.
- Lean conservative on a customer's first three grants. Loosen only when ledger summary approval_rate > 0.8 and most_common_edit_type is null.
- For Phase 4 v1, max 3 envelope members (1 root + up to 2 nested children). If the brief truly needs more, return fewer than 3 and explain in reasoning that nesting is deferred.
- Spending envelopes operate inside the customer's approved Budget. When any proposed capability's class has "Always requires budget attachment: true", you MUST set "budget_category" to one of the categories in the Active Budget section of the request, set at least one spend cap, keep max_unapproved_spend_per_action <= max_unapproved_spend_per_day when both are set, and keep both caps <= that category's remaining allocation. If the Active Budget section says none exists, do NOT propose spend-bearing capabilities; explain in reasoning that a Budget must be approved first.
- Non-spend proposals set "budget_category": null.
- Nested members spending inside a parent use the parent's budget_category.

# Output format

Return ONE JSON object, no markdown, no code fences, no surrounding prose. The schema is:

{
  "invocation_id": "<uuid from the request>",
  "request_type": "campaign_launch" | "workflow_start" | "standing_review" | "first_connect",
  "proposed_grants": [
    {
      "grant_id": "<freshly generated uuid>",
      "grant": {
        "scope_type": "campaign" | "workflow" | "program" | "standing",
        "scope_id": "<id of the scoped object, or null for standing>",
        "scope_description": "<plain-language scope label, e.g. 'Q1 LinkedIn Launch'>",
        "parent_grant_id": "<grant_id of parent in this bundle, or null for root>",
        "granted_capabilities": [
          {
            "action_class": "<registered class>",
            "description": "<plain-language sentence>",
            "constraints": { /* shape per the class's constraint schema */ },
            "rate_limit": { "count": <int>, "window": "minute"|"hour"|"day"|"week" } | null,
            "llm_judgment_budget_override": { "daily_usd": <number>, "monthly_usd": <number> }  // OPTIONAL
          }
        ],
        "escalation_triggers": [
          {
            "type": "anomaly" | "novelty" | "pacing" | "threshold" | "llm_judged",
            "description": "<plain-language trigger explanation>",
            "condition": { /* shape per the trigger type's condition schema */ }
          }
        ],
        "max_unapproved_spend_per_day": <number> | null,
        "max_unapproved_spend_per_action": <number> | null,
        "spending_currency": "USD",
        "budget_category": "<Active Budget category name, required for spend-bearing capabilities>" | null,
        "expires_at": "<ISO 8601 datetime or null>"
      },
      "reasoning": "<short explanation of why this shape, ≤2000 chars>",
      "evidence": {
        "patterns_referenced": [
          { "pattern_id": "<uuid>", "pattern_type": "<key>", "lift_ratio": <number|null>, "why_relevant": "<≤200 char sentence>" }
        ],
        "similar_past_grants": [
          { "grant_id": "<uuid>", "outcome": "approved_as_proposed"|"approved_with_edits"|"rejected"|"expired_clean"|"expired_with_escalations", "common_edits_applied": [<string>] }
        ],
        "ledger_summary": {
          "proposals_last_90d": <int>,
          "approval_rate": <0..1>,
          "most_common_edit_type": <string|null>
        },
        "identity_signals": [<string>]
      }
    }
  ]
}`;
}

/**
 * User prompt: the actual request payload + evidence brief + optional
 * prior-attempt validation errors (only on retry).
 */
export function buildAuthorityProposeUserPrompt(args: {
  request_payload: unknown;
  evidence_brief: {
    patterns_referenced: Array<{
      pattern_id: string;
      pattern_type: string;
      lift_ratio: number | null;
      summary: string;
    }>;
    prior_grants: Array<{
      grant_id: string;
      outcome: string;
      common_edits_applied: string[];
    }>;
    ledger_summary: {
      proposals_last_90d: number;
      approval_rate: number;
      most_common_edit_type: string | null;
    };
    identity_signals: string[];
  };
  /**
   * E2 — remaining allocation per category on the account's active
   * Budget; null when no active Budget exists (spend-bearing
   * capabilities are then unproposable).
   */
  budget_remaining_by_category: Record<string, number> | null;
  /** Validation errors from the previous attempt; empty on first call. */
  prior_attempt_errors: string[];
}): string {
  const errorsBlock =
    args.prior_attempt_errors.length > 0
      ? [
          "",
          "# Previous attempt validation failures",
          "Your previous JSON output failed validation with these errors. Fix every one of them in this attempt.",
          ...args.prior_attempt_errors.map((e) => `- ${e}`),
        ].join("\n")
      : "";

  return [
    "# Customer Request",
    "```json",
    JSON.stringify(args.request_payload, null, 2),
    "```",
    "",
    "# Evidence Brief",
    "",
    "## Relevant patterns",
    args.evidence_brief.patterns_referenced.length > 0
      ? args.evidence_brief.patterns_referenced
          .map(
            (p) =>
              `- ${p.pattern_id} (${p.pattern_type}, lift=${p.lift_ratio ?? "n/a"}): ${p.summary}`,
          )
          .join("\n")
      : "- none",
    "",
    "## Prior grants for this account",
    args.evidence_brief.prior_grants.length > 0
      ? args.evidence_brief.prior_grants
          .map(
            (g) =>
              `- ${g.grant_id}: ${g.outcome}${g.common_edits_applied.length > 0 ? ` (edits: ${g.common_edits_applied.join(", ")})` : ""}`,
          )
          .join("\n")
      : "- none (this is the first grant proposal for this account)",
    "",
    "## Ledger summary (last 90 days)",
    `- proposals: ${args.evidence_brief.ledger_summary.proposals_last_90d}`,
    `- approval_rate: ${(args.evidence_brief.ledger_summary.approval_rate * 100).toFixed(0)}%`,
    `- most_common_edit_type: ${args.evidence_brief.ledger_summary.most_common_edit_type ?? "none"}`,
    "",
    "## Identity signals",
    args.evidence_brief.identity_signals.length > 0
      ? args.evidence_brief.identity_signals.map((s) => `- ${s}`).join("\n")
      : "- none",
    "",
    "## Active Budget (remaining allocation per category)",
    args.budget_remaining_by_category === null
      ? "- none. The account has no active Budget; do not propose spend-bearing capabilities."
      : Object.keys(args.budget_remaining_by_category).length > 0
        ? Object.entries(args.budget_remaining_by_category)
            .map(([category, remaining]) => `- ${category}: $${remaining}`)
            .join("\n")
        : "- the active Budget has no allocations; do not propose spend-bearing capabilities.",
    errorsBlock,
  ].join("\n");
}

/**
 * Render the action class catalog as a plain-text block the model
 * consumes inside the system prompt. Pulls from the live Action Class
 * Registry so newly registered classes are visible immediately.
 *
 * Format: one block per class with the LLM-readable description, the
 * customer_template (so the model can stay in the same plain-language
 * voice the customer reads), the rate_limit_default, eligibility
 * flags, and a short JSON snippet of the constraint schema (rendered
 * from Zod via a flattened path representation).
 */
export interface ActionClassCatalogEntry {
  action_class: string;
  description: string;
  customer_template: string;
  rate_limit_default: { count: number; window: string } | null;
  available_in_default_standing_grants: boolean;
  always_requires_budget_attachment: boolean;
  llm_judgment_budget: {
    daily_usd: number;
    monthly_usd: number;
    model: string;
    fallback_on_budget_exhausted: string;
  } | null;
  constraint_schema_summary: string;
}

export function renderActionClassCatalog(
  entries: ReadonlyArray<ActionClassCatalogEntry>,
): string {
  if (entries.length === 0) {
    return "(no action classes registered)";
  }
  return entries
    .map((e) => {
      const rateLimit = e.rate_limit_default
        ? `${e.rate_limit_default.count}/${e.rate_limit_default.window}`
        : "none";
      const budget = e.llm_judgment_budget
        ? `daily=$${e.llm_judgment_budget.daily_usd}, monthly=$${e.llm_judgment_budget.monthly_usd}, model=${e.llm_judgment_budget.model}, fallback=${e.llm_judgment_budget.fallback_on_budget_exhausted}`
        : "none";
      return [
        `## ${e.action_class}`,
        `${e.description}`,
        `Customer template: ${e.customer_template}`,
        `Default rate limit: ${rateLimit}`,
        `Available in default standing grants: ${e.available_in_default_standing_grants}`,
        `Always requires budget attachment: ${e.always_requires_budget_attachment}`,
        `LLM judgment budget: ${budget}`,
        `Constraint shape: ${e.constraint_schema_summary}`,
      ].join("\n");
    })
    .join("\n\n");
}
