-- SmartHub Security Fixes
-- Fix RLS and function search_path issues



-- ============================================
-- 2. Fix function search_path security issues
-- ============================================

-- Fix get_user_shop_id
ALTER FUNCTION public.get_user_shop_id() SET search_path = public;

-- Fix update_updated_at
ALTER FUNCTION public.update_updated_at() SET search_path = public;

-- Fix update_customer_stats
ALTER FUNCTION public.update_customer_stats() SET search_path = public;

SELECT 'Security fixes applied successfully! ✅' as result;
