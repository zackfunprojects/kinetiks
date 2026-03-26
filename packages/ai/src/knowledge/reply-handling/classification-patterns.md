# Reply Classification Patterns

Taxonomy for classifying inbound replies to outbound sequences. Each classification triggers a different response strategy.

---

## Classification Taxonomy

### Positive Intent

**Interested** - wants to learn more
- Signals: asks questions, requests demo, mentions pain point, forwards to colleague
- Response: answer questions directly, propose next step, keep momentum
- Priority: high - respond within 2 hours

**Meeting Request** - ready to talk
- Signals: asks for availability, suggests a time, mentions calendar
- Response: send calendar link immediately, confirm within 1 hour
- Priority: critical - respond within 30 minutes

**Referral** - not the right person but pointing you to someone
- Signals: "you should talk to...", "let me connect you with...", "CC'ing..."
- Response: thank them, ask for warm intro if not already provided
- Priority: high - the referred contact is now a warm lead

### Neutral

**Information Request** - not buying, but curious
- Signals: asks about pricing, features, or comparisons without urgency
- Response: provide concise info, include one question to qualify
- Priority: medium - respond within 4 hours

**Out of Office** - auto-reply
- Signals: OOO message, vacation reply, parental leave notice
- Response: note return date, schedule follow-up for return date + 2 days
- Priority: low - no immediate response needed

**Not Now** - timing is wrong, not a rejection
- Signals: "maybe next quarter", "not a priority right now", "reach out in..."
- Response: acknowledge, set specific follow-up date, send value-add content
- Priority: medium - schedule re-engagement

### Negative

**Objection** - has a specific concern blocking them
- Signals: "too expensive", "we already use X", "not sure it would work for us"
- Response: address the specific objection with evidence (see objection-responses.md)
- Priority: high - objections are buying signals in disguise

**Unsubscribe** - wants to stop receiving messages
- Signals: "remove me", "unsubscribe", "stop emailing", "not interested"
- Response: immediately honor the request, add to suppression list
- Priority: critical - compliance requirement, process within 1 hour
- NEVER respond with a pitch or "are you sure?"

**Hostile** - angry or threatening
- Signals: profanity, threats, aggressive language, "I'll report you"
- Response: apologize sincerely, immediately suppress, flag for review
- Priority: critical - escalate to human, add to permanent suppression

## Classification Confidence

Rate each classification with confidence:
- **High (>90%)** - clear signal, unambiguous language
- **Medium (60-90%)** - probable intent but could be misread
- **Low (<60%)** - ambiguous, escalate to human review

When confidence is low, default to the more cautious interpretation. An "interested" reply misclassified as "not now" is recoverable. An "unsubscribe" misclassified as "objection" is a compliance violation.

## Multi-Signal Replies

Some replies contain multiple signals:
- "I'm interested but it's too expensive" -> Interested + Objection (lead with objection handling)
- "Talk to my colleague Sarah, she handles this" -> Referral (prioritize the warm intro)
- "Not now, maybe in Q3. Can you send pricing?" -> Not Now + Info Request (send pricing, schedule Q3 follow-up)

Always address the most actionable signal first.
