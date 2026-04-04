# Feature Announcement Frameworks

Reference material for `/product-marketing` Mode 1: Feature Announcement.
Load this file when writing changelog entries, in-app notifications, or feature announcement emails.

---

## Best-in-Class Changelog Patterns

The best SaaS changelogs share common traits: they are human, specific, visual, and outcome-oriented. Here are the patterns worth stealing.

### Pattern 1: The Linear Model

Linear's changelog is the gold standard for developer-facing products. Their approach:

**Structure per entry:**
- Date + version number
- Outcome-oriented headline (what you can DO now, not what they BUILT)
- 2-3 sentence explanation with one specific example
- Inline screenshot or GIF showing the feature in context
- Optional: code snippet if API-facing
- "Learn more" link to docs

**Voice characteristics:**
- Terse. No filler words.
- Technical without being jargon-heavy
- Assumes the reader is competent
- Never starts with "We're excited to announce"
- Uses present tense: "You can now..." not "We've added..."

**What to steal:**
- The brevity. Say it in 40 words or fewer.
- The visual proof. Every entry has a screenshot or GIF.
- The "you can now" framing. It is always about the user.

### Pattern 2: The Notion Model

Notion's changelog targets a broader audience (teams, not just developers). Their approach:

**Structure per entry:**
- Themed header (monthly roundup style)
- Multiple features grouped under a narrative theme
- Each feature: headline + 1-paragraph explanation + screenshot
- "Try it now" CTA after each feature
- Footer: what is coming next (builds anticipation)

**Voice characteristics:**
- Warm but not casual. Professional warmth.
- Explains the "why" behind each feature
- Connects features to workflows: "When you're in a meeting and need to..."
- Uses second person consistently

**What to steal:**
- The thematic grouping. Do not just list features. Tell a story.
- The workflow framing. Every feature connects to a real scenario.
- The forward-looking footer. It turns the changelog into a serial.

### Pattern 3: The Supabase Model

Supabase treats their changelog as content marketing. Their approach:

**Structure per entry:**
- Blog-post-length deep dives on major features
- Technical detail with code examples
- Architecture diagrams for infrastructure features
- Performance benchmarks with real numbers
- Community contributions highlighted

**Voice characteristics:**
- Developer-to-developer. Assumes deep technical knowledge.
- Shows the work: benchmarks, architecture decisions, tradeoffs
- Transparent about limitations and known issues
- Credits contributors by name

**What to steal:**
- The depth. Major features deserve major explanations.
- The benchmarks. "2.3x faster" with methodology shown.
- The transparency. Acknowledging limitations builds trust.

---

## In-App Notification Patterns

In-app notifications are the most under-optimized channel in SaaS. Most teams either over-notify (users disable them) or under-notify (features go undiscovered). Here are the patterns that work.

### Pattern: The Contextual Reveal

Show the notification when the user is in the exact workflow where the feature helps.

```
  TRIGGER: User opens the reports page
  NOTIFICATION:

  ┌──────────────────────────────────────────────┐
  │                                              │
  │  NEW: Export to CSV                          │
  │  Any report, two clicks. Try it now.         │
  │                                              │
  │  [Try it]  [Dismiss]                         │
  │                                              │
  └──────────────────────────────────────────────┘
```

**Rules:**
- Show only when the user is on the relevant page/feature
- Headline: 5-8 words, starts with "NEW:" tag
- Body: one sentence, outcome-focused
- Two buttons: action + dismiss
- Show once. If dismissed, do not show again.
- If not dismissed, show max 3 times over 7 days.

### Pattern: The Tooltip Tour

For complex features, guide the user through a 3-step tooltip tour.

```
  Step 1/3: Click here to open the new dashboard
  Step 2/3: Drag widgets to customize your view
  Step 3/3: Hit "Save layout" to keep your setup
```

**Rules:**
- Maximum 3 steps. If it takes more, the UX needs work.
- Each step: one action, one sentence
- "Skip tour" always available
- Track completion rate (if below 40%, simplify)
- Only trigger for users who will benefit (segment by plan or usage)

### Pattern: The Passive Badge

For minor updates, a badge on the feature's icon is enough.

```
  [Reports] ● NEW
```

**Rules:**
- Small dot or "NEW" badge on the navigation item
- Clears automatically after the user visits the feature
- No modal, no popup, no interruption
- Use for: minor improvements, UI changes, small fixes
- Do NOT use for: major features (those need a proper notification)

---

## Feature Adoption Email Sequences

A feature announcement email is not a one-and-done. The best SaaS companies run a 3-email adoption sequence for major features.

### Email 1: The Announcement (Day 0)

**Goal:** Awareness. They know the feature exists.

```
  Subject: You can now [outcome] in [Product]
  Preview: [Specific benefit in 40 chars]

  Body structure:
  - Line 1: What changed (one sentence)
  - Line 2-3: Why it matters to YOU (not to us)
  - Line 4: One specific example or use case
  - CTA: "Try [feature name]"

  Segment: All active users on relevant plan
  Exclude: Users who already used the feature
```

### Email 2: The Use Case (Day 3)

**Goal:** Understanding. They know HOW to use it.

```
  Subject: How [Company] uses [feature] to [outcome]
  Preview: A 3-minute walkthrough

  Body structure:
  - Mini case study: real customer, real workflow
  - Step-by-step: "Here's exactly what they do..."
  - Screenshot or GIF of the workflow
  - CTA: "Set up your own [workflow]"

  Segment: Opened Email 1 but haven't tried the feature
  Exclude: Already adopted the feature
```

### Email 3: The Nudge (Day 7)

**Goal:** Activation. They actually use it.

```
  Subject: Quick tip: [feature] works even better with [action]
  Preview: 30 seconds to set up

  Body structure:
  - One advanced tip or power-user trick
  - "Most teams also connect [related feature]..."
  - CTA: "Try it now" (deep link to the feature)

  Segment: Opened Email 1 or 2, still haven't tried
  Exclude: Already adopted OR unsubscribed from feature emails
```

### Adoption Tracking

After the 3-email sequence, measure:
- Feature adoption rate: % of users who tried the feature within 14 days
- Adoption by segment: which plans/personas adopted fastest
- Drop-off point: where did non-adopters stop engaging

Log findings to `./brand/learnings.md`:
```
  - [date] [/product-marketing] [Feature] adoption: [X]%
    after 3-email sequence. Segment [A] adopted at [Y]%,
    segment [B] at [Z]%. Email 2 (use case) drove most
    activations. Consider more case study content.
```

---

## Social Announcement Formats

Different platforms demand different announcement formats. Here are the proven structures.

### Twitter/X Thread Format

For features that need explanation, use a thread:

```
  Tweet 1 (Hook):
  "We just shipped [outcome].
  Here's what it means for your [workflow]: (thread)"

  Tweet 2 (The Problem):
  "Before: [pain point in 2 sentences]"

  Tweet 3 (The Solution):
  "Now: [what the feature does, with screenshot/GIF]"

  Tweet 4 (The Detail):
  "[Specific metric or comparison that proves value]"

  Tweet 5 (The CTA):
  "Try it now: [link]
  Or reply with questions -- happy to walk you through it."
```

**Rules:**
- Tweet 1 must stand alone (many won't click the thread)
- Include a visual in Tweet 3 (screenshot or GIF)
- End with engagement prompt (questions welcome)
- 5 tweets max for feature announcements. Save long threads for launches.

### LinkedIn Post Format

LinkedIn rewards depth and professional framing:

```
  Line 1: [Bold statement about what you shipped]
  Line 2: (blank -- creates the "see more" break)
  Line 3-5: The problem this solves (relatable scenario)
  Line 6-8: What we built and why (behind-the-scenes angle)
  Line 9-10: The result or early feedback
  Line 11: CTA or question for engagement
  Line 12: (blank)
  Line 13: [Link in comments]
```

**Rules:**
- First line must hook. No "Excited to announce..."
- Put the link in comments, not the post (better reach)
- Include a screenshot as the post image
- End with a question to drive comments
- Tag 2-3 people who helped build it (team visibility)

### Carousel Format (LinkedIn / Instagram)

For visual features or multi-step workflows:

```
  Slide 1: Bold headline + "Swipe to see how"
  Slide 2: The problem (before state)
  Slide 3: The solution (after state)
  Slide 4-6: Step-by-step walkthrough with screenshots
  Slide 7: Result or metric
  Slide 8: CTA + link
```

**Rules:**
- 8-10 slides max
- One idea per slide
- Consistent design system (brand colors, fonts)
- Text large enough to read on mobile
- Slide 1 must stop the scroll (bold claim or surprising stat)

### Video Format (Twitter/X, LinkedIn, Product Hunt)

For features that are easier to show than explain:

```
  0:00-0:03  Hook: text overlay with outcome
  0:03-0:15  Show the feature in action (screen recording)
  0:15-0:25  Show the result or output
  0:25-0:30  CTA: text overlay with link

  Total: 30 seconds MAX for social
  60-90 seconds for Product Hunt or blog embed
```

**Rules:**
- No intro. Start with the feature immediately.
- No music unless it adds to the demo
- Captions on all social video (80% watch without sound)
- Screen recording at 1.5x speed for repetitive steps
- End on the result, not on your logo
