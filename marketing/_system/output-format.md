# Output Format Reference

**System file for Kinetiks Marketing Skills**
Every skill MUST follow this formatting specification. This is the visual design
system that makes our output feel like a report from a senior marketing
professional -- not a chatbot reply.

---

## Design Principles

1. **Scannable in 5 seconds.** A busy founder should get the gist by skimming.
   Key information is always in a predictable location.

2. **Shows the work.** Every deliverable displays what was saved, where it lives,
   and what to do next. No orphaned output that leaves the user wondering
   "now what?"

3. **Consistent visual language.** All skills use the same character palette,
   section order, and spacing rules. A user who has seen one skill output can
   instantly read any other.

4. **Terminal-native.** We design for monospace terminals (Claude Code). No
   markdown rendering, no HTML, no color codes. Our visual system is built
   entirely from Unicode box-drawing characters and a small set of status
   indicators.

5. **Professional restraint.** No emoji. No exclamation marks. No "Great news!"
   filler. The output is the deliverable -- present it and move on.

6. **Files first, output second.** The real deliverable lives on the filesystem
   (`./brand/`, `./campaigns/`), organized and clearly tagged. The terminal
   output is the navigation layer: it shows what was saved, summarizes the key
   decisions, and routes the user forward. Do not dump entire deliverables
   into the output stream when they should be saved as files. Long content
   (full articles, complete email sequences, detailed briefs) belongs in files.
   The output references and summarizes them.

7. **Recommended option visible in 5 seconds.** When presenting multiple
   options (angles, headlines, concepts), the recommended pick must be
   visible without scrolling. Use a QUICK PICK summary block at the top,
   then expand into details below.

---

## Character Palette

These are the ONLY decorative characters used across all skills. Do not
introduce others without updating this file.

```
DIVIDERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  Heavy (major sections)
──────────────────────────────────────────────────── Light (sub-sections)

BOX DRAWING
┌──────────────────────────────────────────────────┐
│  Boxed content goes here                         │
│  Used for examples, highlights, comparisons      │
└──────────────────────────────────────────────────┘

TREE VIEW
├── Branch item
├── Branch item
└── Last item

NESTED TREE
├── Parent
│   ├── Child
│   └── Child
└── Parent

STATUS INDICATORS
✓   Complete / present / passed / saved
✗   Missing / failed / not found
◑   In progress / currently generating
○   Available but not connected (optional)
★   Recommended option

NUMBERED OPTIONS
①  ②  ③  ④  ⑤  ⑥  ⑦  ⑧  ⑨  ⑩

ACTION ARROWS
→   Points to a next step, command, or action
```

---

## Required Output Structure

Every skill output MUST include these four sections, in this exact order.
No exceptions. If a section is not applicable (rare), include it with a note
explaining why it was skipped.

### Section 1: Header

The header frames the deliverable. It tells the user exactly what they are
looking at and when it was made.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [DELIVERABLE NAME IN CAPS]
  [Brand Name] | Generated [Month Day, Year]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Rules:
- Deliverable name is ALL CAPS, describes the output type (not the skill name)
- Brand name identifies which Kinetiks brand this deliverable is for
- Date uses format: `Mar 25, 2026`
- Two-space indent before text content
- One blank line between the name and the date
- Heavy dividers (━) top and bottom, exactly 49 characters wide

Example:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  BRAND VOICE PROFILE
  Dark Madder | Generated Mar 25, 2026

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Section 2: Content

This is the actual deliverable. Its structure varies by skill. See the
template library below for common patterns.

Rules:
- All content uses 2-space indent from the left margin
- Sub-sections are separated by a single light divider (─)
- Use tree view for hierarchical data
- Use numbered options (①②③) for choices
- Use boxed content for examples and comparisons
- Keep line width at or below 55 characters for terminal readability

### Section 3: Files Saved

Always show the user exactly what was written to disk.

```
  FILES SAVED

  ./brand/dark-madder/voice-profile.md    ✓
  ./brand/dark-madder/positioning.md      ✓ (updated)
  ./brand/assets.md                       ✓ (3 entries added)
  ./campaigns/q1/brief.md                 ✓ (new)
```

Rules:
- Section label is `FILES SAVED` in caps, 2-space indent
- Each file on its own line with 2-space indent
- File paths use `./` relative prefix (relative to project root)
- Status indicator (✓) right-aligned or consistently spaced
- Parenthetical note when a file was updated vs created
- Brand-specific files use `./brand/{brand-name}/` paths
- Shared files use `./brand/` directly (assets.md, learnings.md, stack.md)
- If no files were saved (rare -- e.g., analysis-only output), display:
  ```
    FILES SAVED

    No files written (analysis-only output)
  ```

### Section 4: What's Next

Guide the user to the logical next step.

```
  WHAT'S NEXT

  Your [deliverable] is ready. Recommended next moves:

  → /skill-name       Brief description (~time)
  → /skill-name       Brief description (~time)
  → /skill-name       Brief description (~time)

  Or tell me what you're working on and I'll route you.
```

Rules:
- Always offer 2-4 concrete next steps
- Each next step references a real skill with `/skill-name`
- Include a time estimate in parentheses: `(~5 min)`, `(~15 min)`
- End with the routing fallback line
- If the output is the final step in a workflow, say so:
  ```
    WHAT'S NEXT

    This completes the [workflow name] workflow.
    All assets are saved and ready to deploy.

    → /start-here     Review your full project status
    → /ecosystem-campaigns   Plan a cross-brand campaign
  ```

### Quick Mode

When a user makes a specific, single-asset request (e.g., "write me a LinkedIn post about X", "give me 5 subject lines", "generate a product photo"), skip the ceremony and deliver the asset directly. Quick mode means:

- No project status scan
- No multi-step workflow proposal
- No gap analysis or missing-file warnings
- Just the requested output, formatted per this guide

**Trigger:** The request is a single, specific deliverable with clear parameters. The user knows what they want.

**Still include:** The `WHAT'S NEXT` block at the end (so they know what's available), but keep it to 2-3 lines max.

**When NOT to use quick mode:** The user says "help me with...", "where should I start", "set up my...", or anything exploratory. Those get the full experience.

---

### Visual Conversion Checkpoint

Skills that produce copy or content (landing pages, lead magnets, email
sequences, ad copy) MUST offer a visual build step before advancing to
the next skill in a chain. Do not silently jump to the next workflow step.

```
  WHAT'S NEXT

  Your landing page copy is saved. Before
  moving on:

  → /creative         Build this as a visual
                      landing page (~15 min)
  → "Skip to next"   Continue to /email-sequences

  Or tell me what you're working on and
  I'll route you.
```

Rules:
- The visual conversion option (/creative) is always the FIRST next step
- The "skip" option explicitly names the next skill in the chain
- The user chooses -- the system does not auto-advance
- This applies to: /direct-response-copy, /lead-magnet, /newsletter,
  /email-sequences, /content-atomizer

---

## Template Library

These templates cover the most common output patterns. Skill authors should
use these as starting points, not deviate into custom layouts.

### Template: Ecosystem Status Scan

Used by the orchestrator and `/start-here` to show the current state across
all Kinetiks brands.

```
  ECOSYSTEM STATUS

  Kinetiks ID
  ├── Voice Profile       ✓ loaded (authoritative, technical)
  ├── Positioning         ✓ loaded (intelligent core)
  ├── Audience            ✓ loaded (marketing teams at scale-ups)
  └── Product             ✓ loaded (8-layer Context Structure)

  Dark Madder
  ├── Voice Profile       ✓ loaded (edgy, dark aesthetic)
  ├── Positioning         ✗ not found
  ├── Audience            ✗ not found
  └── Product             ✓ loaded (content engine)

  Harvest
  ├── Voice Profile       ✗ not found
  ├── Positioning         ✗ not found
  ├── Audience            ✗ not found
  └── Product             ✗ not found

  ──────────────────────────────────────────────

  Shared
  ├── Ecosystem Map       ✓ loaded
  ├── Tech Stack          ✓ loaded (Next.js, Supabase, Claude)
  ├── Assets Registry     ✓ 12 assets tracked
  └── Learnings           ✓ 5 entries
```

Rules:
- Group by brand, then shared resources
- Brand names on their own line, no indicator
- Status indicators aligned in a column
- Brief context after the indicator
- ✗ for missing items that are recommended
- ○ for missing items that are optional

### Template: Brand Selector

Used at the start of every skill when multiple brands have profiles.

```
  BRAND SELECTOR

  Which brand are you working on?

  ① Kinetiks ID        Core intelligence hub
  ② Dark Madder        Content engine
  ③ Harvest            Outbound engine
  ④ Hypothesis         Landing page engine
  ⑤ Litmus             PR engine
  ⑥ Fortune Farms      B2B cold outreach

  Or say "ecosystem" for cross-brand work.
```

### Template: Numbered Options with Recommendation

Used when presenting strategic choices (positioning angles,
headline variants, campaign concepts).

```
  ① THE PLATFORM PLAY                    ★ recommended
  "Stop stitching together 5 tools. One
  identity powers your entire marketing
  stack -- content, outbound, landing
  pages, and PR."
  → Best for: cold traffic, comparison pages

  ──────────────────────────────────────────────

  ② THE INTELLIGENCE ANGLE
  "Your marketing data already knows what
  works. Kinetiks reads it so you don't
  have to."
  → Best for: product-aware audience, retargeting

  ──────────────────────────────────────────────

  ③ THE DATA COMPOUND
  "Every campaign makes the next one smarter.
  Most tools reset to zero every quarter."
  → Best for: long-form content, newsletters
```

Rules:
- Use circled numbers ①②③, not 1. 2. 3.
- Recommended option gets ★ on the same line as the title
- Option titles in ALL CAPS
- Description in quotes (it is the actual copy being proposed)
- `→ Best for:` line tells the user where this option works
- Light divider between options

### Template: Quick Pick Summary

When a skill presents multiple options, the recommended pick MUST appear
at the top before detailed options.

```
  QUICK PICK
  ──────────────────────────────────────────────

  ★ Recommended: ① THE PLATFORM PLAY
  "Stop stitching together 5 tools. One
  identity powers your entire marketing stack."
  → Best for: cold traffic, comparison pages

  ──────────────────────────────────────────────

  All options detailed below ↓
```

### Template: Campaign Completion Summary

Used when a multi-asset campaign is finished.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  CAMPAIGN COMPLETE: Product Launch Q1
  Dark Madder | "Stop Guessing. Start Shipping."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ASSETS CREATED

  Email Sequence (5 emails)
  └── ./campaigns/q1-launch/emails/
      ├── 01-announcement.md       Day 0
      ├── 02-problem.md            Day 2
      ├── 03-proof.md              Day 4
      ├── 04-objections.md         Day 6
      └── 05-close.md              Day 7

  Landing Page
  └── ./campaigns/q1-launch/landing-page.md
      Hero, features, testimonials, CTA

  Social Assets
  └── ./campaigns/q1-launch/social/
      ├── twitter-thread.md        12-post thread
      ├── linkedin-post.md         Long-form post
      └── ig-carousel.md           10 slides

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  REGISTRY UPDATED              ✓
  LEARNINGS JOURNAL UPDATED     ✓

  Brand:    Dark Madder
  Angle:    The Platform Play
  Voice:    Edgy, technical, proof-heavy
  Audience: Content marketers at scale-ups

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Template: Cross-Brand Campaign

Used by /ecosystem-campaigns for multi-brand work.

```
  ECOSYSTEM CAMPAIGN PLAN

  ┌──────────────────────────────────────────────┐
  │                                              │
  │  Dark Madder (Awareness)                     │
  │  → SEO content + blog posts                  │
  │  → Content atomizer → social distribution    │
  │                                              │
  │        ↓ CTA: "Test your landing page"       │
  │                                              │
  │  Hypothesis (Conversion)                     │
  │  → Landing page with A/B test                │
  │  → Lead capture form                         │
  │                                              │
  │        ↓ Lead enters pipeline                 │
  │                                              │
  │  Harvest (Capture)                           │
  │  → Automated email sequence                  │
  │  → Sales team handoff at engagement score    │
  │                                              │
  │        ↓ Success story generated              │
  │                                              │
  │  Litmus (Amplification)                      │
  │  → Press release + media outreach            │
  │  → Case study distribution                   │
  │                                              │
  └──────────────────────────────────────────────┘
```

### Template: On-Brand / Off-Brand Comparison

```
  ┌──────────────────────────────────────────────┐
  │                                              │
  │  ✓ On-brand                                  │
  │  "Your marketing data already knows what     │
  │  works. Kinetiks reads it so you don't       │
  │  have to."                                   │
  │                                              │
  │  ✗ Off-brand                                 │
  │  "Leverage our AI-powered platform to        │
  │  unlock marketing synergies at scale."       │
  │                                              │
  └──────────────────────────────────────────────┘
```

### Template: Progress Display

**During execution:**
```
  Building Dark Madder brand foundation...

  ◑ Extracting brand voice        analyzing website...
  ◑ Finding positioning angles    mapping competitive landscape...
  ◑ Researching audience          mining communities...
```

**After completion:**
```
  ✓ Brand voice extracted          ./brand/dark-madder/voice-profile.md
  ✓ 3 positioning angles found     ./brand/dark-madder/positioning.md
  ✓ Audience profile built          ./brand/dark-madder/audience.md
```

### Template: Error / Warning Display

```
  ┌──────────────────────────────────────────────┐
  │                                              │
  │  ✗ BRAND VOICE NOT FOUND                     │
  │                                              │
  │  This skill needs the Dark Madder voice      │
  │  profile to generate on-brand copy.          │
  │                                              │
  │  → /brand-voice    Build it now (~10 min)    │
  │  → Continue        Generate with defaults    │
  │                                              │
  └──────────────────────────────────────────────┘
```

---

## Formatting Rules

These rules apply to ALL output across ALL skills. No exceptions.

### Spacing and Indentation
1. Use 2-space indent for all content inside sections
2. Use 4-space indent for nested content within a 2-space block
3. Leave exactly one blank line between sections
4. Leave exactly one blank line before and after dividers
5. No trailing whitespace on any line

### Line Width
6. Maximum line width is 55 characters for body text
7. Dividers are exactly 49 characters wide (heavy) or context-appropriate (light)
8. Boxed content adjusts width to its content but caps at 50 characters inner width
9. File paths and URLs may exceed the line width limit if necessary

### Dividers
10. Heavy dividers (━) for major section boundaries (header top/bottom, footer)
11. Light dividers (─) for sub-section breaks within content
12. Never stack dividers (no heavy followed immediately by light)
13. Never use dividers inside boxed content

### Status Indicators
14. Status indicators (✓ ✗ ◑ ○ ★) are always followed by exactly 2 spaces
15. In columnar layouts, align the text after status indicators
16. Never combine indicators (no ✓★ or ✗○)

### File Paths
17. Always use `./` relative prefix (relative to project root)
18. Never put file paths in backticks or code blocks in output
19. Show actual paths, not placeholders
20. When a file is updated (not created), note it: `✓ (updated)`
21. Brand-specific paths: `./brand/{brand-name}/filename.md`
22. Shared paths: `./brand/assets.md`, `./brand/learnings.md`

### Text Style
23. Section labels in ALL CAPS: `FILES SAVED`, `WHAT'S NEXT`
24. Deliverable names in ALL CAPS in headers
25. Option titles in ALL CAPS in numbered lists
26. Everything else in sentence case
27. No markdown formatting (no **, no `, no #) inside formatted output
28. Use verb-first language for actions: "Iterate", "Adapt", "Build"
29. Time estimates in parentheses: `(~5 min)`, `(~15 min)`, `(~30 min)`

### Actions and Next Steps
30. Actions use the → arrow prefix
31. Skill references use `/skill-name` format
32. User-sayable actions are in quotes: `→ "Iterate"`
33. Always include 2-4 next steps in the WHAT'S NEXT section

---

## Anti-Patterns

These are explicit things to NEVER do. If you catch yourself doing any of
these, stop and reformat.

### DO NOT use markdown inside formatted output
```
WRONG:
  ## Brand Voice Profile
  **Tone:** Direct and confident
  - Uses specific numbers
  - Avoids jargon

RIGHT:
  BRAND VOICE PROFILE

  Tone: Direct and confident
  ├── Uses specific numbers
  └── Avoids jargon
```

### DO NOT use bullet points for structured data
```
WRONG:
  - Voice Profile: loaded
  - Positioning: loaded
  - Audience: not found

RIGHT:
  ├── Voice Profile     ✓ loaded
  ├── Positioning       ✓ loaded
  └── Audience          ✗ not found
```

### DO NOT use chatbot preamble
```
WRONG:
  Here is your brand voice profile! I've analyzed
  your website and social media to create this.

RIGHT:
  (Just start with the header. The output IS the
  deliverable. No preamble needed.)
```

### DO NOT use emoji
```
WRONG:
  Campaign complete!
  5 emails generated
  Ready to launch

RIGHT:
  CAMPAIGN COMPLETE
  ✓ 5 emails generated
  Ready to launch
```

### DO NOT omit the FILES SAVED section
Every skill that writes files MUST show what it wrote.

### DO NOT omit the WHAT'S NEXT section
Every skill MUST guide the user forward.

---

## Skill Author Checklist

Before shipping a skill, verify:

- [ ] Output starts with a heavy-divider header block
- [ ] Deliverable name is ALL CAPS in the header
- [ ] Brand name is included in the header line
- [ ] Date is formatted as `Mon DD, YYYY`
- [ ] Content uses 2-space indent throughout
- [ ] Hierarchical data uses tree view, not bullets
- [ ] Choices use circled numbers, not plain numbers
- [ ] Light dividers separate sub-sections
- [ ] FILES SAVED section lists every file written
- [ ] File paths use `./brand/{brand-name}/` for brand-specific files
- [ ] WHAT'S NEXT section offers 2-4 concrete actions
- [ ] Actions reference real skill names with `/skill-name`
- [ ] Time estimates are included in parentheses
- [ ] No markdown formatting inside the output
- [ ] No emoji anywhere in the output
- [ ] No chatbot preamble ("Here is your...", "I've created...")
- [ ] Line width stays at or below 55 characters
- [ ] Status indicators are consistent (✓ ✗ ◑ ○ ★)
