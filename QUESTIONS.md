# Open Questions

> Track ambiguity, deferred decisions, and items that need explicit confirmation. Keep entries terse; resolution is captured in a PR or a follow-up commit.

---

## Phase D (communication layer)

### Slack inbound: Events API contract implemented directly, not via @slack/bolt (D3, 2026-06-11)

The plan named "Slack Bolt"; D3 implements the receiver contract
directly in Next route handlers instead. Every rule the contract
exists for holds and is unit-tested - raw-body HMAC verification,
5-minute replay rejection, 3-second ack with post-response processing
(Vercel waitUntil), retry dedup via claim rows, workers reusing the
same server actions as the web UI. Bolt itself is a long-running-
receiver framework that fights the serverless route model (custom
receiver adapters, double body parsing for signatures) and would add
cold-start weight for no contract gain at this event volume. If a
later phase needs Bolt's middleware ecosystem (Socket Mode, OAuth
install flows at scale), the routes are thin enough to swap the
receiver without touching the workers. Flag here per "ask when the
spec is ambiguous" - the tech-stack line in CLAUDE.md still says
"Slack: Slack Bolt"; update it if this direction is confirmed.


### Inbound email: proposal routing + reply-thread mapping — FOLLOW-UPS (D4, 2026-06-11)

Two comms-spec capabilities are deliberately staged behind the D4
inbound pipeline:

1. **Business context → Cortex Proposals** (spec §2.2 routing table).
   D4 routes ALL relevant extractions through the Insight Store
   (composition with an existing primitive); high-confidence business
   context should eventually also submit a Proposal so the Archivist
   can merge it into the Context Structure. Needs a decision on which
   categories clear the proposal bar and which layer each maps to.
2. **Replies to system-sent email → chat-thread continuation** (spec
   §2.2). Requires storing the Gmail message-id ↔ kinetiks thread
   mapping at send time (lib/email/sender.ts returns message_id; a
   mapping table or thread column would close the loop). Today such
   replies classify as `reply_to_system` and surface as chat-channel
   insights, which is honest but not thread-continuous.

### Microsoft 365 system connection — DEFERRED (D1, 2026-06-11)

The comms spec (§2.1, §4.1) names Microsoft 365 as a peer email/calendar
provider, but no Azure app registration exists (no `MICROSOFT_365_*`
credentials configured anywhere, including production). D1 ships Google
Workspace + Google Calendar + Slack fully real and leaves M365 as an
explicit seam: one entry in
`apps/id/src/lib/connections/system-providers.ts` plus a `microsoft`
oauth kind in `system-oauth.ts` when the registration exists. Building
the Graph integration now would be untestable dead code — the exact
Phase 6 failure shape the 2026-06-09 audit flagged. Needs: Zack to
create the Azure app registration when M365 demand is real.

---

## Pattern Library Phase 1 (L1a)

### Discriminated-union refactor of `LedgerEntry.detail`

Currently `LedgerEntry.detail` is `Record<string, unknown>` and the `LedgerEventType` union is a flat string union with no DB CHECK constraint. The Pattern Library Phase 1 keeps this shape and relies on writer-side helpers to enforce per-event detail shape.

A typed discriminated union per event type would tighten the contract. Cost: every existing Ledger writer (including Edge Functions that write strings outside the current union) needs updating. Benefit: compile-time guarantees on `detail` shape, easier reviewer load on new event types.

Decision deferred. Open for a separate structural improvement phase.

### DB CHECK constraint on `kinetiks_ledger.event_type` — RESOLVED (Phase 4.5, 2026-05-27)

The CHECK constraint `kinetiks_ledger_event_type_valid` is now fully validated against all rows. Audit at `docs/operational/phase-4.5-audit-2026-05-27.md` found 11 distinct event_types in production (146 rows); 9 were canonical and 2 (`cartographer_crawl`, `cartographer_calibrate`) were legacy from early Phase 1 Cartographer development. Both legacy types were preserved by adding them to the union (real events with stable detail shapes, not typos). Migrations 00061 (reconcile) and 00062 (VALIDATE CONSTRAINT) closed the NOT VALID debt that had accumulated across Phases 1.5, 2, 4, and 5. The probe at the end of the audit confirmed the validated constraint rejects deliberately-invalid event_types at INSERT time.

`LedgerEventDetailMap` in `packages/types/src/billing.ts` was extended with the two new keys so the TS-side and DB-side unions match exactly.

### Confidence formula constants

Phase 1 ships pinned constants (`w_obs=0.5`, `w_recency=0.2`, `w_stability=0.3`, `k_obs=8`, `k_recency=effective_decay_days/2`) in the Kinetiks Contract Addendum §1.6. These were chosen for shipping; they will likely be revisited once enough emissions produce real signal. Phase 2 calibration adjusts `effective_decay_days` within bounds; the formula weights themselves may also be tuned.

**Update (apps/id-only scope, fixture substrate).** Originally gated on the first two weeks of real Harvest emissions. With suite-app work paused, this signal is now measurable against the Phase 1.5 fixture stream — fixtures emit through the same Synapse path and write Ledger entries with full provenance, so the 14-day window can run against fixture data. **Caveat:** when real suite apps eventually land, recalibrate against a blended window of fixture + first real emissions before pinning new constants. Fixtures are designed for statistical plausibility, not realism, so leaning on them alone for final weight tuning risks fitting to the generator distributions rather than the customer distributions.

### Cortex Patterns UI: Budget tab inclusion

CLAUDE.md declares the seven-section Cortex sub-nav: Identity → Goals → Budget → Patterns → Authority → Integrations → Ledger. Phase 1 shipped Patterns alongside the four pre-existing tabs (Identity, Goals, Integrations, Ledger). Budget and Authority are queued.

**Update (Phase 1.6 scheduled).** Budget is the next phase — `apps/id/src/components/cortex/BudgetManager.tsx` is currently rendered inside the Integrations tab and gets promoted to its own sub-tab at `/cortex/budget`. Authority gets a disabled placeholder nav item in the same phase to complete the visual seven-section spec; the real Authority sub-tab ships in Phase 4. See `docs/build-phases/upcoming/phase-1.6-budget-and-authority-nav.md`.

### State machines module location drift (now resolved)

CLAUDE.md previously referenced `@kinetiks/cortex/state-machines.ts` in three places (lines 440, 510, 526), but the actual module is `@kinetiks/lib/state-machines`. Resolved in the L1a commit "chore(claude-md): fix Lessons #2 hybrid-shape contradiction; flag state-machine drift." Future work that touches state-machine code should keep the rule that the canonical module is `@kinetiks/lib/state-machines`, with registration in `apps/id/src/lib/state-machines-init.ts`.

If a future refactor moves state machines back into `@kinetiks/cortex`, update CLAUDE.md and the Kinetiks Contract Addendum's §1.6 reference.

---

## L1b: canonical alignment landed

The six L1a divergences from the canonical addendum (Kinetiks Contract
Addendum.md) have been resolved in the L1b phase per the author's
decisions on return. Recording the resolution here.

### 1. Storage shape — RESOLVED: keep L1a hybrid; canonical updated

The L1a hybrid posture (top-level lifecycle/outcome/evidence/override
columns + jsonb for variable-shape payload only) stays in place per
the canonical §1.5 read-path requirement (filtering and ranking on
indexed columns). The canonical §1.2 was updated in commit
`docs(addendum): §1.2 acknowledge hybrid storage; §1.3 add bucketize`
to acknowledge the hybrid explicitly and cite the indexing rationale.
CLAUDE.md Lessons #2 already reflected this; the canonical doc now
matches.

### 2. Outcome metrics — RESOLVED: aligned to canonical single-primary

The L1a `outcome_metrics: PatternOutcomeMetric[]` array shape was
refactored to canonical single-primary (`outcome_metric`,
`outcome_value`, `outcome_direction`, `baseline_value`, `lift_ratio`)
on both the Pattern row and the PatternEmissionPayload. Multi-outcome
insights are now modeled as separate pattern types sharing
fingerprint dimensions. The seven Harvest seed descriptors reflect
the split (`outreach_angle_performance.reply_rate`,
`outreach_angle_performance.meeting_book_rate`, etc.). Pattern-write
merge logic uses Welford's parallel algorithm to combine outcome
samples + variances with running mean updates. `lift_ratio` drives
list-helper ranking per §1.5.

### 3. Field rename — RESOLVED: `emitting_app` → `source_app`

Migration 00041 drops + recreates `kinetiks_pattern_library` with the
canonical column name. Every read path, write path, UI, API endpoint,
Synapse client, and Marcus brief now reads/writes `source_app`. The
read helper exports `listPatternTypesForSourceApp`;
`listPatternTypesForEmittingApp` is a deprecated alias kept during
the transition for any out-of-tree callers.

### 4. Missing canonical fields — RESOLVED: added to the row

Migration 00041 adds top-level columns for `source_workflow_id`
(nullable; Phase 3 wires it), `variance` (nullable; Welford-updated
on merge), `imported` (boolean), `imported_from` (jsonb,
`{ account_id, exported_at }`). The import endpoint now sets
`imported=true` and stamps a hashed source account id at insert time.

### 5. Export payload — RESOLVED: full canonical alignment

Export emits `export_type: 'full' | 'filtered'` (driven by request
filters), `filters: PatternExportRequest` (echo), and
`pattern_type_registry_snapshot: PatternTypeDescriptorSnapshot[]`
(serializable subset of every descriptor present in the export).
`schema_version: '1.0.0'` matches canonical §1.7. Import consumes the
new shape.

### 6. Bucketize spec — RESOLVED: added to canonical §1.3

The canonical §1.3 was updated to declare `bucketize` and
`expected_max_fingerprints_per_account` as first-class descriptor
fields with the cardinality-discipline rationale stated explicitly.

---

## L1b: additional structural improvements landed

### LedgerEntry discriminated union — RESOLVED: tightened with open extension

`LedgerEntry.detail` is now typed via `LedgerEventDetailMap[K] & { [key: string]: unknown }` — a discriminated union per event_type
plus an open extension so legacy writers that include richer detail
keep compiling. `LedgerEventType` is derived from the map keys
(single source of truth). Migration 00042 adds a CHECK constraint on
`kinetiks_ledger.event_type` enforcing the union at the DB layer
(audited 38 event types currently written across the codebase).

**Caveat:** the CHECK was applied with `NOT VALID` because production
already contained `kinetiks_ledger` rows with `event_type` values
outside the union (their identities are not in the transcript per the
production-read safety gate). NOT VALID enforces the constraint on
all future INSERTs and UPDATEs while grandfathering existing rows. A
follow-up pass should:

  1. Query `SELECT DISTINCT event_type FROM kinetiks_ledger WHERE event_type NOT IN (...)`
     to identify the legacy values.
  2. Either map them to canonical names via UPDATE statements, or
     extend the union (and the CHECK) to include them.
  3. Run `ALTER TABLE kinetiks_ledger VALIDATE CONSTRAINT kinetiks_ledger_event_type_valid`
     to mark the constraint fully enforced.

Until step 3, the DB-layer guarantee is "future writes only." Codebase
writes already conform to the union (commit "feat(types+tools)" audit).

**Status — RESOLVED (Phase 4.5, 2026-05-27).** Migrations 00061
(reconcile + drop/recreate union to include the two legacy
`cartographer_*` types found in production) and 00062 (`ALTER TABLE
kinetiks_ledger VALIDATE CONSTRAINT kinetiks_ledger_event_type_valid`)
shipped together. The phase plan moved to
`docs/build-phases/built/phase-4.5-ledger-check-validate.md`. The
NOT VALID caveat above no longer applies — the constraint enforces
against ALL rows, not just future writes.

### Confidence formula constants — HELD; measurable against fixtures

Phase 1 pinned constants (w_obs=0.5, w_recency=0.2, w_stability=0.3,
k_obs=8, k_recency=effective_decay_days/2) per canonical §1.6.

**Update (apps/id-only scope).** Originally held until two weeks of
real Harvest emissions. With suite apps paused and the Phase 1.5
fixture stream supplying volume, the 14-day window is now measurable
against fixture data with full Ledger provenance. Recalibrate weights
once the fixture run produces signal across all seven Harvest types.
When real suite apps eventually land, do a second recalibration
against a blended window of fixture + first real emissions before
pinning final constants — fixtures are designed for plausibility, not
realism, so weight tuning on fixtures alone risks fitting the
generator distributions instead of the customer distributions.

### Cortex Patterns UI: Budget tab — SCHEDULED (Phase 1.6)

Phase 1 shipped Patterns only. Phase 1.6 promotes `BudgetManager` out
of the Integrations tab to its own sub-tab at `/cortex/budget` and
adds a disabled Authority placeholder nav item. See
`docs/build-phases/upcoming/phase-1.6-budget-and-authority-nav.md`.

---

## L1b: acceptance criteria

The Pattern Library is now canonical-aligned. Original gating was the
14-day window on real Harvest emissions. Under the current apps/id-only
scope, the same criteria are measured against the Phase 1.5 fixture
stream:

1. Within 14 days of fixture emissions ramping (or, when suite apps
   land, the first real Harvest emissions), at least one pattern of
   each of the seven registered Harvest pattern types must reach
   `validated` status. If none do, the descriptor's bucketization is
   too narrow OR the fixture generator's variance is too high —
   revisit before adding pattern types.
2. Marcus's evidence brief should include a `[RELEVANT PATTERNS]`
   block for any chat turn where at least one validated pattern
   exists for the customer's ICP. Verify the response weaves the
   implication into the recommendation rather than dumping raw
   statistics. Fixture-sourced patterns count for this check; the
   evidence brief reads `source_app`-agnostically by design.
3. The export/import round-trip should preserve the `dimensions`
   blob and the canonical outcome shape verbatim, halve the
   confidence on import, and emit a `pattern_imported` Ledger entry
   with `imported_from_account_id_hash` for every imported pattern.
4. The `archivist-cron` 6-hour sweep should transition any
   `validated` pattern with `last_observed_at > effective_decay_days
   * 0.7` to `declining`, and any `declining` pattern past `decay_at`
   to `archived`. User-starred patterns remain exempt.

If any of these fail (against either fixtures or real emissions),
surface in this file as a new open question; do not paper over with
looser thresholds.

---

## Desktop native shell (Phase 1)

### Desktop icon assets - design dependency

`apps/desktop` needs branded icons: a source `icon.png`, macOS `.icns`, Windows `.ico`, and a monochrome `trayTemplate.png` (+ `tray.png`). None exist yet, so `src/main/tray.ts` falls back to an embedded placeholder and electron-builder uses the default Electron icon. Required files are documented in `apps/desktop/assets/README.md`. Needs final art from design before Phase 4 packaging/signing; wire `.icns`/`.ico` into `electron-builder.yml` at that point.

### Design spec silent on desktop window chrome

`design/kinetiks-design-spec.md` covers the web UI but says nothing about the desktop window shell: titlebar height/treatment, vibrancy/material, traffic-light inset, window radius. Phase 1 enabled macOS vibrancy behind opaque content (no visual change yet). The custom integrated titlebar lands in Phase 2 and needs design direction (or new `--kt-*` chrome tokens) rather than invented values.
