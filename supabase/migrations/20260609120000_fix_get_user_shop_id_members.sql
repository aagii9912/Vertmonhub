-- Fix: get_user_shop_id() нь зөвхөн эзнийг (shops.user_id) мэддэг байсан тул
-- shop_members-ээр нэмэгдсэн ажилтнуудын RLS / browser-direct query хоосон/буруу
-- ажиллаж байв (audit: rls-get-user-shop-id-ignores-members, CRITICAL).
-- Эзэмшил БА гишүүнчлэлийг хоёуланг нь тооцно. SECURITY DEFINER функцэд
-- search_path-ийг тогтоож, хүснэгтийн нэрийг schema-аар бүрэн заана.

CREATE OR REPLACE FUNCTION public.get_user_shop_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN (
        SELECT s.id FROM public.shops s WHERE s.user_id = auth.uid()
        UNION
        SELECT m.shop_id FROM public.shop_members m WHERE m.user_id = auth.uid()
        LIMIT 1
    );
END;
$$;

-- Олон shop-той хэрэглэгчид зориулсан set-returning хувилбар.
-- RLS policy-уудад `shop_id IN (SELECT public.get_user_shop_ids())` хэлбэрээр ашиглаж болно.
CREATE OR REPLACE FUNCTION public.get_user_shop_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT s.id FROM public.shops s WHERE s.user_id = auth.uid()
    UNION
    SELECT m.shop_id FROM public.shop_members m WHERE m.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_user_shop_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_shop_ids() TO authenticated;

COMMENT ON FUNCTION public.get_user_shop_id() IS
    'Хэрэглэгчийн shop_id (эзэн эсвэл shop_members гишүүн). Эхний таарсан shop-ийг буцаана.';
COMMENT ON FUNCTION public.get_user_shop_ids() IS
    'Хэрэглэгчийн хандах боломжтой бүх shop_id (эзэмшил + гишүүнчлэл).';
