-- Meta API-аас татсан (origin = 'api') сувгийн тайланг экспорт файлаар дарж бичихгүй.
-- API route хадгалахаасаа өмнө шалгаж 409 буцаадаг; энэ trigger нь шалгалт ба хадгалалтын хооронд
-- синк тэр хугацааг бичсэн (race) эсвэл өөр замаар бичих үед ч өгөгдлийн сангийн түвшинд хамгаална.
-- INSERT … ON CONFLICT DO UPDATE ч BEFORE UPDATE trigger-ийг ажиллуулна — бүх statement буцна.
-- API синк файлын тайланг орлож болно ('file' → 'api'), API нь API-гаа шинэчилнэ ('api' → 'api').
-- Бичигч origin илгээгээгүй ч (хуучин кодын upsert: origin хэвээр 'api') хамгаална: API-ийн мөр
-- file_name, content_hash-ийг үргэлж NULL бичдэг тул тэдгээрийг бөглөсөн шинэчлэл = файл.
-- API-ийн тайланг файлаар солих бол эхлээд устгана (DELETE-д trigger байхгүй).
-- Additive, дахин ажиллуулж болно. 20261005120000_channel_reports_origin.sql-ийн ДАРАА (origin багана шаардлагатай).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('public.marketing_channel_reports') AND attname = 'origin' AND NOT attisdropped
    ) THEN
        RAISE EXCEPTION '20261005140000: public.marketing_channel_reports.origin багана алга — эхлээд 20261005120000_channel_reports_origin.sql-ийг хэрэгжүүлнэ үү';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.keep_api_marketing_channel_report()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.origin = 'api' AND (NEW.origin IS DISTINCT FROM 'api' OR NEW.file_name IS NOT NULL OR NEW.content_hash IS NOT NULL) THEN
        RAISE EXCEPTION 'channel_report_api_locked: % % – % тайланг Meta API-аас татсан тул файлаар дарж бичихгүй',
            OLD.source, OLD.period_from, OLD.period_to
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.keep_api_marketing_channel_report() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS marketing_channel_reports_keep_api ON public.marketing_channel_reports;
CREATE TRIGGER marketing_channel_reports_keep_api BEFORE UPDATE ON public.marketing_channel_reports
    FOR EACH ROW EXECUTE FUNCTION public.keep_api_marketing_channel_report();

COMMENT ON FUNCTION public.keep_api_marketing_channel_report() IS 'Meta API-ийн (origin = api) сувгийн тайланг файлаар дарахыг хориглоно (origin эсвэл file_name/content_hash-аар)';
