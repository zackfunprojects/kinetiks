# Spec Addendum: Marcus Product Intelligence & Chat UX

> **This addendum covers two additions to the Kinetiks product spec:**
> 1. Marcus's awareness of the product suite and ability to recommend app activations as part of growth strategy
> 2. Chat tab UX patterns for discoverability, onboarding, and power-user efficiency
>
> Insert Section A into the Product Spec under Section 10 (Agent Architecture) after Marcus.
> Insert Section B into the Product Spec under Section 5 (Chat Tab).
> Update the Phase 1 and Phase 4 build plans accordingly.

---

## Section A: Marcus Product Intelligence

### A.1 The System Knows Itself

The named system (powered by Marcus) has complete awareness of the Kinetiks product stack. It knows:

- **Every app in the suite** — what it does, what problems it solves, what it costs, what data it needs, what it produces
- **Which apps this user has activated** — and what they're doing right now
- **Which apps this user hasn't activated** — and why they might want to, based on the user's specific situation
- **How apps connect** — which learnings flow between apps, how activating a new app would improve existing ones
- **The user's goals** — and which combination of apps best serves those goals
- **The user's gaps** — where the GTM system has blind spots because a capability isn't activated

This isn't a knowledge base the system searches. It's baked into Marcus's context assembly. When Marcus builds context for a conversation, it always includes: active apps + their status, inactive apps + their relevance to the conversation, and the user's goals.

### A.2 Strategic App Recommendations

The system doesn't wait to be asked about apps. It weaves recommendations into natural strategic conversation when the situation warrants it.

**Example — organic discovery:**
User: "Our blog traffic is growing but it's not turning into pipeline."
System: "Your content is generating 45k monthly sessions but only 12 leads. The gap is conversion infrastructure — you're driving traffic with no mechanism to capture it. Two options: I can have Harvest build outbound sequences targeting companies that visit your high-intent pages (requires activating visitor identification). Or you could activate Hypothesis to build landing pages with lead capture for your top-performing content. Based on your ICP, I'd recommend Hypothesis first — your content about AI security gets 8k monthly visits with no CTA. A dedicated landing page could convert 2-3% of that traffic. Want me to lay out what that would look like?"

**Example — gap identification:**
System (in daily brief): "Your outbound is generating strong reply rates (14%) but I notice you have no content engine supporting it. Companies that see thought leadership before receiving outreach respond 2-3x more often. If you activated Dark Madder, I could coordinate content publishing to warm up segments before Harvest sequences hit. Your Voice and Narrative layers are already strong enough to produce good content immediately."

**Example — goal-driven:**
User: "I want to land 3 media placements this quarter."
System: "That's a PR goal. You'd need Litmus for media relations and pitching. Based on your Cortex, you have strong differentiators and a solid narrative — Litmus would have good material to work with. Want me to activate it and start identifying relevant journalists?"

### A.3 Recommendation Rules

- **Never hard-sell.** Recommendations are strategic advice, not upsell prompts. The system explains the gap, the opportunity, and what would change — then lets the user decide.
- **Only recommend when relevant.** If the conversation doesn't naturally connect to an unactivated app, don't bring it up. Forced recommendations destroy trust.
- **Maximum one recommendation per conversation.** Never stack multiple app pitches.
- **Respect "not now."** If the user declines an app recommendation, don't bring up that same app again for at least 30 days unless the user asks.
- **Back it with data.** Every recommendation references specific data: traffic numbers, conversion rates, competitor activity, goal gaps. Never "you might like this" — always "here's why this would work for you specifically."
- **Show the connection.** Explain how the new app would make existing apps better: "Dark Madder content would warm up Harvest prospects" or "Litmus PR placements would drive traffic that Hypothesis landing pages capture."

### A.4 App Knowledge in Marcus's Prompt

Marcus's system prompt includes a dynamic section built at conversation time:

```
## Your Product Stack

Active apps:
- Harvest (outbound): [current status summary — sequences active, reply rates, pipeline]
- Dark Madder (content): [current status summary — posts this month, traffic, top topics]

Available but not activated:
- Hypothesis (landing pages): Builds conversion-optimized landing pages with A/B testing. Would help with: [specific gap based on user's data]. Cost: [pricing tier].
- Litmus (PR): Media relations and journalist pitching. Would help with: [specific gap]. Cost: [pricing tier].
- [Ads app] (paid media): Search and social ad management. Would help with: [specific gap]. Cost: [pricing tier].
- Adventure (experimental): Creative GTM opportunities — events, sponsorships, OOH, unconventional plays. Would help with: [specific gap]. Cost: [pricing tier].

The user's goals:
- [Goal 1]: [progress status] — [which apps contribute, which could help]
- [Goal 2]: [progress status] — [which apps contribute, which could help]

When the conversation naturally connects to a gap that an unactivated app would fill, mention it as part of your strategic advice. Don't force it. Don't pitch. Advise.
```

### A.5 One-Step App Activation

When the user decides to activate an app based on a recommendation, it should happen immediately from Chat:

User: "Yeah, activate Hypothesis."
System: "Done. Hypothesis is now active. I'm pulling your brand guidelines and voice data from Cortex so it's ready to go. Based on your top content, I'd recommend starting with a landing page for your AI security guide — it gets 8k visits/month with no conversion path. Want me to draft one?"

No navigation required. No settings page. No separate activation flow. The system activates the app, confirms, and immediately suggests the first action. This is the Chat being a real command interface.

---

## Section B: Chat UX — Discoverability and Efficiency

### B.1 First-Time Chat Experience

When a new Kinetiks user lands in Chat for the first time, the system needs to teach them what's possible without feeling like a tutorial.

**The greeting message** is the first teacher. It's not generic — it's specific to the user's situation and demonstrates capability:

> "I've finished learning about [Company]. Here's what I know so far and what I'm ready to do:
>
> Your Cortex is at 67% confidence. Your strongest areas are Voice (82%) and Products (79%). I could use more detail on your competitive landscape and customer personas.
>
> You have Harvest active. I'm ready to build outreach sequences, research prospects, or help you plan your outbound strategy.
>
> Try asking me things like:
> • "Build a sequence targeting [ICP]"
> • "How's our pipeline looking?"
> • "What should I focus on this week?"
>
> Or just tell me what you're working on and I'll help."

The "try asking" suggestions are **contextual** — they reference the user's actual data and active apps, not generic examples.

### B.2 Suggestion Chips

Below the message input, the Chat shows contextual suggestion chips — tappable/clickable prompts that disappear once the user starts typing. These change based on context:

**When chat is empty (new thread):**
- "What should I focus on today?"
- "Show me how [active app] is performing"
- "What's the status of my goals?"
- "[Custom based on pending approvals or recent events]"

**After a response about outbound:**
- "Build a sequence for this segment"
- "Show me reply rates by persona"
- "What messaging angles work best?"

**After a response about content:**
- "Draft a post about this topic"
- "What topics should we cover next?"
- "How does our content drive pipeline?"

**After viewing analytics:**
- "Why did [metric] change?"
- "What's the biggest lever for [goal]?"
- "Run a what-if for doubling [metric]"

**When there are pending approvals:**
- "Show me what needs approval"
- "Approve all quick items"
- "What's waiting for me?"

Suggestion chips are generated by Marcus based on: the last message, the user's active apps, pending approvals, recent Oracle insights, and goal status. They should feel like the system is anticipating what the user might want to do next.

**Rules for suggestion chips:**
- Maximum 3-4 chips visible at once
- Chips disappear when the user starts typing
- Chips update after each response
- Never show the same chip twice in a row
- Always at least one chip that demonstrates a capability the user hasn't used yet (progressive disclosure)

### B.3 Slash Commands

For power users who know what they want, the Chat supports slash commands. Typing `/` shows a command palette:

**Navigation:**
- `/approvals` — switch sidebar to approvals panel
- `/threads` — switch sidebar to thread list
- `/analytics` — jump to Analytics tab
- `/cortex` — jump to Cortex tab
- `/settings` — open settings modal

**Quick actions:**
- `/approve all` — batch approve all quick approvals
- `/brief` — generate an on-demand daily brief
- `/goals` — show goal progress summary inline
- `/budget` — show budget pacing summary inline
- `/status` — show all active apps with quick health summary

**App commands (prefixed by app):**
- `/harvest status` — Harvest performance summary
- `/harvest prospects [criteria]` — quick prospect search
- `/dm draft [topic]` — start a content draft
- `/dm topics` — show top-performing content topics
- `/litmus pitch [outlet]` — draft a pitch

**System:**
- `/help` — show all available commands
- `/shortcuts` — show keyboard shortcuts
- `/clear` — clear current thread

The command palette is searchable — typing `/har` filters to Harvest commands. Each command shows a brief description. Commands are context-aware — app-specific commands only show for active apps.

### B.4 Keyboard Shortcuts

For desktop app power users:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Command palette (same as typing `/`) |
| `Cmd/Ctrl + N` | New chat thread |
| `Cmd/Ctrl + Shift + A` | Toggle to Approvals panel |
| `Cmd/Ctrl + 1` | Switch to Chat tab |
| `Cmd/Ctrl + 2` | Switch to Analytics tab |
| `Cmd/Ctrl + 3` | Switch to Cortex tab |
| `Cmd/Ctrl + ,` | Open settings |
| `Cmd/Ctrl + Enter` | Send message |
| `Up arrow` (in empty input) | Edit last message |
| `Esc` | Close any modal/panel |

Shortcuts are shown in the command palette next to each command. A shortcuts reference is accessible via `/shortcuts` or `Cmd/Ctrl + ?`.

### B.5 Rich Response Components

The Chat isn't just text. The system renders rich components inline:

**Data tables:** When showing prospect lists, metric comparisons, or structured data. Sortable columns, clean formatting.

**Mini-charts:** When answering analytics questions. Sparklines, bar charts, progress rings rendered inline in the message. Powered by the same charting library as the Analytics tab.

**Action cards:** When presenting work results. "Here's the sequence I built:" followed by a structured card with steps, preview, and approve/edit actions right in the conversation.

**App cards:** When recommending an app activation. Shows app name, description, what it would add to this user's setup, and an "Activate" button.

**Approval cards:** When the system presents something for review directly in conversation (for items that naturally arose from the chat flow, separate from the sidebar queue).

**Progress indicators:** When the system is doing work (building a sequence, drafting content). Animated, shows stage: "Finding prospects... Drafting email 1 of 3... Running quality check..."

**Expandable sections:** For detailed data that would clutter the conversation. "Here's the summary. [Expand for full details]"

### B.6 Progressive Disclosure

The Chat teaches users its capabilities progressively, not all at once:

**Week 1:** Suggestion chips focus on basic queries and the user's primary app. The system occasionally mentions a capability: "By the way, you can ask me to build sequences directly — just describe what you want."

**Week 2:** Suggestion chips introduce cross-app queries and what-if scenarios. The system mentions slash commands after the user has sent 20+ messages: "Tip: you can type / for quick commands."

**Week 3+:** Suggestion chips become more strategic. The system suggests keyboard shortcuts for frequent actions. Full capability is available but surfaced based on what the user actually does.

**"Discover" moments:** After a user does something manually that the system could automate, the system mentions it once: "I noticed you checked reply rates in Harvest. You can ask me that anytime — I'll pull it up with context." This happens a maximum of once per capability, tracked so it never repeats.

### B.7 Thread Intelligence

The Chat manages threads intelligently:

**Auto-titling:** Threads get a descriptive title generated from the first 2-3 exchanges (like Claude desktop).

**Thread suggestions:** When a conversation shifts topics significantly, the system suggests: "This feels like a new topic. Want to start a fresh thread for it?" Keeps threads focused and searchable.

**Thread pinning:** Users can pin important threads (strategy discussions, quarterly plans). Pinned threads appear at the top of the thread list.

**Thread search:** Full-text search across all threads. Accessible via `Cmd/Ctrl + F` in the sidebar or `/search [query]`.

**Thread context:** The system references prior threads when relevant: "We discussed this in your enterprise strategy thread last week. You decided to focus on VP Engineering. Want to build on that?"

---

## Implementation Notes

### For Phase 1 (Chat Tab Build):
- Add suggestion chip component and rendering logic
- Add slash command palette (trigger on `/` keypress)
- Add keyboard shortcuts (wire to Electron for desktop, document.addEventListener for web)
- Build rich response components: data tables, mini-charts, action cards, app cards, progress indicators, expandable sections
- Build progressive disclosure tracking (which capabilities have been surfaced)

### For Phase 4 (Command Router):
- Ensure Marcus's system prompt includes the dynamic product stack section (A.4)
- Build suggestion chip generation logic in Marcus (context-aware chip proposals)
- Wire app activation commands through the command router
- Build app recommendation logic with the rules from A.3

### For CLAUDE.md:
- Add to Marcus voice principles: "Knows the product stack. Recommends apps as strategic advice, never as sales. Backs every recommendation with the user's specific data."
- Add to key decisions: "App recommendations are strategic advice delivered in conversation, not upsell prompts. Maximum one per conversation. Must reference specific user data."
