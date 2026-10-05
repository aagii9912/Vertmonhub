-- Facebook Lead Ads: leadgen_id бүрийн сүүлийн үр дүн (webhook эсвэл 90 хоногийн backfill).
-- `saved` = лид хадгалагдсан, `skipped` = тохиргоо/эрх/өгөгдлийн шалтгаанаар алгассан (Meta-д
-- 200 буцааж, тохиргоо зассаны дараа backfill нөхнө), `failed` = түр зуурын алдаа (Meta дахин
-- илгээнэ). Харилцагчийн нэр, утас, имэйл энд хадгалахгүй — зөвхөн Meta-гийн ID, шалтгаан.
-- Additive, дахин ажиллуулж болно. Зөвхөн сервер (service_role) бичиж уншина.

CREATE TABLE IF NOT EXISTS public.meta_leadgen_events (
    leadgen_id text PRIMARY KEY CHECK (leadgen_id ~ '^[0-9]{1,30}$'),
    page_id text NOT NULL CHECK (page_id ~ '^[0-9]{1,30}$'),
    -- Page холбогдоогүй үед NULL.
    shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE,
    lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
    form_id text CHECK (form_id IS NULL OR form_id ~ '^[0-9]{1,30}$'),
    ad_id text CHECK (ad_id IS NULL OR ad_id ~ '^[0-9]{1,30}$'),
    campaign_id text CHECK (campaign_id IS NULL OR campaign_id ~ '^[0-9]{1,30}$'),
    status text NOT NULL CHECK (status IN ('saved', 'skipped', 'failed')),
    reason text CHECK (reason IS NULL OR reason ~ '^[a-z_]{1,40}$'),
    origin text NOT NULL CHECK (origin IN ('webhook', 'backfill')),
    lead_created_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT meta_leadgen_events_status_reason_check CHECK ((status = 'saved') = (reason IS NULL))
);

CREATE INDEX IF NOT EXISTS meta_leadgen_events_shop_updated_idx
    ON public.meta_leadgen_events (shop_id, updated_at DESC);

ALTER TABLE public.meta_leadgen_events ENABLE ROW LEVEL SECURITY;
-- Браузер шууд хандахгүй: webhook ба marketing-roi эрхтэй API service_role-оор хандана.
REVOKE ALL ON public.meta_leadgen_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.meta_leadgen_events TO service_role;
