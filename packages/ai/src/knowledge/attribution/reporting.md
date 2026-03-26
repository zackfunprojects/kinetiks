# Attribution Reporting

Cadences and formats for surfacing attribution intelligence. These reporting patterns integrate into daily and weekly briefs, turning raw Learning Ledger data into decisions.

---

## Weekly Attribution Snapshot

A concise summary delivered as part of the regular brief. Five lines, each actionable.

**Structure:**

- **Pipeline created this week:** Total dollar value, with breakdown by channel (content, outbound, paid, organic, referral)
- **Top-performing content:** The specific piece that drove the most leads or pipeline value this week
- **Top-performing sequence:** The outreach or nurture sequence with the highest conversion rate this week
- **Channel efficiency:** Which channel delivered the lowest CAC this week
- **Recommendation:** One specific action the data supports. Not a dashboard summary -- a decision. "Double down on the security content angle" or "Pause spend on display ads until we diagnose the conversion drop."

**Tone:** Direct and specific. Name the asset, name the channel, state the number. Avoid hedging unless the data genuinely warrants it.

---

## Monthly Attribution Review

Deeper analysis for strategic decisions. Run at month-end.

**Cohort analysis:** Customers acquired this month -- what was their journey? Map the touchpoints for each new customer. Look for patterns: common first-touch channels, common content in the journey, average number of touchpoints before conversion.

**Channel mix shift:** How has the channel mix changed month-over-month? If content was 50% of pipeline last month and 35% this month, flag the shift and investigate. Channel mix shifts are early warnings.

**Content ROI:** Separate content that generates pipeline from content that generates only traffic. High-traffic content with no pipeline contribution is not worthless (brand awareness has value), but it should not be counted as pipeline-driving content. Be honest about the distinction.

**Sequence effectiveness:** Which nurture and outreach sequences are converting, and at what rate? Compare sequences against each other. Identify the top performer and the bottom performer. Recommend retiring or revising the bottom performer.

**Underperforming channels:** Where is budget being spent without return? Any channel below a 1:1 efficiency ratio for two consecutive months needs a decision: fix it, test a new approach, or cut it.

---

## Attribution Hygiene

Clean data in, clean insights out. These practices prevent attribution from degrading over time.

**UTM parameters on every outbound link.** No exceptions. Every link that leaves any marketing channel must carry:
- `utm_source` (the platform: linkedin, google, newsletter)
- `utm_medium` (the channel type: paid, organic, email, social)
- `utm_campaign` (the campaign name: q1-security-push, product-launch)
- `utm_content` (the specific variant: cta-a, hero-image-v2)

**Lead source tracking on every form submission.** Capture how the lead arrived at the form. This is the bridge between anonymous traffic and known contacts.

**Handoff timestamps.** When a lead moves between apps (Dark Madder content consumption to Hypothesis landing page to Harvest pipeline), record the timestamp of each transition. These timestamps are the raw material for pipeline velocity calculations.

**De-duplicate touchpoints.** Same person, same content, same day equals one touchpoint. Without de-duplication, a reader who refreshes a page three times inflates the attribution data. Collapse same-day, same-asset interactions into a single touchpoint.

**Attribution window:** 90 days from first touch. Any touchpoint older than 90 days is treated as belonging to a prior journey. This prevents stale interactions from inflating current attribution. Adjust the window based on the sales cycle -- 90 days is the default for mid-market B2B SaaS.

---

## When Data Is Insufficient

Attribution models require minimum data thresholds to produce reliable insights. Below these thresholds, report what you have but do not overfit conclusions.

**Under 20 customers:** Do not run attribution models. The sample is too small for any pattern to be meaningful. Report individual customer journeys as anecdotes, not as data.

**Under 50 touchpoints per channel:** Report raw numbers, not percentages. "Paid ads generated 12 leads" is honest. "Paid ads drove 24% of leads" implies a precision that 50 data points cannot support.

**Under 3 months of data:** Report trends, not conclusions. "Content leads are increasing month-over-month" is appropriate. "Content is our best channel" requires more history to confirm.

**When uncertain, say so.** "Early signal suggests content is driving pipeline, but we need 2 more months of data to confirm" is more valuable than a premature conclusion that drives the wrong investment. Confidence grows with data -- never overstate it.
