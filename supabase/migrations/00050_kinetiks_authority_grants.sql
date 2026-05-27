-- ============================================================
-- 00050_kinetiks_authority_grants.sql
--
-- Phase 4 — Kinetiks Contract Addendum §2.
--
-- Authority Grants are first-class Cortex structures (peer to Budget)
-- representing scoped, time-bounded, customer-approved delegations of
-- action authority. Every consequential tool call routes through
-- authority resolution at packages/runtime/src/authority.ts; when an
-- active grant covers the action_class, the call executes without
-- per-action approval. When the grant's constraints fail or an
-- escalation trigger fires, the action escalates to the per-action
-- approval queue. When no grant covers, the existing per-tool
-- autoApproveThreshold flow is unchanged.
--
-- Hybrid schema per CLAUDE.md Lesson 2 and addendum §2.3:
--   - Top-level columns: lifecycle fields (status, expires_at, etc.),
--     scope fields (scope_type, scope_id, parent_grant_id), spending
--     envelope, multi-user placeholder, audit timestamps. These are
--     indexed and used by the resolver's hot path.
--   - jsonb columns: granted_capabilities, escalation_triggers,
--     usage_summary. Variable-shape; never queried for filtering.
--
-- Customer-facing language: the literal phrase "Authority Grant"
-- never appears in customer-rendered HTML. The
-- scope_description / capability description / escalation trigger
-- description fields render via the ActionClassDescriptor's
-- customer_template at proposal time (validator in
-- apps/id/src/lib/operators/executors/authority-agent/validate.ts
-- regex-blocks the phrase pre-persist). UI surface verifies via
-- scripts/check-authority-grant-phrase.sh.
-- ============================================================

CREATE TABLE kinetiks_authority_grants (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                        uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  team_scope_id                     text,                              -- v2 placeholder; null in v1
  granted_by                        uuid NOT NULL,                     -- user_id who approved (or proposed for system-proposed)

  -- Scope (addendum §2.3)
  scope_type                        text NOT NULL
                                    CHECK (scope_type IN ('campaign','workflow','program','standing')),
  scope_id                          text,                              -- null for standing grants
  scope_description                 text NOT NULL,                     -- plain-language; renders on customer cards

  -- Nesting (addendum §2.8)
  parent_grant_id                   uuid REFERENCES kinetiks_authority_grants(id) ON DELETE SET NULL,

  -- Lifecycle
  status                            text NOT NULL DEFAULT 'proposed'
                                    CHECK (status IN ('proposed','active','paused','revoked','expired')),
  proposed_by_agent                 text,                              -- Authority Agent invocation_id; null if user-proposed
  proposed_at                       timestamptz NOT NULL DEFAULT now(),
  granted_at                        timestamptz,                       -- set on proposed → active
  expires_at                        timestamptz,                       -- null for indefinite (standing) grants
  revoked_at                        timestamptz,                       -- set on revoked or expired
  revocation_reason                 text,                              -- free-text or canonical token

  -- Spending envelope (addendum §2.11; always operates inside Budget)
  max_unapproved_spend_per_day      numeric,                           -- null for non-spend-bearing grants
  max_unapproved_spend_per_action   numeric,                           -- null for non-spend-bearing grants
  spending_currency                 text NOT NULL DEFAULT 'USD',       -- ISO 4217

  -- Variable-shape payload (validated by the Authority Agent at
  -- proposal time and by the resolver at resolution time)
  granted_capabilities              jsonb NOT NULL,                    -- GrantedCapability[]
  escalation_triggers               jsonb NOT NULL DEFAULT '[]'::jsonb, -- EscalationTrigger[]
  usage_summary                     jsonb NOT NULL DEFAULT '{
    "action_counts": {},
    "total_spend_under_grant": 0,
    "escalations_triggered": 0,
    "outcome_metrics": {},
    "computed_at": null
  }'::jsonb,

  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),

  -- An expired or revoked grant must have its terminal timestamp set
  CHECK (status NOT IN ('revoked','expired') OR revoked_at IS NOT NULL),
  -- An active grant must have granted_at set
  CHECK (status NOT IN ('active','paused') OR granted_at IS NOT NULL),
  -- Scope/scope_id consistency per addendum §2.3: standing grants have
  -- no scope target; all other scopes must reference one.
  CHECK (
    (scope_type = 'standing' AND scope_id IS NULL) OR
    (scope_type IN ('campaign','workflow','program') AND scope_id IS NOT NULL)
  ),
  -- granted_capabilities must be a non-empty JSON array
  CHECK (jsonb_typeof(granted_capabilities) = 'array' AND jsonb_array_length(granted_capabilities) > 0),
  -- escalation_triggers must be a JSON array (can be empty)
  CHECK (jsonb_typeof(escalation_triggers) = 'array'),
  -- usage_summary must be a JSON object
  CHECK (jsonb_typeof(usage_summary) = 'object')
);

COMMENT ON TABLE kinetiks_authority_grants IS
  'Authority Grants per Kinetiks Contract Addendum §2. Scoped, time-bounded, user-approved delegations of action authority. Hybrid table: top-level lifecycle/scope/envelope columns + jsonb for granted_capabilities, escalation_triggers, usage_summary. Reads via apps/id/src/lib/cortex/authority/list.ts; writes via the Authority Agent (proposals) and customer-action Server Actions (lifecycle transitions). The literal phrase "Authority Grant" is internal name only; customer-facing copy renders via ActionClassDescriptor.customer_template.';

COMMENT ON COLUMN kinetiks_authority_grants.scope_type IS
  'Scope of the grant per §2.3. Resolution flow picks the narrowest scope: campaign > workflow > program > standing.';

COMMENT ON COLUMN kinetiks_authority_grants.parent_grant_id IS
  'For nested grants (Workflow inside Program). Child capabilities, constraints, spend envelope, and expiry must be tighter than the parent''s, validated at proposal time.';

COMMENT ON COLUMN kinetiks_authority_grants.granted_capabilities IS
  'GrantedCapability[]: action_class, plain-language description, constraints (validated against ActionClassDescriptor.constraint_schema), rate_limit, optional llm_judgment_budget_override.';

COMMENT ON COLUMN kinetiks_authority_grants.escalation_triggers IS
  'EscalationTrigger[]: type (anomaly|novelty|pacing|threshold|llm_judged), plain-language description, condition (validated against per-type Zod in packages/types/src/authority-triggers.ts).';

COMMENT ON COLUMN kinetiks_authority_grants.usage_summary IS
  'Rolling aggregate computed nightly. Action counts per action_class, total spend, escalations triggered, outcome metrics, last computed timestamp. Never mutated per-action; per-action events live as kinetiks_ledger rows with grant_id attached.';

-- ── Indexes ─────────────────────────────────────────────────
-- Resolver hot path: lookup by (account_id, status), filter by
-- expires_at, narrowest scope (scope_type, scope_id).
CREATE INDEX idx_authority_grants_resolver
  ON kinetiks_authority_grants (account_id, status, scope_type)
  WHERE status IN ('active','paused');

-- Standing-grant lookup variant (no scope_id)
CREATE INDEX idx_authority_grants_standing
  ON kinetiks_authority_grants (account_id, status)
  WHERE status = 'active' AND scope_type = 'standing';

-- Scope dispatch: (account_id, scope_type, scope_id)
CREATE INDEX idx_authority_grants_scope
  ON kinetiks_authority_grants (account_id, scope_type, scope_id)
  WHERE scope_id IS NOT NULL AND status IN ('active','paused');

-- Expiry sweep: active/paused grants past expires_at
CREATE INDEX idx_authority_grants_expiry
  ON kinetiks_authority_grants (expires_at)
  WHERE status IN ('active','paused') AND expires_at IS NOT NULL;

-- Nesting tree lookup
CREATE INDEX idx_authority_grants_parent
  ON kinetiks_authority_grants (parent_grant_id)
  WHERE parent_grant_id IS NOT NULL;

-- jsonb containment lookup for resolver: find grants whose
-- granted_capabilities array contains a capability matching an
-- action_class. The resolver query uses
--   WHERE granted_capabilities @> '[{"action_class": $X}]'::jsonb
CREATE INDEX idx_authority_grants_capabilities_gin
  ON kinetiks_authority_grants USING gin (granted_capabilities jsonb_path_ops);

-- ── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION _kt_authority_grants_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS authority_grants_touch_updated_at ON kinetiks_authority_grants;
CREATE TRIGGER authority_grants_touch_updated_at
  BEFORE UPDATE ON kinetiks_authority_grants
  FOR EACH ROW
  EXECUTE FUNCTION _kt_authority_grants_touch_updated_at();

-- ── Lifecycle state-machine trigger (backstop) ──────────────
-- Per addendum §2.3 and apps/id/src/lib/state-machines-init.ts:
--   proposed → active                    (customer approval)
--   proposed → revoked                   (customer rejection or fixture cleanup)
--   active   → paused | revoked | expired
--   paused   → active | revoked | expired
--   revoked, expired                     (terminal)
--
-- Narrowing is NOT a transition: it creates a new proposed grant; on
-- its approval, the predecessor is `revoked` with reason
-- `customer_narrowed`. The lifecycle trigger therefore does not need
-- to handle narrowing specially.
CREATE OR REPLACE FUNCTION _kt_authority_grants_check_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('revoked','expired') THEN
    RAISE EXCEPTION
      'kinetiks_authority_grants: status=% is terminal (attempted → %)', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (
    (OLD.status = 'proposed' AND NEW.status IN ('active','revoked')) OR
    (OLD.status = 'active'   AND NEW.status IN ('paused','revoked','expired')) OR
    (OLD.status = 'paused'   AND NEW.status IN ('active','revoked','expired'))
  ) THEN
    RAISE EXCEPTION
      'kinetiks_authority_grants: illegal transition % → %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stamp lifecycle timestamps automatically on entry.
  IF NEW.status = 'active' AND OLD.status = 'proposed' AND NEW.granted_at IS NULL THEN
    NEW.granted_at := now();
  END IF;
  IF NEW.status IN ('revoked','expired') AND NEW.revoked_at IS NULL THEN
    NEW.revoked_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS authority_grants_lifecycle_guard ON kinetiks_authority_grants;
CREATE TRIGGER authority_grants_lifecycle_guard
  BEFORE UPDATE OF status ON kinetiks_authority_grants
  FOR EACH ROW
  EXECUTE FUNCTION _kt_authority_grants_check_transition();

-- ── RLS ─────────────────────────────────────────────────────
-- Reads: account-scoped. Writes: service-role only.
-- (Mirrors kinetiks_pattern_library — the Authority Agent and customer-
-- action Server Actions both run under service role.)
ALTER TABLE kinetiks_authority_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own authority grants"
  ON kinetiks_authority_grants
  FOR SELECT
  USING (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );
-- No INSERT/UPDATE/DELETE policies: default deny means only service role
-- (the Authority Agent's persistence RPC + customer-action Server Actions
-- in apps/id) may mutate rows.
