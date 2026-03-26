# HARVEST DESIGN & UX SPECIFICATION

## Visual Identity, Component System, and Page-by-Page Design Guide

**Version 1.0 | March 2026 | Author: Zack Holland**

**For Claude Code.** This document governs every visual and interaction decision in hv.kinetiks.ai. Read alongside: Harvest Product Spec v3.0, Harvest Build Companion v3.0, Kinetiks ID Product Spec.

---

# 1. DESIGN PHILOSOPHY

Harvest is an outbound engine that replaces 8 categories of sales tools with seven AI Operators. The design must communicate power without complexity, intelligence without coldness, and trust without hand-holding.

Three governing principles:

**Elegant machinery.** Harvest is a system that works for you. The interface should feel like a beautifully engineered instrument - precise, purposeful, every element earning its place. Think of a Swiss watch movement visible through a glass back. Nothing decorative. Everything functional. Everything beautiful because it is functional.

**Earned trust, visible.** The driving modes (Human Drive, Approvals, Autopilot) are the product's soul. The UI must make the trust relationship between user and AI tangible - confidence scores, unlock progress, approval flows. The user should always feel in control, even as they hand over more autonomy. This is the emotional core of the product.

**Quiet harvest metaphor.** Farming references should be atmospheric, not literal. No cartoon tractors. No hay bales. Think: the patience of seasons, the geometry of planted rows, the satisfaction of a yield. Growth rings. Seed-to-harvest progress. Cultivated fields as data visualizations. The metaphor lives in language, in progress patterns, in the feeling of tending something that compounds over time.

## 1.1 Design References

**Primary inspirations:**

- **Linear** - The gold standard for dense information interfaces. Warm grays (not blue-grays), LCH-based color system, custom theme generation from three base variables, translucent surfaces, reduced sidebar weight. Linear proves you can put enormous amounts of data on screen and have it feel calm. Harvest follows this pattern: information-dense but visually quiet.
- **Clay (clay.com)** - The B2B data enrichment platform, not Clay.earth. Spreadsheet-like density with modern polish. Waterfall enrichment visualized cleanly. The "table as primary interface" pattern that makes data work feel powerful. Harvest's prospect and contact views draw from this energy.
- **Raycast** - Shining accent colors against dark backgrounds. Linear light effects. Keyboard-first with beautiful visual feedback. The feeling of speed and precision.
- **Notion** - Clean typography hierarchy. Content-first layouts. The sidebar as workspace navigator rather than feature menu.

**What Harvest is NOT:**

- Not a generic SaaS dashboard with card grids and vanity metrics
- Not a dark-mode-for-dark-mode's-sake interface (both modes must be first-class)
- Not a "CRM with AI bolted on" aesthetic - the AI is native, not a feature badge
- Not visually busy - density yes, clutter no

## 1.2 Relationship to Dark Madder

Harvest is Dark Madder's sister app within Kinetiks AI. They share DNA but have distinct personalities.

| Trait | Dark Madder | Harvest |
|-------|------------|---------|
| Personality | The mad scientist - creative, experimental, generative | The cultivator - patient, strategic, systematic |
| Energy | Creative intensity, content generation, research depth | Operational precision, pipeline progression, earned trust |
| Accent color | Madder red (#8B1A1A) | Harvest green (see color system below) |
| Typography feel | Monospace-forward, research aesthetic | Clean sans-serif, data-forward |
| Metaphor | Laboratory, experiments, formulas | Fields, seasons, growth, cultivation |
| Shared elements | Kinetiks floating pill, auth system, sidebar structure, dark surface palette, overall quality bar |

Both apps feel like they belong to the same ecosystem. A user moving between them should feel coherence, not dissonance. The shared foundation is the Kinetiks design language: warm dark surfaces, generous spacing, typography hierarchy, the floating pill.

---

# 2. COLOR SYSTEM

Harvest uses a dual-mode color system built on CSS custom properties. Both light and dark modes are first-class citizens - neither is a derived afterthought.

## 2.1 Core Palette

### Harvest Green - The Accent

The primary accent color is a sophisticated, desaturated sage green - not neon, not forest, not lime. It evokes cultivated growth without screaming "nature app." Think: the color of a healthy field seen from a distance, or oxidized copper on an old barn.

```css
/* Harvest accent - sage green family */
--hv-green-50: #f0f7f1;
--hv-green-100: #daeedd;
--hv-green-200: #b8debb;
--hv-green-300: #8ac78f;
--hv-green-400: #5aad62;
--hv-green-500: #3d8f46;   /* Primary accent */
--hv-green-600: #2f7237;
--hv-green-700: #275b2d;
--hv-green-800: #234927;
--hv-green-900: #1e3c22;
--hv-green-950: #0d2113;
```

Usage rules for accent green:
- Primary actions (CTAs, active states, confirmations)
- Progress indicators and confidence scores
- Active navigation items
- Success states
- Sparingly - green is powerful because it is rare in the interface

### Semantic Colors

```css
/* Status colors - desaturated for dark mode, vivid for light */
--hv-success: var(--hv-green-500);
--hv-warning: #d4a026;        /* Warm amber - pending, needs attention */
--hv-danger: #c4493c;         /* Muted red - destructive, errors, bounced */
--hv-info: #4a8fc2;           /* Steel blue - informational, neutral */

/* Operator identity colors - subtle, used for badges and indicators only */
--hv-op-postmaster: #6b7280;  /* Slate - infrastructure, behind the scenes */
--hv-op-scout: #8b6f47;       /* Earth brown - prospecting, digging */
--hv-op-composer: #7c6b9e;    /* Muted purple - creative, writing */
--hv-op-concierge: #4a8fc2;   /* Steel blue - communication, service */
--hv-op-navigator: #c27a4a;   /* Warm copper - orchestration, direction */
--hv-op-keeper: #5a8a6e;      /* Forest green - CRM, relationships */
--hv-op-analyst: #8a7a5a;     /* Wheat gold - analytics, insights */
```

### Driving Mode Colors

These colors carry meaning throughout the entire interface:

```css
--hv-mode-human: #6b7280;     /* Neutral gray - manual control */
--hv-mode-approvals: #d4a026;  /* Amber - AI proposes, human decides */
--hv-mode-autopilot: var(--hv-green-500); /* Green - system running */
```

## 2.2 Dark Mode (Default)

Dark mode is the default. It should feel warm, not cold. Think: a well-lit workshop at night, not a computer terminal.

```css
[data-theme="dark"] {
  /* Surfaces - warm dark grays, NOT blue-tinted, NOT pure black */
  --surface-base: #111110;         /* App background - near-black, warm */
  --surface-raised: #1a1a19;       /* Cards, panels, sidebar */
  --surface-overlay: #222221;      /* Modals, dropdowns, popovers */
  --surface-elevated: #2a2a28;     /* Hover states, selected items */
  --surface-highlight: #333330;    /* Active row, focused element */

  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.06);   /* Structural dividers */
  --border-default: rgba(255, 255, 255, 0.10);   /* Card borders, inputs */
  --border-strong: rgba(255, 255, 255, 0.16);    /* Emphasized borders */

  /* Text */
  --text-primary: #ececec;         /* Primary content - NOT pure white */
  --text-secondary: #a0a09a;       /* Labels, metadata, secondary info */
  --text-tertiary: #6b6b65;        /* Timestamps, placeholders, hints */
  --text-disabled: #4a4a46;        /* Disabled states */
  --text-inverse: #111110;         /* Text on accent backgrounds */

  /* Accent on dark */
  --accent-primary: #5aad62;       /* Green 400 - slightly lighter for dark bg */
  --accent-primary-hover: #6bbd72;
  --accent-primary-muted: rgba(90, 173, 98, 0.15); /* Subtle accent backgrounds */

  /* Interactive */
  --interactive-hover: rgba(255, 255, 255, 0.04);
  --interactive-active: rgba(255, 255, 255, 0.08);
  --interactive-selected: rgba(90, 173, 98, 0.12);

  /* Shadows - minimal in dark mode, use borders instead */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
}
```

### Dark Mode Rules

1. Never use pure black (#000000) as a background - use warm near-blacks
2. Never use pure white (#FFFFFF) for text - use #ececec or softer
3. Borders do more work than shadows in dark mode
4. Accent green should be the 400 weight (lighter) for adequate contrast
5. Translucent surfaces (rgba-based) create depth without harsh edges
6. Subtle warm undertone in all grays - no blue, no purple tinting

## 2.3 Light Mode

Light mode is NOT an inverted dark mode. It is independently designed to feel equally refined. Think: clean linen, morning light, a well-organized desk.

```css
[data-theme="light"] {
  /* Surfaces - warm whites and off-whites */
  --surface-base: #fafaf8;         /* App background - warm white */
  --surface-raised: #ffffff;       /* Cards, panels */
  --surface-overlay: #ffffff;      /* Modals, dropdowns */
  --surface-elevated: #f5f5f2;    /* Hover states, selected */
  --surface-highlight: #efefe8;   /* Active row, focused */

  /* Borders */
  --border-subtle: rgba(0, 0, 0, 0.06);
  --border-default: rgba(0, 0, 0, 0.12);
  --border-strong: rgba(0, 0, 0, 0.20);

  /* Text */
  --text-primary: #1a1a18;
  --text-secondary: #6b6b65;
  --text-tertiary: #9a9a92;
  --text-disabled: #c4c4bc;
  --text-inverse: #fafaf8;

  /* Accent on light */
  --accent-primary: #3d8f46;       /* Green 500 - full weight for light bg */
  --accent-primary-hover: #2f7237;
  --accent-primary-muted: rgba(61, 143, 70, 0.10);

  /* Interactive */
  --interactive-hover: rgba(0, 0, 0, 0.04);
  --interactive-active: rgba(0, 0, 0, 0.08);
  --interactive-selected: rgba(61, 143, 70, 0.08);

  /* Shadows - carry more weight in light mode */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.10);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
}
```

### Light Mode Rules

1. Background is warm off-white (#fafaf8), not clinical pure white
2. Shadows do more work than borders for depth (opposite of dark mode)
3. Accent green at 500 weight for adequate contrast on light surfaces
4. All grays carry the same warm undertone as dark mode
5. Cards use white (#ffffff) on the off-white base for subtle lift

## 2.4 Theme Switching

```css
/* Respect system preference, allow manual override */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* dark mode variables */
  }
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    /* light mode variables */
  }
}
```

Theme toggle lives in the Settings page. Store preference in Supabase user profile (not localStorage) so it persists across devices. Default to system preference on first load.

---

# 3. TYPOGRAPHY

## 3.1 Font Stack

```css
/* Primary - UI text, labels, body, navigation */
--font-sans: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

/* Monospace - data values, codes, IDs, technical content */
--font-mono: 'Geist Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
```

**Why Geist:** Created by Vercel, designed specifically for developer tools and modern applications. It is neutral without being boring, highly legible at small sizes, excellent number forms for data display, and carries the same engineering-precision energy as Linear's typography. It pairs naturally with Geist Mono for data-heavy interfaces.

**Fallback:** If Geist is not available or adds too much load, use the system font stack. Do NOT fall back to Inter - it is overused and lacks the character Harvest needs.

## 3.2 Type Scale

```css
/* Size scale - rem-based, slightly tighter than default */
--text-xs: 0.6875rem;     /* 11px - timestamps, tertiary metadata */
--text-sm: 0.8125rem;     /* 13px - secondary labels, table metadata */
--text-base: 0.875rem;    /* 14px - body text, table cells, form inputs */
--text-md: 0.9375rem;     /* 15px - primary UI text, navigation */
--text-lg: 1.125rem;      /* 18px - section headers, card titles */
--text-xl: 1.375rem;      /* 22px - page titles */
--text-2xl: 1.75rem;      /* 28px - major headings, dashboard hero */
--text-3xl: 2.25rem;      /* 36px - display, onboarding headlines */

/* Weight scale */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

/* Line height */
--leading-tight: 1.2;     /* Headings, single-line labels */
--leading-normal: 1.5;    /* Body text, paragraphs */
--leading-relaxed: 1.625; /* Long-form content, email previews */

/* Letter spacing */
--tracking-tight: -0.02em;   /* Headings, large text */
--tracking-normal: 0em;      /* Body text */
--tracking-wide: 0.04em;     /* All-caps labels, overlines */
--tracking-wider: 0.08em;    /* Sparse all-caps, status badges */
```

## 3.3 Typography Patterns

**Page titles:** `text-xl`, `font-semibold`, `tracking-tight`. Sentence case. Example: "Prospects" not "PROSPECTS"

**Section headers:** `text-lg`, `font-semibold`. Used within pages to group content.

**Card/row titles:** `text-base`, `font-medium`. Contact names, campaign names, deal names.

**Body/table text:** `text-base`, `font-normal`. Most UI text lives here.

**Metadata:** `text-sm`, `font-normal`, `text-secondary`. Timestamps, source labels, secondary info.

**Overline labels:** `text-xs`, `font-medium`, `tracking-wider`, `text-tertiary`, uppercase. Used sparingly above data groups. Example: `ENGINE PERFORMANCE` in Dark Madder.

**Monospace data:** `font-mono`, `text-sm`. Email addresses, domains, IDs, scores, API keys, code snippets.

**Data values (numbers):** `font-mono`, `font-medium`. All numerical data - scores, counts, percentages, currency - uses monospace for alignment and precision feel. Tabular figures enabled.

---

# 4. SPACING & LAYOUT

## 4.1 Spacing Scale

```css
--space-0: 0;
--space-1: 0.25rem;    /* 4px - inline gaps, icon padding */
--space-2: 0.5rem;     /* 8px - tight groups, tag gaps */
--space-3: 0.75rem;    /* 12px - default element gap */
--space-4: 1rem;       /* 16px - card padding, section gaps */
--space-5: 1.25rem;    /* 20px - generous padding */
--space-6: 1.5rem;     /* 24px - section separators */
--space-8: 2rem;       /* 32px - major section gaps */
--space-10: 2.5rem;    /* 40px - page-level spacing */
--space-12: 3rem;      /* 48px - hero spacing */
```

## 4.2 Layout Structure

```
+-----------------------------------------------------------+
|  Sidebar (240px fixed)  |  Main Content (fluid)           |
|                         |                                  |
|  [Logo]                 |  [Page Header]                   |
|  [Nav Items]            |  [Content Area - scroll]         |
|                         |                                  |
|                         |                                  |
|  [Org Selector]         |                                  |
|  [User/Profile]         |                                  |
+-----------------------------------------------------------+
          [Floating Pill - bottom-left, above sidebar]
```

**Sidebar:** 240px fixed width. Collapsible to 64px (icon-only) on smaller screens or user preference. The sidebar is visually recessed - dimmer than the main content area (following Linear's approach). Navigation items use text-sm with 36px row height.

**Main content:** Fluid width with max-width of 1400px for readability. Centered with auto margins on ultra-wide displays. Content area has 24px padding on all sides.

**Page header:** Fixed at top of content area. Contains page title, primary actions (right-aligned), and optional filter bar. 56px height.

**Floating pill:** Kinetiks ecosystem presence indicator. Bottom-left corner, 16px from edge. Overlays the sidebar. Contains: Kinetiks logo mark, app switcher, link to id.kinetiks.ai for billing/settings. 40px diameter, expandable on hover/click.

## 4.3 Responsive Breakpoints

```css
--breakpoint-sm: 640px;    /* Mobile */
--breakpoint-md: 768px;    /* Tablet */
--breakpoint-lg: 1024px;   /* Desktop - sidebar collapses below this */
--breakpoint-xl: 1280px;   /* Wide desktop */
--breakpoint-2xl: 1536px;  /* Ultra-wide */
```

Below 1024px: Sidebar collapses to overlay/drawer pattern. Below 768px: Single-column layout, stacked panels.

## 4.4 Border Radius

```css
--radius-sm: 4px;      /* Buttons, badges, inputs */
--radius-md: 6px;      /* Cards, panels */
--radius-lg: 8px;      /* Modals, large cards */
--radius-xl: 12px;     /* Feature cards, hero elements */
--radius-full: 9999px; /* Pills, avatars, circular elements */
```

Harvest uses slightly more rounded corners than Dark Madder - softer, more approachable. Dark Madder's sharper corners suit its lab aesthetic. Harvest's rounder corners suit its cultivated, organic feel.

---

# 5. COMPONENT SYSTEM

## 5.1 Sidebar Navigation

The sidebar is the primary navigation structure. Modeled after Dark Madder's sidebar but with Harvest's personality.

```
[Harvest Logo + Wordmark]
---
Dashboard          (home icon)
Prospects          (search/target icon)
Campaigns          (megaphone/send icon)
Compose            (pen/edit icon)
Inbox              (inbox icon - dot for unread)
Calls              (phone icon)
Pipeline           (kanban/columns icon)
Contacts           (people icon)
Analytics          (chart icon)
Infra              (server/shield icon)
---
Settings           (gear icon)
```

**Active state:** Left border accent (2px, --accent-primary), text in --text-primary, background --interactive-selected. Subtle, not loud.

**Hover state:** Background --interactive-hover. No color change on text.

**Badge/indicator:** Unread count on Inbox (red dot or number). Pending approvals count on relevant sections. These use small (18px) rounded pills.

**Bottom section:** Org selector dropdown (if multiple Kinetiks IDs) and user avatar + name. Mirrors Dark Madder's bottom-left pattern.

**Logo:** The Harvest wordmark sits at the top. Simple, clean, no tagline in the nav. The Harvest icon (see Brand section) precedes the wordmark. On collapsed sidebar, only the icon shows.

## 5.2 Data Tables

Tables are the primary data interface for Prospects, Contacts, Campaigns, Calls. Inspired by Clay's density with Linear's refinement.

```css
/* Table structure */
.hv-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.hv-table th {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-default);
  position: sticky;
  top: 0;
  background: var(--surface-raised);
  z-index: 10;
}

.hv-table td {
  font-size: var(--text-base);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: middle;
}

.hv-table tr:hover td {
  background: var(--interactive-hover);
}

.hv-table tr[data-selected] td {
  background: var(--interactive-selected);
}
```

**Row height:** 48px default. Comfortable for scanning without wasting space.

**Column patterns:**
- Name columns: Avatar (32px circle) + name (font-medium) + subtitle (text-sm, text-secondary). Stacked in one cell.
- Status columns: Badge/pill component with semantic color.
- Score columns: Monospace number, optionally with mini progress bar.
- Source columns: Small colored badge (Newsletter = green, Website = blue, etc.)
- Owner columns: Small avatar + name.
- Action columns: Three-dot menu (right-aligned), appears on row hover.

**Checkbox column:** 20px width, leftmost. For bulk actions. Header checkbox for select-all.

**Pagination:** Bottom of table. "1 - 7 of 21 Entries" pattern with page numbers. Not infinite scroll - explicit pagination communicates dataset size.

**Empty state:** Centered illustration (see Illustrations section) + heading + description + CTA button. Never a blank table.

## 5.3 Cards

Used for dashboard widgets, campaign summaries, deal cards (pipeline), and detail panels.

```css
.hv-card {
  background: var(--surface-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.hv-card:hover {
  border-color: var(--border-default);
}

/* Stat card variant */
.hv-stat-card {
  padding: var(--space-5);
}

.hv-stat-card .label {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  margin-bottom: var(--space-1);
}

.hv-stat-card .value {
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.hv-stat-card .delta {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  margin-top: var(--space-1);
}
```

## 5.4 Buttons

```css
/* Primary - accent green, used sparingly for main CTAs */
.hv-btn-primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  font-weight: var(--font-medium);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--text-base);
  border: none;
  cursor: pointer;
  transition: background 150ms ease;
}

.hv-btn-primary:hover {
  background: var(--accent-primary-hover);
}

/* Secondary - subtle background, used for most actions */
.hv-btn-secondary {
  background: var(--surface-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  /* same sizing as primary */
}

/* Ghost - no background, used inline or for less important actions */
.hv-btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: none;
}

.hv-btn-ghost:hover {
  background: var(--interactive-hover);
  color: var(--text-primary);
}

/* Danger - red for destructive actions */
.hv-btn-danger {
  background: transparent;
  color: var(--hv-danger);
  border: 1px solid var(--hv-danger);
}
```

**Button hierarchy rule:** Maximum ONE primary button visible per page section. Everything else is secondary or ghost. If there is a "New Contact +" or "Start Campaign", that is the only green button in view.

## 5.5 Badges & Status Pills

Status indicators appear throughout Harvest - lead status, email status, verification grade, driving mode, Operator state.

```css
.hv-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  letter-spacing: var(--tracking-wide);
}

/* Variants */
.hv-badge-success { background: rgba(90,173,98,0.15); color: #5aad62; }
.hv-badge-warning { background: rgba(212,160,38,0.15); color: #d4a026; }
.hv-badge-danger  { background: rgba(196,73,60,0.15); color: #c4493c; }
.hv-badge-info    { background: rgba(74,143,194,0.15); color: #4a8fc2; }
.hv-badge-neutral { background: var(--surface-elevated); color: var(--text-secondary); }
```

**Verification grades:** A = success, B = info, C = warning, D = danger.

**Lead status mapping:** New lead = neutral, Qualified = info, Contacted = warning, Demo scheduled = success, Nurturing = info, Follow up = warning.

**Source badges:** Newsletter = accent green background, Website = info blue background, Import = neutral, Referral = purple-ish.

## 5.6 Approval Cards

The most important interactive component in Harvest. When the system proposes an action in Approvals mode, the user sees an approval card.

```
+----------------------------------------------------------+
| COMPOSER - First-touch email              [Approve] [Edit] [Reject]
|                                                          |
| To: Sarah Chen, VP Marketing at Dataflow                |
| CC: James Liu, Director of Engineering                   |
|                                                          |
| Subject: Quick thought on Dataflow's security posture    |
|                                                          |
| [Email preview - rendered, not raw text]                 |
|                                                          |
| --- Reasoning ---                                        |
| Led with security angle because Dataflow had a recent    |
| breach in the news. CC'd James Liu because your pairing  |
| preferences target technical champions alongside...      |
|                                                          |
| Sentinel: PASS (quality: 87/100)                         |
| Confidence: 91% for this function                        |
+----------------------------------------------------------+
```

**Design requirements:**
- Clear visual hierarchy: who, what, why
- The email preview should render as it would appear in the recipient's inbox
- Sentinel verdict always visible (PASS/HOLD/FAIL with score)
- Reasoning section collapsible but open by default
- Three action buttons: Approve (primary/green), Edit (secondary), Reject (ghost/danger)
- Batch mode: Multiple approval cards stacked, with "Approve All" option
- Keyboard shortcuts: A = approve, E = edit, R = reject, arrow keys to navigate batch

## 5.7 Confidence Meter

Displays per-Operator, per-function confidence and driving mode status.

```
Scout - ICP prospect matching
[==================== ] 97%  AUTOPILOT
                               Active - 97% agreement

Composer - First-touch emails
[================     ] 82%  APPROVALS
                               6 more approvals to unlock

Navigator - Voice calls
[===                  ] 12%  HUMAN DRIVE
                               Requires significant training
```

**Visual treatment:**
- Progress bar uses accent green fill with subtle gradient
- Current mode badge uses driving mode colors (gray/amber/green)
- The unlock threshold is marked on the bar (small notch/tick)
- Smooth animation on progress changes
- Expandable to show the four confidence dimensions (volume, agreement, outcome, recency)

## 5.8 Pipeline Kanban

The Pipeline page uses a horizontal kanban board for deal stages.

**Columns:** New, Contacted, Demo Scheduled, Proposal Sent, Negotiation, Won, Lost

**Cards within columns:**
```
+--------------------------------+
| Acme Corp                      |
| Sarah Chen - VP Marketing      |
| $45,000                        |
|                                |
| Last activity: 2d ago          |
| Source: Campaign - Q1 Outbound |
+--------------------------------+
```

- Cards are draggable between columns
- Column headers show count and total value
- Won/Lost columns are visually distinct (green tint / red tint on background)
- Cards show contact avatar, company, value (monospace, bold), last activity
- Vertical scroll within columns, horizontal scroll for the board

## 5.9 Forms & Inputs

```css
.hv-input {
  background: var(--surface-base);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-base);
  color: var(--text-primary);
  transition: border-color 150ms ease;
}

.hv-input:focus {
  border-color: var(--accent-primary);
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-primary-muted);
}

.hv-input::placeholder {
  color: var(--text-tertiary);
}

/* Label */
.hv-label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
}
```

## 5.10 Toasts & Notifications

Non-blocking notifications for background actions.

- Appear bottom-right, stacked
- Auto-dismiss after 5 seconds (configurable)
- Types: success (green left-border), error (red), warning (amber), info (blue)
- Action toasts (e.g., "Email sent to Sarah Chen" with "Undo" link) persist until dismissed
- Maximum 3 visible at once, older ones slide out

---

# 6. ICONOGRAPHY

## 6.1 Icon System

Use **Lucide** icons (lucide.dev) as the primary icon set. They are clean, consistent, 24px default grid, stroke-based, and open-source. Already available in the ecosystem via lucide-react.

**Icon sizes:**
- 16px - inline with text, table actions, small badges
- 20px - navigation items, button icons, form elements
- 24px - page headers, feature icons, card headers
- 32px - empty states, onboarding, hero sections

**Icon colors:**
- Navigation: --text-secondary (default), --text-primary (active/hover)
- In buttons: inherit text color
- Standalone: --text-tertiary
- Status: use semantic colors

## 6.2 Farming-Inspired Custom Icons

A small set of custom icons reinforce the harvest metaphor without being literal. These are used in specific branded moments, not as general UI icons.

**Suggested custom icons (SVG, stroke-based, matching Lucide weight):**

- **Seed** - Used for "new prospect added" or "campaign planted"
- **Sprout** - Used for "warming up" or "early engagement"
- **Wheat stalk** - Used for "ready to harvest" or "qualified lead"
- **Growth rings** - Used for confidence/trust building visualization
- **Furrow lines** - Used as a subtle pattern for empty states or loading
- **Sun/horizon** - Used for "daily brief" or "new day" contexts

These are atmospheric, not functional. They appear in: onboarding, empty states, milestone celebrations, loading states, the daily Slack digest.

---

# 7. MOTION & ANIMATION

## 7.1 Principles

Motion in Harvest is purposeful and restrained. It communicates state changes and builds the feeling of a living system without being flashy.

**Speed:** Most transitions complete in 150-200ms. Nothing slower than 300ms except page transitions. Instant feedback for clicks (no perceptible delay).

**Easing:** Use `cubic-bezier(0.25, 0.1, 0.25, 1)` for most transitions (a subtle ease-out). For spring-like interactions (drag-and-drop, kanban), use `cubic-bezier(0.34, 1.56, 0.64, 1)`.

## 7.2 Specific Animations

```css
/* Sidebar nav - smooth transitions */
.nav-item {
  transition: background 150ms ease, color 150ms ease;
}

/* Cards/rows - hover lift (light mode only) */
[data-theme="light"] .hv-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
  transition: all 150ms ease;
}

/* Toast entrance */
@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* Confidence bar fill */
@keyframes fillBar {
  from { width: 0; }
  to { width: var(--fill-percent); }
}

/* Approval card - subtle entrance */
@keyframes fadeInUp {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Pipeline card drag */
.card-dragging {
  transform: rotate(2deg) scale(1.02);
  box-shadow: var(--shadow-lg);
  opacity: 0.9;
  transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

## 7.3 Loading States

**Skeleton screens** over spinners. When data is loading, show the shape of the content with pulsing placeholder blocks. This prevents layout shift and feels faster.

```css
.hv-skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-elevated) 25%,
    var(--surface-highlight) 50%,
    var(--surface-elevated) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite ease-in-out;
  border-radius: var(--radius-sm);
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

**Skeleton shapes match the content they replace:** table rows are skeleton rows, cards are skeleton cards, stat values are skeleton numbers.

---

# 8. THE HARVEST METAPHOR IN UI

The farming metaphor is woven throughout Harvest's language and visual patterns - never as decoration, always as meaning.

## 8.1 Language Mapping

| Sales Concept | Harvest Language | Where It Appears |
|--------------|-----------------|-----------------|
| Lead list / prospects | Field | "Your field has 2,400 prospects" |
| Adding prospects | Planting / Sowing | "Plant 50 new prospects" or "Sow this campaign" |
| Email warmup | Warming the soil | Infra page: "Soil temperature: warming (day 12 of 30)" |
| Lead scoring | Ripeness | "23 prospects are ripe for harvest" |
| Nurturing / drip sequence | Watering / Tending | "Tending 145 active conversations" |
| Conversion / deal won | Harvest | "3 deals harvested this week ($127k)" |
| Lost deal | Frost / Wilt | Optional, use judiciously |
| Campaign | Season | "Spring 2026 Enterprise Season" or just "campaign" |
| Daily digest | Morning Brief | "Your morning brief is ready" |
| Confidence building | Growth | "Composer's confidence is growing - 82% ready" |

**Rule:** The metaphor is available, not mandatory. Every farming term must also be immediately comprehensible to someone who has never farmed. Use it to add flavor, not to obscure meaning. If "campaign" is clearer than "season," use "campaign." The metaphor should feel like a thoughtful naming choice, not a theme park.

## 8.2 Visual Patterns

**Growth visualization:** Instead of generic progress bars, confidence and warmup progress can use a subtle "growth" visual - a line that curves upward like a growth chart, with small leaf nodes at key milestones.

**Empty state illustrations:** Minimal line-art illustrations using the farming metaphor:
- No prospects yet: An empty field with furrow lines, waiting to be planted
- No campaigns: A seed packet, unopened
- No deals in pipeline: A cleared field, ready for the next season
- Inbox zero: A harvested field at sunset - the work is done

**Seasonal color accents:** Optional, subtle. The dashboard could carry a barely-perceptible seasonal tint - very slightly warmer in Q2-Q3, cooler in Q4-Q1. This is extremely subtle. If it is noticeable, it is too much.

**Data visualization:** Charts use the green accent for positive metrics, with the confidence meter's growth-ring pattern as a signature element. Area charts can use a subtle gradient that evokes rolling hills.

## 8.3 Harvest Brand Mark

The Harvest logo is a minimal, geometric icon paired with the "HARVEST" wordmark.

**Icon concept:** A single wheat stalk rendered in clean geometric strokes, or an abstract "H" formed from vertical furrow lines. The icon should work at 16px (favicon) through 64px (splash). Single-color, no gradients in the mark itself.

**Wordmark:** "HARVEST" in Geist, font-weight 600, letter-spacing: 0.04em. All caps for the wordmark only (not navigation or UI text).

**Color:** The brand mark uses --accent-primary (green) on dark backgrounds, --surface-base (dark) on light backgrounds.

**Placement:** Top of sidebar, left-aligned, with icon preceding wordmark. On collapsed sidebar, icon only.

---

# 9. PAGE-BY-PAGE DESIGN SPECIFICATIONS

## 9.1 Dashboard (hv.kinetiks.ai/)

The first thing the user sees. It is a mission control - everything important at a glance.

**Layout:**
```
+-----------------------------------------------------------+
|  DASHBOARD                              [date range picker]|
+-----------------------------------------------------------+
|                                                            |
|  [Stat] Emails Sent  [Stat] Open Rate  [Stat] Replies     |
|  [Stat] Meetings     [Stat] Deals Won  [Stat] Pipeline $  |
|                                                            |
+-----------------------------------------------------------+
|                              |                             |
|  PIPELINE SNAPSHOT           |  PENDING APPROVALS          |
|  (mini kanban / bar chart)   |  (approval cards, compact)  |
|                              |                             |
+------------------------------+-----------------------------+
|                              |                             |
|  ACTIVE CAMPAIGNS            |  OPERATOR CONFIDENCE        |
|  (list with sparklines)      |  (confidence meters, all 7) |
|                              |                             |
+------------------------------+-----------------------------+
|                                                            |
|  RECENT ACTIVITY FEED                                      |
|  (timeline of events across all Operators)                 |
|                                                            |
+-----------------------------------------------------------+
|  INFRA HEALTH                                              |
|  (domain reputation, warmup status, mailbox health)        |
+-----------------------------------------------------------+
```

**Key design decisions:**
- Stat cards use the monospace large-number pattern. Delta (change) shown as +/- percentage with green/red color.
- Pipeline snapshot is a compact horizontal bar chart (not a full kanban - that lives in /pipeline).
- Pending approvals shows the 3 most urgent, with "View All (N)" link.
- Operator confidence meters are compact - one row per Operator, most important function shown. Expandable.
- Activity feed is a vertical timeline with Operator avatar/icon, action description, timestamp. Auto-refreshes.
- Infra health is a simple row of indicators: green/yellow/red for each domain.

**The Morning Brief:** If the user hasn't visited today, the dashboard opens with a brief summary overlay or top banner: "Good morning, Zack. 3 deals moved forward. 2 approvals waiting. Composer is 6 approvals from Autopilot. 97% deliverability across all domains." Dismissible, returns to the standard dashboard.

## 9.2 Prospects (hv.kinetiks.ai/prospects)

Scout's domain. The primary prospecting and list management interface.

**Layout:** Full-width data table with filter toolbar.

**Filter toolbar:** Horizontal bar above the table.
- Quick filters: ICP match (slider/dropdown), Verification grade (A/B/C/D toggle), Lead score range, Source, Tags
- Advanced filter button opens a panel with all Scout filter dimensions
- Search bar (searches name, email, company, title)
- "Scout: Find Prospects" button (primary) - triggers Scout to proactively search

**Table columns:** Checkbox, Name+Title (stacked), Company, Verification (badge), Lead Score (monospace + mini bar), Source (badge), Status, Last Activity, Actions (...)

**Row expansion:** Clicking a row opens a slide-over detail panel from the right (not a new page). Shows: full enrichment data, all activities, email history, connected organization, lead score breakdown (fit/intent/engagement), notes, tags.

**Bulk actions toolbar:** Appears when checkboxes selected. Actions: Add to Campaign, Enrich, Verify, Tag, Export, Delete.

## 9.3 Campaigns (hv.kinetiks.ai/campaigns)

Navigator's domain. Campaign creation and management.

**Layout:** Card grid (3 columns on wide desktop, 2 on standard, 1 on mobile) showing active/draft/completed campaigns.

**Campaign card:**
```
+----------------------------------+
| Q1 Enterprise Outbound           |
| Active - 12 days running         |
|                                  |
| Prospects: 450                   |
| Sent: 1,230  Opens: 34%         |
| Replies: 8.2%  Meetings: 14     |
|                                  |
| [Sparkline chart of daily sends] |
|                                  |
| Sequence: 5 steps (email,       |
| LinkedIn, email, call, email)    |
+----------------------------------+
```

**Campaign detail page:** Full view with sequence builder, prospect list, analytics, A/B test results.

**Sequence builder:** Visual step builder. Each step is a card with: channel icon (email/LinkedIn/call/wait), delay, template reference. Steps connected by vertical line. Drag to reorder. "Add Step" at the bottom.

## 9.4 Compose (hv.kinetiks.ai/compose)

Composer's domain. Email drafting and AI draft review.

**Layout:** Split view. Left panel: prospect context (who, company, enrichment, history). Right panel: email editor.

**Email editor:** Rich text editor with toolbar. Shows "From" mailbox selector, "To" field, "CC" field (for Bloomify pairing), Subject line, Body.

**AI draft indicator:** When Composer generates a draft, a subtle banner appears above the editor: "Draft by Composer - Review before sending" with confidence score. Edits to the draft are tracked and fed back to the confidence engine.

**CC Mode (Bloomify legacy):** When enabled, the compose view shows both contacts side by side - the primary decision-maker and the CC champion/influencer. The AI explains why this pair was chosen.

## 9.5 Inbox (hv.kinetiks.ai/inbox)

Concierge's domain. Unified inbox for all replies.

**Layout:** Three-column email client pattern (list, preview, context).

**Left column (320px):** Reply list with classification badges.
- Classification colors: Interested (green), Question (blue), Objection (amber), OOO (gray), Unsubscribe (red), Meeting request (green), Referral (purple), Not interested (gray), Spam (gray dim)
- Unread items have bold text + left-border accent
- Sorted by recency, filterable by classification

**Center column (fluid):** Full email thread view. Shows all emails in the thread chronologically. AI-suggested reply appears at the bottom with "Concierge draft" label and Approve/Edit/Reject buttons.

**Right column (280px):** Contact context panel. Contact info, company, deal status, all previous interactions, notes. Quick actions: book meeting, add to campaign, escalate.

## 9.6 Calls (hv.kinetiks.ai/calls)

Navigator's voice calling domain.

**Layout:** Tab bar at top: Queue, Active, Completed, Scheduled.

**Call queue:** Table of upcoming calls with: contact, company, call script preview, scheduled time, sequence context. "Start Call" button per row.

**Active call view:** Full-screen during a call. Large contact photo/avatar, real-time transcript flowing on the left, key moments flagged in real-time, call controls (mute, end, transfer, escalate). Talking points from Composer visible as reference.

**Completed call view:** Full transcript with key moments highlighted. AI-generated call summary. Next action recommendation (follow up, schedule meeting, mark as lost, etc.). Audio playback.

## 9.7 Pipeline (hv.kinetiks.ai/pipeline)

Keeper's domain. Full CRM kanban.

See Component section 5.8 for kanban design. Additional details:

**Column customization:** Users can add/rename/reorder columns. Default set matches standard sales pipeline.

**Deal detail slide-over:** Clicking a deal card opens a detailed right panel: deal value, stage history (visual timeline), all activities, all emails, all calls, associated contacts, attribution (which campaign/sequence/channel), notes, files.

**Filters:** By value range, stage, owner (future), date range, source campaign.

**Summary bar:** Top of pipeline. Total pipeline value, deals by stage count, average deal age, win rate. All monospace numbers.

## 9.8 Contacts (hv.kinetiks.ai/contacts)

Keeper's domain. Full contact directory with organization views.

**Layout:** Data table with org-level grouping option.

**Tab navigation within page:** People, Organizations.

**People view:** Full contact table similar to Prospects but showing all contacts (not just prospects). Additional columns: deals, total emails, last contact date, relationship health score.

**Organization view:** Card grid or table showing organizations with: name, domain, industry, contact count, total deal value, health score. Click through to org detail with all contacts at that org, all deals, all activities.

## 9.9 Analytics (hv.kinetiks.ai/analytics)

Analyst's domain. Comprehensive reporting.

**Layout:** Tab bar: Overview, Campaigns, Channels, Revenue, Patterns.

**Chart styling:**
- Use Recharts or Chart.js with Harvest color tokens
- Primary data line/bar: --accent-primary (green)
- Secondary: --hv-info (blue)
- Comparison/previous period: --text-tertiary (dashed line)
- Grid lines: --border-subtle
- Axis labels: --text-secondary, text-xs, font-mono
- Values on hover: tooltip with monospace numbers
- Area fills: accent with 10-15% opacity

**Overview dashboard:** Key metrics with sparklines, trend indicators, Analyst insights (AI-generated observations in plain language).

**Patterns page:** Analyst's unique feature. AI-generated insights in card format:
```
+------------------------------------------+
| PATTERN DETECTED                         |
|                                          |
| Security messaging converts 3x better   |
| with enterprise prospects (500+          |
| employees). Consider shifting Q2         |
| campaigns to lead with security angle.   |
|                                          |
| Based on: 234 emails, 41 replies,        |
| 12 meetings booked                       |
|                                          |
| [Apply to Future Campaigns]  [Dismiss]   |
+------------------------------------------+
```

## 9.10 Infra (hv.kinetiks.ai/infra)

Postmaster's domain. Email infrastructure management.

**Layout:** Section-based single page.

**Sections:**
1. **Domains** - Table with domain, DNS status (green/red indicators for SPF, DKIM, DMARC), health score, created date. Each expandable to show full DNS records.
2. **Mailboxes** - Table with email, domain, warmup status + progress bar (using the "soil temperature" metaphor), daily limit, reputation score, active/paused toggle.
3. **Deliverability** - Real-time charts showing inbox rate, spam rate, bounce rate across all mailboxes. Historical comparison.
4. **Compliance** - Suppression list count, recent unsubscribes, DNC entries. CAN-SPAM/GDPR/CCPA compliance checklist (all green checks).

**Warmup visualization:** The warmup progress for each mailbox is a key visual. Show it as a gradual "warming" - a progress bar that transitions from cool blue to warm orange to green as warmup completes. Label: "Day 12 of 30 - Warming the soil"

## 9.11 Settings (hv.kinetiks.ai/settings)

Configuration page. NOT billing or account settings (those live at id.kinetiks.ai).

**Sections:**
1. **Driving Modes** - Per-Operator, per-function mode management. The full confidence dashboard from Component 5.7.
2. **Daily Limits** - Sends per mailbox, LinkedIn actions, calls per day, enrichment credits.
3. **Escalation Rules** - Configure triggers: high-value accounts, pricing mentions, frustrated tone, legal mentions. Each rule: condition + action (Slack DM, email, pause sequence).
4. **Calendar Integration** - Google Calendar connection for meeting booking.
5. **Slack Integration** - Slack workspace connection, channel mapping (#harvest-approvals, #harvest-wins, #harvest-alerts).
6. **Voice Configuration** - ElevenLabs voice selection, Twilio phone number management.
7. **Appearance** - Theme toggle (Light/Dark/System).

---

# 10. EMPTY STATES & ONBOARDING

## 10.1 First-Time Experience

When a user first lands in Harvest (fresh from Kinetiks ID onboarding via Cartographer), the dashboard should not be empty and sad. Instead:

**Welcome state:** A warm, focused onboarding sequence:
1. "Welcome to Harvest. Your Context Structure is loaded - we already know your voice, your products, and your ideal customers."
2. Quick-start cards: Set Up Sending (Postmaster), Find Prospects (Scout), Create First Campaign (Navigator)
3. Each card shows estimated time ("~5 min") and what it unlocks

**Progressive disclosure:** Features reveal as prerequisites are met. Don't show Campaigns until at least one mailbox is warming. Don't show Calls until voice is configured. The nav items exist but show a lock/setup-needed indicator.

## 10.2 Empty State Design

Every section has a crafted empty state. Never show a blank table or "No data."

```
+------------------------------------------+
|                                          |
|          [Minimal line illustration]      |
|                                          |
|      Your field is ready for planting     |
|                                          |
|   Scout can find prospects that match     |
|   your ideal customer profile. Or import  |
|   your own list to get started.           |
|                                          |
|   [Find Prospects]  [Import CSV]          |
|                                          |
+------------------------------------------+
```

**Illustration style:** Single-weight line art using --text-tertiary color. Minimal, geometric, with subtle farming elements. 120-160px max height. No fills, no gradients in illustrations - just strokes.

---

# 11. ACCESSIBILITY

## 11.1 Requirements

- WCAG 2.1 AA compliance minimum
- All interactive elements keyboard-accessible (tab, enter, escape, arrow keys)
- Focus rings visible: 2px solid --accent-primary with 2px offset
- Color contrast: minimum 4.5:1 for normal text, 3:1 for large text in both modes
- Screen reader support: ARIA labels on all interactive elements, role attributes on custom components
- Reduced motion: Respect `prefers-reduced-motion` - disable all animations, use instant state changes
- All icons paired with text labels (or aria-label if icon-only)

## 11.2 Focus Management

```css
/* Visible focus ring */
:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

/* Remove default focus for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}
```

---

# 12. RESPONSIVE BEHAVIOR

## 12.1 Breakpoint Behavior

**Desktop (1024px+):** Full sidebar + main content. All panels and split views functional.

**Tablet (768-1023px):** Sidebar collapses to icon-only (64px) with full sidebar on hover/toggle. Split views stack vertically. Pipeline kanban scrolls horizontally.

**Mobile (< 768px):** Sidebar becomes a top hamburger menu. Single-column layout. Tables switch to card-based list view. Pipeline shows one column at a time with swipe. Bottom tab bar for primary navigation (Dashboard, Inbox, Pipeline, More).

## 12.2 Touch Targets

Minimum 44px x 44px for all interactive elements on touch devices. Buttons, table rows, nav items, toggle switches all meet this minimum.

---

# 13. IMPLEMENTATION NOTES FOR CLAUDE CODE

## 13.1 Tech Stack Alignment

- **Framework:** Next.js (App Router) with React Server Components where possible
- **Styling:** Tailwind CSS with custom theme configuration matching the CSS variables above. Tailwind classes reference the design tokens.
- **Components:** Build a `packages/ui` shared component library in the monorepo. Harvest-specific components live in `apps/hv/src/components/`.
- **Icons:** `lucide-react` package. Import individual icons.
- **Charts:** Recharts for data visualizations. Configure with Harvest color tokens.
- **Animations:** CSS transitions for micro-interactions. Framer Motion for complex page transitions and the kanban drag-and-drop.
- **Theme:** Use `next-themes` for light/dark mode management. Store preference in Supabase.
- **Fonts:** Load Geist and Geist Mono via `@vercel/font` or self-hosted from `packages/ui/fonts/`.

## 13.2 Tailwind Configuration

```javascript
// tailwind.config.ts (harvest-specific extensions)
module.exports = {
  theme: {
    extend: {
      colors: {
        hv: {
          green: {
            50: '#f0f7f1',
            100: '#daeedd',
            200: '#b8debb',
            300: '#8ac78f',
            400: '#5aad62',
            500: '#3d8f46',
            600: '#2f7237',
            700: '#275b2d',
            800: '#234927',
            900: '#1e3c22',
            950: '#0d2113',
          },
          warning: '#d4a026',
          danger: '#c4493c',
          info: '#4a8fc2',
        },
        surface: {
          base: 'var(--surface-base)',
          raised: 'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
          elevated: 'var(--surface-elevated)',
          highlight: 'var(--surface-highlight)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
      },
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Geist Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'xs': '0.6875rem',
        'sm': '0.8125rem',
        'base': '0.875rem',
        'md': '0.9375rem',
        'lg': '1.125rem',
        'xl': '1.375rem',
        '2xl': '1.75rem',
        '3xl': '2.25rem',
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
      },
      spacing: {
        '0.5': '0.125rem',
        '1': '0.25rem',
        '1.5': '0.375rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '8': '2rem',
        '10': '2.5rem',
        '12': '3rem',
      },
    },
  },
};
```

## 13.3 Component File Structure

```
apps/hv/src/
  components/
    layout/
      Sidebar.tsx
      PageHeader.tsx
      FloatingPill.tsx       (imported from packages/ui)
      MainLayout.tsx
    data/
      DataTable.tsx          (generic, reusable)
      ProspectTable.tsx      (Harvest-specific columns)
      ContactTable.tsx
      StatCard.tsx
      EmptyState.tsx
    pipeline/
      KanbanBoard.tsx
      DealCard.tsx
      PipelineColumn.tsx
    approval/
      ApprovalCard.tsx
      ApprovalBatch.tsx
      ConfidenceMeter.tsx
    compose/
      EmailEditor.tsx
      CCMode.tsx
      RecipientContext.tsx
    inbox/
      ReplyList.tsx
      ThreadView.tsx
      ContactContext.tsx
    infra/
      DomainCard.tsx
      MailboxRow.tsx
      WarmupProgress.tsx
    charts/
      SparklineChart.tsx
      AreaChart.tsx
      BarChart.tsx
      PipelineBar.tsx
    common/
      Badge.tsx
      Button.tsx
      Input.tsx
      Toast.tsx
      Skeleton.tsx
      ModeIndicator.tsx      (driving mode badge)
```

## 13.4 Design Quality Checklist

Before shipping any page, verify:

- [ ] Both light and dark modes look intentional (not one derived from the other)
- [ ] All text meets contrast requirements (4.5:1 body, 3:1 large)
- [ ] Empty states are designed (illustration + copy + CTA)
- [ ] Loading states use skeletons (not spinners)
- [ ] All numbers use monospace font
- [ ] Maximum one primary (green) button per page section
- [ ] Sidebar navigation highlights correct active item
- [ ] Tables have proper hover states and selection indicators
- [ ] All interactive elements have visible focus states
- [ ] Approvals show Sentinel verdict and confidence context
- [ ] Farming metaphor is present but never confusing
- [ ] Page titles are sentence case
- [ ] Overline labels are uppercase with wide tracking
- [ ] The floating pill renders and functions correctly
- [ ] Responsive layout degrades gracefully at all breakpoints

---

# 14. DESIGN SYSTEM EVOLUTION

This is v1.0 of the Harvest Design Spec. It will evolve as the product is built. Key areas for future iteration:

- **Custom theme support:** Like Linear, allow users to set their own accent color. The CSS variable architecture supports this.
- **Data visualization library:** As Analyst matures, Harvest will need more sophisticated chart types. Build a consistent chart component library.
- **Illustration set:** Commission or create a cohesive set of farming-metaphor illustrations for all empty states and onboarding flows.
- **Animation polish:** After core functionality is solid, revisit micro-interactions and page transitions for premium feel.
- **Component library documentation:** Extract shared components into packages/ui with Storybook or similar documentation.

---

**End of Harvest Design & UX Specification v1.0**
