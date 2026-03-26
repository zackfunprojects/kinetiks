# Attribution Model

How marketing touchpoints connect to pipeline and revenue. Attribution is not a separate analytics layer -- it is intelligence that flows through the same Proposal and Learning Ledger system that powers everything else.

---

## The Attribution Philosophy

**Attribution is a Cortex function, not an app function.** Individual apps report their outcomes. Dark Madder reports content metrics. Harvest reports pipeline metrics. The Cortex connects content to pipeline to revenue. No single app has the full picture -- only the Cortex does.

**Every marketing touchpoint is a signal.** A blog post read, an email opened, a landing page visited, an outbound sequence replied to -- each is a signal that flows as a Proposal. The Learning Ledger becomes the attribution record by default, without additional infrastructure.

**No single attribution model is correct.** First touch, last touch, and multi-touch each tell a different true story. Present all three lenses. Let the user decide which story matters for their current decision. Arguing about attribution models is a waste of time -- using multiple lenses is not.

**Simple beats complex.** A clear statement like "content drove 40% of pipeline this quarter" is more useful than a fractional attribution model that assigns 7.3% to a tweet nobody remembers. Precision that nobody trusts is worse than directional accuracy that drives action.

---

## The Signal Chain

Each step in the buyer's journey is a Proposal from the responsible app. The Cortex stitches them into a complete journey.

```
Content created (Dark Madder)
       ↓
Content consumed (traffic, engagement, time on page)
       ↓
Lead captured (Hypothesis landing page, form submission)
       ↓
Lead nurtured (Harvest email sequence, outbound touches)
       ↓
Deal progressed (Harvest pipeline, meetings, proposals)
       ↓
Revenue attributed (Harvest closed-won)
```

**Each link is a Proposal.** Dark Madder proposes that a piece of content was published and consumed. Hypothesis proposes that a lead was captured. Harvest proposes that a deal moved stages. The Cortex records each Proposal in the Learning Ledger with a timestamp, the responsible app, and the affected contact.

**Gaps in the chain are expected.** Not every journey is fully trackable. Some leads arrive through dark social, word of mouth, or untracked channels. Report what is known. Flag what is unknown. Never fabricate connections to make the data look cleaner than it is.

---

## Three Attribution Lenses

Present all three for every reporting period. Each answers a different strategic question.

### First Touch Attribution

Credits the first known touchpoint in the journey.

- **Answers:** "What is driving awareness? What channels bring people into our world?"
- **Useful for:** Evaluating top-of-funnel investments, content strategy, brand campaigns
- **Report:** Channel, specific asset (the blog post, ad, or social post), and timestamp
- **Limitation:** Ignores everything that happened between awareness and conversion

### Last Touch Attribution

Credits the final touchpoint before conversion.

- **Answers:** "What is driving conversion? What closes deals?"
- **Useful for:** Evaluating bottom-of-funnel effectiveness, sales enablement content, retargeting
- **Report:** Channel, specific asset, and timestamp
- **Limitation:** Ignores the awareness and nurture work that made the conversion possible

### Multi-Touch Attribution (Linear)

Equal credit to every touchpoint in the journey.

- **Answers:** "What does the full journey look like? Which channels work together?"
- **Useful for:** Understanding the complete buyer experience, justifying mid-funnel investment
- **Report:** All touchpoints with channel, asset, and timestamp for each
- **Limitation:** Treats a casual blog visit the same as a demo request. Weights are equal when they should not be.

**When to use which:** First touch for planning awareness campaigns. Last touch for optimizing conversion paths. Multi-touch for understanding the full picture and justifying budget across the funnel.

**Threshold:** Do not abstract touchpoints into percentages until you have 50+ data points per channel. Below that threshold, report raw numbers and individual journeys.

---

## Metrics That Matter

Six metrics tell the full attribution story. Resist the temptation to add more -- clarity comes from focus.

### 1. Pipeline Generated ($)

Total pipeline value created in the reporting period, broken down by source channel. This is the top-line number. If this is not growing, nothing else matters.

### 2. Pipeline Velocity (days)

Average number of days from first touch to closed-won. Faster velocity means the marketing-to-sales handoff is working. Increasing velocity is a warning signal -- either lead quality is declining or the sales process has friction.

### 3. Content-to-Pipeline Rate (%)

Of the people who consumed marketing content, what percentage entered the sales pipeline? This measures whether content is attracting the right audience or just generating vanity traffic.

### 4. CAC by Channel ($)

Customer acquisition cost per channel. Total spend on a channel divided by the number of customers acquired through it. Compare channels on equal footing. Include both media spend and content production costs.

### 5. Payback Period (months)

How many months until the customer's revenue covers their acquisition cost. Short payback = healthy unit economics. Long payback = risky growth. Evaluate by channel -- some channels produce fast-payback customers and others do not.

### 6. Channel Efficiency Ratio

Revenue generated divided by cost invested, per channel. A ratio above 3:1 is generally healthy for B2B SaaS. Below 1:1 means the channel is losing money. Between 1:1 and 3:1 may be acceptable for long-LTV customers.

---

## The Learning Ledger as Attribution Record

The attribution system does not require new infrastructure. It reads what already exists.

**Every accepted Proposal is a timestamped, attributed action.** When Dark Madder records that a contact spent 8 minutes reading a positioning guide, that is an attribution data point. When Harvest records that the same contact entered the pipeline 3 days later, the Cortex connects those two events.

**The connection logic:** Match on contact identity. Order by timestamp. Group by journey (first touch to conversion). The Learning Ledger already contains all of this.

**Dark Madder Proposals** (content created, content consumed, engagement metrics) combined with **Harvest Proposals** (lead captured, deal stage changes, closed-won) form the complete attribution dataset.

**Surfacing insights:** Attribution intelligence appears in daily and weekly briefs. The pattern to follow: identify which content assets appear most frequently in closed-won journeys, and surface that finding with specificity. Example: "3 of the 5 deals closed this month had content in their journey. The security positioning guide appeared in all 3." Specific, actionable, tied to revenue.

**Feedback loop:** Attribution insights feed back into content strategy. If a specific content piece or angle appears consistently in winning journeys, produce more content in that vein. If a channel generates traffic but never pipeline, reallocate investment. The Learning Ledger makes this a continuous loop, not a quarterly review.
