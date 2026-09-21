-- Meta media spend: account-local dates, original currency and explicit MNT conversion.
CREATE TABLE IF NOT EXISTS public.meta_spend_sync (
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    account_id text NOT NULL CHECK (account_id ~ '^act_[0-9]+$'),
    currency text, timezone text, mnt_per_unit numeric(18,6) CHECK (mnt_per_unit > 0 AND mnt_per_unit <= 1000000),
    last_attempt_at timestamptz NOT NULL, last_success_at timestamptz,
    last_from date, last_to date, last_error text,
    PRIMARY KEY (shop_id, account_id)
);
CREATE TABLE IF NOT EXISTS public.meta_daily_spend (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    account_id text NOT NULL, campaign_id text NOT NULL CHECK (campaign_id ~ '^[0-9]+$'),
    campaign_name text NOT NULL, spent_at date NOT NULL,
    native_amount numeric(18,6) NOT NULL CHECK (native_amount >= 0),
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'), timezone text NOT NULL,
    mnt_per_unit numeric(18,6) CHECK (mnt_per_unit > 0 AND mnt_per_unit <= 1000000),
    amount_mnt numeric GENERATED ALWAYS AS (round(native_amount * mnt_per_unit)) STORED,
    synced_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shop_id, account_id, campaign_id, spent_at)
);
CREATE TABLE IF NOT EXISTS public.meta_spend_coverage (
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    account_id text NOT NULL, spent_at date NOT NULL, synced_at timestamptz NOT NULL,
    PRIMARY KEY (shop_id, account_id, spent_at)
);
ALTER TABLE public.meta_daily_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_spend_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_spend_coverage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_daily_spend, public.meta_spend_sync, public.meta_spend_coverage FROM anon, authenticated;
GRANT ALL ON public.meta_daily_spend, public.meta_spend_sync, public.meta_spend_coverage TO service_role;

-- All pages must be fetched and validated before calling. A partial HTTP response never reaches this transaction.
CREATE OR REPLACE FUNCTION public.save_meta_daily_spend(
    p_shop uuid, p_account text, p_from date, p_to date, p_currency text, p_timezone text,
    p_rate numeric, p_replace_rate boolean, p_started timestamptz, p_rows jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_shop::text, 210921));
    IF p_account !~ '^act_[0-9]+$' OR NOT EXISTS (
        SELECT 1 FROM shops WHERE id = p_shop AND 'act_' || regexp_replace(facebook_ad_account_id, '^act_', '') = p_account
    ) THEN RAISE EXCEPTION 'Meta account changed or is not selected' USING ERRCODE = '23514'; END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 92
       OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR p_timezone IS NULL OR p_started IS NULL
       OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 50000
       OR (p_rate IS NOT NULL AND (p_rate <= 0 OR p_rate > 1000000))
       OR (p_currency = 'MNT' AND p_rate IS DISTINCT FROM 1::numeric)
    THEN RAISE EXCEPTION 'Invalid Meta import' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM meta_spend_sync WHERE shop_id = p_shop AND account_id = p_account AND last_attempt_at > p_started)
    THEN RAISE EXCEPTION 'A newer Meta sync already finished' USING ERRCODE = '40001'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(campaign_id text, campaign_name text, spent_at date, native_amount numeric)
        WHERE r.spent_at IS NULL OR r.spent_at < p_from OR r.spent_at > p_to OR r.campaign_id IS NULL OR r.campaign_id !~ '^[0-9]+$'
          OR r.native_amount IS NULL OR r.native_amount < 0 OR r.native_amount >= 1000000000000 OR r.campaign_name IS NULL)
    THEN RAISE EXCEPTION 'Invalid Meta daily row' USING ERRCODE = '23514'; END IF;

    INSERT INTO meta_daily_spend(shop_id,account_id,campaign_id,campaign_name,spent_at,native_amount,currency,timezone,mnt_per_unit,synced_at)
    SELECT p_shop,p_account,r.campaign_id,r.campaign_name,r.spent_at,r.native_amount,p_currency,p_timezone,p_rate,now()
    FROM jsonb_to_recordset(p_rows) AS r(campaign_id text,campaign_name text,spent_at date,native_amount numeric)
    ON CONFLICT (shop_id,account_id,campaign_id,spent_at) DO UPDATE SET
        campaign_name=excluded.campaign_name,native_amount=excluded.native_amount,currency=excluded.currency,timezone=excluded.timezone,
        mnt_per_unit=CASE WHEN p_replace_rate OR meta_daily_spend.currency <> excluded.currency THEN excluded.mnt_per_unit
                         ELSE coalesce(meta_daily_spend.mnt_per_unit,excluded.mnt_per_unit) END, synced_at=excluded.synced_at;
    GET DIAGNOSTICS n = ROW_COUNT;
    -- Reconcile corrections, including days now reporting zero/no rows; preserve all other accounts/dates.
    DELETE FROM meta_daily_spend d WHERE d.shop_id=p_shop AND d.account_id=p_account AND d.spent_at BETWEEN p_from AND p_to
        AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(campaign_id text,spent_at date)
                        WHERE r.campaign_id=d.campaign_id AND r.spent_at=d.spent_at);
    INSERT INTO meta_spend_coverage(shop_id,account_id,spent_at,synced_at)
    SELECT p_shop,p_account,day::date,now() FROM generate_series(p_from::timestamp,p_to::timestamp,'1 day') day
    ON CONFLICT (shop_id,account_id,spent_at) DO UPDATE SET synced_at=excluded.synced_at;
    INSERT INTO meta_spend_sync(shop_id,account_id,currency,timezone,mnt_per_unit,last_attempt_at,last_success_at,last_from,last_to,last_error)
    VALUES (p_shop,p_account,p_currency,p_timezone,p_rate,p_started,now(),p_from,p_to,NULL)
    ON CONFLICT (shop_id,account_id) DO UPDATE SET currency=excluded.currency,timezone=excluded.timezone,mnt_per_unit=excluded.mnt_per_unit,
        last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,last_from=excluded.last_from,last_to=excluded.last_to,last_error=NULL;
    RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.record_meta_spend_failure(p_shop uuid,p_account text,p_started timestamptz,p_error text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
    INSERT INTO meta_spend_sync(shop_id,account_id,last_attempt_at,last_error) VALUES(p_shop,p_account,p_started,left(p_error,500))
    ON CONFLICT(shop_id,account_id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,last_error=excluded.last_error
    WHERE meta_spend_sync.last_attempt_at <= excluded.last_attempt_at;
$$;
REVOKE ALL ON FUNCTION public.save_meta_daily_spend(uuid,text,date,date,text,text,numeric,boolean,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_meta_spend_failure(uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_meta_daily_spend(uuid,text,date,date,text,text,numeric,boolean,timestamptz,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_meta_spend_failure(uuid,text,timestamptz,text) TO service_role;
