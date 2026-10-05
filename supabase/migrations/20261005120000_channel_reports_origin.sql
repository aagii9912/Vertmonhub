-- Сувгийн тайлангийн эх сурвалж ба өгөгдлийн хамрах өдрүүд.
--  origin: 'file' = хэрэглэгчийн экспорт файл, 'api' = Meta Marketing API-аас автоматаар.
--  data_from/data_to: тайлангийн хугацаанд өгөгдөл байгаа өдрүүд (жишээ нь 7 хоногийн
--  тайланд файл 6 өдрийг хамарсан бол хурлын тайланд «6/7 өдөр» гэж харуулна). NULL = тодорхойгүй
--  (хуучин мөр) — бүтэн хугацаа гэж таамаглахгүй.
-- Additive, дахин ажиллуулж болно.

ALTER TABLE public.marketing_channel_reports
    ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'file',
    ADD COLUMN IF NOT EXISTS data_from date,
    ADD COLUMN IF NOT EXISTS data_to date;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_channel_reports_origin_check') THEN
        ALTER TABLE public.marketing_channel_reports ADD CONSTRAINT marketing_channel_reports_origin_check
            CHECK (origin IN ('file', 'api'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_channel_reports_data_range_check') THEN
        ALTER TABLE public.marketing_channel_reports ADD CONSTRAINT marketing_channel_reports_data_range_check
            CHECK ((data_from IS NULL) = (data_to IS NULL)
                AND (data_from IS NULL OR (data_from <= data_to AND data_from >= period_from AND data_to <= period_to)));
    END IF;
END $$;

COMMENT ON COLUMN public.marketing_channel_reports.origin IS 'file = экспорт файл, api = Meta Marketing API синк';
COMMENT ON COLUMN public.marketing_channel_reports.data_from IS 'Тайлангийн хугацаанд өгөгдөлтэй эхний өдөр (NULL = тодорхойгүй)';
COMMENT ON COLUMN public.marketing_channel_reports.data_to IS 'Тайлангийн хугацаанд өгөгдөлтэй сүүлийн өдөр (NULL = тодорхойгүй)';
