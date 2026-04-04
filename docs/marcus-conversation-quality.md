# Marcus Conversation Quality System

## Problem

Marcus was generating responses that violated its own voice spec:
1. Generic advice with no data citations
2. Responses 4-6 paragraphs when spec says 5-8 sentences
3. Sycophantic praise ("your positioning is sharp") without evidence
4. No acknowledgment of data gaps or system disconnections
5. False promises about disconnected apps ("I've queued briefs to Harvest")
6. Restating user input instead of adding new information

## Solution Architecture

A three-layer enforcement system:

### Layer 1: Data Availability Manifest
Before every response, `context-assembly.ts` builds a `DataAvailabilityManifest` that tells Marcus exactly what data it has, what systems are connected, and what gaps exist. This manifest is injected into the system prompt.

### Layer 2: Hard-Constraint System Prompt
The system prompt (`prompts/marcus-system.ts`) includes:
- Evidence rules: every claim must cite data or be flagged as speculation
- Connection awareness: never promise actions through disconnected systems
- Anti-sycophancy: specific phrases that are prohibited
- Anti-restatement: don't repeat what the user said
- Length constraints: max sentences per intent type

### Layer 3: Post-Generation Validation
After Sonnet generates a response, `validators/response-validator.ts` checks for:
- Sycophancy patterns (regex matching)
- False promises about disconnected apps
- Verbosity (sentence counting)
- Restatement of user input

If validation fails, a Haiku rewrite is requested with specific fix instructions. If the rewrite also fails, a safe fallback response is used.

## Key Files

- `lib/marcus/types.ts` - DataAvailabilityManifest types
- `lib/marcus/context-assembly.ts` - Manifest generation (buildDataAvailabilityManifest)
- `lib/marcus/prompts/marcus-system.ts` - System prompt builder (v2)
- `lib/marcus/prompts/marcus-evidence-rules.ts` - Evidence, sycophancy, restatement rules
- `lib/marcus/prompts/marcus-validation.ts` - Haiku rewrite prompt
- `lib/marcus/validators/response-validator.ts` - Main validation orchestrator
- `lib/marcus/validators/evidence-checker.ts` - Evidence + sycophancy + promise checking
- `lib/marcus/validators/verbosity-checker.ts` - Length enforcement
- `lib/marcus/engine.ts` - Pipeline integration (manifest -> prompt -> generate -> validate -> rewrite -> deliver)

## Adding New Violation Patterns

To add a new sycophancy pattern, add a regex to `SYCOPHANCY_PATTERNS` in `evidence-checker.ts`. To add a new false-promise pattern, add to `PROMISE_PATTERNS`. Both are arrays - just append.

## Monitoring

Validation results are logged to the Learning Ledger under event_type `marcus_response_validation`. Track:
- `validation_passed` rate (target: >90% after prompt stabilizes)
- `was_rewritten` rate (target: <10%)
- `violation_types` distribution (identify which rules fire most)

If rewrite rate stays above 20%, the system prompt needs tuning - the rules are catching too many false positives or the generation prompt isn't strict enough.
