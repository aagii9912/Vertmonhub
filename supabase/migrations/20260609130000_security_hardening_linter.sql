-- ============================================================
-- Security hardening — Supabase database linter findings
-- ============================================================
-- Хамрах:
--   (ERROR) security_definer_view × 4  → security_invoker болгов
--   (WARN)  rls_policy_always_true × 3 → бичих эрхийг админд хязгаарлав
--   (WARN)  anon/authenticated SECURITY DEFINER функцийн EXECUTE → хаав
--           (бүх дуудлага server-side service_role-оор хийгддэг тул аюулгүй)
-- Гараар хийх (SQL биш / эрсдэлтэй) зүйлсийг доор тэмдэглэв.

-- ------------------------------------------------------------
-- 1) SECURITY DEFINER views → security_invoker
--    Ингэснээр view нь үүсгэгчийн биш, асууж буй хэрэглэгчийн RLS-ийг
--    мөрдөж, multi-tenant scope зөв хэрэгжинэ.
-- ------------------------------------------------------------
ALTER VIEW IF EXISTS public.customer_service_dashboard SET (security_invoker = on);
ALTER VIEW IF EXISTS public.manager_performance        SET (security_invoker = on);
ALTER VIEW IF EXISTS public.contract_statistics        SET (security_invoker = on);
ALTER VIEW IF EXISTS public.contract_payment_status    SET (security_invoker = on);

-- ------------------------------------------------------------
-- 2) RBAC хүснэгтүүдийн "always-true" бичих policy-г админд хязгаарлах
--    SELECT policy-ууд (Authenticated users can read ...) хэвээр үлдэх тул
--    RBAC уншилт ажиллана; зөвхөн INSERT/UPDATE/DELETE-д админ шаардана.
--    Анхаар: хуучин check_admin_user() нь legacy Clerk хүснэгт
--    (admin_users.clerk_user_id)-ийг шалгадаг тул Supabase auth.uid()-тэй
--    таарахгүй; мөн public.admins хүснэгт энэ DB-д байхгүй. Иймд бодитоор
--    байгаа public.user_roles хүснэгтийн admin дүрд суурилав. SECURITY DEFINER
--    (эзэн = postgres) нь user_roles-ийн RLS-ийг тойрдог тул user_roles дээрх
--    policy дотроос дуудахад рекурс үүсэхгүй.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    );
$$;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;

DROP POLICY IF EXISTS "Super admins can manage roles" ON public.roles;
CREATE POLICY "Admins manage roles" ON public.roles
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Super admins can manage role_permissions" ON public.role_permissions;
CREATE POLICY "Admins manage role_permissions" ON public.role_permissions
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins manage user_roles" ON public.user_roles
    FOR ALL TO authenticated
    USING (public.is_active_admin())
    WITH CHECK (public.is_active_admin());

-- ------------------------------------------------------------
-- 3) SECURITY DEFINER функцүүдээс anon + authenticated EXECUTE-ийг хасах.
--    Бүх RPC дуудлага (cron, rate-limiter, webhook, admin) нь
--    supabaseAdmin() = service_role-оор хийгддэг бөгөөд service_role нь
--    эдгээр grant-ийг тойрдог тул апп эвдрэхгүй. Trigger функцууд table
--    үйлдлээр ажилладаг тул EXECUTE grant-аас үл хамаарна.
--    Үл хөндөх (RLS/policy дотор ашиглагддаг): get_user_shop_id,
--    get_user_shop_ids, check_admin_user.
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
          AND p.proname NOT IN ('get_user_shop_id', 'get_user_shop_ids', 'check_admin_user', 'is_active_admin')
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated;', r.sig);
    END LOOP;
END $$;

-- get_user_shop_id(s)/check_admin_user — RLS-д хэрэглэгддэг тул authenticated
-- үлдээж, зөвхөн anon-аас (нэвтрээгүй RPC) хасна.
REVOKE EXECUTE ON FUNCTION public.get_user_shop_id()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_shop_ids() FROM anon;

-- ============================================================
-- ГАРААР ХИЙХ (энэ migration-д ороогүй — эрсдэл/тохиргооны шинжтэй):
--   • Storage: 'products' (legacy), 'property-images' public bucket-ийн
--     өргөн SELECT (listing) policy — Dashboard → Storage → Policies дээр
--     listing-ийг хязгаарлах (объектын public URL нь policy-гүйгээр ажиллана).
--   • Extension 'vector' нь public schema-д — өөр schema руу зөөх нь
--     match_ai_documents-д нөлөөлж болзошгүй тул тусад нь төлөвлөж хийх.
--   • Auth → Leaked Password Protection (HaveIBeenPwned)-ийг Dashboard-аас
--     идэвхжүүлэх.
-- ============================================================
