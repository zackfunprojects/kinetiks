# Kinetiks Terminal

**Product Spec v2.0**
**The command center for growth.**

---

## Vision

Kinetiks Terminal is how you use Kinetiks. It is the unified interface for the entire platform - Harvest, Dark Madder, Litmus, and Hypothesis - delivered as a terminal-style web application where you describe what you need and the system executes it.

It is not a CLI. It is not a chatbot. It is a command center that combines the speed and directness of a terminal with the intelligence of an AI layer that understands growth. You never need to memorize a command. You never need to learn growth terminology. You type what you want in plain language, and the Operators figure out the rest.

**Target user:** The builder who shipped their product with Claude Code, Cursor, or Replit - and now needs to grow it. They are comfortable in a terminal. They understand structured workflows. They do not want to learn HubSpot. They want to describe what they need and watch it happen.

**Tagline:** You built the app. Now grow it.

---

## Product Principles

### 1. Prompt-First

The prompt is the center of gravity. Not dashboards, not navigation, not chrome. The prompt. Everything else is output around it. The user who doesn't know growth doesn't know which tool to use or which command to type. They just know they need customers. The prompt meets them there.

### 2. Three Input Modes, Natural Gradient

The prompt accepts three input types, and users naturally flow between them based on comfort:

- **Natural language** (entry point) - "I need to find my first 50 customers." The AI router handles everything. This is where most users start and many stay.
- **Contextual actions** (discovery) - After every response, ephemeral shortcuts appear (`[C] Create campaign`, `[V] View list`). One keypress to act. These teach users what's possible by showing relevant next steps in context. The command palette (Ctrl+K) offers broader discovery.
- **Direct commands** (speed) - Structured syntax for power users. `harvest.campaign.new --audience saas-nyc --touches 3`. The fastest path for someone who knows exactly what they want.

The graduation path: natural language → contextual actions teach the vocabulary → natural language with sharper intent → direct commands for speed. The prompt is always the front door.

### 3. Speed is Sacred

Every interaction is instant or streaming. No page loads. No spinners. No waiting for a dashboard to render before you can act. Navigation happens in one frame. AI responses stream character-by-character. The UI responds to input in milliseconds. The speed IS the experience.

### 4. Keyboard-First, Mouse-Optional

The entire interface is navigable without a mouse. Tab, arrow keys, shortcut keys, slash commands, Enter to confirm, Esc to back out. Mouse works everywhere but is never required.

### 5. The System Teaches

The target user doesn't know growth. The Terminal doesn't just execute - it explains, nudges, and teaches through use. Every result includes enough context to learn from. Proactive suggestions surface when momentum stalls. The help system is conversational and references your actual data. Kinetiks is the growth co-founder you can't afford to hire.

### 6. Progressive Disclosure

The Terminal never overwhelms. Responses show what matters now. Details expand on demand. Contextual actions offer 3-6 next steps, not 20. The AI layer only surfaces what is relevant to your current intent. Advanced features are discoverable through the command palette and `help`, but never in your face.

---

## Architecture

### System Position

```
                    ┌──────────────────┐
                    │   id.kinetiks.ai │
                    │   (account hub)  │
                    │   billing, team, │
                    │   API keys       │
                    └────────┬─────────┘
                             │ auth + account
                             │
┌────────────────────────────┼─────────────────────────────┐
│                 KINETIKS TERMINAL                         │
│      (terminal.kinetiks.ai / desktop app)                │
│                                                           │
│   ┌────────────┐  ┌───────────┐  ┌────────────────┐     │
│   │  Natural   │  │ Contextual│  │    Direct      │     │
│   │  Language  │  │  Actions  │  │    Commands    │     │
│   └─────┬──────┘  └─────┬─────┘  └──────┬─────────┘     │
│         └───────────┬───┴───────────────┘                 │
│                     │                                      │
│             ┌───────▼────────┐                            │
│             │  Intent Router  │                            │
│             └───────┬────────┘                            │
│                     │                                      │
│             ┌───────▼────────┐                            │
│             │   Execution    │                            │
│             │   Engine       │                            │
│             └───────┬────────┘                            │
│                     │                                      │
└─────────────────────┼────────────────────────────────────┘
                      │
       ┌──────────────┼──────────────────┐
       │              │                  │
  ┌────▼────┐  ┌──────▼────┐  ┌─────────▼───┐  ┌───────────┐
  │ Harvest │  │Dark Madder│  │   Litmus    │  │Hypothesis │
  │hv.kntk  │  │dm.kntk   │  │  lt.kntk   │  │ hp.kntk   │
  └────┬────┘  └──────┬────┘  └──────┬──────┘  └─────┬─────┘
       │              │              │                │
       └──────────────┴──────────┬───┴────────────────┘
                                 │
                        ┌────────▼────────┐
                        │   Kinetiks ID   │
                        │ (shared context │
                        │  + Supabase)    │
                        └─────────────────┘
```

### Technical Foundation

- **Web application** built with Next.js, deployed at terminal.kinetiks.ai
- **Desktop application** via Tauri wrapping the same Next.js app, with native tray, notifications, global hotkey, and offline queue (see Desktop App in Product Ecosystem)
- **TUI rendering** via a custom React terminal component - not xterm.js. We need full control over rendering, theming, interactive widgets, and the ability to mix monospace and proportional type.
- **WebSocket connection** for streaming responses and real-time status
- **Kinetiks ID authentication** via shared .kinetiks.ai session cookie. Per-app subscription status determines which capabilities are active. Account and billing management routes to id.kinetiks.ai.
- **Intent Router** powered by an LLM with the full Kinetiks context structure
- **Supabase backend** using the shared Kinetiks project with kntk_terminal-prefixed tables for session state, command history, user preferences, saved workflows, and Playbook definitions
- **Session persistence** via Supabase - all in-progress workflows, pending reviews, and Terminal state survive tab close and resume on return

### The Intent Router

The Intent Router is the brain of the Terminal. It receives all input and determines the execution path.

For contextual actions and direct commands, routing is deterministic - the input maps directly to an API call.

For natural language, the router:

1. Classifies which app(s) are needed (Harvest, Dark Madder, Litmus, Hypothesis, or cross-app)
2. Extracts entities (campaign names, audience definitions, channels, content references)
3. Checks confidence against the Kinetiks ID context layers
4. Either executes (high confidence), asks a clarifying question (low confidence), or explains what context is missing (very low confidence)
5. Returns structured results with contextual actions

The router uses the Kinetiks ID confidence weights to calibrate its behavior. If Voice confidence is below 60%, it asks for more brand context before composing outreach. If Customer confidence is high, it can auto-segment audiences without asking. If a request spans multiple apps and confidence varies across them, it executes the high-confidence portions and asks about the rest.

### Continuous Learning

Every interaction with the Terminal feeds back into the Kinetiks ID:

- **Approving outreach copy** increases Voice confidence - the system learns what sounds right
- **Rejecting or editing copy** teaches what doesn't work - more valuable than approval
- **Campaign performance data** sharpens Customer context - the system learns who responds
- **Content engagement** refines Narrative context - the system learns what resonates
- **Test results** update Market context - the system learns what converts

This happens silently. The user never fills out a form or answers a survey. The system watches the outcomes of its own work and gets better. The Kinetiks ID confidence scores are a live dashboard of this learning.

### Context Persistence Across Subscription Changes

The Kinetiks ID belongs to the user, not to any individual app. When an app is cancelled, all context learned through that app persists in the ID. If someone built strong Voice confidence through Dark Madder content work and then cancels Dark Madder, that Voice confidence stays. If they resubscribe later, the system picks up where it left off with no degradation.

When an app is added, the existing ID context immediately benefits the new app. A user who built deep Customer context through Harvest campaigns will see Litmus leverage that same context for journalist targeting on day one - no ramp-up period.

The only context that degrades is time-sensitive data tied to a cancelled app's active operations (campaign performance trends, draft states, pending pitches). Historical patterns and learned preferences are permanent.

---

## Product Ecosystem

### Independent Apps, Shared Identity

Kinetiks is a family of independent growth apps - Harvest, Dark Madder, Litmus, and Hypothesis - that share a common identity layer (Kinetiks ID) and a common intelligence backbone. Each app is a standalone product. Each can be discovered, evaluated, purchased, and used independently. A founder who finds Harvest through a blog post and signs up at hv.kinetiks.ai never needs to know the Terminal exists. They get a complete outreach product that works on its own.

This is the Adobe Creative Cloud model, not the ChatGPT model. Photoshop is a real product. Illustrator is a real product. You can buy one without the other. But they share an Adobe ID, and Creative Cloud is the hub that connects them. The more apps you have, the more the hub does for you.

Kinetiks Terminal is Creative Cloud. It's the free hub that unifies whichever apps you subscribe to, adds cross-app intelligence, and becomes more powerful with each app you connect. With one app, it's a faster interface. With two, it starts connecting data. With all four, it's a growth command center.

### How Users Arrive

There are two entry paths into the Kinetiks ecosystem:

**Path 1: App-first (most common).** A founder discovers Harvest through content, a referral, or search. They sign up at hv.kinetiks.ai. This creates a Kinetiks ID - the shared identity - even though they only know about Harvest. They use Harvest's web app as a standalone product. Over time, through in-app prompts, the Kinetiks marketing site, or word of mouth, they discover the Terminal or other apps. When they visit terminal.kinetiks.ai, their Kinetiks ID is already there. Harvest is already connected. They can start using the Terminal immediately with one app active.

**Path 2: Terminal-first (power users).** A builder discovers Kinetiks through the Terminal's marketing ("You built the app. Now grow it."). They sign up at terminal.kinetiks.ai, creating a Kinetiks ID. The Terminal is empty - no apps connected. The onboarding flow introduces the apps and guides them to subscribe to whichever ones fit their needs. The Terminal becomes their home base from day one.

Both paths create a Kinetiks ID. Both paths lead to the same ecosystem. The difference is which door they walk through first.

### Subdomain Architecture

```
kinetiks.ai              Marketing site and docs
terminal.kinetiks.ai     The Terminal (free hub)
id.kinetiks.ai           Account hub (billing, subscriptions, team, API keys)
hv.kinetiks.ai           Harvest (standalone web app)
dm.kinetiks.ai           Dark Madder (standalone web app)
lt.kinetiks.ai           Litmus (standalone web app)
hp.kinetiks.ai           Hypothesis (standalone web app)
api.kinetiks.ai          Public API
mcp.kinetiks.ai          MCP server for AI coding tools
```

All subdomains share authentication via the .kinetiks.ai session cookie. Moving between any of them is seamless - one login, no re-authentication.

Each app subdomain is a fully functional standalone product with its own UI, its own navigation, its own onboarding. The Terminal is not required to use any app. But each app's web UI includes a subtle "Open in Terminal" affordance for users who have the Terminal connected.

### Kinetiks ID Portal (id.kinetiks.ai)

The ID portal is the centralized account and billing hub. Every Kinetiks user has one, whether they use one app or all four plus the Terminal.

**Subscriptions and billing:**
- View all active app subscriptions in one place
- Add or remove apps (subscribe to Litmus, cancel Hypothesis)
- Per-app pricing - each app has its own plan and billing cycle
- Payment method management, invoices, usage
- Bundle pricing available (discount for 2+, 3+, all 4)

**Account management:**
- Profile and Kinetiks ID settings
- Connected accounts (LinkedIn, Google, Twitter/X, Slack) - shared across all apps
- API keys (kntk_ prefixed) - scoped per app or ecosystem-wide
- Security (password, 2FA, session management)
- Team management (invite members, assign per-app access) - future
- Data and privacy (export, delete)
- Kinetiks ID context overview (read-only view of confidence scores)

**The billing model:**
- Each app bills independently: Harvest $X/mo, Dark Madder $Y/mo, etc.
- The Terminal is free - always
- id.kinetiks.ai is the single place to manage all subscriptions
- Users who subscribe through an individual app's site are still billed through the central portal
- Bundle incentives encourage multi-app adoption without requiring it

### The Terminal's Relationship to Apps

The Terminal is free. Its value scales with how many apps you connect.

**Zero apps:** The Terminal is an empty hub. You can run the Cartographer to build your Kinetiks ID context, but you can't execute any growth actions. The experience guides you toward subscribing to your first app. This is not a dead end - it's an onboarding funnel.

**One app:** The Terminal becomes a faster interface for that app. You get natural language access to all its features, keyboard-driven navigation, the teaching layer, and the momentum system. You also see where the other apps would plug in - grayed-out but visible, showing what's possible. The cross-app recommendations reference apps you don't have yet as natural upsell moments.

**Two to three apps:** Cross-app intelligence activates. The Terminal starts connecting data between apps (content fueling outreach, outreach signals informing content strategy). Playbooks that span your active apps become available. The value of the Terminal becomes obvious.

**All four apps:** Full power. Every Playbook, every cross-app flow, every recommendation engine running at full capacity. The Growth Pulse synthesizes everything. The system compounds intelligence across all four growth levers.

### How Unsubscribed Apps Appear

There are no grayed-out menu items or disabled buttons. The Terminal handles unsubscribed apps through intelligent responses at the prompt. When a user tries to access functionality from an app they don't have, the Terminal explains what app handles it, highlights the cross-app value with their existing apps, and offers a path to subscribe:

```
kinetiks > pitch TechCrunch about our launch

Pitching journalists is a Litmus feature, and Litmus isn't
active on your account.

Litmus is the AI PR engine - six Operators that find the
right journalists, craft personalized pitches, and track
your coverage.

With Harvest + Litmus together, your outreach signals
automatically feed into media strategy.

[A] Add Litmus → id.kinetiks.ai

kinetiks > _
```

The pitch is contextual - it references the apps the user already has and explains the cross-app value of adding this one. Not a popup. Not a nag. A helpful response to something they tried to do. See The Prompt section for more examples.

### Cross-App Data Flows

These flows only activate between apps the user subscribes to. The Terminal surfaces them as actionable notifications and recommendations.

**Content → Outreach (Dark Madder → Harvest)**

When Dark Madder publishes content, it registers as an available asset in Harvest:

```
┊ New content available for outreach: "5 Growth Mistakes
┊ Every Founder Makes" · Use in campaigns? [Y] [Dismiss]
kinetiks > _
```

Harvest's Composer can reference it as outreach ammunition. This is automatic - the system knows published content exists and offers it.

**Coverage → Social Proof (Litmus → Harvest + Dark Madder)**

When Litmus detects media coverage:

```
┊ TechCrunch published your story. Add as social proof?
┊ [Y] Add to campaigns + content  [V] View article
kinetiks > _
```

Harvest injects "As featured in TechCrunch" into outreach. Dark Madder references it in content. One keypress to amplify.

**Test Results → Everything (Hypothesis → All)**

When Hypothesis reaches significance:

```
┊ Test "landing-v3" reached significance. Variant B wins
┊ (+34% conversion). Promote? [Y] [V] View details
kinetiks > _
```

The winning data feeds into Kinetiks ID Market context, available to whichever other apps are connected.

**Outreach Signals → Content Strategy (Harvest → Dark Madder)**

When Harvest campaigns reveal high-performing topics:

```
harvest > what's working?

The "first hire" angle has 18% reply rate vs 8% average.
Suggestion: Create a long-form piece on this topic.

[1] Draft a blog post on first hires (Dark Madder)
[2] Just keep running the campaign

harvest > _
```

**Graceful degradation:** When a flow references an app the user doesn't have, the Terminal acknowledges it without being pushy:

```
harvest > what's working?

The "first hire" angle has 18% reply rate vs 8% average.
This topic would make strong long-form content.

[1] Keep running the campaign
[2] Learn about Dark Madder for content

harvest > _
```
```

Option 2 is informational, not a hard sell. The insight is still useful even without the recommended app.

**Flow Summary (when all four apps are active)**

```
Dark Madder publishes  ──→  Harvest gains outreach ammunition
                       ──→  Litmus gains pitchable content

Litmus gets coverage   ──→  Harvest gains social proof
                       ──→  Dark Madder gains repurpose material

Hypothesis finds winner ──→  Live page updates
                        ──→  Kinetiks ID learns what converts
                        ──→  All connected apps adjust messaging

Harvest finds signal   ──→  Dark Madder prioritizes that topic
                       ──→  Hypothesis tests that angle
                       ──→  Litmus pitches that narrative
```

Each arrow only activates if both apps on either end are subscribed. The Terminal adapts to the user's specific combination.

### Web App Handoff

The Terminal is the action layer. The standalone web apps are the visual detail layer. Handoff between them is frequent and must be seamless.

**Trigger:** Press `O` after any response, or click any deep-link in a result.

**Behavior (Web):**
- Opens the app's subdomain in a new browser tab
- Deep-linked to the exact entity (campaign, draft, test, prospect)
- Authentication is automatic (shared session cookie)
- The web app shows a subtle "Back to Terminal" breadcrumb

**Behavior (Desktop App):**
- Opens a side panel webview within the desktop app
- Deep-linked identically
- Close panel to return to Terminal

**What transfers:**
- Entity context (which campaign, draft, test)
- Filter state (the web app respects current filters)

**What triggers a handoff:**
- `O` after any response with a viewable entity
- Reviewing long-form content (Terminal previews, web app has the full editor)
- Viewing complex dashboards (Terminal shows sparklines, web app shows full charts)
- Editing landing page variants (visual work that needs a full UI)
- Any action requiring rich visual interaction beyond text

**What stays in the Terminal:**
- Creating campaigns, drafts, pitches, tests
- Approving/rejecting work
- Running Playbooks
- All natural language interaction
- Status, pulse, recommendations
- Everything action-oriented

**Reverse handoff:** Each app's standalone web UI includes an "Open in Terminal" affordance for users who have the Terminal connected. This appears as a small `⌘` icon or "Terminal" link in the app's top navigation bar - subtle enough not to confuse app-only users, visible enough that Terminal users find it immediately. Clicking it opens terminal.kinetiks.ai (or focuses the desktop app) with the current entity pre-loaded in context. For example, clicking "Open in Terminal" while viewing a Harvest campaign opens the Terminal with `harvest >` active and that campaign's context loaded, as if the user had typed `harvest.campaign.view [name]`. This is the primary discovery mechanism for app-first users who don't yet know the Terminal exists - they see the link, try it, and experience the faster interface.

### Desktop App

The Terminal launches as a web app at terminal.kinetiks.ai. A native desktop app follows, built with Tauri (Rust-based, lighter than Electron).

The desktop app provides:

- **System tray presence** - Kinetiks icon with notification badges. Click to open.
- **Native notifications** - OS-level alerts for urgent events (replies, significance reached, errors). Respects Do Not Disturb.
- **Global hotkey** - Default `Ctrl+Shift+K` / `Cmd+Shift+K` to summon the Terminal from anywhere, like Spotlight or Raycast.
- **Offline queue** - Commands entered offline queue and execute on reconnection. Read-only access to cached data.
- **Auto-updates** - Silent background updates.
- **Webview for handoffs** - App detail views open in a side panel, not the browser.

The desktop app renders the same Next.js web app in a Tauri webview. Shared codebase, no separate build. Platform features (tray, hotkey, offline) are Tauri shell enhancements. The web app is canonical. The desktop app adds superpowers.

---

## Interface Design

### Visual Language

The Terminal uses a monospace-forward design with selective use of color, box-drawing characters, and whitespace to create hierarchy. Modern, clean, and information-dense - but with the polish of a designed product, not the rawness of an actual terminal.

**Typography:**
- Primary: JetBrains Mono (monospace) - for all terminal content, commands, structured output, and system text
- Secondary: Geist Sans (proportional) - for AI-generated prose, help text, and longer natural language responses
- The mix is intentional. Monospace signals "system." Proportional signals "intelligence." The user learns to read two voices in one interface.

**Color palette:**
- Background: `#0A0A0F` (near-black with slight blue undertone)
- Surface: `#12121A` (elevated panels)
- Border: `#1E1E2A` (subtle box-drawing and dividers)
- Text primary: `#E8E8ED` (high contrast, not pure white)
- Text secondary: `#6B6B7B` (muted for labels, hints, timestamps)
- Accent (Kinetiks brand): `#4ADE80` (green - active states, success, prompt cursor)
- Harvest: `#F97316` (orange)
- Dark Madder: `#A855F7` (purple)
- Litmus: `#3B82F6` (blue)
- Hypothesis: `#EAB308` (yellow)
- Error: `#EF4444` (red)
- Warning: `#F59E0B` (amber)

Each app has a color identity. When you enter Harvest's context, the prompt, borders, and active elements shift to orange. In Dark Madder, purple. Instant spatial awareness.

**Box-drawing and layout:**
- Unicode box-drawing (─, │, ╭, ╮, ╰, ╯) for panels, cards, and containers
- Rounded corners by default for a softer feel
- Double-line borders (═, ║) reserved for warnings and blocking states
- Generous internal padding (1 line vertical, 2 chars horizontal minimum)

### Data Visualization

Analytics and performance data in a terminal requires deliberate design choices:

**Sparklines** for inline trends: `▁▂▃▅▇█▇▅` rendered with Unicode block characters. Used beside any metric to show direction at a glance.

**Bar charts** for comparisons:

```
  Campaign A  ████████████████████  68%
  Campaign B  ██████████████        47%
  Campaign C  ████████              29%
```

**Color-coded numbers** for instant signal: green for positive trends, red for negative, amber for flat. The number itself carries the visual.

**Tables** for structured data: aligned columns with box-drawing borders, sortable via keyboard.

For complex visualizations (funnel diagrams, time-series graphs, heat maps), the Terminal hands off to the web app with a deep link. The handoff is explicit: press `O` to open the full visualization in your browser, pre-loaded with the exact data context.

### Motion

Motion in the Terminal is constrained and purposeful.

- **Character-by-character streaming** for AI responses (20-40ms per character, slowing at punctuation). The signature motion. Signals "thinking" and creates the feeling of live intelligence.
- **Instant context switches** - when the prompt prefix changes (kinetiks → harvest), the color shift happens in one frame. No sliding, no fading. Speed IS the animation.
- **Cursor blink** at the prompt. 530ms on, 530ms off. The universal "ready" signal.
- **Staggered row reveal** for tables and lists (30ms per row, cap at 15 rows). Data flows in.
- **Progress streaming** for long operations (dots ... resolving to results, 400ms per dot).
- **Brief highlight pulse** on new data (150ms background fade from accent to transparent).

What we never do: slide animations, bouncing elements, loading spinners, fade transitions, anything that makes the interface feel slower.

---

## The Prompt

There is no home screen. There are no app screens. There are no menus. There is a prompt.

When you open Kinetiks Terminal, you see this:

```
 2 replies overnight · hiring-pain at 18% reply · 1 draft ready
kinetiks > _
```

That's it. A one-line status showing what happened since you were last here. The prompt. A blinking cursor. Everything else is behind the cursor - you summon it by typing.

The status line is ambient context, not navigation. It shows the most important thing across your active apps. If nothing notable happened, it's just:

```
kinetiks > _
```

### How It Responds

Everything in the Terminal is a response to input. There are no pre-rendered screens to navigate between. You type, and the Terminal responds with structured output appropriate to your request.

**Natural language gets intelligent responses:**

```
kinetiks > find series A SaaS founders in NYC who posted about hiring

Scout searching...

╭─ Results ────────────────────────────────────────────────────╮
│                                                              │
│  47 matches found                                            │
│                                                              │
│  12 warm paths (mutual LinkedIn connections)                 │
│  31 posted about hiring in last 14 days                      │
│   4 posted about hiring in last 30 days                      │
│                                                              │
│  Top signals:                                                │
│  · 8 mentioned "first hire" or "founding team"               │
│  · 6 mentioned scaling challenges                            │
│  · 3 mentioned growth specifically                           │
│                                                              │
╰──────────────────────────────────────────────────────────────╯

[C] Create campaign    [V] View list    [R] Refine
[E] Export             [?] Why these?

kinetiks > _
```

**Commands get structured output:**

```
kinetiks > pulse

╭─ Growth Pulse ───────────────────────────────────────────────╮
│                                                              │
│  Momentum: ████████░░ 4-day streak                           │
│                                                              │
│  HARVEST                                      ▁▂▃▅▇█▇▅     │
│  "hiring-pain" at 18% reply vs 12% avg.                      │
│  The "first hire" angle is outperforming.                    │
│                                                              │
│  DARK MADDER                                  ▃▅▅▇███       │
│  "Growth mistakes" post at 3.2x avg engagement.              │
│  Vulnerability content keeps winning.                        │
│                                                              │
╰──────────────────────────────────────────────────────────────╯

╭─ Recommended ────────────────────────────────────────────────╮
│                                                              │
│  [1] Scale hiring-pain to 200 more prospects                 │
│  [2] Repurpose growth-mistakes into outreach ammo            │
│                                                              │
╰──────────────────────────────────────────────────────────────╯

kinetiks > _
```

**Workflows stream progress, then pause for decisions:**

```
kinetiks > create campaign from these, focus on hiring pain, 3 touches

Building: hiring-pain-nyc

  ✓ Audience locked          47 prospects
  ✓ Voice loaded             ID confidence: 84%
  ✓ Sequence drafted         3 touches
  ✓ Compliance cleared       No issues found
  ● Awaiting your approval

─── Touch 1 ───────────────────────────────────────────────────

Subject: Your first growth hire

Hey {first_name},

Saw your post about building out the team at {company}. The
first growth hire is one of the hardest calls - most founders
either hire too senior or too junior...

[A] Approve all    [E] Edit    [N] Next touch
[R] Regenerate     [Ctrl+C] Cancel

kinetiks > _
```

**Settings are a command, not a screen.** `settings` shows a compact overview. Subcommands drill into each section:

```
kinetiks > settings

  Response style    Teach me        Undo window       30s
  Auto-approve      Off             Notifications     Urgent only
  Apps              2 active        ID readiness      62%
  Account           [M] → id.kinetiks.ai

  settings [terminal|id|apps|account] for details

kinetiks > settings apps

  ● Harvest        Growth · $49/mo
  ● Dark Madder    Pro · $39/mo
  ○ Litmus         Not subscribed          [Add]
  ○ Hypothesis     Not subscribed          [Add]

kinetiks > settings id

  Org ████████░░ 72%   Products █████████░ 88%
  Voice ██████░░░░ 64%  Customers ████░░░░░░ 45% ← next
  Narrative ███████░░░ 71%  Competitive ███░░░░░░░ 33%
  Market █████░░░░░ 56%  Brand ████████░░ 81%

  [B] Build context   [I] Import data

kinetiks > _
```

### The Prompt Prefix

The prompt changes prefix based on context. If you type `h` or `harvest`, the prefix shifts:

```
kinetiks > harvest
harvest > _
```

Now you're in Harvest context. Natural language requests route to Harvest by default. The accent color shifts to Harvest orange. Type `..` or `esc` to return to kinetiks context.

```
harvest > find me warm prospects
```

vs.

```
kinetiks > find me warm prospects
```

Both work. The first routes directly to Harvest's Scout. The second goes through the Intent Router, which figures out this is a Harvest request. The prefix is a shortcut, not a requirement.

App prefixes: `harvest` / `h`, `darkmadder` / `d`, `litmus` / `l`, `hypothesis` / `y`

### Contextual Actions

After every response, the Terminal shows contextual action shortcuts in brackets. These are single-keypress options relevant to what you're looking at right now. They change with every response. They are not permanent navigation - they are response-specific.

```
[C] Create campaign    [V] View list    [R] Refine
```

Press `C` and the Terminal executes the action. Press anything else or type a new command and the contextual actions disappear. They're ephemeral. No commitment.

### Scrollback

The Terminal maintains a scrollback buffer, like a real terminal. Previous commands and responses scroll up as new output appears. You can scroll up to review past results. `Ctrl+L` or `clear` clears the buffer.

This means the Terminal has no concept of "screens" or "pages." It's a continuous stream of input and output. The prompt is always at the bottom. New output pushes old output up. This is what makes it feel like a terminal rather than an app.

### Zero-App State

When a user with no active apps opens the Terminal and types anything:

```
kinetiks > I need to find customers

I'd love to help with that, but you don't have any apps
connected yet. Finding customers is what Harvest does -
it's the outreach and pipeline engine.

Want me to tell you more about how it works, or are you
ready to add it?

[L] Learn more about Harvest
[A] Add Harvest → id.kinetiks.ai
[B] Build your Kinetiks ID first (free)

kinetiks > _
```

The prompt doesn't show an error. It doesn't show a dead end. It responds intelligently to whatever the user typed, explains which app would handle it, and offers a path forward. This is the "smart enough to detect zero-app state and respond accordingly" behavior.

If they type something that doesn't map to any app:

```
kinetiks > what can you do?

Kinetiks Terminal connects your growth apps into one fast
interface. Right now you have no apps active. Here's what
each one does:

  Harvest       Find prospects, run outreach campaigns,
                manage your pipeline.

  Dark Madder   Create and publish content across channels.
                AI-powered writing with your brand voice.

  Litmus        Get press coverage. Find journalists, craft
                pitches, track media.

  Hypothesis    Test landing pages, headlines, CTAs. Find
                what converts.

The Terminal is free. Each app is independent. The more you
connect, the smarter the system gets.

[A] Add an app → id.kinetiks.ai
[B] Build your Kinetiks ID first

kinetiks > _
```

### Inactive App Responses

When a user tries to access an app they don't subscribe to:

```
kinetiks > pitch TechCrunch about our launch

Pitching journalists is a Litmus feature, and Litmus isn't
active on your account.

Litmus is the AI PR engine - six Operators that find the
right journalists, craft personalized pitches, and track
your coverage.

With Harvest + Litmus together, your outreach signals
automatically feed into media strategy.

[A] Add Litmus → id.kinetiks.ai
[Esc] Back

kinetiks > _
```

The pitch is contextual - it mentions the apps the user already has and explains the cross-app value. Not a popup. Not a nag. A helpful response to something they tried to do.

### Notifications

Notifications appear as a single line above the prompt, prefixed with `┊`:

```
┊ Sarah from TechCrunch replied to your pitch
kinetiks > _
```

One at a time. Persist for 5 seconds, then fade. `N` for history. Never interrupt a running workflow.

### Response Style

The `Teach me` response style (set via `settings`) adds brief educational context to every response:

```
kinetiks > pulse

╭─ Growth Pulse ───────────────────────────────────────────────╮
│  ...                                                         │
│  HARVEST                                      ▁▂▃▅▇█▇▅     │
│  "hiring-pain" at 18% reply vs 12% avg.                      │
│  ℹ 18% is exceptional for cold email. Average is 3-8%.       │
│    This angle is resonating because the pain is timely.      │
│  ...                                                         │
╰──────────────────────────────────────────────────────────────╯
```

The `ℹ` lines are the teaching layer. They only appear in `Teach me` mode. In `Concise` mode, you just get the numbers.

---

## Navigation

There are no screens to navigate between. There is the prompt, the scrollback, and shortcuts.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Exit app context (return to `kinetiks >`) |
| `..` | Same as Esc - exit to parent context |
| `↑` / `↓` | Scroll through command history |
| `Ctrl+K` | Command palette (fuzzy search across all commands) |
| `Ctrl+C` | Cancel current operation |
| `Ctrl+Z` | Undo last action (within undo window) |
| `Ctrl+L` | Clear scrollback |
| `O` | Open current context in web app (deep-linked) |
| `N` | Notification history |

Contextual action shortcuts (like `[C] Create campaign`) appear after responses and are single-keypress. They're ephemeral - they belong to the last response, not to the Terminal permanently.

### The Command Palette (Ctrl+K)

The one piece of UI that overlays the prompt. A fuzzy search across all commands, recent actions, campaigns, content, and Playbooks:

```
> campaign

Harvest     New campaign              harvest.campaign.new
Harvest     Active campaigns          harvest.campaign.list
Litmus      New PR campaign           litmus.campaign.new
Playbook    Launch Week               playbook.launch-week
Recent      "q2-launch"              harvest.campaign.q2..
```

Every command has a fully qualified name (e.g., `harvest.campaign.new`). The palette is the discovery mechanism for users who want to learn what's available without typing `help`.

### Web App Handoff (O)

Pressing `O` opens the corresponding web app view, deep-linked to the current context. In the browser, this opens a new tab. In the desktop app, a side panel.

The Terminal is the action layer. The web apps are the visual detail layer. See the Product Ecosystem section for the full handoff specification.

---

## Playbooks

Playbooks are the most powerful feature in the Terminal. They are multi-step, cross-app workflows that encode growth expertise into executable sequences. They are the answer to "I don't know what to do next."

### What Makes a Playbook

A Playbook is a directed graph of steps, not a flat list. Each step:

- Belongs to a specific app (or is cross-app)
- Has an Operator assigned to execute it
- Has a trigger condition (previous step complete, time-based, external event, or manual)
- Has a checkpoint option (pause for human review before continuing)
- Can branch based on results (if metric > threshold, take path A; otherwise path B)

### Built-In Playbooks

**Launch Week**

Orchestrates a coordinated product launch across all four apps.

```
Step 1  Hypothesis   Set up 3 landing page variants
        ↓
Step 2  Dark Madder  Prepare launch content package
        │            (blog post + 4 social posts + email announcement)
        ↓
Step 3  Litmus       Build media list + draft journalist pitches
        │            CHECKPOINT: Review pitches before sending
        ↓
Step 4  Harvest      Build prospect list from ICP
        │            Draft 3-touch outreach sequence
        │            CHECKPOINT: Review sequence before activating
        ↓
Step 5  Cross-app    Schedule everything against launch date
        │            Pitches go out Day -3
        │            Outreach activates Day -1
        │            Content publishes Day 0
        ↓
Step 6  Cross-app    Launch day monitoring
        │            IF test reaches 90% significance → promote winner
        │            IF journalist replies → alert immediately
        │            IF outreach reply rate > 10% in first 24h → scale
```

**Content Flywheel**

Turns one piece of content into multi-channel distribution.

```
Step 1  Dark Madder  Publish long-form content
        ↓
Step 2  Dark Madder  Generate derivatives
        │            (3 LinkedIn posts + Twitter thread + email + newsletter)
        │            CHECKPOINT: Review derivatives
        ↓
Step 3  Harvest      Create content-led outreach touch
        │            "Wrote this, thought of you" angle
        │            Attach to active campaigns as bonus touch
        ↓
Step 4  Litmus       Pitch content to relevant journalists
        │            Frame as expert commentary on [topic]
        ↓
Step 5  Hypothesis   Test content-led landing page variant
        │            IF variant outperforms → promote
        │            WAIT for 7 days or statistical significance
        ↓
Step 6  Cross-app    Performance report
        │            Which channels drove the most engagement?
        │            Recommendation for next content piece
```

**Cold to Warm**

Systematic relationship-building before outreach.

```
Step 1  Harvest      Scout identifies 50 target prospects
        │            CHECKPOINT: Review and refine list
        ↓
Step 2  Dark Madder  Create 2 content pieces addressing their pain points
        │            WAIT for publish + 3 days of organic reach
        ↓
Step 3  Harvest      Engage with prospect content
        │            (likes, thoughtful comments, shares)
        │            2-3 touchpoints per prospect over 7 days
        ↓
Step 4  Harvest      Send warm outreach referencing engagement
        │            "Been following your work on X, especially liked Y"
        │            CHECKPOINT: Review messages before sending
        ↓
Step 5  Harvest      Follow-up sequence with value content
        │            IF reply rate > 15% → expand to 100 more prospects
        │            IF reply rate < 5% → pivot angle and restart Step 4
```

**PR Blitz**

Concentrated media push around a specific angle.

```
Step 1  Litmus       Build targeted media list for angle
        │            20-30 journalists covering [topic]
        ↓
Step 2  Dark Madder  Prepare press assets
        │            (data points, quotes, visuals, one-pager)
        ↓
Step 3  Litmus       Send personalized pitches via Quill
        │            CHECKPOINT: Review each pitch
        │            Stagger sends over 3 days
        ↓
Step 4  Litmus       Watchtower monitors for coverage
        │            WAIT up to 14 days
        │            IF coverage detected → alert + move to Step 5
        │            IF no response after 5 days → send follow-up
        ↓
Step 5  Harvest      Amplify coverage through outreach
        │            "As featured in [publication]" social proof angle
        │            Add coverage to active campaign sequences
        ↓
Step 6  Dark Madder  Repurpose coverage into owned content
```

### Playbook Execution

Playbooks stream progress into the scrollback like any other command output:

```
kinetiks > playbook launch-week --status

PLAYBOOK: Launch Week
Launch: April 15, 2026 · Product: Acme Analytics v2

  ✓ Step 1    Hypothesis    3 variants live
  ✓ Step 2    Dark Madder   Blog + 4 social + email
  ● Step 3    Litmus        12 pitches drafted
                            ⏸ CHECKPOINT: Review needed
  ○ Step 4    Harvest       Waiting on Step 3
  ○ Step 5    Cross-app     Scheduling
  ○ Step 6    Cross-app     Launch monitoring

Step 3 needs your review. Quill drafted 12 pitches
personalized to each journalist's recent coverage.

[V] Review pitches    [S] Skip checkpoint    [X] Cancel
[?] Why these journalists?

kinetiks > _
```

### Custom Playbooks

Users create their own:

```
kinetiks > create playbook "weekly-content-push"

Describe the steps. I'll structure them.

kinetiks > Every Monday: check which drafts are ready in Dark
           Madder. Publish the best-performing topic. Generate
           3 LinkedIn posts from it. Add those posts as content
           touches in my active Harvest campaigns. Then on
           Wednesday, check engagement and tell me what worked.

PLAYBOOK: weekly-content-push
Trigger: Every Monday at 9am

  Step 1  Dark Madder  Surface ready drafts, rank by topic
                       performance history
          CHECKPOINT: Confirm which to publish

  Step 2  Dark Madder  Publish selected draft

  Step 3  Dark Madder  Generate 3 LinkedIn posts
          CHECKPOINT: Review before posting

  Step 4  Harvest      Add posts as content touches to
                       active campaigns

  Step 5  Cross-app    Wednesday: engagement report
          WAIT until Wednesday

[A] Activate    [E] Edit steps    [X] Cancel

kinetiks > A

Playbook "weekly-content-push" activated. First run: Monday
at 9am. Will pause at checkpoints for your review.

kinetiks > _
```

The system parses natural language into a structured Playbook with appropriate triggers, checkpoints, and wait conditions. Users can edit the structure after creation.

### Playbook Principles

- Every Playbook with external-facing output has at least one checkpoint by default. Users can remove them as trust grows.
- Playbooks can be paused, resumed, or cancelled at any point.
- Failed steps retry once, then pause and notify. They do not skip forward.
- Playbook execution history is preserved - you can review what happened in past runs.
- Scheduled Playbooks (like weekly-content-push) run automatically but always pause at checkpoints.
- **App-aware:** Playbooks that require unsubscribed apps are visible but grayed, with a note about which apps are needed. Playbooks that only use your active apps run at full power. Playbooks that partially overlap with your apps show which steps will execute and which are unavailable.

---

## Growth Momentum System

The target user's biggest enemy isn't lack of tools. It's inconsistency. They'll do growth work for two days, then disappear into code for three weeks. The Momentum system creates gentle, persistent accountability.

### Streak Counter

Visible in the session start status line and in the `pulse` response. Tracks consecutive days with at least one meaningful growth action (sent outreach, published content, followed up on a pitch, reviewed test results). Not busywork - the system knows the difference between real action and clicking around.

### Nudges

Proactive suggestions that appear when the Terminal detects stalled momentum:

```
┊ You haven't published content in 11 days. Consistency
┊ compounds. Want to draft something quick?  [Y] [Dismiss]
kinetiks > _
```

Nudge rules:
- Maximum one nudge per session. Never nag.
- Nudges reference specific, actionable items (not vague "you should do growth")
- Nudges can be dismissed permanently per category
- The system learns which nudges the user acts on and adjusts

### Weekly Pulse

Every Monday, the session start status line is replaced by a compact weekly summary that streams before the prompt:

```
── Weekly Pulse ───────────────────────────────────────────────

Last 7 days

  Momentum     ████████████░░  5-day streak (best: 8)
  Outreach     23 sent, 4 replies (17%)       ▃▅▅▇██▇
  Content      1 published, 412 engagements   ▁▃▅▇█
  PR           2 pitches sent, 0 coverage     ▁▁▂
  Testing      Variant B still leading (+34%) ▃▅▇████

This week's focus: Your outreach is hot. Double down on the
hiring-pain angle while it's working.

[1] Scale hiring-pain campaign

────────────────────────────────────────────────────────────────
kinetiks > _
```

One recommendation. Not a wall of options. The pulse scrolls up as soon as the user starts typing - it's context, not a gate. You can also type `pulse` any time to see the latest version.

---

## The Teaching Layer

### "Why" and "Learn" Commands

Any result can be interrogated:

```
harvest > why is 18% reply rate considered good?

  Cold email reply rates for B2B SaaS outreach:

  Below 3%     Something is wrong - list, copy, or targeting
  3-8%         Average - functional but not remarkable
  8-15%        Strong - good targeting and message-market fit
  15-25%       Exceptional - you've hit a nerve
  25%+         Rare - usually means warm intros or perfect timing

  Your "hiring-pain" campaign is at 18%. That puts it in the
  exceptional range. The signal: the first-hire angle resonates
  with Series A founders. This suggests your ICP is well-defined
  and the pain point is timely.

  Want to learn more about what makes outreach convert?
```

The `learn` command offers guided explanations of growth concepts:

```
> learn content flywheel

  A content flywheel is a system where each piece of content
  generates energy for the next...
```

### Contextual Teaching

When the "Teach me" response style is active (set in preferences), every result includes brief educational context. Not a lecture - one or two sentences that help the user understand why the numbers matter.

This is the "growth co-founder" behavior. A co-founder doesn't just show you metrics. They tell you what the metrics mean and what to do about them.

---

## Failure Modes

### Empty States

When a search finds nothing:

```
harvest > find AI startups in Antarctica

No matches found for "AI startups in Antarctica"

Try:
  · Broadening the geography
  · Removing the industry filter
  · Searching for a different signal

Or just describe what you're looking for differently.

harvest > _
```

Empty states always explain why and suggest a concrete next step.

### Operation Failures

When an API call fails, a connection drops, or an Operator encounters an error:

```
harvest > find SaaS founders in NYC

✗ Scout couldn't complete the search

LinkedIn API returned a rate limit. This usually resolves
in 15-30 minutes.

[R] Retry now    [L] Try later    [?] More details

harvest > _
```

Error principles:
- Name the Operator and the failure (not "Something went wrong")
- Explain the cause in plain language
- Estimate recovery time if possible
- Offer retry, defer, or alternative actions
- Technical details available via `[?]` but never shown by default

### Compliance Blocks

When the compliance layer blocks an action:

```
harvest > approve campaign hiring-pain

═══ BLOCKED ═══════════════════════════════════════════════════

This outreach was blocked before sending.

Reason: Contact fatigue - 3 of these prospects were contacted
within the last 14 days via another campaign.

[V] View affected prospects (3)
[E] Edit campaign to exclude them
[O] Override (requires confirmation)

════════════════════════════════════════════════════════════════
harvest > _
```

Double-line `═` borders signal a blocking state. The reason is always specific. Override is available but requires explicit confirmation. The system does not silently filter or modify.

### Interrupt and Cancel

`Ctrl+C` interrupts any running operation. The system:

1. Stops the current Operator immediately
2. Shows what was completed and what was not
3. Saves partial state (e.g., 20 of 47 prospects already reviewed)
4. Offers to resume or discard

```
kinetiks > create campaign from these ^C

Interrupted.

  Completed:     Audience locked, voice loaded
  Not started:   Sequence drafting, compliance review

[R] Resume from where you left off
[X] Discard everything

kinetiks > _
```

### Undo Window

After any action with external consequences (sending outreach, publishing content, submitting a pitch), a timed undo bar appears:

```
✓ Campaign "hiring-pain" activated. Sending begins in 30s
[Ctrl+Z] Undo                                ████████░░ 30s
```

The progress bar counts down. `Ctrl+Z` within the window cancels the action completely. After the window closes, the action is committed. The undo window duration is configurable via `settings` (default 30 seconds).

### Misrouted Intent

When the Intent Router isn't confident about what the user wants:

```
kinetiks > do the thing with the people

I'm not sure what you need. Could you mean:

  [1] Send outreach to your "q2-launch" prospects (Harvest)
  [2] Publish your pending blog draft (Dark Madder)
  [3] Something else - tell me more

kinetiks > _
```

The router guesses based on recent context and Kinetiks ID state. Option 3 is always present. The system never executes when uncertain.

### Degraded State

When one app's API is down but others are working, the session start status line reflects it:

```
 harvest ● active · darkmadder ● active · litmus ✗ offline
kinetiks > _
```

Cross-app commands gracefully skip unavailable apps and note what was excluded. Playbooks pause at steps that require an offline app and notify.

---

## Onboarding

Onboarding is not a wizard. It's the Terminal being smart about who just sat down.

### Path 1: App-First (User Already Has an App)

The user signed up for Harvest at hv.kinetiks.ai, used it for a while, then opens terminal.kinetiks.ai. Their Kinetiks ID exists. Harvest is active. On first launch:

```
Welcome to Kinetiks Terminal. You're already using Harvest -
the Terminal gives you a faster way to run it, plus cross-app
intelligence when you add more tools.

Give me your website and I'll build your growth profile.

kinetiks > acmeanalytics.com

Scanning...

✓ B2B analytics platform for Shopify merchants
✓ 3 pricing tiers (Starter, Growth, Enterprise)
✓ Blog with 23 posts, mostly SEO-focused
✓ 2 case studies

Here are 10 real prospects that match your product:

  1. Sarah Chen · CEO, CartMetrics · Series A
     Posted about Shopify analytics gaps 3 days ago

  2. Marcus Webb · Head of Growth, ShopStack
     Liked 4 posts about e-commerce data this week

  3. ...

[Y] Draft outreach   [V] View all 10   [C] Continue setup

kinetiks > Y

Subject: Shopify analytics for CartMetrics

Hey Sarah, saw your post about the gaps in Shopify's
built-in analytics. We're building something that...

This is decent but I can do better with more context
about your voice and positioning. Want to spend 10
minutes teaching me?

[B] Build my profile   [S] Send as-is   [E] Edit first

kinetiks > _
```

Value in under 2 minutes. Real prospects, real draft outreach. The user sees the Terminal working before investing in setup.

### Path 2: Terminal-First (Zero Apps)

The user found Kinetiks through Terminal marketing. No apps. On first launch they just get the prompt. Whatever they type, the Terminal responds intelligently:

```
kinetiks > I need to find customers for my Shopify analytics app

Finding customers is what Harvest does. It's the outreach
and pipeline engine - finds prospects, drafts personalized
sequences, runs campaigns.

I can build your growth profile right now (free, no app
needed) so when you add Harvest, it already knows your
voice and positioning.

[A] Add Harvest → id.kinetiks.ai
[B] Build my profile first
[?] Tell me more about Harvest

kinetiks > _
```

If they just type `help` or `?`:

```
kinetiks > help

Kinetiks Terminal connects your growth apps into one fast
interface. Right now you have no apps active.

  Harvest       Find prospects, run outreach, manage pipeline
  Dark Madder   Create and publish content with your voice
  Litmus        Get press coverage, find journalists, pitch
  Hypothesis    Test landing pages, find what converts

Each app works independently. The Terminal is free and
connects them. The more you add, the smarter it gets.

[A] Add an app → id.kinetiks.ai
[B] Build my growth profile first

kinetiks > _
```

The zero-app Terminal is not dead. It just routes everything toward getting started.

### Context Building

Both paths converge here. It's a conversation at the prompt:

```
kinetiks > B

Let's sharpen your growth profile. A few questions.

How would you describe what you do to someone at a dinner
party? Not the pitch deck version - the real one.

kinetiks > we help shopify stores understand what's actually
           happening with their data, not just the vanity metrics

Good. That tells me a lot about your positioning. A few more.

Who specifically buys this? Give me the job title and stage
of company.

kinetiks > heads of growth or founders at Series A e-commerce
           companies doing $1-10M GMV

Context: Org ███████░░░ 72%  Products █████████░ 88%
         Voice ██████░░░░ 41%  Customers ████████░░ 78%
         Readiness: 62% · good enough to run campaigns

Want to keep going or start using this?

[C] Continue building   [G] Go - start using the Terminal

kinetiks > _
```

The context scores update inline after each answer. The user sees their profile getting sharper in real-time. Onboarding ends when they decide, not when a form is complete.

---

## Notifications

Notifications appear as a single `┊`-prefixed line above the prompt (see The Prompt section). The categorization rules:

- **Urgent** (replies received, test reached significance, campaign errors) - appear immediately, even during active work
- **Informational** (milestones, content published, coverage detected) - batched, shown at the next natural pause
- **Digest** (weekly summary, context improvement suggestions) - shown on session start via the status line
- Notifications never interrupt a running workflow mid-execution. They queue and appear after the current operation completes or pauses.

---

## Command Conventions

Rather than exhaustive tables, the Terminal follows a consistent naming pattern:

**Structure:** `app.resource.action`

**Apps:** `harvest`, `darkmadder`, `litmus`, `hypothesis` (shortcuts: `h`, `d`, `l`, `y`)

**Common resources:** `campaign`, `prospect`, `content`, `draft`, `pitch`, `test`, `variant`

**Common actions:** `new`, `list`, `view`, `edit`, `pause`, `resume`, `delete`, `analytics`

**Examples:**
- `harvest.campaign.new` → create a campaign
- `darkmadder.content.list` → view all content
- `litmus.pitch.new` → draft a pitch
- `hypothesis.test.view landing-v3` → view a specific test

**Cross-app commands:** `pulse`, `recommend`, `report`, `funnel`, `timeline`, `playbook`

The command palette (Ctrl+K) is the discovery mechanism. Users never need to memorize these - they exist for speed when you want them.

---

## Future Considerations

These are explicitly out of scope for v1 but the architecture should not preclude them.

**Team and Collaboration.** Multiple users on one Kinetiks instance. Activity feeds. Approval delegation. Shared Playbooks. Role-based access (admin, member, viewer). The Kinetiks ID portal at id.kinetiks.ai handles team management - the Terminal surfaces team activity but permissions are managed centrally.

**Mobile.** A terminal-style interface on mobile is a fundamentally different design problem. The natural language input and structured output translate well, but keyboard navigation does not. Mobile is a separate design project, not an afterthought. v1 is desktop-first (web and desktop app).

**Public API, SDK, and MCP Server.** The Terminal is a client of the Kinetiks API. That API, a TypeScript SDK, and the MCP server at mcp.kinetiks.ai are separate deliverables with their own specs. The architecture ensures they share the same Operators and Kinetiks ID context. API keys are created and managed at id.kinetiks.ai.

**Premium Playbooks.** Curated, high-value Playbooks as a potential monetization vector. "The YC Launch Playbook." "The Product Hunt Playbook." "The Enterprise Pilot Playbook." Created by growth experts, sold or included in higher tiers.

**Playbook Marketplace.** Users sharing custom Playbooks with the community. Templates with anonymized strategies.

**Bundle Pricing.** Discount tiers for subscribing to multiple apps (2-app, 3-app, all-4 bundles). The Terminal naturally demonstrates cross-app value, making bundles an organic upsell rather than a forced decision.

---

## Build Phases

### Phase 1: Shell, Navigation, and Account Integration

The Terminal application shell:
- Custom React terminal rendering engine with scrollback buffer
- Prompt with context-aware prefix (`kinetiks >` / `harvest >` / etc.)
- Session start status line (contextual one-liner)
- Per-app color theming on context switch
- Contextual action shortcuts (ephemeral, response-specific)
- Command palette (Ctrl+K)
- Session persistence (Supabase)
- Authentication via Kinetiks ID shared session cookie
- `settings` command with per-app subscription status and `[M]` routing to id.kinetiks.ai
- `O` handoff to standalone web apps (deep-linked)
- Reverse handoff support ("Open in Terminal" from web apps)
- Zero-app state handling (intelligent responses that guide toward app subscription)
- Inactive app responses (contextual pitch when user tries to access unsubscribed app)

Deliverable: A working terminal that you can open, type into, and navigate between app contexts. Responds to `settings`, `help`, `clear`. Handles zero-app, one-app, and multi-app states gracefully. Routes to id.kinetiks.ai for billing. No AI intelligence yet - natural language input shows "coming soon," but the shell feels right.

### Phase 2: Onboarding and Kinetiks ID

Before intelligence works, context must exist:
- Cartographer onboarding flow (URL crawl, guided conversation, account connections)
- Quick Win experience (show real prospects from website scan)
- Kinetiks ID confidence dashboard in Settings
- Context building via conversational flow
- Real-time confidence score updates

Deliverable: A new user can go from zero to a populated Kinetiks ID with demonstrated value in under 15 minutes.

### Phase 3: Intent Router and Natural Language

- LLM-powered intent classification and entity extraction
- Confidence-based routing (execute / clarify / explain)
- Streaming response rendering (character-by-character)
- Command history and recall (↑ arrow)
- Slash commands
- Misrouted intent handling (disambiguation UI)
- Error state rendering

Deliverable: You can type natural language into the prompt and get intelligent, structured responses with contextual actions.

### Phase 4: Harvest Integration

First app integration. Outreach is the most immediately actionable growth lever.
- Prospect search (Scout)
- Campaign creation and management
- Sequence composition (Composer)
- Approval workflow
- Compliance checking (inline, automatic)
- Campaign analytics with sparklines
- Undo window for sends
- Interrupt/cancel for all operations

Deliverable: Full outreach workflow from prospect discovery to campaign launch, entirely within the Terminal.

### Phase 5: Dark Madder + Litmus + Hypothesis

Remaining app integrations:
- Dark Madder: content creation, calendar, publishing, Eddider scoring, repurpose
- Litmus: pitch creation, media search, coverage tracking, monitoring
- Hypothesis: test creation, variant management, results, promotion

Deliverable: All four apps fully operational within the Terminal.

### Phase 6: Cross-App Intelligence and Playbooks

The features that make the Terminal greater than the sum of its parts:
- `pulse` command with Growth Pulse view
- `recommend` with AI-generated actions
- Momentum system (streaks, weekly pulse, nudges)
- Playbook engine (execution, checkpoints, branching, wait conditions)
- Built-in Playbooks (Launch Week, Content Flywheel, Cold to Warm, PR Blitz)
- Custom Playbook creation via natural language
- Cross-app data flows (content → outreach ammo, coverage → social proof)
- Funnel view
- Growth reports
- Teaching layer (why, learn commands, contextual education)
- Continuous learning feedback loop

Deliverable: The full vision. A unified growth command center that teaches, nudges, orchestrates across apps, and gets smarter with use.

### Parallel Track: Desktop App

Can begin after Phase 1 is stable:
- Tauri wrapper around the Terminal web app
- System tray with notification badges
- Native OS notifications
- Global hotkey (Ctrl+Shift+K / Cmd+Shift+K)
- Webview panel for web app handoffs (instead of new browser tab)
- Offline queue for commands
- Auto-update mechanism

The desktop app is the same codebase rendered in a Tauri webview. No separate build. Platform-specific features are progressive enhancements.

---

## Success Metrics

**Time to first value:** How fast a new user sees real prospects from their website scan. Target: under 3 minutes.

**Time to first action:** How fast a new user executes their first growth action (sends outreach, publishes content). Target: under 15 minutes including onboarding.

**Daily return rate:** % of users who open the Terminal on consecutive days. Target: 60%+ day-2 retention.

**Natural language ratio:** % of prompt inputs that are natural language vs direct commands. Higher is better early (means the NL works). Gradual shift toward commands over time (means users are learning).

**Cross-app session rate:** % of sessions involving 2+ apps. Target: 40%+ after 30 days. Indicates the unified value is landing.

**Playbook adoption:** % of users who run at least one Playbook in their first 14 days. Target: 50%.

**Momentum streaks:** Average streak length. Target: 4+ days. Indicates the behavioral nudge is working.

**Kinetiks ID growth:** Average confidence score increase over first 30 days. Target: 25+ percentage points. Indicates the continuous learning and context building are compounding.
