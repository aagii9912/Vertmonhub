-- Лхагвагийн хурлын нэмэлт слайд (2026-10-13): маркетингийн постер, контент, Page/Ads/CallPro-гийн
-- дэлгэцийн зураг, борлуулалтын өдөрлөгийн зураг, хүлээлцсэн байдал гэх мэт өгөгдлийн сангаас гардаггүй
-- слайдыг төсөл (= shop) × хурлын өдөр × хэсгээр хадгална. «Слайд (.pptx)» экспорт тэдгээрийг тус бүр
-- нэг слайд болгоно.
--
-- • weekly_report_slides — хэсэг (sales/marketing), сэдэв, тайлбар, дүгнэлт, зургийн зам (≤ 6), дараалал.
--   Хэсгийн эрх: sales = reports, marketing = marketing-roi (API шалгана).
-- • report-media — хувийн bucket (≤ 4 MB, JPEG/PNG). Зам: <shop_id>/<user_id>/<uuid>.<jpg|png>.
--   Татах бүрд /api/dashboard/weekly-slides/media нэвтрэлт, shop-ийн гишүүнчлэл, хэсгийн эрхийг дахин шалгана.
--
-- Additive, дахин ажиллуулж болно. Browser шууд хандахгүй: API эрх, shop шалгаад service_role-оор бичнэ.

CREATE TABLE IF NOT EXISTS public.weekly_report_slides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    meeting_date date NOT NULL CHECK (extract(isodow FROM meeting_date) = 3),
    part text NOT NULL CHECK (part IN ('sales', 'marketing')),
    section text NOT NULL CHECK (section IN (
        'social', 'page', 'ads', 'callpro', 'sms', 'survey', 'website', 'chat',
        'event', 'handover', 'negotiation', 'plan', 'other'
    )),
    title text NOT NULL DEFAULT '' CHECK (title = btrim(title) AND char_length(title) <= 200),
    note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
    image_paths text[] NOT NULL DEFAULT '{}' CHECK (cardinality(image_paths) <= 6),
    position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 10000),
    author_id uuid,
    author_name text NOT NULL DEFAULT '' CHECK (char_length(author_name) <= 120),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (char_length(title) > 0 OR char_length(btrim(note)) > 0 OR cardinality(image_paths) > 0)
);

CREATE INDEX IF NOT EXISTS weekly_report_slides_meeting_idx
    ON public.weekly_report_slides (shop_id, meeting_date, part, position);
CREATE INDEX IF NOT EXISTS weekly_report_slides_images_idx
    ON public.weekly_report_slides USING gin (image_paths);

COMMENT ON TABLE public.weekly_report_slides IS 'Лхагвагийн хурлын нэмэлт слайд (постер, дэлгэцийн зураг, тайлбар): төсөл × хурлын өдөр × хэсэг.';

ALTER TABLE public.weekly_report_slides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.weekly_report_slides FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_report_slides TO service_role;

-- Слайдын зураг нийтийн байрны зургийн bucket-тэй холилдохгүй.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('report-media', 'report-media', false, 4194304, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS report_media_server_only ON storage.objects;
CREATE POLICY report_media_server_only ON storage.objects AS RESTRICTIVE
    FOR ALL TO anon, authenticated
    USING (bucket_id <> 'report-media') WITH CHECK (bucket_id <> 'report-media');

NOTIFY pgrst, 'reload schema';
