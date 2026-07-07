-- ============================================================
-- FIX security_definer_view (Supabase linter ERROR ×2) — 2026-07-07
-- ============================================================
-- 20260630130000-д эдгээр view-д security_invoker = on тавьсан боловч
-- linter дахин ERROR өгөв. Шалтгаан: Postgres-д CREATE OR REPLACE VIEW нь
-- ЗААГААГҮЙ reloption-уудыг устгадаг тул mandala_setup.sql (гар setup скрипт)
-- view-үүдийг дахин үүсгэх бүрд invoker тохиргоо арчигдаж SECURITY DEFINER
-- (creator=postgres, RLS тойрдог) байдалд буцдаг байв.
--
-- Хоёр талт засвар:
--   1) Энэ migration — live DB дээр дахин баталгаажуулна (идемпотент).
--   2) mandala_setup.sql-ийн view тодорхойлолтуудад WITH (security_invoker = on)
--      нэмсэн тул скрипт дахин ажиллуулахад цаашид арчигдахгүй.
--
-- Апп эвдрэхгүй: эдгээр view-г зөвхөн /api/dashboard/units (service_role,
-- RLS-ийг тойрдог) уншдаг; browser-аас шууд query хийдэг газар алга.

ALTER VIEW IF EXISTS public.property_block_summary    SET (security_invoker = on);
ALTER VIEW IF EXISTS public.property_units_with_buyer SET (security_invoker = on);
-- meeting_monthly_summary мөн mandala_setup.sql-д дахин үүсгэгддэг тул
-- хамгаалалтын үүднээс давхар баталгаажуулна.
ALTER VIEW IF EXISTS public.meeting_monthly_summary   SET (security_invoker = on);
