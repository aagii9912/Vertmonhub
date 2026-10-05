-- Facebook Page / Instagram органик insights, Graph v26 (docs/features/META-PAGE-INSIGHTS-2026-10-05.md).
--  1) social_insights_daily: огноогоор түлхүүрлэсэн метрикийн мөр (урт формат, Meta-гийн метрикийн нэрээр).
--     object_type = 'page' → Page-ийн өдрийн утга (period=day, Meta-гийн Номхон далайн цагийн өдөр);
--     object_type = 'post' → нийтлэлийн насан туршийн утга тухайн өдрийн байдлаар (Улаанбаатарын өдөр).
--     Мөр зөвхөн Meta-гийн өгсөн утгад үүснэ: өгөөгүй метрик мөргүй (= «байхгүй»), хэзээ ч 0 гэж бичихгүй.
--  2) social_insights_sync: Page бүрийн сүүлийн синк, хугацаа, Meta-гийн өгөөгүй метрик, алдаа.
--  3) social_posts (shop, platform, external_post_id) UNIQUE: синк upsert хийнэ. Production-д
--     social_posts хоосон (2026-10-05) тул давхардал үүсэхгүй.
--  4) meta_page_connect_pending: OAuth-ийн дараах Page/IG сонголт серверт. Хэрэглэгчийн long-lived токен
--     шифрлэгдсэн (enc:v1:), Page токен хадгалахгүй (сонгох үед Graph-аас авна), 30 минутын хугацаатай.
--     Браузер токен харахгүй, /api/shop PATCH токен хүлээж авахгүй.
-- Хуучин social_insights (6 цагийн snapshot, 0-ээр дүүргэсэн) хүснэгтэд хүрэхгүй; цаашид бичихгүй.
-- Additive, дахин ажиллуулж болно.

CREATE TABLE IF NOT EXISTS public.social_insights_daily (
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('facebook', 'instagram')),
    object_type text NOT NULL CHECK (object_type IN ('page', 'post')),
    -- Page: '123'; Facebook нийтлэл: '123_456'.
    object_id text NOT NULL CHECK (object_id ~ '^[0-9]{1,30}(_[0-9]{1,30})?$'),
    -- Тухайн мөрийн Page (одоо холбогдсон Page-ээр шүүхэд).
    page_id text NOT NULL CHECK (page_id ~ '^[0-9]{1,30}$'),
    day date NOT NULL,
    -- Meta-гийн метрикийн нэр (page_media_view, post_total_media_view_unique …).
    metric text NOT NULL CHECK (metric ~ '^[a-z_]{1,64}$'),
    value numeric NOT NULL,
    -- Төрлөөрх задаргаа (post_reactions_by_type_total гэх мэт); value = нийлбэр.
    breakdown jsonb CHECK (breakdown IS NULL OR jsonb_typeof(breakdown) = 'object'),
    synced_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_id, platform, object_type, object_id, day, metric)
);
CREATE INDEX IF NOT EXISTS social_insights_daily_page_idx
    ON public.social_insights_daily (shop_id, platform, page_id, object_type, day DESC);

CREATE TABLE IF NOT EXISTS public.social_insights_sync (
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('facebook', 'instagram')),
    page_id text NOT NULL CHECK (page_id ~ '^[0-9]{1,30}$'),
    last_attempt_at timestamptz NOT NULL,
    last_success_at timestamptz,
    last_from date,
    last_to date,
    -- Сүүлийн синкэд Meta-гийн өгөөгүй (хасагдсан, эрхгүй) метрик.
    unavailable_metrics text[] NOT NULL DEFAULT '{}',
    last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 500),
    page_rows integer CHECK (page_rows IS NULL OR page_rows >= 0),
    post_rows integer CHECK (post_rows IS NULL OR post_rows >= 0),
    PRIMARY KEY (shop_id, platform, page_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS social_posts_external_key
    ON public.social_posts (shop_id, platform, external_post_id);

CREATE TABLE IF NOT EXISTS public.meta_page_connect_pending (
    user_id uuid NOT NULL,
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    flow text NOT NULL CHECK (flow IN ('facebook', 'instagram')),
    user_token text NOT NULL CHECK (user_token LIKE 'enc:v1:%'),
    user_token_expires_at timestamptz,
    -- [{ id, name, category?, instagram?: { id, username?, name? } }] — токенгүй.
    pages jsonb NOT NULL CHECK (jsonb_typeof(pages) = 'array' AND jsonb_array_length(pages) <= 100),
    granted_scopes text[] NOT NULL DEFAULT '{}',
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, shop_id, flow)
);
CREATE INDEX IF NOT EXISTS meta_page_connect_pending_expires_idx ON public.meta_page_connect_pending (expires_at);

ALTER TABLE public.social_insights_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_insights_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_page_connect_pending ENABLE ROW LEVEL SECURITY;
-- Браузер шууд хандахгүй: API нь marketing-roi эрх, shop-ийг шалгаад service_role ашиглана.
REVOKE ALL ON public.social_insights_daily, public.social_insights_sync, public.meta_page_connect_pending FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.social_insights_daily, public.social_insights_sync, public.meta_page_connect_pending TO service_role;

COMMENT ON TABLE public.social_insights_daily IS 'Facebook Page/нийтлэлийн insights огноогоор (Graph v26, Meta-гийн өгсөн утга л; байхгүй = мөргүй)';
COMMENT ON TABLE public.social_insights_sync IS 'Page insights синкийн төлөв (Page бүрт)';
COMMENT ON TABLE public.meta_page_connect_pending IS 'Facebook/Instagram OAuth-ийн дараах Page сонголт (шифрлэгдсэн user токен, 30 минут)';
COMMENT ON TABLE public.social_insights IS 'Хуучин: 6 цагийн snapshot (Graph v21, 0-ээр дүүргэсэн). 2026-10-05-аас бичихгүй — social_insights_daily';
