# Lead Scoring Methodology

Fit vs. intent scoring, signal decay, account-level aggregation, and score-to-action mapping for outbound prioritization.

---

## Two-Axis Scoring

Every prospect has two independent scores:

**Fit Score (0-100):** How well does this prospect match your ICP?
- Static attributes: company size, industry, geography, tech stack, revenue
- Changes slowly: only updates when enrichment data refreshes
- Source: PDL, Apollo, BuiltWith, LinkedIn

**Intent Score (0-100):** How likely are they to buy right now?
- Dynamic signals: hiring, funding, content engagement, tech changes
- Changes rapidly: decays over time, spikes on new signals
- Source: signal monitoring, website visits, email engagement

## Fit Scoring Dimensions

| Dimension | Weight | Scoring |
|-----------|--------|---------|
| Company size | 20% | Exact ICP range = 100, adjacent = 60, outside = 20 |
| Industry | 20% | Primary ICP industry = 100, adjacent = 50, unrelated = 10 |
| Tech stack | 15% | Uses complementary tools = 100, neutral = 50, uses competitor = 30 |
| Geography | 10% | Primary market = 100, serviceable = 70, outside = 20 |
| Revenue/Funding | 15% | Sweet spot = 100, above = 70, below = 40 |
| Role seniority | 20% | Decision-maker = 100, influencer = 70, end user = 40 |

## Intent Scoring Dimensions

| Signal Type | Base Points | Decay Rate |
|-------------|------------|------------|
| Pricing page visit | 30 | -5/day |
| Content download | 20 | -3/day |
| Webinar attendance | 25 | -2/day |
| Job posting (relevant) | 25 | -1/day |
| Funding announcement | 20 | -0.5/day |
| Tech stack change | 15 | -0.5/day |
| Email opened | 5 | -2/day |
| Email clicked | 15 | -3/day |
| Email replied (positive) | 40 | -1/day |
| Social engagement | 10 | -2/day |

Scores stack. A prospect who downloaded content AND opened your email AND has a relevant job posting = 20 + 5 + 25 = 70 base intent.

## Score-to-Action Mapping

| Fit | Intent | Action |
|-----|--------|--------|
| High (70+) | High (70+) | Immediate deep-personalized outreach |
| High (70+) | Medium (40-69) | Prioritized outreach with signal reference |
| High (70+) | Low (0-39) | Add to nurture sequence, monitor for signals |
| Medium (40-69) | High (70+) | Outreach with qualification focus |
| Medium (40-69) | Medium (40-69) | Standard sequence, let engagement qualify |
| Medium (40-69) | Low (0-39) | Low priority, automated sequence only |
| Low (0-39) | Any | Do not outreach. Disqualified by fit. |

## Account-Level Aggregation

Individual contacts score independently, but accounts aggregate:
- Account fit score = company-level fit (same for all contacts)
- Account intent score = highest individual intent at the account
- Multiple engaged contacts at one account = buying committee signal (+20 bonus)

## Score Recalculation

- **Fit:** recalculate on enrichment refresh (weekly or on-demand)
- **Intent:** recalculate daily (decay applied) and on new signal events
- **Thresholds:** review monthly based on conversion data from Analyst
