# Persona-to-Messaging Mapping

Persona data tells you who you are talking to. This framework tells you what to say to them and how to say it. Every messaging decision flows from persona attributes through a repeatable translation chain.

---

## The Translation Framework

Every persona attribute maps to a messaging decision through a four-step chain:

**Persona Attribute → Messaging Angle → Proof Type → CTA Style**

Example: CFO at a 500-person SaaS company whose top priority is reducing operational costs.

1. **Attribute:** CFO, cost-focused, mid-market SaaS
2. **Angle:** Lead with cost reduction and measurable ROI
3. **Proof:** Revenue impact numbers, named customer case studies with dollar figures
4. **CTA:** "Book a 20-minute ROI review" (executive-appropriate, time-bounded, outcome-oriented)

Run every persona through this chain before writing a single word. If you cannot complete the chain, you do not know enough about the persona to write effective copy.

**Chain rules:**
- The angle must come from the persona's priorities, not from a feature list.
- The proof type must match the role's trust signals (see below).
- The CTA must match the role's decision authority and buying stage.
- If multiple attributes conflict, the role + seniority combination takes priority.

---

## Role-Based Messaging Matrix

### C-Suite (CEO, CFO, CTO, CMO)

**Lead with:** Business impact, strategic advantage, market position, revenue implications.

**Tone:** Concise, confident, peer-level. No hand-holding. No feature walkthroughs. They delegate evaluation -- your job is to earn the delegation.

**Structure:** Short paragraphs. Lead with the conclusion, then one supporting proof point. Two to three sentences per idea maximum.

**Avoid:** Technical implementation details, feature lists, "how it works" sections, anything that reads like a product tour. They do not care how the engine works. They care how fast the car goes.

**Example angle:** "Companies using this approach report 40% shorter sales cycles. Here is how [Named Customer]'s CEO describes the impact on their Q3 pipeline."

### VP / Director

**Lead with:** Team productivity, competitive edge, implementation simplicity, how this makes their department look good to the C-suite above them.

**Tone:** Medium depth. Confident but willing to explain. They need enough detail to form an opinion and enough strategic framing to sell it upward.

**Structure:** Medium-length paragraphs. Claim, evidence, implication for their team. Include brief "how" alongside "what."

**Avoid:** Oversimplifying (they will feel patronized) or drowning in technical specs (that is their team's job to evaluate).

**Example angle:** "Your team spends 12 hours per week on manual reporting. Here is how [Named Customer]'s marketing director cut that to 2 hours and reallocated the team to campaign work."

### Practitioner / Individual Contributor

**Lead with:** Workflow improvement, time savings, specific features that solve their daily frustrations, technical capabilities.

**Tone:** Technical depth is welcome. Speak their language. They want to know exactly how something works before they trust it.

**Structure:** Detailed. Step-by-step is fine. Show the workflow. Screenshots, code snippets, configuration examples -- specificity builds trust at this level.

**Avoid:** Vague claims without showing the mechanism. "Saves time" means nothing. "Eliminates the manual CSV export step between your CRM and analytics tool" means everything.

**Example angle:** "Here is the exact three-step setup: connect your data source, configure the sync rules, and the dashboard auto-populates. Takes about 15 minutes."

### Evaluator / Internal Champion

**Lead with:** Comparison data, peer validation, internal sell material. This person has already decided they are interested -- they need ammunition to convince others.

**Tone:** Balanced, evidence-heavy. They will be quoting you in internal emails and Slack messages. Give them quotable, defensible claims.

**Structure:** Comparison-friendly. Tables, side-by-side breakdowns, migration timelines, "why us vs. them" framing. Include objection-handling language they can reuse.

**Avoid:** Hard sells. They are already sold. Instead of pushing them further, arm them to sell internally.

**Example angle:** "Here is a comparison table you can share with your team. And here is how three similar companies handled the migration."

---

## Priority-Based Angle Ranking

Always lead with the persona's top priority, not yours.

**Rule:** If the persona data includes ranked priorities, the messaging must follow that rank order exactly.

- Priority 1 = headline angle, opening paragraph, subject line
- Priority 2 = first supporting section
- Priority 3 = secondary proof point or closing reinforcement

**If priorities are unknown,** default to the role-based assumptions:
- C-suite default priority: revenue impact
- VP/Director default priority: team efficiency
- Practitioner default priority: workflow simplicity
- Evaluator default priority: defensible comparison

**Never lead with a feature.** Features support angles. If the persona's top priority is "reduce manual work," the angle is time savings, the proof is hours reclaimed, and the feature is mentioned as the mechanism -- not the headline.

---

## Proof Type by Persona

Different roles trust different forms of evidence. Using the wrong proof type is worse than using no proof -- it signals that you do not understand their world.

### C-Suite
- Revenue and growth numbers with named companies
- Board-level case studies (outcomes framed as strategic wins)
- Analyst or press quotes
- Logos of recognizable companies in their industry

### VP / Director
- Team-level metrics (hours saved, throughput increased, error rates reduced)
- Before/after comparisons with timelines
- Implementation duration and resource requirements
- Quotes from peers at their level, at similar companies

### Practitioner / IC
- Feature demonstrations and walkthroughs
- Workflow screenshots or recordings
- Technical documentation quality and depth
- Community activity (forums, GitHub, Stack Overflow presence)

### Evaluator / Champion
- Comparison tables with honest assessments
- Peer reviews from their industry vertical
- Migration stories (how others switched and what it took)
- Internal pitch decks or summary docs they can forward

---

## Objection Prediction by Role

Every role has predictable objections. Pre-address the top objection for the role -- do not wait for them to raise it.

| Role | Primary Objection | Pre-Address Strategy |
|------|-------------------|----------------------|
| CEO | "Is this strategic or just a tool?" | Frame around market position and competitive advantage, not features |
| CFO | "What does this cost and what is the ROI?" | Lead with payback period and total cost of ownership, not list price |
| CTO | "Is this secure? Does it integrate?" | Name specific compliance certifications, list exact integrations early |
| CMO | "Will this actually move pipeline?" | Show pipeline attribution data from named customers |
| VP/Director | "How disruptive is implementation?" | Lead with implementation timeline and resource requirements |
| Practitioner | "How steep is the learning curve?" | Show time-to-first-value metrics and onboarding experience |
| Evaluator | "How do I justify this internally?" | Provide comparison materials and ROI calculators they can share |

---

## CTA Calibration by Persona

The CTA must match the role's decision style and authority level.

**C-Suite:** High-value, low-time-commitment, outcome-framed.
- "Book a 20-minute strategic review"
- "See the executive brief"
- "Talk to a customer CEO"

**VP / Director:** Medium commitment, team-benefit-framed.
- "Get the team assessment"
- "See the implementation timeline"
- "Book a demo for your team"

**Practitioner / IC:** Low-friction, hands-on, try-before-you-buy.
- "Start a free trial"
- "See the live demo environment"
- "Read the technical docs"

**Evaluator / Champion:** Comparison and internal-sell oriented.
- "Download the comparison guide"
- "Get the internal business case template"
- "See how [similar company] made the switch"

**CTA rule:** Never give a practitioner a "Book a strategic review" CTA. Never give a CEO a "Start free trial" CTA. The mismatch signals that you do not know who you are talking to.