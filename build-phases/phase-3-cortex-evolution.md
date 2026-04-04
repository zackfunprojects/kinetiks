# Phase 3: Cortex Evolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the goals layer to Cortex, build the system identity setup (naming, email, Slack placeholders), and restructure the Integrations view to handle both Kinetiks apps and external tools.

**Architecture:** Goals are a first-class data structure alongside the 8-layer Context Structure. They support both KPI targets and OKRs with key results. Goals map to metrics from connected apps. The system identity (name, email, Slack) is stored in `kinetiks_system_identity` and propagated across all surfaces. Budget structure is created but Oracle-powered budget proposals come in Phase 5.

**Tech Stack:** Next.js 14, TypeScript, Supabase, Tailwind CSS 4

**Spec References:**
- `docs/specs/kinetiks-product-spec-v3.md` — Sections 2 (System Identity), 8 (Cortex Tab)
- `docs/specs/analytics-goals-engine-spec.md` — Section 2 (Goal System), Section 10 (Budget System)

---

## Database Migrations

```sql
-- Goals
CREATE TABLE kinetiks_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('kpi_target', 'okr')),
  metric_key text,
  target_value numeric,
  target_period text CHECK (target_period IN ('weekly', 'monthly', 'quarterly', 'annual')),
  direction text CHECK (direction IN ('above', 'below', 'exact')),
  current_value numeric DEFAULT 0,
  contributing_apps text[] DEFAULT '{}',
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  progress_status text DEFAULT 'on_track' CHECK (progress_status IN ('on_track', 'behind', 'ahead', 'at_risk', 'critical')),
  parent_goal_id uuid REFERENCES kinetiks_goals,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Goal snapshots (time-series)
CREATE TABLE kinetiks_goal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid REFERENCES kinetiks_goals NOT NULL,
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  value numeric NOT NULL,
  snapshot_at timestamptz DEFAULT now()
);

-- Budget
CREATE TABLE kinetiks_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  total_budget numeric NOT NULL,
  currency text DEFAULT 'USD',
  period text CHECK (period IN ('weekly', 'monthly', 'quarterly')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  approval_status text DEFAULT 'draft' CHECK (approval_status IN ('draft', 'proposed', 'approved', 'active', 'closed')),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE kinetiks_budget_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid REFERENCES kinetiks_budgets NOT NULL,
  category text NOT NULL,
  app text,
  allocated_amount numeric NOT NULL,
  spent_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- System identity
CREATE TABLE kinetiks_system_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL UNIQUE,
  email_provider text,
  email_address text,
  email_credentials jsonb,
  slack_workspace_id text,
  slack_bot_user_id text,
  slack_channels text[] DEFAULT '{}',
  calendar_connected boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS on all new tables (same pattern: account_id ownership)
```

---

## Tasks

### Task 1: Goal Types and Schema
- [ ] Create `apps/id/src/lib/goals/types.ts` — KPITarget, OKR, GoalProgress, MetricMapping, GoalForecast interfaces
- [ ] Create `apps/id/src/lib/goals/schema.ts` — validation functions for goal creation/update
- [ ] Update `@kinetiks/types` to export goal types
- [ ] Commit: `feat(goals): define goal types and validation schema`

### Task 2: Goal API Routes
- [ ] Create `apps/id/src/app/api/goals/crud/route.ts` — CRUD for goals (create, read, update, archive)
- [ ] Create `apps/id/src/app/api/goals/progress/route.ts` — read goal progress (Oracle populates this in Phase 5, but the endpoint exists now)
- [ ] Implement goal-to-app mapping logic in `lib/goals/mapping.ts`
- [ ] Commit: `feat(goals): add goal CRUD and progress API routes`

### Task 3: Goals Manager UI
- [ ] Create `apps/id/src/components/cortex/GoalsManager.tsx` — list of goals with progress indicators, add/edit/archive actions
- [ ] Create `apps/id/src/components/cortex/GoalEditor.tsx` — form for creating/editing goals (supports both KPI target and OKR with key results)
- [ ] Create `apps/id/src/components/cortex/GoalCard.tsx` — individual goal display with progress bar, status badge, pace indicator
- [ ] Replace goals placeholder page with real GoalsManager
- [ ] Verify: create a KPI target, create an OKR with key results, edit, archive
- [ ] Commit: `feat(goals): add goals manager and editor UI in Cortex`

### Task 4: Budget Structure UI
- [ ] Create `apps/id/src/components/cortex/BudgetManager.tsx` — budget period configuration, allocation editor
- [ ] Create `apps/id/src/components/cortex/AllocationEditor.tsx` — per-category allocation inputs with totals
- [ ] Add budget section to Cortex Integrations page (or as a sub-nav item — decide based on UX feel)
- [ ] Wire to budget API routes (CRUD for budgets and allocations)
- [ ] Verify: create a budget, set allocations, view summary
- [ ] Commit: `feat(budget): add budget structure and allocation UI in Cortex`

### Task 5: Integrations View Rebuild
- [ ] Rebuild `cortex/integrations/page.tsx` with sections: Kinetiks Apps (deep integration), External Tools (API connectors), System Connections (email, Slack, calendar)
- [ ] Each Kinetiks app card: status, Synapse health, activity summary, activate/pause/open actions
- [ ] External tools section: connected tools list with status, "Add integration" with available connectors
- [ ] System connections section: email, Slack, calendar with status and configure buttons (actual connection logic in Phase 6)
- [ ] Verify: existing connections data displays correctly in new layout
- [ ] Commit: `feat(cortex): rebuild integrations view with apps, tools, and system connections`

### Task 6: System Identity Management
- [ ] Run database migration for `kinetiks_system_identity` table
- [ ] Create API route for reading/updating system identity
- [ ] Add system name display throughout the app — Chat tab header, any references to "the system"
- [ ] Add system name edit capability in Cortex (simple text input with save)
- [ ] Wire the setup flow (from Phase 1) to create the system identity record
- [ ] Verify: naming the system persists and displays correctly everywhere
- [ ] Commit: `feat(identity): add system identity management and name propagation`

### Task 7: End-to-End Verification
- [ ] Goals: full CRUD works, KPI targets and OKRs both create correctly
- [ ] Goals: goal cards show in Cortex with all fields
- [ ] Budget: budget structure creates and displays
- [ ] Integrations: new three-section view renders with existing data
- [ ] System identity: name saves, displays in Chat tab, persists across sessions
- [ ] All new tables have RLS policies working
- [ ] `pnpm build` passes
- [ ] Commit: `chore: phase 3 complete — Cortex evolution verified`
