# Competitive Battlecards

Reference material for `/product-marketing` Mode 3: Competitive Battlecard.
Load this file when building battlecards, comparison pages, or "Alternative to X" content.

---

## Battlecard Structure Deep-Dive

A battlecard is not a rant about why competitors are bad. It is a structured intelligence document that helps sales reps, marketers, and founders win competitive deals by knowing exactly what to say and when to say it.

### The Four Quadrant Framework

Organize competitive intelligence into four quadrants:

```
  ┌──────────────────────┬──────────────────────┐
  │                      │                      │
  │  THEIR STRENGTHS     │  THEIR WEAKNESSES    │
  │                      │                      │
  │  What they genuinely │  Where they fall      │
  │  do well. Be honest. │  short. With evidence.│
  │                      │                      │
  ├──────────────────────┼──────────────────────┤
  │                      │                      │
  │  OUR ADVANTAGES      │  OBJECTION HANDLING  │
  │                      │                      │
  │  Where we win,       │  What prospects say   │
  │  mapped to their     │  and how to respond.  │
  │  weaknesses.         │                      │
  │                      │                      │
  └──────────────────────┴──────────────────────┘
```

### Their Strengths: The Honesty Section

Most battlecards skip this. That is why most battlecards are useless. If your sales rep walks into a deal and the prospect says "but [Competitor] has X" and the rep has no answer, you lose.

For each strength, document:

1. **What they do well** -- specific feature or capability
2. **Why it matters** -- what problem it solves for the buyer
3. **How to acknowledge it** -- the exact words to say

```
  Strength: [Competitor] has a mobile app

  Why it matters: Field teams need access on the go.
  Buyers who manage remote teams will ask about this.

  How to acknowledge: "You're right, [Competitor]
  has a native mobile app. If mobile access is your
  top priority, they're a solid choice for that
  specific use case. What we've found is that most
  teams in [your industry] spend 90% of their time
  in the desktop app, and our desktop experience
  is where we invested -- it's 3x faster for the
  workflows that take up most of your day. But let
  me ask: how much of your team's work happens on
  mobile vs desktop?"
```

The pattern: acknowledge, redirect to your strength, ask a question that reveals their real priority.

### Their Weaknesses: The Evidence Section

Weaknesses must be backed by evidence, not opinion. Sources:

**Tier 1: Strongest evidence**
- G2 reviews (filtered to recent, verified, your ICP)
- Capterra reviews (same filters)
- Customer churn reasons (if you have access to competitor churn data)
- Public complaints (Twitter/X, Reddit, Hacker News)

**Tier 2: Moderate evidence**
- Your own testing of their product
- Feedback from prospects who evaluated both
- Industry analyst reports
- Their own documentation gaps (features they "plan to add")

**Tier 3: Directional evidence**
- Glassdoor reviews (culture issues that affect product quality)
- Funding/runway concerns (affects long-term viability)
- Engineering blog posts revealing technical debt
- Support forum response times

For each weakness, document:

```
  Weakness: Slow customer support

  Evidence:
  ├── G2: 3.2/5 avg for support (47 reviews)
  ├── Twitter: 12 complaints about response time in Q1
  ├── Their status page: 3 incidents with 4+ hour response
  └── Our prospect survey: 6/10 cited support as concern

  Impact on buyer: When something breaks, they wait.
  For teams running production workloads, this means
  downtime costs real revenue.

  Our counter: "Our median first response is 47 minutes.
  Here's our public status page showing 99.95% uptime."
```

### Our Advantages: The Mapping Section

Do not list random advantages. Map each one to a competitor weakness:

```
  Their weakness         Our advantage
  ─────────────────────────────────────────────
  Slow support           47-min median response
  No API                 Full REST + GraphQL API
  Per-seat pricing       Flat rate, unlimited users
  Complex onboarding     Self-serve in under 5 min
  No integrations        12 deep, maintained integrations
```

For each mapping, prepare:
- The one-liner version (for quick objection handling)
- The proof version (with specific numbers or evidence)
- The demo version (what to show in a live demo that proves it)

### Objection Handling: The Script Section

The top 5-7 objections, with scripted responses. Each response follows the ACE framework:

**A - Acknowledge** the concern. Do not dismiss it.
**C - Counter** with your advantage, backed by proof.
**E - Evidence** with a specific customer story or metric.

```
  Objection: "[Competitor] is cheaper."

  A: "I understand price is a factor. [Competitor]
     does have a lower starting price."

  C: "What we've seen is that teams outgrow their
     free tier within 3 months and end up paying more
     on [Competitor]'s per-seat model than they would
     on our flat rate. At 10 team members, we're
     actually 40% less expensive."

  E: "[Customer] switched from [Competitor] after
     their monthly bill hit $890 for 15 seats. They
     pay us $199/month flat. That's $8,292 saved in
     year one."
```

---

## Comparison Page Frameworks

External comparison pages ("Us vs Them" or "Alternative to X") are high-intent SEO pages. Buyers searching "[Competitor] alternative" are actively evaluating. These pages convert at 3-5x the rate of generic landing pages.

### Framework 1: The Honest Comparison

The most effective format. Be genuinely fair.

```
  PAGE STRUCTURE

  Hero:
  "[Product] vs [Competitor]: An honest comparison"
  "We'll tell you where we win, where they win,
  and help you pick the right tool for your team."

  Section 1: Quick Summary Table
  Feature-by-feature comparison with checkmarks
  (be honest -- show features they have that you don't)

  Section 2: Where We're Better
  3-5 advantages with evidence and screenshots

  Section 3: Where They're Better
  1-2 genuine advantages they have
  (this builds massive trust)

  Section 4: Who Should Choose Us
  Specific use cases, team sizes, priorities

  Section 5: Who Should Choose Them
  Be honest. If they're better for a specific use case,
  say so. You'll earn trust from every other visitor.

  Section 6: Customer Stories
  2-3 people who switched FROM them TO you, with reasons

  Section 7: CTA
  "Try [Product] free for 14 days. No credit card."
```

**Why honesty wins:** Prospects who read a page that admits competitor strengths trust everything else on the page 3x more than prospects who read a page that claims you are better at everything. Nobody believes you are better at everything.

### Framework 2: The Migration Guide

For products where switching costs are a real concern:

```
  PAGE STRUCTURE

  Hero:
  "Switching from [Competitor] to [Product]"
  "Here's exactly what happens, step by step."

  Section 1: What migrates automatically
  (data, settings, integrations)

  Section 2: What you'll need to set up
  (honest about the work required)

  Section 3: Timeline
  "Most teams complete migration in [X] hours/days"

  Section 4: Migration support
  "Our team will help. Here's what we do for you."

  Section 5: What you'll gain
  Feature improvements they'll get after switching

  Section 6: What stays the same
  Reassurance that core workflows won't break

  CTA: "Book a 15-minute migration walkthrough"
```

### Framework 3: The Category Page

For targeting "[category] tools" or "best [category] software" searches:

```
  PAGE STRUCTURE

  Hero:
  "The best [category] tools in [year], compared"

  Section 1: Quick ranking table
  4-6 tools compared (including yours)
  Score on 5-6 criteria relevant to the buyer

  Section 2: Individual reviews
  150-200 words per tool, genuinely fair
  Your tool gets slightly more depth (natural, not biased)

  Section 3: How to choose
  Decision framework based on team size, budget, use case

  Section 4: Our recommendation
  "If you're [ICP], we built [Product] for you."

  CTA: "Start free"
```

---

## "Alternative to X" Content Patterns

"[Competitor] alternative" keywords are purchase-intent gold. Here is how to build content that ranks and converts.

### SEO Targeting

**Primary keywords:**
- "[Competitor] alternative"
- "[Competitor] alternatives"
- "best [Competitor] alternative"
- "[Competitor] vs [Your Product]"
- "switch from [Competitor]"

**Long-tail keywords:**
- "[Competitor] alternative for [use case]"
- "[Competitor] alternative for small teams"
- "cheaper alternative to [Competitor]"
- "[Competitor] alternative with [specific feature]"

### Content Structure for "Alternative to X"

```
  H1: Best [Competitor] Alternatives in [Year]

  Intro: Why people look for alternatives
  (acknowledge competitor strengths first)

  Alternative 1: [Your Product] -- best for [use case]
  - What it does differently
  - Pricing comparison
  - Who it's best for
  - Screenshot

  Alternative 2-5: Other real alternatives
  (yes, include actual competitors -- this ranks better
  and builds trust)

  Comparison table: all alternatives side by side

  Conclusion: Decision framework

  CTA: "Try [Your Product] free"
```

**Critical rule:** Do not make this page only about you. Include 3-5 real alternatives. Pages that only push one product rank poorly and convert poorly. Google rewards comprehensive comparison content. Buyers trust comprehensive comparison content. Both incentives align.

---

## Win/Loss Analysis Templates

Win/loss analysis turns competitive deals into intelligence. After every competitive deal (won or lost), capture:

### Win Analysis Template

```
  WIN ANALYSIS

  Deal:          [Company name, deal size]
  Competitor:    [Who we beat]
  Deal cycle:    [Length in days]
  Decision maker: [Title/role]

  Why they chose us:
  1. [Primary reason with specific quote]
  2. [Secondary reason]
  3. [Tertiary reason]

  What almost lost the deal:
  1. [Concern they had, how we addressed it]

  Competitor's pitch:
  [What the competitor emphasized in their pitch]

  Key moment:
  [The demo, email, or conversation that tipped the deal]

  Usable quote:
  "[Exact words from the buyer about why they chose us]"
  (Get permission to use in marketing)
```

### Loss Analysis Template

```
  LOSS ANALYSIS

  Deal:          [Company name, deal size]
  Competitor:    [Who won]
  Deal cycle:    [Length in days]
  Decision maker: [Title/role]

  Why they chose competitor:
  1. [Primary reason -- be brutally honest]
  2. [Secondary reason]
  3. [Tertiary reason]

  What we did well:
  1. [Where we impressed them]

  What we should have done differently:
  1. [Specific tactical change]
  2. [Specific tactical change]

  Feature gap cited:
  [If they cited a missing feature, what was it?]

  Price sensitivity:
  [Was price a factor? How much?]

  Recovery potential:
  [Can we win this back? When? What would need to change?]
```

### Analysis Aggregation

After 10+ win/loss analyses, aggregate patterns:

```
  WIN/LOSS PATTERNS (Q1 2026)

  Top 3 reasons we win:
  1. [Reason] -- cited in [X]% of wins
  2. [Reason] -- cited in [X]% of wins
  3. [Reason] -- cited in [X]% of wins

  Top 3 reasons we lose:
  1. [Reason] -- cited in [X]% of losses
  2. [Reason] -- cited in [X]% of losses
  3. [Reason] -- cited in [X]% of losses

  Win rate by competitor:
  ├── vs [Competitor A]: [X]% (N deals)
  ├── vs [Competitor B]: [X]% (N deals)
  └── vs [Competitor C]: [X]% (N deals)

  Action items:
  1. [Product improvement to address top loss reason]
  2. [Sales training to reinforce top win reason]
  3. [Marketing content to address specific objection]
```

Log aggregated patterns to `./brand/learnings.md` and update battlecards quarterly.
