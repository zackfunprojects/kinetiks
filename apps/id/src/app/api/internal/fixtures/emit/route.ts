/**
 * POST /api/internal/fixtures/emit
 *
 * Phase 1.5 fixture emitter (Node side). Invoked once per active
 * account by supabase/functions/fixture-emitter-cron via fetch with
 * INTERNAL_SERVICE_SECRET. Iterates the seven Harvest-shaped
 * generators registered in apps/id/src/lib/fixtures/index.ts and
 * POSTs each generated emission to /api/synapse/patterns — the exact
 * same endpoint a real Synapse client would use.
 *
 * Gated by KINETIKS_FIXTURES_ENABLED. When false, the route returns
 * a 200 with `{ status: 'disabled' }` so the cron records a clean
 * no-op rather than an error.
 *
 * Every successful emission writes a `fixture_emission` Ledger entry
 * (in addition to the standard `pattern_observed` entry the write
 * path emits). Demo honesty: any UI rendering rows with
 * `source_app = 'kinetiks_fixtures'` or `detail.is_fixture = true`
 * shows a small "fixture" tag.
 *
 * Auth: shared-secret bearer token (INTERNAL_SERVICE_SECRET).
 */

import "server-only";

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@kinetiks/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGenerators, FIXTURE_SOURCE_APP } from "@/lib/fixtures";
import type { FixtureEmission } from "@/lib/fixtures";

const Body = z.object({
  account_id: z.string().uuid(),
});

interface SynapsePatternsSuccess {
  data: {
    outcome: string;
    pattern_id?: string;
    reason?: string;
  };
}

interface EmissionAttemptResult {
  pattern_type: string;
  outcome: string;
  pattern_id: string | null;
  ok: boolean;
  reason: string | null;
}

export async function POST(request: Request) {
  const env = serverEnv();
  const secret = env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "missing_internal_secret" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!env.KINETIKS_FIXTURES_ENABLED) {
    return NextResponse.json({ status: "disabled" });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: err instanceof Error ? err.message : "invalid JSON",
      },
      { status: 400 },
    );
  }

  // Resolve the patterns endpoint URL relative to the request origin so
  // we hit the same Next.js process this route runs in. Falls back to
  // NEXT_PUBLIC_APP_URL when the request has no usable origin (rare).
  const origin = (() => {
    try {
      return new URL(request.url).origin;
    } catch {
      return env.NEXT_PUBLIC_APP_URL ?? null;
    }
  })();
  if (!origin) {
    return NextResponse.json(
      { error: "no_origin_resolvable" },
      { status: 500 },
    );
  }
  const patternsUrl = `${origin}/api/synapse/patterns`;

  const generators = getGenerators();
  const admin = createAdminClient();
  const results: EmissionAttemptResult[] = [];
  let emittedCount = 0;
  let failedCount = 0;
  let ledgerWriteFailures = 0;

  let generatorFailures = 0;
  for (const generator of generators) {
    // Isolate per-generator failures: a single bad generator must not
    // abort the whole run after earlier emissions + ledger writes have
    // already landed. We capture the failure and continue with the
    // remaining generators.
    let emissions: ReturnType<typeof generator.generate>;
    try {
      emissions = generator.generate({ account_id: parsed.account_id });
    } catch (err) {
      generatorFailures++;
      Sentry.captureException(err, {
        tags: {
          route: "fixtures/emit",
          action: "generator_run",
          stage: "generate",
          app: "id",
        },
        extra: {
          account_id: parsed.account_id,
          pattern_type: generator.pattern_type,
        },
      });
      continue;
    }
    for (const emission of emissions) {
      const result = await emitOne(patternsUrl, secret, emission);
      results.push(result);
      if (result.ok) {
        emittedCount++;
        // Write the fixture_emission Ledger entry alongside the real
        // pattern_observed entry the synapse write path emits. RLS is
        // bypassed via admin; we scope by account_id explicitly.
        const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
          account_id: parsed.account_id,
          event_type: "fixture_emission",
          source_app: FIXTURE_SOURCE_APP,
          source_operator: "fixture_emitter",
          target_layer: null,
          detail: {
            pattern_type: emission.pattern_type,
            pattern_id: result.pattern_id,
            outcome: result.outcome,
            outcome_metric: emission.outcome_metric,
            outcome_value: emission.outcome_value,
            sample_size: emission.sample_size,
            is_fixture: true,
          },
        });
        if (ledgerError) {
          Sentry.captureException(ledgerError, {
            tags: {
              route: "fixtures/emit",
              action: "ledger_insert",
              stage: "post_emission",
              app: "id",
            },
            extra: {
              account_id: parsed.account_id,
              pattern_type: emission.pattern_type,
            },
          });
          ledgerWriteFailures++;
        }
      } else {
        failedCount++;
      }
    }
  }

  return NextResponse.json({
    status: ledgerWriteFailures > 0 || generatorFailures > 0 ? "partial" : "ok",
    account_id: parsed.account_id,
    generators: generators.length,
    generator_failures: generatorFailures,
    emitted: emittedCount,
    failed: failedCount,
    ledger_write_failures: ledgerWriteFailures,
    results,
  });
}

/** Timeout for the per-emission POST to /api/synapse/patterns. */
const EMIT_FETCH_TIMEOUT_MS = 5000;

async function emitOne(
  patternsUrl: string,
  secret: string,
  emission: FixtureEmission,
): Promise<EmissionAttemptResult> {
  try {
    const response = await fetch(patternsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(emission),
      signal: AbortSignal.timeout(EMIT_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        pattern_type: emission.pattern_type,
        outcome: "http_error",
        pattern_id: null,
        ok: false,
        reason: `HTTP ${response.status}`,
      };
    }
    const json = (await response.json()) as SynapsePatternsSuccess;
    const outcome = json.data?.outcome ?? "unknown";
    const ok = outcome === "created_emerging" || outcome === "evidence_added" || outcome === "promoted" || outcome === "demoted" || outcome === "duplicate_ignored";
    return {
      pattern_type: emission.pattern_type,
      outcome,
      pattern_id: json.data?.pattern_id ?? null,
      ok,
      reason: ok ? null : (json.data?.reason ?? null),
    };
  } catch (err) {
    return {
      pattern_type: emission.pattern_type,
      outcome: "fetch_error",
      pattern_id: null,
      ok: false,
      reason: err instanceof Error ? err.message : "unknown fetch error",
    };
  }
}
