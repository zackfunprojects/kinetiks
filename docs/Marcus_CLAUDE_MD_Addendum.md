# Marcus Operator - CLAUDE.md Addendum

> **Instructions for Claude Code:** Read this addendum and update the live CLAUDE.md accordingly.
> This document defines Marcus, the third Cortex Operator. Integrate these additions into the
> existing CLAUDE.md structure - do not overwrite sections that have evolved during the build.
> Specifically: add Marcus to the agent architecture section, add the database tables, add the
> directory entries, add the build phase, update the tech stack, and add environment variables.

---

## 1. What to Add: Agent Architecture

Marcus is the third Cortex Operator, alongside Cartographer and Archivist. Update any reference
to "two Operators" to "three Operators." Update communication rule 3 to include Marcus alongside
Cartographer and Archivist.

Add the following to the Cortex Operators section:

### Marcus

**Role:** The conversational intelligence of the system. The agent users talk to, and the agent that talks to them. Third Cortex Operator.

**Persona: Marcus Aurelius.** Named for and modeled after the Stoic philosopher-emperor. Marcus speaks with calm authority - stoic, wise, guiding, flexible, patient, powerful. Never anxious. Never hype-driven. Never sycophantic. When things go wrong, Marcus is the steady hand. When things go right, Marcus acknowledges it without excess. He gives you the truth, grounded in data, delivered with the confidence of someone who has earned your trust.

**Voice principles:**
- **Stoic clarity.** State the situation plainly. No spin, no softening, no performative optimism. "Your reply rates dropped 15%. Here is why. Here is what to do."
- **Grounded in evidence.** Every recommendation references specific data. Never speculate without flagging it.
- **Brevity with depth available.** Lead with the conclusion. Expand only if asked. Morning brief is 5-8 sentences.
- **Patient, never pushy.** "Consider reverting to the security angle" - not "You need to change this immediately." The user decides.
- **Quietly powerful.** Never announces capabilities. Just demonstrates them.
- **Direct, not cold.** Stoic is not robotic. Acknowledges difficulty. Celebrates significant wins. Cares without panicking.
- **Concise.** Bias toward fewer words. Brevity is respect for the user's time.
- **No em dashes.** Regular dashes only.

**Never does:** filler phrases ("Great question!"), hedging when data exists, over-explaining its own process, exclamation marks (except genuine wins), generic advice, sycophancy.

**Always does:** references specific data, thinks in systems (cross-app implications), connects dots across time (prior conversations), tells the user what intelligence was extracted, states what data would help when it lacks confidence.

**Five jobs:**
1. **Strategic advisor** - synthesizes cross-app data for specific, data-grounded direction
2. **Cross-app orchestrator** - coordinates actions across apps for campaigns, launches, pivots
3. **Proactive communicator** - daily briefs (Slack primary), weekly digests, monthly reviews, real-time alerts
4. **Context enrichment** - extracts intelligence from natural conversation, submits Proposals to Cortex automatically
5. **Support/guidance** - knows Kinetiks docs, answers product questions, guides users

**Surfaces:**
- Full chat at id.kinetiks.ai/marcus (persistent, searchable threads)
- Quick-chat via floating pill ("Ask Marcus" button) in every app
- Slack bot (two-way: briefs/alerts out, conversations in. DMs, @mentions, thread replies)
- Email (outbound only: scheduled briefs with "Reply in Slack" links)

**Slack is day-1 core infrastructure, not an optional add-on.** The Slack bot IS Marcus. Two-way - replies in Slack are processed identically to web chat. Slack Bolt framework. Block Kit for rich messages. Inline approve/dismiss buttons for escalated Proposals.

**Conversation engine pipeline:** Intent classification -> context assembly (token-budgeted per intent type) -> conversation history (semantic search + recent) -> response generation (Claude Sonnet) -> action extraction (Claude Haiku, separate call) -> execute actions + deliver response.

**Action extraction:** Every conversation turn analyzed for: Proposals (to Cortex), briefs (to app Synapses), follow-ups (scheduled), context updates (converted to Proposals). Marcus always tells the user what it extracted.

**Runs:** Always available for conversation. Scheduled CRONs for daily/weekly/monthly communications. Event-triggered for real-time alerts.

---

## 2. What to Add: Tech Stack

Add to the tech stack section:
- **Slack:** Slack Bolt for JavaScript (Marcus bot - day 1 core, not optional)

---

## 3. What to Add: Environment Variables

Add to the environment variables section:

```
# Slack (Marcus bot - day 1 core)
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=                  # for Socket Mode during dev
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
```

---

## 4. What to Add: Database Tables

Add these tables to the database schema section. All use the kinetiks_ prefix since Marcus is a Cortex Operator, not an app.

```sql
-- Marcus conversation threads
kinetiks_marcus_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  title text,                              -- auto-generated summary
  channel text DEFAULT 'web',              -- 'web', 'slack', 'pill'
  slack_thread_ts text,                    -- Slack thread timestamp for sync
  pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- Marcus messages
kinetiks_marcus_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES kinetiks_marcus_threads NOT NULL,
  role text NOT NULL,                      -- 'user', 'marcus'
  content text NOT NULL,
  channel text DEFAULT 'web',              -- where this message was sent/received
  extracted_actions jsonb,                 -- proposals, briefs, follow-ups generated
  context_used jsonb,                      -- what data Marcus referenced (debugging)
  created_at timestamptz DEFAULT now()
)

-- Marcus scheduled communications
kinetiks_marcus_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  type text NOT NULL,                      -- 'daily_brief', 'weekly_digest', 'monthly_review'
  channel text DEFAULT 'slack',            -- 'slack', 'email', 'both'
  schedule text NOT NULL,                  -- cron expression
  timezone text DEFAULT 'America/New_York',
  enabled boolean DEFAULT true,
  last_sent_at timestamptz,
  next_send_at timestamptz,
  config jsonb DEFAULT '{}',               -- user preferences for content/format
  created_at timestamptz DEFAULT now()
)

-- Marcus alerts (proactive notifications)
kinetiks_marcus_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  trigger_type text NOT NULL,              -- 'kpi_shift', 'crisis', 'deal_outcome', 'anomaly', 'gap'
  severity text DEFAULT 'info',            -- 'info', 'warning', 'urgent'
  title text NOT NULL,
  body text NOT NULL,
  source_app text,
  read boolean DEFAULT false,
  delivered_via text[] DEFAULT '{}',       -- ['slack', 'email', 'in_app']
  created_at timestamptz DEFAULT now()
)

-- Marcus follow-ups (self-scheduled reminders)
kinetiks_marcus_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  thread_id uuid REFERENCES kinetiks_marcus_threads,
  message text NOT NULL,                   -- what Marcus will say/ask
  scheduled_for timestamptz NOT NULL,
  delivered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
)
```

RLS: all tables policy on account_id matching auth.uid(). Service role for CRON Edge Functions (brief generation, follow-up delivery).

---

## 5. What to Add: Directory Structure

Add these pages to the app router:

```
(dashboard)/
  marcus/
    page.tsx                # Marcus chat - full conversational UI with thread sidebar
    schedules/page.tsx      # Configure daily brief, weekly digest, monthly review
```

Add these API routes:

```
api/
  marcus/
    chat/route.ts           # Conversation endpoint (streaming)
    extract/route.ts        # Action extraction pipeline
    brief/route.ts          # Generate scheduled brief on-demand
    slack/events/route.ts   # Slack event webhook (messages, mentions)
    slack/interact/route.ts # Slack interactivity (button clicks)
```

Add these lib files:

```
lib/
  marcus/
    engine.ts               # Core conversation pipeline (intent -> context -> generate -> extract)
    intent.ts               # Intent classifier (strategic, tactical, support, data, implicit intel)
    context-assembly.ts     # Token-budgeted context loading per intent type
    action-extractor.ts     # Post-response Haiku call for Proposals, briefs, follow-ups
    brief-generator.ts      # Daily/weekly/monthly brief content generation
    scheduler.ts            # CRON management for scheduled communications
    thread-manager.ts       # Thread CRUD, titling, search
  slack/
    bot.ts                  # Slack Bolt app initialization
    events.ts               # Event handlers (message.im, app_mention)
    blocks.ts               # Block Kit message builders
    sync.ts                 # Thread sync between Slack and web
  ai/
    prompts/
      marcus-core.ts        # Marcus persona + rules (see marcus-core-prompt.md in docs/)
      marcus-extract.ts     # Action extraction prompt
      marcus-brief.ts       # Brief generation prompts (daily, weekly, monthly)
```

Add these Supabase Edge Functions:

```
supabase/functions/
  marcus-daily/index.ts     # CRON: daily morning brief generation + delivery
  marcus-weekly/index.ts    # CRON: weekly digest generation
  marcus-monthly/index.ts   # CRON: monthly review generation
  marcus-followup/index.ts  # CRON: check + deliver scheduled follow-ups (5min interval)
```

---

## 6. What to Add: Build Phase

Add Phase 1b after Phase 1 (Cortex Agent). Marcus builds as a patch immediately after the Cortex is functional. It depends on the Cortex for Proposal submission but does NOT depend on Cartographer, Archivist, Dashboard, or Floating Pill.

### Phase 1b: Marcus Operator (8 days)

| Day | Task | Delivers |
|-----|------|----------|
| 1 | Database + Slack OAuth | Marcus tables (threads, messages, schedules, alerts, follow-ups). Slack app creation. OAuth flow for workspace connection. Store credentials in kinetiks_connections. |
| 2 | Conversation engine | Intent classification. Context assembly with token budgeting. Response generation via Claude API. Thread management (create, continue, auto-title). Message persistence. |
| 3 | Action extraction | Post-response extraction pipeline (Haiku call). Proposal generation from conversation. Brief queuing to Synapses. Follow-up scheduling. User confirmation of extracted actions. |
| 4 | Slack bot | Slack Bolt integration. Handle DMs, @mentions, thread replies. Rich Block Kit formatting. Inline approve/dismiss buttons for escalated Proposals. Two-way thread sync with web. |
| 5 | Scheduled comms | CRON Edge Functions for daily brief, weekly digest, monthly review. Brief generation pipeline (assemble cross-app data, generate narrative, format for Slack/email). Schedule management API. Resend for email. |
| 6 | Web chat UI | id.kinetiks.ai/marcus page. Thread list sidebar. Chat interface. Search across threads. Schedule configuration panel. Alert history. |
| 7 | Docs knowledge base | Load Kinetiks documentation into searchable format. Marcus can answer product questions accurately. Test against 20 common support questions. |
| 8 | Integration test | Full test: strategic question (data-grounded answer), share business news (actions extracted + Proposals submitted), receive morning brief in Slack, reply in Slack (conversation continues), check web UI (thread synced). Alert triggered by simulated KPI shift. |

Marcus provides value from day 1 even with minimal Context Structure - it can enrich the ID through conversation, send briefs on Cortex activity, and answer support questions. As other phases come online, Marcus automatically gets richer context.

---

## 7. What to Add: Related Documents

Add to the related documents list:
- **Marcus Operator Spec** - conversational intelligence, Aurelius persona, Slack integration, scheduled comms, action extraction, Phase 1b build plan
- **marcus-core-prompt.md** - the actual system prompt file for the codebase (static persona + dynamic injection points)

---

## 8. Reference: Companion Documents

These files should be placed in the docs/ folder of the monorepo:
- `docs/Marcus_Operator_Spec.docx` - full specification
- `docs/marcus-core-prompt.md` - system prompt (goes into lib/ai/prompts/marcus-core.ts at build time)
