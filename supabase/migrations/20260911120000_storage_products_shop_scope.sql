-- ============================================================
-- 2026-09-11 review (H10): `products` bucket-ийн permissive policy-уудыг хасна.
--
-- Бодит DB-д owner-folder policy-ууд («Authenticated Upload», «Owner Update/Delete»,
-- auth.uid() folder) БА permissive «Authenticated users can upload/update/delete»
-- (auth.role()='authenticated' л шалгадаг) зэрэгцэн байсан. Postgres RLS policy-ууд
-- OR-оор нийлдэг тул нэвтэрсэн ДУРЫН хэрэглэгч дурын объектыг дарж/устгаж чаддаг байв.
--
-- Аппын бүх upload service-role-оор (`/api/dashboard/upload`, `/api/properties/upload`)
-- явдаг бөгөөд объектын зам `<shop_id>/...` тул authenticated policy-г shop folder-оор
-- хязгаарлана (property-images bucket-ийн загвартай адил). Public read хэвээр.
--
-- Rollback (хэрэв хэрэгтэй бол):
--   CREATE POLICY "Authenticated users can upload" ON storage.objects FOR INSERT TO public
--     WITH CHECK (bucket_id = 'products' AND auth.role() = 'authenticated');
--   CREATE POLICY "Authenticated users can update" ON storage.objects FOR UPDATE TO public
--     USING (bucket_id = 'products' AND auth.role() = 'authenticated');
--   CREATE POLICY "Authenticated users can delete" ON storage.objects FOR DELETE TO public
--     USING (bucket_id = 'products' AND auth.role() = 'authenticated');
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
-- auth.uid() folder policy-ууд — аппын зам shop_id folder тул хэзээ ч таардаггүй (dead)
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Owner Update" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete" ON storage.objects;

DROP POLICY IF EXISTS "Products Shop Upload" ON storage.objects;
CREATE POLICY "Products Shop Upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'products'
        AND (storage.foldername(name))[1] IN (SELECT gs.sid::text FROM public.get_user_shop_ids() AS gs(sid))
    );

DROP POLICY IF EXISTS "Products Shop Update" ON storage.objects;
CREATE POLICY "Products Shop Update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'products'
        AND (storage.foldername(name))[1] IN (SELECT gs.sid::text FROM public.get_user_shop_ids() AS gs(sid))
    );

DROP POLICY IF EXISTS "Products Shop Delete" ON storage.objects;
CREATE POLICY "Products Shop Delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'products'
        AND (storage.foldername(name))[1] IN (SELECT gs.sid::text FROM public.get_user_shop_ids() AS gs(sid))
    );
