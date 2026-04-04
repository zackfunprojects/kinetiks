# SaaS Launch Playbook

Reference material for `/product-marketing` Mode 2: Product Launch.
Load this file when planning Tier 3 or Tier 4 launches.

---

## Product Hunt Launch Strategy

Product Hunt is still the single highest-signal launch platform for SaaS. A top-5 finish on launch day delivers 2,000-10,000 signups depending on category. But most launches waste the opportunity by treating it as "post and pray."

### Pre-Launch Preparation (2-4 weeks before)

**Build your hunter network**
- Identify 3-5 well-known hunters in your category
- Reach out 3-4 weeks before launch with a personal note
- Offer early access in exchange for honest feedback
- Do not ask them to hunt you. Let the product speak.
- If no hunter relationship exists, self-hunt. It works fine.

**Prepare your listing assets**
- Tagline: 60 characters max. Outcome-first. No buzzwords.
  - BAD: "AI-powered comprehensive analytics platform"
  - GOOD: "See which features your users actually use"
- Description: 260 characters. Problem, solution, proof.
- Gallery: 5-8 images showing the product in action
  - Image 1: Hero shot with value prop overlay
  - Image 2-4: Key workflows, real data (not lorem ipsum)
  - Image 5: Social proof or metrics
  - Optional: 30-second demo video (no intros, straight to value)
- Maker comment: Pre-write this. Tell the story of WHY you built it. Personal, specific, vulnerable. This comment often gets more upvotes than the listing itself.

**Assemble your launch squad**
- 20-50 people who will genuinely engage on launch day
- Not fake upvotes. Real comments with real questions.
- Include: team, investors, beta users, friends in tech
- Brief them: "We launch Tuesday. Here's the link. If you like it, upvote and leave a genuine comment about what feature matters to you."
- Timing: stagger engagement across the day, do not dump 50 upvotes at 12:01am

### Launch Day Execution

**Timing**
- Launch at 12:01am PT (Product Hunt resets daily at midnight PT)
- Have your maker comment ready to post within 5 minutes
- First hour matters most for algorithm placement

**Hour-by-hour playbook**

```
  00:00  Post goes live
  00:05  Maker comment posted (the "why" story)
  00:15  First wave of squad engagement (10-15 people)
  01:00  Share on Twitter/X with direct link
  02:00  Second wave of squad engagement
  04:00  LinkedIn post (catches EU morning)
  06:00  Email to your list: "We just launched on PH"
  08:00  Third wave engagement + respond to ALL comments
  12:00  Midday push: share progress ("Top 5 so far")
  16:00  Final push: "Last few hours, here's what people are saying"
  20:00  Thank-you post to community regardless of ranking
```

**Comment engagement rules**
- Reply to every single comment within 1 hour
- Ask follow-up questions (drives more comments)
- Be generous: compliment other launches that day
- Share specific roadmap plans when asked about missing features
- Never be defensive about criticism. Thank them for the feedback.

### Post-Launch Capitalization

**Day 2-3: The badge**
- Add Product Hunt badge to your site (social proof)
- Write a "launch retrospective" blog post with real numbers
- Share learnings on Twitter/X (these posts go viral in indie hacker circles)

**Week 1: Convert the traffic**
- Product Hunt traffic decays fast. Capture emails aggressively.
- Retarget PH visitors with ads (if budget allows)
- Send a follow-up email to everyone who signed up on launch day

**Week 2-4: Long tail**
- Product Hunt SEO kicks in after 2-3 weeks
- Your listing will rank for "[category] tools" queries
- Keep your listing updated with new features and replies

---

## Beta Program Design

A beta program is not "let people use buggy software." It is a structured feedback loop that validates product-market fit before you invest in full launch marketing.

### Beta Program Structure

**Phase 1: Closed Alpha (10-25 users)**
- Hand-picked users who represent your ICP
- Daily or weekly 1:1 conversations
- Goal: validate core workflow, find showstoppers
- Duration: 2-4 weeks
- Exit criteria: 3+ users complete the core workflow without help

**Phase 2: Private Beta (50-200 users)**
- Invite-only. Application form to filter for ICP.
- Weekly email check-ins + in-app feedback widget
- Goal: validate retention, find friction points, collect testimonials
- Duration: 4-8 weeks
- Exit criteria: 40%+ weekly retention, 5+ usable testimonials

**Phase 3: Open Beta / Early Access (200-1,000 users)**
- Waitlist with controlled access (50-100 invites per week)
- Automated onboarding with feedback triggers
- Goal: validate scalability, pricing sensitivity, support load
- Duration: 2-4 weeks
- Exit criteria: support load manageable, pricing tested, onboarding works without hand-holding

### Beta Invite Sequence

**Email 1: You're In (Day 0)**
```
  Subject: You're in the [Product] beta

  Body:
  - Welcome. You are one of [N] people with access.
  - Here's what to do first: [one specific action]
  - Here's what we need from you: honest feedback
  - Link to product + link to feedback channel
```

**Email 2: Quick Win (Day 2)**
```
  Subject: Did you try [specific feature] yet?

  Body:
  - Check if they've completed the first action
  - If yes: celebrate + show next step
  - If no: re-explain value + simplify the first step
  - Link to 2-minute video walkthrough
```

**Email 3: Feedback Request (Day 7)**
```
  Subject: Quick question about your experience

  Body:
  - 3 specific questions (not a survey link)
  - 1. What's the one thing you'd change?
  - 2. Would you recommend this to a colleague? Why/why not?
  - 3. What would make you pay for this?
  - Reply directly to this email (no forms)
```

**Email 4: Graduation (Day 14-21)**
```
  Subject: Beta's ending. Here's what's next.

  Body:
  - Thank them for their feedback
  - Show what changed because of their input (specific)
  - Early access pricing or founding member offer
  - CTA: lock in your rate before GA launch
```

### Beta Feedback Collection

**In-app feedback widget**
- Persistent but non-intrusive (bottom-right corner)
- Single text field: "What's on your mind?"
- Tag submissions by page/feature automatically
- Respond to every submission within 24 hours

**Weekly feedback digest**
- Compile all feedback into themes
- Share with the team in a structured format:
  - Top 3 praise points (what to amplify in marketing)
  - Top 3 pain points (what to fix before GA)
  - Top 3 feature requests (roadmap signal)

---

## GA Launch Sequencing

The GA (General Availability) launch is the moment your beta becomes a real product. The sequencing matters because you are coordinating multiple channels, audiences, and assets simultaneously.

### Pre-Launch Checklist (T-14 days)

```
  LAUNCH READINESS

  Product
  ├── Core bugs resolved              ○ pending
  ├── Onboarding flow tested          ○ pending
  ├── Pricing page live               ○ pending
  ├── Billing system tested           ○ pending
  └── Support docs published          ○ pending

  Marketing Assets
  ├── Landing page copy final         ○ pending
  ├── Launch email sequence (4-5)     ○ pending
  ├── Social posts drafted            ○ pending
  ├── Blog post / announcement        ○ pending
  ├── Product Hunt listing            ○ pending
  └── Press kit / media outreach      ○ pending

  Operations
  ├── Support team briefed            ○ pending
  ├── Sales team briefed              ○ pending
  ├── Monitoring dashboards ready     ○ pending
  ├── Rollback plan documented        ○ pending
  └── Celebration planned             ○ pending
```

### Launch Email Sequence

**Email 1: Launch Announcement (Day 0)**
- To: full email list
- Subject: "[Product] is live. Here's what it does."
- Body: problem, solution, proof, CTA
- CTA: "See it in action" or "Start your free trial"

**Email 2: Social Proof (Day 2)**
- To: full list minus Day 0 converters
- Subject: "Here's what [N] people said about [Product]"
- Body: 3-5 beta testimonials with specific outcomes
- CTA: "Join them"

**Email 3: Use Case Deep-Dive (Day 5)**
- To: openers of Email 1 or 2 who did not convert
- Subject: "How [Company] uses [Product] to [outcome]"
- Body: mini case study, step-by-step workflow
- CTA: "Try the same workflow"

**Email 4: Objection Buster (Day 8)**
- To: non-converters who opened at least one email
- Subject: "The #1 question people ask about [Product]"
- Body: address the top objection directly with proof
- CTA: "See for yourself (14-day free trial)"

**Email 5: Last Call (Day 12)**
- To: engaged non-converters only
- Subject: "Quick question about [Product]"
- Body: short, personal, direct ask. What's holding you back?
- CTA: reply to this email (starts conversation)

---

## Press and Media Coordination

Press is not dead for SaaS launches. It is just different. You are not pitching TechCrunch cold. You are building relationships with niche writers who cover your exact category.

### Media List Building

Identify 15-25 journalists and writers who cover:
- Your specific category (not just "tech")
- Your company stage (seed, Series A, bootstrapped)
- Your audience's publications (where do your buyers read?)

For each contact, note:
- Name, publication, beat
- Recent articles they wrote about similar products
- Twitter/X handle (many prefer DMs to email)
- What angle would interest THEM (not you)

### The Pitch Framework

**Subject line**: "[Product] does [specific thing] for [specific audience]"
Not: "Exciting new SaaS startup disrupts the [category] space"

**Body** (5 sentences max):
1. What the product does (one sentence, no jargon)
2. Why now (market trend, problem getting worse, regulatory change)
3. One proof point (beta users, revenue, growth metric)
4. The ask (demo, early access, founder interview)
5. Why this journalist specifically (reference their recent work)

### Embargo Management

If offering exclusive or embargoed access:
- Pick ONE publication for the exclusive
- Set a specific date and time for the embargo lift
- Provide complete assets: screenshots, quotes, data, demo access
- Follow up 48 hours before embargo lifts to confirm
- Thank them publicly after the story runs

### Press Kit Contents

```
  press-kit/
  ├── one-pager.pdf          Company + product summary
  ├── founder-bio.md         Founder background, quotes
  ├── screenshots/           5-8 high-res product shots
  ├── logos/                  SVG + PNG, light + dark
  ├── metrics.md             Key numbers (users, growth, etc.)
  └── testimonials.md        3-5 customer quotes with names
```
