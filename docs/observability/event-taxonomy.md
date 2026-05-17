# Kinetiks Event Taxonomy

> The canonical list of product events the platform tracks via PostHog.
> Adding a new event requires adding both the name to
> `apps/id/src/lib/observability/posthog.ts` and a row here.
>
> **PII rule:** every property is an id or a primitive. No emails, no
> phone numbers, no full names, no full prompt content, no raw payloads.

---

## Identification

`posthog.identify(kinetiks_accounts.id, { role, app })` fires once per
auth boundary crossing (signup, login, sticky session resume). The PostHog
distinct_id is the `kinetiks_accounts.id`. `team_scope_id` is a v2
placeholder; not surfaced yet.

---

## Funnel definitions (canonical)

These are the funnels Analytics and the Insights surface use as reference
points. The PostHog dashboards are built against these step sets.

1. **Signup → first approval card** *(time-to-first-card; target < 15 min)*
   `auth.signup → onboarding.start → onboarding.finish → setup.system_named → approval.surfaced`
2. **Connect-first → first sync** *(integration health)*
   `connection.added → extractor.first_sync`
3. **Insight → action** *(insight quality)*
   `insight.surfaced → insight.acted_on`
4. **Authority proposal → grant active** *(authority quality)*
   `cortex.authority_grant_approved → tool_call_under_grant` *(action class telemetry; not a PostHog event but a tool_calls row)*

---

## Events

| Event | When | Properties |
|---|---|---|
| `auth.signup` | New account creation | `app`, `kinetiks_id`, `entry_path` (`app_first` \| `kinetiks_first`) |
| `auth.login` | Session start | `app` |
| `auth.logout` | Explicit sign-out | `app` |
| `onboarding.start` | Cartographer flow begins | `app` |
| `onboarding.step_complete` | Per-step | `step` (`crawl` \| `voice` \| `writing_sample` \| etc.), `step_index` |
| `onboarding.finish` | Cartographer completes; Context Structure populated | `app`, `cortex_confidence_avg` |
| `setup.system_named` | User assigns a system name | `app` |
| `setup.email_connected` | Google Workspace or M365 OAuth completes | `provider` (`google_workspace` \| `microsoft_365`) |
| `setup.slack_connected` | Slack OAuth completes; bot in workspace | (none) |
| `chat.message_sent` | User sends a message in Chat | `thread_id`, `message_kind` (`question` \| `directive` \| `command`) |
| `chat.thread_created` | New thread | `thread_id` |
| `marcus.action_proposed` | Marcus emits an action through the action channel | `thread_id`, `app`, `action_class` |
| `marcus.command_dispatched` | Cross-app command-router dispatches | `target_app`, `command_id`, `target_count` (number of apps), `parallel` |
| `cortex.identity_edited` | Direct Cortex Identity edit (via Proposal) | `layer`, `confidence_delta` |
| `cortex.pattern_starred` | User stars a pattern | `pattern_type`, `pattern_id` |
| `cortex.pattern_suppressed` | User suppresses a pattern | `pattern_type`, `pattern_id` |
| `cortex.authority_grant_approved` | User approves a grant proposal | `grant_id`, `scope_type`, `action_classes` (string[]) |
| `cortex.authority_grant_revoked` | User revokes an active grant | `grant_id`, `had_usage` (bool) |
| `cortex.goal_created` | New goal | `goal_type` (`kpi` \| `okr`), `contributing_apps_count` |
| `cortex.goal_updated` | Goal edited (target, period, mapping) | `goal_id`, `change_kind` |
| `cortex.budget_updated` | Budget allocation changed | `category` |
| `approval.surfaced` | An approval card lands in the queue | `approval_id`, `source_app`, `approval_type` (`quick` \| `review` \| `strategic`), `action_class` |
| `approval.approved` | User approves | `approval_id`, `had_edits` (bool), `latency_seconds` |
| `approval.rejected` | User rejects | `approval_id`, `has_reason` (bool) |
| `approval.batch_approved` | User batch-approves quick items | `count`, `source_apps` (string[]) |
| `approval.edited` | User edits before approving | `approval_id`, `edit_kind` |
| `approval.expired` | Approval ages out | `approval_id`, `approval_type` |
| `insight.surfaced` | New insight written and surfaced | `insight_id`, `type`, `severity` |
| `insight.acted_on` | User clicked through / accepted recommendation | `insight_id`, `outcome` |
| `insight.dismissed` | User dismisses | `insight_id`, `reason_kind` |
| `connection.added` | OAuth or API-key connection completes | `provider`, `kind` (`oauth` \| `apikey`) |
| `connection.removed` | User disconnects | `provider` |
| `extractor.first_sync` | First successful pull for a connection | `provider`, `latency_ms` |
| `extractor.sync_error` | Sync failure | `provider`, `error_class` |
| `theme.toggled` | User switches theme | `to` (`light` \| `dark`) |

---

## What does NOT belong here

- Email subjects, body excerpts, prospect names, contact info
- Raw chat text or message bodies
- OAuth tokens, encrypted blobs, service-role keys
- Full prompt text (use `task` ids instead)
- Approval `preview` JSONB content (use `approval_id` only)

If a property would help with debugging but might contain PII, leave it out
of PostHog and capture it as a Sentry `extra` with the canonical shape
(`ids only, no raw payloads`).
