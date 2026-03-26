# KINETIKS AI - HARVEST

## The Outbound Engine

### Definitive Product Specification

**Version 3.0 | March 2026**

**Author:** Zack Holland

This document supersedes all prior Harvest, Bloomify, and Harvest v1 specs.

Read alongside: Agent-Native Architecture Spec, Cross-App Intelligence Spec, Sentinel Spec, Kinetiks ID Product Spec, Agent Architecture v2, KNOWLEDGE_INTEGRATION.md

---

# 1. The Vision

Harvest is not a cold email tool. It is an outbound engine with seven AI agents that handle every stage of the sales development lifecycle - from purchasing sending infrastructure to voice-calling prospects to managing relationships in a full CRM. It replaces the need for a separate prospecting tool, email tool, LinkedIn automation platform, dialer, inbox manager, and CRM. One person builds a complete outbound engine in a day.

Every AI outbound tool asks you to write templates, upload lead lists, and manage your own inbox. Harvest does the work. Seven Operators - Postmaster, Scout, Composer, Concierge, Navigator, Keeper, and Analyst - handle infrastructure, prospecting, copywriting, reply management, multi-channel orchestration, relationship tracking, and performance intelligence. The Kinetiks ID means Harvest already knows your voice, your products, your customers, and your competitive landscape from the first interaction. And everything Harvest learns flows back to the ecosystem - the messaging that converts in outbound improves your content, your landing pages, and your PR.

## 1.1 What Makes This Different

**Identity-aware outreach.** Every other outbound tool starts from scratch. Define your ICP. Describe your product. Set your tone. Harvest reads all of this from the Kinetiks Context Structure - Voice, Products, Customers, Competitive, Narrative. A first-touch email from Harvest is informed by your actual writing voice, your real product differentiators, and your validated customer pain points. Not a template.

**Agent architecture, not automation scripts.** Traditional outbound tools are linear: build list, write sequence, press send, check inbox. Harvest's seven Operators work in parallel, continuously. Scout finds prospects while Composer researches them while Concierge handles yesterday's replies while Postmaster monitors deliverability while Analyst finds patterns. They coordinate through the Synapse, not through a sequential pipeline.

**Trust-based autonomy.** Harvest has three driving modes - Human Drive, Approvals, and Autopilot. You start in control. The system earns autonomy function-by-function as it proves it can match your judgment. You might trust it to handle OOO replies on day one but not let it draft cold emails unsupervised until week six. Autonomy is earned, not assumed.

**Cross-app intelligence compounding.** When Harvest discovers that security messaging converts 3x better with enterprise prospects, that learning flows through the Synapse to the Cortex. Dark Madder starts writing more security content. Hypothesis builds personalized landing pages for each prospect Harvest targets. Litmus weaves validated angles into journalist pitches. Every app gets smarter from Harvest's outbound data - and Harvest gets smarter from every app.

**Voice calling from day one.** Email and LinkedIn are not enough. Harvest integrates ElevenLabs voice AI for intelligent phone outreach - warm, human-sounding calls that follow up on email sequences, qualify interest, and book meetings. Phone is not a future feature. It is a first-class channel alongside email and LinkedIn.

## 1.2 The Product in One Sentence

Seven AI agents run your outbound - prospecting, writing, calling, sending, replying, booking meetings, tracking deals - earning autonomy as they prove they can match your voice and your judgment.

## 1.3 What Harvest Replaces

| Category | Tools Replaced | How Harvest Handles It |
|----------|---------------|----------------------|
| Prospecting | Apollo, ZoomInfo, Clay, Lusha | Scout - enrichment waterfall, signal-based targeting, ICP matching from Context Structure, lead scoring |
| Email sending | Instantly, Smartlead, Lemlist | Postmaster - domain management, warmup, rotation, deliverability monitoring, compliance |
| Copywriting | Lavender, Copy.ai, agencies | Composer - research-backed, voice-matched, context-aware drafts with playbook library |
| Inbox management | VA services, reply.io | Concierge - classification, auto-response, meeting booking, escalation engine |
| LinkedIn | PhantomBuster, Dripify | Navigator - profile views, connections, messages, content engagement, multi-channel sequences |
| Voice calling | Orum, Nooks, manual dialing | Navigator + ElevenLabs - AI voice calls, qualification, meeting booking, call intelligence |
| CRM | HubSpot, Pipedrive, Close | Keeper - pipeline, deals, contact history, BCC tracking, re-engagement triggers |
| Analytics | Gong, manual reporting | Analyst - campaign, sequence, channel, revenue attribution, send-time optimization |

## 1.4 Agent-Native Architecture

Harvest is built API-first from day one. Every feature is an API endpoint first, with the UI as a client that calls that endpoint. This is not a nice-to-have - it is the single most important architectural rule in the entire ecosystem, mandated by the Agent-Native Architecture Spec.

The UI never writes directly to the database. The UI never contains business logic. The UI never does anything that cannot be replicated by an HTTP request. Every button click corresponds to an API call. Every screen reads from an endpoint. Every approval is a structured request/response. If a human can do it in the dashboard, an agent can do it via API. No exceptions.

This means Harvest serves three client types simultaneously from day one:

| Client | How They Interact | Auth Method |
|--------|-------------------|-------------|
| Human (UI) | React dashboard at hv.kinetiks.ai. Clicks buttons, reviews drafts, approves actions. Every click calls a Next.js API route. | Session cookie scoped to .kinetiks.ai (Supabase Auth) |
| Agent (API) | HTTP requests to the same API routes. Receives JSON. Evaluates programmatically. Resolves approvals via POST. Same endpoints, same payloads, same responses. | API key (`kntk_` prefix) with configurable permissions, scope, and rate limits. Created at id.kinetiks.ai/settings. |
| Internal service | Edge Functions, CRONs, and inter-app communication. Same API routes, service-level access. | Internal service secret for trusted server-to-server calls. |

The actual implementation lives in `apps/id/src/lib/auth/require-auth.ts` with `resolveAuth()` supporting all three methods. The permission hierarchy is numeric: read-only < read-write < admin. All three client types resolve to the same kinetiks_id after authentication. All downstream logic - RLS policies, Context Structure access, Operator permissions, billing - works identically regardless of how the user authenticated.

Rate limiting uses atomic RPC with per-minute AND per-day windows, with fail-open on error.

What this enables today: Clean architecture, testable API routes, separation of concerns between UI and business logic.

What this enables in 12-18 months: An autonomous AI agent creates a Kinetiks ID, populates the Context Structure programmatically, activates Harvest, and runs the full outbound engine - prospecting, writing, calling, sending, replying, booking meetings, tracking deals - without a human ever logging into the dashboard. The platform that wins the agent era is the one that treated API access as a first-class experience from the start.

## 1.5 The Approval Protocol

Every proposed action in Approvals mode flows through a channel-agnostic approval protocol. The system generates an approval request with full context. It delivers that request to whichever channels the user has configured. It receives a structured response (approve, edit, reject). It does not care whether the response came from a Slack button click, a dashboard button click, a webhook callback, or an API poll.

| Channel | Delivery | Resolution |
|---------|----------|------------|
| Dashboard (human) | Approval appears in the app's approval queue. Full context, draft preview, Sentinel verdict. | User clicks Approve/Edit/Reject. UI calls POST /api/approvals/{id}/resolve. |
| Slack (human) | Block Kit interactive message to #harvest-approvals. | User clicks button. Slack sends interaction payload. Handler calls POST /api/approvals/{id}/resolve. |
| Webhook (agent) | Approval request sent as POST to the user's configured webhook URL. Full context as self-contained JSON. | Agent's server processes the payload and calls POST /api/approvals/{id}/resolve with its decision. |
| API polling (agent) | Approval appears in GET /api/approvals?status=pending. No push notification. | Agent polls GET /api/approvals?status=pending. Resolves each via POST /api/approvals/{id}/resolve. |

Webhook payloads are self-contained - the agent can make its decision without calling any other endpoint. They are signed with HMAC-SHA256 for authenticity verification. Delivery includes retry logic (3 attempts with exponential backoff).

## 1.6 Convenience Endpoints

LLMs and agents work best with pre-composed context rather than assembling data from multiple tool calls. Harvest exposes convenience endpoints that aggregate commonly-needed data into single responses:

| Endpoint | Returns |
|----------|---------|
| GET /api/harvest/daily-brief | Today's pipeline changes, pending approvals (count + summaries), active campaign stats, emails sent/opened/replied today, meetings booked, calls made, wins, Analyst insights. One call gives the LLM everything it needs for "what's happening today?" |
| GET /api/harvest/prospect/{id}/full | Everything about a prospect in one call: contact data, org data, all activities, all emails, all calls, deal status, lead score breakdown. The LLM does not need to make 6 calls to assemble a prospect picture. |
| GET /api/approvals/summary | Pending approvals grouped by type and urgency. Helps the LLM present approvals efficiently. |

These endpoints serve both the dashboard UI (which uses them for the home screen) and MCP/agent users (who use them for daily operations). Same API, same response shape, same auth.

---

# 2. The Three Driving Modes

The driving modes are the single most important product pattern in the Kinetiks ecosystem. They govern how every Operator in every app earns the right to act autonomously. Harvest defines the pattern first because outbound is where trust matters most - nobody hands their sales emails to AI on day one.

The driving modes are not a global toggle. Autonomy unlocks per-Operator, per-function. Scout might reach Autopilot for ICP matching while Composer is still in Approvals for first-touch emails. The user controls each one independently. Trust is earned at the granular level.

## 2.1 Mode 1 - Human Drive

The user does everything. AI is the copilot - it surfaces research, suggests draft copy, recommends prospects, flags replies. But every action requires user initiation. The system watches and learns from every choice the user makes.

Every edit to a draft, every prospect skipped, every reply written manually, every pipeline stage change - all of it is training data. The system silently compares what it would have done to what the user actually did. This delta is how confidence builds.

Human Drive is the default for new accounts. No exceptions. Even if the user wants Autopilot on day one, the system requires a minimum observation period per function before unlocking the next mode.

## 2.2 Mode 2 - Approvals

The AI proposes actions. The user approves, rejects, or edits. Every decision trains the system further. This is the phase where the AI proves itself.

Approval requests are specific and contextual. Not "approve this email" but "I drafted this email to Sarah Chen, VP Marketing at Dataflow. I led with the security integration angle because her company just had a data breach in the news. The CC is James Liu, Director of Engineering, because your pairing preferences target technical champions alongside marketing decision-makers. Approve, edit, or reject?"

Approvals can be batched. The user can review 15 prospect additions at once, or 8 draft emails at once. Each approval/rejection/edit is logged with full context for the confidence engine.

## 2.3 Mode 3 - Autopilot

The AI acts within guardrails. The user gets daily digests via Slack and can override anything. But the system runs. Scouts prospects, sends emails, makes calls, handles replies, books meetings, updates the CRM. The user's role shifts from operator to strategist.

Autopilot has hard guardrails that cannot be overridden: daily send limits per mailbox, LinkedIn daily action limits, maximum calls per day, maximum spend per day on enrichment credits, mandatory escalation triggers (high-value accounts, pricing questions, frustrated tone, legal mentions). These guardrails exist even in full Autopilot.

## 2.4 The Unlock Mechanism

Autopilot does not unlock globally. It unlocks per-Operator, per-function when confidence reaches threshold. The confidence scoring engine evaluates four dimensions:

| Dimension | What It Measures | Example |
|-----------|-----------------|---------|
| Volume | Minimum number of user decisions observed before Autopilot is even offered. Prevents premature unlock. | Composer needs 50+ approved/edited emails before first-touch Autopilot is available. |
| Agreement rate | Percentage of AI proposals the user approved unchanged. Higher agreement = higher confidence. | Scout's prospect suggestions approved 95%+ over 100+ decisions = ready for Autopilot. |
| Outcome data | Real-world results from AI-initiated actions. Emails that got replies, meetings booked, deals closed. | Composer's approved emails have a 12% reply rate vs. 8% industry average = strong signal. |
| Recency weighting | Recent patterns matter more than old ones. A user's preferences evolve. Last 30 days weighted 3x. | User shifted from casual to formal tone last month - system adapts confidence to current style. |

The unlock prompt should feel like earning trust, not flipping a switch: "Composer has drafted 47 first-touch emails. You approved 44 unchanged, edited 3, rejected 0. Based on this, I am confident I can draft first-touch emails that match your voice. Want to let me send these without approval?"

Users can downgrade any function at any time. Move Composer back to Approvals, move Scout back to Human Drive. The confidence data is preserved - re-upgrading to Autopilot does not require starting over.

## 2.5 Confidence Dashboard

Each Operator has a confidence dashboard showing per-function status. The user sees at a glance which functions are in which mode and how close each is to the next unlock.

| Operator | Function | Current Mode | Autopilot Readiness |
|----------|----------|-------------|-------------------|
| Scout | ICP prospect matching | Autopilot | Active - 97% agreement |
| Scout | Signal-based targeting | Approvals | 82% - needs 18 more decisions |
| Composer | First-touch emails | Approvals | 91% - 6 more approvals needed |
| Composer | Follow-up emails | Human Drive | 44% - needs more volume |
| Concierge | OOO handling | Autopilot | Active - 100% agreement |
| Concierge | Objection handling | Human Drive | 23% - early stage |
| Navigator | Voice calls | Human Drive | 12% - requires significant training |
| Analyst | Send-time optimization | Autopilot | Active - data-driven, no judgment call |

## 2.6 Driving Modes for Agent Users

When the user is an agent authenticating via API key, the trust dynamic shifts. The agent may not need to "watch the AI work" - it may trust the system from the start. But quality control still matters.

| Mode | Human User | Agent User |
|------|-----------|------------|
| Human Drive | Human does everything. AI assists and learns. | Does not apply. An agent does not manually write emails. Agents start in Approvals. |
| Approvals | AI proposes, human approves via dashboard or Slack. | AI proposes, agent approves via webhook or API polling. The agent might auto-approve everything or apply its own judgment layer. |
| Autopilot | AI acts autonomously. Human reviews daily digests. | AI acts autonomously. Sentinel is the only quality gate. Agent receives event webhooks for awareness but does not intervene unless something breaks. |

For agent users, the confidence model shifts to outcome-based scoring:

| Dimension | Human User | Agent User |
|-----------|-----------|------------|
| Volume | Minimum decisions observed before unlock | Minimum outputs generated before assessment |
| Agreement rate | % of proposals approved unchanged by human | % of outputs approved by Sentinel without holds |
| Outcome data | Real-world results (replies, meetings, deals) | Same - identical for both user types |
| Quality score trend | Not a primary dimension | Primary dimension for agents. Are Sentinel quality scores stable or declining? Declining scores trigger automatic mode downgrade. |

Agent users can start in Approvals (skipping Human Drive) if the Context Structure confidence score is above 70% and the agent explicitly opts in. But Sentinel quality thresholds are non-negotiable regardless of starting mode.

## 2.7 Sentinel as the Universal Gate

In an agent-native world, Sentinel becomes the most important component in the entire ecosystem. When there is no human reviewing output, Sentinel is the only thing between the AI and the outside world. Sentinel's quality gate, brand safety checks, compliance enforcement, and contact fatigue governance must be rock-solid - because in Autopilot with an agent user, nothing else stops a bad email from sending.

Sentinel is a Cortex Operator (not an app-level feature) and cannot be bypassed even in full Autopilot, even via API. The design decision to make Sentinel unbypassable was made for the human user experience, but it becomes existentially important for agent users. An agent user might configure Autopilot on day one and never look at the dashboard. Sentinel is what makes that safe.

Sentinel now uses the knowledge system (`loadKnowledge()` from `@kinetiks/ai`) to load content quality audit rubrics and AI-tell detection patterns. It evaluates 7 editorial dimensions - voice_match, tone, clarity, product_accuracy, competitive_claims, spelling_grammar, and length - with weighted composite scoring. Each dimension produces a score and optional flags. On AI failure, Sentinel returns a conservative fallback (score 50, manual review flag) rather than blocking the pipeline entirely.

---

# 3. The Seven Operators

Every Operator in Harvest follows the same structural pattern: it belongs to the Harvest app, reports only to the Harvest Synapse, never touches the Kinetiks ID directly, and operates within one of the three driving modes.

| Operator | Domain | Core Responsibility | Key Dependencies |
|----------|--------|-------------------|-----------------|
| Postmaster | Infrastructure | Email deliverability, domains, DNS, warmup, rotation, reputation, compliance | SES/Resend, Google Postmaster Tools, DNS APIs, ZeroBounce |
| Scout | Prospecting | ICP matching, enrichment waterfall, signal monitoring, lead scoring, verification | PDL, Apollo, LinkedIn, BuiltWith, Crunchbase, ZeroBounce |
| Composer | Copywriting | Research, personalization, email/LinkedIn/call drafts, Bloomify CC, playbooks | Claude API, web crawl. CS: Voice, Products, Customers, Narrative, Competitive |
| Concierge | Replies | Classification, auto-response, objection handling, meeting booking, escalation | Claude API, Google Calendar. CS: Products, Competitive, Voice |
| Navigator | Orchestration | Sequences, LinkedIn, ElevenLabs voice calls, send-time optimization, re-engagement | LinkedIn API, ElevenLabs, Twilio. CS: Customers |
| Keeper | CRM | Pipeline, deals, contacts, conversations, BCC tracking, re-engagement triggers | Supabase hv_ tables, email parsing. CS: Customers, Competitive |
| Analyst | Intelligence | Campaign analytics, lead scoring, revenue attribution, pattern detection, reporting | All Operator data. Promotes intelligence to Synapse. |

## 3.1 Postmaster - Email Infrastructure and Compliance

Postmaster is the foundation. If emails land in spam, nothing else matters. If emails violate compliance laws, the user faces legal liability. Postmaster handles both - deliverability engineering and legal compliance.

**Domain Portfolio.** Outbound email is never sent from the user's primary domain. Postmaster manages a portfolio of secondary sending domains - variants of the primary domain (e.g., acme.com sends from getacme.com, tryacme.com, acmehq.com). The number of domains scales with target sending volume. Postmaster recommends the right count and can either guide the user through purchasing or handle it via registrar API (Namecheap, Cloudflare Registrar).

**DNS Configuration.** SPF, DKIM, and DMARC records for every sending domain. Postmaster generates the exact records needed and either guides the user through manual setup or configures via registrar API. Continuous DNS health monitoring with alerts on misconfiguration or expiration.

**Mailbox Provisioning.** Google Workspace or Microsoft 365 accounts on each sending domain. Two to three mailboxes per domain. Each mailbox gets a real name, profile photo, and sending signature matching the user's brand from the Brand layer of the Context Structure.

**Warmup Engine.** New mailboxes cannot send volume immediately. Postmaster runs a gradual warmup sequence - starting with 5-10 emails per day, ramping to 30-50 per day over two to three weeks. Warmup emails are sent to a warmup network - either integrated with an existing warmup service (Instantly's network, Warmup Inbox) or built from Kinetiks users as the ecosystem scales. Inbox placement rate is tracked per mailbox and ramp speed adjusts based on results.

**Rotation and Sending Logic.** Outbound emails rotate across mailboxes and domains automatically. No single mailbox exceeds its daily sending limit. Smart rotation considers mailbox reputation scores, domain age, recent send volume, and time-of-day patterns. The rotation algorithm prioritizes highest-reputation mailboxes for the most important prospects (as scored by Analyst).

**Reputation Monitoring.** Continuous tracking of bounce rates, spam complaints, and deliverability scores per domain and mailbox. Integration with Google Postmaster Tools API for real domain reputation data. Auto-pause on reputation dip with Slack alert. Pre-send deliverability tests (Mail-Tester style) on campaign content to flag spam-trigger language before a single email goes out.

**SMTP Layer.** Harvest uses Amazon SES or Resend as the SMTP transport layer - reliable, cheap, excellent deliverability APIs. All intelligence - rotation, warmup, reputation, compliance - lives in Postmaster. This gives full control without the maintenance burden of raw SMTP servers.

**Driving Modes for Postmaster:**

| Mode | Behavior |
|------|----------|
| Human Drive | User sets up domains, DNS, and mailboxes manually. Postmaster provides step-by-step guidance, generates DNS records, validates configuration, and flags compliance gaps. |
| Approvals | Postmaster recommends: "You need 3 more domains for your target volume." "Mailbox sarah@getacme.com should be paused - bounce rate spiking." "This campaign needs an unsubscribe link for CAN-SPAM compliance." User approves or rejects. |
| Autopilot | Postmaster auto-purchases domains, provisions mailboxes, manages warmup, pauses/resumes on reputation data, scales infrastructure, enforces compliance automatically. User gets daily infrastructure health digests. |

## 3.2 Scout - Prospect Discovery, Verification, and Scoring

Scout reads the ICP from the Context Structure's Customers layer and goes hunting. Every prospect is enriched, verified, and scored before entering any campaign.

**Enrichment Waterfall.** Scout runs a multi-source enrichment waterfall, trying the most cost-effective source first and falling back to more expensive sources for missing data. This is the Clay model - composable data enrichment with intelligent fallback.

| Data Source | What It Provides | Use Case |
|------------|-----------------|----------|
| People Data Labs | Person search, company enrichment, contact info, employment history | Primary enrichment. Already in the stack from Bloomify. Cheapest per-record cost. |
| Apollo | Massive B2B database. Title, company size, industry, tech stack, intent | Prospect discovery when PDL is thin. Excellent for ICP-based search. |
| LinkedIn | Professional profile, activity, mutual connections, company pages, jobs | Richest professional context for Composer. Connection degree for Navigator. |
| Clearbit / 6sense | Intent data, firmographics, technographics, buyer journey stage | Intent-based prioritization. Companies actively researching solutions. |
| BuiltWith / Wappalyzer | Website technology stack - CMS, analytics, marketing tools, frameworks | Competitive displacement campaigns. "Companies using Competitor X." |
| Crunchbase | Funding rounds, investors, company stage, revenue estimates, growth | Funding signals trigger outreach. Series A/B sweet spot. |
| Job boards | Active postings by role, seniority, department. Hiring velocity. | Hiring for relevant role = buying intent. |

**Contact Verification.** Every email address is verified before it enters any campaign. Sending to invalid emails is the fastest way to destroy domain reputation. Scout runs a verification waterfall:

| Step | Action |
|------|--------|
| 1. Syntax check | Valid email format. Catch obvious typos and malformed addresses. |
| 2. MX record lookup | Domain has valid mail exchange records. Domain actually receives email. |
| 3. SMTP verification | Verify the mailbox exists without sending an email. ZeroBounce, NeverBounce, or MillionVerifier API. |
| 4. Risk scoring | Flag catch-all domains, disposable emails, role-based addresses (info@, sales@), and known spam traps. |
| 5. Deliverability grade | A/B/C/D grade per contact. Only A and B grade emails enter campaigns. C grade flagged for manual review. D grade excluded permanently. |

Verification is not a one-time check. Scout re-verifies contacts that have been in the system for 90+ days before re-engaging them. Email addresses decay at approximately 2-3% per month as people change jobs.

**Lead Scoring.** Every prospect gets a composite score from 0-100 that drives prioritization across all Operators. Higher-scored leads get Composer's best research, Navigator's most sophisticated sequences, and Concierge's fastest escalation.

| Dimension | What It Measures | Score Weight | Data Sources |
|-----------|-----------------|-------------|-------------|
| Fit | How well the prospect matches the ICP - company size, industry, role, seniority, geography | 40% | Context Structure Customers layer, enrichment data |
| Intent | Active buying signals - funding, hiring, tech changes, content engagement, news | 35% | Scout signal monitoring, Dark Madder engagement data (cross-app) |
| Engagement | Interactions with your outreach and content - opens, clicks, replies, LinkedIn engagement, call outcomes | 25% | Navigator activity tracking, Concierge reply data, Analyst patterns |

Lead scores recalculate continuously as new signals appear and engagement data accumulates. Analyst monitors score distribution and flags when scoring weights need recalibration based on actual conversion data. The Synapse promotes scoring insights - "companies with 50-200 employees convert 3x better than 200-500" - to the Customers layer of the Context Structure.

**Signal-Based Prospecting.** Beyond static ICP matching, Scout continuously monitors for buying signals - events that indicate a company is more likely to buy right now. Each signal type has a configurable weight in the lead score.

| Signal | Source | Why It Matters |
|--------|--------|---------------|
| Company raised funding | Crunchbase, news monitoring | Fresh capital = budget to spend. Series A/B sweet spot. |
| Hiring for relevant role | Job boards (LinkedIn, Indeed, Lever) | Hiring VP Marketing = need marketing tools. |
| Key person changed jobs | LinkedIn, PDL job change alerts | New leaders bring new tools. Champions at new companies. |
| Tech stack change | BuiltWith change detection | Adopted competitor = in market. Dropped competitor = looking. |
| Relevant company news | Web monitoring, news APIs | Product launches, expansions, regulatory changes create hooks. |
| Content engagement | Dark Madder Synapse (cross-app) | Visitors to your content signal interest. Warm outbound. |
| Website visit | Hypothesis Synapse (cross-app) | Prospect visited a Hypothesis landing page. High intent. |

**The Bloomify Pairing Algorithm.** For every target account, Scout identifies two contacts: the primary (decision maker) and the CC (influencer or champion). Pairing preferences read from the Context Structure's Customers layer. The algorithm scores candidates by role match, seniority fit, and activity recency, then presents the best pair per account.

**Account-Based View.** Scout maintains an account-level view for organizations with multiple contacts. It identifies the buying committee - economic buyer, champion, technical evaluator, end user - and Navigator coordinates sequences to different stakeholders with staggered timing to avoid appearing automated. Keeper shows account-level engagement aggregated across all contacts.

**Driving Modes for Scout:**

| Mode | Behavior |
|------|----------|
| Human Drive | User searches manually using ICP-based filters. Scout surfaces research, enrichment, verification results, and signal alerts. User adds to campaigns manually. |
| Approvals | Scout proposes prospect lists with reasoning: "Found 35 companies matching ICP that raised Series A. All contacts verified A-grade. Average lead score 78. Add to campaign?" User reviews and approves. |
| Autopilot | Scout continuously monitors signals, enriches, verifies, scores, and adds high-confidence prospects to campaigns. Daily digest of new prospects with the signals that triggered them. |

## 3.3 Composer - Outreach Copy and Playbooks

Composer is where Harvest should be noticeably better than anything else on the market. No other tool has the Kinetiks Context Structure - Voice, Products, Customers, Competitive, Narrative - feeding its prompts. And no other tool has a playbook library that adapts to the user's identity.

Composer now loads marketing methodology dynamically via `loadKnowledge()` from `@kinetiks/ai`. For first-touch emails, it loads `email/cold-outreach`, `email/subject-lines`, `copywriting/frameworks`, and `persona-messaging/mapping` knowledge modules. For follow-up emails, it loads `objection-handling` modules in addition to the core set. This gives Composer access to distilled marketing methodology without bloating the system prompt.

**What Composer Knows That Competitors Don't:**

| Context Source | From Context Structure | How It Improves Quality |
|---------------|----------------------|------------------------|
| Voice profile | Tone, vocabulary, sentence structure, formality, calibrated from samples | Emails sound like the user wrote them. Sentence length, humor, jargon all match. |
| Product depth | Features, differentiators, pricing, value props, roadmap signals | Specific features relevant to the prospect, not generic descriptions. |
| Customer pain points | Real pain points from CRM, buying triggers, objection patterns | Addresses real problems the persona faces, not assumptions. |
| Competitive positioning | Known competitors, positioning gaps, differentiation vectors | When Scout detects a competitor, Composer knows exactly how to position against them. |
| Brand narrative | Origin story, founder thesis, validated angles, brand arc | The "why this matters" framing gives emails emotional weight beyond feature lists. |
| Outbound learnings | Win/loss reasons, messaging that converts, objection patterns (from Analyst) | Continuously improving - every sent email and its outcome refines future output. |

**The Research Layer.** Before Composer writes a single word, it researches the prospect. This is not optional - it is what separates good outbound from spam.

- Company research: Website crawl for recent news, blog posts, product updates, team page, and positioning.
- Prospect research: LinkedIn activity - recent posts, shared content, interests, mutual connections, career trajectory.
- Tech stack: BuiltWith/Wappalyzer data. Are they using a competitor? Complementary tools?
- CRM history: Previous interactions from Keeper. Never cold-email someone with existing relationship data.
- Signal context: What triggered this outreach? Funding? Job change? This signal becomes the opening hook.
- Mutual connections: If the user shares a connection with the prospect, Composer flags the warm intro opportunity and adjusts the draft to reference the shared relationship.

**Email Architecture:**

- **First touch.** Highly personalized. References something specific about the prospect. Connects their situation to your value prop. Three to five sentences. Clear CTA that asks a question, not a meeting request. Goal is a reply, not a booking.
- **Follow-ups.** Each adds new value. Never "just following up." References new blog posts, company announcements, different value props, relevant case studies. Each follow-up gives a new reason to respond.
- **Bloomify CC mode.** Email the decision maker, CC the champion. The email makes the CC look good for surfacing this. Language acknowledges both recipients.
- **LinkedIn messages.** Shorter, more conversational. Adapted from the same research into the LinkedIn register.
- **Voice call scripts.** Conversational scripts for Navigator's ElevenLabs voice calls. Natural, warm, purpose-driven - not robotic cold call scripts. Include branching logic for common responses.

**Playbook Library.** Pre-built sequence templates for common outbound scenarios. Each playbook adapts to the user's Context Structure - same strategy, personalized to their voice, products, and customers.

| Playbook | Strategy |
|----------|----------|
| Competitive displacement | Targets companies using a specific competitor. Messaging focuses on switching triggers and differentiation vectors from the Competitive layer. |
| Funding trigger | Targets companies that just raised. Messaging ties the user's product to the growth challenges that come with scaling after a raise. |
| Job change trigger | Targets a known champion who moved to a new company. Warm outreach referencing the previous relationship and how the product could help in their new role. |
| Inbound follow-up | Targets visitors who engaged with Dark Madder content or Hypothesis landing pages. Warm outreach referencing the specific content they consumed. |
| Event follow-up | Targets attendees of a conference or webinar. References the event and connects relevant takeaways to the user's product. |
| Re-engagement | Targets cold prospects or lost deals triggered by a new signal. References the previous conversation and the new development that makes it worth reconnecting. |
| Referral request | Targets warm connections for introductions. Conversational, non-salesy, focused on the mutual connection. |

**Driving Modes for Composer:**

| Mode | Behavior |
|------|----------|
| Human Drive | User writes all copy. Composer provides research briefs and suggests improvements. Every user-written email trains the voice model. |
| Approvals | Composer drafts with full research context. User reviews individually or in batches. Edits are the most valuable training data. |
| Autopilot | Composer researches and drafts autonomously within guardrails (daily limits, topic boundaries, tone parameters). Daily digest of emails sent. |

## 3.4 Concierge - Reply Management

Concierge classifies every reply, drafts contextual responses, handles meeting scheduling, and knows exactly when to escalate. Response speed is a competitive advantage - the first vendor to reply meaningfully wins the meeting.

Concierge loads `objection-handling` knowledge via `loadKnowledge()` from `@kinetiks/ai` for objection replies, giving it access to proven objection response frameworks alongside the Competitive and Products layers from the Context Structure.

**Reply Classification Engine:**

| Classification | Action | Autopilot Eligible |
|---------------|--------|-------------------|
| Interested | Book meeting or continue conversation | Yes, once meeting pattern established |
| Objection | Tailored response using Competitive + Products layers | Late-stage - high confidence required |
| Not now | Graceful acknowledgment. Schedule re-engagement for specified timeframe. | Yes, mid-stage |
| Not interested | Graceful exit. Mark in CRM. Remove from sequence. Preserve relationship. | Yes, early - low risk |
| Wrong person | Thank them. Add referred person to Scout for enrichment. | Yes, early |
| OOO | Parse return date. Pause sequence. Auto-resume. | Yes, immediately - zero risk |
| Question | Answer using Products and Voice layers. | Mid-stage - depends on complexity |
| Meeting request | Send calendar link or propose times. Confirm when booked. | Yes, mid-stage |
| Unsubscribe | Immediate removal. Add to suppression list. Confirm removal. No exceptions. | Yes, immediately - legal requirement |

**The Escalation Engine.** Concierge must know when to stop and get the human. Escalation triggers:

- **Product gap:** Prospect mentions a use case not covered in the Products layer.
- **Pricing/contracts:** Any discussion of specific pricing, quotes, terms, or legal.
- **High-value account:** Company above the deal size threshold.
- **Negative tone:** Frustration, confusion, or hostility detected.
- **Low confidence:** Concierge's confidence in its proposed reply drops below threshold.
- **PR risk:** Any reply that could damage the brand if screenshotted.
- **Legal mention:** Any reference to lawyers, legal action, cease and desist, or regulatory bodies.

When escalating, Concierge presents the full thread, company context, classification, proposed reply with reasoning, and specific escalation reason via Slack DM.

**Meeting Booking.** Integration with Google Calendar, Cal.com, or Calendly. When a prospect says yes, Concierge proposes times or sends a booking link. If the prospect suggests a time, Concierge checks availability and confirms. When booked, Keeper auto-creates or updates the deal and advances the pipeline.

## 3.5 Navigator - Multi-Channel Orchestration

Navigator orchestrates the cross-channel sequence across email, LinkedIn, and phone - deciding when to use each channel and how to time touchpoints for maximum impact.

**LinkedIn Actions:**

| Action | Purpose | Timing |
|--------|---------|--------|
| Profile view | Visit prospect's profile. Creates familiarity via notifications. | 1-2 days before first email |
| Content engagement | Like/comment on recent posts. Builds name recognition. | Same day as profile view or day before email |
| Connection request | Personalized connection request (Composer drafts note). | After first email if no reply, or before for warm |
| Direct message | Follow-up via LinkedIn DM. Different angle than email. | Mid-sequence, after email follow-ups |
| Post monitoring | Alert or auto-engage when prospect posts something relevant. | Continuous - organic touchpoints outside sequence |

**Voice Calling - ElevenLabs Integration.** Phone is a first-class outbound channel. Navigator integrates ElevenLabs Conversational AI for intelligent voice calls that sound human, follow conversational scripts, and adapt in real time.

| Component | Details |
|-----------|---------|
| Voice model | ElevenLabs Conversational AI with a custom voice cloned from the user's voice samples (captured during Cartographer onboarding or uploaded separately). The call sounds like the user, not a generic AI voice. |
| Call types | Follow-up calls (after email sequence with no reply), qualification calls (after positive email reply to confirm interest and book meeting), re-engagement calls (for cold prospects triggered by a new signal). |
| Conversational scripts | Composer generates branching call scripts informed by the Context Structure. Opening hook tied to the prospect's signal. Product pitch adapted to their pain points. Objection handling from the Competitive layer. Meeting booking CTA. All in the user's voice. |
| Real-time adaptation | The voice agent adapts to the prospect's responses. If they mention a competitor, it pulls positioning from the Competitive layer. If they ask about pricing, it escalates to the user per Concierge rules. |
| Call intelligence | Every call is transcribed. Key moments tagged: interest signals, objections, competitor mentions, next steps. Analyst extracts patterns across calls. Transcripts logged in Keeper. |
| Telephony | Twilio VOIP for outbound calling. Caller ID shows one of the user's sending phone numbers. Calls respect timezone and business hours per Navigator's send-time engine. |
| Escalation to human | If the prospect asks to speak with a real person, or the conversation exceeds the agent's confidence, the call is immediately transferred to the user's phone (warm transfer with context summary) or the agent books a callback. |
| Voicemail | If the call goes to voicemail, the agent leaves a personalized voicemail (Composer drafts the script). Voicemail is a sequence step, not a dead end. |

Voice calling with a cloned user voice is the most aggressive autonomy feature in Harvest. It has the highest bar for Autopilot unlock. The system must demonstrate exceptional judgment in call handling, escalation, and voice quality before the user trusts it to call prospects unsupervised. Expect most users to stay in Approvals mode for voice calls for months.

**Sequence Builder.** Navigator provides a visual sequence builder for multi-step, multi-channel campaigns. A typical sequence: Day 0: LinkedIn profile view. Day 1: LinkedIn content engagement. Day 2: First email. Day 5: Follow-up email (new angle). Day 7: LinkedIn connection request. Day 10: Voice call (follow-up). Day 14: LinkedIn DM. Day 21: Final email (breakup). Each step has configurable delays, channel selection, and exit conditions (reply, meeting booked, unsubscribed, do-not-contact).

Sequences support A/B testing at any step. Navigator tracks open rates, reply rates, and positive-reply rates per variant and auto-promotes the winner after statistical significance. Analyst reports on which sequence structures perform best across all campaigns.

**Send-Time Optimization.** Navigator infers prospect timezone from location data (Scout enrichment) and optimizes send time per individual. Emails send during the prospect's business hours. Over time, Analyst detects per-persona open-time patterns and shifts send times to when each prospect is most likely to engage. This intelligence is promoted through the Synapse as aggregate patterns (e.g., "enterprise VPs open emails at 7:30am, startup founders open at 10pm").

**Re-Engagement Engine.** The outbound lifecycle does not end at "lost" or "no reply." Navigator monitors dormant prospects and lost deals for re-engagement triggers:

- **Signal-based:** Scout detects a new signal on a dormant prospect (funding, hiring, tech change, job change). Navigator auto-enrolls them in the Re-engagement playbook.
- **Time-based:** Concierge classified a reply as "not now" with a timeframe. Navigator re-engages on that date.
- **Product-based:** The user shipped a feature that a lost prospect wanted. The Synapse routes this from the Products layer, and Navigator triggers a "we built what you asked for" sequence.
- **Content-based:** A dormant prospect engages with Dark Madder content or visits a Hypothesis page. The cross-app signal triggers warm re-engagement.

**Safety and Rate Limiting.** LinkedIn: 20-25 connection requests/day, 50-80 profile views/day, 15-25 DMs/day. Timing randomized within business hours. Immediate pause on any account warning. Phone: configurable daily call limit, mandatory business hours per timezone, instant pause on any carrier complaint. All channels: global daily volume caps configurable by user. Rate limiting uses atomic RPC with per-minute AND per-day windows, with fail-open on error.

## 3.6 Keeper - CRM and Relationship Management

Keeper is a full CRM handling both outbound prospects and manually-added relationships (investors, partners, advisors, customers). Relationships are first-class data.

**Core Objects:**

| Object | Description |
|--------|-------------|
| Contacts | People. Enriched by Scout, engaged by all Operators. Full interaction history across email, LinkedIn, phone. Lead score, verification grade, tags, notes, relationship status. |
| Organizations | Companies. Firmographics, tech stack, signals, news, funding. Multiple contacts. Account-level health score aggregated across all contacts. |
| Deals | Opportunities in the pipeline. Created from outreach or manually. Linked to contacts, organizations, and the activity that led to the deal. |
| Conversations | Threaded view of all interactions (email, LinkedIn, phone transcripts, notes) with a contact. Full chronological timeline. |
| Activities | Every touchpoint: emails sent/received, LinkedIn actions, calls (with transcripts), meetings, notes, stage changes. Auto-logged and manually addable. |

**Pipeline:**

| Stage | Definition | Auto-Trigger |
|-------|-----------|-------------|
| Prospecting | Scout identified, enriched, verified, scored. Not yet contacted. | Scout adds prospect |
| Contacted | First outreach sent (email, LinkedIn, or call). | First touch sent |
| Engaged | Replied positively or booked a meeting. | Positive reply classified |
| Meeting Set | Meeting scheduled and confirmed. | Calendar booking confirmed |
| Qualified | Met, confirmed fit. | Manual (post-meeting) |
| Proposal | Sent pricing or contract. | Manual |
| Negotiation | Terms discussion. | Manual |
| Won | Closed. Win reason captured and promoted through Synapse. | Manual - win reason required |
| Lost | Did not close. Loss reason captured and promoted through Synapse. | Manual - loss reason required |

Won/lost reasons are captured via structured dropdown categories plus free text. This is the highest-value intelligence in the ecosystem. "Lost on pricing" informs Products. "Won on security feature" informs Dark Madder content, Hypothesis landing pages, and Litmus PR angles.

**BCC Conversation Tracking.** The user adds a Harvest-provided email address as BCC on any external conversation. Keeper parses the email, matches the contact, and logs the conversation. Captures sales conversations, investor updates, partner discussions - any relationship worth tracking.

**Re-Engagement Triggers.** Keeper works with Navigator's re-engagement engine. When a lost deal's loss reason matches a new product feature, or a dormant contact's organization shows a new signal, Keeper flags the record and Navigator creates the re-engagement sequence. The CRM is not just a record of the past - it is a trigger system for the future.

**Driving Modes for Keeper:**

| Mode | Behavior |
|------|----------|
| Human Drive | User manages pipeline manually. Keeper auto-logs activities but does not change stages or create deals without user action. |
| Approvals | Keeper proposes stage changes and deal creation. "Move Sarah Chen to Engaged." "Create deal for Dataflow - meeting booked." |
| Autopilot | Auto-updates pipeline, auto-creates deals from positive replies, auto-archives after configurable timeout. Daily CRM digest. |

## 3.7 Analyst - Intelligence and Reporting

Analyst is the seventh Operator. It consumes data from all six other Operators and produces actionable intelligence - campaign analytics, revenue attribution, pattern detection, and the insights that get promoted through the Synapse.

**Campaign Analytics:**

| Report | Metrics |
|--------|---------|
| Campaign performance | Emails sent, open rate, reply rate, positive reply rate, meeting rate, calls made, call connection rate, qualification rate, per campaign |
| Sequence analytics | Per-step conversion: where prospects advance, where they drop off. Which step and channel converts. Sequence-level funnel visualization. |
| Channel comparison | Email vs. LinkedIn vs. phone conversion rates. Which channel works best for which persona, seniority, industry. |
| A/B test results | Variant performance with statistical significance indicators. Auto-promote recommendations. |
| Content performance | When Dark Madder content is used in sequences, which pieces drive engagement and replies. Which case studies convert. |
| Time analytics | Best send times by persona, best days of week, timezone performance, response speed correlation with conversion. |

**Revenue Attribution.** Every deal in Keeper's pipeline is attributed back to the campaign, sequence, specific message, and channel that generated it. Analyst produces revenue attribution showing: pipeline generated per campaign, closed revenue per campaign, cost per meeting (enrichment credits + email infrastructure), cost per deal, and ROI by channel. This is the data that proves Harvest's value and informs budget allocation.

**Pattern Detection.** Analyst continuously mines the data for patterns that no human would notice at scale:

- **Messaging patterns:** "Security-focused subject lines have 2.3x higher open rates with enterprise prospects."
- **ICP patterns:** "Companies with 50-200 employees convert at 3x the rate of 200-500."
- **Timing patterns:** "Follow-up calls on day 3 after email have 4x the connection rate of day 7."
- **Channel patterns:** "LinkedIn DM after email follow-up increases reply rate by 40% for VP-level prospects."
- **Objection patterns:** "Pricing objection appears in 30% of enterprise replies. When handled with the ROI angle, 60% convert to meeting."

These patterns are the richest intelligence the Synapse promotes to the Cortex. They directly improve every other Kinetiks app.

**Driving Modes for Analyst.** Analyst is unique among Operators in that most of its functions are inherently data-driven and can reach Autopilot quickly. Pattern detection, send-time optimization, and A/B test auto-promotion are safe to automate early because they do not involve external communication. Reporting is always on. The only function with a higher bar is automated recommendations that change other Operators' behavior (e.g., "Analyst detected that your ICP should shift to target smaller companies" - this requires Approvals until the user trusts the model).

---

# 4. Compliance and Legal

Compliance is not optional. It is not a feature. It is a legal requirement. Every email, every call, every message Harvest sends must be compliant with applicable law. Harvest must be elite-tier on compliance - the user should never have to think about it because the system handles it.

## 4.1 CAN-SPAM (United States)

- **Accurate headers:** From name, reply-to address, and routing information must be accurate. Postmaster enforces this for every mailbox.
- **Non-deceptive subject lines:** Composer flags subject lines that could be considered misleading. No false urgency, no fake RE: or FWD: prefixes.
- **Physical address:** Every commercial email must include the sender's valid physical postal address. Postmaster auto-appends this to every email signature using the Org layer of the Context Structure.
- **Unsubscribe mechanism:** Every email includes a clear, conspicuous unsubscribe link. One-click unsubscribe via List-Unsubscribe header (RFC 8058). Unsubscribe requests processed within 24 hours (Harvest processes them instantly).
- **Opt-out honoring:** Once a recipient unsubscribes, they are added to the global suppression list immediately. No further commercial email, ever. This is enforced at the Postmaster level - even Autopilot cannot override a suppression.

## 4.2 GDPR (European Union / UK)

- **Legitimate interest basis:** B2B cold outreach in the EU generally relies on the "legitimate interest" legal basis under GDPR Article 6(1)(f). Harvest documents the legitimate interest assessment per campaign. The user must confirm the business relevance of each campaign to the target audience.
- **Right to object:** Every email to EU/UK recipients includes a clear mechanism to object to processing. Concierge processes objections instantly. The contact is added to a GDPR-specific suppression list.
- **Data minimization:** Scout collects only the data necessary for the outreach purpose. Enrichment data that is not relevant to the campaign is not stored.
- **Data subject access requests:** If a prospect requests their data, Keeper can generate a complete export of all data held about them. If they request deletion, all data is purged from Harvest and a permanent suppression entry is created.
- **Geographic detection:** Scout enrichment includes geographic data. When a prospect is identified as EU/UK-based, Postmaster automatically applies GDPR-specific email formatting and Concierge applies GDPR-specific response handling.

## 4.3 CCPA (California)

- **Right to opt out:** California residents have the right to opt out of the sale or sharing of personal information. Harvest's unsubscribe mechanism doubles as the opt-out mechanism.
- **Right to delete:** Same as GDPR deletion - complete purge plus permanent suppression.
- **Privacy notice:** A link to the user's privacy policy is included in the email signature for California-targeted campaigns.

## 4.4 TCPA (Phone Calls, United States)

- **Do-Not-Call compliance:** Before any voice call, Navigator checks the prospect's number against the National Do-Not-Call Registry (FTC DNC list). Numbers on the list are blocked from calling.
- **AI disclosure:** At the beginning of every ElevenLabs voice call, the AI agent discloses that the call is AI-assisted. This is a legal requirement in multiple jurisdictions and a trust-building measure. The disclosure is natural and brief: "Hi, this is [name]'s AI assistant calling on their behalf."
- **Business hours:** Calls are only placed during permitted hours in the prospect's timezone (generally 8am-9pm local). Navigator enforces this automatically.
- **Consent management:** If a prospect says "don't call me again," the number is immediately added to the suppression list. No further calls, ever.

## 4.5 The Suppression System

Harvest maintains a multi-layer suppression system that prevents any outreach to contacts who should not be contacted:

| Suppression Layer | Source and Behavior |
|------------------|-------------------|
| Global email suppression | Unsubscribe clicks, manual opt-outs, bounce-backs (hard bounces). Permanent. Cannot be overridden by any Operator or driving mode. |
| Global phone suppression | Verbal opt-outs during calls, DNC registry matches, carrier complaints. Permanent. |
| GDPR suppression | Right-to-object and right-to-delete requests. Permanent. Includes full data deletion. |
| Domain suppression | User-configured list of domains to never contact (own company, partners, investors, competitors they do not want to antagonize). |
| Contact suppression | Individual contacts the user manually marks as do-not-contact. Preserved across all campaigns. |
| Bounce suppression | Hard-bounced email addresses. Auto-added after bounce. Prevents repeat sends to invalid addresses. |

The suppression system is checked before every single outreach action - every email send, every LinkedIn message, every phone call. It operates at the Postmaster/Navigator level and cannot be bypassed. Even in full Autopilot, a suppressed contact is never contacted.

---

# 5. Notification Channels

Harvest communicates with users through multiple channels. The approval protocol (Section 1.5) is channel-agnostic - every approval, digest, escalation, and win can flow through any configured channel. Human users typically use Slack and the dashboard. Agent users typically use webhooks and API polling. All channels are equal - they read from and write to the same approval records.

## 5.1 Slack (Human Users)

Slack is the primary command center for human users operating Harvest.

| Channel | Purpose |
|---------|---------|
| #harvest-approvals | Everything waiting for user action. Prospect lists, draft emails, reply approvals, call script reviews. Each with full context + approve/edit/reject buttons (Slack Block Kit). |
| #harvest-activity | Digest of autonomous actions. Scout added prospects, Concierge booked meetings, Postmaster paused a mailbox, Navigator completed a call. |
| #harvest-wins | Meetings booked, deals created, positive replies. Company context and the sequence that led to the win. |
| DM from Harvest | Urgent escalations. High-value prospect replied. Deliverability crisis. Call escalation request. Time-sensitive items only. |

Slash commands: /harvest status (calls GET /api/harvest/daily-brief), /harvest approve [id] (resolves via the approval API), /harvest pause [campaign] (pauses a campaign), /harvest prospect [company] (quick-add for Scout). Marcus surfaces cross-app insights in #harvest-activity.

## 5.2 Webhooks (Agent Users)

Agent users configure webhook URLs at id.kinetiks.ai/settings/webhooks (or via POST /api/settings/webhooks). They subscribe to specific event types and receive push notifications as they happen.

| Event Category | Events |
|---------------|--------|
| Approvals | approval.created - full context, draft preview, Sentinel verdict, and a resolve_url for the agent to respond to. |
| Deals | deal.won, deal.lost, deal.stage_changed - with full deal context and win/loss reason. |
| Campaigns | campaign.completed, campaign.paused - with campaign stats. |
| Meetings | meeting.booked - with contact and calendar details. |
| Replies | reply.received, reply.classified - with classification, sentiment, proposed response. |
| Infrastructure | mailbox.health_alert, mailbox.paused - with reputation data and recommended action. |
| Intelligence | daily_brief.generated - full daily snapshot pushed instead of pulled. |

Webhook payloads are signed with HMAC-SHA256 using the configured secret. Delivery includes retry logic (3 attempts with exponential backoff). Webhooks auto-disable after 10 consecutive failures.

## 5.3 API Polling (Agent Users)

For agents that prefer pull over push, every notification is also available via API: GET /api/approvals?status=pending returns all pending approvals. GET /api/harvest/daily-brief returns the daily snapshot. GET /api/concierge/inbox returns classified replies. The agent polls these endpoints on its own schedule and resolves actions via POST /api/approvals/{id}/resolve.

## 5.4 Dashboard (All Users)

The dashboard at hv.kinetiks.ai is the visual interface for all notifications. It reads from the same API endpoints that agent users call directly. The approval queue on the dashboard is the same data as GET /api/approvals?status=pending. Clicking "Approve" calls the same POST /api/approvals/{id}/resolve endpoint that an agent calls via API.

---

# 6. The Harvest Synapse

The Harvest Synapse is the membrane between Harvest's seven Operators and the shared Kinetiks ID. It pulls context from the Cortex and distributes to Operators. It collects intelligence and promotes the cross-cutting learnings to the Cortex via Proposals.

Harvest Operators now leverage the shared knowledge system at `packages/ai/src/knowledge/` for marketing methodology injection. Knowledge modules are loaded dynamically at generation time via `loadKnowledge()` from `@kinetiks/ai`, keeping system prompts lean while giving Operators access to distilled marketing methodology (cold outreach best practices, subject line frameworks, copywriting patterns, objection handling, persona messaging). See `docs/KNOWLEDGE_INTEGRATION.md` for the full Harvest operator-to-intent mapping.

## 6.1 Context Distribution

| Operator | Receives From Context Structure | When |
|----------|-------------------------------|------|
| Scout | Customers (ICP), Products, Competitive | Every search, signal evaluation, list build |
| Composer | Voice, Products, Customers, Narrative, Competitive | Every draft (email, LinkedIn, call script) |
| Concierge | Products, Competitive, Voice | Every reply classification and response |
| Navigator | Customers (channels, engagement patterns) | Sequence creation, channel selection, call scheduling |
| Keeper | Customers (segments), Competitive | Deal creation, pipeline analysis |
| Analyst | All layers (for pattern context) | Reporting, pattern detection, attribution |

## 6.2 What Gets Promoted

| Intelligence Type | Target Layer | Downstream Impact |
|------------------|-------------|-------------------|
| Messaging that converts | Voice, Products, Narrative | DM writes with validated angles. Hypothesis tests converting headlines. |
| ICP refinements | Customers | All apps refine targeting. DM writes for real audience. |
| Objection patterns | Products, Competitive | DM creates objection content. Hypothesis builds FAQ sections. |
| Competitive intelligence | Competitive | All apps update positioning language. |
| Win/loss reasons | Products, Customers, Competitive | Highest-value intelligence. Informs content, pages, PR, product. |
| Channel effectiveness | Customers | Which personas prefer which channels. Informs all outreach. |
| Call intelligence | Voice, Customers, Competitive | Objections heard on calls, language prospects use, competitor mentions. |
| Send-time patterns | Customers | Aggregate timing intelligence benefits email and content scheduling. |
| Revenue attribution | Products, Market | Which features drive revenue. Market demand signals. |

## 6.3 What Stays Inside Harvest

Individual prospect records and enrichment data. Email thread contents and drafts. Call transcripts (summaries promoted, raw transcripts stay). Sequence configs and A/B variants. Pipeline positions and deal stages. Mailbox reputation and warmup state. LinkedIn connection status. Individual approval decisions (aggregated patterns promoted, not individual data points). Suppression lists (sacred, never shared).

---

# 7. Database Schema

All Harvest tables use the hv_ prefix in the shared Kinetiks Supabase project. RLS scopes all data to the authenticated user's kinetiks_id.

| Table | Key Fields |
|-------|-----------|
| hv_contacts | id, kinetiks_id, org_id, first_name, last_name, email, phone, linkedin_url, title, seniority, role_type (primary/cc), source, enrichment_data (JSONB), verification_grade (A/B/C/D), lead_score, tags, notes, suppressed, suppression_reason, created_at, updated_at |
| hv_organizations | id, kinetiks_id, name, domain, industry, employee_count, funding_stage, tech_stack (JSONB), signals (JSONB), enrichment_data (JSONB), health_score, account_contacts_count, created_at, updated_at |
| hv_deals | id, kinetiks_id, contact_id, org_id, stage, value, currency, win_reason, loss_reason, notes, attribution_campaign_id, attribution_sequence_id, attribution_channel, created_at, updated_at, closed_at |
| hv_sequences | id, kinetiks_id, name, steps (JSONB - channel, delay, template, variants per step), status, stats (JSONB), playbook_type, created_at |
| hv_emails | id, kinetiks_id, contact_id, sequence_id, campaign_id, step_number, mailbox_id, subject, body, cc_contact_id, status (draft/sent/opened/replied/bounced), sent_at, opened_at, replied_at, reply_classification, thread_id |
| hv_calls | id, kinetiks_id, contact_id, sequence_id, campaign_id, step_number, phone_from, phone_to, duration_seconds, status (scheduled/ringing/connected/voicemail/failed/completed), transcript (TEXT), key_moments (JSONB), outcome, scheduled_at, started_at, ended_at |
| hv_activities | id, kinetiks_id, contact_id, org_id, deal_id, type (email_sent/email_received/linkedin_view/linkedin_connect/linkedin_message/call/meeting/note/stage_change), content (JSONB), created_at |
| hv_mailboxes | id, kinetiks_id, email, display_name, domain_id, provider, warmup_status, warmup_day, daily_limit, reputation_score, is_active, last_health_check |
| hv_domains | id, kinetiks_id, domain, registrar, dns_status (JSONB), health_score, created_at |
| hv_campaigns | id, kinetiks_id, name, sequence_id, prospect_filter (JSONB), status, stats (JSONB), created_at |
| hv_confidence | id, kinetiks_id, operator, function_name, mode, total_decisions, agreement_rate, outcome_score, last_calculated, unlock_eligible |
| hv_suppressions | id, kinetiks_id, email, phone, type (email_unsub/phone_dnc/gdpr/domain/manual/bounce), reason, created_at. PERMANENT. No delete endpoint. |
| hv_analytics | id, kinetiks_id, campaign_id, sequence_id, period (day/week/month), metrics (JSONB - sends, opens, replies, positive_replies, meetings, calls, connections, pipeline_value, closed_value), calculated_at |

---

# 8. User Experience

Harvest at hv.kinetiks.ai is a pure product experience. No billing, integrations, or account settings - those live in the Kinetiks ID. The floating pill provides ecosystem access. Harvest is focused entirely on outbound.

## 8.1 Navigation

| Section | URL | Primary Operator |
|---------|-----|-----------------|
| Dashboard | hv.kinetiks.ai/ | All - pipeline, campaigns, approvals, activity, confidence, infra health |
| Prospects | hv.kinetiks.ai/prospects | Scout - search, filter, import, enrichment, scoring, verification |
| Campaigns | hv.kinetiks.ai/campaigns | Navigator - sequences, active campaigns, analytics |
| Compose | hv.kinetiks.ai/compose | Composer - draft emails, review AI drafts, CC mode, LinkedIn, call scripts |
| Inbox | hv.kinetiks.ai/inbox | Concierge - unified inbox, classified replies, escalations |
| Calls | hv.kinetiks.ai/calls | Navigator - call queue, transcripts, scheduled calls, call analytics |
| Pipeline | hv.kinetiks.ai/pipeline | Keeper - kanban, deal details, won/lost analysis |
| Contacts | hv.kinetiks.ai/contacts | Keeper - directory, organizations, conversations, relationships |
| Analytics | hv.kinetiks.ai/analytics | Analyst - all reports, attribution, patterns, recommendations |
| Infra | hv.kinetiks.ai/infra | Postmaster - domains, mailboxes, warmup, deliverability, compliance |
| Settings | hv.kinetiks.ai/settings | Driving modes, daily limits, escalation rules, calendar, Slack, voice config |

---

# 9. Build Plan

Harvest is built after id.kinetiks.ai and the Dark Madder migration. Bloomify logic ports into the new architecture. The expanded scope (voice calling, compliance, analytics, verification) extends the build to 24 days.

Prerequisite: apps/id/ through Phase 7 (Synapse template). Dark Madder migration complete.

| Day | Phase | Delivers | Operators |
|-----|-------|---------|-----------|
| 1-2 | Scaffold + Auth | Next.js app, shared auth, hv_ tables, RLS, floating pill, navigation shell | Infrastructure |
| 3-4 | Scout + Enrichment | PDL port, enrichment waterfall, ICP filters from CS, pairing algorithm, prospect UI | Scout |
| 5-6 | Verification + Scoring | ZeroBounce integration, verification waterfall, lead scoring engine, score-based prioritization | Scout, Analyst |
| 7-8 | Composer + Email Gen | Claude integration port, research layer, Context Structure prompts, CC mode, playbook templates | Composer |
| 9-10 | Postmaster + Compliance | Domain management, DNS, warmup, rotation, SES/Resend, reputation monitoring, suppression system, CAN-SPAM/GDPR/CCPA compliance | Postmaster |
| 11-12 | Navigator + Sequences | Visual sequence builder, multi-channel campaigns, A/B testing, LinkedIn integration, send-time optimization | Navigator |
| 13-14 | Voice Calling | ElevenLabs integration, Twilio VOIP, call scripts from Composer, real-time adaptation, transcription, voicemail, escalation/transfer | Navigator, Composer |
| 15-16 | Concierge + Inbox | Unified inbox, classification engine, auto-response, meeting booking, escalation engine, OOO handling | Concierge |
| 17-18 | Keeper + CRM | Contacts, organizations, pipeline kanban, deals, activity timeline, BCC parsing, re-engagement triggers, CSV import | Keeper |
| 19-20 | Analyst + Analytics | Campaign/sequence/channel analytics, revenue attribution, pattern detection, send-time learning, confidence scoring engine | Analyst |
| 21-22 | Driving Modes + Slack | Per-function mode management, unlock mechanism, confidence dashboard, Slack app (channels, approvals, slash commands, escalations) | All |
| 23-24 | Synapse + Integration Test | Harvest Synapse, promote/keep logic, end-to-end flow test, cross-app Proposal test, compliance audit, deliverability validation | Synapse |

## 9.1 What This Produces

After 24 days of focused Claude Code work, hv.kinetiks.ai is a complete outbound engine. A user signs up via Kinetiks ID, goes through Cartographer onboarding, lands in Harvest with full context, sets up sending infrastructure, builds verified and scored prospect lists, sends multi-channel sequences (email, LinkedIn, voice calls) with AI-drafted copy in their voice, manages replies with intelligent classification, books meetings, tracks deals in a proper CRM, watches the system earn autonomy function-by-function, and receives rich analytics on what is working and why. Everything Harvest learns flows back through the Synapse to make every other Kinetiks app smarter. And every email, call, and message is fully compliant with CAN-SPAM, GDPR, CCPA, and TCPA.

---

# 10. Acceptance Criteria

**Authentication:** Shared Kinetiks auth works via session cookie, `kntk_` API key, AND internal service secret. Floating pill renders and functions. No billing/settings pages in Harvest. All three auth methods resolve to the same kinetiks_id. Rate limiting enforced per API key using atomic RPC with per-minute AND per-day windows, fail-open on error.

**Scout:** Enrichment matches Bloomify accuracy. Pairing algorithm correct. Verification waterfall catches invalid emails. Lead scoring produces meaningful prioritization.

**Composer:** Email quality matches or exceeds Bloomify. Context Structure produces noticeably better personalization. Research briefs accurate. CC mode works. Call scripts are natural and voice-appropriate.

**Postmaster:** Domain setup accurate. DNS validation catches misconfigurations. Warmup ramps correctly. Rotation respects limits. Reputation monitoring detects issues.

**Navigator:** Sequences multi-step multi-channel. LinkedIn within safety limits. Voice calls connect via Twilio, sound human via ElevenLabs, escalate correctly, leave voicemails. Send-time optimization functional.

**Concierge:** Classification accurate across all nine categories. Auto-responses maintain voice. Meeting booking end-to-end. Escalation triggers correctly. Unsubscribes processed instantly.

**Keeper:** Pipeline kanban with drag-and-drop. Auto-triggers work. Win/loss captured and promoted. BCC parsing works. Re-engagement triggers fire.

**Analyst:** Campaign analytics accurate. Revenue attribution traces deals to campaigns. Pattern detection surfaces actionable insights. Send-time optimization produces measurable improvement.

**Driving Modes:** All three modes per-Operator per-function. Confidence scoring correct. Unlock prompts at threshold. Downgrade works. Agent users can start in Approvals with quality score trend monitoring.

**Compliance:** Every email CAN-SPAM compliant (physical address, unsubscribe). GDPR formatting auto-applied to EU prospects. DNC checked before calls. AI disclosure at call start. Suppression system cannot be bypassed. Deletion/export requests handled.

**Synapse:** Proposals pass Cortex evaluation. Routed learnings arrive and distribute. Win/loss propagates. Call intelligence promotes.

**Notification Channels:** Slack channels function. Approval buttons work. Slash commands respond. Escalation DMs arrive. Webhook delivery succeeds with valid HMAC signature. API polling returns correct pending approvals. Resolution from ANY channel (dashboard, Slack, webhook, API) produces the same downstream result.

**Knowledge system:** Every generation operator (Composer, Concierge) loads relevant marketing methodology via `loadKnowledge()` before generating content. Verify methodology content appears in system prompts.

**Sentinel integration:** Every outbound content piece (email, call script, LinkedIn message) passes through Sentinel review at id.kinetiks.ai/api/sentinel/review before delivery. Verify sentinel_verdict, sentinel_flags, and sentinel_quality_score are stored on hv_emails and hv_calls records.

**Agent-Native Architecture (non-negotiable):**

- Every API route returns the standard envelope: `{success, data, error, details, meta}`. No HTML responses. No redirects from mutation endpoints.
- API key authentication works on every endpoint. A `kntk_` key with read-write permissions and "hv" scope can do everything a logged-in human can do via the dashboard.
- Read-only API keys can access all GET endpoints but receive 403 on POST/PATCH/DELETE.
- Channel-agnostic approvals: create an approval, verify it appears via GET /api/approvals. Resolve via API with Bearer kntk_ auth. Verify the action executes identically to a Slack or dashboard resolution.
- Webhook delivery: configure a webhook, trigger an approval, verify the webhook receives the HMAC-signed payload. Trigger a deal.won event, verify the webhook receives it.
- Convenience endpoints: GET /api/harvest/daily-brief returns pipeline, approvals, activity in one call. GET /api/harvest/prospect/{id}/full returns everything about a prospect. GET /api/approvals/summary returns grouped counts.
- Rate limiting: Uses atomic RPC with per-minute AND per-day windows, with fail-open on error. 61 requests in 60 seconds with a 60/min key returns 429 on the 61st.
- Sentinel cannot be bypassed via API. Even with admin API key in full Autopilot, Sentinel reviews every external action before execution.
