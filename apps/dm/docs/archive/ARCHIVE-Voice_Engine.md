> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/knowledge-trainer.md (rebuilt as Cortex trainer)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# 02 - Voice Engine

## Brand Understanding, Voice Profiling & Writing Identity

**System:** Dark Madder
**Depends on:** 01-DATA-MODEL
**Depended on by:** 04-CONTENT-GENERATOR, 05-LEARNING-LOOP, 08-SPLITS-ENGINE

---

## 1. Why This Is the Core

Every AI content tool produces content that sounds like AI. The problem is not vocabulary or grammar - it is the absence of a genuine voice. AI-generated content has a characteristic flatness: even sentence cadence, generic transitions ("Furthermore," "Additionally"), bolted-on warmth, and a complete lack of the quirks, rhythms, and recurring images that make a human writer recognizable.

Dark Madder's voice engine is not a "tone selector" with options like "professional" or "casual." It is a deep profiling system that captures how a specific person, organization, or product communicates at the paragraph level - not just what words they use, but how they build momentum, how they transition between ideas, how they balance data with warmth, and how they land a point.

The goal: a reader should not be able to distinguish a Dark Madder draft from something the author wrote themselves.

---

## 2. The Three-Layer Voice System

Every piece of content Dark Madder generates uses up to three stacked voice layers. The layers are additive and hierarchical - lower layers constrain, upper layers personalize.

### Layer 1: User Voice (The Author)

This is the individual human's writing identity. It persists across every org and product they write for, because a person's natural voice doesn't fundamentally change when they switch contexts.

**What it captures:**
- Sentence rhythm preferences (does this writer use short punches after long explanations? Do they favor compound sentences?)
- Vocabulary tendencies (philosophical references? Technical precision? Conversational contractions?)
- Transition style (thought bridges vs. structural markers vs. implicit flow)
- Rhetorical patterns (do they ask questions then answer them? Do they use "here's the thing" pivots?)
- Warmth integration style (woven through information, or reserved for openings/closings?)
- Structural preferences (how they organize arguments, where they place the strongest point)

**Example (Zack):** Philosophical lens (Alan Watts, Stoics, Camus). Direct, no-BS delivery. Short declarative sentences for emphasis after longer explanatory passages. Warmth comes from specificity and honest acknowledgment of difficulty, not from sentimentality. No em dashes. Concrete examples over abstractions.

### Layer 2: Org Voice (The Brand)

This is the organization's communication identity. It acts as a constraint layer - the org voice defines what is and isn't allowed regardless of who is writing.

**What it captures:**
- Voice adjectives (Talvi: warm, curious, specific, honest, actionable)
- Banned phrases and patterns ("save the world," "give back," guilt language)
- Required patterns (person-first language, active voice, naming systems not villains)
- Tone calibration by content type (blog vs. guide vs. playbook)
- Emotional boundaries (Talvi: no guilt, no pity, no empty urgency)
- Subject-matter framing rules (Talvi: "the response" not "the fight")
- Integration spectrum (how and when the brand mentions itself)

### Layer 3: Product Voice (The Subject)

This is optional and adds product-specific language rules when the content is about a particular product within an org.

**What it captures:**
- Product terminology (approved names, descriptions, feature language)
- Metaphor library (Talvi round-up app: building metaphor, neighborhood metaphor)
- Competitor framing (how to reference alternatives without disparaging)
- Technical accuracy requirements (specific claims that must be precise)
- Integration language (how the product is introduced in content - never first, never the only option)

### How Layers Stack

When generating a Talvi blog post authored by Zack about the round-up app:

1. Start with the **content template** (structural requirements from doc 04)
2. Apply **Product Voice** constraints (round-up app terminology, approved metaphors)
3. Apply **Org Voice** constraints (Talvi's banned phrases, tone rules, integration spectrum)
4. Apply **User Voice** characteristics (Zack's rhythm, vocabulary, transition style)

Conflicts resolve downward: if Zack's natural style uses em dashes but Talvi bans them, Talvi's org rule wins. The org voice is the guardrail; the user voice is the personality within those guardrails.

---

## 3. Voice Onboarding Flow

New orgs go through a four-phase onboarding process. The goal is to build a voice profile that is usable within 30 minutes and excellent within a week.

### Phase 1: Website Scan (Automated, ~2 minutes)

When a user creates a new org and provides a domain, Dark Madder crawls the site and extracts voice signals.

**Technical implementation:**
1. Fetch the homepage + up to 10 content pages (blog posts, about page, key landing pages) using a headless browser or fetch API
2. Extract all body text, stripping navigation, footers, and boilerplate
3. Run an LLM analysis pass (Claude Sonnet) with the following extraction prompt:

```
Analyze the following website content and extract a voice profile. Return a structured JSON with:

1. adjectives: 5 words that best describe the writing voice
2. tone: One paragraph describing the overall tone
3. sentence_patterns: Analysis of sentence length variation, average sentence length, use of fragments, use of questions
4. vocabulary_level: technical/conversational/academic/casual with specific examples
5. transition_patterns: How paragraphs connect to each other - examples of actual transitions used
6. warmth_style: How the writing conveys care or engagement - through data, through stories, through direct address, through humor
7. banned_patterns: Any patterns conspicuously avoided (e.g., no exclamation marks, no jargon, no first person)
8. unique_markers: Any distinctive writing habits, recurring phrases, or structural quirks
9. emotional_register: What emotions the writing evokes and how (guilt, inspiration, curiosity, urgency, calm)
10. formality_spectrum: Where this falls on formal-to-casual, with evidence

Provide specific quoted examples from the text for each finding.
```

4. Store the extracted profile as the initial org voice profile

**What the user sees:** A summary card showing the AI's read on their brand voice, with the option to confirm, adjust, or disagree with each finding.

### Phase 2: Iterative Refinement via Sample Drafts (~15-30 minutes)

Rather than a long conversational interview (which produces abstract answers), Dark Madder generates 2-3 short sample paragraphs on topics relevant to the org and asks the user to edit them.

**Flow:**
1. System selects a likely topic based on the org's industry/domain
2. Generates a ~200-word sample paragraph using the Phase 1 voice profile
3. Presents it in an editor with the prompt: "Edit this until it sounds like your brand. Change anything - words, structure, tone, length."
4. User edits the paragraph
5. System analyzes the diff (using the Learning Loop pattern from doc 05) and updates the voice profile
6. Repeat 2-3 times with different content types (e.g., an opening paragraph, a data-heavy explanation paragraph, a closing paragraph)

This is more effective than asking "how would you describe your brand's tone?" because it captures what the user actually does, not what they think they do.

### Phase 3: Document Upload (Optional, ~5 minutes)

If the org has existing brand guidelines, content style docs, or writing samples, the user can upload them. Dark Madder processes these through the same LLM extraction pipeline as the website scan, cross-references the findings with the Phase 1+2 profile, and resolves any conflicts by flagging them for the user.

**Supported uploads:**
- Brand guidelines / style guides (.docx, .pdf, .md)
- Writing samples / published content (.docx, .pdf, .md, URLs)
- Competitor content to differentiate from (.docx, .pdf, URLs)

For Talvi specifically, the Content Guidelines, Blog Writing Lessons, Web Content Strategy, and Answer Platform Strategy docs would all be uploaded here. The extraction would capture everything from the five adjectives to the "woven not bolted" warmth principle to the pre-publish checklist.

### Phase 4: Continuous Calibration (Ongoing)

After onboarding, every edit the user makes to a generated draft refines the voice profile further (see doc 05 - Learning Loop). The voice profile is a living document that improves with use.

---

## 4. Voice Profile Schema (Detailed)

The `voice_profiles` table in doc 01 stores the raw data. Here is the full specification for each JSONB field.

### adjectives

```json
{
  "primary": ["warm", "direct", "curious", "specific", "honest"],
  "secondary": ["understated", "grounded"],
  "anti_adjectives": ["preachy", "clinical", "performative"]
}
```

### sentence_rhythm

```json
{
  "avg_sentence_length": 18,
  "length_variation": "high",
  "uses_fragments": true,
  "fragment_examples": ["Yes. And also: it's complicated.", "The counting matters. Fund it."],
  "short_punch_after_long": true,
  "question_frequency": "moderate",
  "max_consecutive_same_length": 3,
  "rhythm_notes": "Varies between long explanatory sentences (25-35 words) and short declarative punches (3-8 words). Short sentences used for emphasis after complex explanations. Never more than three sentences of similar length in a row."
}
```

### vocabulary_preferences

```json
{
  "preferred_words": ["specific", "genuine", "meaningful", "compound"],
  "avoided_words": ["incredible", "amazing", "passionate", "impactful", "stakeholder"],
  "preferred_connectors": ["but", "and", "the thing is", "here's what that means"],
  "avoided_connectors": ["furthermore", "additionally", "moreover", "it is worth noting that"],
  "contraction_use": "always",
  "jargon_tolerance": "low",
  "vocabulary_level": "conversational_expert"
}
```

### banned_phrases

```json
[
  {"phrase": "save the world", "reason": "Too big, too vague, too much pressure"},
  {"phrase": "give back", "reason": "Implies a debt"},
  {"phrase": "make a difference", "reason": "Empty - be specific"},
  {"phrase": "just donate", "reason": "Manipulative"},
  {"phrase": "it only takes $1", "reason": "Manipulative"},
  {"phrase": "—", "reason": "No em dashes. Use commas, periods, or parentheses."}
]
```

### required_patterns

```json
[
  {"pattern": "person_first_language", "rule": "People experiencing X, not 'the X'"},
  {"pattern": "active_voice", "rule": "Always active voice unless passive is clearly better"},
  {"pattern": "systems_not_villains", "rule": "Name systems and incentives, not villains"},
  {"pattern": "and_not_or", "rule": "Use 'and' when listing actions. People can do more than one thing."},
  {"pattern": "tradeoff_honesty", "rule": "Name tradeoffs explicitly. Complexity is the content."},
  {"pattern": "sources_cited", "rule": "Every factual claim must cite: org name, year, link"}
]
```

### tone_by_channel

```json
{
  "blog": "Curious, knowledgeable friend. Warmth woven through information. Reads like something you'd actually finish.",
  "guide": "Authoritative but accessible. More structured, still warm. The expert who respects your time.",
  "playbook": "Direct and tactical. Less warmth, more utility. The coach giving you the actual plays."
}
```

### sample_excerpts

```json
[
  {
    "text": "Coral reefs cover less than 1% of the ocean floor but support roughly 25% of all marine species. That's more biodiversity packed into a smaller area than almost any other ecosystem on the planet, including tropical rainforests.",
    "label": "Data with warmth woven in",
    "content_type": "blog",
    "what_it_demonstrates": ["specificity over adjectives", "scale communicated through comparison", "warmth in the information itself"]
  }
]
```

---

## 5. Voice Application During Generation

The voice profile is not a system prompt preamble that says "write in a warm, curious tone." It is applied at multiple stages during content generation.

### Stage 1: Pre-Generation Voice Brief

Before generating any section of content, the system assembles a **Voice Brief** - a focused, relevant subset of the voice profile tailored to the specific section being written.

For an opening paragraph, the brief emphasizes: the AI hook requirement, how this voice handles openings (sensory entry point? direct question? provocative claim?), warmth integration style for introductions, and sentence rhythm for first impressions.

For a body section with data, the brief emphasizes: how this voice weaves texture through facts, transition expectations from the previous section, vocabulary preferences for technical explanation, and the "woven not bolted" principle.

For a closing, the brief emphasizes: how this voice earns warmth at the end, the requirement to pay off specifics introduced earlier (not invent new sentiment), and the structural pattern for calls to action.

### Stage 2: Section-Level Generation

Content is generated section by section, not as a monolithic prompt. Each section generation call includes:

1. The content template for this section type (from doc 04)
2. The relevant Voice Brief
3. The previous section's last paragraph (for transition continuity)
4. Relevant corrections ledger rules for this section type
5. The content brief (topic, keywords, research data)

### Stage 3: Post-Generation Voice Audit

After all sections are generated, a separate LLM pass runs a voice consistency check:

```
You are a voice consistency auditor. You have been given:
1. A voice profile describing how this brand writes
2. A generated piece of content

Check the content against the voice profile on these dimensions:
- Are banned phrases present? List any violations.
- Does the sentence rhythm match the profile? Flag sections with flat cadence.
- Are transitions between paragraphs bridged with actual connecting thoughts, or do they use structural markers (Furthermore, Additionally)?
- Is warmth woven through informational paragraphs, or bolted on in separate paragraphs?
- Read the last sentence of each paragraph and the first sentence of the next. Do the transitions hold?
- Is there at least one recurring image or metaphor creating cohesion?
- Does the closing pay off details from earlier in the piece?
- Are all factual claims sourced?

Return a structured report with: violations (must fix), warnings (should review), and a voice match score (0-100).
```

Any "must fix" violations trigger an automatic rewrite of the affected sections before the draft enters the review queue.

---

## 6. Voice Differentiation Strategy (Beating AI Detection)

AI detection tools catch AI-generated content because of statistical regularities: consistent perplexity, even burstiness, predictable token patterns. Dark Madder's voice engine defeats this through multiple mechanisms:

### 6.1 Sentence-Level Burstiness Enforcement

The generator is explicitly instructed to vary sentence length according to the user's rhythm profile. If Zack's profile shows a pattern of long (25-35 word) explanatory sentences followed by short (3-8 word) punches, the generator must reproduce that specific rhythm, not a generic "vary your sentences" instruction.

**Implementation:** After generation, run a sentence-length analysis. If any stretch of 4+ consecutive sentences falls within 5 words of each other in length, flag for rewrite with explicit rhythm instructions.

### 6.2 Transition Authenticity

AI content's biggest tell is transitions. "Furthermore," "Additionally," "Moreover," "It's worth noting that" - these are statistical crutches that no skilled human writer uses. The voice engine maintains a library of the user's actual transition patterns extracted from their edits and sample writing.

**Implementation:** Post-generation scan for banned transition words. Replace with transitions that bridge the actual content (as described in the Talvi Blog Writing Lessons doc: the first sentence of a paragraph must visibly connect to the last sentence of the previous paragraph through a shared concept, not a structural marker).

### 6.3 Controlled Imperfection

Perfect grammar and flawless structure are AI tells. Real human writing has controlled imperfections: sentence fragments for emphasis, starting sentences with "And" or "But," parenthetical asides, rhetorical questions that don't get answered immediately. The voice profile captures which imperfections the user actually uses, and the generator reproduces them.

### 6.4 Specificity Over Generality

AI content defaults to generic language ("incredible ecosystems," "significant challenges," "remarkable progress"). The voice engine enforces specificity through the corrections ledger and generation-time instructions. "Replace generic superlatives with concrete sensory details" is a rule that gets baked into every generation prompt.

### 6.5 Recurring Imagery

The Talvi Blog Writing Lessons doc identifies this as critical: one recurring image or metaphor that runs through the whole piece creates cohesion and human-like intentionality. The generator is instructed to establish a central metaphor in the opening section and reference it at least twice more (once in the body, once in the closing).

---

## 7. Voice Metrics

### Voice Match Score

A 0-100 score calculated by the post-generation voice audit. Composed of:
- Banned phrase violations (binary deductions)
- Rhythm match (statistical comparison to profile)
- Transition quality (% of transitions using thought bridges vs. structural markers)
- Warmth integration (paragraph-level analysis of information + warmth co-occurrence)
- Vocabulary alignment (% of word choices within the profile's preferences)

Target: drafts should score 85+ before entering the review queue. Below 75 triggers automatic rewrite.

### Voice Drift Score

Tracked over time across all pieces generated for an org. If the voice match score trends downward, or if the number of edits per draft trends upward, the voice is drifting. Alert the user and suggest a recalibration session (repeat Phase 2 of onboarding with fresh samples).

---

*Dark Madder Specification - 02 Voice Engine - March 2026*
