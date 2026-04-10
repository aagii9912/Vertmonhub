-- Fix Supabase Database Linter Errors

-- ============================================
-- FIX: SECURITY DEFINER views → SECURITY INVOKER
-- ============================================

ALTER VIEW public.manager_performance SET (security_invoker = true);
ALTER VIEW public.contract_statistics SET (security_invoker = true);
ALTER VIEW public.lead_funnel SET (security_invoker = true);

-- ============================================
-- FIX: Enable RLS on webhook tables
-- These tables are only accessed server-side via supabaseAdmin() (service_role).
-- Enabling RLS with NO policies = only service_role can access.
-- This is the correct security posture for webhook infrastructure tables.
-- ============================================

ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
