# Kinetiks Product Spec v3

> **This is the definitive product specification for Kinetiks - the GTM operating system.**
> Everything in this document supersedes prior specs (v1, v2, Terminal spec).
> This document defines what Kinetiks is, how it works, and what we build.

---

## 1. What Kinetiks Is

Kinetiks is a GTM operating system. It is a desktop application with a suite of specialized marketing and sales apps that share a unified business identity, a coordinated agent system, and a single command interface.

The user signs up, names their GTM system, connects it to their email and Slack, and walks away with a digital GTM team member that knows their business, operates across every marketing and sales function, learns from every interaction, and runs mostly autonomously - surfacing only the decisions that require human judgment.

The core product is the Kinetiks desktop app. This is where the user manages their entire GTM operation through natural language conversation, approves agent work, tracks cross-app performance, and defines who their business is and what it's optimizing toward.

The suite apps (Harvest, Dark Madder, Hypothesis, Litmus, and future apps) are specialized tools for specific GTM functions: outbound, content, landing pages, PR, and more. Each app can be used independently or as part of the Kinetiks suite. When connected to Kinetiks, they share the business identity, coordinate through the agent system, and report into the unified analytics layer.

**What makes Kinetiks different from any individual GTM tool:**

- **Shared identity.** One business profile powers every app and integration. Voice, positioning, ICP, competitive intel - defined once, used everywhere, always improving.
- **Coordinated agents.** Agents across apps don't operate in silos. A learning from Harvest outreach feeds into Dark Madder content strategy. A competitive shift detected by the system adjusts messaging across all channels simultaneously.
- **One place to run it all.** The user doesn't need to open five apps to understand their GTM. They open Kinetiks, see the whole picture, and steer with natural language. This includes both Kinetiks suite apps and every external tool in their stack — Meta Ads, HubSpot, Framer, Stripe, all of it.
- **Approval-driven autonomy.** Agents do real work - drafting emails, publishing content, building sequences, managing ad campaigns. Humans approve what matters. The system earns more autonomy over time as it proves it understands the business.
- **Compounding intelligence.** Every action across every app and integration feeds back into the identity layer. The system gets measurably smarter about the business with every email sent, every post published, every deal closed, every ad dollar spent.
- **Universal GTM control plane.** Kinetiks doesn't replace the user's existing tools - it orchestrates them. Connect HubSpot, Meta Ads, Framer, Mailchimp, and the system can read from and write to all of them through one conversational interface. Kinetiks apps provide the deepest integration; external tools provide breadth.

---

## 2. The System Identity

When a user creates a Kinetiks account, they go through two identity steps:

**Step 1: Kinetiks ID assignment.** The system generates a unique codename in the format `{adjective}-{animal}` (e.g., copper-fox, bright-otter). This is the internal account identifier used across the platform. It is permanent, unique, and used in technical contexts (API keys, logs, internal references).

**Step 2: Name your system.** The user gives their GTM system a name. This is freeform text - "Kit," "Archer," "Vanguard," "Nova," their company name plus something, whatever they choose. This name becomes:

- The name that talks to them in the Chat interface
- The name that appears in their company Slack as a team member
- The sender name on the system's email address
- The identity referenced in approvals ("Kit drafted a follow-up sequence for your review")
- The name in any notification, brief, or scheduled communication

The system name can be changed at any time from the Cortex tab. When changed, it updates everywhere - Slack display name, email sender name, chat identity, all references.

**The relationship between the system name and Marcus:** Marcus is the underlying intelligence engine - the conversation pipeline, intent classification, context assembly, action extraction, persona rules. The user never sees the name "Marcus." They interact with whatever they named their system. Marcus defines HOW the system thinks and communicates. The system name defines WHO is communicating.

**System voice:** The system speaks with the Marcus voice - stoic, clear, grounded, concise, direct, never sycophantic, never anxious. This voice is consistent regardless of the user's brand voice. The brand voice (stored in the Context Structure) is used when the system generates outward-facing content on behalf of the business (emails, blog posts, social posts). The system's own communication with the user uses the Marcus voice. This separation is critical - the user needs to trust the system's internal communication as reliable and consistent, even while the system produces externally-facing content that matches the business brand.

---

## 3. Product Model: Apps-First, Kinetiks as the Upgrade

This is the most important architectural decision in the product. The apps are standalone products. Kinetiks is the orchestration layer you opt into.

### 3.1 The Two Entry Paths

**Path A: App-first (most users).** The user discovers Dark Madder, Harvest, or any suite app through its own marketing site. They sign up for that app directly. They go through that app's version of the Kinetiks ID onboarding (which builds a Context Structure behind the scenes, but framed entirely for that app). They land in the app and start using it. They never hear the word "Kinetiks" during this process. They have a great standalone product.

**Path B: Kinetiks-first (power users).** The user discovers Kinetiks as a GTM operating system. They sign up at kinetiks.ai. They go through the full Kinetiks onboarding — name their system, connect email, connect Slack, build their Context Structure, download the desktop app, activate their first app(s). They get the full orchestration experience from day one.

Both paths create a Kinetiks ID and build a Context Structure. The difference is framing and what the user sees.

### 3.2 Standalone App Experience (Path A)

When a user signs up for Dark Madder from darkmadder.com:

1. Redirected to `id.kinetiks.ai/signup?from=dark_madder`
2. Brief education screen: "Dark Madder is powered by a business intelligence layer. We're going to spend 15 minutes learning your business so everything we create sounds like you."
3. Account creation (email + password or OAuth)
4. Kinetiks ID assigned (codename generated) — the user may or may not see this prominently
5. Cartographer onboarding begins, framed for content: "Let's learn your voice"
6. After onboarding: redirect straight to `dm.kinetiks.ai` — the user is in Dark Madder, ready to work
7. No system naming, no email connection, no Slack connection, no desktop app download

The user now has:
- A working Dark Madder account with a fully populated Context Structure
- A Kinetiks ID they may not even be aware of yet
- A standalone app that delivers full value on its own

**What the standalone user does NOT have:**
- A named GTM system
- Cross-app intelligence
- The Kinetiks Chat / command interface
- Unified analytics
- The approval system (standalone apps handle their own approval flows internally)
- Agent communication layer (email, Slack identity)
- The desktop app

### 3.3 The Upgrade Path (App-First → Kinetiks)

Over time, the standalone app user is introduced to Kinetiks:

- In-app prompts via the floating pill: "Your content would be smarter if it knew what your outreach was learning. Connect to Kinetiks."
- Nurture emails: "You're using Dark Madder standalone. Here's what changes when you connect to the full GTM system."
- Natural discovery: user sees the Kinetiks branding in the pill, the footer, the billing page

When the user decides to upgrade:

1. They click through to the Kinetiks setup flow
2. **Name your system** — their GTM agent gets a name
3. **Connect email** — assign a real email address from their domain
4. **Connect Slack** — add the system to their workspace
5. **Download the desktop app**
6. **Their existing Context Structure carries over** — no re-onboarding. Everything they built in Dark Madder's onboarding is already in Cortex.
7. The floating pill in Dark Madder now shows their system name, cross-app intelligence, and the full expanded panel
8. They can activate additional apps from the Cortex tab

The upgrade is seamless because the Kinetiks ID was already created during app signup. The user is just unlocking the orchestration layer on top of it.

### 3.4 Full Kinetiks Setup (Path B)

When a user signs up at kinetiks.ai directly:

**Step 1: Account creation.** Email + password or OAuth. Kinetiks ID assigned.

**Step 2: Name your system.** Full-screen step:

> "Name your GTM system. This is who you'll talk to, who will show up in your Slack, and who will send emails on your behalf."

Freeform text input. The UI shows a live preview of how the name will appear:

- Chat: "[Name] Good morning. I've reviewed your pipeline and have three recommendations."
- Slack: "[Name] posted in #marketing: Reply rates on the fintech sequence are up 12% this week."
- Email: "From: [Name] <[name]@company.com>"

No suggestions, no dropdown, no constraints beyond basic character limits.

**Step 3: Connect email.** Connect Google Workspace or Microsoft 365. Assign an email address to the system:

- `kit@acme.com`
- `growth@acme.com`
- `marketing@acme.com`

This is NOT the outbound email system. Harvest manages its own multi-domain cold outreach infrastructure. The Kinetiks email is the system's internal identity within the company — for receiving forwarded emails, sending briefs, appearing in the company directory, and being CC'd on threads.

**Step 4: Connect Slack.** Add the system to the Slack workspace. Choose which channels it joins. Default behavior: listens and extracts intelligence, responds when mentioned, sends proactive briefs via DM.

**Step 5: Cartographer onboarding.** Website crawl, adaptive conversation, voice calibration, writing samples. Builds the Context Structure. Framed as: "Let's build your business identity so [system name] can get to work."

**Step 6: Download the desktop app.** Electron application (macOS, Windows, Linux):

- System tray presence (always running)
- Native notifications for approvals, alerts, briefs
- Keyboard shortcuts
- Offline indicator with reconnection
- Auto-updates

The web app at kinetiks.ai remains fully functional. Desktop app is the recommended primary experience.

**Step 7: Activate first app(s).** The system recommends which apps to activate based on what it learned during onboarding. User activates one or more.

**Step 8: First landing.** The user lands in the Chat tab. Their named system greets them with a substantive, specific greeting referencing what it learned during onboarding, what's active, and what it plans to do first.

### 3.5 The Kinetiks ID is Universal

Regardless of entry path, every user has a Kinetiks ID and a Context Structure. This is what makes the upgrade seamless and what makes the app integration pattern possible.

- Sign up for Dark Madder → you have a Kinetiks ID
- Sign up for Harvest → you have a Kinetiks ID
- Sign up for Kinetiks directly → you have a Kinetiks ID

The ID is the foundation. The apps use it to power their intelligence. Kinetiks orchestrates across it. The user chooses how deep they go.

---

## 4. The Desktop Application

### 4.1 Application Architecture

The Kinetiks desktop app is an Electron application wrapping a Next.js web application. The architecture:

- **Electron shell:** Native window management, system tray, notifications, keyboard shortcuts, auto-update, deep links
- **Web core:** Next.js application (same codebase as kinetiks.ai web app) rendered in Electron's webview
- **Shared codebase:** One codebase serves both the Electron app and the web app. Environment detection determines which platform-specific features are available

The web app at kinetiks.ai is the fallback and the API layer. The Electron app is the recommended primary experience.

### 4.2 Layout

The layout mirrors Claude desktop:

**Top bar:** Three tabs — **Chat** | **Analytics** | **Cortex**. Plus a settings/profile avatar on the right side of the top bar.

**Left sidebar (Chat tab):** Toggles between two panels:
- **Chat History** — Thread list, searchable, with recent conversations. New chat button. Identical in concept to Claude desktop's chat list.
- **Approvals** — Pending approval queue. Toggled via a button/tab at the top of the sidebar, like Claude desktop's Projects toggle.

**Main area (Chat tab):** The conversation interface. Message input at the bottom. Streaming responses. Markdown rendering. Rich content (tables, code blocks, action cards).

**Analytics tab:** Full-width analytics dashboard. No sidebar. Cross-app KPI scoreboard, goal tracking, trend visualization.

**Cortex tab:** Internal sub-navigation on the left side. Sections: Identity, Goals, Integrations, Ledger. Main area shows the selected section.

**Settings modal:** Triggered by the profile/avatar icon in the top bar. Opens as a modal overlay on top of whatever tab is active. Contains: Account, Organization, Billing, API Keys, Notifications, Team/Seats, Danger Zone.

### 4.3 Visual Design

The design language follows the established Kinetiks brand:

- **Primary color:** #6C5CE7 (Kinetiks purple)
- **Secondary:** #00CEC9 (teal)
- **Background:** #FAFAFA (light), #0F0F1A (dark)
- **Typography:** Distinctive modern typefaces (Satoshi, Cabinet Grotesk, General Sans class). NOT Inter, NOT system fonts for headings.
- **Design tier:** Linear, Vercel, Raycast quality. Clean, confident, modern.
- **Dark mode:** Supported from day one, user-togglable. System preference detection.
- **Motion:** Subtle, purposeful. Micro-interactions on state changes (approval accepted, score update). No decorative animation.

---

## 5. Chat Tab (Primary Experience)

The Chat tab is the core of the product. This is where the user runs their GTM operation.

### 5.1 The Conversation Interface

The main area is a conversation with the user's named system. The interface supports:

- **Streaming text responses** with markdown rendering
- **Rich content blocks** — tables, charts, code, data summaries embedded in conversation
- **Action cards** — structured blocks for specific outcomes (e.g., "Here's the sequence I built" with a preview and "View in Harvest" link)
- **File attachments** — user can share documents, images, data files for the system to process
- **Slash commands / shortcuts** — power-user shortcuts for common actions (optional, not required)

### 5.2 What the User Can Do in Chat

The Chat is both a reporting surface and a command interface. Users can:

**Ask questions:**
- "How's our outbound performing this week?"
- "What's our best-performing content topic?"
- "Show me pipeline by stage."
- "Who are our top prospects right now?"

**Give directives:**
- "Build a 3-touch sequence targeting fintech CFOs about our new pricing."
- "Pause all outbound to healthcare until the compliance doc is updated."
- "Draft a blog post about [topic] - here's my rough outline."
- "Change our messaging angle from cost savings to risk reduction."

**Have strategic conversations:**
- "I'm thinking about expanding into the enterprise segment. What would that look like?"
- "Our reply rates dropped last week. Why, and what should we change?"
- "We just launched a new product. How should we update our GTM?"

**Review and approve:**
- The system presents work for review directly in chat
- Quick approvals can happen inline ("Looks good, send it")
- Complex approvals link to the Approvals panel or out to the relevant app

### 5.3 Proactive Communication

The system doesn't wait to be asked. When the user opens the app, the system has new information:

- **Daily brief.** A concise summary of what happened since the user last checked in. Key metrics, notable events, items needing attention. Posted as a new message in the active thread or as a new thread.
- **Alerts.** Significant events surface proactively: "Reply rates on the fintech sequence dropped 40% today - I've paused it and have a revised approach ready for your review."
- **Recommendations.** Unprompted strategic suggestions based on data patterns: "I've noticed the security angle consistently outperforms the cost angle in outreach. I'd recommend shifting the Dark Madder content calendar to lean into security topics."
- **Follow-ups.** The system tracks open threads and follows up: "Last week you mentioned wanting to target VP Engineering roles. I've built a prospect list - want to review it?"

### 5.4 Cross-App and External Tool Command Routing

When the user issues a directive in Chat, the system determines which apps and external tools are involved and routes the command through the appropriate layer:

1. **Intent parsing** — What does the user want to accomplish?
2. **Target routing** — Which Kinetiks apps and/or external integrations need to act? A single directive might touch multiple targets across both tiers.
3. **Command translation** — Convert the natural language intent into specific actions. For Kinetiks apps: commands through the Synapse. For external tools: API calls through the connector.
4. **Execution** — Agents and connectors do the work.
5. **Response aggregation** — Collect results from all involved targets and present a unified response.
6. **Approval routing** — If any resulting work needs approval, route it to the Approvals queue.

Example multi-target command: "We're launching the new pricing page next week. I need a blog post explaining the changes, an outbound sequence to existing prospects highlighting the new tiers, a PR pitch to relevant journalists, and pause the current Meta campaigns until the new landing page is live."

This touches Dark Madder (blog), Harvest (outbound), Litmus (PR), and Meta Ads (external - pause campaigns). The system coordinates all four, presents a plan, and queues the outputs for approval.

Example external-only command: "What's our Meta ad spend this month and how does ROAS compare to last month?"

This queries the Meta Ads connector, pulls spend and ROAS data, and presents it inline in Chat.

Example cross-tier command: "Add everyone who replied to last week's Harvest sequence to the HubSpot nurture workflow."

This reads from Harvest (Kinetiks app) and writes to HubSpot (external tool), coordinating across both integration tiers in a single action.

### 5.5 Thread Management

Conversations are organized in threads, listed in the left sidebar:

- **New chat** creates a new thread
- Threads auto-title based on content (like Claude desktop)
- Threads are searchable
- Threads persist indefinitely
- The system maintains context within a thread and can reference prior threads when relevant

---

## 6. Approvals Panel

The Approvals panel lives in the Chat tab's left sidebar, toggled alongside Chat History (like Claude desktop's Projects toggle).

### 6.1 Why Approvals Are Central

Approvals are what make the agent system real. Without them, the Chat is just a chatbot. With approvals, there is a persistent queue of "the agents did work, here's what they need from you." This creates the behavior loop: the user comes back and there's stuff waiting. The system is operating on their behalf between sessions.

### 6.2 Approval Types

Every approval is classified into one of three types:

**Quick approval** — A yes/no decision that takes seconds. The full context is visible in the approval card. Examples: approve a follow-up email, confirm a scheduling change, greenlight a social post.

- Displayed as a compact card in the Approvals panel
- Shows: what it is, which app generated it, preview of the content, approve/reject buttons
- Reject requires a brief reason (free text) - this feeds back into the learning system
- Can be approved/rejected without leaving the panel

**Review approval** — Requires reading or examining the work product. Still doable inline but needs more attention. Examples: review a drafted blog post, examine a prospect list, check a sequence before it goes live.

- Displayed as an expanded card with full content preview
- Inline editing where possible (fix a line in an email, adjust a subject line)
- "View in [App]" link for full editing capabilities
- Any edits made before approval are captured as training signals

**Strategic approval** — A decision that affects direction, not just a single output. Examples: change targeting criteria, shift messaging angle, adjust campaign budget allocation, modify outreach cadence.

- Displayed as a detailed card with context, reasoning, and impact analysis
- The system explains why it's recommending this change and what the expected impact is
- May link to a chat thread for further discussion before deciding
- Higher bar for auto-approval (see confidence-based autonomy below)

### 6.3 The Approval Card

Every approval card contains:

- **Source app** — Which app generated this (Harvest, Dark Madder, etc.)
- **Type indicator** — Quick / Review / Strategic
- **Title** — What this is ("Follow-up email to Jane at Acme Corp")
- **Preview** — Enough context to make a decision. For content: the full text. For a sequence: the steps and targets. For a strategic change: the reasoning.
- **Timestamp** — When the agent generated this
- **Approve button** — Green, prominent
- **Reject button** — With required reason field
- **"View in [App]" link** — Opens the relevant app for detailed editing (review and strategic types)
- **Edit inline** — Where applicable, the card supports direct editing before approval

### 6.4 Approval Queue Behavior

- Approvals are sorted by type: strategic first, then review, then quick. Within each type, sorted by recency.
- Badge count on the Approvals toggle shows the number of pending items.
- When a new approval arrives, the system notifies the user (desktop notification if the app is backgrounded, badge update if foregrounded).
- Approvals have optional expiration — if not acted on within a configurable window, the system can either remind, re-queue, or auto-expire with a note.
- Batch actions: "Approve all quick approvals" for users who trust the system's quick decisions.

### 6.5 Confidence-Based Autonomy

Not everything needs approval. The system earns the right to act independently based on confidence scoring:

**How confidence works for approvals:**

Each action type has a confidence threshold. When the system's confidence in its decision exceeds the threshold, it acts without asking. When it's below the threshold, it queues for approval.

Confidence is calculated from:
- **Cortex confidence** — How well the system knows the business (the existing per-layer scoring)
- **Action history** — Has this type of action been approved consistently in the past? What's the approval rate?
- **Edit rate** — When the user approves, do they edit first? High edit rates indicate the system isn't quite there yet.
- **Rejection signals** — Recent rejections in this category dramatically lower confidence.
- **Specificity** — A follow-up email to an existing conversation is higher confidence than a cold outreach to a new segment.

**Day-one default:** Everything requires approval. Zero auto-autonomy. The system has not earned trust yet.

**Over time:** As the user approves things without edits, confidence rises. The system starts auto-sending follow-up emails, auto-publishing social posts, auto-adjusting minor campaign parameters. The user sees fewer approvals because the system is handling the routine decisions correctly.

**Trust contraction:** If the system makes a mistake (user flags a sent email as wrong, a published post gets pulled, a sequence gets poor results), confidence drops for that action category and the approval threshold tightens. More things come back to the queue. The system says: "I got that wrong. I'll ask you about ones like that from now until I've re-calibrated."

**User controls:** The user can override confidence thresholds. "Never auto-send outbound emails" or "Auto-approve all social posts" — explicit rules that bypass the confidence calculation.

### 6.6 Learning From Approvals

Every approval interaction is a training signal:

- **Approved without changes** — Positive signal. The system got it right. Confidence increases.
- **Approved with edits** — Partial signal. The system was close but not perfect. The diff between original and edited version is captured and analyzed. What did the user change? Tone? Specificity? Targeting? This feeds back into Cortex as a Proposal.
- **Rejected with reason** — Negative signal. The reason text is analyzed and routed as intelligence. "Too aggressive" adjusts voice parameters. "Wrong audience" adjusts targeting. "Not relevant right now" adjusts timing models.
- **Ignored/expired** — Weak negative signal. The system queued something the user didn't care about. Reduce similar approvals.

This learning loop is how the system calibrates over time. The approval queue shrinks not because features are removed, but because the system gets better at its job.

### 6.7 Brand and Quality Gates

Before any work product reaches the approval queue, it passes through quality gates:

**Brand consistency check:** Every piece of outward-facing content is validated against the voice and messaging parameters in Cortex. Tone sliders, vocabulary preferences, messaging patterns, calibration data — all checked. If it doesn't match, the agent must revise before the approval is created. The user should never see off-brand work in their queue.

**Best practices check:** Each app enforces domain-specific standards. Harvest checks outreach against email deliverability best practices, cadence norms, CAN-SPAM compliance. Dark Madder checks content against SEO standards, readability, factual accuracy. Litmus checks pitches against PR norms and journalist preferences. Violations are caught before the approval is generated.

**The user sees quality-filtered work.** The system's internal revision cycles are invisible. The approval queue only shows work that has already passed brand and quality checks.

---

## 7. Analytics Tab

The Analytics tab is the GTM scoreboard. It shows how the entire system is performing, oriented around the user's goals.

### 7.1 Goals as the Organizing Principle

Analytics aren't organized by app. They're organized by goal.

The user defines goals in the Cortex tab (see Section 8). Examples:

- "Generate 50 qualified leads per month" (maps to Harvest + HubSpot)
- "Publish 4 blog posts per month" (maps to Dark Madder + WordPress/Framer)
- "100k website visits per quarter" (maps to GA4 + Dark Madder + Hypothesis)
- "Land 3 media placements per quarter" (maps to Litmus)
- "Close $200k in new revenue this quarter" (maps to Harvest + HubSpot/Salesforce + Stripe)
- "Maintain $5k/month Meta ad spend at 3x ROAS" (maps to Meta Ads + GA4)

Goals can map to any combination of Kinetiks apps and external integrations. The system doesn't care where the data comes from — it aggregates everything into a unified view.

The Analytics tab shows progress toward each goal, which sources are contributing, and what the trends look like.

### 7.2 Dashboard Structure

**Top level:** Overall GTM health score or summary. Are you on track, behind, or ahead across your goals? This is the one-glance answer.

**Goal cards:** Each goal gets a card showing:
- Progress toward target (metric + visual)
- Trend (improving, declining, stable)
- Which apps are contributing
- Key drivers (what's working, what isn't)
- System recommendations for improving performance

**Cross-app metrics:** Unified views that span multiple apps:
- Full-funnel visualization (awareness → engagement → pipeline → revenue)
- Channel performance comparison (which channels are driving results)
- Content-to-pipeline attribution (which content is generating leads)
- Outreach effectiveness (response rates, meeting rates, conversion rates)

**Time controls:** Date range selection, comparison periods, trend views (daily, weekly, monthly, quarterly).

### 7.3 How Data Flows In

Data flows into Analytics from two sources:

**Kinetiks suite apps** report metrics through their Synapse. Each Synapse defines which metrics the app reports:

- **Harvest:** Emails sent, reply rates, meeting rates, pipeline value, deals by stage, prospect counts, sequence performance
- **Dark Madder:** Posts published, traffic, engagement, SEO rankings, content performance by topic
- **Hypothesis:** Landing page visits, conversion rates, A/B test results, page performance
- **Litmus:** Pitches sent, media placements, journalist engagement, coverage quality, share of voice

**External integrations** report metrics through their connectors at configured sync intervals:

- **Meta Ads:** Ad spend, impressions, clicks, conversions, ROAS, audience performance
- **Google Ads:** Campaign spend, keyword performance, conversion data, quality scores
- **HubSpot/Salesforce:** Pipeline value, deal velocity, lead source attribution, activity metrics
- **GA4:** Traffic, sessions, bounce rates, conversion funnels, audience demographics
- **GSC:** Search impressions, clicks, CTR, average position, keyword rankings
- **Stripe:** Revenue, MRR, churn, subscription metrics, LTV
- **Framer/Webflow/WordPress:** Page views, form submissions, CMS metrics
- **Mailchimp/ConvertKit:** Open rates, click rates, subscriber growth, campaign performance
- **LinkedIn/Twitter:** Post engagement, follower growth, audience insights

The analytics engine aggregates all sources into cross-app views and maps them to user-defined goals. From the user's perspective, there is no distinction between data from a Kinetiks app and data from an external tool — it's all their GTM performance.

**The Oracle powers all of this.** The Oracle (fourth Cortex Operator — see Section 10.7) is the agent that pulls metrics, aggregates data, detects patterns, generates insights, and feeds learnings back into Cortex. The Analytics tab is the Oracle's primary output surface. When Marcus answers analytics questions in Chat, it's the Oracle providing the data and interpretation behind the response.

### 7.4 Analytics and the Chat

The Analytics tab is for structured exploration. But quick analytics questions are answered in Chat:

- "How are we doing on the lead gen goal?" — answered inline with data
- "Show me reply rates over the last 30 days" — renders a chart in the conversation
- "Which content topics are driving the most pipeline?" — data table in chat

The Chat surface can render any analytics data inline. The Analytics tab is for when the user wants to browse, explore, and drill down without a specific question.

---

## 8. Cortex Tab

The Cortex tab is the brain of the system. It holds everything that defines who the business is and what it's optimizing toward.

### 8.1 Internal Sub-Navigation

The Cortex tab has its own left-side navigation with five sections:

**Identity** — The 8-layer Context Structure. Who is this business?
**Goals** — What is the system optimizing toward?
**Integrations** — Kinetiks apps, external tools, data sources, and system connections (email, Slack, calendar)
**Ledger** — The full audit trail of everything the system has learned and done

### 8.2 Identity (Context Structure)

The existing 8-layer Context Structure, viewable and editable:

1. **Org** — Company fundamentals (name, industry, stage, team size, etc.)
2. **Products** — Products/services, pricing, features, differentiators
3. **Voice** — Tone, vocabulary, messaging patterns, writing samples, calibration data
4. **Customers** — Personas, demographics, pain points, buying triggers
5. **Narrative** — Origin story, founder thesis, brand arc, validated angles
6. **Competitive** — Competitors, positioning gaps, differentiation vectors
7. **Market** — Trends, sentiment, seasonal patterns, regulatory signals
8. **Brand** — Visual identity (colors, typography, tokens, imagery, motion)

Each layer shows:
- Current data with confidence score
- Source attribution (user-entered, crawl-extracted, agent-learned, imported)
- Last updated timestamp
- Edit capability (user can modify any field directly)
- Pending proposals for this layer (if any)

**Confidence visualization:** A summary ring/arc showing aggregate confidence across all layers, with per-layer breakdowns. Accompanied by actionable suggestions: "Connect GA4 to improve your Customer layer (+10% confidence)" or "Upload writing samples to improve Voice accuracy (+8%)."

### 8.3 Goals

The Goals section is where the user defines what the system is optimizing toward. This is new — it doesn't exist in the current product.

**Goal structure:**

```
Goal {
  name: string                    // "Generate 50 qualified leads per month"
  type: 'okr' | 'kpi_target'     // Strategic objective or specific metric target
  metric: string                  // The measurable quantity
  target_value: number            // The target number
  target_period: string           // 'monthly' | 'quarterly' | 'annual'
  current_value: number           // Auto-populated from analytics
  contributing_apps: string[]     // Which apps contribute to this goal
  status: string                  // 'on_track' | 'behind' | 'ahead' | 'at_risk'
  created_at: timestamp
  updated_at: timestamp
}
```

**Goal types supported:**

- **KPI targets:** Specific measurable targets (50 leads/month, 4 posts/month, $200k revenue/quarter). These map directly to app metrics and are tracked automatically.
- **OKRs:** Strategic objectives with key results. "Establish thought leadership in AI security" with key results like "Publish 8 deep-dive articles," "Land 2 media placements in tier-1 outlets," "Grow organic traffic 40%." Each key result maps to KPI targets.

**Goal-to-app mapping:** When a goal is created, the system identifies which apps are relevant and how they contribute. The user can adjust the mapping. This powers the Analytics tab view and informs agent prioritization.

**Agent awareness:** Goals are available to all agents through the Synapse layer. Agents factor goals into their decision-making: Harvest prioritizes outreach to segments most likely to generate qualified leads if that's the top goal. Dark Madder prioritizes content topics that drive pipeline if revenue is the primary objective.

### 8.4 Integrations

Kinetiks is the operating system for the user's entire GTM stack — not just Kinetiks apps. The Integrations section manages everything the system is connected to, organized in two tiers.

#### Tier 1: Kinetiks Suite Apps (Deep Integration)

These are the first-party apps in the Kinetiks ecosystem: Harvest, Dark Madder, Hypothesis, Litmus, and future apps. They integrate through the Synapse protocol for the deepest possible connection:

- Full bidirectional data flow (Proposals up, Routing Events and Commands down)
- Shared identity and voice from Cortex
- Agent-to-agent coordination through Marcus
- Approval pipeline integration
- Real-time metric reporting to Analytics
- Command execution from Chat

Each suite app shows:
- **Status** — Active, paused, or available-to-activate
- **Synapse health** — Connection status, last data exchange, errors
- **Activity summary** — What it's doing (emails sent, posts published, etc.)
- **Data requirements** — What it still needs ("Litmus needs media contacts to be imported")
- **Quick actions** — Activate, pause, open the app, configure Synapse

For apps not yet activated: a factual description of capabilities and a one-click activate button.

#### Tier 2: External Integrations (API-Level Integration)

These are third-party tools in the user's existing GTM stack. Kinetiks connects to them through API connectors — OAuth flows, API keys, or webhook configurations. External integrations are bidirectional: they pull data IN to enrich the system, and they push actions OUT so the system can operate the tool.

**Categories and examples:**

**Advertising Platforms:**
- Meta Ads (Facebook/Instagram) — Pull: ad performance, audience insights, spend data. Push: pause/resume campaigns, adjust budgets, create audiences.
- Google Ads — Pull: campaign performance, keyword data, conversion tracking. Push: pause/resume, budget adjustments.
- LinkedIn Ads — Pull: campaign performance, audience engagement. Push: campaign management.
- TikTok Ads — Pull: campaign metrics. Push: campaign controls.

**CRM & Sales Tools:**
- HubSpot — Pull: contacts, deals, pipeline, activity. Push: create/update contacts, create deals, log activities, trigger workflows.
- Salesforce — Pull: leads, opportunities, accounts, reports. Push: create/update records, log activities.
- Pipedrive — Pull: deals, contacts, activities. Push: create/update records.

**Website & Landing Page Platforms:**
- Framer — Pull: site analytics, page performance. Push: publish pages, update content.
- Webflow — Pull: site data, form submissions. Push: CMS updates, publish changes.
- WordPress — Pull: traffic, content performance. Push: publish posts, update pages.

**Analytics & Data:**
- Google Analytics 4 — Pull: traffic, behavior, conversions, audience data. Feeds Customers layer and Analytics.
- Google Search Console — Pull: search performance, keyword rankings, indexing. Feeds Market layer and Analytics.
- Stripe — Pull: revenue, subscriptions, churn, MRR. Feeds Analytics.
- Mixpanel/Amplitude — Pull: product analytics, user behavior, funnels.

**Email & Communication:**
- Google Workspace — The system's email and calendar identity (configured during onboarding).
- Microsoft 365 — Alternative to Google Workspace for system identity.
- Slack — The system's Slack presence (configured during onboarding).
- Mailchimp/ConvertKit/Beehiiv — Pull: newsletter metrics, subscriber data. Push: create campaigns, manage lists.

**Social Media:**
- LinkedIn (organic) — Pull: post performance, engagement. Push: publish posts, manage presence.
- Twitter/X — Pull: engagement metrics. Push: publish posts.
- Instagram — Pull: engagement, audience data. Push: schedule posts.

**PR & Media:**
- Muck Rack — Pull: journalist data, coverage tracking.
- Cision — Pull: media database, coverage monitoring.

**Design & Content:**
- Figma — Pull: design assets, brand files.
- Canva — Pull/Push: design assets.

**Project Management:**
- Notion — Pull: docs, databases. Push: create pages, update databases.
- Linear — Pull: project status. Push: create issues.
- Asana — Pull: task status. Push: create tasks.

#### Integration Architecture

Every external integration follows a consistent pattern:

```
Connector {
  id: string
  provider: string                  // 'meta_ads', 'hubspot', 'framer', etc.
  category: string                  // 'advertising', 'crm', 'analytics', 'website', etc.
  status: string                    // 'active', 'error', 'disconnected', 'pending'
  auth_type: string                 // 'oauth2', 'api_key', 'webhook'
  credentials: encrypted            // OAuth tokens or API keys
  capabilities: {
    pull: string[]                  // What data this connector can read
    push: string[]                  // What actions this connector can take
  }
  data_mapping: {
    cortex_layers: string[]         // Which Context Structure layers this enriches
    analytics_metrics: string[]     // Which metrics this reports to Analytics
  }
  sync_config: {
    frequency: string               // 'realtime', '15min', 'hourly', 'daily'
    last_sync: timestamp
    next_sync: timestamp
  }
  created_at: timestamp
}
```

**Pull behavior:** Connectors sync data at configured intervals. Pulled data enriches the Context Structure (through Proposals, same as any other intelligence source) and feeds Analytics metrics directly.

**Push behavior:** When Marcus routes a command that involves an external tool, the command goes through the connector's push API. The same approval system applies — if the action requires approval, it's queued before execution. "Pause the Meta campaign" goes through approvals if the confidence threshold isn't met.

**The key principle:** From the user's perspective in Chat, there is no difference between commanding a Kinetiks app and commanding an external tool. "Pause all outbound to healthcare" might touch Harvest (Kinetiks app) AND HubSpot (external tool) simultaneously. The system routes to both through the appropriate layer.

#### Integration UX in Cortex

Each integration shows:
- Provider name and logo
- Connection status with health indicator
- What data it provides (which Cortex layers, which Analytics metrics)
- What actions it supports (what the system can do through this connection)
- Last sync time and sync frequency
- Configuration (scopes, permissions, sync settings)
- Connect/disconnect/reconfigure actions

Integrations are browsable by category. Connected integrations are shown first. Available-but-not-connected integrations are listed below with one-click setup flows.

#### Integration and Chat Commands

When a user issues a command in Chat that involves an external tool:

1. Marcus identifies the tool(s) involved
2. Checks if the connector exists and is healthy
3. If connected: routes the command through the connector's push API
4. If not connected: tells the user "I'd need access to [tool] to do that. Want to connect it?" with a direct link to the integration setup
5. Results flow back through the connector and are presented in Chat

This means the user can say "What's our Meta ad spend this month?" or "Create a HubSpot deal for Acme Corp at $50k" and the system handles it — as long as the integration is connected.

### 8.6 Ledger

The Learning Ledger is an append-only audit trail of everything the system has learned and done:

- **Proposals** — Every proposal submitted, its evaluation (accepted/declined/escalated), and reasoning
- **Routings** — Every learning routed from Cortex to an app Synapse
- **User edits** — Every direct edit the user made to the Context Structure
- **Agent actions** — Every significant action taken by an agent (email sent, post published, sequence started)
- **Approval decisions** — Every approval, rejection, and edit-before-approval
- **Confidence changes** — Timestamped log of confidence score movements with causes
- **Imports** — Every data import and its processing results

The Ledger is filterable by: time range, source app, event type, layer affected. It is the answer to "why did the system do that?" and "what has the system learned?"

---

## 9. Settings Modal

Triggered by the profile/avatar icon in the top bar. Opens as a modal overlay. Contains account and organizational administration that does not belong in the product tabs.

### 9.1 Sections

**Account** — User profile, email, password, avatar. Two-factor authentication.

**Organization** — Company/team settings. Team members and roles (when multi-seat is supported).

**Billing** — Subscription plan, payment methods, invoices, usage. Seeds balance and history. Plan upgrades/downgrades.

**API Keys** — BYOK (Bring Your Own Key) for Anthropic API. Kinetiks API keys for MCP access. Key generation, rotation, revocation.

**Notifications** — Preferences for how and when the system communicates. Which notifications go to desktop, email, Slack. Quiet hours. Brief schedule configuration (daily/weekly/monthly, time, channel).

**Team/Seats** — (When multi-user is supported) Invite team members, assign roles, manage permissions.

**Danger Zone** — Delete account, export data, disconnect all integrations.

---

## 10. Agent Architecture

### 10.1 The Three-Layer System

**Layer 3 — Cortex:** The core intelligence engine. Maintains the Context Structure, processes Proposals, routes learnings, scores confidence. Has four Operators: the Cartographer (intake), the Archivist (data quality), Marcus (conversational intelligence / the engine behind the named system), and the Oracle (analytics intelligence).

**Layer 2 — Synapse:** One per app. The membrane between an app and the shared identity. Each Synapse handles: pulling context from Cortex, submitting Proposals with learnings, receiving routed intelligence, executing commands from Marcus, reporting metrics to the Oracle.

**Layer 1 — Operator:** App-internal agents doing work. These live in each app's codebase. They never touch Cortex directly — they report to their Synapse.

### 10.2 Communication Rules

These are absolute and never violated:

1. Operators never touch Cortex. They report to their Synapse only.
2. Synapses talk only to Cortex and their own Operators. Never to other Synapses.
3. Cortex talks only to Synapses and its own Operators (Cartographer, Archivist, Marcus, Oracle).
4. All intelligence crosses the app boundary via Proposal (up) or Routing Event (down).
5. User-entered data always wins over AI-generated data. Always.
6. Everything is logged in the Learning Ledger with full attribution.

### 10.3 Bidirectional Synapse Communication

Synapses originally only communicated upward (Proposals) and received downward (Routing Events). For the command routing system, Synapses must also accept commands:

**Upward (existing):**
- Proposals: "Here's something I learned about the business"
- Metrics: "Here's my latest performance data for Analytics"

**Downward (existing):**
- Routing Events: "Here's a learning from another app that's relevant to you"

**Downward (new — commands):**
- Action Commands: "Build a 3-touch sequence for fintech CFOs" (from Marcus, via user directive)
- Query Commands: "What are the top-performing sequences this month?" (from Marcus, via user question)
- Configuration Commands: "Pause all outbound to healthcare" (from Marcus, via user directive)

Commands flow: User → Chat → Marcus → Cortex (route) → Synapse → App Operators → (results) → Synapse → Cortex → Marcus → Chat

### 10.4 External Tool Connectors

External integrations communicate through a Connector layer that parallels the Synapse layer but is simpler (API calls, not agent coordination):

**Inbound (pull):**
- Data syncs: Periodic pulls of metrics, contacts, deals, content — at configured intervals
- Webhook receivers: Real-time event ingestion from tools that support webhooks
- Pulled data feeds into Cortex (via Proposals) and Analytics (directly)

**Outbound (push):**
- Action commands: API calls to create, update, or control resources in the external tool
- Triggered by Marcus when a user directive targets an external tool
- Subject to the same approval system as Kinetiks app actions

Connector flow: User → Chat → Marcus → Cortex (route) → Connector → External API → (results) → Connector → Marcus → Chat

**The unified routing layer:** Marcus doesn't need to know whether a target is a Kinetiks app or an external tool. The Cortex routing layer maintains a registry of all available targets (Synapses + Connectors) and their capabilities. When Marcus parses a command, the router identifies the correct target(s) and dispatches through the appropriate channel. This abstraction is what allows the Chat to feel seamless regardless of what's being controlled.

### 10.5 The Proposal Protocol (Unchanged)

The existing Proposal protocol remains the mechanism for intelligence flowing upward:

- Schema validation → Conflict detection → Relevance scoring → Merge → Route
- Ownership hierarchy: User explicit > User implicit > Validated > Inferred > Speculative
- Scalar fields from user are sacred. Array fields are additive.
- All proposals logged in the Ledger.

### 10.6 Marcus as the Engine

Marcus powers the named system's intelligence. The Marcus architecture:

**Conversation pipeline:** Intent classification → Context assembly (token-budgeted per intent type) → Conversation history (semantic search + recent) → Response generation (Claude Sonnet) → Action extraction (Claude Haiku) → Execute actions + deliver response.

**Five jobs:**
1. **Strategic advisor** — Synthesizes cross-app data for specific, data-grounded direction
2. **Cross-app orchestrator** — Coordinates actions across apps for campaigns, launches, pivots
3. **Proactive communicator** — Daily briefs, weekly digests, monthly reviews, real-time alerts
4. **Context enrichment** — Extracts intelligence from conversation, submits Proposals automatically
5. **Support/guidance** — Knows Kinetiks docs, answers product questions, guides users

**Voice:** Stoic, clear, grounded, concise, direct. Never sycophantic, never anxious, never hype-driven. This is the Marcus voice applied to whatever the user named their system.

**Surfaces:**
- Chat tab in the desktop app (primary)
- Slack bot (two-way: briefs/alerts out, conversations in)
- System email (outbound briefs with "Reply in Slack" links)
- Floating pill quick-chat in suite apps
- MCP interface for external agent access

### 10.7 The Oracle (Analytics Intelligence)

The Oracle is the fourth Cortex Operator. While the Cartographer maps, the Archivist preserves, and Marcus speaks — the Oracle sees. It is the analytics intelligence layer that turns raw metrics from every app into strategic insight.

**Role:** The Oracle is not a dashboard renderer. It is an active agent that watches, pattern-matches, detects anomalies, generates insights, and feeds learnings back into Cortex. It powers the Analytics tab and provides Marcus with data-grounded answers to analytics questions.

**Five jobs:**

1. **Metric aggregation** — Pulls performance data from every app Synapse on a regular cadence. Normalizes metrics into a unified schema. Maintains time-series data for trend analysis. Handles missing data, stale syncs, and format inconsistencies.

2. **Goal tracking** — Monitors progress toward user-defined goals (from the Cortex Goals section). Calculates on-track/behind/ahead status. Identifies which apps are contributing and which are falling short. Projects goal completion based on current trajectory.

3. **Pattern detection and anomaly alerting** — Watches for significant changes: reply rate drops, traffic spikes, conversion shifts, pipeline velocity changes. Distinguishes signal from noise (not every 5% fluctuation is an alert). When something significant happens, generates an alert that reaches the user through Marcus.

4. **Insight generation** — Goes beyond "what happened" to "why it happened" and "what to do about it." Cross-references metrics across apps: "The security angle consistently outperforms cost savings 3:1 in Harvest outreach. Dark Madder content on security topics gets 2x the engagement. Recommend shifting the content calendar." These insights are delivered through Marcus in Chat and surfaced in the Analytics tab.

5. **Context enrichment** — When the Oracle discovers something that should update the business identity, it submits Proposals to Cortex. "Based on 60 days of outreach data, your ICP should weight Series B more heavily than Series A" becomes a Proposal to update the Customers layer. "The security messaging resonates strongest with CISO and VP Engineering personas" becomes a Proposal to update messaging_patterns in the Voice layer.

**Relationship to other Operators:**

- **Oracle → Marcus:** Marcus asks Oracle for data when the user asks analytics questions in Chat. Oracle provides both the raw numbers and the interpreted insight. Marcus delivers it in the system's voice. Oracle also pushes proactive alerts to Marcus for delivery: "Reply rates dropped 40% — tell the user."
- **Oracle → Archivist:** When Oracle detects data quality issues (gaps in metrics, inconsistent reporting, stale syncs), it flags them to the Archivist for investigation.
- **Oracle → Cartographer:** When Oracle identifies gaps in the Context Structure that would improve analytics quality ("I can't score your competitive positioning without competitor traffic data"), it requests enrichment from the Cartographer.
- **Oracle → Synapses:** Oracle pulls metric data from each app Synapse on a schedule. It also pushes insights back down as Routing Events: "This segment is underperforming based on cross-app data — consider adjusting targeting."

**What Oracle produces for the Analytics tab:**

- Goal progress cards with trend visualization
- Cross-app KPI scoreboard
- Full-funnel visualization (awareness → engagement → pipeline → revenue)
- Channel performance comparison
- Content-to-pipeline attribution
- Anomaly timeline (significant events and their impact)
- Recommendations with supporting data

**Runs:** CRON-scheduled metric pulls (frequency varies by metric type — real-time for critical KPIs, hourly for standard metrics, daily for slow-moving data). Event-triggered analysis when significant data arrives. On-demand when Marcus requests data for a Chat response.

**Technical implementation:** Deployed as a Supabase Edge Function (like other CRON operators). Stores aggregated metrics in `kinetiks_analytics_*` tables. Uses Claude Haiku for lightweight pattern detection and Sonnet for deeper insight generation.

---

## 11. The Floating Pill (In Suite Apps)

When the user is inside a suite app (Harvest, Dark Madder, etc.), the Kinetiks presence is a floating pill component anchored to the bottom-left corner.

**For standalone app users (not connected to Kinetiks):**

The pill is minimal. It shows the Kinetiks branding and serves as a gentle introduction to the platform:
- Collapsed: Small Kinetiks logo pill
- Expanded: Brief info about what Kinetiks adds (cross-app intelligence, unified analytics, the GTM operating system). CTA to learn more / connect to Kinetiks. Not a hard sell — a factual description that appears only when the user clicks the pill.

**For Kinetiks-connected users:**

**Collapsed state:** Small pill showing the system's name. Always visible, never in the way.

**Expanded state:** Panel slides up showing:
- System name + confidence score
- 2-3 relevant suggestions for this app
- Pending approvals from this app
- Recent learnings routed to this app
- Quick-chat input (talk to the system without leaving the app)
- Link to open the full Kinetiks app
- App switcher (other active apps as direct links)

Inside the Kinetiks app itself, there is no floating pill — you're already home.

---

## 12. MCP Interface (Agent-to-Agent Access)

Kinetiks exposes its full capability through an MCP (Model Context Protocol) server. This allows external AI agents to interact with the GTM system programmatically.

### 12.1 Why This Matters

The Kinetiks MCP server is what makes Kinetiks discoverable and usable by other AI agents. An external agent (Claude Code, a custom GPT, a coding assistant) can:

- Read from the Cortex (understand the business)
- Submit Proposals (contribute intelligence)
- Issue commands to apps (trigger outbound, request content)
- Read analytics (understand performance)
- Create accounts (with one-step human approval)

This enables agent-to-human acquisition: an AI helping someone with marketing discovers Kinetiks as infrastructure, onboards the user's business, and starts operating — with the human stepping in later to find a running system.

### 12.2 Account Creation by Agents

External agents can initiate account creation through MCP, with one required step of human approval:

1. Agent calls `create_account` with business information
2. Kinetiks sends a verification email/link to the human
3. Human clicks to approve account creation
4. Agent receives API key and can begin operating
5. When the human first opens the Kinetiks app, they find a system that's already been set up with their business context, ready to approve initial actions

### 12.3 MCP Tool Surface

The MCP server exposes the full product capability:

- **Context tools:** Read/update all 8 Cortex layers, read confidence, read schema
- **Cartographer tools:** Crawl website, analyze content, run onboarding programmatically
- **Command tools:** Issue directives to any connected app through the Synapse layer
- **Approval tools:** List pending approvals, submit approvals programmatically
- **Analytics tools:** Read cross-app metrics, goal progress, performance data
- **Connection tools:** List data sources, check status
- **Chat tools:** Send messages to the system, read responses (streaming)

---

## 13. New App Integration Pattern

This section defines how any new app integrates with the Kinetiks platform. This is the pattern that makes the system extensible.

### 13.1 What Every App Must Have

1. **A Synapse.** Deployed as a Supabase Edge Function following the `@kinetiks/synapse` template. Handles: context pulls, Proposal submission, routing event reception, command execution, metric reporting.

2. **Shared auth.** Uses `@kinetiks/supabase` middleware. Cookie domain `.kinetiks.ai`. Unauthenticated users redirect to `id.kinetiks.ai/login?redirect={app_url}`.

3. **The floating pill.** `import { FloatingPill } from '@kinetiks/ui'` in the root layout.

4. **App-prefixed tables.** All database tables use the app's prefix (e.g., `hv_*` for Harvest, `dm_*` for Dark Madder).

5. **Metric reporting.** The Synapse reports app-specific metrics to the Analytics engine at defined intervals.

6. **Command handling.** The Synapse accepts and routes commands from Marcus to the appropriate internal Operators.

7. **Approval generation.** When agents produce work that needs human sign-off, they generate approvals that flow to the Kinetiks approvals queue with the correct type classification (quick/review/strategic).

8. **Brand consistency integration.** All outward-facing content generated by the app passes through a brand/voice validation check against Cortex data before reaching the approval queue.

### 13.2 What Every App Gets

1. **The full Context Structure.** Business identity, voice, ICP, competitive intel, brand guidelines - all available through the Synapse.

2. **Intelligence from other apps.** Routing Events deliver relevant learnings: "Harvest found that security messaging resonates with fintech buyers" → Dark Madder gets this for content planning.

3. **Shared billing.** No app-level billing. One subscription, managed in Kinetiks settings.

4. **Shared auth and user management.** No app-level auth flows.

5. **Command interface.** Users can operate the app from the Kinetiks Chat tab without opening the app directly.

6. **Analytics integration.** App metrics appear in the unified Kinetiks Analytics dashboard, mapped to user goals.

### 13.3 What Each App Owns

1. **Its own operators/agents.** The app's internal intelligence. These are specialized for the app's domain.

2. **Its own UI and workflows.** The app's product experience for detailed work. This is what users open when they need to go deep (edit a blog post, review a prospect list, configure a sequence).

3. **Its own database tables.** App-specific data that doesn't belong in Cortex.

4. **Its domain expertise.** Best practices for its function. Harvest knows outbound. Dark Madder knows content. Litmus knows PR. This expertise powers the quality gates for that app's outputs.

---

## 14. Build Priority and Non-Negotiables

### 14.1 What Must Be Excellent

These are the systems that, if built poorly, make the entire product fail:

1. **The approval system.** If approvals are janky, slow, or confusing, users won't trust the agents. If agents can't earn autonomy, the product is just a chatbot. This is the trust architecture and it has to be flawless.

2. **Cross-app command routing.** If the Chat can't actually do things across apps, the Kinetiks app is just a dashboard. The Chat must be a real command interface that translates intent into coordinated action.

3. **The learning loop.** If approval decisions don't feed back into system intelligence, the product never gets smarter. The system must visibly improve based on user interactions.

4. **Brand consistency enforcement.** If agents produce off-brand content, users lose trust immediately. The quality gates must catch problems before they reach the human.

5. **The proactive intelligence.** If the system only responds and never initiates, it feels passive. The daily brief, alerts, recommendations, and follow-ups are what make it feel like a real team member that's working for you even when you're not looking.

### 14.2 What We Build First

Phase 1: Core Kinetiks app shell (three-tab layout, Electron app, settings modal)
Phase 2: Approval system (confidence-based autonomy, inline review, learning loop)
Phase 3: Cortex evolution (goals layer, sub-navigation, identity + goals + integrations view)
Phase 4: Cross-app command router (bidirectional Synapse, command parsing, multi-app orchestration)
Phase 5: Oracle + Analytics engine (metric aggregation, pattern detection, insight generation, goal tracking, cross-app scoreboard)
Phase 6: Agent communication layer (email integration, Slack identity, calendar)

This order is deliberate. Each phase builds on the last. The shell gives us the structure. Approvals give us the trust layer. Goals give us the optimization targets. Command routing gives us the action layer. Oracle + Analytics gives us the intelligence and scoreboard. Communication gives us the arms.

After the foundation is solid, we plug in apps: wire Harvest into approvals, command routing, and analytics reporting. Then Dark Madder. Then build new apps natively on the system.

### 14.3 The Standalone App Consideration

Each suite app must work independently without Kinetiks. This means:

- Every app has its own onboarding flow (which builds a Kinetiks ID and Context Structure, but framed for that app)
- Every app has its own internal approval flow for agent work (not dependent on the Kinetiks approvals system)
- Every app has its own standalone value proposition that justifies using it without the suite
- The Kinetiks integration is an enhancement, not a requirement
- The upgrade path from standalone to Kinetiks-connected must be seamless (no re-onboarding, no data loss, existing Context Structure carries over)

---

## 15. Technical Architecture Summary

- **Monorepo:** Turborepo with pnpm workspaces
- **Framework:** Next.js 14 (App Router)
- **Desktop:** Electron wrapping the Next.js web app
- **Language:** TypeScript (strict mode)
- **Database:** Supabase (Postgres + Auth + Realtime + Edge Functions + Storage)
- **AI:** Anthropic Claude API (Sonnet for agents, Haiku for lightweight tasks)
- **Styling:** Tailwind CSS 4
- **Auth:** Shared across subdomains via `.kinetiks.ai` cookie domain
- **Agent communication:** Supabase Realtime channels per Synapse
- **MCP:** `@kinetiks/mcp` npm package for external agent access
- **Email:** Google Workspace / Microsoft 365 integration for system identity; Resend for transactional
- **Slack:** Slack Bolt for JavaScript

The Kinetiks app evolves from `apps/id` in the existing monorepo. The Electron wrapper is new (`apps/desktop` or similar). All existing infrastructure (Cortex, Synapse protocol, Proposal pipeline, Marcus engine, Cartographer, Archivist) remains intact and is extended, not replaced.
