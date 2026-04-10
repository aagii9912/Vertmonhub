-- Fix Supabase Database Linter WARN-level Issues
-- 1. Function search_path mutable (11 functions)
-- 2. RLS policy always true (9 tables)

-- ============================================
-- FIX: Set search_path on all mutable functions
-- Prevents search_path injection attacks
-- ============================================

ALTER FUNCTION public.update_roles_updated_at() SET search_path = '';
ALTER FUNCTION public.update_contract_timestamp() SET search_path = '';
ALTER FUNCTION public.update_lead_timestamp() SET search_path = '';
ALTER FUNCTION public.handle_updated_at() SET search_path = '';
ALTER FUNCTION public.handle_new_admin() SET search_path = '';
ALTER FUNCTION public.increment_property_inquiries() SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.update_user_roles_updated_at() SET search_path = '';
ALTER FUNCTION public.update_property_timestamp() SET search_path = '';
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.reserve_stock(UUID, INT) SET search_path = '';

-- ============================================
-- FIX: Overly permissive RLS policies
-- "Service role full access" with USING(true) applies to ALL roles.
-- service_role already bypasses RLS, so these policies are redundant
-- AND they give unrestricted access to anon/authenticated roles.
-- Fix: Drop them. service_role still works (bypasses RLS by design).
-- ============================================

DROP POLICY IF EXISTS "Service role full access" ON public.ad_campaigns;
DROP POLICY IF EXISTS "Service role full access" ON public.ai_agents;
DROP POLICY IF EXISTS "Service role full access" ON public.brand_mentions;
DROP POLICY IF EXISTS "Service role full access" ON public.content_calendar;
DROP POLICY IF EXISTS "Service role full access" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Service role full access" ON public.message_campaigns;
DROP POLICY IF EXISTS "Service role full access" ON public.social_posts;
DROP POLICY IF EXISTS "Service role full access" ON public.web_analytics;

-- usage_logs: "System can insert usage" INSERT with CHECK(true) — also overly permissive
DROP POLICY IF EXISTS "System can insert usage" ON public.usage_logs;
