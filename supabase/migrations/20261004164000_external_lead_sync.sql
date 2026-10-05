-- Гадны сайтын лидийн тулгалт: Elysium.mn `event_leads` → CRM `leads`.
-- Шууд дамжуулалт (/api/integrations/elysium/leads) үндсэн зам хэвээр. Cron татан авалт нь
-- дамжуулалтаар ирээгүй хүсэлтийг нөхөж, эх мөр бүрийн үр дүнг (imported | matched | invalid)
-- ledger-т нэг удаа бичнэ. Лидийн түлхүүр `client_request_id` = event_leads.id.
-- Additive, idempotent; өгөгдөл өөрчлөхгүй. Browser хандалтгүй, зөвхөн service_role бичнэ.

CREATE TABLE IF NOT EXISTS public.external_lead_sync (
    source text PRIMARY KEY CHECK (source IN ('elysium')),
    -- Cron зөвхөн админ идэвхжүүлсний дараа ажиллана; гар «Одоо татах» үргэлж боломжтой.
    enabled boolean NOT NULL DEFAULT false,
    shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL,
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    -- Бүрэн боловсруулсан эх `created_at`-ийн дээд хил (дараагийн уншилт 1 өдрийн нөөцтэй).
    cursor_at timestamptz,
    last_attempt_at timestamptz,
    last_success_at timestamptz,
    last_error text CHECK (last_error IS NULL OR length(last_error) <= 500),
    last_result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(last_result) = 'object'),
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_lead_imports (
    source text NOT NULL CHECK (source IN ('elysium')),
    source_id uuid NOT NULL,
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
    outcome text NOT NULL CHECK (outcome IN ('imported', 'matched', 'invalid')),
    -- Утас, и-мэйл ledger-т хадгалахгүй (лидэд л үлдэнэ).
    source_name text CHECK (source_name IS NULL OR length(source_name) <= 255),
    source_created_at timestamptz NOT NULL,
    detail text CHECK (detail IS NULL OR length(detail) <= 500),
    processed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (source, source_id),
    CONSTRAINT external_lead_imports_invalid_no_lead CHECK (outcome <> 'invalid' OR lead_id IS NULL)
);

CREATE INDEX IF NOT EXISTS external_lead_imports_recent_idx
    ON public.external_lead_imports (source, processed_at DESC);
CREATE INDEX IF NOT EXISTS external_lead_imports_lead_idx
    ON public.external_lead_imports (lead_id) WHERE lead_id IS NOT NULL;
-- Дамжуулалтын хамгаалалт: сүүлийн 72 цагт татан оруулсан лид.
CREATE INDEX IF NOT EXISTS external_lead_imports_window_idx
    ON public.external_lead_imports (source, shop_id, outcome, source_created_at DESC);

COMMENT ON TABLE public.external_lead_sync IS
    'Гадны сайтын лидийн татан авалтын төлөв (идэвхжүүлэлт, cursor, сүүлийн үр дүн)';
COMMENT ON TABLE public.external_lead_imports IS
    'Гадны сайтын эх мөр бүрийн тулгалтын үр дүн: imported (татаж оруулсан, түүхэн импортоор орсныг оруулаад), matched (CRM-д байсан), invalid (алдаатай)';

ALTER TABLE public.external_lead_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_lead_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.external_lead_sync, public.external_lead_imports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.external_lead_sync, public.external_lead_imports TO service_role;

-- Ажиллалтын үр дүнг бичнэ. Хуучин (эрт эхэлсэн) ажиллалт шинэ ажиллалтын төлөвийг дарахгүй.
-- p_cursor NULL бол cursor хэвээр; p_error NULL бол амжилттай.
CREATE OR REPLACE FUNCTION public.record_external_lead_sync(
    p_source text, p_started timestamptz, p_shop uuid, p_project uuid,
    p_cursor timestamptz, p_error text, p_result jsonb
) RETURNS boolean LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE saved boolean;
BEGIN
    IF p_source IS DISTINCT FROM 'elysium' OR p_started IS NULL OR p_result IS NULL OR jsonb_typeof(p_result) <> 'object' THEN
        RAISE EXCEPTION 'Invalid external lead sync state' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.external_lead_sync AS s
        (source, shop_id, project_id, cursor_at, last_attempt_at, last_success_at, last_error, last_result, updated_at)
    VALUES (p_source, p_shop, p_project, p_cursor, p_started,
            CASE WHEN p_error IS NULL THEN now() END, left(p_error, 500), p_result, now())
    ON CONFLICT (source) DO UPDATE SET
        shop_id = coalesce(excluded.shop_id, s.shop_id),
        project_id = coalesce(excluded.project_id, s.project_id),
        cursor_at = coalesce(excluded.cursor_at, s.cursor_at),
        last_attempt_at = excluded.last_attempt_at,
        last_success_at = coalesce(excluded.last_success_at, s.last_success_at),
        last_error = excluded.last_error,
        last_result = excluded.last_result,
        updated_at = now()
    WHERE s.last_attempt_at IS NULL OR s.last_attempt_at <= excluded.last_attempt_at
    RETURNING true INTO saved;
    RETURN coalesce(saved, false);
END $$;

REVOKE ALL ON FUNCTION public.record_external_lead_sync(text, timestamptz, uuid, uuid, timestamptz, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_external_lead_sync(text, timestamptz, uuid, uuid, timestamptz, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
