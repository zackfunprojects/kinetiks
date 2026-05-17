# F0 follow-ups — status

F0 (foundations) is functionally complete. Type-check, AI boundary, and
production build are all green. This file tracks what's done and what
remains as a one-line operational step.

## Done in F0

- [x] Design tokens promoted to `packages/ui/styles/kinetiks-tokens.css` (Paper/Slate light+dark, including `--kt-backdrop` / `--kt-overlay-strong` / `--kt-glass`).
- [x] 14 token-driven primitives in `packages/ui/src/`: Button, Input, Textarea, Card, Pill, Dialog, ToastProvider, Tabs, Toggle, ConfidenceRing, EmptyState, Skeleton, Avatar, ThemeProvider.
- [x] DM Serif Display + Geist + Geist Mono via `next/font/google` and `geist` package; pre-paint theme script in [layout.tsx](apps/id/src/app/layout.tsx).
- [x] `apps/id/src/app/providers.tsx` wires ThemeProvider with Supabase persistence + ToastProvider.
- [x] `@kinetiks/lib` package with env, pagination, state-machines, format, template-vars, pii, result.
- [x] `@kinetiks/ai` router (`router.ts`, `errors.ts`, `prompts-registry.ts`) + `configureAICallLogger`.
- [x] `apps/id/src/lib/ai/logger.ts` Supabase-backed `AICallLogger` + `apps/id/src/instrumentation.ts` boot wire-up.
- [x] Migration [00031_user_preferences.sql](supabase/migrations/00031_user_preferences.sql) (user theme persistence).
- [x] Migration [00032_ai_and_tool_calls.sql](supabase/migrations/00032_ai_and_tool_calls.sql) (`kinetiks_ai_calls`, `kinetiks_tool_calls` with `team_scope_id` v2 placeholder + RLS).
- [x] [.eslintrc.json](.eslintrc.json) + [scripts/check-ai-boundary.sh](scripts/check-ai-boundary.sh) banning direct `@anthropic-ai/sdk` imports outside `packages/ai` — currently passes clean.
- [x] Sentry capture helper with canonical context shape + `USER_SAFE` constants in [apps/id/src/lib/observability/sentry.ts](apps/id/src/lib/observability/sentry.ts).
- [x] PostHog wrapper + canonical event taxonomy in [apps/id/src/lib/observability/posthog.ts](apps/id/src/lib/observability/posthog.ts) and [docs/observability/event-taxonomy.md](docs/observability/event-taxonomy.md).
- [x] pgTAP scaffold (`supabase/tests/_setup.sql`, `proposals_cross_tenant.sql`, `user_preferences_cross_tenant.sql`, `ai_calls_cross_tenant.sql`, `tool_calls_cross_tenant.sql`) + [scripts/test-rls.sh](scripts/test-rls.sh) runner.
- [x] **Full component sweep**: 581 file-touches across 31 legacy-token → `--kt-*` mappings via [scripts/migrate-tokens.sh](scripts/migrate-tokens.sh). No hardcoded color values remain in component code (only the documented `EMAIL_PALETTE` constants in `lib/email/templates.ts` and the regex source patterns in `lib/cartographer/extract-brand.ts`).
- [x] Legacy CSS variable alias block deleted from [apps/id/src/app/globals.css](apps/id/src/app/globals.css).
- [x] Email templates ([lib/email/templates.ts](apps/id/src/lib/email/templates.ts)) converted from old dark palette to Paper-mode design-spec hex values.
- [x] App-registry colors map to `--kt-app-*` tokens.
- [x] Workspace type-check passes (13/13 packages); AI SDK boundary check passes; `apps/id` production `next build` succeeds.

## Manual operational steps (require Docker / live Supabase)

These don't need code changes; they're operational steps the engineer
runs locally when Docker is up.

1. **Apply migrations + regenerate types.**
   ```bash
   supabase start                                              # needs Docker
   supabase db reset                                           # replays 00001..00032
   pnpm db:types                                               # regenerates packages/supabase/src/types.ts
   git add packages/supabase/src/types.ts supabase/migrations/000{31,32}_*.sql && \
     git commit -m "feat(db): user_preferences + ai/tool_calls tables"
   ```

2. **Run the pgTAP suite.**
   ```bash
   brew install pg_prove
   ./scripts/test-rls.sh
   ```
   Expected: 28 assertions pass across the four cross-tenant tests.

3. **End-to-end smoke** (dev server check):
   ```bash
   pnpm --filter @kinetiks/id dev
   # open http://localhost:3000, toggle theme in Settings → Account,
   # confirm 600ms crossfade + persistence in kinetiks_user_preferences.
   ```

## Genuinely out-of-F0 scope (lives in F2 hardening)

- **Marcus migration to the new router.** `apps/id/src/lib/marcus/*` still
  calls the lower-level `askClaude`/`streamClaude` directly. Migrating
  each task to `routeAskClaude` + `registerPromptTask` is mechanical
  but belongs in F2 (Agent Runtime + Marcus v2 hardening), where the
  per-task `correlation_id`/`thread_id` plumbing also lands.
