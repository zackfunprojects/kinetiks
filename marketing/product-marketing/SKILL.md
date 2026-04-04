---
name: product-marketing
version: 1.0
description: "Turn product capabilities into market demand. Use when writing feature announcements, planning product launches, building competitive battlecards, writing pricing page copy, creating integration marketing content, or designing product-led growth flows. Triggers on: announce this feature, plan a launch, write a changelog, build a battlecard, compare us to X, write pricing copy, design onboarding flow, PLG sequence, integration spotlight. Loads brand context from memory, detects existing product marketing assets, generates multi-format deliverables per mode. Reads: product.md, voice-profile.md, positioning.md, audience.md. Writes: ./campaigns/{name}/*.md, ./brand/assets.md. Chains-to: /direct-response-copy, /email-sequences, /content-atomizer, /creative."
---

# Product Marketing

Product marketing sits between the product and the market. The product team builds capabilities. Product marketing turns those capabilities into reasons to buy, reasons to stay, and reasons to tell a friend.

Most product marketing reads like a feature list someone ran through a thesaurus. "We are thrilled to announce our new robust integration." Nobody cares. What they care about is what changes for them. What they can do now that they could not do before. How much time or money or pain this eliminates.

This skill writes product marketing that starts with the customer's world and works backward to the feature.

Read `./brand/` per `_system/brand-memory.md`

Follow all output formatting rules from `_system/output-format.md`

---

## Brand Selector Protocol

Kinetiks operates multiple brands. Before generating any product marketing asset, determine which brand or product this work is for.

### Detection

1. Check the user's request for explicit brand mentions: Dark Madder (DM), Hypothesis (HT), Harvest (HV), Litmus (LT), or the Kinetiks parent brand.
2. If no brand is mentioned, check `./brand/product.md` for context on the active product.
3. If ambiguous, ask: "Which Kinetiks product is this for? Dark Madder, Hypothesis, Harvest, Litmus, or the Kinetiks ecosystem itself?"

### Brand Context Loading

Once the brand is identified, load from `./brand/{brand-name}/`:

```
./brand/{brand-name}/
  product.md          <- Product capabilities, roadmap, differentiators
  voice-profile.md    <- Brand-specific voice
  positioning.md      <- Market positioning and angles
  audience.md         <- Target users and buyer personas
```

Show which brand context loaded:
- "Working on Hypothesis. Voice: technical-but-accessible. Positioning: the conversion engine for SaaS."
- If brand directory does not exist, proceed without it and note: "No brand profile found for {brand-name}. I'll work from what you give me."

---

## Brand Memory Integration

This skill reads brand context to ensure every product marketing deliverable is consistent with established identity.

**Reads:** `product.md`, `voice-profile.md`, `positioning.md`, `audience.md` (all optional)

On invocation, check for `./brand/` and load available context:

1. **Load `product.md`** (if exists):
   - Understand product capabilities, feature set, technical architecture
   - Know the product roadmap context for launch timing
   - Show: "Product context loaded. Core value prop: [summary]."

2. **Load `voice-profile.md`** (if exists):
   - Match the brand's tone, vocabulary, rhythm in all output
   - Apply voice DNA to changelog entries, announcements, pricing copy
   - Show: "Voice profile active. Tone: [summary]."

3. **Load `positioning.md`** (if exists):
   - Use the positioning angle as the foundation for all competitive framing
   - The angle determines how features are presented relative to alternatives
   - Show: "Positioning loaded. Angle: '[angle name]'."

4. **Load `audience.md`** (if exists):
   - Know buyer personas, their technical sophistication, decision criteria
   - Match awareness level to announcement depth and pricing justification
   - Show: "Audience loaded. Primary: [persona summary]."

5. **If `./brand/` does not exist:**
   - Skip brand loading entirely. Do not error.
   - Proceed without it. Product marketing works standalone.
   - Note: "No brand profile found. Run /start-here or /brand-voice to set one up, or I'll work from the details you provide."

---

## Iteration Detection

Before starting, check if product marketing assets already exist for this project:

### If existing assets found in `./campaigns/{name}/`

Do not start from scratch. Instead:

1. Read the existing product marketing files.
2. Present a summary of what exists:
   ```
   Existing product marketing found:
   ├── changelog/           ✓  (12 entries, last: Mar 10)
   ├── battlecards/         ✓  (3 competitors mapped)
   ├── launch/              ✓  (beta invite sequence drafted)
   └── pricing/             ✗  (none yet)
   ```
3. Ask: "Do you want to update existing assets, add a new piece, or start fresh?"
   - **Update** -- load existing, identify gaps, revise
   - **Add new** -- use existing as context for consistency
   - **Start fresh** -- run the full process below

### If no assets exist

Proceed directly to mode detection.

---

## Core Job

Turn product capabilities into market demand.

Every feature your product ships is a solution to a problem someone has. Product marketing bridges the gap between what the engineering team built and what the market needs to hear. It translates capabilities into outcomes, technical specs into buyer motivation, and release notes into revenue.

---

## Mode Detection

What type of product marketing? Ask the user or infer from context:

  ①  FEATURE ANNOUNCEMENT
     Changelog entry, in-app notification, email
     announcement, social post. For shipping
     individual features or updates.

  ②  PRODUCT LAUNCH
     Beta invite, early access, GA launch, post-launch
     sequences. For major releases, new products,
     or significant version upgrades.

  ③  COMPETITIVE BATTLECARD
     How this Kinetiks product compares to alternatives.
     Internal sales enablement and external comparison
     content.

  ④  PRICING PAGE COPY
     Tier positioning, feature comparison tables, FAQ,
     value justification. For new pricing or pricing
     page rewrites.

  ⑤  INTEGRATION MARKETING
     Partner co-marketing, integration spotlight pages,
     ecosystem announcements. For new integrations or
     partnership launches.

  ⑥  PRODUCT-LED GROWTH
     Onboarding flows, activation emails, feature
     discovery sequences, upgrade nudges. For improving
     self-serve conversion.

Each mode applies a distinct methodology below. State which mode you are using before generating.

---
---

# Mode 1: Feature Announcement

Ship features so people actually notice and use them.

---

## The Problem with Most Feature Announcements

Most companies ship a feature, write a bland changelog entry, and wonder why adoption is 3%. The feature announcement is a marketing moment. Treat it like one.

Every feature announcement answers three questions:
1. What changed?
2. Why should I care?
3. What do I do now?

If your announcement does not answer all three in the first two sentences, rewrite.

---

## Announcement Package

A complete feature announcement produces 4 assets:

### Asset 1: Changelog Entry

The canonical record. Lives on the product's changelog page.

Structure:
- Date and version tag
- Headline: outcome-first, not feature-first
- 2-3 sentence description: what changed and why it matters
- Screenshot or GIF placeholder (describe what to capture)
- Technical details (optional, collapsible)

```
BAD:  "New CSV Export Feature"
GOOD: "Export any report to CSV in two clicks"

BAD:  "We've added Slack integration"
GOOD: "Get pipeline alerts in Slack without
       leaving your conversation"
```

The headline formula: [Action the user takes] + [outcome they get] + [how easy it is]

### Asset 2: In-App Notification

The announcement users see inside the product. Brief. Actionable.

Structure:
- Headline: 8 words max
- Body: 2 sentences max
- CTA: one button, verb-first ("Try it now", "See how it works")
- Dismiss option always present

Constraints:
- No jargon. A new user should understand it.
- No "we are excited." The user does not care about your emotions.
- Link to the changelog entry for details.

### Asset 3: Email Announcement

Sent to relevant user segments. Not the entire list.

Structure:
- Subject line: outcome-focused, 6-10 words
- Preview text: completes the subject line's thought
- Body: 3-paragraph max
  - Paragraph 1: What changed and why it matters to YOU
  - Paragraph 2: How it works (one specific example)
  - Paragraph 3: CTA
- Single CTA button

Segmentation guidance:
- Who should receive this? (power users, free tier, specific plan)
- Who should NOT receive this? (users who already have this, wrong segment)

### Asset 4: Social Post

Platform-specific announcement for external channels.

Produce variants for:
- LinkedIn: Professional context, "here's what we shipped and why"
- Twitter/X: Punchy, GIF-friendly, thread format for complex features
- Product Hunt: If warranted, a standalone discussion post

---

## Changelog Voice Guidelines

Reference `references/feature-announcement-frameworks.md` for patterns from Linear, Notion, Supabase, and other best-in-class changelogs.

Load the reference when writing changelog entries or email announcements.

Key principles:
- Write like a human shipped it, not like a PR team approved it
- Lead with the user's workflow, not your architecture
- Specific beats general: "2.3x faster" not "significantly improved"
- Show, do not tell: screenshot placement, GIF descriptions, code snippets

---
---

# Mode 2: Product Launch

Major releases deserve a coordinated campaign, not a single blog post.

---

## Launch Tiers

Not every launch is the same size. Determine the tier first:

### Tier 1: Minor Update
- Changelog entry + social post
- No dedicated email
- Use Mode 1 (Feature Announcement) instead

### Tier 2: Notable Feature
- Changelog + email to relevant segment + social thread
- Blog post if the feature has a story worth telling
- 1-day effort

### Tier 3: Major Launch
- Full campaign: pre-launch, launch day, post-launch
- Dedicated landing page
- Email sequence (3-5 emails)
- Social campaign (multi-day)
- Press/media coordination
- 2-4 week effort

### Tier 4: New Product / Rebrand
- Everything in Tier 3 plus:
- Beta program
- Early access sequence
- Product Hunt launch
- Partner coordination
- 4-8 week effort

---

## Launch Sequence Framework

For Tier 3 and Tier 4 launches:

### Phase 1: Pre-Launch (2-4 weeks before)

**Week -4 to -3: Build anticipation**
- Teaser content: "Something is coming" social posts
- Internal alignment: sales team briefing, support team prep
- Waitlist or early access signup page
- Seed beta users if applicable

**Week -2 to -1: Warm the audience**
- Problem-focused content: articles, posts about the pain this solves
- Behind-the-scenes content: how we built it, why we built it
- Influencer/partner seeding: give early access to key voices
- Pre-write all launch day assets

### Phase 2: Launch Day

**Hour 0: Flip the switch**
- Product goes live (or GA access opens)
- Landing page published
- Launch email sent to full list
- Social posts go live (all platforms, staggered)
- Product Hunt submission (if applicable)
- Press embargo lifts

**Hours 1-8: Ride the wave**
- Monitor social for mentions, respond to every one
- Track signup/conversion metrics in real-time
- Share live metrics with team (builds energy)
- Post follow-up content: first reactions, early wins

**Hours 8-24: Sustain momentum**
- Second social push for different time zones
- Respond to all comments, questions, objections
- Share user reactions and early testimonials
- Team celebration content (humanizes the brand)

### Phase 3: Post-Launch (1-2 weeks after)

**Days 2-3: Follow up**
- Email 2: "Here's what people are saying" (social proof)
- Address common questions from launch day
- Publish detailed blog post or guide

**Days 4-7: Deepen**
- Email 3: Use case deep-dive or tutorial
- Partner/integration announcement if applicable
- Case study from beta users

**Days 8-14: Convert stragglers**
- Email 4: Direct offer or limited-time incentive
- Retarget launch page visitors who did not convert
- Publish "lessons learned" or "launch by the numbers" content

Reference `references/saas-launch-playbook.md` for detailed frameworks on Product Hunt strategy, beta program design, and press coordination.

---
---

# Mode 3: Competitive Battlecard

Know your enemy. Then explain why you are the better choice.

---

## Battlecard Structure

A battlecard is an internal document that arms sales and marketing with the information needed to win against a specific competitor. It is also the foundation for external comparison pages and "Alternative to X" content.

### Section 1: Competitor Overview

```
COMPETITOR SNAPSHOT

  Company:     [Name]
  Founded:     [Year]
  Funding:     [Amount / stage]
  Customers:   [Count or range]
  Pricing:     [Range, model]
  Positioning: [Their one-liner]
```

### Section 2: Their Strengths

Be honest. A battlecard that pretends the competitor has no strengths is useless. Sales reps will encounter these strengths in every deal.

List 3-5 genuine strengths. For each:
- What they do well
- Why customers cite this in evaluations
- How to acknowledge it without conceding the deal

### Section 3: Their Weaknesses

List 3-5 weaknesses. For each:
- What they do poorly or lack
- Evidence (customer reviews, G2/Capterra data, public complaints)
- How this weakness impacts the buyer's workflow

### Section 4: Our Advantages

For each of their weaknesses, map our corresponding strength:

```
  ┌──────────────────────────────────────────────┐
  │                                              │
  │  Their weakness      Our advantage           │
  │  ──────────────────────────────────────────  │
  │  Slow onboarding     Self-serve in < 5 min   │
  │  No API              Full REST API + SDKs    │
  │  Per-seat pricing    Flat-rate, unlimited     │
  │                                              │
  └──────────────────────────────────────────────┘
```

### Section 5: Objection Handling

The 5-7 most common objections a prospect raises when comparing:

For each objection:
- The objection as the prospect says it
- Why they say it (the real concern behind it)
- The response (acknowledge, reframe, prove)
- Proof point to back it up

```
  Objection: "But [Competitor] has more integrations."

  Real concern: Will this work with my existing stack?

  Response: "We integrate with the 12 tools that
  matter most for [use case]. [Competitor] lists
  200 integrations, but 180 of them are one-way
  data syncs. Our 12 are deep, bi-directional,
  and maintained by our team -- not community
  plugins that break on updates."

  Proof: [Customer name] migrated from [Competitor]
  and connected their full stack in 2 hours.
```

### Section 6: Landmines

Questions to ask the prospect that expose competitor weaknesses without badmouthing:

- "How important is [thing they lack] to your workflow?"
- "Have you tried [action that's hard in their product]?"
- "What happens when you need to [scale scenario they handle poorly]?"

Reference `references/competitive-battlecards.md` for comparison page frameworks and "Alternative to X" content patterns.

---
---

# Mode 4: Pricing Page Copy

The pricing page is where positioning meets money. Every word earns or loses revenue.

---

## Pricing Page Framework

### Tier Naming

Tier names should signal who the tier is for, not what it contains:

```
BAD:  Basic / Pro / Enterprise
      (what does "Pro" mean? everyone thinks they're pro)

GOOD: Starter / Growth / Scale
      (maps to the customer's stage)

GOOD: Solo / Team / Company
      (maps to the customer's size)
```

Each tier name should make the buyer self-select: "That's me."

### Tier Positioning

For each tier, write:

1. **Tier name** -- who this is for in 3-5 words
2. **One-liner** -- the outcome this tier delivers (not the feature count)
3. **Price** -- with billing context (monthly, annual discount)
4. **Feature list** -- organized by value, not alphabetically
5. **CTA** -- specific to the tier ("Start free", "Talk to sales")

```
  GROWTH                          ★ most popular

  For teams shipping weekly.

  $49/mo (billed annually)
  $59/mo (billed monthly)

  Everything in Starter, plus:
  ├── Unlimited team members
  ├── Advanced analytics dashboard
  ├── Priority support (4hr response)
  ├── Custom integrations
  └── API access

  → Start 14-day free trial
```

### Feature Comparison Table

The comparison table answers "what do I get at each tier?" Structure it by value category, not by feature count:

Categories:
- Core features (what everyone gets)
- Collaboration (scales with team size)
- Analytics and reporting (scales with sophistication)
- Support (scales with urgency)
- Security and compliance (scales with enterprise needs)

### Pricing FAQ

Every pricing page needs an FAQ. The FAQ handles objections that the tier cards cannot:

Standard questions to address:
1. Can I switch plans? (reduce risk)
2. What happens if I exceed limits? (reduce anxiety)
3. Do you offer discounts for [annual/nonprofit/startups]? (capture edge cases)
4. What is your refund policy? (reduce risk)
5. How does billing work? (reduce confusion)
6. Why is [Tier X] more expensive than [Competitor]? (justify value)

Write FAQ answers that sell, not just inform. Each answer is a positioning opportunity.

### Value Justification

For each tier, calculate the ROI story:

```
  THE MATH

  Growth plan: $49/month = $588/year

  What you get back:
  ├── 4 hours saved per week on [task]
  │   → 208 hours/year at $50/hr = $10,400
  ├── 12% improvement in [metric]
  │   → [dollar value based on customer size]
  └── ROI: [X]x return in year one
```

---
---

# Mode 5: Integration Marketing

Integrations are distribution channels disguised as features.

---

## Integration Spotlight Page

When a new integration launches, it deserves its own page. Structure:

1. **Headline**: "[Product] + [Partner] = [Outcome]"
   Not "We integrated with X." What does the combined workflow enable?

2. **Use case narrative**: Walk through a specific workflow that is now possible
   - Before: [how it worked without the integration -- painful]
   - After: [how it works now -- seamless]

3. **Setup guide**: How to connect (keep it under 3 steps)

4. **Feature matrix**: What data flows, what actions are possible

5. **Social proof**: Quotes from beta users of the integration

### Partner Co-Marketing

When launching with a partner, coordinate:

- Joint blog post (published on both sites)
- Joint webinar or demo
- Cross-email to both lists (with partner approval)
- Social posts tagging each other
- Shared landing page or dedicated integration page

Co-marketing checklist:
```
  ├── Partner brief shared         ○ pending
  ├── Joint blog post drafted      ○ pending
  ├── Email copy approved (ours)   ○ pending
  ├── Email copy approved (theirs) ○ pending
  ├── Social posts scheduled       ○ pending
  ├── Landing page live            ○ pending
  └── Launch date confirmed        ○ pending
```

---
---

# Mode 6: Product-Led Growth

Let the product do the selling. Design the nudges that turn free users into paying customers.

---

## PLG Sequence Framework

Product-led growth marketing is about delivering the right message at the right moment in the user's journey. Not blasting emails. Triggering them based on behavior.

### Onboarding Flow (Days 0-7)

The goal: get the user to their "aha moment" as fast as possible.

**Day 0: Welcome + First Action**
- Subject: focused on the ONE thing they should do first
- Content: 3 sentences max. One link. One action.
- Trigger: account creation

**Day 1: Quick Win**
- Subject: celebrate their first action OR nudge if they have not acted
- Content: show what they unlocked or what they are missing
- Trigger: completed first action OR 24hr inactivity

**Day 3: Value Demonstration**
- Subject: show them a result or insight from their usage
- Content: personalized metric, comparison, or recommendation
- Trigger: has used product at least once

**Day 5: Feature Discovery**
- Subject: introduce a feature they have not tried yet
- Content: "Most users who do X also try Y" -- social proof nudge
- Trigger: active but not using key feature

**Day 7: Upgrade Bridge**
- Subject: soft introduction to paid value
- Content: what they are missing on free tier, framed as outcome not feature
- Trigger: active free user approaching limit or milestone

### Activation Emails

Activation emails fire based on user behavior, not calendar dates:

```
  ACTIVATION TRIGGERS

  ├── First [key action]     → Celebrate + next step
  ├── Invited team member    → Team collaboration guide
  ├── Hit usage limit        → Upgrade nudge (value-framed)
  ├── 3 days inactive        → Re-engagement with value
  ├── Used advanced feature  → Power user track
  └── Trial expiring (3 day) → Urgency + loss framing
```

For each trigger, write:
- Subject line (outcome-focused)
- Body (3 paragraphs max: context, value, action)
- CTA (single, specific)

### Feature Discovery Content

Help users discover features they are not using:

- In-app tooltips: 10 words max, points to the feature
- Feature spotlight emails: one feature per email, use-case framed
- "Did you know?" series: weekly email highlighting underused features
- Usage-based recommendations: "You did X 47 times this week. Y would cut that in half."

### Upgrade Nudges

The moment a free user hits a paid-tier boundary:

```
  ┌──────────────────────────────────────────────┐
  │                                              │
  │  You've hit 1,000 contacts on the free plan. │
  │                                              │
  │  Your next 47 contacts are waiting in your   │
  │  import queue. Upgrade to Growth to import    │
  │  them now and unlock unlimited contacts.      │
  │                                              │
  │  → Upgrade to Growth ($49/mo)                │
  │  → See what's included                       │
  │                                              │
  └──────────────────────────────────────────────┘
```

Principles:
- Show what they are losing, not what you are selling
- Use their actual data (contact count, usage metric)
- Make the upgrade path obvious and low-friction
- Never punish free users. Celebrate their growth.

---
---

# Output Formatting

Follow `_system/output-format.md` -- all 4 required sections.

---

## Section 1: Header

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  PRODUCT MARKETING: [MODE NAME]
  Generated [Month Day, Year]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Section 2: Content

The deliverable itself, structured per the mode above. Long-form content (full email sequences, complete landing pages, detailed battlecards) should be saved as files. The terminal output summarizes and references them.

---

## Section 3: Files Saved

```
  FILES SAVED

  ./campaigns/{name}/changelog/march-update.md       ✓
  ./campaigns/{name}/emails/feature-announcement.md   ✓
  ./campaigns/{name}/social/linkedin-announcement.md  ✓
  ./brand/assets.md                                   ✓ (updated)
```

---

## Section 4: What's Next

```
  WHAT'S NEXT

  Your [deliverable type] is saved. Recommended
  next moves:

  → /creative            Build visuals for this
                         announcement (~15 min)
  → /direct-response-copy  Punch up the landing
                         page copy (~10 min)
  → /email-sequences     Build a nurture sequence
                         around this launch (~15 min)
  → /content-atomizer    Break into social posts
                         and email snippets (~10 min)

  Or tell me what you're working on and I'll route you.
```

Tailor suggestions to the mode:
- After Feature Announcement: suggest content atomizer, email sequence
- After Product Launch: suggest creative, email sequences, direct-response-copy
- After Battlecard: suggest direct-response-copy for comparison page, content-atomizer
- After Pricing Page: suggest A/B testing, direct-response-copy for landing page
- After Integration Marketing: suggest email sequences for partner audience, content-atomizer
- After PLG: suggest email-sequences for full lifecycle, direct-response-copy for upgrade page

---
---

# Feedback Collection

After delivering product marketing assets, collect feedback per `_system/brand-memory.md` feedback protocol.

```
  How did this perform?

  a) Great -- shipped as-is
  b) Good -- made minor edits
  c) Rewrote significantly
  d) Haven't used yet

  (Answer later by running this skill again.)
```

Process feedback and append findings to `./brand/learnings.md`.
