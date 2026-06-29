-- ============================================================
-- ГАРААР АЖИЛЛУУЛАХ — Legacy e-commerce schema устгах (DESTRUCTIVE)
-- ============================================================
-- ⚠⚠ ЭНЭ ФАЙЛ migrations/ ДОТОР БИШ — auto-apply (supabase db push) хийгдэхгүй.
--   Хүснэгт бүхэлд нь устгадаг тул БУЦААХ БОЛОМЖГҮЙ. Зөвхөн:
--     1) products/orders/order_items/discount_schedules-д өгөгдөл байхгүй / хэрэггүй,
--     2) BACKUP / staging туршилт хийсэн,
--   гэдгийг баталсны дараа PRODUCTION дээр гараар ажиллуулна уу.
--
-- Шалтгаан: CLAUDE.md — Syncly e-commerce surface устгагдсан; эдгээр хүснэгт
--   аппд уншигддаггүй, "future destructive migration"-д төлөвлөгдсөн.
--   20260608160000 нь customers дээрх legacy баганыг (total_orders/total_spent/
--   is_vip) аль хэдийн устгасан; энэ нь үлдсэн хүснэгт + FK баганыг цэвэрлэнэ.
--
-- ⚠ Устгахаас өмнө мөрийн тоог хараарай:
--   SELECT 'products' t, count(*) FROM products
--   UNION ALL SELECT 'orders', count(*) FROM orders
--   UNION ALL SELECT 'order_items', count(*) FROM order_items
--   UNION ALL SELECT 'discount_schedules', count(*) FROM discount_schedules;

BEGIN;

-- 1) Бусад хүснэгт дэх orphan FK баганыг устгах (CASCADE нь FK constraint-ийг
--    автоматаар устгана; багана өөрөө үлддэг тул эндээс устгана).
ALTER TABLE public.email_logs    DROP COLUMN IF EXISTS order_id;
ALTER TABLE public.ai_analytics  DROP COLUMN IF EXISTS product_id;
ALTER TABLE public.ai_conversations DROP COLUMN IF EXISTS order_id;  -- 20260322-д recreate-д байхгүй байж болзошгүй

-- 2) Legacy хүснэгтүүдийг устгах. CASCADE нь үлдсэн FK constraint / хамаарлыг
--    автоматаар устгана (order_items→orders/products, discount_schedules→products).
DROP TABLE IF EXISTS public.order_items        CASCADE;
DROP TABLE IF EXISTS public.discount_schedules CASCADE;
DROP TABLE IF EXISTS public.orders             CASCADE;
DROP TABLE IF EXISTS public.products           CASCADE;

COMMIT;

-- ------------------------------------------------------------
-- ТЭМДЭГЛЭЛ: 20260127120000_security_fixes.sql дотор products-руу ханддаг
--   p_product_id параметртэй SECURITY DEFINER функцууд байж болзошгүй. Эдгээр нь
--   plpgsql тул table устгахад автоматаар устахгүй (дуудах үед л алдана) —
--   dead функц. Шаардвал нэрсийг нь олж DROP FUNCTION хийнэ үү:
--     SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%products%';
-- ------------------------------------------------------------
