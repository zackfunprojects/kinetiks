/**
 * POST /api/internal/operators/authority-agent/invoke
 *
 * Phase 4 — Kinetiks Contract Addendum §2.5.
 *
 * Service-secret-authenticated entry point for the Authority Agent
 * operator. Used by:
 *
 *   - Fixture flow (apps/id/src/lib/fixtures/authority-agent-campaign-launch.ts,
 *     Phase 4 — Chunk 10) — emits a synthetic campaign-launch payload
 *     to exercise the full pipeline end-to-end.
 *   - Marcus (Phase 5+) when the customer asks to scope a new
 *     campaign. The Marcus tool wraps this endpoint.
 *
 * Auth: shared-secret bearer (INTERNAL_SERVICE_SECRET). Same posture
 * as `/api/internal/workflows/archivist-maintenance/run`.
 *
 * Body: a discriminated `AuthorityAgentInput` per
 * `authorityAgentInputsSchema` in
 * `apps/id/src/lib/operators/descriptors.ts`.
 *
 * Response shape:
 *   200 — { invocation_id, request_type, proposed_grant_ids, approval_ids }
 *   400 — body did not parse
 *   401 — missing or wrong bearer
 *   422 — agent could not produce a valid proposal after retry
 *   500 — unexpected error (logged to Sentry with the canonical shape)
 */

import "server-only";

import { NextResponse } from "next/server";
import { serverEnv } from "@kinetiks/lib/env";

import { isValidInternalBearer } from "@/lib/auth/internal-bearer";
import { captureException } from "@/lib/observability/sentry";
import { authorityAgentInputsSchema } from "@/lib/operators/descriptors";
import {
  AuthorityProposalError,
  authorityAgentExecute,
} from "@/lib/operators/executors/authority-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Bearer auth from the Zod-validated env loader — a missing
  // INTERNAL_SERVICE_SECRET at process boot is a startup failure, not
  // a first-request 500.
  const { INTERNAL_SERVICE_SECRET: secret } = serverEnv();
  if (!secret) {
    return NextResponse.json(
      { error: "missing_internal_secret" },
      { status: 500 },
    );
  }
  if (!isValidInternalBearer(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: err instanceof Error ? err.message : "invalid JSON",
      },
      { status: 400 },
    );
  }

  const parsed = authorityAgentInputsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: "AuthorityAgentInput schema validation failed",
        issues: parsed.error.issues.map((iss) => ({
          path: iss.path.join("."),
          message: iss.message,
        })),
      },
      { status: 400 },
    );
  }

  // Direct-invocation context. The OperatorExecutor type signature
  // requires (input, ctx) for compatibility with the Workflow
  // dispatcher; this route exercises the executor outside any
  // Workflow run, so we synthesize a minimal context tagged with the
  // invocation_id as correlation_id.
  const ctx = {
    account_id: parsed.data.account_id,
    correlation_id: parsed.data.invocation_id,
    invoked_by: "api:authority-agent.invoke",
    team_scope_id: null,
    metadata: { invocation_id: parsed.data.invocation_id },
    operator_key: "authority_agent",
    task_key: "invoke",
  };

  try {
    const result = await authorityAgentExecute(parsed.data, ctx);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof AuthorityProposalError) {
      // Map agent failure modes to HTTP status. `not_implemented`
      // surfaces 422 (request is structurally valid but the executor
      // can't service it); `structural_validation_exhausted` also 422.
      const status =
        err.code === "not_implemented" ? 422 :
        err.code === "structural_validation_exhausted" ? 422 :
        err.code === "json_parse_failed" ? 422 :
        500;
      // Sentry on persistence failures (data-plane errors), not on
      // validation exhaustion (agent-side) which is already captured
      // in the executor.
      if (err.code === "persistence_failed") {
        await captureException(err, {
          tags: {
            route: "/api/internal/operators/authority-agent/invoke",
            action: "authority_agent.invoke",
            stage: "persist",
            app: "id",
          },
          user: { id: parsed.data.account_id },
          extra: {
            invocation_id: parsed.data.invocation_id,
            request_type: parsed.data.type,
          },
        });
      }
      return NextResponse.json(
        {
          error: err.code,
          message: err.message,
          validation_errors: err.validation_errors.slice(0, 10),
        },
        { status },
      );
    }
    // Unexpected error — log and return generic 500.
    await captureException(err, {
      tags: {
        route: "/api/internal/operators/authority-agent/invoke",
        action: "authority_agent.invoke",
        stage: "execute",
        app: "id",
      },
      user: { id: parsed.data.account_id },
      extra: {
        invocation_id: parsed.data.invocation_id,
        request_type: parsed.data.type,
      },
    });
    return NextResponse.json(
      {
        error: "internal_error",
        message: "Authority Agent invocation failed unexpectedly",
      },
      { status: 500 },
    );
  }
}
