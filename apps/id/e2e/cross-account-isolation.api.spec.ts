import { test, expect } from "@playwright/test";
import {
  adminClient,
  seedAccount,
  deleteAccount,
  rowsForThread,
  type SeededAccount,
} from "./support/db";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * THE must-never-break flow (program DoD): cross-account isolation for the
 * collaborative workspace, exercised end-to-end over real HTTP with two seeded
 * tenants and kntk_ API keys. This is the route-layer / table-RLS mirror of the
 * pgTAP cross-tenant suites (annotations / workspace_actions / active_tasks) — if
 * a tenant boundary regresses in the route layer, this fails loudly. The Realtime
 * channel boundary (migration 00091) is covered separately by the
 * `realtime_channel_boundary.sql` pgTAP predicate suite; this HTTP spec opens no
 * Realtime channel.
 */

const THREAD = "e2e-iso-thread";

function authed(apiKey: string) {
  return { headers: { Authorization: `Bearer ${apiKey}` } };
}

function createAnnotation(threadId: string, summary: string) {
  return {
    op: "create" as const,
    thread_id: threadId,
    kind: "decision_note" as const,
    component_id: "subject",
    field_name: "subject_line",
    summary,
    body: `${summary} — full reasoning`,
  };
}

let admin: SupabaseClient;
let alice: SeededAccount;
let bob: SeededAccount;

test.beforeAll(async () => {
  admin = adminClient();
  alice = await seedAccount(admin, "alice-iso");
  bob = await seedAccount(admin, "bob-iso");
});

test.afterAll(async () => {
  if (alice) await deleteAccount(admin, alice);
  if (bob) await deleteAccount(admin, bob);
});

test("embed routes reject unauthenticated requests", async ({ request }) => {
  const res = await request.post("/api/id/embed/annotations", {
    data: createAnnotation(THREAD, "anon"),
  });
  expect(res.status()).toBe(401);
});

test("annotation writes are scoped to the calling account", async ({ request }) => {
  const aRes = await request.post("/api/id/embed/annotations", {
    ...authed(alice.apiKey),
    data: createAnnotation(THREAD, "alice note"),
  });
  expect(aRes.ok()).toBeTruthy();
  const aId = (await aRes.json()).data.id as string;

  const bRes = await request.post("/api/id/embed/annotations", {
    ...authed(bob.apiKey),
    data: createAnnotation(THREAD, "bob note"),
  });
  expect(bRes.ok()).toBeTruthy();
  const bId = (await bRes.json()).data.id as string;

  // Each annotation landed under its own account, and neither tenant's thread
  // contains the other's row — even though both used the same thread_id.
  const aRows = (await rowsForThread(admin, "kinetiks_annotations", alice.accountId, THREAD)).map(
    (r) => r.id
  );
  expect(aRows).toContain(aId);
  expect(aRows).not.toContain(bId);

  const bRows = (await rowsForThread(admin, "kinetiks_annotations", bob.accountId, THREAD)).map(
    (r) => r.id
  );
  expect(bRows).toContain(bId);
  expect(bRows).not.toContain(aId);
});

test("a tenant cannot mutate another tenant's annotation (404, no write)", async ({ request }) => {
  const aRes = await request.post("/api/id/embed/annotations", {
    ...authed(alice.apiKey),
    data: createAnnotation(THREAD, "alice private"),
  });
  const aId = (await aRes.json()).data.id as string;

  // Bob tries to dismiss Alice's annotation by id. The route scopes its UPDATE
  // by the caller's account, so the row is invisible → 404, no mutation.
  const bDismiss = await request.post("/api/id/embed/annotations", {
    ...authed(bob.apiKey),
    data: { op: "dismiss", thread_id: THREAD, annotation_id: aId },
  });
  expect(bDismiss.status()).toBe(404);

  const { data } = await admin
    .from("kinetiks_annotations")
    .select("dismissed")
    .eq("id", aId)
    .single();
  expect(data?.dismissed).toBe(false);
});

test("state route binds account_id to the calling key (not a data-isolation proof yet)", async ({
  request,
}) => {
  // The state route is still a Phase-8.0 scaffold: it echoes the JWT-resolved
  // account and returns empty hydration. This case proves the account *binding*
  // (the route never reflects another tenant's id), NOT isolation of hydrated
  // rows — there are none to leak. When the route gains live per-tenant reads,
  // convert this to seed-Alice / assert-Bob-can't-see-it. Live data isolation is
  // covered today by the annotation-scoping + dismiss-404 cases above and pgTAP.
  const aState = await request.get(`/api/id/embed/state?thread=${THREAD}`, authed(alice.apiKey));
  expect(aState.ok()).toBeTruthy();
  expect((await aState.json()).data.account_id).toBe(alice.accountId);

  const bState = await request.get(`/api/id/embed/state?thread=${THREAD}`, authed(bob.apiKey));
  expect(bState.ok()).toBeTruthy();
  const bBody = await bState.json();
  expect(bBody.data.account_id).toBe(bob.accountId);
  expect(bBody.data.account_id).not.toBe(alice.accountId);
});
