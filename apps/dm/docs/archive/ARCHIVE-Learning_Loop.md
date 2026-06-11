> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/knowledge-trainer.md (ledger, drift) and specs/editor-review.md (capture)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# 05 - Learning Loop

## Edit Tracking, Diff Classification & Persistent Learning

**System:** Dark Madder
**Depends on:** 01-DATA-MODEL, 02-VOICE-ENGINE
**Depended on by:** 04-CONTENT-GENERATOR (corrections injection at generation time)

---

## 1. Purpose

The Learning Loop is what makes Dark Madder get better over time. Every edit a user makes to a generated draft is captured, classified, and distilled into a persistent rule that improves future generations. The system should produce noticeably fewer edits per draft over time. If it doesn't, something is broken.

---

## 2. Edit Capture

### 2.1 What Gets Captured

When the user edits a draft in the editor, the system captures:
- The original AI-generated text (paragraph-level granularity)
- The user's edited text
- The section type (opening, body, transition, closing, faq)
- The paragraph index within the piece

### 2.2 Filtering Noise

Not every keystroke is a learning signal. Filter out:

- **Typo fixes:** Levenshtein distance < 5% of paragraph length AND no semantic change
- **Factual additions:** User adding entirely new paragraphs (not corrections, just additions of information the AI didn't have)
- **Formatting-only changes:** Whitespace, punctuation-only edits

The filter runs as a preprocessing step before classification. It uses a quick Haiku classification call:

```
Given the following original and edited text, classify the edit:

Original: "{original}"
Edited: "{edited}"

Is this:
A) A substantive voice/style change (the meaning or expression changed)
B) A factual addition (new information was added that wasn't in the original)
C) A minor fix (typo, punctuation, formatting only)
D) A deletion (content was removed)

Return only the letter.
```

Only edits classified as A are processed through the full learning pipeline. B edits are logged as factual additions (may indicate the org's knowledge base needs updating). C edits are discarded. D edits are logged but processed differently (see section 3.3).

---

## 3. Diff Classification

For each substantive edit (type A), the system runs a deeper classification to understand what kind of voice correction was made and extract a reusable rule.

### 3.1 The Classification Prompt

```
You are a writing style analyst. A human editor changed AI-generated text. Your job is to understand WHY they changed it and extract a reusable rule.

Original text: "{original}"
Edited text: "{edited}"
Section type: "{section_type}" (opening / body / transition / closing / faq)
Content type: "{content_type}" (blog / guide / playbook)

1. Classify the edit type:
   - voice_correction: The tone, warmth, or personality was wrong
   - word_choice: Specific words or phrases were swapped
   - transition_fix: The connection between this paragraph and the previous/next was fixed
   - rhythm_adjustment: Sentence length or cadence was changed
   - structural_change: The organization or ordering of information was changed
   - deletion: Content was removed (the AI over-generated)

2. Extract the rule. Write a clear, reusable instruction that would prevent this edit in future generations. Be specific. 
   BAD rule: "Write more naturally"
   GOOD rule: "When presenting statistics about environmental impact, follow each data point with a human-scale comparison that makes the number tangible"

3. Provide the scope:
   - "user" if this is about the author's personal writing style
   - "org" if this is about the brand's voice rules
   - "product" if this is about how a specific product should be discussed

4. Categorize:
   - voice / structure / word_choice / transitions / tone / rhythm / formatting / terminology

Return as JSON: {edit_type, rule_text, bad_example, good_example, scope, category}
```

### 3.2 Rule Deduplication

Before adding a new rule to the corrections ledger, check for duplicates:

1. Run a semantic similarity check against existing active rules in the same scope
2. If a new rule is >85% similar to an existing rule, merge them: update the existing rule's examples and increment its `times_applied` counter
3. If the new rule contradicts an existing rule, flag both for user review

### 3.3 Deletion Handling

When the user deletes AI-generated content, this is a signal that the system over-generated. Log these separately:

- If the deletion is in the same section type across multiple pieces, it may indicate the template needs shortening for that section
- If the deletion is always in a specific part of a section (e.g., always the last paragraph of body sections), the template may need a tighter word count target
- Surface deletion patterns in the monthly voice health report

---

## 4. The Corrections Ledger

### 4.1 Structure

Each rule in the ledger has:
- **Scope:** user, org, or product
- **Category:** voice, structure, word_choice, transitions, tone, rhythm, formatting, terminology
- **Rule text:** The reusable instruction
- **Bad example:** What triggered this rule (from the original AI text)
- **Good example:** What the user changed it to
- **Effectiveness score:** Starts at 1.0, decays if the user still makes similar edits despite this rule being active

### 4.2 Injection at Generation Time

When the Content Generator (doc 04) produces a section, it queries the corrections ledger for relevant rules:

```sql
SELECT rule_text, bad_example, good_example, category
FROM corrections_ledger
WHERE active = true
  AND effectiveness_score > 0.3
  AND (
    (scope = 'user' AND user_id = $user_id) OR
    (scope = 'org' AND org_id = $org_id) OR
    (scope = 'product' AND product_id = $product_id)
  )
ORDER BY effectiveness_score DESC, times_applied DESC
LIMIT 20;
```

The top 20 most effective, most-applied rules are included in the generation prompt for each section. They are formatted as a "Learned Preferences" block:

```
LEARNED PREFERENCES (from previous editing sessions):
- When presenting statistics, always follow with a human-scale comparison (e.g., "That's more biodiversity per square meter than a tropical rainforest")
- Never use "Additionally" or "Furthermore" as paragraph openers. Bridge paragraphs through shared concepts.
- After explaining a complex mechanism, use a short sentence (3-8 words) for emphasis before moving on.
- Replace "significant" with the actual number or a concrete comparison.
[... up to 20 rules]
```

### 4.3 Rule Lifecycle

**Active:** Rule is injected into generation prompts.
**Decaying:** Effectiveness score has dropped below 0.5. Still injected but flagged for review.
**Inactive:** Effectiveness score dropped below 0.3, or user manually deactivated it. No longer injected.

**Effectiveness decay:** If the system generates content using a rule, but the user still makes a similar edit (same category, same section type), the rule's effectiveness score drops by 0.15. This means the rule wasn't specific enough, or the AI isn't applying it properly. After 4-5 overrides, the rule becomes inactive and a new, hopefully more specific rule is extracted from the latest edit.

### 4.4 Ledger Maintenance

**Monthly cleanup:** Deactivate rules that have never been applied (times_applied = 0) after 60 days.
**Conflict resolution:** If two active rules in the same scope contradict each other, surface them to the user for resolution.
**Export:** The user can view, edit, and export the full corrections ledger for their user profile and any org they manage.

---

## 5. Voice Drift Detection

### 5.1 What Is Voice Drift

Voice drift is when the generation quality degrades over time despite having corrections. Causes include: accumulated contradictory rules, model updates changing generation behavior, or the user's own style evolving without the profile being updated.

### 5.2 Drift Metrics

Track these across rolling 10-piece windows per org:

- **Edits per draft:** Average number of substantive edits before approval. Should trend downward over time.
- **Voice match score trend:** Average post-audit voice match score. Should trend upward.
- **Edit category distribution:** What types of edits is the user still making? If the same category dominates (e.g., 60% of edits are transition fixes), the system has a specific weakness.
- **Time to approval:** How long between draft generation and user approval. Should decrease.

### 5.3 Drift Alerts

Trigger an alert when:
- Edits per draft increases for 3 consecutive pieces
- Voice match score drops below 80 for 3 consecutive pieces
- A single edit category represents >50% of all edits over the last 10 pieces
- Time to approval increases for 5 consecutive pieces

The alert suggests: "Your voice profile may need recalibration. Would you like to run a quick tuning session?" This triggers a repeat of the Phase 2 onboarding (sample paragraph editing) with the current voice profile as the starting point.

---

## 6. Knowledge Base Updates

Edits classified as type B (factual additions) indicate that the org's knowledge base is incomplete. These are logged separately and surfaced to the user:

"Over the last 5 pieces, you added factual information about [topic] that Dark Madder didn't know. Would you like to add this to [org name]'s knowledge base?"

The knowledge base is stored as a supplementary JSONB field on the org record. It contains verified facts, statistics, and claims that the org considers canonical. These are included in generation prompts as source material.

---

## 7. Learning Loop Metrics Dashboard

The user should see:
- **Learning curve chart:** Edits per draft over time (line chart, should trend down)
- **Voice match score over time:** Line chart, should trend up
- **Corrections ledger summary:** Total active rules by category, with effectiveness scores
- **Edit type breakdown:** Pie chart of what kind of edits are still needed
- **Drift status:** Green (improving), Yellow (plateau), Red (drifting)

---

*Dark Madder Specification - 05 Learning Loop - March 2026*
