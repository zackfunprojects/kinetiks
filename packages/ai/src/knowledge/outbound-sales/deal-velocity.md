# Deal Velocity

Pipeline acceleration, stage-specific actions, stall detection, and re-engagement patterns for outbound deals.

---

## Pipeline Stage Actions

Each stage has a primary objective and a maximum dwell time. Exceeding dwell time triggers re-engagement.

**Prospecting (max 14 days):**
- Objective: get a reply
- Actions: initial outreach sequence (3-5 touches across channels)
- Exit criteria: positive reply OR meeting booked
- Stall signal: no engagement after full sequence

**Discovery (max 7 days):**
- Objective: qualify the opportunity
- Actions: discovery call, needs assessment, stakeholder mapping
- Exit criteria: confirmed pain, budget, timeline, decision-maker identified
- Stall signal: no follow-up scheduled after discovery call

**Evaluation (max 21 days):**
- Objective: demonstrate value
- Actions: demo, trial, proposal, competitive comparison
- Exit criteria: verbal commitment or written proposal accepted
- Stall signal: no response to proposal after 5 business days

**Negotiation (max 14 days):**
- Objective: close the deal
- Actions: pricing discussion, contract review, objection handling
- Exit criteria: signed agreement
- Stall signal: legal/procurement delay beyond 10 business days

**Closed Won / Closed Lost:**
- Won: capture win reason, trigger Synapse promotion
- Lost: capture loss reason, set re-engagement timer (90 days)

## Stall Detection Rules

A deal is stalling when:
1. No activity (email, call, meeting) in 2x the expected stage cadence
2. Contact stops responding but hasn't explicitly said no
3. Decision pushed to "next quarter" without a specific date
4. New stakeholder introduced who hasn't been engaged
5. Procurement/legal review with no timeline

## Re-engagement Patterns

**After stall (still in pipeline):**
- Send value-add content (not "just checking in")
- Reference a new signal or trigger event
- Offer a different entry point (smaller scope, trial, pilot)
- Engage a different stakeholder at the account

**After closed-lost (90-day re-engagement):**
- Lead with what changed (new feature, new case study, new pricing)
- Reference their original pain point
- Keep it short - they know you, don't re-pitch
- One touch, not a full sequence

## Velocity Metrics

Track and optimize:
- **Stage conversion rates** - where do deals die?
- **Average stage duration** - where do deals stall?
- **Touches to advance** - how many interactions per stage?
- **Win rate by source** - which signals produce the best deals?
- **Time to first meeting** - how fast are you getting in the door?
