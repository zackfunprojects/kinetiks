import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Hoisted vi.fn instances — used inside vi.mock factories AND in test
// bodies. vi.hoisted lifts the declarations above the vi.mock calls
// while keeping the same identity for assertion.
const { routeAskClaudeMock, persistProposalsMock, adminInsertMock } = vi.hoisted(
  () => ({
    routeAskClaudeMock: vi.fn(),
    persistProposalsMock: vi.fn(),
    adminInsertMock: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
);

vi.mock("@kinetiks/ai", () => ({
  routeAskClaude: routeAskClaudeMock,
  // Re-export the bits the executor pulls in transitively.
  configureAICallLogger: vi.fn(),
  registerPromptTask: vi.fn(),
  assertPromptTask: vi.fn(),
}));

vi.mock("@/lib/operators/executors/authority-agent/evidence", () => ({
  buildEvidenceBrief: vi.fn().mockResolvedValue({
    patterns_referenced: [],
    prior_grants: [],
    ledger_summary: {
      proposals_last_90d: 0,
      approval_rate: 0,
      most_common_edit_type: null,
    },
    identity_signals: [
      "No prior signal: this is the first authority decision; propose conservative defaults.",
    ],
  }),
}));

vi.mock("@/lib/operators/executors/authority-agent/persist", () => ({
  persistProposals: persistProposalsMock,
}));

// E2: the executor loads the active-Budget snapshot for the §2.11
// envelope check. The fixture envelopes are non-spend, so "no active
// Budget" is the simplest truthful stub.
vi.mock("@/lib/cortex/authority/budget-context", () => ({
  loadBudgetValidationContext: vi
    .fn()
    .mockResolvedValue({ remaining_by_category: null }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: adminInsertMock,
    }),
  }),
}));

vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(),
}));

// Now the module under test.
import {
  _resetActionClassRegistryForTests,
  registerActionClass,
} from "@kinetiks/tools";

import type { AuthorityAgentOutput } from "../../descriptors";
import {
  AuthorityProposalError,
  authorityAgentExecute,
} from "../authority-agent";

beforeEach(() => {
  routeAskClaudeMock.mockReset();
  persistProposalsMock.mockReset();
  adminInsertMock.mockReset();
  adminInsertMock.mockResolvedValue({ data: null, error: null });
  _resetActionClassRegistryForTests();

  // Register the action classes the test envelopes reference.
  registerActionClass({
    action_class: "kinetiks_id.send_slack_notification",
    source_app: "kinetiks_id",
    description:
      "Send a Slack notification on behalf of the customer (test fixture).",
    constraint_schema: z.object({
      channels: z.union([z.array(z.string()), z.literal("any")]),
      users: z.union([z.array(z.string()), z.literal("any")]).optional(),
      max_message_length: z.number(),
      threading_allowed: z.boolean(),
    }),
    rate_limit_default: { count: 20, window: "day" },
    customer_template:
      "Send Slack notifications to {channels} on your behalf, up to {max_message_length} characters per message.",
    available_in_default_standing_grants: true,
    always_requires_budget_attachment: false,
  });
});

afterEach(() => {
  _resetActionClassRegistryForTests();
});

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const INVOCATION_ID = "33333333-3333-3333-3333-333333333333";
const GRANT_ID = "44444444-4444-4444-4444-444444444444";

function validEnvelope(over: { grant_id?: string; invocation_id?: string } = {}) {
  return {
    invocation_id: over.invocation_id ?? INVOCATION_ID,
    request_type: "campaign_launch",
    proposed_grants: [
      {
        grant_id: over.grant_id ?? GRANT_ID,
        grant: {
          scope_type: "campaign",
          scope_id: "55555555-5555-5555-5555-555555555555",
          scope_description: "Acme Q1 LinkedIn Launch",
          parent_grant_id: null,
          granted_capabilities: [
            {
              action_class: "kinetiks_id.send_slack_notification",
              description: "Send Slack notifications to #acme-team about the launch.",
              constraints: {
                channels: ["acme-team"],
                max_message_length: 2000,
                threading_allowed: true,
              },
              rate_limit: { count: 10, window: "day" },
            },
          ],
          escalation_triggers: [],
          max_unapproved_spend_per_day: null,
          max_unapproved_spend_per_action: null,
          spending_currency: "USD",
          expires_at: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
        reasoning:
          "First campaign for this account; tight rate limit and channel allowlist. Customer can widen later if Slack volume feels low.",
        evidence: {
          patterns_referenced: [],
          similar_past_grants: [],
          ledger_summary: {
            proposals_last_90d: 0,
            approval_rate: 0,
            most_common_edit_type: null,
          },
          identity_signals: [
            "No prior signal: this is the first authority decision; propose conservative defaults.",
          ],
        },
      },
    ],
  };
}

function input() {
  return {
    type: "campaign_launch" as const,
    account_id: ACCOUNT_ID,
    user_id: USER_ID,
    invocation_id: INVOCATION_ID,
    source_label: "test",
    parent_grant_id: null,
    brief: {
      title: "Acme Q1 LinkedIn Launch",
      summary: "Outbound campaign launching Monday targeting Acme accounts.",
      target_icp_id: null,
      requested_action_classes: ["kinetiks_id.send_slack_notification"],
    },
  };
}

// ─────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────

describe("authorityAgentExecute happy path", () => {
  it("returns the persisted grant/approval ids on a valid first-attempt envelope", async () => {
    routeAskClaudeMock.mockResolvedValueOnce(JSON.stringify(validEnvelope()));
    persistProposalsMock.mockResolvedValueOnce({
      grant_ids: [GRANT_ID],
      approval_ids: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    });

    const result = (await authorityAgentExecute(input(), {
      account_id: ACCOUNT_ID,
      correlation_id: INVOCATION_ID,
      invoked_by: "test",
      team_scope_id: null,
      metadata: {},
      operator_key: "authority_agent",
      task_key: "invoke",
    })) as AuthorityAgentOutput;

    expect(result).toEqual({
      invocation_id: INVOCATION_ID,
      request_type: "campaign_launch",
      proposed_grant_ids: [GRANT_ID],
      approval_ids: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    });
    expect(routeAskClaudeMock).toHaveBeenCalledTimes(1);
    expect(persistProposalsMock).toHaveBeenCalledTimes(1);
    // One authority_grant_proposed ledger insert per grant.
    expect(adminInsertMock).toHaveBeenCalledTimes(1);
  });

  it("strips markdown fences from model output before parsing", async () => {
    routeAskClaudeMock.mockResolvedValueOnce(
      "```json\n" + JSON.stringify(validEnvelope()) + "\n```",
    );
    persistProposalsMock.mockResolvedValueOnce({
      grant_ids: [GRANT_ID],
      approval_ids: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    });
    const result = (await authorityAgentExecute(input(), {
      account_id: ACCOUNT_ID,
      correlation_id: INVOCATION_ID,
      invoked_by: "test",
      team_scope_id: null,
      metadata: {},
      operator_key: "authority_agent",
      task_key: "invoke",
    })) as AuthorityAgentOutput;
    expect(result.proposed_grant_ids).toEqual([GRANT_ID]);
  });
});

// ─────────────────────────────────────────────
// Retry-on-validation-failure
// ─────────────────────────────────────────────

describe("authorityAgentExecute structural retry", () => {
  it("retries once on a validation failure and succeeds on second attempt", async () => {
    // First attempt: unregistered action_class.
    const bad = validEnvelope();
    bad.proposed_grants[0].grant.granted_capabilities[0].action_class =
      "kinetiks_id.does_not_exist";
    routeAskClaudeMock.mockResolvedValueOnce(JSON.stringify(bad));
    // Second attempt: registered action_class.
    routeAskClaudeMock.mockResolvedValueOnce(JSON.stringify(validEnvelope()));
    persistProposalsMock.mockResolvedValueOnce({
      grant_ids: [GRANT_ID],
      approval_ids: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    });

    const result = (await authorityAgentExecute(input(), {
      account_id: ACCOUNT_ID,
      correlation_id: INVOCATION_ID,
      invoked_by: "test",
      team_scope_id: null,
      metadata: {},
      operator_key: "authority_agent",
      task_key: "invoke",
    })) as AuthorityAgentOutput;
    expect(result.proposed_grant_ids).toEqual([GRANT_ID]);
    expect(routeAskClaudeMock).toHaveBeenCalledTimes(2);
    // The second prompt must include the prior-attempt validation
    // errors so Sonnet can react. We assert the second call's user
    // prompt mentions the failure.
    const secondCallUserPrompt = routeAskClaudeMock.mock.calls[1][1] as string;
    expect(secondCallUserPrompt).toMatch(/Previous attempt validation failures/);
    expect(secondCallUserPrompt).toMatch(/unregistered action_class/);
  });

  it("throws structural_validation_exhausted after two consecutive validation failures", async () => {
    const bad = validEnvelope();
    bad.proposed_grants[0].grant.granted_capabilities[0].action_class =
      "kinetiks_id.does_not_exist";
    routeAskClaudeMock.mockResolvedValueOnce(JSON.stringify(bad));
    routeAskClaudeMock.mockResolvedValueOnce(JSON.stringify(bad));

    await expect(
      authorityAgentExecute(input(), {
        account_id: ACCOUNT_ID,
        correlation_id: INVOCATION_ID,
        invoked_by: "test",
        team_scope_id: null,
        metadata: {},
        operator_key: "authority_agent",
        task_key: "invoke",
      }),
    ).rejects.toMatchObject({
      name: "AuthorityProposalError",
      code: "structural_validation_exhausted",
    });
    expect(routeAskClaudeMock).toHaveBeenCalledTimes(2);
    expect(persistProposalsMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// Customer-language rule
// ─────────────────────────────────────────────

describe("authorityAgentExecute customer-language rule", () => {
  it("rejects an envelope containing the literal phrase 'Authority Grant' in scope_description", async () => {
    const bad = validEnvelope();
    bad.proposed_grants[0].grant.scope_description =
      "Acme Q1 LinkedIn Authority Grant";
    routeAskClaudeMock.mockResolvedValueOnce(JSON.stringify(bad));
    // Second attempt clean.
    routeAskClaudeMock.mockResolvedValueOnce(JSON.stringify(validEnvelope()));
    persistProposalsMock.mockResolvedValueOnce({
      grant_ids: [GRANT_ID],
      approval_ids: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    });

    const result = (await authorityAgentExecute(input(), {
      account_id: ACCOUNT_ID,
      correlation_id: INVOCATION_ID,
      invoked_by: "test",
      team_scope_id: null,
      metadata: {},
      operator_key: "authority_agent",
      task_key: "invoke",
    })) as AuthorityAgentOutput;
    expect(result.proposed_grant_ids).toEqual([GRANT_ID]);
    const secondCallUserPrompt = routeAskClaudeMock.mock.calls[1][1] as string;
    expect(secondCallUserPrompt).toMatch(/forbidden phrase/i);
  });
});

// ─────────────────────────────────────────────
// Non-implemented request types
// ─────────────────────────────────────────────

describe("authorityAgentExecute request-type gating", () => {
  it("raises not_implemented for workflow_start (Phase 5)", async () => {
    await expect(
      authorityAgentExecute(
        {
          ...input(),
          type: "workflow_start",
          workflow_id: "66666666-6666-6666-6666-666666666666",
          workflow_description: "scheduled outbound batch",
          requested_action_classes: ["kinetiks_id.send_slack_notification"],
        },
        {
          account_id: ACCOUNT_ID,
          correlation_id: INVOCATION_ID,
          invoked_by: "test",
          team_scope_id: null,
          metadata: {},
          operator_key: "authority_agent",
          task_key: "invoke",
        },
      ),
    ).rejects.toMatchObject({
      name: "AuthorityProposalError",
      code: "not_implemented",
    });
    expect(routeAskClaudeMock).not.toHaveBeenCalled();
    expect(persistProposalsMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// JSON parse failure
// ─────────────────────────────────────────────

describe("authorityAgentExecute JSON parse", () => {
  it("treats malformed JSON as a validation failure and retries", async () => {
    routeAskClaudeMock.mockResolvedValueOnce("not actually JSON {{{");
    routeAskClaudeMock.mockResolvedValueOnce(JSON.stringify(validEnvelope()));
    persistProposalsMock.mockResolvedValueOnce({
      grant_ids: [GRANT_ID],
      approval_ids: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    });
    const result = (await authorityAgentExecute(input(), {
      account_id: ACCOUNT_ID,
      correlation_id: INVOCATION_ID,
      invoked_by: "test",
      team_scope_id: null,
      metadata: {},
      operator_key: "authority_agent",
      task_key: "invoke",
    })) as AuthorityAgentOutput;
    expect(result.proposed_grant_ids).toEqual([GRANT_ID]);
  });
});
