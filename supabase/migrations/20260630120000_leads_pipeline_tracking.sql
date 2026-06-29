-- ============================================================
-- LEADS PIPELINE TRACKING — 2026-06-30
-- ============================================================
-- Sales pipeline-ийн sjruulalt (pipeline-management skill):
--   • stage_changed_at — лийд одоогийн шатанд хэдий хугацаа болсныг хэмжих
--     ("Motion is the metric" — зогссон deal-ийг илрүүлэх).
--   • lost_reason     — closed_lost болсон шалтгаан (win/loss analysis).
-- stage_changed_at-ийг trigger-ээр стэмплэнэ — pipeline drag, AI orchestrator
--   bulk_update, шууд SQL зэрэг status өөрчлөх БҮХ замд автоматаар ажиллана.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lost_reason TEXT;

-- Одоо байгаа мөрүүдийн baseline = created_at (хэзээ үүссэн).
UPDATE public.leads SET stage_changed_at = created_at WHERE stage_changed_at IS NULL;

-- status өөрчлөгдөх бүрд stage_changed_at-ийг шинэчлэх trigger.
CREATE OR REPLACE FUNCTION public.leads_stamp_stage_changed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        NEW.stage_changed_at := COALESCE(NEW.stage_changed_at, now());
    ELSIF (NEW.status IS DISTINCT FROM OLD.status) THEN
        NEW.stage_changed_at := now();
    END IF;
    -- Инвариант: lost_reason нь зөвхөн closed_lost үед утгатай. Аль ч write замаар
    -- (API, AI orchestrator, raw SQL) closed_lost-аас гарвал автоматаар цэвэрлэнэ.
    IF (NEW.status IS DISTINCT FROM 'closed_lost') THEN
        NEW.lost_reason := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_stage_changed ON public.leads;
CREATE TRIGGER trg_leads_stage_changed
    BEFORE INSERT OR UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_stamp_stage_changed();

-- Зогссон deal-ийг шатаар нь хурдан шүүх индекс (active set).
CREATE INDEX IF NOT EXISTS idx_leads_shop_status_stage
    ON public.leads (shop_id, status, stage_changed_at) WHERE deleted_at IS NULL;
