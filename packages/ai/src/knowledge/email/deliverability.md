# Email Deliverability

Reference for send timing, frequency, spam avoidance, and domain warm-up.

---

## Send Timing

**B2B (SaaS, agencies, professional services):**
- Best days: Tuesday, Wednesday, Thursday
- Best times: 7-9 AM recipient's timezone
- Second window: 1-2 PM (post-lunch inbox scan)
- Avoid: Monday before 10 AM (inbox clearing), Friday after 2 PM

**B2C (consumers, creators, freelancers):**
- Best days: Tuesday, Wednesday, Thursday
- Best times: 7-9 AM (morning routine) or 7-9 PM (evening wind-down)
- Weekend exception: lifestyle, hobby, and wellness niches can send Saturday 9-11 AM

**Ecommerce:**
- Best days: Thursday, Friday (pre-weekend shopping), Sunday (browse mode)
- Best times: 10 AM or 8 PM
- Cart abandonment: send within 1 hour, then 24 hours, then 72 hours

**Newsletters:** Consistency matters more than optimal time. Pick a day and time and stick with it. Subscribers develop open habits around predictable schedules.

---

## Frequency

**New subscribers:** Higher touch is acceptable. Daily emails during the first week of a welcome sequence work because engagement is at its peak.

**Ongoing:** 1-3 times per week for most lists. More than 3x/week requires strong content quality to sustain.

**Signal to watch:** Unsubscribe rate. If it spikes after increasing frequency, pull back. A steady unsubscribe rate of 0.1-0.3% per send is normal. Above 0.5% per send indicates a frequency or relevance problem.

**Launch periods:** Daily sending is acceptable when justified by a real deadline. Acknowledge the higher frequency in the emails.

---

## Spam Triggers

**Content triggers:**
- Too many links (keep to 1-3 per email)
- Image-heavy emails with little text (aim for at least 60% text)
- URL shorteners (bit.ly, etc.) — use full URLs or branded short domains
- Spammy words in subject lines: "free," "guaranteed," "no obligation," "act now," "limited time" — especially in combination
- Large attachments — link to files instead

**Technical triggers:**
- No SPF, DKIM, or DMARC records configured
- Sending from a free email domain (gmail.com, yahoo.com) for bulk email
- Sudden volume spikes from a new domain
- High bounce rate (above 2%)
- Low engagement rate signals to inbox providers that content is unwanted

**List hygiene:**
- Remove hard bounces immediately
- Suppress unsubscribes (legally required in most jurisdictions)
- Clean inactive subscribers quarterly (or run a re-engagement sequence first)
- Never purchase email lists or scrape addresses — this destroys sender reputation

---

## Domain Warm-Up

For new domains or domains that have not sent in volume before.

**Ramp schedule:**
- Day 1-3: 20 emails/day
- Day 4-7: Increase 20% daily
- Week 2: 50-100/day
- Week 3: 200-500/day
- Week 4+: Continue scaling 20-30% per day until target volume

**Best practices:**
- Send to your most engaged contacts first (people who have replied to you, existing customers, active subscribers)
- Monitor bounce rate throughout — stay under 2%
- Monitor spam complaint rate — stay under 0.1%
- If either metric spikes, reduce volume and investigate before continuing
- Use a subdomain for marketing email (e.g., mail.yourdomain.com) to protect your primary domain reputation
- Authenticate with SPF, DKIM, and DMARC before sending any volume
