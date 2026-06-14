-- 00086_jwt_rls_cutover_platform.sql
--
-- F1 (JWT staged cutover) — batch 2 of 2: the remaining account-scoped
-- platform tables (api_keys, webhooks/deliveries, metric/analytics cache,
-- crm, ai_calls/tool_calls, oracle, insights, patterns, authority_grants,
-- approvals, escalations, budget_allocations, sentinel, social, thread
-- memory, system_identity, fatigue/attribution/touchpoint ledgers).
--
-- Same swap as 00085: the inline
--   account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
-- becomes `account_id = (select public.kinetiks_account_id())` (the 00084
-- resolver, coalesce(claim, subquery) — behavior-preserving, see 00085).
--
-- Three shapes beyond the clean account_id equality, all preserved:
--   * kinetiks_ai_calls / kinetiks_tool_calls keep the `account_id IS NULL OR`
--     branch (NULL = a non-account-bound call, globally readable); only the
--     account branch is swapped.
--   * kinetiks_webhook_deliveries (via kinetiks_webhooks) and
--     kinetiks_budget_allocations (via kinetiks_budgets) scope through a
--     parent FK; only the INNER kinetiks_accounts subquery is swapped, the
--     parent join is preserved.
--   * kinetiks_insights' UPDATE policy carries both USING and WITH CHECK;
--     both are migrated.
--
-- Live policy names taken from each table's latest CREATE POLICY (after the
-- 00032/00033/00034/00036/00037/00072 drop-recreate chains). Service-role
-- and auth-admin policies are untouched. After this batch, no inlined
-- account subquery remains on any migrated kinetiks_* table; identity
-- tables (kinetiks_accounts, user_preferences) and hv_*/deskof_* are
-- deliberately out of scope.
--
-- Verified by the existing *_cross_tenant.sql suites (fallback path) plus
-- supabase/tests/jwt_cutover_platform_claim_path.sql (claim path for the
-- NULL-variant and parent-join shapes).

-- kinetiks_api_keys
ALTER POLICY "Users can read own API keys" ON public.kinetiks_api_keys USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can create own API keys" ON public.kinetiks_api_keys WITH CHECK (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own API keys" ON public.kinetiks_api_keys USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can delete own API keys" ON public.kinetiks_api_keys USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_webhooks
ALTER POLICY "Users can read own webhooks" ON public.kinetiks_webhooks USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can create own webhooks" ON public.kinetiks_webhooks WITH CHECK (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own webhooks" ON public.kinetiks_webhooks USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can delete own webhooks" ON public.kinetiks_webhooks USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_webhook_deliveries
ALTER POLICY "Users can read own webhook deliveries" ON public.kinetiks_webhook_deliveries USING (webhook_id IN (SELECT id FROM kinetiks_webhooks WHERE account_id = (select public.kinetiks_account_id())));

-- kinetiks_metric_cache
ALTER POLICY "Users read own metric_cache" ON public.kinetiks_metric_cache USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_analytics_metrics
ALTER POLICY "Users see own metrics" ON public.kinetiks_analytics_metrics USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_crm_entities
ALTER POLICY "Users read own crm_entities" ON public.kinetiks_crm_entities USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_ai_calls
ALTER POLICY "Users read own ai_calls" ON public.kinetiks_ai_calls USING (account_id IS NULL OR account_id = (select public.kinetiks_account_id()));

-- kinetiks_tool_calls
ALTER POLICY "Users read own tool_calls" ON public.kinetiks_tool_calls USING (account_id IS NULL OR account_id = (select public.kinetiks_account_id()));

-- kinetiks_oracle_runs
ALTER POLICY "Users read own oracle_runs" ON public.kinetiks_oracle_runs USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_oracle_insights
ALTER POLICY "Users see own insights" ON public.kinetiks_oracle_insights USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_insights
ALTER POLICY "Users read own insights" ON public.kinetiks_insights USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users update own insights" ON public.kinetiks_insights USING (account_id = (select public.kinetiks_account_id())) WITH CHECK (account_id = (select public.kinetiks_account_id()));

-- kinetiks_pattern_library
ALTER POLICY "Users read own pattern library" ON public.kinetiks_pattern_library USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_pattern_pending_observations
ALTER POLICY "pending_obs_select_own" ON public.kinetiks_pattern_pending_observations USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_authority_grants
ALTER POLICY "Users read own authority grants" ON public.kinetiks_authority_grants USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_approvals
ALTER POLICY "Users read own approvals" ON public.kinetiks_approvals USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_approval_thresholds
ALTER POLICY "Users read own thresholds" ON public.kinetiks_approval_thresholds USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_escalations
ALTER POLICY "Users can read own escalations" ON public.kinetiks_escalations USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own escalations" ON public.kinetiks_escalations USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_budget_allocations
ALTER POLICY "Users manage own allocations" ON public.kinetiks_budget_allocations USING (budget_id IN (SELECT id FROM kinetiks_budgets WHERE account_id = (select public.kinetiks_account_id())));

-- kinetiks_sentinel_reviews
ALTER POLICY "Users can read own sentinel reviews" ON public.kinetiks_sentinel_reviews USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own sentinel reviews" ON public.kinetiks_sentinel_reviews USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_sentinel_overrides
ALTER POLICY "Users can manage own overrides" ON public.kinetiks_sentinel_overrides USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_social_posts
ALTER POLICY "Users read own social posts" ON public.kinetiks_social_posts USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_thread_memory
ALTER POLICY "Users can read own thread memories" ON public.kinetiks_thread_memory USING (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can insert own thread memories" ON public.kinetiks_thread_memory WITH CHECK (account_id = (select public.kinetiks_account_id()));
ALTER POLICY "Users can update own thread memories" ON public.kinetiks_thread_memory USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_system_identity
ALTER POLICY "Users manage own identity" ON public.kinetiks_system_identity USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_fatigue_rules
ALTER POLICY "Users can manage own fatigue rules" ON public.kinetiks_fatigue_rules USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_attribution_touchpoints
ALTER POLICY "Users see own touchpoints" ON public.kinetiks_attribution_touchpoints USING (account_id = (select public.kinetiks_account_id()));

-- kinetiks_touchpoint_ledger
ALTER POLICY "Users can read own touchpoints" ON public.kinetiks_touchpoint_ledger USING (account_id = (select public.kinetiks_account_id()));
