# Dark Madder — Product Specification

> **CANONICAL. This document is the constitution of Dark Madder. When documents conflict, this one wins.**
> **Date:** June 2026 · **Status:** Approved draft, authored after the full v2 corpus (this document adjudicates; the write-back ledger `dm-product-spec-writeback-ledger.md` carries its corrections into the corpus).
> **Authority chain:** `dm-product-spec.md` > `dark-madder-v2-doc-system.md` > Kinetiks platform docs (`platform-contract.md` binding at the app boundary, with `dm-platform-integration.md` as its implementation) > `ux/` docs > subsystem specs > `platform-asks.md`. The v1 corpus (`ARCHIVE-` files) is historical reference only; never build from it.
> **Read this first.** This document assumes nothing. Every term it uses is defined in §9. A builder who has read only this document should understand what Dark Madder is, who it serves, how its mornings feel, what it contains, and the laws every surface must obey — and should know which subsystem spec to open next.

---

## 0. How to read this document

Dark Madder's documentation is a system with one root. This is the root: vision, narratives, scope, and law. Below it, `dm-platform-integration.md` defines every way DM touches the Kinetiks core; ten subsystem specs in `specs/` define the machinery; `ux/screen-system.md` defines every screen in five states; `ux/design-language.md` defines how it all looks and sounds. Subsystem specs elaborate *within* this document's scope. Nothing in them may contradict it; where one does, this document wins and the contradiction is filed as a write-back, never resolved silently.

Two reading rules for builders:

1. **The narratives (§3) are requirements.** They are not marketing copy. Every screen in the app must trace to a moment in a narrative; a screen that serves no narrative moment does not ship. When a build decision is ambiguous, the question is "which Tuesday does this make better?"
2. **The laws (§5) are lintable.** They are written to be checked against any surface, any spec, any pull request. "Does every claim on this screen open its evidence?" is a review question with a yes/no answer.

---

## 1. What Dark Madder is

Dark Madder is the most advanced, automated, and agentic content operating system on the planet. Its purpose is to automate everything in content marketing that can be automated at the highest level of modern performance — research, planning, creation, publishing, learning, and evolution — while keeping the human in charge of every decision that touches the outside world, and able to commission any one-off piece they need at the same elite standard.

**The person it serves** is a solo founder launching a vibe-coded app: no marketing experience, no content team, no time, and no patience for homework. Dark Madder should feel like **vibe coding for marketing** — you describe the business, the system builds and runs the content operation, and your job becomes reviewing and directing rather than producing. The product explains itself at every step because its operator has never done this before; it never condescends, because its operator is smart.

**What it is against.** Two incumbents. The first is drafting a blog post in a chat window and pasting it into a CMS by hand — no research, no voice calibration, no architecture, no learning, no compounding. The second is hiring a content team — slow, expensive, and out of reach for the person above. Dark Madder beats the first on every dimension and replaces the second for a rounding error of its cost.

**The differentiator is the compounding loop.** Not voice fidelity alone, not research alone, not the learning loop alone — all of it, looped. Research discovers what the business has the authority to own; generation writes it in a calibrated voice with craft-level enforcement; publishing ships it with full technical correctness; measurement learns what worked; freshness, radar, and AI-visibility keep the corpus alive and defended; and every single human action anywhere in the system — every edit, every approval, every kill — teaches the next cycle. A six-month-old Dark Madder account is meaningfully better at its job than a one-month-old one, and the gap widens forever.

**Its place in Kinetiks.** Dark Madder is the content backbone of the Kinetiks marketing ecosystem. It is excellent alone at dm.kinetiks.ai, and inside Kinetiks it is the organ every other program draws on: it builds content to support outbound sequences, advertising campaigns, and PR pushes when Marcus or any Program requests it; it feeds what it learns about voice, customers, and narrative into the Context Structure where every Kinetiks app inherits it; and its production telemetry flows to the Oracle where content's contribution to revenue becomes attributable. Other apps sense and sell; Dark Madder builds the body of work that makes a company worth finding.

### 1.1 The constitutional principle: propose, don't publish — always decided, not always asked, always recorded

Every consequential change to the outside world is an evidence-backed proposal awaiting a decision. This is the constitution's load-bearing wall, and it has a precise shape:

- **Always decided.** No content publishes, no live piece changes, no calendar restructures, and nothing externally bound moves without passing through the approval system as a decision. There is no path around the gate — not for agents, not for schedules, not for speed.
- **Not always asked.** The decision does not have to be a human one forever. Autonomy is **earned, granted, revocable, and audited**: the platform's approval system calibrates per action category (after sustained clean approvals, thresholds drop and high-confidence actions auto-approve), and the user can explicitly grant or forbid autonomy per category at any time ("auto-publish refresh diffs"; "never auto-publish new pieces"). Trust contracts on failure — rejections and flagged outcomes reset a category to always-ask, and autonomy is re-earned the slow way. This is the platform's driving-mode ladder — Human Drive → Approvals → Autopilot — expressed in content. Day one, everything asks. At maturity, a healthy account runs itself and asks only about what is genuinely new.
- **Always recorded.** Every auto-approved action lands in the Learning Ledger exactly as a human-approved one does, reviewable after the fact and flaggable — and a flag triggers trust contraction. Autonomy never means invisibility.

**The never-automatable floor.** Three classes never auto-approve regardless of confidence: (1) strategic decisions — calendar and Program changes, the Adjuster's structural moves — which change direction and affect many future outputs; (2) anything Sentinel flags or blocks — a safety verdict always reaches a human; (3) nothing — there is no third class, and adding one requires amending this document. One automated action is permitted *without* a fresh decision, in exactly one direction: **restoring the last human-approved state** (rolling back a publish that failed verification to the prior approved version, or taking down a first publish that never went live correctly). The system may always retreat to what you already approved; it may never advance past it alone.

**Deferred execution is still one decision.** An approval is the decision; execution may happen later (a scheduled publish approved last week). The published content is hash-verified against the approved version, and Sentinel runs at the execution boundary — if either check fails, the decision reopens; it is never quietly re-made.

**Flagged default (reversible, not law):** the first publish into a newly created cluster asks regardless of earned trust — new territory, new look. Config-level, shipped on.

This principle applies in both entry modes and at every tier. What varies by mode is *where* the decision surfaces (§2); the decision itself never changes shape — there is exactly **one approval decision** per consequential action, and the editor's approve-and-publish action *is* that decision wherever it is taken.

---

## 2. The two entry paths

Dark Madder has two front doors and one design.

### 2.1 Standalone — dm.kinetiks.ai

A user signs up at dm.kinetiks.ai. Behind the scenes a Kinetiks ID and an empty Context Structure are created; the user never hears the word Kinetiks unless they go looking. **Standalone onboarding *is* the trainer** — the first hour teaches Dark Madder the business and the voice, and in doing so populates the Context Structure, so a standalone user who later activates the full platform arrives with rich layers and loses nothing. Standalone is not a degraded mode: every subsystem runs (the one exception is Radar's sensing feed, which is platform-supplied intelligence — the instrument renders honestly inert with an upgrade path, and everything downstream of it is fully built). Approvals happen in-app on the same editor surface; there is no central queue because there is no orchestration layer — there is still exactly one decision.

**Autonomy in standalone (constitutional, per ruling F2):** both autonomy paths — automatic calibration and explicit user grants — operate in standalone exactly as in connected mode, on the in-app approval flow, with identical thresholds, contraction rules, and Ledger recording. The solo founder running standalone earns the same hands-off maturity a connected account does. (The write-back to the platform approval spec is filed; until it ships, explicit user grants are the interim and the absence of automatic calibration is stated in-app, never hidden.)

### 2.2 Activated — from inside Kinetiks

Marcus recommends Dark Madder when the account's goals call for organic trust and traffic, in language like: *"We should be running a content system to develop trust and organic traffic. I'm thinking our first content clusters should be built around X and Z. I'd like to recommend we activate Dark Madder and get started."* Activation is one step and one strategic approval. The user arrives at a Dark Madder that already knows them — the Context Structure's layers populated by Cartographer onboarding and every other app's contributions — and the first hour is minutes: proof of prior knowledge, one confirming trainer touch, first draft generating.

### 2.3 What changes between modes, and what never does

| | Standalone | Activated |
|---|---|---|
| Cortex | Empty at signup; the trainer fills it | Rich on arrival; the trainer confirms and deepens it |
| Approvals | In-app surface (the editor) | Same editor decision, mirrored as a card in the central queue, deep-linked both ways |
| Calendar | `dm_calendar`, identical UI semantics | Registers as the account's content Program (clusters as Workflows, pieces as Tasks) |
| Radar | Honest inert instrument + upgrade path | Live, fed by the platform's intelligence agents |
| The morning voice | The DM Briefing is the only narrator | The DM Briefing narrates DM; Marcus's brief rolls DM's items into the cross-app picture |
| Cross-app requests | None exist to receive | Marcus and Programs dispatch content work to DM |

**What never changes:** the constitution (§1.1), the one approval decision, the five-state honesty of every screen, the craft bar, the evidence behind every claim, the trainer's standard, the learning from every action, and the autonomy ladder. Standalone and connected are one design with different amounts of company.

### 2.4 Tiers — Orbit, Momentum, Gravity

Dark Madder's plans are named for the arc its brand promises — from circling your market to being the unseen mass that holds it together:

| Tier | Platform tier | Published cadence | The promise |
|---|---|---|---|
| **Orbit** | free | 1 piece / 2 weeks | The whole system, really running — trainer, research, a committed plan, and a published piece every two weeks. Not a demo: a working content operation at low velocity. |
| **Momentum** | standard | 1 piece / week | The compounding pace. |
| **Gravity** | pro | 3 pieces / week | Full-throttle: the cadence at which a corpus becomes the gravitational center of its niche. |

Enterprise remains platform-named and custom. Billing and entitlement are platform-owned; DM reads the tier from the platform and enforces exactly one thing — the publish cadence — as a validate-stage check in the publish pipeline, failing with an honest, upgrade-aware message. **Drafting, training, research, and review are never capped at any tier:** the free experience is full-fidelity everywhere except the rate at which work goes live. What Orbit deliberately leaves wanting is velocity, nothing else.

---

## 3. The five narratives

These are the product. Every screen in `ux/screen-system.md` declares which moment below it serves; the App Home (OV1) is where all five begin.

### 3.1 Tuesday morning — the daily encounter

You open Dark Madder. The first thing on screen is the **DM Briefing**: two to four sentences in the lab's own voice, generated from the same owner-figures the tiles below it render, every claim openable to its evidence. *"We shipped two refresh diffs overnight and the Henderson piece cleared verification. One draft and one radar event need you — the radar one expires at noon, so it's first. You're about fifteen minutes from clear."* Under it, the **decision stack**: the day's pending decisions, ordered agentically — the system ranks by urgency and value (an expiring fast-track jumps the line; a routine metadata approval waits), and the top decision renders as the page's one primary action. The home never shows a menu where a decision will do.

You work the stack. A draft review on a Tuesday is a *judgment*, not a read: the editor leads with the evidence — voice-match score, checklist state, claims with sources — and you scan, fix the two small things that smell off (each edit captured, classified, and turned into a rule so next month you fix one thing, then none), and approve. The radar event shows the competitor's piece, the threatened cluster, and a recommended response with its rationale; one click queues it. A freshness diff shows every change against the live piece, each tied to a named, evidenced problem; approve. Beside the stack sits **the Bench** — the standing invitation to commission anything one-off you need today: a whitepaper for the campaign, a blog for the launch (§4.11).

Fifteen to thirty minutes after you sat down, the stack is empty and the home says so: **you're clear**. The register the whole morning runs in is a calm command center — everything is handled, here is what needs you, here is the proof — never an urgency engine. The lab's live-agents block shows what's still running; green means motion; you stand up. And the trajectory matters: as autonomy is earned (§1.1), Tuesdays thin out — the mature account's operator spends thirty minutes a *month*, because the system stopped asking about what it has proven it can do.

### 3.2 Monday planning

Planning comes to you. The weekly plan review is a scheduled entry in the decision stack — you don't go find it; Monday's home leads with it. The review shows the week the system laid out: what publishes when, which clusters advance, what the Program's next stretch looks like, and the **opportunity triage** — a handful of evidenced opportunities, each arguing for itself with data (search volume, customer-language frequency, AI citation gaps, competitor movement). The decision verbs are **Plan, Snooze, Kill** — and every one of them teaches. A kill is a signal about what the system misjudged; a swap is a preference; the next Monday's proposal is shaped by this Monday's verbs.

You steer as much as you want: move pieces, swap topics, kill a slot, pull an opportunity into the week. Every adjustment is presented with enough data and summary to decide well — DM's standing job at any decision point is to make you informed, not just consulted. The review ends in a **commitment**: one strategic approval, and the week is the system's to execute. The commitment is not a cage — anything Tuesday through Friday can reshape it through the same propose/approve path.

And if you don't make Monday: nothing stalls. The committed Program keeps executing — drafts generate, gates run, work queues. The next time you log in, the same review is waiting with the system's adjustments and a plain account of what ran in your absence. **Your absence pauses decisions, never the engine** (§5, L7).

### 3.3 The monthly ritual

Once a month, the home's report tile lights up: the **monthly health report** is ready. It is built for two readers at once — you, and whoever you forward it to. For you it is an instrument panel: cluster performance with authority and AI-visibility trends, top performers with the replicable patterns behind them, underperformers with diagnosed causes and one-click execution arms, voice-quality correlation, goal pace. For the forwarded reader it is a narrative with metrics, wins, and learnings that reads cold — and it exports.

The headline numbers are **traffic and rankings** — the dinner-party figures. Everything else (topical authority, AI share of voice, freshness debt) is in service of explaining their movement.

With the report come the **Adjuster's recommendations**: a few high-conviction structural moves, never a triage list — each pitched with everything relevant attached ("this cluster has stalled past threshold for two quarters; here are the three honest options"), each a strategic approval you decide. Your role at the monthly altitude is judgment and creativity outside the routine — the moves the system cannot see because they live in your head; the ritual is where you add them. And the ritual reaches all the way down: it can propose voice recalibration when drift is detected, Cortex corrections, calendar rebalancing, template adjustments from your deletion patterns. **Every part of Dark Madder learns and evolves; foundations included.** Nothing structural changes without your approval; everything structural is allowed to be questioned.

### 3.4 First hour, standalone

A founder lands at dm.kinetiks.ai cold. The promise on the door: publish-ready content in your voice — first it has to learn your voice, about fifteen minutes to start. The trainer runs **extract-before-interrogate**: it scans the site and the product first, shows what it found with quoted receipts, and asks only where extraction fails. For the vibe-coded app with no content corpus, the founder interview *is* the primary voice source — the refinement rounds ("edit this until it sounds like you") build a voice from a person who has never written a brand guideline and never will. The trainer demands until it can be excellent — no exception — and its scope is constitutionally constrained to make that standard **reachable inside 30–45 minutes** (§5, L11): if a training step can't earn its minutes in output quality, it doesn't belong in the first hour.

Then the hour compounds: trainer flows into Discovery, territories appear pre-evidenced from what was just learned, seeds carry real keyword data, a first cluster forms, the plan proposes, the first draft generates in full theater — and somewhere in minute fifty the founder watches a publish-ready piece in their own voice land in a review queue of a system that is now *scheduled to keep going*. The moment they tell a friend about is not "it wrote a blog post." It is: **"I just built a whole content system that's going to grow my business, in a strong voice — and it's actually running."** Orbit lets them take it all the way: the first piece publishes, free, and another every two weeks.

### 3.5 First hour, activated

Inside Kinetiks, Marcus makes the recommendation (§2.2) and the user says yes. Sixty seconds later they are standing in a Dark Madder that demonstrably already knows them: *"Your Context Structure is already here — Voice at 74%, three products known, eleven territory candidates ready"* — every figure opening its provenance. There is still a trainer touch, deliberately: a short confirm-and-correct pass that proves how much is already known while catching what isn't ("two refinement rounds will push your voice past 90"). Then straight to the same compounding sequence at speed: territories reviewed rather than discovered, plan proposed against the account's actual goals, first draft in minutes.

The wow is different from standalone's, and the spec protects the difference: **"I didn't put in any onboarding effort and I had a great content engine running in twenty minutes."** Standalone's pride is *I built this*; activated's is *it was already mine*.

---

## 4. Scope — the full v2 system

All of it is v2 scope. **Sequencing lives in build-phase plans, not here** — nothing below is "later" as a matter of scope; the order in which it is built is a separate document's decision. Each item is defined standalone, with its owning spec named.

**4.1 Knowledge Trainer** (`specs/knowledge-trainer.md`). How DM learns who it writes for and as. Website scan, refinement rounds, document upload and guided product intake, and customer language mining — all converging on one pipeline: extract, show with evidence, human confirms, emit. Its primary output is Cortex proposals (DM is the platform's best trainer of voice, products, customers, competitive, and narrative); it keeps private only genuine content-craft machinery — the corrections ledger, the author voice layer, refinement history. Standalone onboarding *is* the trainer. A continuous fifth channel — the learning loop — classifies every editor edit into reusable craft rules for the life of the account.

**4.2 Research & Architecture** (`specs/research-architecture.md`). The strategic brain: Overview → Discovery → Keywords → Opportunities → Architecture → Publishing Plan. Authority territories drawn from Cortex and mined customer language; data-backed seeds with real keyword volumes (never fabricated); clusters with transparent opportunity scoring; a collaborative hub-and-spoke canvas; a sequenced publishing plan that commits as one strategic approval. Includes **corpus intelligence** — the embedding layer for semantic linking, cannibalization detection, the Corpus Map, topical authority — and **campaigns**, time-bound initiatives woven through architecture and generation context.

**4.3 Generation Engine** (`specs/generation-engine.md`). The craft pipeline: outline, per-section generation with voice briefs, transition audit, voice audit with composite scoring and auto-rewrite, metadata and schema, the citability gate. Templates are versioned data, not code — seeded with hub, spoke, and playbook, extended by the Bench's families (§4.11). Includes the **Image Engine**: a visual style profile derived from the Cortex Brand layer, generated imagery with an accept / regenerate-with-notes / upload-own review loop, and a publish gate on resolved images.

**4.4 Editor & Review** (`specs/editor-review.md`). The most important surface: the editor with paragraph-level edit capture feeding the corrections ledger, the checklist sidebar, the voice-match score with its evidence drawer, version history, per-section regeneration — and the approval handoff, where approve-and-publish *is* the one Kinetiks approval decision, rendered identically at dm.kinetiks.ai and inside the collaborative-workspace panel.

**4.5 Publishing** (`specs/publishing.md`). Framer first via the Framer API, behind a thin CMS abstraction so WordPress and Webflow are additive later. The publish job pipeline: Sentinel at the boundary, validation (including tier cadence, §2.4), deterministic transform, assets, push, verification — with idempotency, bounded retries, revert-first rollback, and schema markup verified on the live page, not assumed.

**4.6 Lifecycle & Freshness** (`specs/lifecycle-freshness.md`). Continuous freshness scoring of the published corpus; stale claims decomposed into named, evidenced problems; surgical refresh drafts as reviewable diffs, every change tied to its problem; the >40%-change abort that converts a refresh into an honest rewrite proposal. The flagship operational expression of the constitution.

**4.7 Radar Response** (`specs/radar-response.md`). Sensing is platform-owned (the intelligence agents); DM owns the response: relevance scoring of events against the org's territories and clusters, and the one-click paths — refresh the threatened piece, outwrite the competitor, fast-track a response with compressed scheduling and uncompressed quality gates.

**4.8 AI Visibility** (`specs/ai-visibility.md`). Citation probing across AI engines on per-cluster question banks; share of voice versus competitors with probe transcripts as evidence; diagnosis of who won and why; findings routed into existing machinery — citability refreshes, new-content opportunities, competitor proposals. DM-owned domain expertise in both modes.

**4.9 Splits** (`specs/splits.md`). Published long-form decomposed into platform-specific social content — LinkedIn, TikTok, Reddit, Instagram — with platform-voice stacking, alternative hooks, social cards through the Image Engine, and posting notes. Sentinel gates ready; the human posting manually is the external boundary until the agent-communication layer delivers direct posting.

**4.10 Measurement** (`specs/measurement.md`). The Adjuster reborn with zero ingestion: performance scoring, trajectories, the monthly health report, the quarterly strategic review, and trigger-based recommendations — all computed from platform integration tools and Oracle insights joined with DM production data. One owner per number; DM's screens visualize, the platform's Analytics tab receives the same metrics.

**4.11 The Bench** (constitutionalized here; machinery write-backs filed). The one-off lane: at any moment, from the home or the queue, commission a single elite piece — pick a format and a topic, or paste a brief, and the full craft pipeline runs with the same gates and the same one decision. The Bench extends the template set with new families, **whitepaper first** (long-form gated assets as a family), all as versioned template data. Bench pieces carry `origin: one_off`: excluded from cluster-cohesion math (they are not architecture), fully enrolled in freshness, measurement, and splits, and adoptable into a cluster later through the existing legacy-adoption path. The Bench is not a side door around the engine; it is the engine, summoned by hand.

**4.12 Content backbone** (constitutionalized here; capability-language write-backs filed). Dark Madder serves the rest of Kinetiks: Marcus and any Program may dispatch content work to DM through the standard command channel, with correlation IDs carrying attribution end to end — a Harvest nurture asset, ad-campaign landing copy, a PR-supporting piece all arrive as Tasks and leave through the one approval. Content intelligence flows outward continuously via Cortex proposals (narrative, voice, customers) and Oracle metrics. The designated growth path of this same scope item — not deferred scope — is a visible request-for-content surface inside DM once cross-app demand warrants a queue.

---

## 5. Product laws

Eleven laws. The first four are inherited from PATCH-001's findings, already honored across the corpus; the rest are promoted by this document. Every law binds every surface, every spec, every build plan.

**L1 — Every section has a home that orients.** No user is ever dropped into machinery without a surface that says where they are, what state things are in, and what to do next.

**L2 — Every AI claim ships with its evidence.** A score, a finding, a recommendation, or a generated sentence-of-fact without openable evidence does not render. Receipts or it didn't happen.

**L3 — Every consequential decision is a collaborative checkpoint.** The system proposes with its full case; the human disposes. No consequential change is a fait accompli.

**L4 — Every system decision has a clickable why.** Sequencing, scoring, ranking, routing — anything the system decided answers "why?" in one click, in plain language, with the inputs shown.

**L5 — Always decided, not always asked — and always recorded.** The autonomy constitution, in full at §1.1. Every external action passes through the approval system; the decision may be human or earned-automatic; every automatic decision is Ledger-recorded, reviewable, and flaggable; trust contracts on failure; the never-automatable floor stands.

**L6 — Every user action is a learning.** Edits, approvals, rejections, kills, snoozes, swaps, dismissals, hook selections, even correcting the system's interpretation of an edit — all of it is captured, classified, and shapes what the system does next. There is no such thing as an unobserved decision, and the user can always see what was learned (L2 applies to learnings too).

**L7 — The system runs without you.** Absence pauses decisions, never the engine. Committed work continues; gates hold what needs a human; the next login presents what accumulated, with adjustments and a plain account. Dark Madder is an operation, not a tool that waits.

**L8 — One owner per number.** Every metric, score, and figure is computed in exactly one subsystem and rendered everywhere else by reference, evidence included. The home owns no numbers; the report renders other owners' findings; nothing is recomputed twice to disagree with itself.

**L9 — Nothing is faked.** Missing data sources renormalize away and say so; absent integrations render as stated absences with the path to connect; degraded modes are named on the surface where they degrade. A fabricated number or a silently empty state is a constitution-level defect.

**L10 — DM speaks as the lab.** Dark Madder has its own voice in its own house: the mad-scientist register the design language codifies — *you* for the user, *we / the agents / madder-0N* for the system, never "I"; numbers over adjectives; no hype; the madness in the concept and the copy, never the chrome. The DM Briefing, the theater, the errors, and the empty states all speak as the same cast. In connected mode, Marcus narrates the platform; DM still speaks as itself inside DM.

**L11 — Excellence is the floor, and it is reachable in the first hour.** The trainer demands until output can be excellent, without exception — and the trainer's design is constrained so that standard is achievable in 30–45 minutes by a founder with no marketing experience and no existing corpus. Both halves bind: a system that generates before it can be excellent violates the first half; a trainer that needs a week violates the second.

---

## 6. The interaction primitives

Four primitives, designed once, reused everywhere; no surface may invent a fifth. (`ux/experience-architecture.md` is formally retired by this document; the primitives live here as law, their visual treatment in `ux/design-language.md` §8, their per-screen application in `ux/screen-system.md`.)

- **P1 — Propose → review → approve.** The physical form of L3: one component family for drafts, refresh diffs, radar responses, Adjuster recommendations, calendar changes — wired to the one approval decision.
- **P2 — The diff surface.** One diff viewer for refresh diffs, refinement-round deltas, template edits, and learning-loop classifications. Change is always shown, never described.
- **P3 — Generation theater.** Long-running work rendered alive: per-stage progress, streaming where possible, cancel and resume-from-failed-stage. A five-minute generation is a lab at work, not a spinner.
- **P4 — The evidence drawer.** The physical form of L2 and L4: the universal affordance behind every score, claim, date, ranking, and routing.

---

## 7. Voice and identity

The brand is **dark matter** — the unseen mass that holds the universe together — with a flair of the mad scientist: the lab, the agents, the instruments. It is explicitly *not* the madder pigment; the madder-crimson palette is dead by design decision and never returns. The interface is near-monochrome ink with one iris ultraviolet and one emerald that means exactly one thing: an agent is working right now. The product's manifest identity inside Kinetiks chrome is the iris (`#4E49A4`) and the dark-matter halo mark (per ruling F8; `flask-conical` only as the Lucide fallback). The named agents — `madder-01`, `madder-02`, … — are the cast the copy speaks as; the live-agents block, the Briefing, and the theater are their stage. Full register, components, and chrome: `ux/design-language.md`, which this section ratifies.

---

## 8. Success

Dark Madder is judged by numbers. The sentence a customer should be able to say after twelve months is: **"My content program is doing fifteen million impressions a month, and I spend thirty minutes a month on it."** Both halves are the product: the impressions are the compounding loop working; the thirty minutes are earned autonomy working. The trajectory in between is the design — fifteen to thirty minutes a week of calm decisions at the start, thinning as trust accrues, until the operator's role is the monthly ritual plus whatever creativity they choose to add. Trust ("I stopped checking its work") and time reclaimed are the mechanisms; the numbers are the verdict.

---

## 9. Glossary

Canonical terms. Where the corpus drifted on form, the forms below win (write-back sweep filed).

- **Kinetiks** — the GTM operating system Dark Madder is an app of. Core platform: Marcus, Cortex, Oracle, the approval system, the Learning Ledger, Sentinel, Programs.
- **Marcus** — the platform's conversational AI strategist, with tool access to every connected app. Recommends DM, dispatches work to it, and rolls DM's items into the platform morning brief.
- **Cortex / Context Structure** — the platform's intelligence layer holding the account's business identity in layers (org, products, voice, customers, narrative, competitive, market, brand). Canonical for what DM trains; DM proposes into it with evidence and reads from it everywhere.
- **Oracle** — the platform's analytics intelligence: insight store, metric cache, goal tracking. All traffic/ranking data reaches DM through platform tools and the Oracle — DM ingests no analytics of its own.
- **Approval system** — the platform's confidence-based gate for consequential actions: per-category thresholds, automatic calibration, user overrides, trust contraction, the Ledger record. The mechanism behind L5.
- **Learning Ledger** — the platform's append-only log of every agent action, approval, and outcome.
- **Sentinel** — the platform's content-safety and brand-compliance review at the external boundary.
- **Program / Workflow / Task** — the platform's operated-work hierarchy under a Goal. DM's content calendar registers as the account's content Program; clusters as Workflows; pieces as Tasks.
- **Synapse** — the membrane between an app and the Kinetiks core: context pulls, proposals, commands, routing events, metrics, Sentinel submission.
- **Driving modes** — the platform's autonomy ladder: Human Drive → Approvals → Autopilot. L5 is its content expression.
- **Piece** — the canonical noun for one content item in any state, planned through published. ("Article" appears only in already-shipped CMS-facing tool names.)
- **Cluster** — a hub-and-spoke group of pieces servable around one topic; the unit of architecture and authority.
- **Territory** — a broad thematic area the org has the authority to own; the strategic layer above clusters.
- **Brief** — the structured instruction set a piece is generated from.
- **Refresh diff** — a reviewable set of changes against a live piece, each change tied to a named, evidenced problem.
- **Fast-track** (always hyphenated) — the compressed-schedule path for radar responses: 24-hour decision windows, full quality gates. Speed never skips craft.
- **The Bench** — the one-off creation lane (§4.11).
- **Voice-match score** (hyphenated) — the voice audit's composite score for a piece against the calibrated voice stack.
- **Corrections ledger** — DM-private craft rules distilled from the user's edits, with effectiveness decay. Distinct from the platform's Learning Ledger.
- **Author voice** — per-human writing identity, distinct from org voice; dm-private until the platform grows an Author concept.
- **Lexicon** — the mined customer-language store: terms, questions, objections, with receipts.
- **Freshness score** — the per-piece decay composite; pieces below threshold enter the refresh queue.
- **Monthly health report** (lowercase generic) — measurement's monthly output (§3.3).
- **DM Briefing** — the narrated summary that opens the App Home, in DM's register (§3.1).
- **Orbit / Momentum / Gravity** — DM's tiers (§2.4).
- **Standalone / connected (activated)** — the two entry modes (§2).
- **P1–P4** — the four interaction primitives (§6).

---

## 10. What this document adjudicated

Authored after the full corpus, this spec carried a coherence audit (`dm-product-spec-phase2-findings.md`) whose rulings it now embodies: the autonomy constitution (F1) extended to standalone (F2); the DM Briefing (F3); the Bench (F4); the content backbone (F5); the tiers (F6); the retirement of `experience-architecture.md` with the primitives promoted to law (F7); the manifest identity (F8); the platform-contract clarification ask (F9); the design-language file dedup (F10); the glossary's canonical forms (F11); and Monday-comes-to-you with the missed-Monday guarantee (F12). Every ruling that changes an existing document is an entry in **`dm-product-spec-writeback-ledger.md`**, to be applied in follow-up sessions — never silently.

---

*Dark Madder v2 — dm-product-spec.md — June 2026*
