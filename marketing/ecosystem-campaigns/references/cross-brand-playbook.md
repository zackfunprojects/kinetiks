# Cross-Brand Playbook

Reference material for `/ecosystem-campaigns`.
Load this file when planning any campaign that spans multiple Kinetiks brands.

---

## The Kinetiks Funnel

The Kinetiks ecosystem is a marketing funnel built from specialized products. Each product owns a stage. Together, they create a compounding engine that no single-product competitor can match.

### Stage 1: Awareness (Dark Madder)

Dark Madder is the top of the funnel. Its job is to bring strangers into the Kinetiks orbit through content, media, and thought leadership.

**What DM produces:**
- Long-form blog content (1,500-3,000 words, SEO-optimized)
- Newsletter issues (weekly or biweekly, curated + original)
- Social content (LinkedIn long-form, Twitter/X threads, carousels)
- Podcast content (guest appearances, original shows)
- Video content (short-form educational, long-form interviews)

**DM success metrics:**
- Unique visitors / impressions
- Email subscriber growth
- Social engagement rate
- Brand search volume growth
- Click-through rate to HT properties

**DM does NOT do:**
- Direct selling. DM never pitches product.
- Lead capture. DM links to HT for that.
- Customer communication. That is HV's domain.

### Stage 2: Conversion (Hypothesis)

Hypothesis converts attention into action. When a DM reader is interested enough to click, HT's job is to convert that interest into a name, an email, a trial, or a demo.

**What HT produces:**
- Landing pages (with A/B testing built in)
- Lead magnets (PDFs, templates, tools, calculators)
- Product demo pages
- Pricing pages
- Comparison pages ("Alternative to X")

**HT success metrics:**
- Landing page conversion rate
- Lead magnet download rate
- Trial signup rate
- Demo booking rate
- A/B test win rate

**HT does NOT do:**
- Content creation for awareness. That is DM's domain.
- Pipeline management. Leads flow to HV.
- PR or media. That is LT's domain.

### Stage 3: Capture (Harvest)

Harvest turns leads into revenue. When HT captures a lead, HV's job is to nurture that lead through the buying journey until they become a customer.

**What HV produces:**
- Email nurture sequences (5-12 emails per sequence)
- Pipeline management (lead scoring, stage tracking)
- Sales enablement (battle cards, one-pagers, demo scripts)
- Customer onboarding (welcome sequences, setup guides)
- Retention (health scores, churn prevention, expansion)

**HV success metrics:**
- Lead-to-opportunity conversion rate
- Pipeline velocity (days from lead to close)
- Win rate
- Average deal size
- Net revenue retention

**HV does NOT do:**
- Cold outreach to strangers. DM warms them first.
- Landing page optimization. That is HT's domain.
- Public-facing content. DM and LT handle that.

### Stage 4: Amplification (Litmus)

Litmus turns customer success into public awareness. When HV closes a deal and the customer succeeds, LT's job is to amplify that success into coverage that feeds the top of the funnel.

**What LT produces:**
- Case studies (written, video, one-pager formats)
- Press releases
- Media pitches and journalist relationships
- Award submissions
- Speaking opportunity applications
- Thought leadership placement (bylines, guest posts)

**LT success metrics:**
- Media mentions
- Press coverage quality (tier and relevance)
- Case study production rate
- Backlinks from coverage (feeds DM's SEO)
- Social amplification of coverage

**LT does NOT do:**
- Day-to-day social posting. That is DM's domain.
- Lead generation. That is HT's domain.
- Customer communication. That is HV's domain.

---

## Cross-Promotion Rules

Cross-promotion is powerful when it is relevant and destructive when it is spammy. These rules govern when and how Kinetiks brands mention each other.

### When to Mention Sibling Products

**Do mention when:**
- The user's current workflow naturally leads to the sibling product
- The user has explicitly asked about related capabilities
- The user has been active for 14+ days (not during initial onboarding)
- The mention adds genuine value to the current context
- The user is at a workflow boundary (e.g., created content but has no way to convert it)

**Do NOT mention when:**
- The user is in their first 7 days with the product
- The user is in the middle of a task (do not interrupt)
- The user has previously dismissed sibling product mentions
- The mention would distract from the current goal
- The user is frustrated or filing a support ticket

### How to Mention Sibling Products

**The Contextual Mention (best practice)**
```
  "You've published 15 articles this month in Dark
  Madder. Teams at your volume typically want to know
  which articles actually drive leads. That's what
  Hypothesis does -- it shows you which content converts."
```

Why this works:
- References their specific data (15 articles)
- Connects to a natural next problem (which ones convert?)
- Introduces the sibling product as the solution
- Does not push. States a fact.

**The Value Bridge (for email sequences)**
```
  "Your Harvest pipeline shows 47 leads from organic
  content. Want to see which Dark Madder articles they
  came from? Connect DM + HV to get full attribution."
```

Why this works:
- Starts with THEIR data, not your pitch
- The bridge is utility, not promotion
- Connecting the products makes their existing data more valuable

**The Anti-Pattern (do NOT do this)**
```
  BAD: "Did you know we also offer Harvest for CRM?
  Check it out at harvest.kinetiks.com!"

  BAD: "Unlock the full power of the Kinetiks
  ecosystem by adding Litmus to your stack."

  BAD: "Teams using 3+ Kinetiks products get
  a 20% discount. Upgrade now."
```

Why these fail:
- Generic. Not connected to the user's workflow.
- Pushy. The user did not ask.
- Discount-led. Trains users to wait for promotions.

### Frequency Caps

- Maximum 1 sibling product mention per week per user
- Maximum 1 cross-product email per month
- If user dismisses a mention, wait 30 days before trying again
- Never mention more than 1 sibling product at a time
- In-app mentions reset after major product updates (new value to show)

---

## Handoff Mechanics

### UTM Link Structure

Every cross-brand link uses a consistent UTM structure:

```
  ?utm_source={source-brand}
  &utm_medium={content-type}
  &utm_campaign={campaign-slug}
  &utm_content={specific-asset}
```

**Examples:**

DM blog post linking to HT landing page:
```
  https://hypothesis.kinetiks.com/landing-page
  ?utm_source=dark-madder
  &utm_medium=blog
  &utm_campaign=q1-content-pipeline
  &utm_content=seo-guide-cta
```

HT thank-you page mentioning HV:
```
  https://harvest.kinetiks.com/demo
  ?utm_source=hypothesis
  &utm_medium=thank-you-page
  &utm_campaign=q1-content-pipeline
  &utm_content=post-download-bridge
```

LT press coverage linking to DM content:
```
  https://darkmadder.kinetiks.com/case-study
  ?utm_source=litmus
  &utm_medium=press-coverage
  &utm_campaign=customer-success-loop
  &utm_content=techcrunch-mention
```

### Lead Source Tagging

When a lead enters Harvest from another brand, tag it:

```
  Lead source: {source-brand}-{campaign-slug}-{asset-type}

  Examples:
  - dm-q1-pipeline-blog-seo-guide
  - ht-launch-campaign-landing-page
  - lt-press-coverage-techcrunch
```

This enables attribution reporting: which brand and which asset generated the lead.

### Pipeline Triggers

Automated actions when cross-brand handoffs occur:

**DM to HT trigger:**
- When: DM content CTA clicked (via UTM detection)
- Action: HT records the visitor's entry point for personalization
- HT landing page can reference the DM content: "You were reading about [topic]. Here's the tool that makes it happen."

**HT to HV trigger:**
- When: Form submitted on HT property
- Action: Lead created in HV with source tags, content history, and lead score
- HV assigns to appropriate nurture sequence based on entry point

**HV to LT trigger:**
- When: Deal marked "closed-won" in HV AND customer health score is green
- Action: LT receives customer profile, deal details, and success metrics
- LT evaluates PR potential and queues case study interview

**LT to DM trigger:**
- When: Press coverage published or case study approved
- Action: DM receives coverage details for content repurposing
- DM creates social posts, newsletter features, and derivative content

---

## Ecosystem Onboarding Sequences

### Day 1: Welcome to [Product]

Focus: 100% on the product they signed up for.

```
  Subject: Welcome to [Product]. Here's your first step.

  One action. One link. Nothing else.

  No mention of other products.
  No ecosystem pitch.
  No "did you know we also offer..."
```

### Day 7: First Success Checkpoint

Focus: Celebrate their progress. Identify their pattern.

```
  Subject: You've [specific achievement] this week

  Acknowledge what they've done.
  Show them what's possible next (within this product).
  Still no cross-product mention.

  Internal: flag their usage pattern for future
  cross-product matching.
```

### Day 14: The Contextual Bridge

Focus: First soft mention of a sibling product, ONLY if their usage pattern indicates readiness.

```
  Subject: Quick idea based on your [Product] usage

  "You've been [specific usage pattern]. Teams
  at your stage often ask about [problem that
  sibling product solves]."

  "If that's on your radar, [Sibling Product]
  handles exactly that. Here's a 2-minute overview."

  "If not -- no worries. Here's a tip for getting
  more from [Current Product] instead: [tip]."

  Two paths. No pressure. Genuine value either way.
```

### Day 30: The Ecosystem Value Proposition

Focus: Show combined value with proof.

```
  Subject: Teams using [Product A] + [Product B] see [metric]

  Lead with data, not pitch.
  Specific customer example.
  Easy next step (not a commitment).

  "If you're curious, reply to this email and I'll
  show you how [Customer] set it up. Took them
  about 20 minutes."
```

### After Day 30: Behavior-Triggered Only

No more calendar-based cross-product emails. From day 30 onward, cross-product mentions are exclusively triggered by user behavior:

- Hits a workflow boundary → introduce the sibling that solves it
- Asks about a capability → mention if a sibling product handles it
- Achieves a milestone → suggest the next stage of the ecosystem
- Shows signs of churn → show ecosystem value to increase switching cost (ethically)

---

## Case Study to PR to Content Feedback Loop

The most valuable ecosystem play. A single customer success story generates content, press coverage, and new awareness in a self-reinforcing loop.

### Step 1: Identify the Story (HV)

Harvest flags customers who meet the criteria:
- Measurable result (revenue, time saved, metric improved)
- Willing to be named (check customer agreement)
- Interesting company or use case (media appeal)
- Active for 90+ days (story has substance)

### Step 2: Write the Case Study (DM)

Dark Madder conducts the interview and produces three formats:

**Format A: Blog Post (1,000-1,500 words)**
- Full narrative: problem, solution, result
- Direct quotes from the customer
- Specific numbers throughout
- Published on DM blog, tagged for SEO

**Format B: Social Cut (250 words)**
- Key stat + one quote + brief context
- Formatted for LinkedIn and Twitter/X
- Links to the full blog post
- Shareable by the customer's team

**Format C: One-Pager (PDF)**
- Designed for sales team to share in deals
- Problem, solution, result in scannable format
- Customer logo and quote prominently placed
- QR code linking to full case study

### Step 3: Evaluate PR Potential (LT)

Litmus assesses whether the story has media legs:

**PR-worthy signals:**
- Customer is a recognized brand
- Result is exceptional (10x improvement, industry-first)
- Story ties to a trend (AI adoption, remote work, sustainability)
- Founder has a compelling personal angle
- Timing aligns with industry event or news cycle

**If PR-worthy:**
- Craft a press release (500-800 words)
- Build a targeted media list (10-15 journalists)
- Prepare founder for interviews (key messages, soundbites)
- Set embargo if exclusive offered

**If not PR-worthy (most stories):**
- Skip press outreach
- Use the case study in DM content and HV sales materials
- Save for future roundup: "10 Companies That [Achieved X]"

### Step 4: Amplify Coverage (LT + DM)

When press coverage publishes:

**LT actions:**
- Share coverage on all social channels
- Thank the journalist publicly
- Send coverage link to the customer (they often reshare)
- Add to press page / media kit
- Submit for industry awards if applicable

**DM actions:**
- Repurpose coverage into new content:
  - "As featured in [Publication]..." social post
  - Newsletter mention with commentary
  - Blog post analyzing the trend the coverage covers
  - Backlink the coverage in related DM content (SEO value)

### Step 5: Close the Loop

The coverage generates new awareness:
- New visitors arrive via press backlinks
- DM content captures their attention
- HT converts interested visitors
- HV nurtures new leads
- Some become customers
- Their success stories become the next case study

The loop has no end. Every customer success feeds the next cycle.

### Loop Metrics

Track the full loop, not just individual stages:

```
  FEEDBACK LOOP METRICS

  ├── Stories identified (HV):     [N]/quarter
  ├── Case studies produced (DM):  [N]/quarter
  ├── PR pitches sent (LT):       [N]/quarter
  ├── Coverage secured (LT):      [N]/quarter
  ├── Backlinks generated:         [N] (DA [avg])
  ├── Traffic from coverage:       [N] visits
  ├── Leads from coverage:         [N]
  └── Loop velocity:               [N] days from
      customer success to new lead generated
```

The goal is to shrink loop velocity -- the time from one customer's success to the next lead it generates. Best-in-class ecosystem companies run this loop in under 30 days.
