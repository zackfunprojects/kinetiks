# Comprehensive Kinetiks audit — 2026-06-09

**Auditor:** Claude Code (15 parallel read-only subsystem agents + direct verification of all critical claims)
**Branch:** `phase-2/jwt-hook-and-native-chrome`
**Scope:** `apps/id`, `apps/desktop`, all 12 packages, `supabase/` (69 migrations, 44 pgTAP files, 15 Edge Functions), the full docs/specs corpus.
**Method:** Each subsystem audited against its canonical spec for (a) spec compliance, (b) UX coherence, (c) AI-native quality, plus 10 adversarial cross-cutting questions. Every critical finding below was personally re-verified by reading the cited code/migration — those carry **[VERIFIED]**. The audit was strictly read-only; no code, config, or DB changed.

---

## Executive verdict

**Kinetiks has genuinely excellent architecture and a genuinely broken last mile.** Surface by surface, the engineering is above the bar for a 2026 agent product — the evidence-brief Marcus engine, the authority resolver, the registry discipline, the design token system, and the RLS posture are all real and well-built. But the wiring *between* those components, and the connection to reality (the user's actual journey, the deployed environment, the safety guarantees the product is sold on), is broken in load-bearing places that a passing `type-check` and 671 green unit tests completely hid.

The same sentence came back independently from nine of the fifteen agents: *world-class skeleton, missing connective tissue.* The AI-native auditor put it most bluntly — "Kinetiks built a world-class cage and hasn't put the animal in it."

Three themes dominate, and all three are ironies aimed at the product's own thesis:

1. **The trust/safety core — the thing built most carefully — has the most dangerous holes.** The product's entire premise is earned, observable, revocable trust. Yet a consequential tool with no covering grant *executes anyway* (revoking authority makes the system **less** constrained, not more); the approval system's own ledger silently fails to record approvals; approving an escalated action re-executes nothing; and the append-only ledger has only two of its three promised enforcement layers. The safety membrane is currently a prompt-level convention, not the three-layer enforcement the specs describe.

2. **The product's emotional core — "name your system and it becomes your GTM teammate" — does not exist on any reachable path.** The naming step is orphaned dead code, the engine is hardcoded to believe it is "Marcus" (the one name the user is never supposed to see), and onboarding's final screen tells every user to "chat with Marcus."

3. **Production is a much smaller product than the repo.** Only 8 environment variables are set on Vercel; Nango, Slack, transactional email, PostHog, and **Sentry** are all dead in production. Every var is `optional` in the schema, so prod boots green while half the product is inert and no errors are being captured.

None of this means the project is in trouble. It means the hard, differentiated 80% is done and the unglamorous, trust-critical 20% — wiring, deploy hygiene, the identity thread, and closing the safety loop — is what stands between this and a demoable, trustworthy product. Most of the highest-impact fixes are small (a one-line ownership filter, a parameter, four enum values).

**Answering your two headline questions directly:**

- **Does the UX make sense?** Each new-shell surface does; the journey connecting them does not. It is a well-built body with the head detached. (Section 4.)
- **Is this an optimal use of modern AI agents that communicate in unique ways for the user's benefit?** The *trust substrate* is ahead of the market; the *orchestration* is not — "the LLM is the orchestration layer" is not true today, and the agents that do communicate (proposals, insights, handoffs) do so invisibly to the user. (Section 5.)

---

## Subsystem scorecard

| Subsystem | Architecture | Wired to user | Verdict |
|---|---|---|---|
| Marcus / Chat engine | A | C | Faithful v2 build; 3 hidden defects (tenant leak, dead memory, phantom ledger table) |
| Approval System | B+ design / D enforcement | C | Math is exact; the safety enforcement and audit trail are broken |
| Pattern Library + Authority | A- | C+ | Delegation/revocation production-grade; observability half (usage, digest) unfinished |
| Cortex (7 sections) | A- | B | Strongest UI in the app; correct data shapes and ownership |
| Analytics / Oracle | B / D | D | Insight loop real; ~1,050 LOC cross-app intelligence is dead code; goal dashboard has no data |
| Onboarding / Connections / Comms | B plumbing / F comms | D | Nango ingest excellent; provider-config broken 6/10; Phase 6 mostly dead code |
| Platform layer (registries/runtime/synapse) | A | n/a | Boot-validated, contract-tested; one structural safety hole |
| Design system | A token / C surface | B | Best artifact in repo at token layer; surface layer still fighting legacy |
| Security / tenant boundary | B+ | — | Holds today via subquery RLS; one real leak; JWT-hook cutover is a future landmine |
| Database / RLS coverage | A- | — | 99/100 tables RLS'd; ledger immutability + goals/budgets triggers are gaps |
| Tests / CI | C | — | 671 green units gate nothing; HTTP layer 0% tested; lint broken; no CI on app code |
| Deploy reality | C | — | Repo↔main consistent, but prod env is half-configured and Sentry is blind |
| Desktop | D (by design) | F | ~5% of the collaborative-workspace spec; honest scoping, but notification pipe is dead |

---

## 1. Critical findings (ship-blockers / trust-breaking)

### 1.1 [VERIFIED] Cross-tenant chat read — any user can read another tenant's conversation by guessing a thread UUID
`apps/id/src/app/(app)/chat/[threadId]/page.tsx:41-45` fetches `kinetiks_marcus_messages` with the **service-role admin client**, filtered only by `thread_id` from the URL. The threads query immediately above it (`:34-40`) correctly scopes by `.eq("account_id", account.id)` — the messages query simply omits the ownership join. Because the admin client bypasses RLS, navigating to `/chat/<any-thread-uuid>` server-renders that thread's full message history regardless of owner. The sibling API route does this correctly (`api/marcus/threads/[threadId]/messages/route.ts:20-30`). This is a live tenant-isolation breach on the most sensitive surface.
**Fix:** join the thread to `account.id` before selecting messages (or `.eq("account_id", account.id)` if the messages table carries it). One filter.

### 1.2 [VERIFIED] The approval membrane can be bypassed three ways — a consequential action with no grant executes with no approval
This is the most-corroborated finding in the audit (platform, bug-hunt, and approval agents independently), and the gravest, because it defeats the product's central guarantee.

- **The `auto_threshold` fallback executes.** When no grant covers a consequential action, `defaultAuthorityResolver` returns `{ outcome: "auto_threshold" }` (`packages/runtime/src/authority.ts:512`). In `run.ts`, only `escalated` (`:129`) and `denied` (`:159`) block execution; `auto_threshold` falls straight through to the execute loop (`:203`). The `autoApproveThreshold: null` "always queue" contract that every consequential tool documents (`send-slack-notification.ts:8`) is **enforced nowhere**. Net effect: revoking or never-granting authority leaves Marcus *less* constrained, because the grant was the only gate. Reachable directly from chat (`tool-decision.ts:163` invokes the chosen tool, guarded only by a prompt line). All three consequential tools (Slack send, calendar event, email draft) are exposed.
- **`/api/tools/execute` bypasses the runtime entirely** (`api/tools/execute/route.ts:56-67`) — calls the permissive F1 `executeTool` directly, no authority resolution, no escalation, for any registered tool.
- **Approving an escalated action re-executes nothing.** The runtime correctly queues an approval carrying `preview.action_input` (`run.ts:135`, `runtime-boot.ts:241-277`), but `processApprovalDecision` (`learning-loop.ts:140-244`) only flips status and calibrates thresholds — no code path consumes `action_input` to re-run the tool. The customer approves; the Slack message never sends. The mirror image of the bypass.

**Fix:** in the runtime, treat `auto_threshold` + `isConsequential` + `autoApproveThreshold === null` as "enqueue standard approval and throw `queued_for_approval`"; add an approve-side executor that re-invokes the queued tool with `grantId` pinned; route `/api/tools/execute` through `AgentRun` or restrict it to non-consequential tools.

### 1.3 [VERIFIED] The system identity is broken end-to-end; the product speaks as "Marcus"
The product's defining promise fails on the default path, in three compounding ways:
- The "name your system" step is **orphaned dead code** at `/setup` — nothing routes, links, or redirects to it (`grep "/setup"` hits only `middleware.ts:6`). `system_name` is null for every signup; Chat falls back to "Kinetiks" (`ChatArea.tsx:246`).
- The engine **hardcodes the name**: `buildPersonaPrompt("Marcus")` at `engine.ts:267` and `:565`; the prompt opens "You are Marcus" (`marcus-persona.ts:14`). Even a user who found `/setup` and named their system "Kit" chats with a model that believes it is Marcus and will say so. The function already takes a `systemName` parameter — the chosen name is simply never threaded in.
- Onboarding's final screen tells every user to "chat with **Marcus**" (`CompletionStep.tsx:187`), and the reachable legacy shell exposes "Marcus" as a nav label, page header, and placeholder.

Spec v3 §2: *"The user never sees the name 'Marcus.'"* Violated by default.
**Fix (small):** thread `account.system_name` into the persona prompt; insert the existing `NameSystem` component into onboarding; change the completion string.

### 1.4 [VERIFIED] The approval system's own audit trail silently fails to record approvals
The canonical `kinetiks_ledger` `event_type` CHECK (latest at `00065:67-70`, VALIDATEd against all rows in `00062`) permits `approval_batch_approved`, `approval_expired`, `approval_flagged`, `approval_rejected` — but **not** `approval_approved`, `approval_auto_approved`, or `approval_created`. Grep confirms **no migration anywhere contains `approval_approved`.** The pipeline writes `approval_created`/`approval_auto_approved` (`pipeline.ts:114-128`) and the learning loop writes `approval_approved`/`approval_approved_with_edits` (`learning-loop.ts:199-212`); every one violates the CHECK and fails, errors swallowed by `console.error`. The Phase 4.5 production audit (146 ledger rows, 11 distinct types) found zero such rows — consistent with these inserts failing since migration 00042.

Result: the append-only Learning Ledger — the input to confidence scoring, Oracle calibration, and the customer's audit surface — has **no record of any approval ever being created, auto-approved, or approved.** Only the negative half (rejections, expirations) lands. The `flagApproval` path additionally writes to `data`/`attribution` columns that don't exist (`learning-loop.ts:365-376` vs schema `00001:276-285`), so trust *contraction* also leaves no trail. "Every approval decision writes to the Learning Ledger" is currently false for the entire positive path.
**Fix (small):** add the 3-4 missing event types to the CHECK union (a `NOT VALID` add is cheap); fix the `data`/`attribution` → `detail`/`source_operator` column bug.

---

## 2. High findings

### 2.1 [VERIFIED via `vercel env ls`] Production runs a half-configured product; Sentry is blind
Only 8 env vars are set on the `kinetiks-id` Vercel project: the 3 Supabase keys, `INTERNAL_SERVICE_SECRET`, `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `NEXT_PUBLIC_APP_URL`, `KINETIKS_ENCRYPTION_KEY`. **Missing:** all `NANGO_*`, `RESEND_API_KEY`, all `SLACK_*`, `GOOGLE_WORKSPACE_*`, `MICROSOFT_365_*`, `PEOPLE_DATA_LABS_API_KEY`, `SENTRY_DSN`, PostHog. Every one is `z.string().optional()` in `env.ts`, so prod boots green while Phase 6 (comms) and Phase 7 (Nango connect) are non-functional in production and **no errors reach Sentry.** This is the repo's own DoD ("Environment variables set + inventoried") failed at scale; `env-vars.md`'s headline note still flags `KINETIKS_ENCRYPTION_KEY` as "the most critical gap" though it was set 24 days ago — the doc is stale.

### 2.2 [VERIFIED] Marcus's memory and per-turn provenance both write to broken targets
- **Thread memory FK points at the wrong table.** `00024_thread_memory.sql:8`: `account_id uuid references auth.users(id)`, RLS `using (auth.uid() = account_id)`. But the engine writes `kinetiks_accounts.id` (`engine.ts:141,330`). The exact `auth.users.id` vs `kinetiks_accounts.id` confusion CLAUDE.md names as "the most common Cortex bug." Unless account id coincidentally equals the user UUID, the FK insert fails and **memory persistence silently breaks** (errors swallowed at `memory.ts:93-102`).
- **Per-turn ledger write targets a non-existent table.** `engine.ts:342,685` insert `event_type: "marcus_response_v2"` into `kinetiks_learning_ledger` — grep confirms **no migration ever creates that table** (the real one is `kinetiks_ledger`). Every Marcus turn's ledger write fails silently. (Also affects `api/marcus/threads/from-insight`.)

### 2.3 Nango provider-config is internally contradictory for 6 of 10 providers
`provider-config.ts` (what the Connect session allows / what the auth webhook triggers), the registered handlers, `nango-setup.md`, and the deployed `nango-integrations/nango.yaml` disagree on sync names and integration ids for **ga4, gsc, stripe, meta_ads, hubspot, google_ads**. Sync webhooks dispatch by `${providerConfigKey}::${syncName}` (`handlers/index.ts:32`) and fall to `no_handler_registered → skipped` with only a `console.warn`. `assertProviderConfigValid()` checks config-internal uniqueness, not handler/yaml parity — so it cannot catch this. Only the four social providers are internally consistent. "The intelligence layer has fuel" is true today for ~4 feeds. This is exactly the "fail loudly at boot" class CLAUDE.md mandates, missed.
**Fix:** reconcile config ↔ nango.yaml ↔ handlers; extend the boot assertion to cross-check the handler registry and yaml.

### 2.4 The proactive layer is generated, then buried — the "ambient teammate" never reaches the user
The marcus-daily/weekly/monthly crons run and generate real Sonnet content, then: non-email channels insert into `kinetiks_marcus_alerts` (read by nothing but the account-deletion cascade, `api/account/route.ts:73`); the **email channel drops the content entirely yet logs `delivered: true`** to the ledger (`marcus-daily/index.ts:89`); `sendProactiveMessage` has zero callers; the approval badge is built but never fed (`ChatSidebar.tsx:40`); the desktop notification IPC has no sender. The only working proactive hop is insight→chat-brief weaving, which still requires the user to open chat and ask. The differentiated "named system that messages you first" story is unwired at every external channel. (Autopilot spec is entirely unbuilt — defensible scope, but the doc oversells.)

### 2.5 Oracle's cross-app intelligence is dead code; the goal-first dashboard has no data
- ~1,050 LOC of cross-source detectors, top-movers, drill, attribution, what-if, and correlations are **never invoked** (`runner.ts:24-27` imports only anomaly + trend; the barrel comment claims otherwise). The spec's headline capability — "intelligence no individual app can see" (§4.2) — is written, unit-tested, and unreachable.
- `kinetiks_goal_snapshots`, `kinetiks_goals.current_value`, and `kinetiks_analytics_metrics` have **zero writers** — every goal renders 0% with no sparkline/forecast forever; the "goal-first" Analytics tab is a shell of real math with no fuel line.
- [VERIFIED] `metric-cache-cron` POSTs to `/api/internal/metric-cache/refresh`, a route **deleted in Phase 7** (commit 25f6b5f); the dir doesn't exist, so the cron 404s every 15 min. Cache freshness now depends solely on Nango sync webhooks (themselves broken for 6/10 providers per 2.3).

### 2.6 Approval decisions are not concurrency-safe (TOCTOU)
`action/route.ts:50-52` reads-then-acts on status; the approve UPDATE has no `.eq("status","pending")` guard and no rowcount check (`learning-loop.ts:170-173`), and there is no advisory lock for approvals (00068 covers only metric-cache helpers). Double-submit / two-tab / action-vs-batch races double-apply threshold calibration (premature trust drops at streak boundaries) and write duplicate ledger rows. The grant path is correctly atomic by contrast (`authority-grant.ts:97-118`) — the pattern to copy.

### 2.7 [VERIFIED] The append-only Ledger has only two of its three promised enforcement layers
There is **no Postgres trigger or rule on `kinetiks_ledger`** anywhere in 69 migrations. Immutability rests on a SELECT-only RLS policy (users) plus application discipline (service-role writes bypass RLS). CLAUDE.md explicitly promises "deletion denied at three layers (server action, trigger, RLS)" — the trigger layer does not exist on the most trust-critical table in the system. (Separately, `goals.status`/`budgets.approval_status` have CHECK constraints but no transition triggers, unlike approvals/proposals/patterns/grants which all have them.)

### 2.8 Phase 6 communication layer is largely dead code marked "complete"
Zero importers for `lib/email/{send,connect,templates,intelligence}`, `lib/slack/{bot,proactive,intelligence}`, `lib/calendar/{connect,events,prep}`. Never built: email receive, the Slack Bolt app + inbound events + signing verification + 3-second ack + inline approvals, Slack↔Chat thread sync, `meeting-prep` cron. `@kinetiks/ai/slack-dispatcher` — which CLAUDE.md names as the canonical outbound path — **does not exist** (the real sender is `lib/slack/dispatch.ts`, a single workspace-env-token bot). The governed tool path (draft_email/add_calendar_event) points at connection types (`google_workspace`, `gmail`, `slack`) that no user can create, because the providers aren't in the `ConnectionProvider` union and the legacy OAuth was deleted in Phase 7. This is NOT in the deferred-by-design register; the "complete" status materially overstates reality.

### 2.9 Test confidence is thin where it matters most; lint is broken; no CI gate on app code
671 unit tests pass and they're meaningful for pure logic (threshold math matches the spec line-for-line; Welford, escalation triggers, decay clamps all real). But: `pnpm lint` **fails workspace-wide** (eslint not installed); no CI workflow runs Vitest/type-check/lint on PRs (only `supabase/**`-path RLS tests gate merges); **every API route and server action is untested** (zero test files under `app/**`); and the contract-critical grant selection (narrowest-scope-wins, expiry exclusion in `resolve.ts:27-73`) is **mocked out of every test that mentions it.** The most dangerous untested flow: nothing proves a paused or revoked grant actually stops authorizing — the precise trust failure the architecture exists to prevent. (Encouraging: the RLS CI gate is real and caught 4 genuine regressions on 2026-05-29 before merge.)

---

## 3. Medium findings (grouped)

**Trust architecture observability (the unfinished third):**
- `rollUpUsageSummaries()` has **zero callers** — grant cards and digests read perpetually-empty `action_counts`; no periodic digest exists. The "system surfaces what it did with your authority" half of the loop is dead.
- Two of five escalation triggers don't evaluate: **anomaly fails open** (MetricCacheReader stub returns null → never fires, yet the grant card advertises protection), **llm_judged is a fail-closed stub** (judge returns 0.0). A customer approving an anomaly trigger has no anomaly protection.
- Spend-envelope `max_unapproved_spend_per_day` is fetched but never aggregated; the envelope≤Budget-category check is a documented no-op. Latent (no spend-bearing class ships), but **must land before Implosion or any spend class registers.**

**The "two products" problem:**
- The legacy `(dashboard)` shell (`/home /marcus /context /ledger /connections /apps /billing /settings`) is **URL-reachable** (gates only on auth + onboarding) and one stray back-link away from any Cortex user (`LayerDetail.tsx:227` "Back to Context" → `/context`). It exposes "Marcus" as a nav label and — perversely — holds the **only working** billing portal, API-key management, and brief-schedule UIs, while the new SettingsModal ships those as "coming soon" stubs. `/marcus` is a second chat surface over the same threads table.
- `apps/id/src/components/ui/` duplicates Card/ConfidenceRing/EmptyState/Badge/Pagination (violating "packages/ui is the only home for primitives") and **powers the live Cortex Identity page** via legacy `ContextOverview`/`LayerDetail`.

**UI correctness:**
- [Design agent, arithmetic on token hex] `MessageBubble.tsx:57-58` renders the user bubble at ~1.1:1 contrast in both themes — user messages are near-invisible on the product's primary surface. The streaming cursor references a `blink` keyframe that doesn't exist.
- **Zero `loading.tsx`/`error.tsx` in the entire app** — server-rendered Cortex pages have no route-level boundary; a thrown spine query hits Next's default error page.
- Em dashes leak into ~25 customer-visible strings (toasts, onboarding capability copy, revocation lines, Oracle summaries) — the AI-generated path bans them at the prompt; the static-string path doesn't. Insight citations leak raw `insight_id=<UUID>` into chat copy (`pre-analysis.ts:170-173` instructs Sonnet to print them; nothing strips them before render).

**Billing can't acquire a customer:** `stripe_customer_id` is never written anywhere — no Checkout, no Stripe webhook. The plan-picker's Upgrade buttons are permanently disabled. The portal route is real but unreachable without a customer id.

**Security/DB hardening:**
- The JWT Custom Access Token Hook (00069) is **correct and injection-safe** (server-sourced `user_id`, strips stale claims, granted only to `supabase_auth_admin`), but **`supabase/config.toml` does not exist**, so it cannot be enabled as documented locally, and prod enablement is an unverified manual dashboard step. It's inert today (zero RLS policies read the claim — all 187 still subquery), so shipping it now is safe. The landmine is the **cutover**: when the follow-up flips policies to `auth.jwt()->>'account_id'` before the hook is provably enabled, the claim is null and **RLS denies everything tenant-wide.** There's no `coalesce(claim, subquery)` fallback in the tree. Also: the hook's bare `SELECT … INTO` with no `LIMIT` will raise `TOO_MANY_ROWS` once the multi-account schema relaxes `user_id` uniqueness.
- API-key route stores customer keys **plaintext when `KINETIKS_ENCRYPTION_KEY` is unset** (`api-keys/route.ts:62-74`) instead of hard-failing.
- ~15 in-scope RLS tables have **no cross-tenant pgTAP**, including credential-bearing `kinetiks_system_identity`, `kinetiks_analytics_metrics`, the `kinetiks_marcus_*` tables, and `kinetiks_webhooks`.
- 5 internal routes use non-constant-time `!==` secret comparison (the canonical `resolveAuth` uses `timingSafeEqual`).

**Doc drift:**
- `kinetiks-roadmap.md` is 2 months stale — narrates an April repo with DeskOf alive, "28 migrations" (actual 69), and "zero extractors" (resolved). CLAUDE.md still cites it as the timeline.
- `docs/README.md` never mentions the **Contract Addendum** (the whole 2027 architecture hangs on it) and lists 6 of 16 built phases.
- `kinetiks-product-spec-v3.md` §8.1 says Cortex has "five sections" then lists four; the app ships **seven**; the word "authority" appears **zero** times in the 1,016-line v3 spec. The Cortex write-back discipline stops at CLAUDE.md and never reaches the canonical spec.
- CLAUDE.md counts drifted (67→69 migrations, 22→42 pgTAP suites, ~21→19 tools); per-app `CLAUDE.md` files asserted to exist do not.

---

## 4. Does the UX make sense? (your question #1)

**Surface by surface, yes; as a journey, no.** The new `(app)` shell is spec-faithful and frequently polished — the three-tab shell, the Approvals segmented toggle, the seven-section Cortex nav, the plain-language Permissions step, the reject-with-reason flow ("Your reason calibrates future decisions"), the insight→chat handoff, and the fixture honesty tags all hold together and read as one designed product. The Authority and Patterns surfaces uphold the plain-language contract at five enforcement layers; "Authority Grant" never leaks to the customer. This is real craft.

But the **connective tissue is broken**, and a first-day user feels it:

- **Hour 1:** Genuinely good Cartographer onboarding (crawl → adaptive questions → voice calibration → the best trust UX in the product) ends on a screen that misbrands twice ("Your Kinetiks ID is ready", "chat with Marcus") and drops the user into a shell whose header says "kinetiks" because **they were never asked to name anything.** The product's emotional core silently never happened.
- **Hour 2:** They chat with a competent assistant that is "Marcus" if asked. They connect GA4 through a real Nango flow, click into a Cortex Identity layer, hit "Back to Context," and **fall through a wormhole into a different app** — a legacy shell with a different sidebar listing "Marcus," "Billing," "Settings," pages that happen to work better than the ones they came from.
- **Day 2:** Nothing proactive arrives. No brief, no notification, no approval badge. The "team member working while you sleep" promise reads as a chatbot with good manners.

**The single biggest experience problem:** the product's defining promise — name your system and it becomes your GTM teammate — does not exist on any reachable path, and the engine hardcodes the one name the user is never supposed to see. Fixing the identity thread (insert the existing naming step, pass the name to the persona, fix one string) and killing/porting the legacy shell converts this from "two half-products sharing a database" into the product the spec describes.

**Other journey breaks:** approvals arrive silently (badge never fed, desktop notification dead); the first-run greeting is canned, not the spec's teaching greeting; Email/Slack/Calendar "System Connections" cards are visible dead ends (no connect affordance); the goal-first Analytics tab shows zeros for any real account.

**Desktop:** ~5% of the 649-line collaborative-workspace spec (window chrome, tray, a dead notification pipe). Honest scoping per CLAUDE.md's "skeleton" framing, but the component table's "notifications wired" overstates — it's half a pipe with no producer.

---

## 5. Is this an optimal use of modern AI agents? (your question #2)

**The trust substrate is ahead of the market; the orchestration is behind it; and the agents communicate richly but invisibly.**

**What's genuinely differentiated and worth protecting:** authority resolution running before *every* tool call in exactly one place; confidence thresholds with real contraction math; an append-only ledger feeding loops that verifiably close (threshold calibration on every decision, Authority Agent proposals built from ledger history including typed revocation reasons, pattern decay from observation counts); per-turn trace discipline (every turn is one queryable `agent_run_id`); and an MCP surface (`chat_with_marcus`, `get_daily_brief`) that exposes the product to *external* agents — a real strategic instinct. Most 2026 agent products fake exactly this layer.

**Where the "LLM is the orchestration layer" claim is not true today:**

- **Marcus consults exactly one data source per turn.** The tool decision is one pre-committed Haiku pick, not a multi-turn loop (`tool-decision.ts:224` "One tool call max"). Three table-stakes GTM questions Marcus *cannot* answer today: "did traffic convert to revenue — GA4 sessions vs Stripe MRR," "Google Ads or Meta, where do I shift $2k," "did last week's LinkedIn posts move pipeline." Cross-source synthesis is the flagship promise of a "GTM brain," and it's exactly what the architecture forecloses. Lesson 6's bounded-trace rationale was sound for D1, but its own deferral condition ("add fanout when GSC+Stripe land") was met when those tools registered. The decision aged from prudent to limiting.
- **The five "Operators" are conventional code paths with LLM calls inside,** not agents reasoning with tool whitelists. The architecture doc's background-agent loop (`executeAgent`, the agent registry) has **zero corresponding code.** Oracle is a deterministic detector batch + one polish call.
- **The proactive layer generates into tables nobody reads** (2.4). An ambient teammate that never speaks first is a search box.

**Unique agent-communication opportunities (ranked by impact-per-effort), all of which fit the existing architecture:**

1. **(S) Stream status events in the chat SSE.** The protocol is already typed; the engine knows the tool + reason before streaming (`engine.ts:511`). Emit "Checking your GA4 cache…" — converts the dead 1.5-3s pre-stream into visible agent work. Cheapest possible "the system is alive" signal.
2. **(M) Multi-tool fanout (D3).** Extend the decision to ≤3 non-consequential tools, `Promise.all` through `AgentRun` (already supports per-call invocation), render multiple observation blocks. Highest capability-per-effort change in the codebase — it's what turns the chatbot-with-a-lookup into the cross-source strategist.
3. **(M) An "Activity" feed surfacing the agent division of labor that already exists in the ledger** — "Oracle scanned 3 sources overnight, found 2 insights; Archivist merged 1 proposal, recalibrated 4 patterns." Zero new instrumentation. This is the literal answer to "do agents communicate in ways that benefit the user": today they do (proposals, insights, handoffs) but invisibly.
4. **(M) Wire the dead proactive loop** (2.4) — connect briefs→channel, urgent insight→notification, approval→badge. One PR makes the differentiated story demoable.
5. **(S/M) Tool-provenance chips on messages** — `tool_calls` rows already carry thread-correlated provenance; render "GA4 · cached 2h ago · fresh." No other GTM product shows its evidence chain; Kinetiks already logs it.
6. **(L) Approval-as-conversation** — let the user reply to an approval in-thread ("tighten the subject line, then approve") and route through the existing edit-analyzer. Moves HITL from queue ergonomics to conversational steering — on-brand for a product whose thesis is talking to your GTM system.

**The single change that most raises the AI-native ceiling:** multi-tool fanout with streamed status events (#1 + #2). Close second: wiring the proactive loop (#4).

---

## 6. Strengths to preserve

These are real and above the bar; don't regress them while fixing the above.

- **The Marcus v2 engine is a faithful, sophisticated build** of the opinionated architecture: pre-generation evidence brief adjacent to the question, ~300-token persona, structurally separated action generation, no surviving post-generation validators.
- **The design token system is the best artifact in the repo** — complete, dual-mode-composed, correct light/dark mechanics, global reduced-motion and focus-visible, FOUC-free Supabase-profile theme persistence.
- **Registry discipline** — tools, pattern types, action classes, operators all boot-validated and cross-checked; inconsistency fails startup, not runtime.
- **The authority resolver is single-locus and fail-safe** — narrowest-grant selection, constraint narrowing, fail-closed adapters (rate-limit counter throws rather than reporting "under cap"), ledger-before-throw ordering.
- **Statistical literacy** — Welford parallel merge, bounded decay calibration, idempotent evidence dedup, all unit-tested.
- **RLS posture** — 99 of 100 tables RLS'd in their creating migration; CI-gated cross-tenant pgTAP that demonstrably catches regressions; tight SECURITY DEFINER RPCs with a cross-account leak already caught in review (00067).
- **Customer-language enforcement at five layers** — "Authority Grant" provably never reaches customer copy.
- **Fixtures honesty** (Patterns + Ledger surfaces tag fixture rows; cleanup archives, never deletes) and the **QUESTIONS.md / deferred-by-design culture** — the team documents its gaps rather than hiding them.

---

## 7. Confirmed deferred-by-design (not findings)

Verified to fail cleanly and to be unreachable from user-facing paths:
- Operator executors for Cartographer/Marcus/Oracle are registration-only stubs that throw if dispatched via a Workflow; only the Archivist executor is wired (it proves the platform). Real logic runs through the original paths.
- Authority Agent implements `campaign_launch`; `workflow_start`/`standing_review`/`first_connect` return a structured 422.
- Programs hierarchy (`kinetiks_programs`/`kinetiks_workflows`/`kinetiks_tasks`) is scope-locked and unbuilt — but CLAUDE.md and the Addendum describe those tables as existing; **fix the docs** to say "deferred."
- Suite apps (hv/dm/ht/im/lt/av) out of active scope; fixtures stand in. Synapse presets for harvest/dark-madder are harmless config dead code.
- No E2E layer (known). The desktop app is an honest ~5% skeleton.

---

## 8. Recommendations, ranked by user-impact × effort

**Fix-first — small effort, ship-blocking impact:**
1. Add the `account_id` ownership filter to `chat/[threadId]/page.tsx` (tenant leak, 1.1) — one line.
2. Gate `auto_threshold` consequential tools into the approval queue; restrict/route `/api/tools/execute`; add the escalation approve→execute path (1.2) — closes the central safety hole.
3. Thread `system_name` into the persona prompt + insert the existing naming step into onboarding + fix the "chat with Marcus" string (1.3).
4. Add the 3-4 missing approval event types to the ledger CHECK + fix the `data`/`attribution` column bug (1.4).
5. Repoint engine ledger writes `kinetiks_learning_ledger` → `kinetiks_ledger`; correct the `00024` thread-memory FK to `kinetiks_accounts(id)` (2.2).

**High impact, moderate effort:**
6. Set the missing prod env vars — **Sentry first** (you're blind without it), then Nango/Slack/email (2.1).
7. Reconcile Nango config ↔ nango.yaml ↔ handlers; add a boot-time handler-parity assertion (2.3).
8. Wire the proactive loop: brief→channel delivery, approval badge, urgent-insight→notification (2.4).
9. Delete or hard-redirect the `(dashboard)` shell — but first port billing portal, API-key management, and brief schedules into the SettingsModal; fix the `LayerDetail` back-link to `/cortex/identity` (3, "two products").
10. Add a CI gate (type-check + Vitest on every PR) and fix `pnpm lint`; add an integration test that a paused/revoked grant stops authorizing (2.9).
11. Add the approval-decision concurrency guard (`.eq("status","pending")` + rowcount) (2.6).

**Medium:**
12. Wire the already-written cross-source Oracle detectors into the runner; add a goal-snapshot writer; delete the dead metric-cache-cron or restore its route (2.5).
13. Add a ledger immutability trigger + goals/budgets transition triggers (2.7).
14. Wire `rollUpUsageSummaries` to a cron + ship the digest; either implement or stop proposing the inert anomaly/llm_judged triggers (3).
15. Fix the `MessageBubble` contrast bug; retire `components/ui` duplicates; add `loading.tsx`/`error.tsx`; sweep em dashes from static strings; strip insight UUIDs before render (3).
16. Reconcile the docs (roadmap, README, v3 Cortex sections, CLAUDE.md counts, Programs "deferred") (3).

**Before any spend-bearing app (Implosion):** implement spend-envelope daily aggregation + the envelope≤Budget-category check (3).

**Before the JWT-hook RLS cutover:** commit `config.toml` with the hook block, add a `/api/health` assertion that a fresh token carries `account_id`, and ship a `coalesce(claim, subquery)` fallback so the cutover can't brick all tenants (3).

---

## Could not verify (would need a running app / prod credentials)

- Whether migration 00069 is applied to prod and whether the JWT hook is enabled there (`supabase migration list --linked`; decode a fresh session JWT).
- Whether Edge Function crons are firing in prod and the prod value of `KINETIKS_FIXTURES_ENABLED` (`supabase secrets list`).
- Runtime persona behavior (does Sonnet self-identify as "Marcus" — the prompt instructs it, but no app was run).
- Actual rendered contrast/latency (arithmetic and call-chain analysis, not measured pixels/timing).
- pgTAP pass/fail locally (requires `supabase start`; the GitHub Actions RLS job passing on 2026-05-29 is the compensating evidence).
