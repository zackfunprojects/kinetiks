# Dark Madder — Design Language (`ux/design-language.md`)

> **Status:** Canonical. This document receives the Dark Madder design system (handoff bundle `dark-madder-design-system`, exported from Claude Design, June 2026) and reconciles it against the Kinetiks Platform Contract §7 and the v2 doc system. Per `dark-madder-v2-doc-system.md` §3.3, this doc decides all salvage questions; the v1 UI_Brand doc is archive-only.
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > platform docs > this doc > subsystem specs' visual details. Where this doc and a subsystem spec disagree on *what a surface contains*, the subsystem spec wins; where they disagree on *how it looks and behaves visually*, this doc wins.
> **Source of truth for values:** the design bundle's `project/` directory (tokens, components, UI kits) is the executable reference. This doc specifies how it applies to DM v2; it does not duplicate every token value. The bundle ships into the repo at `apps/dm/design-system/` verbatim.

---

## 1. The design in one paragraph

Dark Madder is a lab, and the interface is its instrument panel. The system is **near-monochrome ink** on quiet surfaces: a cool, fully desaturated slate scale does almost everything, including primary actions — buttons are ink in light mode and invert to white in dark. The dark end is an elegant deep grey (`#15161A`), never pure black. One deep desaturated **iris ultraviolet** exists for links, focus rings, and faint brand tints — never a fill. A muted **emerald** is the only colored signal in product chrome, reserved exclusively for *live / agents working*. Depth is hairline borders plus crisp stacked shadows — no glows, no gradients-as-decoration, no starfields. The "dark" in Dark Madder is conceptual; the "madness" lives in the concept, the symbols, and the copy — never in the chrome. **Fewer boxes, more lines:** related data lives in single surfaces divided by hairlines, not grids of competing cards.

This is the final state of the design after four explicit refinement passes in the source transcript (`chats/chat1.md`). Three earlier directions are **dead and must never resurface**: the madder-crimson palette, the plasma-violet + acid-green pairing, and the orbital-atom logo. Any agent reading the bundle's history must build only from the files as shipped.

---

## 2. Reconciliation with the Kinetiks Platform Contract (§7)

The design was authored independently and lands almost perfectly on the platform's requirements. Point by point:

| Contract §7 requirement | Design system | Verdict |
|---|---|---|
| Geist Sans + Geist Mono | `--font-sans: Geist`, `--font-mono: Geist Mono` | **Aligned natively.** DM adds Newsreader as `--font-serif` for marketing display only (§5). |
| CSS custom properties for theming | Full semantic-alias token layer; `[data-theme="dark"]` / `.dark` swap | **Aligned.** DM tokens are `--dm-*`-prefixable if `@kinetiks/ui` namespace collisions appear; otherwise shipped as-is, scoped to the DM app root. |
| Dark mode required, not Tailwind `dark:` variants | Dual-theme via custom-property aliases, exactly this mechanism | **Aligned.** Light is DM's product default; the theme attribute follows the Kinetiks-wide preference when activated, user-set when standalone. |
| `@kinetiks/ui` components where available | 17 DM primitives (forms / display / feedback / navigation) | **Resolution:** `@kinetiks/ui` wins for cross-app furniture (FloatingPill, approval cards, anything Marcus renders). DM primitives win inside DM surfaces — they *are* the brand. Where both exist (Button, Dialog), the DM primitive wraps or re-skins the shared one rather than forking behavior. Tracked per-component in §7. |
| Mobile-first, primary actions in thumb zone | Desktop-first UI kits | **Gap — specced here**, §10. |
| Floating pill mounted in root layout | Not in the kits | **Specced here**, §6.4. |
| Embedded-panel rendering (collaborative workspace) | Not in the kits | **Specced here**, §6.5. |

**One open conflict, filed for decision:** the manifest in `dm-platform-integration.md` drafts declares `color: '#8B1A1A'` (a madder red) and `icon: 'flask-conical'`. The shipped design killed madder red deliberately. **Proposed resolution:** manifest color becomes iris `#4E49A4` (`--iris-600` — the one place a brand fill is correct: DM's identity *inside Kinetiks chrome*, where DM's no-fill rule doesn't govern), and the icon becomes the dark-matter halo mark, with `flask-conical` only as the Lucide fallback where custom marks aren't renderable. This is a one-line manifest edit; it goes to `dm-platform-integration.md` in the same session this doc is approved.

---

## 3. Visual registers

Every DM surface belongs to exactly one register. Register violations (marketing serif in product chrome, full-bleed dark sections inside the light app) are design bugs.

**R1 — Product chrome** (the app at dm.kinetiks.ai). Light default, flat `--surface-page`, white cards, hairlines, Geist everywhere, Geist Mono for data. Newsreader never appears. The only color is the emerald live signal and iris links/focus. Backdrops: none, or at most the `.dm-cosmos` tonal wash behind a section home's header.

**R2 — Marketing** (the public site, the standalone signup, pricing, the upgrade moments). Dark-default full-bleed, Newsreader display at 28px+, `.dm-cosmos` wash, `.dm-starfield` dot grid, `.dm-grain` at ≤3%. The website UI kit (`ui_kits/website/`) is the reference recreation.

**R3 — Embedded panel** (DM rendered inside the Kinetiks collaborative-workspace split panel, and inside approval-card deep-links). Product chrome with the app shell suppressed — §6.5. Theme follows the host shell, always.

**R4 — Generated artifacts** (social card images, OG images from the Image Engine). Governed by the Cortex Brand-derived style profile per `generation-engine.md` §2.7, not by this doc — but the *defaults* when Brand is empty derive from R2: ink surfaces, iris accent, Newsreader display.

---

## 4. Color — the law

All values live in `tokens/colors.css`; this section is the usage law.

1. **Ink does the work.** Surfaces, text, borders, and primary actions are the slate ramp through semantic aliases only (`--surface-card`, `--text-heading`, `--accent`, `--line-*`). No component file contains a raw hex.
2. **Primary actions are `--accent`** — ink in light (`--slate-900`), white in dark. Anything sitting on an accent surface uses `--accent-onAccent`; this is what keeps checkboxes, switch thumbs, solid badges, and button spinners alive across the theme inversion (a verified failure class from the source transcript — treat it as a standing test).
3. **Iris is invisible-matter color:** links (`--text-link`), focus (`--ring`, `--border-focus`), the faint `--surface-accent` tint, `--line-accent`. It is **never** a button fill, never a chart series, never a status color. The single exception is §2's manifest identity color, which lives outside DM's own chrome.
4. **Emerald = live, and only live.** The `--spark` family marks *an agent is working right now*: the pulsing live dot, in-progress generation stages, active ingestion. It is not "success" — success is the desaturated `--success` semantic. If nothing is running, no emerald is on screen. This makes the lab legible at a glance: green means motion.
5. **Semantic colors stay desaturated** and appear only as status (success/warning/danger/info text, tinted `--*-bg` chips). Evidence-bearing flags (voice violations, stale claims, blocked approvals) use semantic color on the *chip*, never on whole cards.
6. **Dark is deep grey.** Page `#15161A`, cards a step lighter (`--slate-900`/`--slate-850` per alias), light-mode ink is `#1F2026` — never `#000`.
7. **Charts and the corpus map** are monochrome-first: ink-weight encodes value; emerald marks live/processing nodes; iris marks the selected/focused entity; semantic hues mark status overlays only. No categorical rainbow palettes, ever.

---

## 5. Typography — role assignments

Families and scale live in `tokens/typography.css`. Roles are strict; the system decides, not the screen's author.

| Role | Family / token | Where |
|---|---|---|
| UI, headings, body | Geist (`--font-ui`/`--font-body`), 14px floor in dense UI, headings tracked −0.015 to −0.02em | All R1/R3 surfaces |
| Data | Geist Mono (`--font-data`) **with `font-variant-numeric: tabular-nums` on every figure** | Metrics, scores, counts, traces, timestamps, cost ledgers, keyword tables, the eyebrow label |
| Eyebrow | Geist Mono, `--text-2xs`, `--tracking-wider`, uppercase (`.dm-eyebrow`) | Section labels, agent task lines (`RESEARCH · RUNNING`), the only all-caps in the system |
| Marketing display | Newsreader (`--font-display`), 28px+ only | R2 heroes, pull-quotes, the footer tagline, the wordmark |

Two DM-specific consequences the subsystem specs depend on:

- **Every number a claim hangs on is mono and tabular.** Voice composite scores, training strength, opportunity scores, freshness scores, citation share — the evidence drawer (§8, P4) opens off these numbers, so they must read as instrument figures, not prose.
- **Generated *content* inside the editor is not chrome.** The document canvas in `editor-review.md` S2 renders the draft in its publish typography (a content stylesheet mirroring the connected CMS's rendering where known, Geist defaults otherwise), visually distinct from the Geist UI around it. The room is ink; the page is the page.

---

## 6. The app chrome

Reference implementation: `ui_kits/app/Shell.jsx`. Values below are normative.

### 6.1 Shell geometry
- **Sidebar:** 232px fixed, page-tone background (shares `--surface-page` with the content — white cards do the layering, not competing chrome surfaces), `padding: 16px 12px 14px`. Logo block top; nav; live-agents block; identity block pinned bottom above a hairline.
- **Top bar:** 54px, page-tone, hairline bottom border. One row: screen title (15px semibold, −0.01em) + truncating context subtitle (12.5px secondary), ⌘K command affordance (260px), ghost icon buttons (never bordered boxes), theme toggle, the one contextual primary action.
- **Content:** max-width `--container` (1200px) for reading surfaces; full-bleed minus gutters for canvases (Architecture, Corpus Map, the editor).

### 6.2 Navigation
Nav items: 13px, `gap: 10px`, `padding: 7px 10px`, radius `--radius-md`; active = neutral `--accent-quiet` highlight with heading-color text and the glyph at full weight; counts are quiet mono figures (10.5px, secondary), never badge pills. The DM v2 IA (from the subsystem specs' surface inventories) maps onto the glyph lexicon:

| Nav section | Glyph | Surfaces housed |
|---|---|---|
| Overview | `overview` (Shell icon set) | The app home — Tuesday-morning orientation |
| Train | **new glyph — see below** | knowledge-trainer S1–S7 |
| Research | `research` (lens) | research-architecture S1–S6, S9 |
| Build | `build` (drafted lines + cursor) | Draft queue, editor, generation theater, image review (editor-review S1–S4, generation S1–S2) |
| Publish | `publish` (signal) | publishing surfaces, splits queue |
| Monitor | `monitor` (rings) | freshness, radar response, AI visibility, measurement, corpus map (research S7–S8 live here as monitor-adjacent canvases or under Research — IA detail resolved in `experience-architecture.md`) |
| Settings | Icon set `settings` | generation S3, CMS connections, app settings |

**Glyph extension (required, not optional):** the lexicon has no *train/learn* symbol. A seventh glyph is drawn from the same primitives (node, halo, filament, spark; 24px, 1.5 stroke, `currentColor`, monochrome) — recommended form: the halo mark with a filament feeding into it (knowledge flowing into the unseen mass). It ships in `assets/glyphs/train.svg` alongside the existing six. Glyphs are always **inlined** (external `<img>` SVGs cannot inherit `currentColor`).

### 6.3 The live-agents block
The sidebar's middle block is DM's signature chrome: each running agent renders as a 9px-gap row — halo-mark avatar, name (12px semibold, truncating), task line in mono `--spark-ink` (11px). This block is the ambient answer to "what is the lab doing right now" and is fed by the same run-state machinery that powers P3 (§8). Empty when nothing runs — no placeholder rows.

### 6.4 The floating pill
`<FloatingPill />` from `@kinetiks/ui` mounts in the app root layout, bottom-right, above `--z-sticky`. It is platform chrome and is **not re-skinned** — its presence in both modes (upgrade-CTA standalone, system-name + approval count + quick-chat connected) is the contract. DM guarantees a 72px bottom-right exclusion zone on every screen so no primary action, toast anchor, or canvas control collides with it (toasts anchor bottom-center on desktop for this reason).

### 6.5 Embedded-panel mode (R3)
When DM mounts in the collaborative-workspace split panel (per `collaborative-workspace-spec.md` §5, via the embed route/param):
- **Sidebar and floating pill are suppressed** — the host shell owns navigation and the pill.
- The top bar collapses to a 44px **context strip**: glyph + entity title + state badge + the primary action. Deep-linked approval context renders the approval banner state from `editor-review.md` §2.5 in this strip.
- All tokens, components, and states are otherwise identical — the panel is a viewport, not a sub-product. Minimum supported panel width 480px; below the kit's comfortable widths, side context panels (brief, checklist, versions in the editor) become a tabbed rail per §10's narrow-layout rules, which the panel reuses wholesale.
- Theme always follows the host. Presence indicators (the named system's cursor/selection per the workspace spec) render in iris — the one in-chrome iris use beyond links/focus, justified because presence is the platform's affordance rendered on DM's surface.

---

## 7. Components

The 17 bundle primitives are the DM component library, recreated in the monorepo (React/TS against the tokens — the bundle's JSX is the visual spec, not production code, per the handoff README):

- **forms/** Button (primary ink-inverting w/ inset top-highlight; secondary as crisp card-surface control; ghost), IconButton, Input, Select, Checkbox, Switch
- **display/** Card (hairline + whisper shadow; `glow` = the one elevated/featured card per view; `inset` wells for code/metrics), Badge, Tag, Avatar (halo-mark default for agents), Progress
- **feedback/** Spinner (halo spinner — the only loop besides the live dot), Tooltip, Toast, Dialog (blur scrim via `color-mix` of page color)
- **navigation/** Tabs, Segmented

**Gap inventory — components DM v2 needs that the bundle doesn't ship.** These are *designed as part of the system* (same recipes: hairlines, divided lists, mono figures), not invented per-screen. Each is owned by the primitive it serves:

| New component | Serves | Recipe anchor |
|---|---|---|
| `EvidenceDrawer` | P4, universal | Right-anchored panel, card surface, `--shadow-lg`, hairline edge; content = claim restated + mono figures + quoted excerpts in inset wells + provenance line |
| `DiffViewer` + `ChangeBlock` | P2 (editor-review §2.9 is canonical) | Side-by-side / unified; change blocks as divided-list rows with evidence chips; insertions/deletions as tinted `--success-bg`/`--danger-bg` text spans, never whole-block fills |
| `PipelineTheater` + `StageRow` | P3 | §8 below |
| `ProposalCard` family | P1 | One card anatomy for drafts/diffs/territories/opportunities/template adjustments: title, evidence chips, the *why* line, confirm/adjust/reject actions; wraps the platform approval card when one exists |
| `InstrumentStrip` | Stat rows everywhere | The de-clunking pattern: one surface, hairline-divided cells, mono label + tabular figure + delta — never N separate stat cards |
| `DividedList` + `ListRow` | Queues, ledgers, lexicon, sources | One card, hairline rows, quiet hover wash, ellipsizing titles, fixed-width right-aligned figure columns |
| `LiveDot` / `AgentRow` | Live states, sidebar | `.dm-live-dot` pulse; emerald only while running |
| `ScoreFigure` | Every evidence-bearing number | Mono tabular figure + the P4 affordance built in (hover ring, click opens drawer) |
| `StateFrame` | Five-states discipline | Standard empty/loading/failed/partial framing so no screen hand-rolls these |
| `CanvasShell` | Architecture, Corpus Map | Pan/zoom chrome, overlay toggles, side investigation panel |

`@kinetiks/ui` ownership: FloatingPill, the approval-card rendering inside Kinetiks/Marcus surfaces, and workspace presence primitives are imported, never rebuilt. DM's ProposalCard *contains* the platform approval linkage; it does not duplicate the queue card.

---

## 8. The four interaction primitives — visual treatment

The doc-system's four primitives (§3.3) get exactly one visual design each, used everywhere. No screen invents a parallel.

**P1 — Propose → review → approve.** The ProposalCard anatomy: heading-color title, the mandatory *why* sentence, evidence chips (each a P4 opener), and a right-aligned action set where **approve/confirm is the only primary button on the surface**. Pending platform decisions render an iris-tinted `--surface-accent` banner with the card deep-link. Destructive rejection is ghost + confirm, never red fills. Batch approvals (link sweep) state their exact blast radius in the confirm dialog.

**P2 — The diff surface.** One DiffViewer (editor-review §2.9 canonical). Change blocks are divided-list rows; each carries its problem/rule/violation chip; per-block actions appear only where the mounting context grants them. Refresh diffs, version compares, trainer delta reviews, rewrite explanations, and link-sweep insertions all mount this component with different chrome around it.

**P3 — Generation theater.** The flagship. A vertical stage rail inside one card: each StageRow = glyph-weight stage icon, stage name (13px), state (mono, right-aligned — `queued / running / done / failed`), and a live region. The running stage carries the emerald live dot and streams (sections render in as they generate); completed stages collapse to a single line with their key figure (voice composite, fix count, cost) as a ScoreFigure; the failed stage shows its error inline with **Resume from here** as the row's action. `awaiting_outline_checkpoint` renders as a named amber pause row with the checkpoint deep-link — a pause is a state, never a stall. Cancel is a ghost action in the theater header. Scan progress, ingestion, discovery runs, and per-slot image regeneration are the same component at smaller scales.

**P4 — The evidence drawer.** Every claim-bearing number, badge, flag, and "based on your Context Structure" phrase is a ScoreFigure or chip that opens the EvidenceDrawer. Drawer content pattern, always: (1) the claim restated plainly, (2) the computation or breakdown in mono, (3) the underlying material verbatim — excerpts, probe transcripts, keyword rows, the originating edit — in inset wells, (4) the provenance line (source, `fetched_at`, layer + confidence for Cortex-derived values). The drawer is how *receipts or it didn't happen* becomes a pixel-level guarantee.

---

## 9. States, motion, voice

**Five states** (`StateFrame`): *Empty* states are mode-aware and never blank — standalone empties onboard, activated empties leverage Cortex, per every subsystem spec's S-sections; the copy lands in `ux/screen-system.md`. *Loading* = skeletons in the shape of the populated layout (no spinners for layout loads; the Spinner is for in-flight actions). *In-progress* = P3 inline, scoped to its region, the rest of the screen interactive. *Failed/partial* = scoped to the failing element, named, with retry; degradation stated, never faked ("coverage unknown", "no keyword volume data"), and never a blank screen.

**Motion.** `--ease-out` settle by default, `--ease-spring` for toggles, 120/220/420ms. Entrances are short rise+fade (`dm-rise`). The only infinite loops are the emerald live-dot pulse and the halo spinner — if it loops, it means *running*. Theme switches suppress transitions for one frame (the kits' verified pattern). `prefers-reduced-motion` honored everywhere; streaming text degrades to chunked appearance, the live dot to a static emerald dot.

**Voice in chrome.** Per the bundle readme's content fundamentals, binding for all microcopy: *you* for the user, *we / the agents / madder-0N* for the system, never "I". Sentence case everywhere except the mono eyebrow. Numbers over adjectives ("14 sources synthesized", never "tons of sources"). No emoji, no exclamation hype. Errors are flat and actionable ("Website scan failed: site unreachable — retry or paste content instead"). This register *is* the propose-don't-publish constitution made audible: the system reports evidence, the human decides.

---

## 10. Mobile and narrow layouts

The contract requires mobile-first with primary actions in the thumb zone; the kits are desktop references, so this section is normative:

- **<768px:** the sidebar becomes a bottom tab bar of five glyphs (Overview, Train, Research, Build, Monitor; Publish and Settings fold into Overview's quick actions and the identity sheet). The top bar keeps title + the overflow sheet.
- **The primary action docks** as a full-width bottom bar button above the tab bar (thumb zone) on every decision surface — Approve & publish, Commit to Calendar, Confirm findings. The floating pill coexists per the platform's own mobile behavior; DM's docked action bar leaves the pill's corner clear.
- **Side panels become bottom sheets:** the evidence drawer, the editor's brief/checklist/versions rail, canvas investigation panels. The diff viewer goes unified-only.
- **Canvases (Architecture, Corpus Map) remain fully functional** on touch — pan/zoom native, node investigation via the sheet; the toolbar collapses to an overlay-toggle row. Dense keyword tables become card lists with the same mono figures.
- **768–1280px** (and the workspace panel): the sidebar collapses to a 64px glyph rail with tooltips; context panels tab-stack. The embedded panel (§6.5) reuses exactly these rules.

---

## 11. Design phase gates (binding on build plans)

Per the design-first discipline and doc-system §6 ("the UX docs gate UI work the way plans gate code"), every DM build phase touching UI carries dedicated design phases, not substeps:

- **Phase 0 — Token audit:** the bundle's tokens land in `apps/dm/design-system/`; zero hardcoded hex/font/px values in any component file (lintable; the bundle ships `_adherence.oxlintrc.json` as the starting rule set). Fonts: Geist/Geist Mono arrive via the platform; Newsreader self-hosted `.woff2` replaces the Google-CDN `@import` before any R2 surface ships (the bundle flags CDN as interim).
- **Phase 1 — Component inventory:** §7's primitives and gap components built against tokens before any screen consumes them; each new component proves itself in both themes and both densities.
- **Phase 2 — Register & layout:** every screen declares its register (§3) and chrome mode (full / embedded / mobile) in its build task.
- **Phase 3 — Typography & hierarchy:** role assignments per §5; every evidence number is a ScoreFigure.
- **Phase 4 — Interaction:** the screen's five states implemented via StateFrame; its primitive usage (P1–P4) named, no parallels.
- **Phase 5 — The screenshot test:** both themes, mobile, and embedded captures reviewed against this doc. The standing regression checks from the source transcript run every pass: theme-toggle leaves no stale pixels and no white-on-white `onAccent` failures; nothing wraps mid-word that should truncate; no emerald on a screen where nothing runs; exactly one primary action per surface.

---

## 12. Open items (tracked, none blocking)

1. **Manifest color/icon** — §2's proposed iris + halo edit to `dm-platform-integration.md`; approve with this doc.
2. **Train glyph** — §6.2; drawn during Phase 1 from the existing primitives.
3. **Newsreader self-hosting** — `.woff2` into `assets/fonts/` with local `@font-face`; Phase 0.
4. **`@kinetiks/ui` collision audit** — confirm token names and Button/Dialog wrapping strategy against the shared package's actuals during Phase 1; file deltas to `platform-asks.md` only if the shared primitives can't be themed via custom properties.
5. **Editor content stylesheet** — §5's publish-typography canvas; specced in detail in `editor-review` build planning alongside the Tiptap decision.
6. **`experience-architecture.md` reconciliation** — §6.2's IA mapping is this doc's proposal; the experience-architecture doc confirms section homes and where the corpus map/link sweep live in nav.

---

*Dark Madder v2 — Design Language. Reconciled against: design bundle (final state), platform-contract §7, collaborative-workspace-spec, knowledge-trainer / research-architecture / generation-engine / editor-review §7s. June 2026.*
