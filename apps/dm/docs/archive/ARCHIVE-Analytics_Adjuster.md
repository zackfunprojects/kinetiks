> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/measurement.md (ALL ingestion deleted; platform integrations + Oracle)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# 07 - Analytics & Adjuster

## Performance Tracking, Scoring Model & Automated Plan Adjustment

**System:** Dark Madder
**Depends on:** 01-DATA-MODEL, 03-RESEARCH-PLANNER, 06-FRAMER-INTEGRATION
**Depended on by:** 03-RESEARCH-PLANNER (adjustment recommendations feed back into the plan)

---

## 1. Purpose

The Analytics & Adjuster system closes the feedback loop. It ingests performance data from Google Search Console, GA4, and Ahrefs/Semrush, scores every published piece on a composite metric, identifies what's working and what isn't, and proposes adjustments to the content plan. The system runs autonomously on a biweekly/monthly cadence and surfaces actionable recommendations, not raw data.

---

## 2. Data Sources

### 2.1 Google Search Console API

**Connected via:** OAuth 2.0 during org setup
**Data pulled:**
- Impressions, clicks, CTR, average position per page per query
- Indexing status (is the page indexed? any crawl errors?)
- Core Web Vitals data

**Pull frequency:** Biweekly (GSC data has a 2-3 day lag, and meaningful signals take weeks)

### 2.2 Google Analytics 4 API

**Connected via:** OAuth 2.0 during org setup (same Google account)
**Data pulled:**
- Pageviews and unique visitors per page
- Average engagement time (replaces old "time on page")
- Scroll depth events (if configured)
- Bounce rate equivalent (engagement rate)
- Referral sources (how people find the content - organic search, direct, social, referral)

**Pull frequency:** Biweekly

### 2.3 Ahrefs API (or Semrush API)

**Connected via:** API key during org setup
**Data pulled:**
- Keyword rankings for tracked keywords (position, change from last check)
- Backlink count and referring domains per page
- Domain Rating / Domain Authority trend
- Organic keyword count per page
- Competitor keyword gap updates

**Pull frequency:** Biweekly

### 2.4 AI Citation Tracking (Experimental)

This is harder to automate but high-value. The system periodically queries AI answer engines with the org's target keywords and checks if the org's content is cited.

**Implementation (v1 - lightweight):**
- For each org's top 10 primary keywords, run a Perplexity or similar query monthly
- Parse the response for citations to the org's domain
- Log whether the org was cited, which page, and what context

**Pull frequency:** Monthly

---

## 3. The Analytics Snapshot

Every biweekly data pull creates an `analytics_snapshots` record for each published content piece. This is the atomic unit of performance data.

### 3.1 Snapshot Fields

All fields from the `analytics_snapshots` schema in doc 01, populated from the three data sources above. Key computed fields:

**Performance Score (0-100):**

A composite score combining:

| Signal | Weight | Scoring |
|--------|--------|---------|
| GSC Impressions | 15% | Logarithmic scale relative to org average |
| GSC Clicks | 20% | Logarithmic scale relative to org average |
| GSC Average Position | 20% | Top 3 = 100, 4-10 = 70, 11-20 = 40, 21-50 = 20, 50+ = 5 |
| GA4 Engagement Time | 15% | Above org average = 80+, at average = 50, below = 20 |
| GA4 Scroll Depth | 10% | >75% = 100, 50-75% = 60, <50% = 20 |
| Backlinks | 10% | Any new backlinks = bonus, referring domains weighted higher |
| AI Citation | 10% | Binary bonus: cited = +10, not cited = 0 |

**Trajectory:**
- **Rising:** Performance score increased >15% from previous snapshot
- **Stable:** Performance score within +/-15% of previous snapshot
- **Declining:** Performance score decreased >15% from previous snapshot
- **New:** Fewer than 3 snapshots exist (not enough data for trajectory)

---

## 4. Reporting Cadence

### 4.1 Biweekly Tactical Scan (Automated, Silent)

Runs every two weeks. No user notification unless outliers are detected.

**What it does:**
1. Pull data from all three sources
2. Create analytics snapshots for every published piece
3. Compute performance scores and trajectories
4. Flag outliers:
   - **Positive outlier:** A piece hits top 3 for its primary keyword within 30 days of publishing
   - **Negative outlier:** A piece has zero impressions after 45 days (likely indexing issue)
   - **CTR anomaly:** High impressions but CTR < 1% (title/meta description problem)
   - **Engagement anomaly:** High clicks but engagement time < 30 seconds (content quality or intent mismatch)

**For flagged outliers only:** Create a brief alert surfaced on the user's dashboard.

### 4.2 Monthly Content Health Report (Surfaced to User)

Generated on the 1st of each month (or nearest weekday). Presented as a dashboard view and optionally exportable.

**Report contents:**

**1. Cluster Performance Summary**

Aggregate performance at the cluster level, not individual piece level. This is the strategic view.

| Cluster | Pieces Published | Avg Performance Score | Trajectory | Recommendation |
|---------|-----------------|----------------------|------------|----------------|
| How to Help Bees | 4/6 (hub + 3 spokes) | 72 | Rising | Expand: add 2 more spokes |
| Coral Restoration | 3/5 | 45 | Stable | Hold: needs more time |
| Food Insecurity | 2/4 | 28 | Declining | Diagnose: voice/angle may need adjustment |

**2. Top Performers**

The 5 best-performing pieces across all clusters, with:
- What's working (high rankings? good engagement? backlinks?)
- Structural patterns to replicate (what do these pieces have in common?)

**3. Underperformers Requiring Action**

Pieces that have been live >60 days with performance score < 30:
- Diagnosed cause (indexing issue? wrong keyword? weak content? poor title?)
- Recommended action (rewrite? re-optimize? merge with another piece? kill?)

**4. Keyword Opportunities**

New keywords discovered through GSC data (queries getting impressions but no dedicated content) or through the monthly AI citation check (questions being asked that the org's content doesn't answer well).

**5. Voice Quality Correlation**

Cross-reference voice match scores with content performance. Do higher voice-match pieces perform better? This validates the voice engine's impact.

### 4.3 Quarterly Strategic Review (Requires User Input)

Generated at the end of each quarter. This is the only point where the content plan fundamentally changes.

**Review contents:**

**1. Full Cluster Map Reassessment**
- Which clusters built real topical authority? (measured by: number of ranking keywords, backlinks earned, AI citations)
- Which clusters should be killed? (60+ days, multiple pieces, no trajectory)
- What new cluster opportunities emerged from keyword research refresh?

**2. Content Calendar Rebalancing**
- Proposed Q+1 calendar based on performance data
- Recommended volume adjustments (increase publishing pace on winning clusters, decrease on losing)

**3. Competitor Movement**
- Did competitors publish competing content in your clusters?
- Did your rankings change relative to specific competitors?

**4. ROI Summary**
- Total content pieces published this quarter
- Aggregate traffic, rankings, and engagement metrics
- AI citation count
- Content velocity trend (are you getting faster at producing?)

---

## 5. The Adjuster Agent

The Adjuster Agent is an automated system that proposes content plan changes based on analytics data. It does not make changes autonomously - it proposes, and the user approves.

### 5.1 Trigger-Based Recommendations

These recommendations fire when specific conditions are met, regardless of the reporting cadence:

**Positive Triggers:**

| Trigger | Threshold | Recommendation |
|---------|-----------|---------------|
| Piece hits top 3 | Primary keyword position <= 3 within 30 days | "This cluster is responding well. Recommend adding [N] more spokes to build authority." |
| High AI citation rate | Cited by 2+ AI engines for the same query | "Your content is being cited by AI. Replicate this piece's structure (definition boxes, FAQ format, source density) across other clusters." |
| Backlink magnet | 5+ referring domains within 30 days | "This piece is attracting backlinks. Consider creating a more comprehensive version or related pieces that can benefit from internal linking." |

**Negative Triggers:**

| Trigger | Threshold | Recommendation |
|---------|-----------|---------------|
| Zero impressions after 45 days | GSC impressions = 0 after 45 days | "This page may not be indexed. Check: is it in the sitemap? Any crawl errors? Consider requesting indexing via GSC." |
| High impressions, low CTR | Impressions > 500, CTR < 1% | "People see this in search results but don't click. Recommend rewriting the title tag and meta description. Current: [title]. Suggested: [new title]." |
| High clicks, low engagement | Clicks > 100, avg engagement < 30s | "People click but leave quickly. Possible intent mismatch or weak opening. Review the AI hook and first 300 words." |
| Cluster stall | All pieces in cluster have performance score < 30 after 60 days | "This cluster isn't gaining traction. Options: (1) rewrite the hub with a stronger angle, (2) pivot to adjacent keywords with less competition, (3) kill the cluster and reallocate." |
| Ranking decline | Primary keyword drops 10+ positions between snapshots | "Ranking drop detected. Check: did Google update? Did a competitor publish stronger content? Consider a content refresh." |

### 5.2 Recommendation Presentation

All recommendations appear in the user's dashboard as actionable cards:

```
[RECOMMENDATION]
Cluster: How to Help Save the Bees
Type: Expansion Opportunity
Signal: Hub page ranking #2 for "how to help save the bees" after 3 weeks

Recommendation: This cluster is building authority quickly. Add 2 more spoke pages:
  1. "Bee-Friendly Gardening on a Budget" (targets: bee garden cheap, low cost pollinator garden)
  2. "How to Report Bee Kills and Why It Matters" (targets: report pesticide bee kill, bee die-off reporting)

[Add to Calendar]  [Dismiss]  [Modify]
```

When the user clicks "Add to Calendar," the system creates the content piece records, generates content briefs, and schedules generation dates.

---

## 6. Analytics Dashboard UI

### 6.1 Org-Level Dashboard

- **Performance overview:** Total impressions, clicks, and average position trend (line chart, trailing 90 days)
- **Content velocity:** Pieces published per week/month (bar chart)
- **Cluster health map:** Visual grid of clusters, color-coded by trajectory (green = rising, yellow = stable, red = declining, grey = new)
- **Top keywords:** Table of all primary keywords with current position, change, and traffic
- **Pending recommendations:** Action cards from the Adjuster Agent

### 6.2 Piece-Level Detail

- **Performance over time:** Impressions, clicks, position charted since publish date
- **Keyword rankings:** All keywords this piece ranks for, with positions and changes
- **Engagement metrics:** Time on page, scroll depth, bounce rate
- **Backlinks:** Referring domains with link quality indicators
- **AI citations:** Which AI engines cite this piece, for which queries

---

## 7. API Rate Limits and Costs

### Google Search Console API
- 6,000 queries per day per property (more than sufficient)
- No per-query cost

### GA4 API (Google Analytics Data API)
- 100,000 tokens per day per property
- No per-query cost
- Use batched queries to minimize token consumption

### Ahrefs API
- Rate limits vary by plan (Lite: 500 units/month, Standard: 1,000)
- Each keyword check = 1 unit
- Budget for ~50 keyword checks per biweekly pull per org at Lite tier
- DataForSEO is more cost-effective for bulk SERP data

### Perplexity / AI Citation Checking
- No official API for citation checking in v1
- Use web fetch to query and parse results
- Rate limit: 10 queries per monthly check per org (top 10 keywords only)

---

## 8. Data Retention

- Analytics snapshots retained indefinitely (they're small and valuable for trend analysis)
- Raw API response data cached for 14 days then purged (stored in `research_cache`)
- Aggregated monthly and quarterly reports stored permanently

---

*Dark Madder Specification - 07 Analytics & Adjuster - March 2026*
