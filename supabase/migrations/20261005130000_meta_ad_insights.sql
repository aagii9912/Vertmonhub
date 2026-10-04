-- Meta Marketing API-ийн дэлгэрэнгүй insights (docs/features/META-INSIGHTS-API-2026-10-05.md).
--  1) Нэг зарын данс зөвхөн нэг төсөлд (shop): 'act_123' ба '123'-г ижил гэж үзсэн partial unique
--     index. Production-д бүх shop-ийн данс NULL (2026-10-05) тул аюулгүй.
--  2) meta_ad_insights_daily: ad set × өдрийн мөр (зардал, харагдалт, өдрийн reach, товшилт, үр дүн
--     төрлөөр). Өдрийн reach-ийг нэмэхгүй — хугацааны давхардалгүй reach-ийг Meta-гаас тусад нь авна.
--  3) meta_insights_sync: дэлгэрэнгүй синкийн төлөв (meta_spend_sync-ийн last_attempt_at нь зардлын
--     синкийн хуучирсан бичилтээс хамгаалдаг тул түүнд хүрэхгүй тусдаа хүснэгт).
--  4) save_meta_ad_insights: сонгосон дансыг шалгаад тухайн shop/данс/хугацааны мөрүүдийг нэг
--     transaction-д сольж, оруулсан мөрийн тоог буцаана. SECURITY INVOKER — зөвхөн service_role.
-- Additive, дахин ажиллуулж болно.

CREATE UNIQUE INDEX IF NOT EXISTS shops_facebook_ad_account_unique
    ON public.shops ((regexp_replace(facebook_ad_account_id, '^act_', '')))
    WHERE facebook_ad_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.meta_ad_insights_daily (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    account_id text NOT NULL CHECK (account_id ~ '^act_[0-9]+$'),
    day date NOT NULL,
    campaign_id text NOT NULL CHECK (campaign_id ~ '^[0-9]+$'),
    campaign_name text NOT NULL,
    adset_id text NOT NULL CHECK (adset_id ~ '^[0-9]+$'),
    adset_name text NOT NULL,
    objective text,
    optimization_goal text,
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    spend numeric(18,6) NOT NULL CHECK (spend >= 0 AND spend < 1000000000000),
    impressions bigint NOT NULL DEFAULT 0 CHECK (impressions >= 0),
    -- Тухайн өдрийн reach; өдрүүд, ad set-үүдээр нэмж болохгүй.
    reach bigint CHECK (reach IS NULL OR reach >= 0),
    clicks bigint NOT NULL DEFAULT 0 CHECK (clicks >= 0),
    inline_link_clicks bigint NOT NULL DEFAULT 0 CHECK (inline_link_clicks >= 0),
    landing_page_views numeric NOT NULL DEFAULT 0 CHECK (landing_page_views >= 0),
    calls_placed numeric NOT NULL DEFAULT 0 CHECK (calls_placed >= 0),
    -- MetaResultType (src/lib/marketing/meta-results.ts); NULL = төрөл тодорхойгүй.
    result_type text CHECK (result_type IS NULL OR result_type ~ '^[a-z_]{1,40}$'),
    result_indicator text CHECK (result_indicator IS NULL OR char_length(result_indicator) <= 200),
    results numeric CHECK (results IS NULL OR results >= 0),
    -- results = Meta-гийн `results` талбар; goal = ad set-ийн optimization_goal + actions-аас.
    result_source text NOT NULL CHECK (result_source IN ('results', 'goal')),
    actions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(actions) = 'array'),
    cost_per_action_type jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cost_per_action_type) = 'array'),
    synced_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT meta_ad_insights_daily_key UNIQUE (shop_id, account_id, day, adset_id)
);
CREATE INDEX IF NOT EXISTS meta_ad_insights_daily_campaign_idx
    ON public.meta_ad_insights_daily (shop_id, account_id, campaign_id, day);

CREATE TABLE IF NOT EXISTS public.meta_insights_sync (
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    account_id text NOT NULL CHECK (account_id ~ '^act_[0-9]+$'),
    last_attempt_at timestamptz NOT NULL,
    last_success_at timestamptz,
    last_from date,
    last_to date,
    last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 500),
    row_count integer CHECK (row_count IS NULL OR row_count >= 0),
    weeks integer CHECK (weeks IS NULL OR weeks >= 0),
    result_source text CHECK (result_source IS NULL OR result_source IN ('results', 'goal')),
    PRIMARY KEY (shop_id, account_id)
);

ALTER TABLE public.meta_ad_insights_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_insights_sync ENABLE ROW LEVEL SECURITY;
-- Браузер шууд хандахгүй: API нь marketing-roi эрх, shop-ийг шалгаад service_role ашиглана.
REVOKE ALL ON public.meta_ad_insights_daily, public.meta_insights_sync FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.meta_ad_insights_daily, public.meta_insights_sync TO service_role;

-- Бүх хуудсыг татаж шалгасны дараа л дуудна; хагас хариу энэ transaction-д хүрэхгүй.
CREATE OR REPLACE FUNCTION public.save_meta_ad_insights(
    p_shop uuid, p_account text, p_from date, p_to date, p_rows jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_shop::text, 211005));
    IF p_account IS NULL OR p_account !~ '^act_[0-9]+$' OR NOT EXISTS (
        SELECT 1 FROM shops WHERE id = p_shop AND 'act_' || regexp_replace(facebook_ad_account_id, '^act_', '') = p_account
    ) THEN RAISE EXCEPTION 'Meta account changed or is not selected' USING ERRCODE = '23514'; END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 92
       OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 50000
    THEN RAISE EXCEPTION 'Invalid Meta insights window' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(day date, campaign_id text, adset_id text, currency text)
        WHERE r.day IS NULL OR r.day < p_from OR r.day > p_to
           OR r.campaign_id IS NULL OR r.campaign_id !~ '^[0-9]+$' OR r.adset_id IS NULL OR r.adset_id !~ '^[0-9]+$'
           OR r.currency IS NULL OR r.currency !~ '^[A-Z]{3}$')
    THEN RAISE EXCEPTION 'Invalid Meta insights row' USING ERRCODE = '23514'; END IF;

    -- Meta засварласан/арилсан мөрийг оруулахын тулд тухайн хугацааг бүхэлд нь солино.
    DELETE FROM meta_ad_insights_daily WHERE shop_id = p_shop AND account_id = p_account AND day BETWEEN p_from AND p_to;
    INSERT INTO meta_ad_insights_daily(
        shop_id, account_id, day, campaign_id, campaign_name, adset_id, adset_name, objective, optimization_goal, currency,
        spend, impressions, reach, clicks, inline_link_clicks, landing_page_views, calls_placed,
        result_type, result_indicator, results, result_source, actions, cost_per_action_type, synced_at)
    SELECT p_shop, p_account, r.day, r.campaign_id, coalesce(nullif(r.campaign_name, ''), r.campaign_id), r.adset_id,
        coalesce(nullif(r.adset_name, ''), r.adset_id), r.objective, r.optimization_goal, r.currency,
        r.spend, coalesce(r.impressions, 0), r.reach, coalesce(r.clicks, 0), coalesce(r.inline_link_clicks, 0),
        coalesce(r.landing_page_views, 0), coalesce(r.calls_placed, 0),
        r.result_type, r.result_indicator, r.results, r.result_source,
        coalesce(r.actions, '[]'::jsonb), coalesce(r.cost_per_action_type, '[]'::jsonb), now()
    FROM jsonb_to_recordset(p_rows) AS r(
        day date, campaign_id text, campaign_name text, adset_id text, adset_name text, objective text, optimization_goal text,
        currency text, spend numeric, impressions bigint, reach bigint, clicks bigint, inline_link_clicks bigint,
        landing_page_views numeric, calls_placed numeric, result_type text, result_indicator text, results numeric,
        result_source text, actions jsonb, cost_per_action_type jsonb);
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.save_meta_ad_insights(uuid, text, date, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_meta_ad_insights(uuid, text, date, date, jsonb) TO service_role;

COMMENT ON TABLE public.meta_ad_insights_daily IS 'Meta Marketing API: ad set × өдрийн insights (зардал, харагдалт, өдрийн reach, үр дүн төрлөөр)';
COMMENT ON TABLE public.meta_insights_sync IS 'Meta дэлгэрэнгүй insights синкийн төлөв (shop, данс бүрт)';
