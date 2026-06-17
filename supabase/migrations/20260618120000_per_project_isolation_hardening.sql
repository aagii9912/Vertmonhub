-- Vertmon Hub: Төсөл (shop) бүрийн өгөгдлийн тусгаарлалт — RLS чангатгал (P1)
-- Зорилго: properties / leads / push_subscriptions дээрх хэт өргөн (cross-tenant)
-- RLS policy-уудыг shop гишүүнчлэлээр (эзэн + shop_members) хязгаарлана.
-- API давхарга аль хэдийн shop-аар scope хийдэг ч RLS-ийг батлан хамгаалалт (defense
-- in depth) болгоно. Гишүүнчлэлийг public.get_user_shop_ids() функцээр шалгана
-- (эзэмшил + shop_members; migration 20260609120000-д тодорхойлсон).

-- ============================================
-- 1) Properties — cross-tenant SELECT задгайг хаах
-- ============================================
-- Өмнө нь "Authenticated users can view active properties" policy ЛЮБОЙ нэвтэрсэн
-- хэрэглэгчид бүх shop-ийн идэвхтэй байрыг ил болгож байсан (is_active=true). Үүнийг
-- устгаж, зөвхөн эзэн/гишүүн харах/удирдах policy-гоор солино.
DROP POLICY IF EXISTS "Authenticated users can view active properties" ON public.properties;

DROP POLICY IF EXISTS "Shop members manage properties by shop" ON public.properties;
CREATE POLICY "Shop members manage properties by shop" ON public.properties
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_user_shop_ids()))
    WITH CHECK (shop_id IN (SELECT public.get_user_shop_ids()));

-- ============================================
-- 2) Leads — гишүүн (shop_members)-ийг хамруулна
-- ============================================
-- Өмнөх policy-ууд зөвхөн get_user_shop_id() (нэг shop)-оор хязгаарлагдаж, олон төсөлд
-- ажилладаг гишүүдийн хувьд дутуу байв. get_user_shop_ids()-аар бүрэн хамруулна.
DROP POLICY IF EXISTS "Shop members manage leads by shop" ON public.leads;
CREATE POLICY "Shop members manage leads by shop" ON public.leads
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_user_shop_ids()))
    WITH CHECK (shop_id IN (SELECT public.get_user_shop_ids()));

-- ============================================
-- 3) Push subscriptions — USING(true) задгай policy-г хаах
-- ============================================
-- Өмнө нь "Service role can manage push subscriptions" нь USING(true) (TO заалтгүй)
-- байсан тул authenticated/anon бүгд бүх төслийн subscription-ийг харах боломжтой
-- байв. service_role нь RLS-ийг тойрдог тул задгай policy шаардлагагүй — гишүүнчлэлээр
-- хязгаарлана (subscribe/send API-ууд service-role клиент ашигладаг тул ажиллана).
DROP POLICY IF EXISTS "Service role can manage push subscriptions" ON public.push_subscriptions;

DROP POLICY IF EXISTS "Shop members manage push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Shop members manage push subscriptions" ON public.push_subscriptions
    FOR ALL TO authenticated
    USING (shop_id IN (SELECT public.get_user_shop_ids()))
    WITH CHECK (shop_id IN (SELECT public.get_user_shop_ids()));
