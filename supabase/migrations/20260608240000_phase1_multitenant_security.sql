-- Vertmon Hub: Production Phase 1 — Multi-tenant security (CRITICAL)
-- Засагдсан leak-үүд:
--  (1) surveys/survey_responses-д shop_id байгаагүй → бүх shop-ийн судалгаа бүгдэд ил байсан
--  (2) property_viewings-д shop_id байгаагүй → client query ажиллахгүй, зөвхөн RLS-д найдаж байсан

-- ============================================
-- 1) Surveys — shop_id + backfill + RLS чангатгал
-- ============================================
ALTER TABLE public.surveys ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE;

-- Ганц shop байвал одоо байгаа мөрүүдийг түүнд холбоно
UPDATE public.surveys SET shop_id = (SELECT id FROM shops ORDER BY created_at LIMIT 1)
WHERE shop_id IS NULL AND (SELECT count(*) FROM shops) = 1;
UPDATE public.survey_responses sr SET shop_id = s.shop_id
FROM public.surveys s WHERE sr.survey_id = s.id AND sr.shop_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_surveys_shop ON public.surveys(shop_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_shop ON public.survey_responses(shop_id);

-- Хэт өргөн (authenticated бүгд) policy-уудыг устгаж, shop-аар хязгаарлана
DROP POLICY IF EXISTS "Enable read access for all on active surveys" ON public.surveys;
DROP POLICY IF EXISTS "Enable full access for authenticated users on surveys" ON public.surveys;
DROP POLICY IF EXISTS "Enable insert for authenticated users on survey responses" ON public.survey_responses;
DROP POLICY IF EXISTS "Enable full access for authenticated users on survey responses" ON public.survey_responses;

CREATE POLICY "Shop members manage own surveys" ON public.surveys
    FOR ALL TO authenticated
    USING (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Shop members manage own survey responses" ON public.survey_responses
    FOR ALL TO authenticated
    USING (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ));

-- ============================================
-- 2) Property viewings — shop_id + backfill + index
-- ============================================
ALTER TABLE property_viewings ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE;

-- lead-ээс backfill
UPDATE property_viewings pv SET shop_id = l.shop_id
FROM leads l WHERE pv.lead_id = l.id AND pv.shop_id IS NULL;
-- lead-гүй мөр үлдвэл ганц shop-д
UPDATE property_viewings SET shop_id = (SELECT id FROM shops ORDER BY created_at LIMIT 1)
WHERE shop_id IS NULL AND (SELECT count(*) FROM shops) = 1;

CREATE INDEX IF NOT EXISTS idx_property_viewings_shop ON property_viewings(shop_id);

-- shop_id-д суурилсан шууд RLS policy нэмнэ (одоо байгаа leads-join policy-тэй OR-лоно)
DROP POLICY IF EXISTS "Shop members manage viewings by shop" ON property_viewings;
CREATE POLICY "Shop members manage viewings by shop" ON property_viewings
    FOR ALL TO authenticated
    USING (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ));

COMMENT ON COLUMN public.surveys.shop_id IS 'Multi-tenant: судалгааны эзэн shop';
COMMENT ON COLUMN property_viewings.shop_id IS 'Multi-tenant: үзлэгийн эзэн shop (lead-ээс backfill)';
