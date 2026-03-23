-- ============================================================
-- Fix Supabase Security Linter Errors
-- ============================================================

-- 1. Enable RLS on tables missing it
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- 2. RLS policies for ai_memory
CREATE POLICY "Service role full access on ai_memory"
    ON public.ai_memory FOR ALL
    USING (true)
    WITH CHECK (true);

-- 3. RLS policies for plans (read-only for everyone)
CREATE POLICY "Anyone can read plans"
    ON public.plans FOR SELECT
    USING (true);

CREATE POLICY "Service role full access on plans"
    ON public.plans FOR ALL
    USING (true)
    WITH CHECK (true);

-- 4. RLS policies for product_variants
CREATE POLICY "Service role full access on product_variants"
    ON public.product_variants FOR ALL
    USING (true)
    WITH CHECK (true);

-- 5. RLS policies for webhook_configs
CREATE POLICY "Service role full access on webhook_configs"
    ON public.webhook_configs FOR ALL
    USING (true)
    WITH CHECK (true);

-- 6. RLS policies for webhook_logs
CREATE POLICY "Service role full access on webhook_logs"
    ON public.webhook_logs FOR ALL
    USING (true)
    WITH CHECK (true);

-- 7. Fix SECURITY DEFINER views → change to SECURITY INVOKER
ALTER VIEW public.contract_statistics SET (security_invoker = on);
ALTER VIEW public.lead_funnel SET (security_invoker = on);
ALTER VIEW public.manager_performance SET (security_invoker = on);

-- 8. Grants for service_role
GRANT ALL ON public.ai_memory TO service_role;
GRANT ALL ON public.plans TO service_role;
GRANT ALL ON public.product_variants TO service_role;
GRANT ALL ON public.webhook_configs TO service_role;
GRANT ALL ON public.webhook_logs TO service_role;
GRANT ALL ON public.admins TO service_role;
