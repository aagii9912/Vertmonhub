-- ============================================================
-- FIX security_definer_view (Supabase linter ERROR ×3) — 2026-06-30
-- ============================================================
-- property_units (20260624120000) болон meeting analytics (20260624130000)-д
-- нэмсэн 3 view нь security_invoker-гүй тул SECURITY DEFINER (creator=postgres)
-- байдлаар ажиллаж, асууж буй хэрэглэгчийн RLS-ийг тойрдог → multi-tenant
-- задрах эрсдэл. 20260609130000-ийн загвараар security_invoker = on болгоно
-- (view нь base table-уудын shop-scoped RLS-ийг мөрдөнө; service_role
-- сервер талд RLS-ийг тойрдог тул апп эвдрэхгүй).

ALTER VIEW IF EXISTS public.property_block_summary   SET (security_invoker = on);
ALTER VIEW IF EXISTS public.property_units_with_buyer SET (security_invoker = on);
ALTER VIEW IF EXISTS public.meeting_monthly_summary  SET (security_invoker = on);
