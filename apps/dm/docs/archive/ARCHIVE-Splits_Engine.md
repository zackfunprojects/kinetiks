> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/splits.md
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# 08 - Splits Engine

## Platform-Specific Content Decomposition & Queue

**System:** Dark Madder
**Depends on:** 01-DATA-MODEL, 02-VOICE-ENGINE, 04-CONTENT-GENERATOR
**Depended on by:** Nothing (terminal output system)

---

## 1. Purpose

Splits are smaller pieces of content derived from a published long-form piece, adapted for specific social platforms. A single 3,000-word blog post can yield a LinkedIn post, a TikTok script, a Reddit answer, and an Instagram carousel. Dark Madder generates these on demand (not automatically), and the user posts them manually. No API integration with social platforms in v1.

This implements the Repurposing Flywheel from the Talvi Content Guidelines: deep research once, adapt to every format.

---

## 2. Supported Platforms and Formats

### 2.1 LinkedIn

**Format:** Professional post (text-only or text + image prompt)
**Length:** 800-1,500 characters (sweet spot for LinkedIn algorithm engagement)
**Structure:**
- Hook (first line, visible before "see more" - must be compelling)
- 3-5 paragraphs of insight derived from the source piece
- A clear perspective or takeaway (LinkedIn rewards opinion, not summary)
- Soft CTA or discussion prompt at the end
- 3-5 relevant hashtags

**Voice adaptation:** Slightly more personal than the blog voice. First person. Professional but not corporate. The user's personal voice layer dominates over the org voice layer, since LinkedIn is personal-brand territory.

**Best practices baked into generation:**
- No links in the body text (LinkedIn suppresses posts with external links). Link goes in comments.
- Line breaks between paragraphs (LinkedIn renders whitespace as formatting)
- First line is the hook - no greeting, no "I was thinking about..."
- Strong opinion or counterintuitive insight in the first 2 lines
- End with a question to drive comments

### 2.2 TikTok

**Format:** Video script (voiceover + screen text notes)
**Length:** 30-90 seconds of spoken content (approximately 75-200 words)
**Structure:**
- Hook (first 2 seconds - text on screen + opening line)
- Problem or misconception (3-5 seconds)
- The insight/answer (15-60 seconds)
- Payoff or CTA (5-10 seconds)

**Voice adaptation:** Most casual. Conversational, almost spoken-word rhythm. Short sentences. Direct address ("You know that thing where..."). The user voice dominates completely. Org voice constraints still apply (no banned phrases) but tone shifts to pure conversational.

**Best practices baked into generation:**
- Script includes both spoken words AND suggested text overlays
- Hook must create curiosity or pattern interrupt in first 2 seconds
- Each point should be visual-friendly (can be illustrated with simple graphics or screen recording)
- No jargon. Explain everything as if the viewer has zero context.
- Suggest trending sounds or formats when applicable

### 2.3 Reddit

**Format:** Answer/comment for relevant subreddit threads
**Length:** 200-500 words (substantial enough to be helpful, not a wall of text)
**Structure:**
- Direct answer to the implied question (first paragraph)
- Supporting detail with specific data or experience (2-3 paragraphs)
- Sourced claims with links
- Optional soft reference to org content ("We put together a deeper guide on this: [link]")

**Voice adaptation:** Most authentic. Reddit detects marketing instantly. The voice should be a knowledgeable person sharing expertise, not a brand promoting content. User voice layer only (no org branding). Conversational, specific, helpful.

**Best practices baked into generation (from the Talvi Answer Platform Strategy doc):**
- Answer must be complete and useful without clicking any links
- If a link to org content is included, it's one of several resources mentioned (never the only link)
- Disclosure language ready if relevant ("Full disclosure, I work in this space")
- Formatted with Reddit markdown: paragraph breaks, bold for key terms, bullet lists for complex information
- Tone matches the specific subreddit's culture (r/science is different from r/personalfinance)
- The split identifies which subreddits this content would fit in and adapts accordingly

### 2.4 Instagram

**Format:** Carousel slides (text content for 5-10 slides) or caption for image/reel
**Length:** 
- Carousel: 5-10 slides, 20-40 words per slide
- Caption: 300-800 characters

**Structure (Carousel):**
- Slide 1: Hook headline (bold, attention-grabbing, no more than 8 words)
- Slides 2-8: One insight per slide, progressing through the source piece's key points
- Slide 9: Summary or key takeaway
- Slide 10: CTA ("Save this for later" / "Follow for more" / "Link in bio")

**Structure (Caption):**
- Hook line
- 2-3 paragraphs of context
- Relevant hashtags (15-25)

**Voice adaptation:** Visual-first thinking. Every slide must work as a standalone visual statement. Warm, accessible, slightly more "inspirational" than blog voice. Org voice layer active (especially banned phrases and emotional boundaries).

**Best practices baked into generation:**
- Carousel slides use short, punchy statements - not excerpts from the blog
- Each slide should make the reader want to see the next slide
- Visual design notes included (suggested colors, layout, emphasis)
- Hashtag research: mix of broad (500k+ posts) and niche (10k-100k posts) tags
- Instagram's algorithm rewards saves and shares - design content to be save-worthy

---

## 3. Split Generation Flow

### 3.1 Trigger

Splits are generated on demand. The user navigates to a published (or approved) content piece and clicks "Generate Splits."

### 3.2 Platform Selection

The user selects which platforms to generate for. They can select all four or any subset.

### 3.3 Generation Process

For each selected platform:

1. **Extract key insights:** An LLM pass identifies the 5-8 most compelling, standalone insights from the source piece. These are ranked by: (a) uniqueness (not obvious), (b) specificity (has a concrete data point or example), (c) engagement potential (would provoke reaction or sharing).

2. **Platform-specific adaptation:** A separate LLM call generates the split for each platform, using:
   - The extracted insights (not the full source piece - this forces adaptation rather than summarization)
   - The platform-specific template and best practices
   - The appropriate voice layer stack (user-only for Reddit, user+org for LinkedIn and Instagram, user-only for TikTok)
   - Any relevant corrections ledger rules

3. **Alternative hooks:** For LinkedIn and TikTok, generate 2-3 alternative opening hooks. The user picks the one that fits best. Strong hooks are the highest-leverage element of social content.

### 3.4 The Generation Prompt (LinkedIn Example)

```
You are writing a LinkedIn post derived from a longer blog piece. You are NOT summarizing the blog. You are extracting one powerful insight and presenting it as a standalone LinkedIn post.

Source piece title: "{title}"
Key insights extracted: {insights}
Voice profile (user layer): {user_voice}
Voice profile (org layer): {org_voice}
Corrections ledger rules (social): {filtered_rules}

Write a LinkedIn post that:
1. Opens with a hook that creates curiosity or states a counterintuitive claim (first line must compel the reader to click "see more")
2. Develops ONE insight with specificity - include a data point, example, or concrete claim
3. Offers a clear perspective (not a summary - what do you THINK about this?)
4. Ends with a discussion prompt that invites genuine comment (not "What do you think?" which is generic)
5. Is 800-1,500 characters total
6. Uses line breaks between paragraphs
7. Includes NO external links in the body (link goes in first comment)
8. Includes 3-5 hashtags at the end

Also provide 2 alternative opening hooks.

CRITICAL: This should read as a person sharing a genuine insight, not a brand distributing content. Write in first person. Use the author's natural voice.
```

---

## 4. Split Queue and Approval

### 4.1 Queue View

Generated splits appear in a queue view per org, organized by:
- Source piece
- Platform
- Status (draft / approved / posted)

The user reviews each split, edits as needed (edits are captured by the Learning Loop), and marks as approved.

### 4.2 Posting Notes

Since v1 doesn't integrate with social platform APIs, each approved split includes:
- The content to post (copy-ready)
- The platform it's designed for
- Suggested posting time (based on general best practices for each platform)
- Any companion notes (e.g., "Post the link in the first comment" for LinkedIn)
- For Reddit: suggested subreddits and any context about thread selection

The user copies the content and posts manually.

### 4.3 Post-Post Tracking

After posting, the user can mark a split as "posted" and optionally add engagement notes (likes, comments, shares, any notable responses). v1 does not pull social analytics automatically, but this manual tracking feeds into understanding which platforms and angles perform best.

---

## 5. Split Cadence Recommendations

The system recommends a split publishing cadence based on the org's content calendar:

- **LinkedIn:** 1-2 posts per published blog/guide (the day of publication + 3-5 days later with a different angle)
- **TikTok:** 1 script per published piece (batch record on creative days)
- **Reddit:** Only when a relevant thread is identified (not scheduled, opportunistic). The system can monitor target subreddits for relevant threads and alert the user.
- **Instagram:** 1 carousel per published piece (can lag publication by a week)

These are suggestions, not automated schedules. The user decides when and what to post.

---

## 6. Split Quality Standards

Every generated split must pass these checks before entering the queue:

- **No brand-first language:** The org/product is not mentioned in the first half of any social split
- **Standalone value:** The split is useful even if the reader never clicks through to the source piece
- **Platform-native:** The content feels like it was written for that platform, not repurposed from a blog
- **Voice match:** The appropriate voice layers are applied (user-dominant for personal platforms, org-active for brand platforms)
- **No banned phrases:** All org voice constraints apply across platforms

---

*Dark Madder Specification - 08 Splits Engine - March 2026*
