-- Лхагвын илтгэл, долгион 2–3 (2026-10-23, W17): хурлын зургийн слайд ба төслийн илтгэлийн брэнд.
--
-- • weekly_report_slides — нэг слайдад 9 хүртэл зураг (багийн илтгэлийн 9 зурагтай слайд), борлуулалтын шинэ сэдэв
--   'construction' («Барилгын явц»). Хуучин (нэргүй, автоматаар нэрлэгдсэн) CHECK-ийг тодорхойлолтоор нь олж сольно.
-- • report_branding — төсөл (= shop) бүрийн илтгэлийн брэнд: харагдах нэр («ЭЛИЗИУМ»), хөл бичвэр
--   («ВЕРТМОН ПРОПЕРТИС»), нүүрний зураг, лого. Зураг нь хувийн `report-media` bucket-д
--   `branding/<shop_id>/<uuid>.<jpg|png>` замаар (bucket, RESTRICTIVE policy нь 20261013140000-д бий);
--   /api/dashboard/report-branding/media татах бүрд нэвтрэлт, shop-ийн гишүүнчлэл, `reports` (эсвэл `settings`) модулийг
--   шалгана. Унших = reports эсвэл settings (засагч PUT-аар бүхэлд нь солих утгаа харна), бичих = settings write (API шалгана).
--
-- Additive, дахин ажиллуулж болно. Browser шууд хандахгүй: API эрх, shop шалгаад service_role-оор бичнэ.

DO $$
DECLARE
    constraint_row record;
BEGIN
    FOR constraint_row IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.weekly_report_slides'::regclass AND contype = 'c'
          AND conname NOT IN ('weekly_report_slides_image_paths_max', 'weekly_report_slides_section_allowed')
          AND (pg_get_constraintdef(oid) ILIKE '%cardinality(image_paths) <=%' OR pg_get_constraintdef(oid) ILIKE '%section%')
    LOOP
        EXECUTE format('ALTER TABLE public.weekly_report_slides DROP CONSTRAINT %I', constraint_row.conname);
    END LOOP;
END $$;

DO $$ BEGIN
    ALTER TABLE public.weekly_report_slides ADD CONSTRAINT weekly_report_slides_image_paths_max CHECK (cardinality(image_paths) <= 9);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.weekly_report_slides ADD CONSTRAINT weekly_report_slides_section_allowed CHECK (section IN (
        'social', 'page', 'ads', 'callpro', 'sms', 'survey', 'website', 'chat',
        'event', 'handover', 'negotiation', 'plan', 'construction', 'other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.report_branding (
    shop_id uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
    display_name text,
    footer_text text,
    cover_image_path text,
    logo_path text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    CONSTRAINT report_branding_display_name_check
        CHECK (display_name IS NULL OR (display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 80)),
    CONSTRAINT report_branding_footer_text_check
        CHECK (footer_text IS NULL OR (footer_text = btrim(footer_text) AND char_length(footer_text) BETWEEN 1 AND 120)),
    -- Зураг зөвхөн энэ shop-ийн branding/ замд.
    CONSTRAINT report_branding_cover_path_check
        CHECK (cover_image_path IS NULL OR cover_image_path ~ ('^branding/' || shop_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$')),
    CONSTRAINT report_branding_logo_path_check
        CHECK (logo_path IS NULL OR logo_path ~ ('^branding/' || shop_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'))
);

COMMENT ON TABLE public.report_branding IS 'Төслийн илтгэлийн брэнд (Лхагвын хурлын багийн загварын илтгэл): харагдах нэр, хөл бичвэр, нүүрний зураг, лого.';

ALTER TABLE public.report_branding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.report_branding FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.report_branding TO service_role;

NOTIFY pgrst, 'reload schema';
