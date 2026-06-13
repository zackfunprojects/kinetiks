/**
 * Authority Agent operator executor per Kinetiks Contract Addendum §2.5.
 *
 * Pipeline (per CLAUDE.md Lesson 1 — validation is structural, not
 * post-hoc):
 *
 *   1. Evidence brief (deterministic data + 1 Haiku summarizer call).
 *   2. Sonnet proposal call producing a GrantProposalEnvelope JSON.
 *   3. JSON parse + structural validation against the registered
 *      action classes and trigger schemas.
 *   4. ONE retry on validation failure, with the failure messages
 *      threaded into the user prompt as additional context.
 *   5. Persist via the atomic propose_authority_grants RPC.
 *   6. Emit one authority_grant_proposed Ledger entry per inserted
 *      grant, with the source_label from the request payload.
 *
 * Failure modes that are NOT retried:
 *
 *   - Two consecutive validation failures → emit a fail Ledger entry
 *     (out-of-band marker; not one of the canonical 8 authority types)
 *     and throw AuthorityProposalError to the caller. The route
 *     surface returns a structured 422.
 *   - Persistence RPC failure → the agent did its job; surface the
 *     RPC error. No retry because the RPC has its own internal
 *     consistency checks.
 *
 * Per CLAUDE.md Lesson 6, no multi-turn tool use: one Haiku evidence
 * call, one Sonnet proposal call, optional one retry. Pre-decided.
 */

import "server-only";

import { routeAskClaude } from "@kinetiks/ai";
import { listActionClasses, extractTemplatePlaceholders } from "@kinetiks/tools";
import type { ActionClassDescriptor } from "@kinetiks/types";
import type { OperatorExecutor } from "@kinetiks/runtime";

import {
  buildAuthorityProposeSystemPrompt,
  buildAuthorityProposeUserPrompt,
  renderActionClassCatalog,
  type ActionClassCatalogEntry,
} from "@/lib/ai/prompts/authority-agent";
import {
  authorityAgentInputsSchema,
  grantProposalEnvelopeSchema,
  type AuthorityAgentInput,
  type AuthorityAgentOutput,
} from "../descriptors";
import { buildEvidenceBrief } from "./authority-agent/evidence";
import { persistProposals } from "./authority-agent/persist";
import { validateEnvelope } from "./authority-agent/validate";
import { METRIC_REGISTRY } from "@/lib/oracle/metric-schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";

export class AuthorityProposalError extends Error {
  readonly code:
    | "not_implemented"
    | "structural_validation_exhausted"
    | "json_parse_failed"
    | "persistence_failed";
  readonly validation_errors: string[];
  constructor(
    code: AuthorityProposalError["code"],
    message: string,
    validation_errors: string[] = [],
  ) {
    super(message);
    this.name = "AuthorityProposalError";
    this.code = code;
    this.validation_errors = validation_errors;
  }
}

export const authorityAgentExecute: OperatorExecutor = async (rawInput) => {
  const input: AuthorityAgentInput = authorityAgentInputsSchema.parse(rawInput);

  // Phase 4 v1 ships only campaign_launch end-to-end. The other three
  // request types are valid at the input boundary but the executor
  // raises not_implemented until Phase 5.
  if (input.type !== "campaign_launch") {
    throw new AuthorityProposalError(
      "not_implemented",
      `Authority Agent request type "${input.type}" is registered but not implemented in Phase 4. Ship Phase 5 to enable.`,
    );
  }

  // 1. Evidence brief.
  const brief = await buildEvidenceBrief({
    account_id: input.account_id,
    caller_app: "kinetiks_id",
  });

  // 2-4. Sonnet propose + retry-once on validation failure.
  const action_class_catalog = renderActionClassCatalog(
    buildCatalog(listActionClasses()),
  );
  const system = buildAuthorityProposeSystemPrompt({
    action_class_catalog,
    anomaly_metric_catalog: renderAnomalyMetricCatalog(),
  });

  let lastErrors: string[] = [];
  let envelope: ReturnType<typeof grantProposalEnvelopeSchema.parse> | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const user = buildAuthorityProposeUserPrompt({
      request_payload: input,
      evidence_brief: brief,
      prior_attempt_errors: lastErrors,
    });
    const raw = await routeAskClaude(
      "authority_agent.propose",
      user,
      system,
      {
        context: { accountId: input.account_id, userId: input.user_id },
        // Bound the proposal output. Empirically a 3-member envelope
        // with full evidence runs ~4-6k tokens. Cap at 8k for safety.
        maxTokens: 8192,
      },
    );

    const parsed = parseEnvelope(raw, input.invocation_id, input.type);
    if (!parsed.ok) {
      lastErrors = parsed.errors;
      continue;
    }

    const validation = validateEnvelope(parsed.envelope);
    if (!validation.ok) {
      lastErrors = validation.errors;
      continue;
    }

    envelope = parsed.envelope;
    break;
  }

  if (!envelope) {
    // Both attempts failed. Emit a non-canonical Ledger marker so the
    // failure is visible in ops without polluting the canonical 8
    // authority event types. Use the generic `expiration` event — the
    // marker shape is internal to ops, not surfaced to customers.
    const admin = createAdminClient();
    try {
      await admin.from("kinetiks_ledger").insert({
        account_id: input.account_id,
        event_type: "expiration",
        source_app: "kinetiks_id",
        source_operator: "authority_agent",
        detail: {
          entity: "authority_proposal_attempt",
          reason: "structural_validation_exhausted",
          invocation_id: input.invocation_id,
          last_errors: lastErrors.slice(0, 10),
        },
      });
    } catch (ledgerErr) {
      await captureException(ledgerErr, {
        tags: {
          route: "/api/internal/operators/authority-agent/invoke",
          action: "authority_agent.failure_marker_ledger",
          stage: "persist",
          app: "id",
        },
        user: { id: input.account_id },
        extra: {
          invocation_id: input.invocation_id,
          request_type: input.type,
        },
      });
    }
    await captureException(
      new Error("Authority Agent proposal exhausted retries"),
      {
        tags: {
          route: "/api/internal/operators/authority-agent/invoke",
          action: "authority_agent.propose",
          stage: "validate",
          app: "id",
        },
        user: { id: input.account_id },
        extra: {
          invocation_id: input.invocation_id,
          request_type: input.type,
          last_errors: lastErrors.slice(0, 10),
        },
      },
    );
    throw new AuthorityProposalError(
      "structural_validation_exhausted",
      "Authority Agent could not produce a valid proposal after two attempts",
      lastErrors,
    );
  }

  // 5. Persist (atomic via RPC). Map any RPC failure to the canonical
  //    AuthorityProposalError("persistence_failed") so the route
  //    surface returns the correct status and Sentry captures with
  //    the canonical tag shape.
  let persisted: Awaited<ReturnType<typeof persistProposals>>;
  try {
    persisted = await persistProposals({
      account_id: input.account_id,
      granted_by: input.user_id,
      proposed_by_agent: `authority_agent:${input.invocation_id}`,
      envelope,
    });
  } catch (persistErr) {
    throw new AuthorityProposalError(
      "persistence_failed",
      persistErr instanceof Error
        ? persistErr.message
        : "Authority Agent proposal persistence failed",
    );
  }

  // 6. One authority_grant_proposed Ledger entry per grant.
  await emitProposedLedgerEntries({
    account_id: input.account_id,
    invocation_id: input.invocation_id,
    request_type: input.type,
    source_label: input.source_label,
    grant_ids: persisted.grant_ids,
    envelope,
  });

  return {
    invocation_id: input.invocation_id,
    request_type: input.type,
    proposed_grant_ids: persisted.grant_ids,
    approval_ids: persisted.approval_ids,
  } satisfies AuthorityAgentOutput;
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * E3 — the registered metric keys an anomaly trigger may reference,
 * rendered for the system prompt. Pulled from the Oracle metric
 * registry (the same source the runtime MetricCacheReader resolves
 * against), so the prompt, the validator, and the evaluator agree.
 */
function renderAnomalyMetricCatalog(): string {
  const lines = METRIC_REGISTRY.map((m) => `- ${m.key}: ${m.name} (${m.source_app})`);
  return lines.length > 0 ? lines.join("\n") : "(no metrics registered)";
}

function buildCatalog(
  descriptors: ReadonlyArray<ActionClassDescriptor>,
): ActionClassCatalogEntry[] {
  return descriptors.map((d) => ({
    action_class: d.action_class,
    description: d.description,
    customer_template: d.customer_template,
    rate_limit_default: d.rate_limit_default
      ? { count: d.rate_limit_default.count, window: d.rate_limit_default.window }
      : null,
    available_in_default_standing_grants: d.available_in_default_standing_grants,
    always_requires_budget_attachment: d.always_requires_budget_attachment,
    llm_judgment_budget: d.llm_judgment_budget
      ? {
          daily_usd: d.llm_judgment_budget.daily_usd,
          monthly_usd: d.llm_judgment_budget.monthly_usd,
          model: d.llm_judgment_budget.model,
          fallback_on_budget_exhausted:
            d.llm_judgment_budget.fallback_on_budget_exhausted,
        }
      : null,
    constraint_schema_summary: summarizeConstraintSchema(d),
  }));
}

function summarizeConstraintSchema(d: ActionClassDescriptor): string {
  const placeholders = extractTemplatePlaceholders(d.customer_template);
  const fields = placeholders.length > 0 ? placeholders.join(", ") : "(none)";
  return `required customer-template fields: { ${fields} }. Full shape per descriptor; validator will re-check at proposal time.`;
}

function parseEnvelope(
  raw: string,
  expected_invocation_id: string,
  expected_request_type: AuthorityAgentInput["type"],
):
  | { ok: true; envelope: ReturnType<typeof grantProposalEnvelopeSchema.parse> }
  | { ok: false; errors: string[] } {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let candidate: unknown;
  try {
    candidate = JSON.parse(stripped);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `Failed to parse model output as JSON: ${(err as Error)?.message ?? "unknown"}. The output must be a single JSON object with no markdown fences.`,
      ],
    };
  }
  const parsed = grantProposalEnvelopeSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`,
      ),
    };
  }
  // Cross-check the envelope's invocation_id AND request_type against
  // the request — the model can hallucinate either; lock both down so
  // a successful envelope for a different campaign or a different
  // request type cannot leak through.
  const errors: string[] = [];
  if (parsed.data.invocation_id !== expected_invocation_id) {
    errors.push(
      `envelope.invocation_id must equal the request invocation_id "${expected_invocation_id}" (received "${parsed.data.invocation_id}")`,
    );
  }
  if (parsed.data.request_type !== expected_request_type) {
    errors.push(
      `envelope.request_type must equal the request request_type "${expected_request_type}" (received "${parsed.data.request_type}")`,
    );
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, envelope: parsed.data };
}

async function emitProposedLedgerEntries(args: {
  account_id: string;
  invocation_id: string;
  request_type:
    | "campaign_launch"
    | "workflow_start"
    | "standing_review"
    | "first_connect";
  source_label: string;
  grant_ids: string[];
  envelope: ReturnType<typeof grantProposalEnvelopeSchema.parse>;
}): Promise<void> {
  const admin = createAdminClient();
  // One row per inserted grant. Even on a partial Ledger insert
  // failure the grants themselves are intact (the propose RPC already
  // committed); audit drift is a soft-fail logged to Sentry.
  for (let i = 0; i < args.grant_ids.length; i++) {
    const grant_id = args.grant_ids[i];
    const member = args.envelope.proposed_grants[i];
    try {
      const { error } = await admin.from("kinetiks_ledger").insert({
        account_id: args.account_id,
        event_type: "authority_grant_proposed",
        source_app: "kinetiks_id",
        source_operator: "authority_agent",
        grant_id,
        detail: {
          grant_id,
          invocation_id: args.invocation_id,
          request_type: args.request_type,
          source_label: args.source_label,
          action_classes: member.grant.granted_capabilities.map(
            (c) => c.action_class,
          ),
          scope_type: member.grant.scope_type,
          parent_grant_id: member.grant.parent_grant_id,
        },
      });
      if (error) {
        await captureException(new Error(error.message), {
          tags: {
            route: "/api/internal/operators/authority-agent/invoke",
            action: "authority_agent.ledger_proposed",
            stage: "persist",
            app: "id",
          },
          user: { id: args.account_id },
          extra: { grant_id, invocation_id: args.invocation_id },
        });
      }
    } catch (err) {
      // Same fallthrough: ledger is best-effort post-RPC. Capture so
      // the failure shows up in Sentry with the canonical tag shape
      // rather than only in dev logs.
      await captureException(err, {
        tags: {
          route: "/api/internal/operators/authority-agent/invoke",
          action: "authority_agent.ledger_proposed",
          stage: "persist",
          app: "id",
        },
        user: { id: args.account_id },
        extra: { grant_id, invocation_id: args.invocation_id },
      });
    }
  }
}
