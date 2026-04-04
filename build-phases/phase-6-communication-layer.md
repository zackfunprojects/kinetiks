# Phase 6: Agent Communication Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the system real communication channels — email (Google Workspace / Microsoft 365), Slack (team workspace presence), and calendar. The named GTM system becomes a real participant in the company's daily work.

**Architecture:** OAuth integrations with Google Workspace and Microsoft 365 for email + calendar. Slack Bolt app for workspace presence. All channels use the system's chosen name. Email is for briefs, alerts, and receiving forwarded context. Slack is for real-time team interaction. Calendar is for scheduling and meeting prep. Intelligence extracted from all channels feeds into Cortex.

**Tech Stack:** Next.js 14, TypeScript, Gmail API / Microsoft Graph API, Slack Bolt, Supabase, Anthropic Claude API (Haiku for intelligence extraction)

**Spec Reference:** `docs/specs/agent-communication-layer-spec.md` — read ENTIRE spec.

---

## File Structure

```
apps/id/src/lib/
  email/
    connect.ts                  # OAuth flows for Google Workspace and Microsoft 365
    send.ts                     # Send email as system identity
    receive.ts                  # Poll inbox, process incoming messages
    templates.ts                # Email templates (daily brief, weekly digest, alerts, meeting prep)
    intelligence.ts             # Extract intel from received emails (Claude Haiku)
  slack/
    bot.ts                      # Slack Bolt initialization (UPDATE: use system name as display name)
    events.ts                   # Event handlers (UPDATE: add channel monitoring, intelligence extraction)
    blocks.ts                   # Block Kit builders (UPDATE: add approval buttons, brief formats)
    sync.ts                     # Thread sync between Slack and web Chat (UPDATE: ensure bidirectional)
    intelligence.ts             # Extract intel from monitored channels (Claude Haiku)
    proactive.ts                # Proactive message scheduling and delivery
  calendar/
    connect.ts                  # OAuth with calendar scopes
    events.ts                   # Create/read calendar events
    prep.ts                     # Meeting prep brief generation

apps/id/src/app/api/
  connections/
    email/route.ts              # Email OAuth flow + connection management
    slack/route.ts              # Slack OAuth flow + connection management
    calendar/route.ts           # Calendar connection management

apps/id/src/components/setup/
  ConnectEmail.tsx              # Email connection step in setup flow
  ConnectSlack.tsx              # Slack connection step in setup flow

supabase/functions/
  email-poll/index.ts           # CRON: check for new emails (5 min)
  meeting-prep/index.ts         # CRON: generate prep briefs for upcoming meetings (30 min before)
```

---

## Tasks

### Task 1: Email OAuth Connection
- [ ] Create `lib/email/connect.ts` — OAuth flow for Google Workspace (Gmail API) and Microsoft 365 (Microsoft Graph). Handle token storage, refresh, and error recovery.
- [ ] Create `api/connections/email/route.ts` — endpoints for initiating OAuth, handling callback, reading connection status, disconnecting
- [ ] Store encrypted credentials in `kinetiks_system_identity.email_credentials`
- [ ] Create `ConnectEmail.tsx` — setup step component with provider selection (Google/Microsoft), OAuth trigger, email address designation, connection status display
- [ ] Wire ConnectEmail into the setup flow (Phase 1's SetupFlow now includes this step)
- [ ] Verify: OAuth flow completes, tokens stored, connection shows as active
- [ ] Commit: `feat(email): add OAuth connection for Google Workspace and Microsoft 365`

### Task 2: Email Sending
- [ ] Create `lib/email/send.ts` — send email via Gmail API or Microsoft Graph using stored credentials. Sender name is the system's chosen name.
- [ ] Create `lib/email/templates.ts` — HTML email templates for: daily brief, weekly digest, monthly review, alert, meeting prep summary. Clean design matching Kinetiks brand. Each includes CTA to open Kinetiks or reply in Slack.
- [ ] Wire Marcus brief generator to email delivery (daily/weekly/monthly based on user's notification preferences)
- [ ] Wire Oracle alert delivery to email (urgent alerts only, unless user configures otherwise)
- [ ] Implement rate limiting (20 emails/day max from system identity)
- [ ] Implement user preferences: which email types to receive, preferred send times, quiet hours
- [ ] Verify: daily brief sends at configured time, alert emails deliver, rate limit enforced
- [ ] Commit: `feat(email): add email sending with templates and brief delivery`

### Task 3: Email Receiving
- [ ] Create `lib/email/receive.ts` — poll inbox via Gmail API / Microsoft Graph. Fetch new messages since last check. Classify relevance.
- [ ] Create `lib/email/intelligence.ts` — process relevant emails through Claude Haiku: detect forwarded threads, extract business context, identify action items, competitive intel, deal context
- [ ] Route extracted intelligence: business context → Cortex Proposals, action items → Marcus (surface in Chat), deal context → Harvest (via Synapse)
- [ ] Create `supabase/functions/email-poll/index.ts` — CRON every 5 minutes
- [ ] Handle: forwarded competitor intel, forwarded deal threads, replies to system-sent emails, external notifications
- [ ] Log all processed emails in Ledger (not raw content — just structured intelligence)
- [ ] Verify: forward an email to the system, intelligence extracted and routed correctly
- [ ] Commit: `feat(email): add email receiving with intelligence extraction`

### Task 4: Slack Bot Identity
- [ ] Update `lib/slack/bot.ts` — use system name as bot display name (read from `kinetiks_system_identity` or `kinetiks_accounts.system_name`)
- [ ] Create `ConnectSlack.tsx` — setup step for Slack OAuth, workspace selection, channel selection
- [ ] Create `api/connections/slack/route.ts` — OAuth flow, workspace connection, channel management
- [ ] Wire into setup flow
- [ ] Implement system name propagation: when name changes in Cortex, update Slack bot display name via API
- [ ] Verify: bot appears in Slack with correct system name, responds to mentions
- [ ] Commit: `feat(slack): configure Slack bot with system name identity`

### Task 5: Slack Channel Monitoring
- [ ] Create `lib/slack/intelligence.ts` — process channel messages for GTM-relevant signals. Extract: deal discussions, content ideas, competitive mentions, customer feedback. Use configurable keyword lists.
- [ ] Update `lib/slack/events.ts` — add handlers for channel messages (not just DMs and mentions). Intelligence extraction runs on relevant messages only.
- [ ] Route extracted intelligence to Cortex via Proposals
- [ ] Privacy: only process channels the system has been added to. Don't store raw messages. Only persist structured intelligence.
- [ ] Verify: post a message mentioning a competitor in a monitored channel, intelligence extracted and routed
- [ ] Commit: `feat(slack): add channel monitoring with intelligence extraction`

### Task 6: Slack Proactive Communication
- [ ] Create `lib/slack/proactive.ts` — scheduling and delivery for proactive messages
- [ ] Implement DM delivery: daily briefs, alerts, follow-up reminders, approval notifications
- [ ] Implement channel posting (when user enables): weekly summaries, milestone celebrations, team alerts
- [ ] Build user controls: per-channel proactive posting toggle, frequency limits, quiet hours
- [ ] Commit: `feat(slack): add proactive messaging with user controls`

### Task 7: Slack Inline Approvals
- [ ] Update `lib/slack/blocks.ts` — add Block Kit builders for approval cards: preview, approve/edit/reject buttons
- [ ] Build interactive handlers for approval button clicks: approve → call approval API, reject → open modal for reason, edit → link to Kinetiks
- [ ] Only send inline approvals for quick type. Review and strategic link to the app.
- [ ] Verify: approval appears in Slack DM, approve button works, approval status updates in app
- [ ] Commit: `feat(slack): add inline approval buttons for quick approvals`

### Task 8: Slack ↔ Chat Sync
- [ ] Update `lib/slack/sync.ts` — ensure conversations in Slack DM create/update threads in `kinetiks_marcus_threads` with `channel: 'slack'`
- [ ] Ensure Marcus has full context: messages from Slack visible in Chat thread, messages from Chat visible in Slack thread
- [ ] Thread linking: `kinetiks_marcus_threads.slack_thread_ts` maps Slack threads to Chat threads
- [ ] Verify: start conversation in Slack, continue in Chat. Start in Chat, continue in Slack.
- [ ] Commit: `feat(slack): bidirectional thread sync between Slack and Chat`

### Task 9: Calendar Integration
- [ ] Create `lib/calendar/connect.ts` — OAuth with Google Calendar / Microsoft Graph calendar scopes
- [ ] Create `lib/calendar/events.ts` — read upcoming events, create new events (for Harvest meeting booking)
- [ ] Create `lib/calendar/prep.ts` — generate meeting prep briefs. Pull prospect context from Harvest, company intel from Cortex, recent content engagement from Dark Madder. Deliver via email or Slack DM 30 minutes before meeting.
- [ ] Create `supabase/functions/meeting-prep/index.ts` — CRON that checks for upcoming meetings and triggers prep brief generation
- [ ] Wire Marcus scheduling awareness: Calendar context available in conversations ("You have a meeting with Acme tomorrow")
- [ ] Safeguards: never delete/modify existing events, meeting creation goes through approval unless explicitly commanded
- [ ] Verify: meeting prep brief generates before a calendar event with a known prospect
- [ ] Commit: `feat(calendar): add calendar integration with meeting prep briefs`

### Task 10: Channel Preference Learning
- [ ] Build passive observation: track which channels the user engages with (reads Slack briefs but ignores email → shift to Slack)
- [ ] Store preferences in user notification settings
- [ ] Allow explicit override at any time
- [ ] Commit: `feat(comms): add channel preference learning from user behavior`

### Task 11: End-to-End Verification
- [ ] Email: OAuth connects, brief sends at scheduled time, forwarded email processes and extracts intelligence
- [ ] Slack: bot appears with system name, responds to mentions via Marcus, monitors channels, sends proactive DMs, inline approval buttons work
- [ ] Calendar: reads upcoming events, generates meeting prep, Marcus knows about scheduled meetings
- [ ] Sync: Slack ↔ Chat thread sync works bidirectionally
- [ ] Name propagation: changing system name updates Slack bot name and email sender
- [ ] Disconnection: disconnecting any channel doesn't break the core app
- [ ] User preferences: notification settings respected for all channels
- [ ] `pnpm build` passes
- [ ] Commit: `chore: phase 6 complete — agent communication layer verified`
