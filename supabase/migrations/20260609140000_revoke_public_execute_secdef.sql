-- ============================================================
-- Security: SECURITY DEFINER функцийн PUBLIC EXECUTE-ийг хаах
-- ============================================================
-- Өмнөх migration (20260609130000) нь зөвхөн anon/authenticated-аас REVOKE
-- хийсэн боловч функцүүд default-аар PUBLIC role-д EXECUTE өгдөг тул anon/
-- authenticated нь PUBLIC-аар дамжин эрхээ хадгалсаар байв (no-op). Иймд
-- PUBLIC-аас (мөн anon, authenticated-аас) хасч, server-ийн дуудлага
-- эвдрэхгүйн тулд service_role-д explicit GRANT өгнө.
--
-- RLS policy дотор ашиглагддаг 4 helper-ийг үл хөндөнө (authenticated browser
-- query-ийн RLS эвдрэхээс сэргийлж): get_user_shop_id, get_user_shop_ids,
-- is_active_admin, check_admin_user.
--
-- Trigger функцууд table үйлдлээр ажилладаг тул EXECUTE grant-аас үл хамаарна.
-- Бүх RPC дуудлага (cron, rate-limiter, webhook, admin) нь supabaseAdmin()
-- = service_role-оор хийгддэг тул explicit GRANT-аар хэвийн ажиллана.
-- ------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef  -- зөвхөн SECURITY DEFINER
          AND p.proname NOT IN (
              'get_user_shop_id', 'get_user_shop_ids', 'is_active_admin', 'check_admin_user'
          )
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC;', r.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon;', r.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated;', r.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', r.sig);
    END LOOP;
END $$;

-- ============================================================
-- Үлдэх (зориудаар): дээрх 4 helper нь RLS-д хэрэгтэй тул anon/authenticated
-- EXECUTE-ийг хадгална → linter-т 4 функц flagged хэвээр үлдэж болзошгүй.
-- Эдгээрийг хасах нь дашбордын browser-direct query-г эвдэж болзошгүй тул
-- зөвхөн RLS ажиллахыг тест хийсний дараа гараар хасахыг зөвлөнө.
--
-- БУСАД гараар хийх linter findings (энд ороогүй):
--   • Storage: 'products'(legacy)/'property-images' bucket-ийн listing policy
--     — Dashboard → Storage → Policies дээр шалгаж хязгаарлах (public URL нь
--     policy-гүйгээр ажилладаг; гэхдээ policy нэр ерөнхий тул нүдээр шалгана).
--   • Extension 'vector'-ийг public-аас өөр schema руу зөөх (match_ai_documents
--     -д нөлөөлж болзошгүй тул тусад нь төлөвлөнө).
--   • Auth → Leaked Password Protection (HaveIBeenPwned) Dashboard-аас идэвхжүүлэх.
-- ============================================================
