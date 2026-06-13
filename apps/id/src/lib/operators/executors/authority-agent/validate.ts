/**
 * Authority Agent structural validator per the Kinetiks Contract Addendum §2.7.
 *
 * Runs AFTER the Sonnet proposal call parses cleanly into the envelope
 * shape, BEFORE the persistence RPC. Every check is deterministic and
 * fails loudly with a structured error so the executor can re-prompt
 * Sonnet with the failure description (one retry per
 * apps/id/src/lib/operators/executors/authority-agent.ts).
 *
 * Seven checks (in order):
 *
 *  1. Every `action_class` resolves in the Action Class Registry.
 *  2. Every `constraints` payload parses against its registered
 *     `ActionClassDescriptor.constraint_schema`.
 *  3. Every `escalation_triggers[].condition` parses against its
 *     per-type Zod schema (packages/types/src/authority-triggers.ts).
 *  4. Customer-language rule: the literal phrase "Authority Grant" is
 *     never present in `scope_description` or any capability
 *     `description`.
 *  5. Parent subset rules (§2.8): when a member references a
 *     parent_grant_id in the same bundle, the child's capabilities are
 *     ⊆ the parent's; numeric constraints are at least as tight;
 *     spend caps ≤ parent's; expiry ≤ parent's; spend-bearing children
 *     operate inside the parent's Budget category.
 *  6. Spend envelope ≤ Budget category (E2, addendum §2.11 "the
 *     envelope itself cannot exceed the approved Budget for the
 *     relevant category"). Spend-bearing grants (any capability whose
 *     action class declares `always_requires_budget_attachment`) must:
 *     attach a `budget_category`; carry an envelope (at least one cap);
 *     keep per-action ≤ per-day when both are set; and — when the
 *     caller supplies a `BudgetValidationContext` — fit both caps
 *     inside the named category's remaining allocation on the
 *     account's active Budget. No active Budget = no spend authority
 *     ("Budget remains non-negotiable"). Callers that deliberately
 *     skip the Budget read (the narrow path, which only ever TIGHTENS
 *     an envelope the customer already approved against a Budget)
 *     omit the context and get the structural checks only.
 *  7. Customer template placeholder coverage: every `{key}` placeholder
 *     in the action class's `customer_template` has a matching field in
 *     the proposed `constraints`. Without this, the customer-facing
 *     card would render literal `{key}` strings.
 */

import { getActionClass } from "@kinetiks/tools";
import { getMetricDefinition } from "@/lib/oracle/metric-schema";
import type {
  EscalationTrigger,
  GrantProposalEnvelope,
  GrantProposalEnvelopeMember,
  GrantedCapability,
} from "@kinetiks/types";
import { ESCALATION_TRIGGER_CONDITION_SCHEMAS } from "@kinetiks/types";
import { extractTemplatePlaceholders } from "@kinetiks/tools";

const AUTHORITY_GRANT_PHRASE_RE = /authority\s+grant/i;

export interface ValidateResult {
  ok: boolean;
  errors: string[];
}

/**
 * Snapshot of the account's active Budget for the §2.11 envelope ≤
 * Budget-category check. `remaining_by_category` maps each
 * kinetiks_budget_allocations.category to `allocated_amount -
 * spent_amount` on the budget with approval_status='active';
 * null means the account has NO active Budget (spend authority is
 * then unproposable). Built by loadBudgetValidationContext in the
 * Authority Agent executor.
 */
export interface BudgetValidationContext {
  remaining_by_category: Record<string, number> | null;
}

export function validateEnvelope(
  envelope: GrantProposalEnvelope,
  budget?: BudgetValidationContext,
): ValidateResult {
  const errors: string[] = [];

  // Convenience: build a parent_grant_id → member map for §2.8 nesting checks.
  const byGrantId = new Map<string, GrantProposalEnvelopeMember>();
  for (const m of envelope.proposed_grants) byGrantId.set(m.grant_id, m);

  for (let i = 0; i < envelope.proposed_grants.length; i++) {
    const member = envelope.proposed_grants[i];
    const path = `proposed_grants[${i}]`;

    // 4a. Phrase check on scope_description.
    if (AUTHORITY_GRANT_PHRASE_RE.test(member.grant.scope_description)) {
      errors.push(
        `${path}.grant.scope_description contains the forbidden phrase "Authority Grant" (use "permission" or "authority")`,
      );
    }

    for (let j = 0; j < member.grant.granted_capabilities.length; j++) {
      const cap = member.grant.granted_capabilities[j];
      const capPath = `${path}.grant.granted_capabilities[${j}]`;

      // 1. Action class registration.
      const descriptor = getActionClass(cap.action_class);
      if (!descriptor) {
        errors.push(
          `${capPath} references unregistered action_class "${cap.action_class}"`,
        );
        continue;
      }

      // 2. Constraints validate against the class's schema.
      const parsed = descriptor.constraint_schema.safeParse(cap.constraints);
      if (!parsed.success) {
        errors.push(
          `${capPath}.constraints failed action class schema for "${cap.action_class}": ${parsed.error.issues
            .map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`)
            .join("; ")}`,
        );
      }

      // 4b. Phrase check on capability description.
      if (AUTHORITY_GRANT_PHRASE_RE.test(cap.description)) {
        errors.push(
          `${capPath}.description contains the forbidden phrase "Authority Grant" (use "permission" or "authority")`,
        );
      }

      // 7. Customer template placeholders.
      const placeholders = extractTemplatePlaceholders(descriptor.customer_template);
      for (const placeholder of placeholders) {
        if (!(placeholder in (cap.constraints as Record<string, unknown>))) {
          errors.push(
            `${capPath}.constraints is missing field "${placeholder}" required by action class "${cap.action_class}" customer_template`,
          );
        }
      }
    }

    // 3. Escalation trigger conditions parse.
    for (let k = 0; k < member.grant.escalation_triggers.length; k++) {
      const trigger: EscalationTrigger = member.grant.escalation_triggers[k];
      const triggerPath = `${path}.grant.escalation_triggers[${k}]`;
      const schema = ESCALATION_TRIGGER_CONDITION_SCHEMAS[trigger.type];
      if (!schema) {
        errors.push(`${triggerPath} unknown trigger type "${trigger.type}"`);
        continue;
      }
      const parsed = schema.safeParse(trigger.condition);
      if (!parsed.success) {
        errors.push(
          `${triggerPath}.condition failed schema for "${trigger.type}": ${parsed.error.issues
            .map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`)
            .join("; ")}`,
        );
        continue;
      }
      // 3b (E3). Anomaly triggers must reference a registered metric
      // key — an unknown key can never evaluate, and the runtime now
      // fails CLOSED on unevaluable anomaly protection, which would
      // escalate every action under the grant forever. Catch the typo
      // at proposal time instead.
      if (trigger.type === "anomaly") {
        const metric = (parsed.data as { metric: string }).metric;
        if (!getMetricDefinition(metric)) {
          errors.push(
            `${triggerPath}.condition.metric "${metric}" is not a registered metric key; anomaly protection on it could never evaluate`,
          );
        }
      }
    }

    // 5. Parent subset rules (only if member references a parent in this bundle).
    if (member.grant.parent_grant_id) {
      const parent = byGrantId.get(member.grant.parent_grant_id);
      if (!parent) {
        // The persistence RPC also guards this; we surface it here so
        // the agent re-proposes a self-consistent bundle on retry.
        errors.push(
          `${path}.grant.parent_grant_id="${member.grant.parent_grant_id}" is not a member of this bundle`,
        );
      } else {
        errors.push(
          ...validateParentSubset({
            childPath: path,
            child: member.grant,
            parent: parent.grant,
          }),
        );
      }
    }

    // 6. Spend envelope ≤ Budget category (E2). The per-grant envelope
    //    is additionally enforced at resolution time by
    //    packages/runtime/src/authority.ts (envelope_exceeded /
    //    missing_budget outcomes) — this check catches a malformed
    //    proposal before it ever reaches the customer.
    errors.push(...validateSpendEnvelope(path, member.grant, budget));
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Check 6 — the §2.11 rules for a single proposed grant. Spend-bearing
 * means at least one capability's action class declares
 * `always_requires_budget_attachment`. Unregistered action classes are
 * skipped here (check 1 already reported them).
 */
function validateSpendEnvelope(
  path: string,
  grant: GrantProposalEnvelopeMember["grant"],
  budget?: BudgetValidationContext,
): string[] {
  const errors: string[] = [];

  const spendBearing = grant.granted_capabilities.some(
    (cap) => getActionClass(cap.action_class)?.always_requires_budget_attachment === true,
  );

  const perDay = grant.max_unapproved_spend_per_day;
  const perAction = grant.max_unapproved_spend_per_action;

  // Envelope coherence applies whenever both caps are set, spend-bearing or not.
  if (perDay !== null && perAction !== null && perAction > perDay) {
    errors.push(
      `${path}.grant.max_unapproved_spend_per_action (${perAction}) exceeds max_unapproved_spend_per_day (${perDay}); a single action could never legally spend more than the day allows`,
    );
  }

  if (!spendBearing) return errors;

  if (!grant.budget_category) {
    errors.push(
      `${path}.grant.budget_category is required: the bundle grants a spend-bearing action class (always_requires_budget_attachment) and the envelope must operate inside a Budget category (addendum §2.11)`,
    );
  }
  if (perDay === null && perAction === null) {
    errors.push(
      `${path}.grant must declare a spending envelope (max_unapproved_spend_per_day and/or max_unapproved_spend_per_action) because it grants a spend-bearing action class`,
    );
  }

  if (budget === undefined || !grant.budget_category) return errors;

  if (budget.remaining_by_category === null) {
    errors.push(
      `${path}.grant proposes spend authority but the account has no active Budget; Budget approval is non-negotiable and must come first`,
    );
    return errors;
  }
  const remaining = budget.remaining_by_category[grant.budget_category];
  if (remaining === undefined) {
    const known = Object.keys(budget.remaining_by_category);
    errors.push(
      `${path}.grant.budget_category "${grant.budget_category}" does not match any allocation on the active Budget (categories: ${known.length > 0 ? known.join(", ") : "none"})`,
    );
    return errors;
  }
  if (perDay !== null && perDay > remaining) {
    errors.push(
      `${path}.grant.max_unapproved_spend_per_day (${perDay}) exceeds the remaining allocation (${remaining}) for Budget category "${grant.budget_category}"`,
    );
  }
  if (perAction !== null && perAction > remaining) {
    errors.push(
      `${path}.grant.max_unapproved_spend_per_action (${perAction}) exceeds the remaining allocation (${remaining}) for Budget category "${grant.budget_category}"`,
    );
  }
  return errors;
}

interface ParentSubsetArgs {
  childPath: string;
  child: GrantProposalEnvelopeMember["grant"];
  parent: GrantProposalEnvelopeMember["grant"];
}

/**
 * Convert a {count, window} rate limit to count-per-second so child
 * vs parent comparisons stay meaningful across different windows.
 * "Per minute / hour / day / week" are the only legal windows per the
 * RateLimitConfig schema.
 */
function ratePerSecond(rate: {
  count: number;
  window: "minute" | "hour" | "day" | "week";
}): number {
  const secondsByWindow: Record<typeof rate.window, number> = {
    minute: 60,
    hour: 60 * 60,
    day: 24 * 60 * 60,
    week: 7 * 24 * 60 * 60,
  };
  return rate.count / secondsByWindow[rate.window];
}

function validateParentSubset(args: ParentSubsetArgs): string[] {
  const errors: string[] = [];

  // Capability subset: every child cap's action_class must appear on the parent.
  const parentByClass = new Map<string, GrantedCapability>();
  for (const cap of args.parent.granted_capabilities) {
    parentByClass.set(cap.action_class, cap);
  }
  for (let j = 0; j < args.child.granted_capabilities.length; j++) {
    const cap = args.child.granted_capabilities[j];
    const path = `${args.childPath}.grant.granted_capabilities[${j}]`;
    const parentCap = parentByClass.get(cap.action_class);
    if (!parentCap) {
      errors.push(
        `${path} references action_class "${cap.action_class}" not present on parent grant (child capabilities must be ⊆ parent)`,
      );
      continue;
    }
    // Constraint tightening: every shared numeric constraint must be
    // not-larger-than the parent's. Numeric constraints typically use
    // `max_*` keys; tightening means child.max_* ≤ parent.max_*.
    for (const [k, parentValue] of Object.entries(parentCap.constraints)) {
      const childValue = (cap.constraints as Record<string, unknown>)[k];
      if (
        typeof parentValue === "number" &&
        typeof childValue === "number" &&
        childValue > parentValue
      ) {
        errors.push(
          `${path}.constraints.${k} (${childValue}) exceeds parent constraint (${parentValue}); child must be at least as tight`,
        );
      }
    }
    // Rate limit: child cannot loosen parent's rate. Compare via
    // normalized (count per second) so a child using a different
    // window (e.g. hour vs day) cannot accidentally exceed the
    // parent's effective rate. If the parent has a rate_limit and
    // the child omits one, the child is unbounded → loosening, flag.
    if (parentCap.rate_limit) {
      if (!cap.rate_limit) {
        errors.push(
          `${path}.rate_limit must be set when the parent declares one (${parentCap.rate_limit.count}/${parentCap.rate_limit.window})`,
        );
      } else {
        const childPerSec = ratePerSecond(cap.rate_limit);
        const parentPerSec = ratePerSecond(parentCap.rate_limit);
        if (childPerSec > parentPerSec) {
          errors.push(
            `${path}.rate_limit (${cap.rate_limit.count}/${cap.rate_limit.window}) exceeds parent's effective rate (${parentCap.rate_limit.count}/${parentCap.rate_limit.window})`,
          );
        }
      }
    }
    // LLM judgment budget override: child cannot exceed parent's
    // override on EITHER daily or monthly. If the parent declares an
    // override and the child omits the matching period, that's a
    // loosening (the child inherits the class-level cap, which may be
    // higher than the parent's override).
    const parentOverride = parentCap.llm_judgment_budget_override;
    if (parentOverride) {
      for (const period of ["daily_usd", "monthly_usd"] as const) {
        const parentValue = parentOverride[period];
        if (parentValue === undefined) continue;
        const childValue = cap.llm_judgment_budget_override?.[period];
        if (childValue === undefined) {
          errors.push(
            `${path}.llm_judgment_budget_override.${period} must be set when the parent declares one (${parentValue})`,
          );
        } else if (childValue > parentValue) {
          errors.push(
            `${path}.llm_judgment_budget_override.${period} (${childValue}) exceeds parent override (${parentValue})`,
          );
        }
      }
    }
  }

  // Spend caps: child cannot exceed parent. null on either side means
  // "no cap there"; child=null + parent=number is a loosening, so flag.
  if (
    args.parent.max_unapproved_spend_per_day !== null &&
    (args.child.max_unapproved_spend_per_day === null ||
      args.child.max_unapproved_spend_per_day >
        args.parent.max_unapproved_spend_per_day)
  ) {
    errors.push(
      `${args.childPath}.grant.max_unapproved_spend_per_day must be ≤ parent's (${args.parent.max_unapproved_spend_per_day})`,
    );
  }
  if (
    args.parent.max_unapproved_spend_per_action !== null &&
    (args.child.max_unapproved_spend_per_action === null ||
      args.child.max_unapproved_spend_per_action >
        args.parent.max_unapproved_spend_per_action)
  ) {
    errors.push(
      `${args.childPath}.grant.max_unapproved_spend_per_action must be ≤ parent's (${args.parent.max_unapproved_spend_per_action})`,
    );
  }

  // Budget category: a child operating inside a parent envelope spends
  // from the parent's category — a different category would let nested
  // spend escape the allocation the customer approved the parent
  // against (§2.11 nesting).
  if (
    args.parent.budget_category !== null &&
    args.child.budget_category !== null &&
    args.child.budget_category !== args.parent.budget_category
  ) {
    errors.push(
      `${args.childPath}.grant.budget_category ("${args.child.budget_category}") must match the parent's ("${args.parent.budget_category}")`,
    );
  }

  // Expiry: child cannot extend beyond parent. null on parent = no
  // expiry, anything goes; null on child + non-null parent = loosening.
  if (args.parent.expires_at !== null) {
    if (args.child.expires_at === null) {
      errors.push(
        `${args.childPath}.grant.expires_at must not be null when parent expires at ${args.parent.expires_at}`,
      );
    } else if (
      new Date(args.child.expires_at).getTime() >
      new Date(args.parent.expires_at).getTime()
    ) {
      errors.push(
        `${args.childPath}.grant.expires_at (${args.child.expires_at}) is after parent expiry (${args.parent.expires_at})`,
      );
    }
  }

  return errors;
}
