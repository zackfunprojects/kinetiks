# Agent Communication Layer Spec

> **This is the specification for the Kinetiks agent communication layer — how the system gets arms.**
> The named GTM system needs real communication channels to be a real participant in the company's work. Email lets it receive forwarded threads and send briefs. Slack lets it live in the team's daily conversation. Calendar lets it manage scheduling.
> These are the system's identity surfaces — where the name the user chose becomes tangible.
> Read `docs/kinetiks-product-spec-v3.md` Sections 2, 3.4, and 10 for product context.

---

## 1. Overview

The Kinetiks Chat tab is the primary interface. But the system can't live only inside its own app. To be a real GTM team member, it needs to exist where the team already works — email, Slack, and calendar.

The agent communication layer connects the named system to these channels. It's what makes the difference between "a tool I open" and "a team member that's always plugged in."

**Three channels, one identity:**

| Channel | Primary Use | Direction |
|---------|------------|-----------|
| **Email** | Receive forwarded context, send briefs and summaries, appear in company directory | Bidirectional |
| **Slack** | Live in team channels, answer questions, send alerts, extract intelligence | Bidirectional |
| **Calendar** | Schedule meetings (from Harvest), provide scheduling context, manage availability | Mostly outbound |

All three use the system name the user chose. "Kit" shows up in Slack as Kit. Emails come from Kit. Calendar invites are sent by Kit. The identity is consistent across every surface.

**What this is NOT:**

This is not the outbound email system. Harvest owns cold outreach — dedicated sending domains, multi-inbox warming, deliverability management, sequence infrastructure. The communication layer is the system's *internal identity* within the company. It's the difference between a sales rep's cold email tool and their personal work email.

---

## 2. Email Integration

### 2.1 Setup

During Kinetiks onboarding (Path B) or upgrade (Path A → Kinetiks), the user connects their company email system:

**Google Workspace:**
- OAuth flow with scopes: `gmail.send`, `gmail.readonly`, `gmail.modify` (for labels/read status)
- The user designates an email address for the system (existing or newly created)
- Kinetiks stores OAuth refresh token encrypted in `kinetiks_system_identity.email_credentials`

**Microsoft 365:**
- OAuth flow with Microsoft Graph API
- Scopes: `Mail.ReadWrite`, `Mail.Send`
- Same designation flow for the system's email address

**What the user provides:**
- Which email provider (Google or Microsoft)
- Which email address to use (e.g., `kit@acme.com`)
- Whether to create a new address or use an existing one (if creating, the user does this in their admin console — Kinetiks just connects to it)

### 2.2 Receiving Email

The system monitors its inbox for incoming messages. Everything received is processed through an intelligence pipeline:

**Polling mechanism:** Check for new messages every 5 minutes via API (Gmail API `messages.list` with `after` filter, or Microsoft Graph `/messages` with `$filter`). Push notifications via Gmail watch / Microsoft Graph subscriptions as an optimization when available.

**Processing pipeline for each received email:**

```
Email received
  → Classify: is this relevant to GTM operations?
    → If spam/irrelevant: archive, no further processing
    → If relevant: continue
  → Extract sender, subject, body, thread context
  → Intelligence extraction (Claude Haiku):
    - Is this a forwarded thread? Extract the business context.
    - Is this a reply to something the system sent? Match to the thread.
    - Does this contain competitive intel, customer feedback, deal context, or market signals?
    - Are there action items or requests directed at the system?
  → Route extracted intelligence:
    - Business context → Cortex Proposals (via standard pipeline)
    - Action items → Marcus (surfaces in Chat as "You forwarded an email about X. Here's what I found...")
    - Deal context → Harvest (via Synapse, if relevant to active prospects)
    - Competitive intel → Cortex competitive layer
  → Log in Ledger
```

**Key use cases for received email:**

- **Forwarded threads.** A sales rep CCs the system on a deal thread. The system reads the conversation, extracts buyer objections, updates prospect records in Harvest, and surfaces insights in Chat: "I read the Acme thread. The buyer mentioned compliance concerns twice — I've added that to their prospect profile and adjusted the follow-up messaging."

- **Forwarded competitor intel.** Someone sends a competitor's new pricing page to the system. It's analyzed, competitive layer updated, and relevant apps notified.

- **Replies to system-sent emails.** If the system sent a brief or summary and the user replies, the reply is processed as a Chat message — continuing the conversation across channels.

- **External notifications.** Connected services sending alerts (ad platform notifications, CRM alerts) that the system can parse and act on.

### 2.3 Sending Email

The system sends email for internal communication, not outbound sales. Types of emails it sends:

**Scheduled briefs:**
- Daily brief: concise summary of what happened, what needs attention, key metrics
- Weekly digest: deeper analysis, trend summary, goal progress
- Monthly review: comprehensive performance report, strategic recommendations

Each brief includes a "Reply in Slack" or "Open Kinetiks" CTA — the goal is to pull the user into the richer interface for follow-up.

**Alert emails:**
- Urgent alerts when something significant happens and the user isn't in Slack or the app
- Budget threshold warnings
- Critical metric changes
- Approval items that are about to expire

**Summary emails:**
- Meeting prep: before a scheduled meeting with a prospect, send a brief with context from Cortex, recent interactions from Harvest, relevant content from Dark Madder
- Weekly approval summary: what was approved, rejected, auto-approved, and expired

**Email formatting:**
- Clean, simple HTML templates with the system's name in the header
- Matches Kinetiks brand (purple accent, clean typography)
- Never looks like a marketing email — looks like a colleague's update
- Always includes the system name as sender: "From: Kit <kit@acme.com>"

### 2.4 Email Sending Safeguards

All outbound email from the system goes through checks:

- **Never sends to external contacts unprompted.** The system only emails the user and designated team members internally. External-facing email (outreach, pitches) goes through the respective apps' own infrastructure.
- **Rate limited.** Maximum 20 emails per day from the system identity. This is an internal communication tool, not a bulk sender.
- **User controls.** The user configures in Settings: which emails they want (daily brief: yes, weekly digest: yes, alerts: urgent only), preferred time for scheduled sends, quiet hours.
- **Approval for unusual sends.** If Marcus decides to send an email outside the normal patterns (e.g., a custom summary the user requested), it's sent immediately since the user explicitly asked. If an agent decides autonomously that an email should be sent, it goes through the approval system.

---

## 3. Slack Integration

### 3.1 Setup

During Kinetiks onboarding or upgrade, the user connects Slack:

**OAuth flow:**
- Kinetiks registers as a Slack app
- User authorizes with scopes: `channels:history`, `channels:read`, `chat:write`, `groups:history`, `groups:read`, `im:history`, `im:read`, `im:write`, `users:read`, `app_mentions:read`
- The bot user is created with the system's chosen name as the display name
- User selects which channels the system should join

**Bot identity:**
- Display name: the system name the user chose (e.g., "Kit")
- Avatar: Kinetiks logo or a custom avatar the user uploads
- Status: "Managing GTM" or similar
- The bot appears in the workspace member list

### 3.2 Channel Monitoring

The system listens in all channels it's been added to. It processes messages through an intelligence pipeline:

**What it listens for:**

- **Direct mentions (@Kit):** The system is being asked something. Route to Marcus for a response.
- **Relevant keywords:** Configurable keywords that indicate GTM-relevant content (competitor names, product names, industry terms). Extracted as intelligence signals.
- **Deal discussions:** Conversations about prospects, deals, or customers. Extracted and routed to Harvest.
- **Content ideas:** Discussions about topics, trends, or customer questions. Extracted and routed to Dark Madder.
- **Competitive signals:** Mentions of competitors, market changes, industry shifts. Extracted and routed to Cortex.
- **Feedback signals:** Customer complaints, feature requests, or satisfaction signals. Extracted and routed to Cortex.

**What it does NOT do:**

- Read every message in every channel indiscriminately. Only channels it's been added to.
- Store raw message content. It extracts structured intelligence and discards the raw text.
- Respond to every message. Only responds when mentioned or when it has something genuinely useful to add (and only if the user has enabled proactive responses for that channel).
- Monitor DMs between other users. Only its own DM channel with users.

### 3.3 Responding in Channels

When the system is mentioned or asked a question:

**@Kit how's our pipeline looking?**
→ Marcus processes as a query command
→ Oracle provides the data
→ System responds in-thread with pipeline summary
→ Uses Slack Block Kit for rich formatting (tables, charts as images, action buttons)

**@Kit draft a follow-up to the Acme conversation**
→ Marcus processes as an action command
→ Harvest drafts the follow-up
→ System responds: "I've drafted a follow-up for Acme. It's in your approval queue. [View in Kinetiks]"

**@Kit what do we know about [competitor]?**
→ Marcus processes as a query
→ Pulls from Cortex competitive layer
→ Responds with competitive brief

**Response guidelines:**
- Keep Slack responses concise. This isn't the Chat tab — space is limited and context is shared.
- Use Block Kit formatting for structured data (tables, sections, buttons)
- Include "View more in Kinetiks" links for detailed follow-ups
- Never dump long-form content in Slack. Summarize and link.
- Respond in-thread to the mention, not in the main channel (to avoid noise)

### 3.4 Proactive Communication in Slack

The system initiates messages in two contexts:

**DMs to the user:**
- Daily brief delivery (if user prefers Slack over email)
- Urgent alerts (metric anomalies, expiring approvals, budget warnings)
- Follow-up reminders ("You mentioned wanting to revisit the enterprise strategy — want to pick that up?")
- Approval notifications with inline approve/reject buttons

**Channel posts (if enabled by user):**
- Weekly performance summaries in #marketing or #sales channels
- Milestone celebrations: "We hit 50 qualified leads this month — 3 days ahead of target."
- Alert the team to significant changes: "Heads up: reply rates dropped 20% this week. I'm investigating and will update shortly."

**User controls for proactive messages:**
- Per-channel: the user sets whether the system can post proactively in each channel
- Frequency limits: maximum proactive posts per channel per day
- DM preferences: which notification types go to Slack DM vs email vs in-app only
- Quiet hours: no proactive messages during configured hours

### 3.5 Slack ↔ Chat Sync

Conversations with the system should feel continuous regardless of channel:

- A conversation started in Slack DM is visible in the Chat tab as a thread (tagged with "via Slack")
- A conversation started in Chat can be continued in Slack ("Send this to my Slack" action)
- Marcus maintains conversation context across both channels — if you discussed something in Slack, it's in context when you open Chat
- Thread IDs link Slack threads to Kinetiks threads in `kinetiks_marcus_threads.slack_thread_ts`

### 3.6 Inline Approval Buttons

For quick approvals, the system sends Slack messages with Block Kit interactive buttons:

```
Kit: I've drafted a follow-up email to Jane at Acme:

Subject: Following up on security requirements
Preview: "Hi Jane, wanted to circle back on the compliance points 
you raised. I've attached our SOC 2 report and..."

[✅ Approve]  [✏️ Edit in Kinetiks]  [❌ Reject]
```

- **Approve** → approves the action immediately, logs in Ledger
- **Edit in Kinetiks** → opens the approval in the Kinetiks app for detailed editing
- **Reject** → opens a modal asking for rejection reason

This only works for quick approvals. Review and strategic approvals always link to the Kinetiks app.

---

## 4. Calendar Integration

### 4.1 Setup

Calendar connects alongside email (same Google Workspace / Microsoft 365 OAuth):

**Additional scopes:**
- Google: `calendar.events`, `calendar.readonly`
- Microsoft: `Calendars.ReadWrite`

### 4.2 What Calendar Enables

**Meeting scheduling (outbound):**
- When Harvest books a meeting with a prospect, it creates a calendar event through the system's calendar
- The event is sent from the system's identity: "Kit has scheduled a meeting between you and [Prospect] on Thursday at 2pm"
- Meeting details include context: prospect background, relevant talking points from Cortex, recent interactions

**Meeting prep (intelligence):**
- Before meetings on the user's calendar that involve known prospects or contacts, the system generates a prep brief
- Delivered via email or Slack DM 30 minutes before the meeting
- Includes: prospect context from Harvest, company intel from Cortex, recent content they've engaged with from Dark Madder, suggested talking points

**Scheduling awareness:**
- Marcus knows what's on the calendar. "You have a meeting with Acme tomorrow" is context for conversations
- The system avoids scheduling conflicts when booking meetings
- Availability checking for the user when Harvest needs to propose meeting times

**Post-meeting follow-up:**
- If a calendar event has a conferencing link (Zoom, Google Meet) and meeting transcription is available, the system can process the transcript
- Extract action items, competitive intel, customer feedback
- Generate follow-up email draft
- Route extracted intelligence to relevant apps

### 4.3 Calendar Safeguards

- The system never deletes or modifies existing calendar events
- Meeting creation goes through the approval system (except when explicitly commanded: "Book a meeting with Jane for Thursday at 2pm")
- The user can revoke calendar access at any time without affecting other integrations
- No calendar data is stored permanently — only used for real-time context and scheduling

---

## 5. Unified Identity Across Channels

### 5.1 Name Consistency

When the user changes their system's name (in Cortex), it updates everywhere:

- Slack bot display name → updated via Slack API
- Email sender name → updated in email sending configuration
- Chat tab identity → immediate (just a database read)
- Calendar event organizer → updated for future events (existing events not modified)

### 5.2 Voice Consistency

Regardless of channel, the system speaks with the Marcus voice (stoic, clear, grounded, concise). But format adapts to channel:

- **Chat:** Full responses with rich content, charts, action cards. Can be detailed.
- **Slack:** Concise. Block Kit formatting. Summaries with "view more" links. In-thread.
- **Email:** Clean HTML. Brief structure with clear sections. Always has a CTA to engage deeper.
- **Calendar:** Professional event descriptions. Bullet-point meeting context. No personality — just useful information.

### 5.3 Channel Preference Learning

Over time, the system learns which channel the user prefers for different types of communication:

- If the user consistently reads Slack briefs but ignores email briefs → shift to Slack
- If the user engages with approvals in the desktop app but ignores Slack approval buttons → stop sending approval notifications to Slack
- If the user forwards emails to the system frequently → surface "Forward this to Kit" suggestions more prominently

This learning is passive (observed from behavior) and the user can override with explicit preferences at any time.

---

## 6. Security and Privacy

### 6.1 Data Handling

- **Email content:** Processed for intelligence extraction, then raw content is discarded. Only structured intelligence (proposals, action items, summaries) is stored.
- **Slack messages:** Same — processed for intelligence, raw messages not stored. Only the system's own messages and structured extractions are persisted.
- **Calendar events:** Read for context in real-time. No permanent storage of calendar data.
- **OAuth tokens:** Encrypted at rest in `kinetiks_system_identity.email_credentials` using `KINETIKS_ENCRYPTION_KEY`.
- **Token refresh:** Handled automatically. If a refresh fails, the system marks the connection as `error` and notifies the user.

### 6.2 Access Controls

- The user controls exactly which Slack channels the system joins
- The user controls which email types are sent and when
- The user controls calendar access scope
- All three integrations can be disconnected independently at any time
- Disconnecting does not affect the core Kinetiks app functionality — Chat, Analytics, Cortex, and Approvals all work without the communication layer

### 6.3 Team Context

In multi-user / team environments (future):
- Each team member can have their own notification preferences
- The system's Slack presence is shared (one bot user for the team)
- Email communication can be targeted: daily briefs to the marketing lead, deal alerts to the sales lead
- Calendar integration is per-user (each team member's calendar is independent)

---

## 7. Implementation Priority

This system is built in Phase 6. Dependencies:

**Requires (from earlier phases):**
- Phase 1: Settings modal (where email/Slack/calendar connections are configured)
- Phase 2: Approval system (inline Slack approval buttons, email approval notifications)
- Phase 3: Cortex with system identity data (`kinetiks_system_identity` table, system name)
- Phase 4: Marcus command routing (Slack mentions route through Marcus)
- Phase 5: Oracle / Analytics (data for briefs, alerts, and channel responses)

### 7.1 Build Order Within Phase 6

1. **Database and configuration:**
   - Ensure `kinetiks_system_identity` table migration is complete
   - Build connection configuration UI in Cortex > Integrations
   - Build notification preference UI in Settings modal

2. **Email — sending:**
   - Build `lib/email/send.ts` — send email as system identity via Gmail API / Microsoft Graph
   - Build email templates (daily brief, weekly digest, alerts, meeting prep)
   - Build `lib/email/connect.ts` — OAuth flow for Google Workspace / Microsoft 365
   - Wire Marcus brief generator to email delivery
   - Build email preference management

3. **Email — receiving:**
   - Build `lib/email/receive.ts` — poll inbox, process new messages
   - Build intelligence extraction pipeline for incoming emails
   - Build forwarded-thread detection and parsing
   - Wire extracted intelligence to Cortex Proposal pipeline
   - Wire action items to Marcus for Chat surfacing
   - Build CRON function for email polling (every 5 minutes)

4. **Slack — core:**
   - Build/update `lib/slack/bot.ts` — Slack Bolt initialization with system name
   - Build `lib/slack/events.ts` — message handlers (mentions, DMs, channel messages)
   - Build `lib/slack/blocks.ts` — Block Kit message builders for all message types
   - Build channel monitoring and intelligence extraction
   - Wire Slack mentions to Marcus command pipeline

5. **Slack — proactive:**
   - Build daily brief delivery via Slack DM
   - Build alert delivery via Slack DM
   - Build channel posting for milestone and summary messages
   - Build proactive message controls (per-channel settings, frequency limits, quiet hours)

6. **Slack — approvals:**
   - Build inline approval buttons (Block Kit interactive messages)
   - Build approval action handlers (approve/reject from Slack)
   - Wire to approval system

7. **Slack ↔ Chat sync:**
   - Build thread sync between Slack and web Chat
   - Ensure Marcus context continuity across channels

8. **Calendar:**
   - Build `lib/calendar/connect.ts` — OAuth with calendar scopes
   - Build `lib/calendar/events.ts` — create events, read schedule
   - Build meeting prep brief generation (triggered by upcoming calendar events)
   - Build scheduling awareness for Marcus (calendar context in conversations)
   - Wire Harvest meeting booking to calendar event creation

9. **Identity management:**
   - Build system name propagation (name change → update Slack, email, all references)
   - Build channel preference learning (observe engagement patterns)
   - Build graceful degradation when a channel is disconnected
