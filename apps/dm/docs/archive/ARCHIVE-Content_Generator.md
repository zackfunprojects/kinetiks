> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/generation-engine.md and specs/editor-review.md
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# 04 - Content Generator

## Writing System, Template Architecture & Draft Workflow

**System:** Dark Madder
**Depends on:** 01-DATA-MODEL, 02-VOICE-ENGINE, 03-RESEARCH-PLANNER, 05-LEARNING-LOOP
**Depended on by:** 06-FRAMER-INTEGRATION, 08-SPLITS-ENGINE

---

## 1. Purpose

The Content Generator turns a content brief into a complete, publish-ready draft that could pass as expert human writing. It is not a single prompt-to-output call. It is a multi-stage pipeline that generates content section by section, enforces craft-level writing techniques at each stage, runs a post-generation quality audit, and only presents the draft for review after it meets minimum quality thresholds.

---

## 2. Content Type Templates

Every content type has a structural template that defines the required sections, their order, target word counts, and the specific structural requirements from the Talvi Web Content Strategy methodology.

### 2.1 Hub Page Template (2,500-4,000 words)

```
SECTION 1: Opening (200-300 words)
  - Human hook: 2-4 sentences of sensory, personal, or provocative entry point
  - AI hook: Direct answer to the implied search query within first 150 words
  - Scope statement: What the reader will learn in this piece
  - Establish recurring metaphor/image

SECTION 2: Key Takeaways (100-150 words)
  - 5-7 bullet points summarizing main findings
  - Written as standalone claims, not teasers

SECTION 3-7: Body Sections (400-600 words each)
  - Each section headed by a searchable question (H2)
  - Subsections use H3 where needed
  - Each section includes at least one of: definition box, data point with source, concrete example
  - Transitions: first sentence of each section bridges from previous section's last sentence
  - Rhythm enforcement: no 4+ consecutive sentences of similar length
  - Warmth woven through information, not in separate paragraphs

SECTION 8: FAQ (200-300 words)
  - 4-6 questions sourced from People Also Ask, Reddit, keyword research
  - Answers are 40-60 words each, direct and complete
  - Structured for FAQ schema markup

SECTION 9: Sources (no word count - functional)
  - Every cited claim linked: organization name, year, URL
  - Primary sources preferred over secondary

METADATA (generated alongside content):
  - Meta description (140-155 characters)
  - Primary keyword confirmation
  - Target URL/slug
  - Author name + bio link
  - AI transparency line
  - Internal link placements (3-5, contextually embedded)
  - Schema markup data (Article, FAQ, Breadcrumb)
```

### 2.2 Spoke Page Template (1,200-2,000 words)

```
SECTION 1: Opening (150-200 words)
  - Same AI hook + human hook pattern as hub, shorter
  - Immediate relevance: why this specific subtopic matters

SECTION 2: Key Takeaways (80-100 words)
  - 3-5 bullet points

SECTION 3-5: Body Sections (250-450 words each)
  - Focused depth on the subtopic
  - Links back to the hub page at least once
  - Cross-links to related spokes where natural

SECTION 6: FAQ (150-200 words)
  - 3-4 questions

SECTION 7: Sources

METADATA: Same as hub page
```

### 2.3 Playbook Template (2,000-3,500 words)

```
SECTION 1: Opening (150-250 words)
  - Context: What problem this playbook solves
  - Who it's for
  - What they'll have at the end

SECTION 2: Prerequisites / Before You Start (100-200 words)
  - What the reader needs before following the playbook

SECTION 3-8: Step-by-Step Sections (300-500 words each)
  - Each section is one phase/step
  - Clear action items within each step
  - Concrete examples, not abstract advice
  - HowTo schema-compatible structure

SECTION 9: Common Mistakes / Pitfalls (200-300 words)
  - Honest about what goes wrong

SECTION 10: FAQ (150-200 words)

SECTION 11: Sources

METADATA: Same as above, plus HowTo schema data
```

---

## 3. The Generation Pipeline

Content is not generated in a single API call. It runs through a multi-stage pipeline where each stage builds on the output of the previous one.

### Stage 1: Outline Generation

**Input:** Content brief (from doc 03) + content type template
**Output:** Detailed section-by-section outline

The outline includes:
- Exact headings (phrased as searchable questions)
- Key points for each section
- Where definition boxes go
- Where the recurring metaphor gets established and referenced
- Where internal links are placed
- Which data points / sources are used in which sections

**LLM call:** Claude Sonnet with the content brief, template, and this instruction:

```
Generate a detailed outline for this content piece. For each section, specify:
1. The exact heading (as a searchable question for body sections)
2. The 3-5 key points to cover
3. Which sources/data points support each point
4. Where definition boxes are needed
5. A recurring metaphor or image to use throughout (establish in section 1, reference in section 4 and closing)
6. Where internal links to [list of available internal content] fit naturally

The outline must follow this template structure exactly: [template]
```

The outline is stored and can optionally be shown to the user for approval before generation proceeds (configurable per org - default is auto-proceed).

### Stage 2: Section-by-Section Generation

Each section is generated in a separate API call. This enables:
- Section-specific voice brief injection
- Transition continuity (each call includes the previous section's last paragraph)
- Corrections ledger rules filtered by section type
- Independent quality checking per section

**Per-section LLM call structure:**

```
System prompt:
You are a content writer. You are writing one section of a larger piece.
Your voice profile: [Voice Brief - section-specific subset of the full voice profile]
Your corrections ledger rules for this section type: [Filtered rules]

You MUST follow these craft rules:
1. Vary sentence length deliberately. After a long explanatory sentence (25+ words), use a short declarative sentence (3-8 words) for emphasis. Never write 4+ consecutive sentences of similar length.
2. Transitions: Your first sentence MUST connect to the previous section's last sentence through a shared concept or idea. Do NOT use "Furthermore," "Additionally," "Moreover," or any structural transition word.
3. Warmth is woven INTO informational sentences, not added in separate paragraphs. Every paragraph should contain both information and voice. If you could split the output into "warm parts" and "informational parts," you've failed.
4. Specificity over adjectives. Never write "incredible," "amazing," "remarkable," "significant" - replace with a concrete detail that does the emotional work.
5. If this section contains data, the data should be inside sentences that also provide context, scale, or human connection. Do not present data in isolation.

User prompt:
Write section [N] of this piece.
Outline for this section: [from Stage 1]
Previous section's last paragraph: [for transition continuity]
Primary keyword to include naturally: [keyword]
Definition boxes needed in this section: [list]
Internal links to embed: [list with anchor text and target]

Word count target: [target] words. Do not pad. If the section's content is complete in fewer words, stop.
```

### Stage 3: Assembly and Transition Audit

All sections are assembled into the complete piece. A dedicated transition audit pass runs:

```
Read the following content piece. For every paragraph boundary (where one paragraph ends and the next begins), evaluate:

1. Does the first sentence of the new paragraph connect to the last sentence of the previous paragraph through a shared concept?
2. Does the transition feel like one continuous thought, or like two separate documents spliced together?
3. Rate each transition: smooth / acceptable / jarring

For any transition rated "jarring," rewrite ONLY the first 1-2 sentences of the receiving paragraph to create a natural bridge. Do not change the content or information - only the connecting tissue.

Return the full piece with transition fixes applied, plus a report of which transitions were fixed and how.
```

### Stage 4: Voice Audit

The full post-generation voice audit described in doc 02, Section 5, Stage 3. Checks the complete piece against the voice profile across all dimensions. Returns a voice match score and a list of violations.

**Must-fix violations** (trigger automatic section rewrite):
- Any banned phrase present
- Any section with 4+ same-cadence sentences
- Any structural transition word ("Furthermore," "Additionally," etc.)
- Warmth bolted on (detected by analyzing paragraph-level information+warmth co-occurrence)
- Missing recurring metaphor/image

**Warnings** (flagged for user review but not auto-fixed):
- Voice match score below 85
- Readability score outside the org's typical range
- Word count more than 20% over target

### Stage 5: Metadata Generation

After the body content passes voice audit, generate:
- Meta description (140-155 characters, includes primary keyword, compelling)
- FAQ schema data (from the FAQ section)
- Article schema data (headline, author, dates, description)
- HowTo schema data (if playbook type)
- Breadcrumb schema data
- Key takeaways extraction (from the Key Takeaways section)
- Definition boxes extraction (from inline definition boxes)
- Internal link mapping (which anchors link where)

All stored in the `content_pieces` record's structured fields.

### Stage 6: Draft Queueing

The complete draft (body + metadata + schema) moves to `status: 'draft'` and the user is notified. Notification channels for v1: in-app notification on the dashboard. Future: email, Slack webhook.

---

## 4. Scheduling and Auto-Generation

### 4.1 The Scheduler

A Supabase Edge Function runs on a cron schedule (daily at a configured time, default 6:00 AM ET).

**Daily check:**
1. Query `content_pieces` where `scheduled_generate_at <= now()` and `status = 'planned'`
2. For each piece found, trigger the generation pipeline
3. Update status to `generating` at pipeline start
4. Update status to `draft` when pipeline completes
5. Create notification for the user

### 4.2 Generation Queue Management

Only one piece generates at a time per org (to avoid API rate limits and ensure quality). If multiple pieces are scheduled for the same day, they queue and process sequentially.

Estimated generation time per piece: 3-5 minutes (multiple API calls + audits). The user should see a progress indicator if they're watching the dashboard.

### 4.3 Manual Generation

The user can trigger generation for any planned piece at any time by clicking "Generate Now" from the calendar or piece detail view.

---

## 5. The Draft Editor

### 5.1 Editor Requirements

The draft editor is where the user reviews, edits, and approves generated content. It needs to:

- Display the full piece in a clean, WYSIWYG-style editor (rich text, not raw markdown)
- Show the voice match score and any flagged warnings
- Support inline editing with change tracking (every edit is captured as a `content_edits` record)
- Show the content brief alongside the draft for reference
- Show the pre-publish checklist as a sidebar with auto-checked items
- Provide "Approve" and "Request Regeneration" actions

### 5.2 Edit Capture

Every substantive edit the user makes is captured:

1. User modifies text in the editor
2. On save (or auto-save), the system diffs the current version against the previous version
3. For each changed paragraph, create a `content_edits` record with original and edited text
4. The Learning Loop (doc 05) processes these edits asynchronously

**Important:** Small edits (typo fixes, punctuation) should be filtered out. The system should only capture edits where the semantic content or voice/style changed. A simple heuristic: ignore edits where the Levenshtein distance is < 5% of the paragraph length.

### 5.3 Pre-Publish Checklist (Automated)

Based on the Talvi Blog Writing Lessons pre-publish checklist, automated where possible:

**Structure (auto-checked):**
- [ ] Opening answers the implied search query within first 150 words
- [ ] Headings phrased as searchable questions
- [ ] Key Takeaways section present
- [ ] Key terms defined in definition boxes
- [ ] FAQ section with 4-6 questions and concise answers
- [ ] 3-5 internal link placeholders present
- [ ] Sources section complete with org name, year, link
- [ ] Meta description present (140-155 characters)
- [ ] Primary keyword, target URL, author, dates present
- [ ] AI Transparency line present

**Voice (partially auto-checked, partially manual):**
- [ ] Voice match score >= 85
- [ ] No structural transition words detected
- [ ] Sentence rhythm variation present (automated check)
- [ ] Recurring metaphor/image present (automated check)
- [ ] *Manual:* Read the piece out loud. Does it sound like a person, not a report?
- [ ] *Manual:* Is warmth woven through, not bolted on?

**Tone (partially auto-checked):**
- [ ] Zero banned phrases detected
- [ ] No guilt, pity, or shame language (automated scan)
- [ ] Tradeoffs named honestly
- [ ] *Manual:* Would described people/communities feel respected?
- [ ] *Manual:* Would this be worth reading without any brand mentions?

### 5.4 Approval Flow

User clicks "Approve" after editing. This:
1. Sets `status: 'approved'` and `approved_at: now()`
2. Processes all captured edits through the Learning Loop
3. The piece is now ready for Framer publishing (doc 06)
4. If the org has auto-publish enabled, it pushes to Framer immediately
5. If not, it waits for the user to click "Publish"

---

## 6. Generation Cost Tracking

Every generation pipeline run logs:
- Number of API calls made
- Total input tokens
- Total output tokens
- Model used (Sonnet for generation, Haiku for classification)
- Estimated cost

This data is stored on the `content_pieces` record and surfaced in the org dashboard. The user said cost doesn't matter, but visibility is still valuable for understanding the system's behavior.

---

## 7. Content Type Specific Generation Notes

### Blogs

Standard pipeline. Most common content type. The craft enforcement is most critical here because blogs are the primary vehicle for voice expression.

### Guides

Higher emphasis on structural clarity. The voice audit weighs the "authoritative but accessible" tone from the org's `tone_by_channel.guide` profile. More definition boxes, more explicit step-by-step structure.

### Playbooks

Most structured content type. The HowTo schema requirement means each step must be clearly delineated. Voice shifts slightly toward "the coach giving you the actual plays" - more direct, less philosophical. Steps must include concrete, actionable items, not abstract advice.

---

## 8. Regeneration and Versioning

### Full Regeneration

If the user is unhappy with a draft, they can request a full regeneration. This:
1. Stores the current draft as a version (v1, v2, etc.)
2. Re-runs the pipeline with updated voice profile (including any corrections from the current draft's edits)
3. Optionally allows the user to provide specific feedback: "The opening was too generic" or "Needs more data in section 3"

### Section Regeneration

The user can also regenerate individual sections. This is more targeted:
1. Keeps all other sections intact
2. Re-runs only the specified section with additional context from user feedback
3. Re-runs the transition audit on the boundaries between the new section and its neighbors

### Version History

All versions of a piece are stored. The user can view and restore any previous version.

---

*Dark Madder Specification - 04 Content Generator - March 2026*
