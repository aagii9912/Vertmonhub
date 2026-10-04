-- Маркетингийн сувгийн экспорт импорт: Meta Ads Manager, Facebook хуудасны Content overview,
-- CallPro бүлгийн/дуудлагын тайлан, масс SMS-ийн файлаас тооцсон нийт дүн, задаргаа.
-- Төсөл = shop тул тайлан shop, эх үүсвэр, хугацаагаар нэг л мөртэй; ижил хугацааг дахин
-- импортлоход тэр мөр шинэчлэгдэнэ. Баганын холболтыг shop + эх үүсвэрээр сануулна.
-- Additive, дахин ажиллуулж болно. API модуль/shop шалгасны дараа service_role-оор бичнэ.

CREATE TABLE IF NOT EXISTS public.marketing_channel_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    source text NOT NULL CHECK (source IN ('meta_ads', 'facebook_page', 'callpro', 'sms')),
    period_from date NOT NULL,
    period_to date NOT NULL,
    file_name text CHECK (file_name IS NULL OR char_length(file_name) <= 255),
    content_hash text CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
    -- Үзүүлэлтийн түлхүүр → тоо (Meta-гийн валют `currency` текстээр). Тооцоогүй үзүүлэлт орохгүй.
    totals jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(totals) = 'object'),
    -- Хязгаартай задаргаа: campaign, өдөр, бүлэг, цагийн алдсан дуудлага, SMS кампанит ажил.
    breakdown jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
        CASE WHEN jsonb_typeof(breakdown) = 'array' THEN jsonb_array_length(breakdown) <= 500 ELSE false END
    ),
    -- Файлын толгой → үзүүлэлтийн түлхүүр.
    mapping jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(mapping) = 'object'),
    -- Импортын үеийн анхааруулга (тоо биш нүд, нийт мөрийн зөрүү, тооцоогүй үзүүлэлт).
    warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
    row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
    note text CHECK (note IS NULL OR char_length(note) <= 2000),
    imported_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT marketing_channel_reports_period_check
        CHECK (period_to >= period_from AND period_to - period_from <= 92),
    CONSTRAINT marketing_channel_reports_period_key UNIQUE (shop_id, source, period_from, period_to)
);

CREATE INDEX IF NOT EXISTS marketing_channel_reports_shop_period_idx
    ON public.marketing_channel_reports (shop_id, period_to DESC);

CREATE TABLE IF NOT EXISTS public.marketing_channel_mappings (
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    source text NOT NULL CHECK (source IN ('meta_ads', 'facebook_page', 'callpro', 'sms')),
    mapping jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(mapping) = 'object'),
    header_signature text CHECK (header_signature IS NULL OR char_length(header_signature) <= 64),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_id, source)
);

ALTER TABLE public.marketing_channel_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_channel_mappings ENABLE ROW LEVEL SECURITY;
-- Браузер шууд хандахгүй: API нь marketing-roi эрх, идэвхтэй shop-ийг шалгаад service_role ашиглана.
REVOKE ALL ON public.marketing_channel_reports, public.marketing_channel_mappings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketing_channel_reports, public.marketing_channel_mappings TO service_role;

CREATE OR REPLACE FUNCTION public.touch_marketing_channel_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_marketing_channel_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS marketing_channel_reports_touch ON public.marketing_channel_reports;
CREATE TRIGGER marketing_channel_reports_touch BEFORE UPDATE ON public.marketing_channel_reports
    FOR EACH ROW EXECUTE FUNCTION public.touch_marketing_channel_row();
DROP TRIGGER IF EXISTS marketing_channel_mappings_touch ON public.marketing_channel_mappings;
CREATE TRIGGER marketing_channel_mappings_touch BEFORE UPDATE ON public.marketing_channel_mappings
    FOR EACH ROW EXECUTE FUNCTION public.touch_marketing_channel_row();

COMMENT ON TABLE public.marketing_channel_reports IS 'Маркетингийн сувгийн экспорт файлын нийт дүн, задаргаа (shop, эх үүсвэр, хугацаагаар нэг мөр)';
COMMENT ON TABLE public.marketing_channel_mappings IS 'Сувгийн экспорт файлын баганын холболт — shop, эх үүсвэр бүрт сүүлд баталгаажуулсан';
