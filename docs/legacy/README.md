# docs/legacy

Historical reference. Superseded specs, retired product directions, and earlier iterations of canonical docs. **Never build from anything in this folder.**

Markdown files in this folder have a top-of-file supersession note. Binary files (`.docx`) cannot be annotated in place — the supersession map for binaries lives below.

---

## Binary supersession map

| File | What it was | Supersedes / superseded by |
|---|---|---|
| `Kinetiks Product Spec (1).docx` | Earlier product spec (v1-era) | Superseded by `../kinetiks-product-spec-v3.md` |
| `Kinetiks Product Spec Addendum.docx` | Addendum to an earlier product spec | Superseded by `../kinetiks-product-spec-v3.md` |
| `Kinetiks Agent Architecture v2.docx` | Earlier agent architecture writeup | Superseded by `../kinetiks-core-architecture-v2.md` and `../platform-contract.md` |
| `Kinetiks_Agent_Native_Architecture.docx` | Earlier "agent-native" architecture pitch | Superseded by `../kinetiks-core-architecture-v2.md` |
| `Kinetiks Cross App Intelligence Spec.docx` | Earlier cross-app intelligence design | Superseded by `../specs/cross-app-command-router-spec.md` |
| `Kinetiks Sentinel Spec.docx` | Earlier Sentinel (content review / brand safety) spec | Superseded by `packages/sentinel/` source code (the architecture moved into the codebase) |
| `Marcus Operator Spec.docx` | Earlier Marcus operator design doc | Superseded by `../specs/marcus-engine-v2-plan.md` |

---

## Markdown files in this folder

Each has a top-of-file supersession note. Quick map:

- `KNOWLEDGE_INTEGRATION.md` — preserved guidance for `@kinetiks/ai` knowledge loading; canonical references are `../kinetiks-product-spec-v3.md` and `../platform-contract.md`
- `Marcus Core Prompt.md` — superseded by `../specs/marcus-engine-v2-plan.md`
- `Marcus_CLAUDE_MD_Addendum.md` — superseded by the live root `CLAUDE.md`
- `Slack_Setup_Guide.md` — runbook reference; canonical behavior in `../specs/agent-communication-layer-spec.md`

---

## Subfolders

- `deskof/` — DeskOf documentation. DeskOf is being spun out of the Kinetiks monorepo per the roadmap. Material is preserved here as historical reference until the spinoff repo is created and these files migrate there.
- `terminal/` — The retired Kinetiks Terminal product direction. Superseded by `../kinetiks-product-spec-v3.md`.
