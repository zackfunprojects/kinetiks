> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: ux/design-language.md (new DM UX design; salvage is the new design's call)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# 10 - UI & Brand

## Design System, Visual Identity & Component Language

**System:** Dark Madder
**Purpose:** The visual and experiential identity of the product

---

## 1. Brand Origin

The name "Dark Madder" carries three layers.

**Madder** is one of the oldest pigments in human history. Extracted from the roots of the Rubia tinctorum plant, madder lake was the red of the ancient world. Cloth dyed with madder root was found in the tomb of Tutankhamun. The Egyptians invented the technique of producing a lake pigment from it around 1500 BC. It colored the burial wrappings of pharaohs, the walls of Pompeii, and the red coats of the British army. Alchemists, dyers, and early chemists all worked with it. It sits at the intersection of nature, chemistry, and craft - ancient knowledge refined through experimentation.

**Dark Madder** is also a specific pigment well known to oil painters - a deep, almost black-red that lives at the bottom of the value scale. It's the color that appears when madder lake is concentrated to its darkest form. Rich, saturated, and heavy. The color of dried blood on parchment. The color of knowledge that cost something to obtain.

**The personality** is the mad scientist crossed with the dark arts. Not evil - obsessive. The alchemist in the tower surrounded by manuscripts and bubbling flasks, running the same experiment for the hundredth time because the formula isn't perfect yet. The sorcerer's workshop where everything is meticulously organized but looks chaotic to outsiders. There is an intensity to it. A sense that the system knows things and is always working, always refining, always running calculations in the background.

Think: the mad hatter's precision disguised as eccentricity. Merlin's ancient knowledge made operational. Dark matter - the invisible force that holds the visible universe together.

---

## 2. Brand Personality

### Voice (the product itself, not the content it produces)

- **Obsessive precision.** Dark Madder treats content like a chemist treats a compound. Every element matters. Every measurement is intentional.
- **Quiet intensity.** The interface doesn't shout. It hums. There is an undercurrent of power - the system is always working, always analyzing, always improving.
- **Earned confidence.** Dark Madder doesn't tell you it's good. The output speaks for itself. The system shows you its work (voice match scores, drift metrics, learning curves) without bragging.
- **Dark humor in the margins.** Loading states, empty states, and microcopy can have personality - a wry, slightly ominous wit. "Brewing the draft..." "The formula is refining..." "Your voice profile is sharpening." Never corny. Never forced.

### What Dark Madder Is Not

- Not sterile. This isn't a corporate SaaS dashboard. It has texture, warmth (in the dark sense), and character.
- Not playful. This isn't Notion or Figma. There are no pastel colors, no bouncy animations, no waving hand emojis.
- Not intimidating. The dark arts aesthetic should feel like being let into the workshop, not locked out of it. Powerful but accessible.

---

## 3. Color System

### The Palette

The color system is built around darkness with a single, potent accent. Content is the only thing that gets to be bright. Everything else recedes.

#### Background Scale (Dark Greys)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-void` | `#050506` | Page background, the deepest layer |
| `--bg-base` | `#0A0A0B` | Primary surface, main content area |
| `--bg-surface` | `#111113` | Cards, panels, elevated surfaces |
| `--bg-elevated` | `#1A1A1D` | Modals, dropdowns, hover states on cards |
| `--bg-subtle` | `#222225` | Active states, selected items, input fields |
| `--bg-muted` | `#2A2A2E` | Borders between sections, divider lines |

These are not pure blacks. They have a faint warm undertone (the very slight shift toward red-brown in the low digits) that keeps the darkness from feeling cold or clinical. This is an alchemist's workshop, not a server room.

#### Text Scale

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#F5F5F5` | Primary content, headings, body text |
| `--text-secondary` | `#A1A1AA` | Secondary labels, descriptions, metadata |
| `--text-tertiary` | `#6B6B76` | Disabled text, placeholders, timestamps |
| `--text-ghost` | `#3E3E47` | Barely visible hints, background texture text |

#### Accent: Dark Madder Red

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent` | `#8B1A1A` | Primary accent. Buttons, active indicators, key actions |
| `--accent-hover` | `#A12020` | Hover state on accent elements |
| `--accent-muted` | `#5C1212` | Subtle accent backgrounds, tags, badges |
| `--accent-glow` | `rgba(139, 26, 26, 0.15)` | Glow/shadow behind accent elements |
| `--accent-faint` | `rgba(139, 26, 26, 0.08)` | Faintest accent wash, selected row backgrounds |

The accent red is used sparingly. It is the single point of visual heat in an otherwise dark, quiet interface. When the red appears, it means something - an action to take, a metric that matters, a state change. Overusing it dilutes its power.

#### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--success` | `#2D6A4F` | Published status, improving metrics, passing checks |
| `--warning` | `#B8860B` | Attention needed, voice drift, approaching thresholds |
| `--error` | `#9B2226` | Failures, must-fix violations, connection issues |
| `--info` | `#3A506B` | Informational, neutral status, tips |

Semantic colors are muted. Even "success" green is dark and subdued. Nothing competes with the content.

---

## 4. Typography

### Font Family

**Primary:** SF Pro. Apple's system font. Clean, neutral, nine weights, variable optical sizing. It disappears into the reading experience, which is exactly right for a tool where the content the system produces is the star.

```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 
             system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

**Monospace (code, data, scores):** SF Mono, falling back to system monospace.

```css
font-family: 'SF Mono', ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', 
             'Liberation Mono', Menlo, Monaco, Consolas, monospace;
```

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-display` | 32px | 700 | 1.2 | Page titles, org name in header |
| `--text-title` | 24px | 600 | 1.3 | Section headings, card titles |
| `--text-heading` | 18px | 600 | 1.4 | Subsection headings, modal titles |
| `--text-body` | 15px | 400 | 1.6 | Body text, descriptions, content |
| `--text-small` | 13px | 400 | 1.5 | Metadata, captions, timestamps |
| `--text-micro` | 11px | 500 | 1.4 | Badges, status labels, keyboard shortcuts |

### Type Rules

- **Body text is always 15px.** Not 14, not 16. SF Pro at 15px on dark backgrounds hits the sweet spot of readability without feeling oversized.
- **Headings never go above 32px.** Dark Madder is not a marketing site. Display type stays controlled.
- **Weight range: 400-700 only.** Regular (400) for body, Semibold (600) for headings, Bold (700) for display only. No light weights on dark backgrounds (readability suffers). No black weights (too heavy for a tool interface).
- **Monospace for data.** Voice match scores, word counts, token counts, analytics numbers, and any machine-generated values use SF Mono. This visually separates "the system's data" from "the human's content."
- **Letter spacing:** Default for body text. +0.02em for micro text and badges. -0.01em for display titles.

---

## 5. Layout & Spacing

### Grid

- **Sidebar:** Fixed, 240px wide. Dark (`--bg-void`). Contains org switcher, main navigation, and user menu.
- **Main area:** Fluid, fills remaining width. Background `--bg-base`.
- **Content max-width:** 960px for reading views (draft editor, reports). Full width for dashboards and data views.
- **Panel layouts:** Two-panel split used for editor (content left, checklist/metadata right) and analytics (chart left, data right).

### Spacing Scale

Base unit: 4px. All spacing derives from this.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight gaps: between icon and label, inside badges |
| `--space-2` | 8px | Small gaps: between related items in a group |
| `--space-3` | 12px | Medium gaps: padding inside cards, between form fields |
| `--space-4` | 16px | Standard padding: card padding, section gaps |
| `--space-5` | 24px | Section spacing: between card groups, major sections |
| `--space-6` | 32px | Page spacing: top of page to first content |
| `--space-8` | 48px | Major divisions: between completely separate content areas |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Badges, small tags, inline elements |
| `--radius-md` | 8px | Buttons, inputs, cards |
| `--radius-lg` | 12px | Modals, large panels |
| `--radius-full` | 9999px | Avatars, circular indicators |

---

## 6. Component Language

### Cards

The primary container for information. Cards use `--bg-surface` with a 1px border of `--bg-muted`. No drop shadows (shadows don't read well on dark backgrounds). Hover state: border shifts to `--accent-muted` with a faint `--accent-glow` box-shadow.

```css
.card {
  background: var(--bg-surface);
  border: 1px solid var(--bg-muted);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.card:hover {
  border-color: var(--accent-muted);
  box-shadow: 0 0 20px var(--accent-glow);
}
```

### Buttons

**Primary:** `--accent` background, `--text-primary` text. Used for key actions only (Approve, Publish, Generate). One primary button per view maximum.

**Secondary:** Transparent background, 1px `--bg-muted` border, `--text-secondary` text. Used for standard actions (Save, Cancel, Dismiss).

**Ghost:** No background, no border, `--text-tertiary` text. Used for inline actions (Edit, Delete, More).

**Danger:** `--error` background, `--text-primary` text. Used for destructive actions (Delete piece, Kill cluster). Always requires confirmation.

All buttons: `--radius-md`, 36px height (default), 32px height (compact), 44px height (large).

### Status Indicators

Content status is communicated through small colored dots and labels:

| Status | Color | Dot |
|--------|-------|-----|
| Planned | `--text-tertiary` | Hollow circle |
| Generating | `--accent` | Pulsing dot (animation) |
| Draft | `--warning` | Solid dot |
| In Review | `--info` | Solid dot |
| Approved | `--success` | Solid dot |
| Published | `--success` | Solid dot with check |
| Needs Update | `--warning` | Solid dot with exclamation |

### The Editor

The draft editor is the most important surface in the product. It should feel like a focused writing environment, not a cluttered CMS.

- **Background:** `--bg-base` (slightly lighter than page background, but not white)
- **Text:** `--text-primary` at `--text-body` size with generous line height (1.7 in the editor specifically)
- **Width:** Max 680px for the text column (optimal reading width)
- **Headings in the editor:** Rendered at their actual heading sizes, subtle `--text-secondary` label showing "H2" or "H3" in the margin
- **The checklist sidebar:** Fixed right panel, 280px wide, `--bg-surface` background. Checkmark items that auto-pass are `--success`. Manual items are `--text-tertiary` until checked.
- **Voice match score:** Displayed as a large monospace number in the top-right of the editor. `--success` if >= 85, `--warning` if 75-84, `--error` if < 75.

---

## 7. Visual Motifs

### The Molecule / Reaction Aesthetic

Dark Madder's visual language draws from chemistry and alchemy, not in a literal "test tubes and beakers" way, but in the abstract visual patterns of molecular structures, chemical bonds, and reaction diagrams.

**Node graphs:** The cluster map (showing hubs and spokes) should render as a node graph where each content piece is a node and links are bonds. This is both functionally useful and aesthetically on-brand. Nodes pulse faintly with `--accent-glow` when they represent active/generating content.

**Connection lines:** Throughout the UI, when showing relationships (cluster > hub > spoke, or piece > splits), use thin lines with small dots at connection points. Not arrows - dots. This echoes molecular bond notation.

**The "reaction" metaphor for generation:** When the system is generating content, the visual metaphor is a chemical reaction in progress. Subtle particle animations (tiny dots drifting upward from the loading indicator), a faint shimmer on the card being generated. Not flashy - restrained. Like watching something catalyze.

**Background texture:** The void background (`--bg-void`) can include an extremely subtle pattern of faint dots or a barely-visible grid that suggests graph paper or a periodic table. This should be almost invisible - felt more than seen.

### Iconography

Use Lucide icons (already in the stack) with these modifications:
- Stroke width: 1.5px (thinner than default 2px, fits the refined aesthetic)
- Size: 18px default, 16px compact, 20px in navigation
- Color: `--text-secondary` default, `--text-primary` on hover, `--accent` when active

Custom icons needed for Dark Madder-specific concepts:
- Voice profile: A waveform or sound signature shape
- Learning loop: A circular arrow with a small "+" on it
- Cluster: A molecule-like node cluster
- Generation: A flask or distillation shape
- Splits: A single line splitting into multiple branches

---

## 8. Motion & Animation

### Principles

- **Restrained.** Animations should feel like chemical processes - gradual, precise, purposeful. No bouncing, no elastic easing, no confetti.
- **Subtle.** Most transitions are 150-200ms. Nothing longer than 300ms except page transitions.
- **Meaningful.** If something animates, it communicates a state change. No animation for decoration.

### Specific Animations

**Card hover glow:** 150ms ease. Border color shift + faint box-shadow glow in accent color.

**Status transitions:** 200ms ease. When a piece moves from "draft" to "approved," the status dot color shifts smoothly.

**Generation in progress:** A slow pulse on the generating card's accent glow (2s cycle, ease-in-out). Accompanied by micro-dot particles drifting upward at 0.5px/frame. Subtle enough to be ambient.

**Node graph interactions:** Nodes in the cluster map gently ease to their positions (300ms spring). Hovering a node highlights its connections (150ms, connected lines shift from `--bg-muted` to `--accent-muted`).

**Page transitions:** 200ms fade. No sliding, no scaling. Just a clean opacity transition.

**Sidebar navigation:** Active state indicator (a thin `--accent` line on the left edge of the active nav item) slides vertically between items (200ms ease-out).

---

## 9. Empty States & Loading

### Empty States

When a view has no data yet, show a centered message with:
- A relevant icon (muted, 48px)
- A brief heading in `--text-secondary` (e.g., "No clusters yet")
- One line of description in `--text-tertiary` (e.g., "Run your first keyword research to build the cluster map")
- A single primary action button

Empty states are not apologetic. They are invitations. The tone is: "Nothing here yet. Here's how to start."

### Loading States

Loading microcopy should lean into the brand personality. Not generic "Loading..." but thematic:

- Research running: "Scanning the landscape..."
- Voice profile building: "Extracting the signal..."
- Draft generating: "The formula is working..."
- Publishing to Framer: "Transmitting..."
- Analytics pulling: "Measuring the reaction..."
- Splits generating: "Distilling the essence..."

Loading indicators: A small, slowly rotating accent-colored circle (not a spinner - a smooth rotation, like a magnetic stir bar in a flask). Paired with the thematic microcopy below it in `--text-tertiary`.

---

## 10. Dark Mode (There Is No Light Mode)

Dark Madder is dark-only. There is no light mode toggle. This is not a constraint - it is a brand decision. The darkness is the identity. The content glows against it. A light mode would destroy the aesthetic and the metaphor.

If a user needs to read generated content in a light context (e.g., previewing how it will look on their Framer site), the "Preview" function in the editor renders the content in a separate panel with a white background and dark text, simulating the published view. The editor itself remains dark.

---

## 11. Responsive Considerations

Dark Madder is primarily a desktop application. The editorial workflow (reviewing 3,000-word drafts, managing cluster maps, analyzing analytics) doesn't map well to mobile.

**Desktop (1280px+):** Full layout. Sidebar + main content + optional right panel.
**Tablet (768px-1279px):** Collapsible sidebar. Main content fills width. Right panels stack below.
**Mobile (< 768px):** Dashboard summary view only. Notification center (draft ready for review, alert). No editor, no analytics deep dive. A prompt to use desktop for full functionality.

---

## 12. CSS Implementation Notes

### Tailwind Configuration

All design tokens should be configured as Tailwind theme extensions:

```javascript
// tailwind.config.js (excerpt)
module.exports = {
  theme: {
    extend: {
      colors: {
        void: '#050506',
        base: '#0A0A0B',
        surface: '#111113',
        elevated: '#1A1A1D',
        subtle: '#222225',
        muted: '#2A2A2E',
        accent: {
          DEFAULT: '#8B1A1A',
          hover: '#A12020',
          muted: '#5C1212',
        },
        success: '#2D6A4F',
        warning: '#B8860B',
        error: '#9B2226',
        info: '#3A506B',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 
               'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['SF Mono', 'ui-monospace', 'Cascadia Mono', 'Segoe UI Mono', 
               'Liberation Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
}
```

### SF Pro Usage Note

SF Pro is Apple's system font and is pre-installed on all macOS and iOS devices. On non-Apple devices, the font stack falls through to system-ui (which resolves to Segoe UI on Windows, Roboto on Android). This is intentional - SF Pro is the primary target for the developer (Zack, on Mac), and the fallbacks are close enough in character weight and metrics that the experience is consistent. No self-hosting of SF Pro font files is needed or legally advisable.

---

*Dark Madder Specification - 10 UI & Brand - March 2026*
