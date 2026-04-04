# Brand Memory Protocol

> How Kinetiks Marketing Skills store, retrieve, and operate on brand knowledge.

## Overview

Brand memory lives in `./brand/` relative to the skills root. Each brand gets its own subdirectory containing profile files that capture voice, positioning, audience, and product knowledge. Shared files at the `./brand/` level track cross-brand concerns.

Skills are brand-aware: they detect which brand the user is working on, load only the context they need, and write back what they learn.

## Directory Structure

```
brand/
├── _ecosystem.md              # Cross-brand relationship map (shared)
├── stack.md                   # Marketing tech stack (shared)
├── assets.md                  # Asset registry across all brands (shared)
├── learnings.md               # Learnings journal across all brands (shared)
│
├── kinetiks-id/
│   ├── voice-profile.md       # Brand voice, tone, personality
│   ├── positioning.md         # Angles, differentiators, competitive context
│   ├── audience.md            # Segments, pain points, desires
│   └── product.md             # Features, benefits, pricing, use cases
│
├── dark-madder/
│   ├── voice-profile.md
│   ├── positioning.md
│   ├── audience.md
│   └── product.md
│
├── harvest/
│   ├── voice-profile.md
│   ├── positioning.md
│   ├── audience.md
│   └── product.md
│
├── hypothesis/
│   ├── voice-profile.md
│   ├── positioning.md
│   ├── audience.md
│   └── product.md
│
├── litmus/
│   ├── voice-profile.md
│   ├── positioning.md
│   ├── audience.md
│   └── product.md
│
└── fortune-farms/
    ├── voice-profile.md
    ├── positioning.md
    ├── audience.md
    └── product.md
```

### Per-Brand Files

| File | Purpose | Written By | Format |
|------|---------|-----------|--------|
| `voice-profile.md` | Tone, vocabulary, personality, do/don't rules | `/brand-voice` | Create-or-overwrite |
| `positioning.md` | Angles, differentiators, enemy, category | `/positioning-angles` | Create-or-overwrite |
| `audience.md` | Segments, pain points, desires, objections | `/start-here` | Create-or-overwrite |
| `product.md` | Features, benefits, pricing, use cases | `/product-marketing` | Create-or-overwrite |

### Shared Files

| File | Purpose | Written By | Format |
|------|---------|-----------|--------|
| `_ecosystem.md` | Cross-brand relationships and handoff points | `/start-here` | Create-or-overwrite |
| `stack.md` | Marketing tech stack and connected tools | `/start-here` | Create-or-overwrite |
| `assets.md` | Registry of all produced assets | Any execution skill | Append-only |
| `learnings.md` | What works, what doesn't, audience insights | Any skill with feedback | Append-only |

---

## Brand Selector Protocol

Every skill must determine which brand it is operating on before loading context. Follow this sequence:

### Step 1: Check Request Context
Look at the user's message for explicit brand references:
- Brand name mentioned directly ("for Kinetiks ID", "Dark Madder needs")
- Brand slug used ("kinetiks-id", "dark-madder")
- Product references that map to a specific brand

### Step 2: Check Project Path
If working within a monorepo, the current directory may indicate the brand:
- `apps/kid/` → kinetiks-id
- `apps/dark-madder/` → dark-madder
- `apps/harvest/` → harvest
- `apps/hypothesis/` → hypothesis
- `apps/litmus/` → litmus
- `apps/fortune-farms/` → fortune-farms

### Step 3: Ask the User
If the brand cannot be determined from context or path:
```
Which brand are you working on?
→ Kinetiks ID | Dark Madder | Harvest | Hypothesis | Litmus | Fortune Farms
```

### Step 4: Auto-Select
If only one brand directory exists in `./brand/`, use it without asking.

### Resolution Rules
- Never guess. If ambiguous, ask.
- Store the resolved brand slug for the session.
- Multi-brand skills (`/start-here`, `/ecosystem-campaigns`) may operate across all brands.

---

## How Skills READ

### Loading Sequence

1. **Check directory exists**: Verify `./brand/{brand-slug}/` is present. If not, inform the user that `/start-here` should be run first for this brand.

2. **Load only needed files**: Consult the Context Matrix below. Each skill specifies exactly which files it needs. Do not load files that are not required.

3. **Handle missing files gracefully**: If a required file does not exist, note the gap and proceed with reduced context. Do not fail. Suggest which skill can create the missing file.

4. **Context loading display**: When loading brand context, show:
```
📂 Loading brand context: dark-madder
  ✓ voice-profile.md
  ✓ positioning.md
  ✗ audience.md (not found — run /start-here to create)
  ✓ product.md
```

### Reading Rules
- Read files in full. Do not truncate or summarize during loading.
- Cache context for the duration of the skill execution.
- If a file was recently written in the same session, use the freshest version.

---

## How Skills WRITE

### Profile Files (Create-or-Overwrite)
Files: `voice-profile.md`, `positioning.md`, `audience.md`, `product.md`

- These represent the current state of brand knowledge.
- When writing, replace the entire file with the new version.
- Before overwriting an existing file, confirm with the user:
```
This will replace the existing voice profile for Dark Madder.
The current version was created on [date]. Proceed? (y/n)
```
- Include a YAML frontmatter block with metadata:
```yaml
---
brand: dark-madder
created: 2026-03-25
updated-by: /brand-voice
version: 2
---
```

### Append-Only Files
Files: `assets.md`, `learnings.md`

- Never truncate or rewrite these files.
- Always append new entries at the bottom of the appropriate section.
- Include timestamps and brand tags with every entry.
- If the file does not exist, create it with the standard template then append.

---

## Context Matrix

Which files each skill reads at runtime:

| Skill | voice-profile | positioning | audience | product | _ecosystem | stack | assets | learnings |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `/start-here` | W | — | W | — | W | W | — | R |
| `/brand-voice` | W | R | R | — | — | — | — | R |
| `/positioning-angles` | R | W | R | R | — | — | — | R |
| `/keyword-research` | R | R | R | R | — | — | — | R |
| `/lead-magnet` | R | R | R | R | — | — | R/W | R/W |
| `/product-marketing` | R | R | R | W | — | — | R/W | R/W |
| `/ecosystem-campaigns` | R | R | R | R | R | — | R/W | R/W |
| `/direct-response-copy` | R | R | R | R | — | — | R/W | R/W |
| `/seo-content` | R | R | R | R | — | — | R/W | R/W |
| `/email-sequences` | R | R | R | R | — | — | R/W | R/W |
| `/newsletter` | R | R | R | R | — | — | R/W | R/W |
| `/content-atomizer` | R | R | R | — | — | — | R/W | R/W |
| `/creative` | R | R | R | R | — | R | R/W | R/W |

**Legend**: R = Read, W = Write (create-or-overwrite), R/W = Read and Append

---

## Ecosystem Loading Rules

The `_ecosystem.md` file contains cross-brand relationships and handoff points.

### Always Load
- `/start-here` — needs ecosystem context to orient the user and set up brands.
- `/ecosystem-campaigns` — explicitly designs cross-brand campaigns.

### Never Load
All single-brand execution skills (`/direct-response-copy`, `/seo-content`, `/email-sequences`, `/newsletter`, `/content-atomizer`, `/creative`, `/keyword-research`, `/lead-magnet`, `/product-marketing`).

These skills operate in single-brand isolation. They do not need to know about sibling brands.

### Conditional Load
- `/brand-voice` — Only if the user explicitly asks to differentiate from sibling brands.
- `/positioning-angles` — Only if the user wants competitive positioning against siblings.

---

## Cross-Brand Rules

### Default: Single-Brand Isolation
Most skills operate on one brand at a time. They load context for that brand only and produce deliverables for that brand only. They do not reference sibling brands unless explicitly asked.

### Exceptions
1. **`/start-here`** — Operates at the ecosystem level. Can onboard multiple brands. Writes `_ecosystem.md`.
2. **`/ecosystem-campaigns`** — Designs campaigns that span multiple brands. Loads all relevant brand profiles and `_ecosystem.md`.

### Cross-Reference Rules
When a skill does reference another brand (in exceptions or by user request):
- Use the sibling brand's actual voice and positioning, not a generic summary.
- Load the sibling's `voice-profile.md` and `positioning.md` before referencing.
- Make handoff points explicit: "This is where Dark Madder hands off to Harvest."

---

## Voice Injection Protocol

When a skill loads `voice-profile.md`, it must **demonstrate** the voice in its output, not just acknowledge it.

### Rules
1. **Absorb, then perform.** Read the voice profile. Then write as if you are the brand's in-house copywriter. Do not say "Based on the voice profile, I will use a bold tone." Just use the bold tone.

2. **No blending.** When working on Dark Madder, write like Dark Madder. When switching to Harvest, switch completely. Never let one brand's voice leak into another's output.

3. **Voice applies to deliverables, not conversation.** Skill instructions, status messages, and confirmations remain in the standard assistant voice. Only the produced content (copy, emails, headlines, briefs) adopts the brand voice.

4. **Handle missing voice profiles.** If `voice-profile.md` does not exist, produce deliverables in a neutral professional tone and recommend running `/brand-voice` first.

5. **Voice hierarchy.** If the user gives explicit tone instructions that conflict with the voice profile, the user's instructions win for that session. Note the deviation but do not overwrite the profile.

---

## Campaign Directory Structure

When execution skills produce campaign-level deliverables, they are organized under:

```
campaigns/
└── {brand-slug}/
    └── {campaign-name}/
        ├── brief.md           # Campaign brief and strategy
        ├── copy/              # Direct response copy, ads, landing pages
        ├── email/             # Email sequences
        ├── content/           # SEO content, blog posts, articles
        ├── social/            # Social media content
        ├── creative/          # Visual briefs, image prompts
        └── assets/            # Generated assets and files
```

### Naming Conventions
- Brand slug: lowercase, hyphenated (e.g., `dark-madder`)
- Campaign name: lowercase, hyphenated, descriptive (e.g., `q2-launch-2026`)
- File names: lowercase, hyphenated, with type prefix when useful (e.g., `email-welcome-sequence.md`)

---

## Assets Registry Format

The `assets.md` file tracks all produced deliverables. Every execution skill appends here after producing output.

### Entry Format
```markdown
| {brand} | {asset-name} | {type} | {YYYY-MM-DD} | {campaign} | Active | {notes} |
```

### Asset Types
`landing-page`, `email-sequence`, `blog-post`, `social-post`, `ad-copy`, `lead-magnet`, `newsletter`, `creative-brief`, `video-script`, `case-study`, `whitepaper`

### Rules
- Always include the Brand column. This is a shared file across all brands.
- Link to the file path in Notes when the asset exists as a file.
- When retiring an asset, move the row from Active to Retired with a reason.

---

## Learnings Journal Format

The `learnings.md` file captures institutional knowledge. Skills append here after receiving feedback on deliverables.

### Entry Format
```markdown
- [{brand-slug}] {YYYY-MM-DD} — {insight}. Source: {skill or user feedback}.
```

### Sections
- **What Works** — Tactics, angles, formats that performed well.
- **What Doesn't Work** — Approaches that failed or underperformed.
- **Audience Insights** — Discoveries about audience behavior, preferences, objections.
- **Ecosystem Insights** — Cross-brand learnings, handoff observations, funnel discoveries.

### Rules
- Always tag entries with `[brand-slug]`.
- Newest entries go at the bottom of each section.
- Never delete entries. This is an append-only log.
- Use ecosystem insights sparingly — only for genuine cross-brand learnings.

---

## Feedback Collection Protocol

After producing any deliverable, execution skills should collect feedback:

### Step 1: Deliver the Output
Present the completed deliverable to the user.

### Step 2: Ask for Feedback
```
How does this land?
→ Ship it | Revise | Scrap

Anything to note for next time?
```

### Step 3: Process Response
- **Ship it**: Append to `assets.md`. If the user shares a learning, append to `learnings.md`.
- **Revise**: Iterate on the deliverable. Do not log until the user is satisfied.
- **Scrap**: Ask what went wrong. Append the insight to `learnings.md` under "What Doesn't Work."

### Step 4: Continuous Improvement
Over time, skills should reference `learnings.md` before producing deliverables to avoid repeating mistakes and lean into what works.

---

## Principles

1. **Brand memory is the foundation.** Every skill reads from it. Execution quality scales with memory quality.

2. **Load only what you need.** The Context Matrix is authoritative. Do not load files that are not required for the current skill.

3. **Write small, write often.** Profile files are complete replacements. Append-only files grow incrementally. Both are valuable.

4. **Demonstrate, don't describe.** When a voice profile is loaded, the output should embody it. Never narrate what you are doing with the voice.

5. **Single-brand by default.** Unless explicitly multi-brand (ecosystem skills), operate in isolation. This prevents voice and positioning contamination.

6. **Graceful degradation.** Missing files are not errors. They are opportunities to suggest the right setup skill.

7. **User intent wins.** If the user's instructions conflict with stored memory, follow the user for that session. Note the deviation.

8. **Feedback is fuel.** Every deliverable is a chance to learn. Capture what works and what does not.

9. **Shared files need brand tags.** Assets and learnings are shared. Every entry must be attributable to a specific brand.

10. **Memory is trust.** Users trust that their brand context is preserved accurately and applied faithfully. Do not paraphrase or reinterpret stored profiles.
