# Marketing Stack

> Written by /start-here. Shared across all Kinetiks brands.

## Platform

| Component | Technology | Notes |
|-----------|-----------|-------|
| Framework | Next.js 14 (App Router) | Turborepo monorepo |
| Database | Supabase (Postgres + Auth + Edge Functions) | Single project, table prefixes per app |
| AI | Claude API (Sonnet for agents, Haiku for lightweight) | @kinetiks/ai wrapper |
| Styling | Tailwind CSS 4 | Shared design tokens in @kinetiks/ui |
| Hosting | Vercel | Separate deployment per app |
| Package Manager | pnpm | Workspace protocol |

## Connected Tools

| Tool | Type | Status | Config |
|------|------|--------|--------|

## MCP Servers

| Server | Tools Available | Status |
|--------|----------------|--------|

## Not Connected (Recommended)

| Tool | Why | Setup |
|------|-----|-------|
| Replicate | AI image and video generation for /creative | Add REPLICATE_API_TOKEN to .env |
