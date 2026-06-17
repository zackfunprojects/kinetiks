# Kinetiks Design Spec

**Version 1.0 — May 2026**
**Author: Zack Holland**
**Status: CANONICAL — supersedes all prior design guidance in this repo.**

> This document is the single source of truth for every visual and interaction decision across the Kinetiks platform.
>
> **Explicitly supersedes:**
> - `CLAUDE-v2.md` § Design System (purple #6C5CE7, teal #00CEC9, "Satoshi/Cabinet Grotesk" recommendation)
> - `Harvest_Design_UX_Spec.md` (Harvest green, farming metaphors, Linear-clone aesthetic)
> - Any per-app design language that contradicts this document
>
> Per-app **personality** still lives at the app level (Dark Madder's research-lab voice, Harvest's pipeline voice, Litmus's editorial voice). But every app draws from the **same token system, the same component library, and the same typographic discipline** defined here. App accents are *flavor on top of the system*, not separate systems.

---

## 0. How to use this doc

- Read sections 1–4 once. They define the principles and the tokens.
- Sections 5–7 are the component reference. Implement straight from them.
- Section 8–10 describe how Marcus, confidence, and the suite of apps surface in the UI.
- Section 11 is the light/dark mechanics — read before touching `data-theme`.
- The companion file `kinetiks-tokens.css` is the runtime implementation. Import once, at the root.

**The screenshot test:** before any UI ships, screenshot it and ask — *"does this look like it belongs to Kinetiks?"* If the answer is "it looks like a generic Tailwind dashboard," it fails. If it looks like a precision instrument with a literary soul, it passes.

---

## 1. Design principles

Five governing principles. Every component, every page, every micro-decision should be traceable back to one of these.

### 1.1 Serif and Mono

Kinetiks is two things at once: a philosophical advisor and a computational engine. The typography honors both. **DM Serif Display** carries the voice — Marcus's voice, the system's name, moments where the product speaks. **Geist Mono** carries the data — every number, ID, key, threshold, percentage. **Geist** sans-serif is the connective tissue between them.

The serif is used *sparingly*. It is not a decoration. It is where Kinetiks speaks. When you see DM Serif Display, the system is saying something. When you see Geist Mono, the system is showing something measurable. Everything else is Geist.

### 1.2 Hairline everything

Borders are 1px. Dividers are 1px. The platform has density — Cortex shows eight layers of structured data, Analytics shows a full GTM funnel, Approvals stack in a queue — but density never produces weight. The visual system stays calm by keeping every line a hair thick. Shadows are almost invisible. Surfaces are separated by tone, not by elevation.

### 1.3 Ink

There is one accent color: **ink-indigo**. It is used like punctuation in prose. It marks the cursor, the active link, the focus ring, the system's voice in chat, the goal-on-track state. Never as a fill on a primary button (the primary button is black on light / white on dark — the accent is what you read, not what you click). Never as a vibe. When ink appears, it is doing a job.

A single warm-clay secondary exists for celebrating verified wins. It is rarer than ink. The rest of the system is achromatic.

### 1.4 Paper and slate

Light mode is **paper** — warm, slightly off-white, the color of a Moleskine page. Dark mode is **slate** — cool, deep, the color of a fountain-pen well. The two are not the same image with inverted colors. Each is composed deliberately. A screen in paper feels like reading; the same screen in slate feels like night work in a study. Both modes ship together, both modes look intentional. Neither is the "real" one.

### 1.5 Generous quiet

Marcus's voice principles — *"State the situation plainly. Lead with the conclusion. Brevity is respect."* — are not just linguistic. They are visual. The UI never crowds. Empty space is never a bug. A page with three things on it and a lot of margin is right. A page with twelve things crammed in is wrong even if each thing is correct.

---

## 2. Color system

All colors are **CSS variables**. No component file contains a hardcoded hex value. Both light and dark mode are defined at `:root` and `[data-theme="dark"]` respectively. The theme switch is a single attribute swap; the variables do the rest.

### 2.1 Light mode — Paper

```css
/* Surface — Paper */
--kt-bg-base:        #FCFBF8;   /* primary canvas — warm off-white, the page */
--kt-bg-subtle:      #F6F4EE;   /* secondary surface — sidebar, sections */
--kt-bg-muted:       #EDEAE2;   /* row hover, pressed states */
--kt-bg-elevated:    #FFFFFF;   /* cards, modals, popovers (slight pop above paper) */
--kt-bg-inverse:     #0B0B0D;   /* dark wells inside light mode (Marcus quotes, terminals) */

/* Ink — foreground */
--kt-fg-1:           #0A0A0B;   /* primary text, headlines */
--kt-fg-2:           #3A3A3E;   /* secondary text, body */
--kt-fg-3:           #6B6B70;   /* tertiary, metadata, labels */
--kt-fg-4:           #A0A0A5;   /* disabled, placeholder, decorative */
--kt-fg-on-inverse:  #F5F4F1;   /* text on dark wells */

/* Lines */
--kt-border-1:       #E8E5DE;   /* hairline default */
--kt-border-2:       #D6D2C9;   /* input outline, stronger separator */
--kt-border-strong:  #0A0A0B;   /* heavy border — used only on focus, selection */

/* Accent — Ink-indigo */
--kt-accent:         #3D4FC4;   /* the one accent */
--kt-accent-hover:   #2F3FA8;
--kt-accent-soft:    #EAEDF9;   /* low-saturation fill for accent backgrounds */
--kt-accent-ink:     #2A3892;   /* accent at text contrast */

/* Warm secondary — used only for verified wins */
--kt-warm:           #C97863;   /* dusty clay */
--kt-warm-soft:      #F6E7E1;
--kt-warm-ink:       #8E4F3D;

/* Semantic */
--kt-success:        #3F7A5B;   /* deep moss */
--kt-success-soft:   #E4EEE7;
--kt-warning:        #A87E2F;   /* deep amber */
--kt-warning-soft:   #F4EBD6;
--kt-danger:         #9C3A2C;   /* deep clay-red */
--kt-danger-soft:    #F4DCD6;
```

### 2.2 Dark mode — Slate

```css
--kt-bg-base:        #0B0B0D;   /* primary canvas — deep ink, slightly warm */
--kt-bg-subtle:      #131316;   /* secondary surface */
--kt-bg-muted:       #1B1B1F;   /* row hover, pressed */
--kt-bg-elevated:    #1F1F23;   /* cards, modals (rise above the well) */
--kt-bg-inverse:     #FCFBF8;   /* paper wells inside dark mode (rare) */

--kt-fg-1:           #F5F4F1;
--kt-fg-2:           #BCBAB4;
--kt-fg-3:           #8A8884;
--kt-fg-4:           #56544F;
--kt-fg-on-inverse:  #0A0A0B;

--kt-border-1:       #232328;
--kt-border-2:       #2E2D31;
--kt-border-strong:  #F5F4F1;

--kt-accent:         #8B97E5;   /* lighter ink for dark backgrounds */
--kt-accent-hover:   #A4AEEC;
--kt-accent-soft:    #1A1D33;
--kt-accent-ink:     #C5CCF2;

--kt-warm:           #E89683;
--kt-warm-soft:      #2C1F1B;
--kt-warm-ink:       #F0B4A6;

--kt-success:        #6FA888;
--kt-success-soft:   #182621;
--kt-warning:        #D3A968;
--kt-warning-soft:   #2A2316;
--kt-danger:         #C6705F;
--kt-danger-soft:    #2A1A16;
```

### 2.3 Color usage rules

**Ink-indigo is earned, not decorative.** Use ink for:
- Active state (current tab, current sidebar item)
- Focus rings (always)
- Marcus's name when it appears in the chat (the system's signature)
- Links inside prose
- The confidence ring fill when above threshold
- Goal status "on track" indicator
- Selected approval card border

Do **not** use ink for:
- Primary button fills (primary button is black on light, white on dark)
- Icon defaults (icons are fg-2 or fg-3 by default)
- Page headers, section titles
- Decorative gradients (Kinetiks has no gradients)
- "Hero" splashes or marketing bling inside the app

**Warm clay** appears only when something is verified as good. The first time a goal hits target. The first time a sequence beats a benchmark. A celebratory moment in a daily brief. It should be rare. If users see it more than once a week, you are using it wrong.

**Semantic colors** carry information, not vibe. Success-green only when something genuinely succeeded. Warning-amber only when something genuinely needs attention. Danger-red only when something is broken or destructive. Never for emphasis.

**Status pills always pair color with a text label.** "Pending" "Approved" "At risk" — color alone never carries status.

---

## 3. Typography

### 3.1 Font stack

```css
--kt-font-serif: 'DM Serif Display', 'Recoleta', Georgia, 'Times New Roman', serif;
--kt-font-sans:  'Geist', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
--kt-font-mono:  'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
```

**Why these:**
- **DM Serif Display** for the voice. Sharp, classical, slightly literary. Reads like ink. Pairs with the Marcus character without becoming "AI mascot."
- **Geist** for UI. Engineered for developer tools. Neutral, legible at small sizes, excellent numerals. Same family Vercel uses.
- **Geist Mono** for data. Tabular figures. Crisp at table density.

Do not fall back to Inter. Inter is the generic SaaS font; the whole point of this system is to not look generic.

### 3.2 Type scale

App-density scale. The marketing site uses bigger sizes; the app caps at ~44px.

```css
--kt-fs-11: 11px;   /* mono labels, tertiary metadata */
--kt-fs-12: 12px;   /* eyebrow, table secondary, badge */
--kt-fs-13: 13px;   /* mono inline (codes, IDs) */
--kt-fs-14: 14px;   /* default UI text, table cells */
--kt-fs-15: 15px;   /* primary UI, navigation, body */
--kt-fs-17: 17px;   /* body in conversational surfaces (chat) */
--kt-fs-20: 20px;   /* card titles, section heads */
--kt-fs-24: 24px;   /* page titles (sans) */
--kt-fs-32: 32px;   /* major data display, key Analytics numbers */
--kt-fs-44: 44px;   /* hero serif moments (greeting, empty state, daily brief headline) */
--kt-fs-60: 60px;   /* marketing site only */
--kt-fs-80: 80px;   /* marketing site only */
```

### 3.3 Weight, leading, tracking

```css
--kt-fw-reg:  400;
--kt-fw-med:  500;
--kt-fw-semi: 600;
--kt-fw-bold: 700;

--kt-lh-display: 1.05;   /* serif display */
--kt-lh-tight:   1.2;    /* headings */
--kt-lh-snug:    1.35;   /* card titles, dense UI */
--kt-lh-body:    1.55;   /* default body */
--kt-lh-relaxed: 1.7;    /* chat messages, long-form */

--kt-tr-display: -0.02em;
--kt-tr-body:     0;
--kt-tr-eyebrow:  0.1em;
--kt-tr-mono:     0;
```

### 3.4 Typographic roles (strict)

Each role has one font. The system decides, not the developer.

| Role | Font | Size | Weight | Tracking | Example |
|---|---|---|---|---|---|
| **Voice display** | Serif | 44 | 400 | -0.02 | Marcus's greeting in a new chat, daily brief headline |
| **System name** | Serif | 17–24 | 400 | -0.01 | "Kit" or "Archer" — the user's chosen system name, wherever it speaks |
| **Page title** | Sans | 24 | 600 | -0.01 | "Identity" "Approvals" "Goals" |
| **Section title** | Sans | 17 | 600 | 0 | Within a page, grouping content |
| **Card title** | Sans | 15 | 500 | 0 | Approval card head, insight card head |
| **Body** | Sans | 15 | 400 | 0 | Default UI prose |
| **Body / chat** | Sans | 17 | 400 | 0 | Conversation messages (more relaxed for reading) |
| **Small / caption** | Sans | 13 | 400 | 0 | Metadata under titles |
| **Eyebrow** | Sans | 11 | 500 | 0.1em uppercase | Section overlines: `CONFIDENCE` `LAST UPDATED` |
| **Data — large** | Mono | 32 | 500 | 0 | KPI hero numbers in Analytics |
| **Data — table** | Mono | 14 | 400 | 0 | Every cell that is a number, ID, percent |
| **Data — inline** | Mono | 13 | 400 | 0 | Numbers inside prose, e.g. "you have 47 pending" |
| **Code / key** | Mono | 13 | 400 | 0 | API keys, IDs, slash commands |

**Rules:**
- Page titles are sentence case. Never "GOALS." Never "Goals — Cortex."
- Eyebrow labels are uppercase with 0.1em tracking. Use sparingly — they are signal, not decoration.
- Every numeric value in the product is **Geist Mono**. Open rate, deal value, day count, percentage, timer. No exceptions.
- The system name is **always serif**. When Kit speaks, Kit's name is set in DM Serif Display, no exceptions. This is how the user feels Kit's voice across every surface.

---

## 4. Space, radius, shadow, motion

### 4.1 Spacing scale

Base 4px. Use the scale; never invent intermediate values.

```css
--kt-s-1:   4px;
--kt-s-2:   8px;
--kt-s-3:  12px;
--kt-s-4:  16px;   /* default gutter inside a card */
--kt-s-5:  24px;   /* default gutter between cards */
--kt-s-6:  32px;
--kt-s-7:  48px;
--kt-s-8:  64px;
--kt-s-9:  96px;
--kt-s-10:128px;
```

App-level inner padding: 24–32px. Card padding: 16–20px. Tight stacked rows: 12px. Generous list items: 16px.

### 4.2 Radii

```css
--kt-radius-0:    0px;     /* table cells, hairline-style splits */
--kt-radius-1:    6px;     /* default — buttons, inputs, badges */
--kt-radius-2:   10px;     /* cards, modals, popovers */
--kt-radius-3:   14px;     /* the floating pill, hero panels */
--kt-radius-full: 9999px;  /* chips, pills, avatar, status dots */
```

### 4.3 Shadows — almost invisible

Kinetiks separates surfaces with **tone**, not with elevation. Shadows exist for popovers and modals only.

```css
/* Light mode */
--kt-shadow-xs: 0 1px 2px rgb(10 10 11 / 0.04);
--kt-shadow-sm: 0 4px 14px rgb(10 10 11 / 0.06);
--kt-shadow-md: 0 16px 36px rgb(10 10 11 / 0.08);
--kt-shadow-lg: 0 32px 72px rgb(10 10 11 / 0.12);

/* Dark mode */
--kt-shadow-xs: 0 1px 2px rgb(0 0 0 / 0.4),  inset 0 0 0 1px rgb(255 255 255 / 0.02);
--kt-shadow-sm: 0 4px 14px rgb(0 0 0 / 0.45), inset 0 0 0 1px rgb(255 255 255 / 0.03);
--kt-shadow-md: 0 16px 36px rgb(0 0 0 / 0.55), inset 0 0 0 1px rgb(255 255 255 / 0.04);
--kt-shadow-lg: 0 32px 72px rgb(0 0 0 / 0.7),  inset 0 0 0 1px rgb(255 255 255 / 0.05);
```

Dark-mode shadows use a faint inner ring of white at very low opacity — this is what gives elevated surfaces in dark mode their gentle "lift" without crushing them in black.

### 4.4 Motion

Motion is calm and short. The product does not bounce, swoosh, or spring. It glides.

```css
--kt-dur-1: 120ms;   /* micro — color, opacity, single-property */
--kt-dur-2: 200ms;   /* default — most transitions */
--kt-dur-3: 320ms;   /* drawers, modals, sidebar collapse */
--kt-dur-4: 600ms;   /* theme switch crossfade */

--kt-ease-standard: cubic-bezier(0.22, 0.61, 0.36, 1);
--kt-ease-emphasis: cubic-bezier(0.32, 0.72, 0, 1);
--kt-ease-linear:   linear;
```

**Motion rules:**
- Theme switch is a 600ms crossfade. Never a flash, never a hard cut.
- Drawers and modals: 320ms slide + fade with `--kt-ease-emphasis`.
- Streaming chat messages: token-by-token render with `prefers-reduced-motion` opt-out.
- Hover states: 120ms color/opacity transitions only. No scale, no shadow lift.
- Confidence ring updates: 320ms ease.
- Page transitions: none. The tab swap is instant.
- **All motion respects `prefers-reduced-motion`.** Reduce to opacity-only.

### 4.5 Layout

```css
--kt-app-tabbar-h:      48px;        /* top tab bar height */
--kt-app-sidebar-w:    260px;        /* chat sidebar, cortex subnav */
--kt-app-sidebar-w-sm:  64px;        /* collapsed sidebar */
--kt-app-content-pad-x: 32px;        /* horizontal padding inside main */
--kt-app-content-pad-y: 24px;
--kt-content-max-w:    920px;        /* max width for long-form (chat, ledger) */
--kt-content-max-w-lg: 1280px;       /* analytics, cortex layer detail */
```

---

## 5. Application shell

### 5.1 Three-tab shell (the canonical layout)

```text
+----------------------------------------------------------------+
|  Kinetiks  |  Chat  Analytics  Cortex            ⌘K   ☾   Av  |   <- 48px top bar
+------------+---------------------------------------------------+
|            |                                                   |
|  Threads   |   Main content area                               |
|            |                                                   |
|  approvals |                                                   |
|  toggle    |                                                   |
|            |                                                   |
+------------+---------------------------------------------------+
```

**Top bar (48px):**
- Left: wordmark "Kinetiks" in Geist 14 / weight 500. No logo mark inside the app. The wordmark IS the brand here.
- Center: three tabs — *Chat · Analytics · Cortex* — in Geist 14 / weight 500. Active tab has an ink-indigo 1px underline (2px from baseline). Inactive tabs are fg-3, hover lifts to fg-1.
- Right cluster:
  - `⌘K` command palette indicator — Geist Mono 12, fg-3, in a 1px-bordered pill
  - Theme toggle — sun / moon glyph, fg-3
  - Avatar — 28px circle, opens settings modal on click

The top bar sits on `--kt-bg-base` with a 1px `--kt-border-1` bottom border. No shadow. Never a background color shift.

### 5.2 Chat shell

The Chat tab has a left sidebar (260px) that toggles between two panels:

**Threads panel (default):**
- New chat button (full-width, ghost, ink-indigo text + plus glyph) — `--kt-s-2` from the top
- Search input (full-width, ghost variant)
- Thread list — title (sans 14 / weight 500), last message preview (sans 13 / fg-3, 1 line truncate), timestamp (mono 11 / fg-3). Active thread: `--kt-bg-muted` background, no border. Hover: `--kt-bg-subtle`.
- Pinned threads section above the rest, separated by 1px line.

**Approvals panel (toggled):**
- Header with count: serif 17 + mono count pill (e.g. "Approvals 7")
- Sorted by type: Strategic → Review → Quick
- See § 7.2 for approval card spec

**Toggle:** a 2-segment pill at the top of the sidebar (`[ Threads | Approvals ]`). 1px border, 6px radius, fg-3 inactive, fg-1 active with `--kt-bg-base` segment fill.

**Main area (Chat):**
- Max-width: `--kt-content-max-w` (920px), centered with auto margins
- Messages: see § 6.4
- Input dock at the bottom: `--kt-bg-base` with 1px top border. Input itself is a single textarea with auto-grow (max 6 lines before scroll), 17px Geist body, no visible border in default state. Slash glyph `/` indicator on the left at fg-4. Send button (mono 13, fg-3, hover fg-1) on the right.
- Suggestion chips: 4 max, scroll horizontally if needed. Chip = 1px border, 6px radius, 12px h-padding, 28px height, sans 13 fg-2. Hover: `--kt-bg-muted`. They disappear on first keystroke.

### 5.3 Analytics shell

Full-width, no sidebar. Sections stack vertically:

1. **Goals overview** — top, full width
2. **Active insights** — Oracle's findings
3. **GTM funnel** — unified cross-app view
4. **App performance** — per-app KPI cards
5. **Trend charts**
6. **Attribution**
7. **Budget**

Each section has an eyebrow label, an optional inline "view more →" link to the relevant Cortex page, and `--kt-s-7` (48px) of vertical breathing room between sections. Content max-width `--kt-content-max-w-lg` (1280px), centered, padded by `--kt-app-content-pad-x`.

### 5.4 Cortex shell

Left sub-nav (260px, same chrome as the Chat sidebar):
- **Identity** — Context Structure layers (8)
- **Goals** — OKRs + KPI targets
- **Budget** — pacing, allocations, approvals history
- **Integrations** — connected apps, external tools
- **Ledger** — Learning Ledger timeline

Each sub-nav item: sans 14 / weight 500, fg-3 default, fg-1 hover, fg-1 + ink-indigo left-bar (2px) on active. No icons in the sub-nav — labels only. Cortex is precision; chrome stays out of the way.

### 5.5 Settings modal

Single full-screen overlay (not a drawer). 80vh × 920px max-width, centered, `--kt-bg-elevated`, `--kt-radius-2`, `--kt-shadow-lg`. Backdrop: rgb(10 10 11 / 0.4) in light, rgb(0 0 0 / 0.6) in dark.

Left rail of the modal (200px): Account · Organization · Billing · API Keys · Notifications · Team · Danger Zone. Same active-item treatment as Cortex sub-nav.

Closes on Esc, backdrop click, or X (top-right, 32×32 hit target).

---

## 6. Component library

All components live in `@kinetiks/ui`. No app implements its own button, its own input, its own card. If a new component is needed, it goes into the shared package.

### 6.1 Button

Three tiers + two flavors. No more.

**Tiers:**
- `primary` — fg-1 fill, bg-on-fg-1 text (black-on-paper, white-on-slate). The single most important action on a surface. Maximum one primary button per visible section.
- `secondary` — 1px border-2 outline, transparent fill, fg-1 text. The "also valid" actions.
- `ghost` — no border, no fill, fg-2 text. The "do this if you want" actions. Hover lifts to `--kt-bg-muted`.

**Flavors:**
- `accent` — used only on the Approve button in approval cards, and the streaming-stop control in chat. Ink-indigo fill, white text. One per workflow at most.
- `danger` — bordered, danger-red text. Reject, Kill task, Delete. Confirmation required.

**Sizes:**
- `sm` — 28px height, 12px h-padding, sans 13 weight 500
- `md` (default) — 36px height, 16px h-padding, sans 14 weight 500
- `lg` — 44px height, 20px h-padding, sans 15 weight 500

**Radius:** `--kt-radius-1` (6px).
**Hover:** background tone shift via `--kt-bg-muted`. No translate, no scale, no shadow add.
**Active:** fg darkens to fg-1; ghost gets a `--kt-bg-muted` press.
**Focus-visible:** 2px ink-indigo ring at 2px offset.
**Disabled:** opacity 0.4, cursor not-allowed, no hover state.

### 6.2 Input, textarea, select

- 36px default height, `--kt-radius-1`, 1px `--kt-border-2`
- Background: `--kt-bg-elevated` (light) / `--kt-bg-subtle` (dark)
- Text: 14px sans, fg-1
- Placeholder: fg-4
- Focus: 1px border swaps to `--kt-accent` and a 3px `--kt-accent-soft` outer ring
- Error: 1px `--kt-danger` border, helper text in danger color below
- Label above the input: 12px sans weight 500, fg-2, 6px gap
- Help text below: 12px sans, fg-3, 6px gap

Textareas: auto-grow within a sensible max-height (typically 200px). Same border + focus treatment.

Selects use a native trigger styled identically to inputs, with a custom popover (`--kt-bg-elevated` + `--kt-shadow-md`). Options on hover: `--kt-bg-muted`.

### 6.3 Card

The atomic container for almost everything.

- Background: `--kt-bg-elevated` (light) / `--kt-bg-subtle` (dark)
- Border: 1px `--kt-border-1`
- Radius: `--kt-radius-2` (10px)
- Padding: 20px default; 16px for dense lists
- Shadow: none by default. `--kt-shadow-xs` only when the card is genuinely above the page (e.g. dragged, focused for keyboard nav).
- Hover (for clickable cards only): border shifts to `--kt-border-2`, no other change.

### 6.4 Chat message

User messages: right-aligned column, max-width 580px, `--kt-bg-muted` bubble, 14px h-padding, 10px v-padding, `--kt-radius-2`, 15px sans body.

System messages (Marcus / Kit / Archer / whatever the user named it):
- Left-aligned, full-width column, **no bubble** — the system writes on the page, the user writes in a bubble
- System name header: serif 17, fg-1, with a tiny mono timestamp 11/fg-3 inline-right
- Body: 17px sans body, `--kt-lh-relaxed` (1.7), fg-1
- Action cards, data tables, mini-charts, and approval cards render inline beneath the body when present
- Streaming responses: a 2px-wide blinking ink cursor at end-of-text during generation, replaced by the timestamp on complete

This is one of the most important design decisions in the product. **The system writes prose; the user types in a box.** The asymmetry communicates the relationship — Marcus is your advisor, not a peer chat partner.

### 6.5 Pill, chip, badge

- **Pill (status)** — `--kt-radius-full`, 22px height, 8px h-padding, 11px sans weight 500. Color is paired text + soft background: e.g. "On track" → fg `--kt-success`, bg `--kt-success-soft`. Always a text label, never color alone.
- **Chip (interactive)** — `--kt-radius-1` (6px), 28px height, 12px h-padding, sans 13 fg-2. Used for filters, suggestion chips, tags. Active state: 1px ink-indigo border + fg-1 text.
- **Badge (count)** — `--kt-radius-full`, 18px min-width, 18px height, mono 11 weight 500, `--kt-bg-muted` bg + fg-1 text. For approval counts, unread indicators, etc.

### 6.6 Table

Tables are the primary surface in Cortex and parts of Analytics. They must feel calm even with 50 rows on screen.

- Cell padding: 12px vertical, 16px horizontal
- Cell height: 44px default, 36px dense
- Row separator: 1px `--kt-border-1` between rows, none at the table edges
- Header row: eyebrow style (11px sans weight 500 uppercase 0.1em tracking, fg-3). Bottom border 1px `--kt-border-2`.
- Sortable header: arrow glyph appears on hover at fg-4, fg-1 when sorted
- All numeric cells: Geist Mono 14, right-aligned
- All text cells: Geist sans 14, left-aligned, fg-1 primary content / fg-3 metadata in same cell beneath
- Row hover: `--kt-bg-subtle` background
- Selected row: `--kt-bg-muted` background, 2px ink-indigo left bar inside the row (not on the table edge)

No striping. No vertical column borders. The table is held together by alignment, not by lines.

### 6.7 Modal, drawer, popover

- **Modal** — full overlay, centered, `--kt-bg-elevated`, `--kt-shadow-lg`, `--kt-radius-2`. Closes on Esc / backdrop / X. Used for: settings, confirmation, edit forms that need focus.
- **Drawer** — slides from the right, 480px width, full-height, `--kt-bg-elevated`, 1px `--kt-border-1` on the left edge, `--kt-shadow-md`. Used for: candidate detail, deal detail, layer detail. Cmd+. closes.
- **Popover** — small floating panel, `--kt-bg-elevated`, `--kt-shadow-sm`, `--kt-radius-2`, max-width 320px. Used for: select options, command palette autosuggest, profile menu.

All three: 320ms slide+fade with `--kt-ease-emphasis`. Reduced-motion: opacity only.

### 6.8 Confidence ring

The visual signature of the platform. Used wherever autonomy is shown.

- SVG circle, 1.5px stroke
- Track: `--kt-border-1`
- Fill arc: `--kt-accent` for `score >= threshold`, `--kt-fg-2` for below threshold, `--kt-warning` if "earning back" (post-trust-contraction), `--kt-danger` if recently rejected
- Center label: Geist Mono, weight 500
  - sm (24px ring) — no center label
  - md (40px ring) — 12px center value, e.g. "67"
  - lg (72px ring) — 24px center value + 11px eyebrow below ("CONFIDENCE")
  - xl (120px ring) — 44px center value, 11px eyebrow ("CONTEXT" or "AUTONOMY")
- Animates ring-fill on value change with 320ms ease-standard

This component appears in: Approvals (next to confidence score on every action), Cortex Identity (one big ring for overall confidence + 8 small rings for layers), Cortex Goals (progress ring per goal), Analytics (goal status rings).

### 6.9 Floating pill

The cross-app signature. Used in standalone suite apps (Harvest, Dark Madder, etc.) to surface Kinetiks presence.

Collapsed state:
- Single-line capsule, `--kt-radius-3` (14px), `--kt-bg-elevated`, 1px `--kt-border-1`, `--kt-shadow-sm`
- Anchored to bottom-center, 24px from the bottom edge, never docked
- Contents (left to right): system name (serif 14 / fg-1), separator dot (mono · / fg-4), current state (sans 13 / fg-2, e.g. "idle" "thinking" "building sequence")
- Right side: optional action affordance (sans 13 / fg-3, hover fg-1)
- 32px tall, 16px h-padding

Expanded state:
- Grows upward, same radius, into a small panel up to 360px tall
- Shows full task plan (multi-step), progress, kill button (danger flavor), elapsed time

Animation: 320ms ease-emphasis on expansion/collapse.

---

## 7. Composite patterns

### 7.1 Chat — the canonical surface

Chat is *the* product. Every interaction should feel like a calm, ongoing conversation with a careful advisor.

**Empty-thread (greeting) layout:**
- Serif 44 / weight 400 / `--kt-tr-display`: the system name's greeting line, e.g. *"Good morning, Zack."*
- Below, in 17 sans / fg-2 / `--kt-lh-relaxed`: a 2–4 sentence calibration block — Cortex confidence summary, active apps, what's ready to do today
- Below that: 3–4 suggestion chips
- Below that: the input dock

**Active-thread layout:**
- Messages stack top→bottom
- 32px between message blocks
- The thread auto-titles after 2–3 exchanges (Marcus runs the titler) — title shown in the thread list, never inside the thread itself

**Rich inline components inside system messages:**
- Action card — see § 7.4
- Data table — see § 6.6 (shrunk to inline scale: max-height 320px, scroll inside)
- Mini-chart — sparkline or bar, 240×60 default, mono labels
- Approval card — see § 7.2
- Progress block — animated, shows step labels in sans 13 with a mono percentage on the right
- Expandable section — `> Show details` styled as a ghost button, expands to inline content

### 7.2 Approval card

Three variants — quick, review, strategic — all share the same skeleton.

**Skeleton:**
```text
+--------------------------------------------+
| [App badge]    [Type label]       [⏱ 2h]  |   <- 12px sans / fg-3
|                                            |
| Quick approval: send follow-up to Jane...  |   <- 15px sans / fg-1 / weight 500
|                                            |
| [Preview content area — variant-specific]  |
|                                            |
| [Confidence: ring 24px]  [Threshold: 85]   |   <- mono 12 / fg-3
|                                            |
| [Reject]                  [Approve]        |   <- sm buttons
+--------------------------------------------+
```

- Card chrome: `--kt-bg-elevated`, 1px `--kt-border-1`, `--kt-radius-2`, 16px padding
- App badge: small color tag (left edge of the card, 2px wide × full height, in the app's signature color — see § 10.2)
- Type label: eyebrow style, "QUICK" / "REVIEW" / "STRATEGIC"
- Preview:
  - **Quick:** full content rendered inline (the email, the post, the change)
  - **Review:** a 4-line preview with a "show full →" expand
  - **Strategic:** a structured summary block with key fields, plus an expandable detail section. Always includes the agent's reasoning for the proposed action.
- Approve button: `accent` flavor, `sm` size
- Reject button: `ghost` with `danger` text, `sm` size; click reveals a 60px-tall reason field that must be filled before confirming
- Edit affordance for review/strategic: an inline "Edit" link (sans 13 / `--kt-accent`) opens the content for direct editing in the card

**Selected state:** 2px ink-indigo left border, no other change.

### 7.3 Cortex layer view (Identity)

The Context Structure has 8 layers. Each layer has its own page (Cortex > Identity > [Layer]).

**Layer index page:**
- Eyebrow: `CONTEXT STRUCTURE`
- Page title: "Identity"
- Sub: "8 layers · {overall_confidence}% confidence" — confidence in mono
- Below: an 8-card grid (2 columns desktop), each card showing one layer:
  - Layer name (sans 17 / weight 500)
  - One-line description (sans 13 / fg-3)
  - Confidence ring (md, 40px)
  - Field count (mono 12, fg-3): "12 / 18 fields"
  - Last updated (mono 11, fg-3)
  - Click → layer detail page

**Layer detail page:**
- Header with breadcrumb, page title (layer name), and the layer's confidence ring (lg, 72px) inline on the right
- Two-column body: fields list on the left (Cortex's primary data shape), provenance + history on the right
- Field rows: label (eyebrow style), value (sans 15 fg-1 if user-entered, sans 15 fg-2 if proposal-derived), source pill (mono 11), confidence dot (4px circle in success/warning/danger), last-changed timestamp (mono 11 fg-3)
- Edit affordance per field: ghost icon button, opens inline editor — never a separate page
- A right rail shows recent proposals affecting this layer, the last 10 ledger entries scoped to it, and a "Marcus knows this about you" summary card (serif 17 quote from Marcus's own brief, in italic)

### 7.4 Analytics — insight card

The Oracle's findings. The single most important atomic unit on the Analytics tab.

```text
+-------------------------------------------------+
| [Icon]   ANOMALY                       [Dismiss]|
|                                                 |
| Reply rates dropped 32% week-over-week         |
| on the fintech sequence                         |
|                                                 |
| [Mini-chart: 14-day sparkline]                  |
|                                                 |
| Three changes happened on Tuesday: subject     |
| line variant B, sender rotation, new...         |
|                                                 |
| Most likely cause: sender rotation (87%).       |
|                                                 |
| [Goals: pipeline target] [Act on this →]        |
+-------------------------------------------------+
```

- Type label: eyebrow style with a single-color glyph (`ANOMALY` `TREND` `CORRELATION` `OPPORTUNITY`). Glyph color from semantic palette — anomaly is warning, opportunity is accent, trend is fg-2, correlation is fg-2.
- Title: sans 17 / weight 500 / fg-1
- Mini-chart: optional, max 300×80
- Body: sans 14 / fg-2 / `--kt-lh-body`
- Recommendation line: sans 14 / fg-1, lifted above the action row
- Goal badges: small chips (see § 6.5) showing which goals are affected
- "Act on this" → opens Chat with the recommendation prefilled as a draft command (the user can edit before sending)
- "Dismiss" — ghost danger, requires no confirmation, logs to Ledger

### 7.5 Goal card

```text
+-------------------------------------------+
| [Status pill]                              |
|                                            |
| Pipeline target — Q2                       |   <- sans 17 weight 500
| 2,400,000 of 4,000,000                     |   <- mono 24 fg-1
|                                            |
| [Progress ring 72px lg]                    |
|                                            |
| [Sparkline 28-day trend]                   |
|                                            |
| Top lever: increase fintech sequence       |   <- sans 13 fg-2
| volume by 30%                              |
|                                            |
| [Adjust →]                                 |
+-------------------------------------------+
```

Goal status pill: "On track" / "Behind" / "Ahead" / "At risk" / "Critical" — paired color + label per § 6.5.

### 7.6 Empty states

Never blank. Never a stock illustration. The empty-state pattern across the app:

- Centered column, max 480px
- Serif 24 / weight 400 — a single declarative sentence ("Nothing pending right now.")
- Sans 15 / fg-3 — a one-liner explaining what should appear here ("Marcus surfaces approvals here as they are generated.")
- One ghost button — a useful next action ("Adjust autonomy thresholds" / "Connect Dark Madder")

No icons in empty states. The serif sentence carries the moment.

---

## 8. Marcus / system voice in the UI

The user names their system at setup ("Kit," "Archer," "Sam," anything). That name is what they see — never "Marcus." The internal engine name does not surface.

### 8.1 Where the system name appears

- The chat greeting (serif 44)
- The chat sidebar header ("Talk to Kit")
- The floating pill across all suite apps (serif 14)
- The system message header in chat (serif 17)
- The system's email signature
- The system's Slack handle (e.g. @kit)
- The empty-state copy on day-one onboarding ("Kit is learning your business")

### 8.2 Voice rules (link, do not duplicate)

The system's *linguistic* voice is governed by `marcus-conversation-quality-plan.md` and `marcus-engine-v2-plan.md` (the persona prompt). The UI must surface that voice faithfully:

- Never write UI copy that contradicts the stoic voice. Toast messages, button labels, empty states, all of them follow the same posture: declarative, no exclamation marks, regular dashes, no filler.
- The system's name in UI is *always* serif. The system's *body text* in chat is sans (the serif sentence is too dense for paragraphs).
- When the system declines or flags a data gap, the message uses the same calm posture as the prompt rules — never apologetic, never "sorry," never softening with emoji.

### 8.3 The "Marcus quote" pattern

In Cortex Identity, on a layer detail page, the right rail shows a small card titled `KIT KNOWS THIS`. Inside is a single italic serif sentence — Marcus's own summary of what he understands about that layer.

Example: *"You sell to seed-stage founders who already have a marketing hire in their next two quarters."*

This pattern (serif italic, 17px, fg-1, in a low-key card) appears wherever the system is reflecting back what it has learned. It is one of the few places where Marcus speaks beyond chat. Use it sparingly.

---

## 9. Confidence and autonomy

Confidence is the platform's emotional core. The UI must make the trust relationship between human and system *tangible* — never hidden, never performative.

### 9.1 The ring as the universal visual

The confidence ring (§ 6.8) appears wherever the system is showing how sure it is.

- Approval card — 24px ring next to the score
- Cortex Identity — 72px ring on each layer page, 120px hero ring on the index page
- Goals — 72px ring on the goal card
- Floating pill (expanded) — 24px ring next to the current task

### 9.2 Threshold visualization

When a confidence score sits below threshold, the ring fill is `--kt-fg-2` (achromatic) and the threshold marker is a single 2px tick on the ring at the threshold position. When the score crosses the threshold, the fill turns ink-indigo and the tick fades to fg-4. This is the moment of "earned autonomy" — visually subtle but legible.

### 9.3 Trust contraction visualization

After a rejection or a kill signal, the affected category's threshold rises. The ring fill becomes `--kt-warning` (amber) for the next batch of actions in that category until 5 consecutive approvals restore it to ink. The user sees the system *re-earning trust* visually. No text needed.

---

## 10. Suite app coherence

### 10.1 Per-app identity within the system

Each suite app keeps a small color signature. The signature is a single 2px-wide accent strip on app-specific surfaces (the left edge of an approval card from that app, the floating pill's app-active glyph, the integrations card border). Otherwise the app uses the full Kinetiks token system without modification.

**App signatures (the *only* place an app diverges from neutral):**

| App | Signature | Where it shows |
|---|---|---|
| Kinetiks Core | `--kt-accent` (ink-indigo) | Wordmark, the avatar default ring |
| Harvest | `#3F7A5B` (deep moss — same as success) | Approval card edge, pill glyph |
| Dark Madder | `#9C3A2C` (deep clay — same as danger color) | Approval card edge, pill glyph |
| Hypothesis | `#A87E2F` (deep amber — same as warning) | Approval card edge, pill glyph |
| Litmus | `#5A6F8C` (slate blue) | Approval card edge, pill glyph |
| Ads | `#7D5C8E` (muted plum) | Approval card edge, pill glyph |
| Adventure | `#C97863` (warm clay — secondary accent) | Approval card edge, pill glyph |

These are *the same hues already in the semantic palette*. No new colors. Each app simply borrows one of the existing system colors as its signature.

### 10.2 Suite app shell

Standalone suite apps (Dark Madder, Harvest, etc.) use the same token system, the same shell pattern, the same components. Their internal navigation differs by product domain, but the chrome they sit inside is identical to Kinetiks Core. A user moving from Harvest to Dark Madder to Kinetiks Core sees coherent surfaces.

The **floating pill** is the visible thread. It carries the system name across apps in serif, and its color glyph shifts to the active app's signature when the system is doing work inside that app.

---

## 11. Light / dark mode mechanics

### 11.1 The toggle

Single source: a sun/moon glyph in the top bar, fg-3 default. Click toggles between three states: `light` → `dark` → `system`. The active state shows the current resolved theme; a tiny mono 11 caption under the toggle on hover shows the mode label.

State is persisted to the user's profile in Supabase (not localStorage) so it follows the user across devices. On first visit, default to `system`.

### 11.2 The mechanic

```css
:root {                          /* light variables */ }
:root[data-theme="dark"] {       /* dark variables */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* dark variables */ }
}
```

Switch behavior:
- Apply theme change at the `<html>` element
- The whole document crossfades over 600ms via a `transition` on `background-color` and `color` at the root
- All component-level color properties also have a `--kt-dur-2` (200ms) transition for the secondary surfaces

### 11.3 Mode-specific tweaks

A small number of components ship with subtle dark-mode-only treatment:
- Card has a faint inset 1px white-at-3% ring in dark mode for "lift"
- Mono text gets 95% letter opacity in dark mode to soften the data layer
- Shadows use deeper blacks + the inset ring (see § 4.3)
- Charts: line strokes are 1.5px in dark mode vs 1px in light, to read at distance

### 11.4 Perception parity test

For every page, screenshot both modes and put them side by side. Ask:
- Does the information hierarchy hold in both?
- Are the same elements legible in both?
- Does each mode feel *intentional*, or does one feel like a forced inversion?

If a mode feels like a derived afterthought, the answer is to retune that mode's surface tones, not to live with it.

---

## 12. Accessibility

- All interactive elements have visible focus states (2px ink-indigo ring at 2px offset).
- Color contrast: WCAG AA minimum. Body text ≥ 4.5:1, large text ≥ 3:1. The token system meets this; ad-hoc colors do not exist.
- Status is **never** conveyed by color alone — every status pill pairs color with a text label.
- Reduced motion: respect `prefers-reduced-motion`. Drawer/modal slides reduce to opacity. Streaming chat continues as token-by-token but without the cursor blink.
- Semantic HTML first. `<button>` for actions, `<a>` for nav. No clickable divs.
- Keyboard: full app navigable. `Cmd+1/2/3` switches tabs. `Cmd+K` opens command palette. Esc closes everything that can close.
- Screen readers: `aria-busy` on loading regions, `aria-current` on active nav, `aria-pressed` on toggles. Live regions on streaming chat (`aria-live="polite"`).
- Form errors: inline, in danger color, with both the icon and the text. Never just a red border.

---

## 13. Anti-patterns

Do not ship any of these.

- **Purple / teal anywhere.** The old `#6C5CE7` and `#00CEC9` are gone. They never appear in this codebase again.
- **Gradients.** Kinetiks has no gradients. Surfaces are flat. Charts are flat fills.
- **Generic SaaS card grids.** A 3×3 grid of identical "feature" cards is a sign of bad information design. Cards earn their place.
- **Icon-driven navigation in primary chrome.** The top tabs are words. The Cortex sub-nav is words. Icons are decoration, not navigation.
- **Bright primary buttons.** The primary button is fg-1, not ink-indigo. Ink is for what you *read*, not what you *click*.
- **Inter as the body font.** Geist or fall through to the system stack — never Inter.
- **Drop shadows for decoration.** Shadows separate popovers from the page. They do not "add depth" to cards.
- **Dark mode as inverted light mode.** Dark mode is composed separately. If a screen in dark mode feels like a CSS filter, retune it.
- **Toast spam.** Toasts are for actions the system took on the user's behalf and for which "undo" is meaningful. Not for "saved" or "loaded."
- **Loading spinners on page content.** Skeletons. The only spinner allowed is on the send button when a chat message is being delivered to the API.
- **Filler microcopy.** "Great work!" "Awesome!" "You're crushing it!" — none of this exists. Marcus's voice is stoic; the UI's voice matches.

---

## 14. What this changes

- **CLAUDE-v2.md § Design System** — replace the entire block with: *"See `kinetiks-design-spec.md`. Tokens implemented in `kinetiks-tokens.css` in `@kinetiks/ui`."*
- **Harvest_Design_UX_Spec.md** — superseded in full. Harvest still keeps its product personality (the cultivator metaphor in language, the operator names, etc.), but its visual system is now this document. The Harvest signature color is moss-green per § 10.1.
- **Dark Madder design language** — same. Dark Madder keeps the research-lab personality in copy, names, and product surfaces, but draws from this token system. Signature color is deep clay per § 10.1.
- **The `@kinetiks/ui` package** — should be rebuilt against this spec. Every component lives here. Every app imports from here. No app implements its own primitives.
- **The Floating Pill** — already lives in `@kinetiks/ui`. Update to the spec in § 6.9.

---

## 15. Implementation order

If you are starting a phased migration from the old system to this one:

1. **Drop `kinetiks-tokens.css` into `packages/ui/styles/`.** Import it at the root of every app's layout.
2. **Wire the theme switcher.** Add `data-theme` to `<html>`, store the preference, default to system.
3. **Replace base typography.** Load DM Serif Display, Geist, Geist Mono. Remove every other font load. Set `body { font-family: var(--kt-font-sans); }`.
4. **Rebuild Button, Input, Card, Pill, ConfidenceRing in `@kinetiks/ui`.** These are the most-used atoms; getting them right cascades.
5. **Rebuild the app shell** — three-tab top bar, sidebar pattern, settings modal — using the new tokens.
6. **Page by page,** replace hardcoded colors and fonts with tokens. The screenshot test gates every PR.
7. **Audit the screenshot test on every page in light and dark.**

A coding agent should never write a hardcoded color, font-family, or pixel spacing value in a component. If a value is needed that doesn't exist in tokens, the token system gets extended *here first*, then used.

---

## 16. Collaborative workspace floating bars

The collaborative workspace (`docs/collaborative-workspace-spec.md` §16) introduces a floating-bar visual language: the task drawer, agent-action toasts (success+Undo / warning / error+Retry / info), the thread-switch warning, the bulk-action bar, and the in-panel approval overlay. These are all `@kinetiks/ui` primitives sharing the `.kt-floating-bar` base in `packages/ui/styles/primitives.css` — pill-shaped, elevated by shadow (no hard border), icon + label + action anatomy, red **text** (never a red fill) for destructive actions, dark-filled primary for Approve/Upgrade. Persistent bars dismiss with an X on the left; transient toasts with an X on the right.

### 16.1 D7 — resolved color note (agent-action "success")

`collaborative-workspace-spec.md` §16.6 names teal `#00CEC9` as the agent-success icon color. **That hex is superseded.** The canonical success token is **`--kt-success`** (the teal palette was retired per §14 of this spec), and the agent-success toast — like every floating element — references `--kt-*` tokens only. There are **no hardcoded hex values** in the floating-bar system; the spec's `#00CEC9` is an aspirational reference, and the token system wins. (Program decision D7.)

---

*End of Kinetiks Design Spec v1.0.*
