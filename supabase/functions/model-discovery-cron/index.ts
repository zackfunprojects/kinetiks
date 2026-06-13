// Model Discovery CRON Edge Function
//
// Adaptive model selection — the "detect" trigger.
//
// Once a day, ping the internal model-discovery route, which polls the
// Anthropic Models API and raises an operator-only flip proposal for any
// role whose family has a strictly-newer model. The cron itself does no
// work beyond the trigger: the Models API call + proposal creation live
// in apps/id (/api/internal/model-discovery/run) because the model
// registry, assignment table, and approval pipeline all live there
// (CLAUDE.md Lesson 7 — Deno/Node split).
//
// Platform-level: unlike the per-account crons, there are no accounts to
// batch — one POST runs the whole deployment-wide check.
//
// CRON schedule: daily at 08:00 UTC ("0 8 * * *").

const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET");
// Fail closed if missing (same posture as authority-defaults-diff-cron):
// a default of production would route dev/staging discovery at prod.
const KINETIKS_ID_API_URL = Deno.env.get("KINETIKS_ID_API_URL");

const FETCH_TIMEOUT_MS = 60_000;

Deno.serve(async () => {
  if (!INTERNAL_SERVICE_SECRET || !KINETIKS_ID_API_URL) {
    console.error(
      "[model-discovery-cron] Missing required environment variables. " +
        "Set INTERNAL_SERVICE_SECRET and KINETIKS_ID_API_URL (no default to " +
        "avoid accidental cross-env routing).",
    );
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${KINETIKS_ID_API_URL}/api/internal/model-discovery/run`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERNAL_SERVICE_SECRET}`,
        },
        body: JSON.stringify({}),
        signal: controller.signal,
      },
    );
    const body = await response.json().catch(() => ({}));
    const summary = {
      event: "model_discovery_cron_complete",
      status: response.status,
      ok: response.ok,
      ...body,
      completed_at: new Date().toISOString(),
    };
    console.log(JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      status: response.ok ? 200 : 502,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === "AbortError";
    console.error(
      `[model-discovery-cron] run failed: ${isAbort ? `timed out after ${FETCH_TIMEOUT_MS}ms` : String(err)}`,
    );
    return new Response(JSON.stringify({ error: "run_failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
});
