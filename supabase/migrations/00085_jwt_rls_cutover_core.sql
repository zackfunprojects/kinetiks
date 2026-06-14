-- 00085_jwt_rls_cutover_core.sql
--
-- F1 (JWT staged cutover) — batch 1 of 2: core context layers, core
-- platform tables, ledger/goals/budgets, Marcus, and connections.
--
-- Migrates every account-scoped RLS policy on these tables from the inline
--   account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
-- subquery to the canonical resolver introduced in 00084:
--   account_id = (select public.kinetiks_account_id())
--
-- kinetiks_account_id() = coalesce(JWT account_id claim, the same subquery),
-- so this is behavior-preserving: when the prod hook's claim is present RLS
-- is a fast top-level equality; when it is absent the helper falls back to
-- the exact subquery these policies used before. A tenant cannot be locked
-- out in either direction (claim and subquery resolve the same account;
-- kinetiks_accounts.user_id is UNIQUE).
--
-- ALTER POLICY is non-destructive and atomic — it rewrites the predicate in
-- place with no window where the policy is absent. The wrapping
-- `(select ...)` makes the planner evaluate the resolver once per statement
-- (initplan), not per row.
--
-- kinetiks_marcus_messages scopes through its parent thread; only the inner
-- kinetiks_accounts subquery is swapped, the thread join is preserved.
--
-- Tables NOT touched here ship in 00086 (batch 2). Identity tables
-- (kinetiks_accounts, user_preferences, thread_memory), service-role, and
-- auth-admin policies are never migrated; hv_* and deskof_* are out of scope.
--
-- Cross-tenant isolation is verified by the existing *_cross_tenant.sql
-- suites (which exercise the subquery FALLBACK path, claim absent) plus the
-- new supabase/tests/jwt_cutover_core_claim_path.sql (which sets the
-- account_id claim and proves claim-path isolation and that the claim is
-- authoritative through a real migrated policy).

-- kinetiks_context_org
ALTER POLICY "Users can read own org context" ON public.kinetiks_context_org USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own org context" ON public.kinetiks_context_org USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can insert own org context" ON public.kinetiks_context_org WITH CHECK (account_id = (select public.kinetiks_account_id()));

-- kinetiks_context_products
ALTER POLICY "Users can read own products context" ON public.kinetiks_context_products USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own products context" ON public.kinetiks_context_products USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can insert own products context" ON public.kinetiks_context_products WITH CHECK (account_id = (select public.kinetiks_account_id()));

-- kinetiks_context_voice
ALTER POLICY "Users can read own voice context" ON public.kinetiks_context_voice USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own voice context" ON public.kinetiks_context_voice USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can insert own voice context" ON public.kinetiks_context_voice WITH CHECK (account_id = (select public.kinetiks_account_id()));

-- kinetiks_context_customers
ALTER POLICY "Users can read own customers context" ON public.kinetiks_context_customers USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own customers context" ON public.kinetiks_context_customers USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can insert own customers context" ON public.kinetiks_context_customers WITH CHECK (account_id = (select public.kinetiks_account_id()));

-- kinetiks_context_narrative
ALTER POLICY "Users can read own narrative context" ON public.kinetiks_context_narrative USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own narrative context" ON public.kinetiks_context_narrative USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can insert own narrative context" ON public.kinetiks_context_narrative WITH CHECK (account_id = (select public.kinetiks_account_id()));

-- kinetiks_context_competitive
ALTER POLICY "Users can read own competitive context" ON public.kinetiks_context_competitive USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own competitive context" ON public.kinetiks_context_competitive USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can insert own competitive context" ON public.kinetiks_context_competitive WITH CHECK (account_id = (select public.kinetiks_account_id()));

-- kinetiks_context_market
ALTER POLICY "Users can read own market context" ON public.kinetiks_context_market USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own market context" ON public.kinetiks_context_market USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can insert own market context" ON public.kinetiks_context_market WITH CHECK (account_id = (select public.kinetiks_account_id()));

-- kinetiks_context_brand
ALTER POLICY "Users can read own brand context" ON public.kinetiks_context_brand USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own brand context" ON public.kinetiks_context_brand USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can insert own brand context" ON public.kinetiks_context_brand WITH CHECK (account_id = (select public.kinetiks_account_id()));

-- kinetiks_app_activations
ALTER POLICY "Users can read own app activations" ON public.kinetiks_app_activations USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can insert own app activations" ON public.kinetiks_app_activations WITH CHECK (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own app activations" ON public.kinetiks_app_activations USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_confidence
ALTER POLICY "Users can read own confidence" ON public.kinetiks_confidence USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_imports
ALTER POLICY "Users can read own imports" ON public.kinetiks_imports USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can insert own imports" ON public.kinetiks_imports WITH CHECK (account_id = (select public.kinetiks_account_id()));

-- kinetiks_billing
ALTER POLICY "Users can read own billing" ON public.kinetiks_billing USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_proposals
ALTER POLICY "Users can read own proposals" ON public.kinetiks_proposals USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_routing_events
ALTER POLICY "Users can read own routing events" ON public.kinetiks_routing_events USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_synapses
ALTER POLICY "Users can read own synapses" ON public.kinetiks_synapses USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_ledger
ALTER POLICY "Users can read own ledger" ON public.kinetiks_ledger USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_goals
ALTER POLICY "Users manage own goals" ON public.kinetiks_goals USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_budgets
ALTER POLICY "Users manage own budgets" ON public.kinetiks_budgets USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_goal_snapshots
ALTER POLICY "Users see own snapshots" ON public.kinetiks_goal_snapshots USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_marcus_threads
ALTER POLICY "Users can read own threads" ON public.kinetiks_marcus_threads USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own threads" ON public.kinetiks_marcus_threads USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can delete own threads" ON public.kinetiks_marcus_threads USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_marcus_messages
ALTER POLICY "Users can read own messages" ON public.kinetiks_marcus_messages USING (thread_id IN (SELECT id FROM kinetiks_marcus_threads WHERE account_id = (select public.kinetiks_account_id())));

-- kinetiks_marcus_schedules
ALTER POLICY "Users can read own schedules" ON public.kinetiks_marcus_schedules USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own schedules" ON public.kinetiks_marcus_schedules USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_marcus_alerts
ALTER POLICY "Users can read own alerts" ON public.kinetiks_marcus_alerts USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own alerts" ON public.kinetiks_marcus_alerts USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can delete own alerts" ON public.kinetiks_marcus_alerts USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_marcus_follow_ups
ALTER POLICY "Users can read own follow-ups" ON public.kinetiks_marcus_follow_ups USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_connections
ALTER POLICY "Users read own connections" ON public.kinetiks_connections USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_connection_sync_logs
ALTER POLICY "Users can read own sync logs" ON public.kinetiks_connection_sync_logs USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_sync_logs
ALTER POLICY "Users read own sync_logs" ON public.kinetiks_sync_logs USING (account_id = (select public.kinetiks_account_id()));
