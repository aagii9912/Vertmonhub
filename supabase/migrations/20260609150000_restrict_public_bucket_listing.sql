-- ============================================================
-- Security: Public bucket-ийн өргөн listing SELECT policy-г хасах
-- ============================================================
-- linter: public_bucket_allows_listing (products, property-images)
--
-- Эдгээр bucket нь PUBLIC тул объектын public URL (app нь getPublicUrl-ээр
-- зураг рендэрддэг) storage.objects policy-гүйгээр ажилладаг. Доорх өргөн
-- SELECT policy нь зөвхөн storage API-аар bucket доторх БҮХ файлыг ЖАГСААХ
-- (list) боломжийг нээж байгаа тул хасна. Зураг харагдах нь хэвээр ажиллана;
-- upload/owner policy-ууд тусдаа тул хөндөгдөхгүй.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Public Access" ON storage.objects;                -- 'products' (legacy e-commerce)
DROP POLICY IF EXISTS "Property Images Public Read" ON storage.objects;  -- 'property-images'

-- ============================================================
-- Үлдэх linter findings (зориудаар / Dashboard-аар):
--   • get_user_shop_id, get_user_shop_ids, is_active_admin, check_admin_user
--     — RLS policy-ууд (shops/customers/properties г.м.) TO-заалтгүй тул anon
--       evaluate хийх боломжтой; иймд EXECUTE-ийг хасвал anon SELECT алдаа өгч
--       болзошгүй. Эдгээр нь зөвхөн дуудагчийн ӨӨРИЙН shop_id/admin эсэхийг
--       буцаадаг тул шууд RPC дуудлага ч мэдрэг мэдээлэл алдагдуулахгүй — аюулгүй.
--   • Extension 'vector' public schema-д — өөр schema руу зөөх нь
--     match_ai_documents + RLS-д нөлөөлж болзошгүй тул тусад нь төлөвлөнө.
--   • Auth → Leaked Password Protection — Dashboard → Authentication-аас идэвхжүүлэх.
-- ============================================================
