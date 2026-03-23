-- ============================================================
-- Fix all Supabase Security Linter WARNINGS
-- ============================================================

-- ====================================
-- 1. Fix function_search_path_mutable
--    Dynamically set search_path on ALL public functions
-- ====================================
DO $$
DECLARE
    func_oid oid;
    func_identity text;
BEGIN
    FOR func_oid, func_identity IN
        SELECT p.oid, p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
          AND p.proname IN (
              'decrement_stock',
              'increment_property_inquiries',
              'update_user_roles_updated_at',
              'get_ai_metrics_summary',
              'exec_sql',
              'handle_new_user',
              'get_user_shop_id',
              'update_product_total_stock',
              'update_contract_timestamp',
              'update_updated_at',
              'update_ai_conversation_timestamp',
              'update_lead_timestamp',
              'update_property_timestamp',
              'update_updated_at_column',
              'handle_new_admin',
              'update_push_subscription_timestamp',
              'update_roles_updated_at',
              'handle_updated_at',
              'increment_customer_message_count',
              'reset_monthly_message_count',
              'update_customer_stats'
          )
          AND (p.proconfig IS NULL OR NOT 'search_path=' = ANY(p.proconfig))
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = %L', func_identity, '');
        RAISE NOTICE 'Fixed search_path for: %', func_identity;
    END LOOP;
END $$;

-- ====================================
-- 2. Fix rls_policy_always_true
--    Drop permissive policies, recreate scoped to service_role
-- ====================================

-- ai_memory
DROP POLICY IF EXISTS "Service role full access on ai_memory" ON public.ai_memory;
CREATE POLICY "Service role full access on ai_memory"
    ON public.ai_memory FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- plans
DROP POLICY IF EXISTS "Service role full access on plans" ON public.plans;
CREATE POLICY "Service role full access on plans"
    ON public.plans FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- product_variants
DROP POLICY IF EXISTS "Service role full access on product_variants" ON public.product_variants;
CREATE POLICY "Service role full access on product_variants"
    ON public.product_variants FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- webhook_configs
DROP POLICY IF EXISTS "Service role full access on webhook_configs" ON public.webhook_configs;
CREATE POLICY "Service role full access on webhook_configs"
    ON public.webhook_configs FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- webhook_logs
DROP POLICY IF EXISTS "Service role full access on webhook_logs" ON public.webhook_logs;
CREATE POLICY "Service role full access on webhook_logs"
    ON public.webhook_logs FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ab_experiments
DROP POLICY IF EXISTS "Admins can manage experiments" ON public.ab_experiments;
CREATE POLICY "Admins can manage experiments"
    ON public.ab_experiments FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ab_experiment_results
DROP POLICY IF EXISTS "System can insert experiment results" ON public.ab_experiment_results;
CREATE POLICY "System can insert experiment results"
    ON public.ab_experiment_results FOR INSERT TO service_role
    WITH CHECK (true);

-- ai_analytics
DROP POLICY IF EXISTS "System can insert analytics" ON public.ai_analytics;
CREATE POLICY "System can insert analytics"
    ON public.ai_analytics FOR INSERT TO service_role
    WITH CHECK (true);

-- conversion_funnel
DROP POLICY IF EXISTS "System can insert funnel data" ON public.conversion_funnel;
CREATE POLICY "System can insert funnel data"
    ON public.conversion_funnel FOR INSERT TO service_role
    WITH CHECK (true);

-- feedback
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback;
CREATE POLICY "Anyone can submit feedback"
    ON public.feedback FOR INSERT TO authenticated
    WITH CHECK (true);

-- push_subscriptions
DROP POLICY IF EXISTS "Service role can manage push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Service role can manage push subscriptions"
    ON public.push_subscriptions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ====================================
-- 3. Move vector extension to extensions schema
-- ====================================
DO $$
BEGIN
    CREATE SCHEMA IF NOT EXISTS extensions;
    ALTER EXTENSION vector SET SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not move vector extension: %. Skipping.', SQLERRM;
END $$;
