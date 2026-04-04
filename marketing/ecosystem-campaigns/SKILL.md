---
name: ecosystem-campaigns
version: 1.0
description: "Orchestrate marketing campaigns that span multiple Kinetiks products. Use when planning cross-brand campaigns, content-to-pipeline funnels, ecosystem onboarding, cross-product launches, or customer success loops. Triggers on: cross-brand campaign, ecosystem play, multi-product launch, content to pipeline, customer loop, cross-promote, introduce other products, onboard to ecosystem. Loads ALL brand summaries and ecosystem context. Generates campaign briefs with per-brand asset lists, handoff points, and visual flow diagrams. Reads: all brand summaries, _ecosystem.md. Writes: ./campaigns/{campaign-slug}/brief.md, per-brand briefs. Chains-to: /product-marketing, /direct-response-copy, /email-sequences, /content-atomizer, /creative."
---

# Ecosystem Campaigns

A single product solves a single problem. An ecosystem solves a workflow. The Kinetiks portfolio -- Dark Madder, Hypothesis, Harvest, Litmus -- is not four separate products. It is a compounding growth engine where each brand feeds the others.

Most multi-product companies treat cross-promotion as an afterthought. A footer link here, a "check out our other products" banner there. That is not ecosystem marketing. That is clutter.

Ecosystem marketing is deliberate. Each brand plays a specific role at a specific moment in the buyer's journey. The handoffs are designed, not accidental. The timing is sequenced, not simultaneous. And the result is a flywheel that accelerates with every campaign.

This skill plans and coordinates campaigns that span multiple Kinetiks brands, turning the portfolio into a growth engine that no single-product competitor can replicate.

Read `./brand/` per `_system/brand-memory.md`

Follow all output formatting rules from `_system/output-format.md`

---

## Ecosystem Context Loading

This skill needs the full picture. Load ALL brand context on invocation.

### Required Context

1. **Load `_ecosystem.md`** (if exists):
   - Understand the Kinetiks brand architecture
   - Know how products relate to each other
   - Map the ecosystem funnel: awareness, conversion, capture, amplification
   - Show: "Ecosystem map loaded. [N] brands active."

2. **Load ALL brand summaries** from `./brand/{brand-name}/`:
   For each Kinetiks brand, load:
   - `product.md` -- what the product does, core capabilities
   - `voice-profile.md` -- how the brand speaks
   - `positioning.md` -- market angle and differentiators
   - `audience.md` -- who the product serves

   Show a quick status:
   ```
   Ecosystem brands loaded:
   ├── Dark Madder (DM)     ✓ content + media
   ├── Hypothesis (HT)      ✓ conversion + testing
   ├── Harvest (HV)         ✓ pipeline + CRM
   └── Litmus (LT)          ✓ PR + amplification
   ```

3. **Load `./brand/assets.md`** (if exists):
   - Know what assets already exist across brands
   - Identify reusable content and gaps

4. **Load `./brand/learnings.md`** (if exists):
   - Know what has worked in previous campaigns
   - Apply cross-brand learnings to new campaign design

### Handling Missing Context

If `_ecosystem.md` does not exist:
- Ask the user to describe the Kinetiks brand portfolio
- Or proceed with the brands that have `./brand/{brand-name}/` directories
- Note: "No ecosystem map found. I'll work with the brand profiles I can find, or you can describe the portfolio."

If individual brand directories are missing:
- Load what exists. Note what is missing.
- Do not block the campaign. Design around available brands.
- Suggest: "Running /brand-voice for [missing brand] would give me context to include them properly."

---

## Core Job

Orchestrate marketing campaigns that span multiple Kinetiks products, turning the ecosystem into a compounding growth engine.

The fundamental insight: a prospect who enters through Dark Madder content is 3-5x more likely to convert on Hypothesis if the handoff is designed, not accidental. A customer who succeeds with Harvest is a Litmus PR story waiting to happen. And that PR story generates awareness that feeds Dark Madder content, closing the loop.

Every ecosystem campaign has three properties:
1. **Multiple brands contribute** -- each playing a distinct role
2. **Handoffs are explicit** -- the moment a prospect moves from one brand's orbit to another is designed and tracked
3. **The whole exceeds the parts** -- the campaign produces results that no single brand could achieve alone

---

## Mode Detection

What type of ecosystem campaign? Ask the user or infer from context:

  ①  CONTENT-TO-PIPELINE
     Dark Madder content drives awareness.
     Hypothesis landing pages convert interest.
     Harvest captures and nurtures the pipeline.
     The classic top-to-bottom funnel, powered by
     multiple brands.

  ②  PRODUCT LAUNCH
     A new feature or product that involves multiple
     brands. Each brand contributes launch assets
     from its own channel and voice.

  ③  CUSTOMER SUCCESS LOOP
     Harvest closes a deal. Dark Madder writes the
     case study. Litmus turns it into PR. The PR
     generates new awareness. The loop closes.

  ④  ECOSYSTEM ONBOARDING
     A new user signs up for one product and gets
     introduced to sibling products at the right
     moments. Not on day one. When they are ready.

  ⑤  CUSTOM CAMPAIGN
     User describes a cross-brand goal. We design
     the campaign from scratch, assigning brand
     roles and handoff points.

Each mode follows a specific methodology below. State which mode you are using before generating.

---
---

# The Kinetiks Ecosystem Model

Before diving into modes, understand the brand roles. Every ecosystem campaign assigns brands to roles in the funnel.

---

## Brand Roles

```
  THE KINETIKS FUNNEL

  ┌─────────────────────────────────────────────┐
  │                                             │
  │  AWARENESS        Dark Madder (DM)          │
  │  Content, media, thought leadership.        │
  │  Brings strangers into the Kinetiks orbit.  │
  │                                             │
  │          ↓ handoff: engaged audience ↓      │
  │                                             │
  │  CONVERSION       Hypothesis (HT)           │
  │  Landing pages, testing, optimization.      │
  │  Turns attention into action.               │
  │                                             │
  │          ↓ handoff: qualified lead ↓        │
  │                                             │
  │  CAPTURE          Harvest (HV)              │
  │  Pipeline, CRM, deal management.            │
  │  Turns action into revenue.                 │
  │                                             │
  │          ↓ handoff: customer story ↓        │
  │                                             │
  │  AMPLIFICATION    Litmus (LT)               │
  │  PR, media, earned coverage.                │
  │  Turns customer success into awareness.     │
  │                                             │
  │          ↓ feeds back to top ↓              │
  │                                             │
  └─────────────────────────────────────────────┘
```

### Role Assignments

Not every campaign uses all four brands. The mode determines which brands participate and what role they play:

| Role | Primary Brand | What They Contribute |
|------|--------------|---------------------|
| Awareness | Dark Madder | Blog posts, social content, newsletters, podcasts |
| Conversion | Hypothesis | Landing pages, A/B tests, lead magnets, CTAs |
| Capture | Harvest | Pipeline management, email sequences, deal tracking |
| Amplification | Litmus | Press releases, media pitches, case study distribution |

A campaign may have:
- All four brands (full funnel)
- Two brands (e.g., DM content + HT conversion)
- Three brands (e.g., DM + HT + HV, no PR angle)

The skill determines which brands are needed based on the campaign goal.

---

## Handoff Points

The handoff is where one brand's job ends and another's begins. Every handoff must be:

1. **Trackable** -- UTM parameters, lead source tags, or pipeline triggers
2. **Seamless** -- the user does not feel a "brand switch"
3. **Timed** -- happens at the right moment in the buyer's journey

### Handoff Mechanics

**DM to HT (Awareness to Conversion)**
- Trigger: user clicks CTA in DM content
- Mechanic: UTM-tagged link to HT landing page
- UTM structure: `?utm_source=dark-madder&utm_medium={content-type}&utm_campaign={campaign-slug}`
- HT landing page matches the content's promise (no bait-and-switch)
- Voice shift: DM's editorial voice transitions to HT's conversion-focused voice

**HT to HV (Conversion to Capture)**
- Trigger: user submits form, starts trial, or books demo on HT page
- Mechanic: lead data flows to HV pipeline (via integration or webhook)
- Lead source tag: `ht-{campaign-slug}-{asset-type}`
- HV assigns lead to appropriate nurture sequence
- Voice shift: HT's product-focused voice transitions to HV's relationship-focused voice

**HV to LT (Capture to Amplification)**
- Trigger: deal closes, customer achieves milestone, or NPS score is high
- Mechanic: HV flags customer for case study outreach
- LT receives customer profile + success metrics
- LT crafts PR angle based on customer's story
- Voice shift: HV's business voice transitions to LT's media-ready voice

**LT to DM (Amplification to Awareness)**
- Trigger: press coverage publishes or case study goes live
- Mechanic: DM repurposes coverage into content (social posts, newsletter features, blog analysis)
- Attribution: link back to original coverage with proper credit
- Voice shift: LT's press voice transitions back to DM's editorial voice

---
---

# Mode 1: Content-to-Pipeline

The most common ecosystem campaign. DM content attracts, HT converts, HV captures.

---

## Campaign Design

### Step 1: Define the Pipeline Goal

What does success look like at the bottom of the funnel?
- Number of qualified leads
- Revenue target
- Specific customer segment to acquire
- Timeline

Work backward from the goal to determine content volume.

### Step 2: Map the Content Path

```
  CONTENT-TO-PIPELINE FLOW

  DM: Publish [content type] on [channel]
  │   Topic: [aligned with HT product value]
  │   CTA: [soft, value-first]
  │
  ├── Reader clicks CTA
  │
  HT: Landing page / lead magnet
  │   Offer: [continuation of content's value]
  │   Form: [minimal friction capture]
  │
  ├── User submits form
  │
  HV: Pipeline entry
  │   Sequence: [nurture appropriate to entry point]
  │   Scoring: [based on engagement level]
  │
  └── Qualified lead → sales conversation
```

### Step 3: Assign Per-Brand Assets

For each brand in the campaign, specify:

**Dark Madder (Awareness)**
```
  DM ASSETS

  ├── Blog post: "[Topic aligned with campaign]"
  │   Word count: 1,500-2,500
  │   CTA: Links to HT landing page
  │
  ├── LinkedIn post: Thread format
  │   Hook: [specific to DM audience]
  │   CTA: Link to blog post or direct to HT
  │
  ├── Newsletter feature: 200-word spotlight
  │   Placement: [section of newsletter]
  │   CTA: "Read the full piece" → blog
  │
  └── Twitter/X thread: 5-7 tweets
      Hook: [insight from the content]
      CTA: Final tweet links to HT
```

**Hypothesis (Conversion)**
```
  HT ASSETS

  ├── Landing page
  │   Headline: [continues DM content's promise]
  │   Body: Problem → solution → proof → CTA
  │   Form: Name, email, company size
  │
  ├── Lead magnet (optional)
  │   Format: [PDF, template, tool, calculator]
  │   Value: [specific deliverable related to content]
  │
  └── Thank-you page
      Confirms delivery
      Soft intro to HT product features
      Optional: "While you're here, try [feature]"
```

**Harvest (Capture)**
```
  HV ASSETS

  ├── Nurture sequence: 5-email series
  │   Email 1: Deliver value (Day 0)
  │   Email 2: Expand on topic (Day 2)
  │   Email 3: Case study (Day 5)
  │   Email 4: Product bridge (Day 8)
  │   Email 5: Direct CTA (Day 12)
  │
  ├── Lead scoring rules
  │   +10: Downloaded lead magnet
  │   +5: Opened 3+ emails
  │   +15: Visited pricing page
  │   +20: Booked demo
  │
  └── Sales handoff trigger
      Score threshold: [number]
      Action: Assign to rep + send alert
```

### Step 4: Define Success Metrics

```
  CAMPAIGN METRICS

  ├── DM: Content reach
  │   ├── Page views / impressions
  │   ├── Engagement rate
  │   └── Click-through to HT
  │
  ├── HT: Conversion rate
  │   ├── Landing page conversion %
  │   ├── Lead magnet downloads
  │   └── Form submissions
  │
  └── HV: Pipeline value
      ├── Leads entered
      ├── Leads qualified
      ├── Deals created
      └── Revenue attributed
```

---
---

# Mode 2: Product Launch (Cross-Brand)

When a new product or major feature launches, the entire ecosystem amplifies it.

---

## Cross-Brand Launch Framework

### Brand Role Assignment

```
  LAUNCH: [Product/Feature Name]

  DM (Awareness):
  ├── Pre-launch teaser content (2 weeks before)
  ├── Launch day blog post (the story behind it)
  ├── Social campaign (multi-day, multi-platform)
  └── Newsletter feature in next issue

  HT (Conversion):
  ├── Dedicated landing page for the launch
  ├── A/B test variants for headline/CTA
  ├── Lead capture form (waitlist or trial)
  └── Launch-specific lead magnet

  HV (Capture):
  ├── Launch email sequence to existing pipeline
  ├── Re-engagement sequence for dormant leads
  ├── Sales team briefing + battle card update
  └── Demo script updated with new feature

  LT (Amplification):
  ├── Press release drafted and distributed
  ├── Media outreach to category journalists
  ├── Founder interview availability
  └── Post-launch coverage roundup
```

### Timeline

```
  CROSS-BRAND LAUNCH TIMELINE

  T-14  DM: First teaser content published
        HT: Landing page in draft
        HV: Sales team briefed
        LT: Press list finalized

  T-7   DM: Behind-the-scenes content
        HT: Landing page live (hidden, for testing)
        HV: Launch email sequence drafted
        LT: Embargo pitches sent to media

  T-3   DM: "Coming soon" social posts
        HT: A/B test on landing page running
        HV: Email sequence loaded in ESP
        LT: Media confirmations received

  T-0   ALL: Launch day
        DM: Blog + social blitz
        HT: Landing page public + CTA live
        HV: Launch email sent to full list
        LT: Press embargo lifts

  T+3   DM: Reaction roundup content
        HT: Optimize based on Day 1-3 data
        HV: Follow-up email to non-converters
        LT: Share press coverage across channels

  T+7   DM: Deep-dive content (use case article)
        HT: Retarget page visitors
        HV: Qualified lead follow-up
        LT: Pitch follow-up stories

  T+14  ALL: Campaign retrospective
        Log learnings to ./brand/learnings.md
```

---
---

# Mode 3: Customer Success Loop

The most powerful ecosystem play. A customer's success becomes the fuel for the next customer's awareness.

---

## The Loop

```
  CUSTOMER SUCCESS LOOP

  HV closes deal
  │
  ├── Customer uses product, achieves result
  │
  DM writes case study
  │   ├── Blog post: "[Customer] achieved [result]"
  │   ├── Social: Key metrics + quote
  │   └── Newsletter feature
  │
  LT turns it into PR
  │   ├── Press release: "[Customer] partners with Kinetiks"
  │   ├── Media pitch: Industry angle on the result
  │   └── Founder quote for journalist
  │
  PR generates awareness
  │   ├── Media coverage published
  │   └── DM repurposes coverage into new content
  │
  └── New prospects enter the funnel → back to top
```

### Triggering the Loop

**When to activate:**
- Customer achieves a measurable milestone (revenue, time saved, metric improved)
- Customer NPS score is 9 or 10
- Customer has been active for 90+ days
- Customer gives spontaneous positive feedback

**How to activate:**
1. HV flags the customer to the marketing team
2. DM conducts a 30-minute interview (5 questions)
3. DM writes the case study (3 formats: blog, social, one-pager)
4. LT assesses PR potential (is this a story journalists would cover?)
5. If yes: LT runs media outreach
6. Coverage feeds back into DM content calendar

### Case Study Interview Template

Five questions that produce usable marketing content:

1. "What were you doing before [Product]? Walk me through a typical day."
   (Captures the "before" state for problem framing)

2. "What made you decide to try [Product]? What was the final trigger?"
   (Captures the buying moment for positioning)

3. "What happened in the first week? What surprised you?"
   (Captures the onboarding experience for PLG content)

4. "Can you give me a specific number? Revenue, time saved, deals closed -- anything concrete."
   (Captures the proof point for all marketing assets)

5. "What would you tell someone who's considering [Product] but hasn't pulled the trigger?"
   (Captures a testimonial quote ready to use)

---
---

# Mode 4: Ecosystem Onboarding

Introduce sibling products at the right time, not all at once.

---

## The Timing Principle

When someone signs up for Hypothesis, do not immediately pitch them on Dark Madder, Harvest, and Litmus. They signed up for one thing. Let them succeed at that one thing first. Then, when the natural moment arrives, introduce the next product as the obvious next step.

### Onboarding Timeline

```
  ECOSYSTEM ONBOARDING SEQUENCE

  Day 0-7: PRODUCT FOCUS
  │  Focus entirely on the product they signed up for.
  │  Help them reach their "aha moment."
  │  Zero cross-product mentions.
  │
  Day 7-14: SOFT AWARENESS
  │  Mention sibling products in context, not as pitches.
  │  "Teams that use [Product] often pair it with
  │   [Sibling] for [specific outcome]."
  │  One mention per week max.
  │
  Day 14-30: CONTEXTUAL INTRODUCTION
  │  When the user hits a workflow boundary that a
  │  sibling product solves, introduce it.
  │  "You've set up 12 A/B tests in Hypothesis.
  │   Want to track which ones drive pipeline?
  │   That's what Harvest does."
  │
  Day 30+: ECOSYSTEM VALUE
  │  Show the combined value of using multiple products.
  │  "Teams using Hypothesis + Harvest see 2.3x more
  │   qualified leads than Hypothesis alone."
  │  Offer ecosystem pricing or bundle.
```

### Trigger-Based Cross-Product Introductions

Do not introduce sibling products on a calendar. Introduce them when the user's behavior signals readiness:

```
  TRIGGER MAP

  User action in HT             Introduce
  ─────────────────────────────────────────────
  Created 5+ landing pages   →  DM for content
  Hit traffic ceiling        →  DM for awareness
  Asked about lead capture   →  HV for pipeline
  Wants case studies         →  LT for PR

  User action in DM             Introduce
  ─────────────────────────────────────────────
  Published 10+ articles     →  HT for conversion
  Getting traffic, no leads  →  HT for lead capture
  Has customer stories       →  LT for amplification

  User action in HV             Introduce
  ─────────────────────────────────────────────
  Pipeline full, top empty   →  DM for awareness
  Needs landing pages        →  HT for conversion
  Closed big deal            →  LT for case study PR

  User action in LT             Introduce
  ─────────────────────────────────────────────
  Coverage published         →  DM to repurpose
  Needs more stories         →  HV for customer flags
  Wants conversion from PR   →  HT for landing pages
```

### Cross-Product Email Templates

**Template: The Contextual Bridge**
```
  Subject: Your [Product A] data + [Product B] = [outcome]

  You've been using [Product A] for [X] weeks and
  [specific achievement: "created 8 landing pages",
  "published 12 articles", "closed 5 deals"].

  Teams at your stage usually hit [specific wall:
  "the traffic ceiling", "the pipeline gap",
  "the content bottleneck"].

  That's exactly what [Product B] solves.
  [One sentence on what Product B does].

  → See how [Product A] + [Product B] work together

  Not interested? No worries. Just reply "pass"
  and I won't mention it again.
```

**Template: The Ecosystem ROI**
```
  Subject: Teams using 2+ Kinetiks products see [X]x [metric]

  Quick stat: teams that use [Product A] alongside
  [Product B] generate [X]% more [leads/revenue/coverage]
  than teams using [Product A] alone.

  Here's why: [one sentence explaining the synergy]

  [Customer name] added [Product B] in month 3 and
  saw [specific result] within [timeframe].

  → Explore ecosystem pricing

  Already have what you need? Reply "all set" and
  I'll focus on [Product A] tips instead.
```

---
---

# Mode 5: Custom Campaign

The user describes a cross-brand goal. We design the campaign from scratch.

---

## Custom Campaign Design Process

### Step 1: Understand the Goal

Ask (or infer):
- What is the business objective? (leads, revenue, awareness, retention)
- What is the timeline? (sprint, quarter, ongoing)
- Which brands are involved? (or should the skill recommend?)
- What assets already exist? (check ./campaigns/ and ./brand/assets.md)

### Step 2: Assign Brand Roles

Based on the goal, assign each participating brand a role:

```
  CAMPAIGN: [User's Goal]

  Brand assignments:
  ├── DM → [Role: awareness / content / ...]
  │   Contribution: [specific assets]
  │
  ├── HT → [Role: conversion / testing / ...]
  │   Contribution: [specific assets]
  │
  ├── HV → [Role: capture / nurture / ...]
  │   Contribution: [specific assets]
  │
  └── LT → [Role: amplification / PR / ...]
      Contribution: [specific assets]
```

### Step 3: Design Handoff Points

For each brand-to-brand transition:
- What triggers the handoff?
- What data or context transfers?
- How is it tracked (UTMs, tags, triggers)?
- What does the user experience?

### Step 4: Generate Campaign Brief

Write a complete campaign brief to `./campaigns/{campaign-slug}/brief.md` using the campaign-brief schema.

### Step 5: Generate Per-Brand Briefs

For each participating brand, write a focused brief:
- `./campaigns/{campaign-slug}/{brand-name}-brief.md`
- What this brand contributes
- Assets to create (with specs)
- Timeline for this brand's deliverables
- Handoff responsibilities (what they send, what they receive)

---
---

# Campaign Brief Generation

Every ecosystem campaign produces a structured brief.

---

## Brief Structure

The campaign brief follows `_system/schemas/campaign-brief.schema.json` and includes ecosystem-specific extensions:

```
  ECOSYSTEM CAMPAIGN BRIEF

  Campaign:     [Name]
  Type:         [Mode 1-5]
  Goal:         [Measurable objective]
  Timeline:     [Start] → [End]
  Status:       planning

  ──────────────────────────────────────────────

  BRAND ROLES

  ├── DM: [Role + primary deliverable]
  ├── HT: [Role + primary deliverable]
  ├── HV: [Role + primary deliverable]
  └── LT: [Role + primary deliverable]

  ──────────────────────────────────────────────

  CAMPAIGN FLOW

  [Visual flow diagram using box-drawing characters]
  [Shows the path from awareness to conversion
   to capture to amplification, with handoff
   points marked]

  ──────────────────────────────────────────────

  PER-BRAND ASSET LIST

  Dark Madder:
  ├── [Asset 1]: [spec] — [deadline]
  ├── [Asset 2]: [spec] — [deadline]
  └── [Asset 3]: [spec] — [deadline]

  Hypothesis:
  ├── [Asset 1]: [spec] — [deadline]
  └── [Asset 2]: [spec] — [deadline]

  Harvest:
  ├── [Asset 1]: [spec] — [deadline]
  └── [Asset 2]: [spec] — [deadline]

  Litmus:
  ├── [Asset 1]: [spec] — [deadline]
  └── [Asset 2]: [spec] — [deadline]

  ──────────────────────────────────────────────

  HANDOFF POINTS

  DM → HT: [trigger, mechanic, tracking]
  HT → HV: [trigger, mechanic, tracking]
  HV → LT: [trigger, mechanic, tracking]
  LT → DM: [trigger, mechanic, tracking]

  ──────────────────────────────────────────────

  SUCCESS METRICS

  ├── Awareness:  [metric + target]
  ├── Conversion: [metric + target]
  ├── Capture:    [metric + target]
  └── Amplification: [metric + target]
```

---

## Visual Campaign Flow Diagram

Every ecosystem campaign brief includes a visual flow using box-drawing characters. The diagram shows the path from awareness through amplification, with brand ownership and handoff points clearly marked.

Example for a Content-to-Pipeline campaign:

```
  ┌─────────────┐    utm_source=dm    ┌─────────────┐
  │ DARK MADDER │───────────────────→│ HYPOTHESIS  │
  │             │                     │             │
  │ Blog post   │                     │ Landing pg  │
  │ Social      │                     │ Lead magnet │
  │ Newsletter  │                     │ A/B test    │
  └─────────────┘                     └──────┬──────┘
                                             │
                                      form submit
                                             │
                                      ┌──────┴──────┐
                                      │  HARVEST    │
                                      │             │
                                      │ Pipeline    │
                                      │ Nurture seq │
                                      │ Lead score  │
                                      └──────┬──────┘
                                             │
                                       deal closed
                                             │
  ┌─────────────┐   coverage repurpose ┌─────┴───────┐
  │ DARK MADDER │←────────────────────│  LITMUS     │
  │             │                     │             │
  │ Repurpose   │                     │ Case study  │
  │ into content│                     │ Press pitch │
  └─────────────┘                     └─────────────┘
```

Adapt the diagram to the specific campaign's flow. Not every campaign follows the full funnel.

---
---

# Output Formatting

Follow `_system/output-format.md` -- all 4 required sections.

---

## Section 1: Header

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ECOSYSTEM CAMPAIGN: [CAMPAIGN NAME]
  Generated [Month Day, Year]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Section 2: Content

The campaign brief summary, visual flow diagram, per-brand asset list, and timeline. Full briefs are saved as files. The terminal output provides the overview.

---

## Section 3: Files Saved

```
  FILES SAVED

  ./campaigns/{slug}/brief.md               ✓
  ./campaigns/{slug}/dm-brief.md             ✓
  ./campaigns/{slug}/ht-brief.md             ✓
  ./campaigns/{slug}/hv-brief.md             ✓
  ./campaigns/{slug}/lt-brief.md             ✓
  ./brand/assets.md                          ✓ (updated)
```

Only list files for brands that participate in the campaign.

---

## Section 4: What's Next

```
  WHAT'S NEXT

  Your ecosystem campaign brief is saved with
  per-brand briefs for each participating team.
  Recommended next moves:

  → /product-marketing    Build launch assets for
                         [primary brand] (~20 min)
  → /direct-response-copy Write the landing page
                         copy for HT (~15 min)
  → /email-sequences     Build the HV nurture
                         sequence (~15 min)
  → /content-atomizer    Break DM content into
                         social assets (~10 min)

  Or tell me which brand's assets to build first
  and I'll start there.
```

Tailor suggestions to the campaign mode:
- Content-to-Pipeline: suggest writing the DM content first, then HT landing page
- Product Launch: suggest /product-marketing for the launch plan
- Customer Success Loop: suggest starting with the case study interview
- Ecosystem Onboarding: suggest /email-sequences for the onboarding flow
- Custom: suggest the highest-impact brand's assets first

---
---

# Feedback Collection

After delivering an ecosystem campaign brief, collect feedback per `_system/brand-memory.md` feedback protocol.

```
  How did this campaign perform?

  a) Ran as planned -- all brands executed
  b) Ran partially -- some brands participated
  c) Redesigned significantly before running
  d) Haven't launched yet

  (Answer later by running this skill again.)
```

Process feedback and append findings to `./brand/learnings.md`. Ecosystem campaign learnings are especially valuable -- they reveal which brand handoffs work and which create friction.
