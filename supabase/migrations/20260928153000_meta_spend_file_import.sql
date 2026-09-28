-- File imports and API sync share the existing account/campaign/day ledger.
-- Files update only their rows. Complete API coverage always takes precedence.
CREATE TABLE IF NOT EXISTS public.meta_spend_imports (
    id uuid PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    created_by uuid NOT NULL,
    file_name text NOT NULL,
    account_id text NOT NULL CHECK (account_id ~ '^act_[0-9]+$'),
    currency text NOT NULL, timezone text NOT NULL, mnt_per_unit numeric(18,6) NOT NULL,
    from_date date NOT NULL, to_date date NOT NULL,
    content_hash text NOT NULL, summary jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meta_spend_imports_shop_created ON public.meta_spend_imports(shop_id, created_at DESC);
ALTER TABLE public.meta_spend_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_spend_imports FROM anon, authenticated;
GRANT ALL ON public.meta_spend_imports TO service_role;
ALTER TABLE public.meta_daily_spend ADD COLUMN IF NOT EXISTS ingestion_source text NOT NULL DEFAULT 'api'
    CHECK (ingestion_source IN ('api', 'file'));
ALTER TABLE public.meta_daily_spend ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES public.meta_spend_imports(id);

CREATE OR REPLACE FUNCTION public.import_meta_daily_spend(
    p_shop uuid, p_user uuid, p_id uuid, p_file text, p_account text,
    p_currency text, p_timezone text, p_rate numeric, p_rows jsonb,
    p_commit boolean DEFAULT false, p_expected text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_hash text; v_fingerprint text; v_saved meta_spend_imports%ROWTYPE;
    v_summary jsonb; v_from date; v_to date; v_manual bigint;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_shop::text, 210921));
    IF p_shop IS NULL OR NOT EXISTS (SELECT 1 FROM shops WHERE id = p_shop)
       OR p_user IS NULL OR p_id IS NULL OR p_file IS NULL OR length(p_file) NOT BETWEEN 1 AND 255
       OR p_account IS NULL OR p_account !~ '^act_[0-9]{1,40}$'
       OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
       OR p_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone)
       OR p_rate IS NULL OR p_rate <= 0 OR p_rate > 1000000 OR p_rate <> round(p_rate,6)
       OR (p_currency = 'MNT' AND p_rate <> 1)
       OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
    THEN RAISE EXCEPTION 'Invalid file import settings' USING ERRCODE = '23514'; END IF;
    IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 5000 THEN
        RAISE EXCEPTION 'Invalid file row count' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(campaign_id text,campaign_name text,spent_at date,native_amount numeric)
        WHERE r.campaign_id IS NULL OR r.campaign_id !~ '^[0-9]{1,40}$'
          OR r.campaign_name IS NULL OR length(r.campaign_name) NOT BETWEEN 1 AND 255
          OR r.spent_at IS NULL OR r.spent_at > (now() AT TIME ZONE p_timezone)::date
          OR r.native_amount IS NULL OR r.native_amount < 0 OR r.native_amount >= 1000000000000 OR r.native_amount <> round(r.native_amount,6))
       OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(campaign_id text,spent_at date) GROUP BY campaign_id,spent_at HAVING count(*) > 1)
    THEN RAISE EXCEPTION 'Invalid file rows' USING ERRCODE = '23514'; END IF;
    SELECT min(spent_at),max(spent_at) INTO v_from,v_to FROM jsonb_to_recordset(p_rows) AS r(spent_at date);
    IF v_to - v_from > 92 THEN RAISE EXCEPTION 'File exceeds 93 days' USING ERRCODE = '23514'; END IF;
    v_hash := md5(jsonb_build_array(p_account,p_currency,p_timezone,p_rate,p_rows)::text);
    -- A retry must not overwrite a subsequent import or API correction.
    SELECT * INTO v_saved FROM meta_spend_imports WHERE id = p_id;
    IF FOUND THEN
        IF v_saved.shop_id <> p_shop OR v_saved.content_hash <> v_hash THEN
            RAISE EXCEPTION 'Import request changed' USING ERRCODE = '40001'; END IF;
        RETURN v_saved.summary || jsonb_build_object('id',v_saved.id);
    END IF;
    IF EXISTS (SELECT 1 FROM meta_daily_spend WHERE shop_id=p_shop AND account_id=p_account
        AND (currency<>p_currency OR timezone<>p_timezone)) THEN
        RAISE EXCEPTION 'Account currency or timezone mismatch' USING ERRCODE = '23514'; END IF;

    WITH inputs AS (SELECT * FROM jsonb_to_recordset(p_rows) AS r(campaign_id text,campaign_name text,spent_at date,native_amount numeric)),
    compared AS (
        SELECT r.*,d.id,d.ingestion_source,d.synced_at,d.native_amount AS old_amount,d.mnt_per_unit AS old_rate,
            d.campaign_name AS old_name,d.currency AS old_currency,d.timezone AS old_timezone,c.synced_at AS covered_at,
            (coalesce(d.ingestion_source='api',false) OR c.spent_at IS NOT NULL) AS api,
            (d.campaign_name,d.native_amount,d.currency,d.timezone,d.mnt_per_unit)
                IS DISTINCT FROM (r.campaign_name,r.native_amount,p_currency,p_timezone,p_rate) AS changed
        FROM inputs r LEFT JOIN meta_daily_spend d ON d.shop_id=p_shop AND d.account_id=p_account AND d.campaign_id=r.campaign_id AND d.spent_at=r.spent_at
        LEFT JOIN meta_spend_coverage c ON c.shop_id=p_shop AND c.account_id=p_account AND c.spent_at=r.spent_at
    )
    SELECT jsonb_build_object('rows',count(*),'added',count(*) FILTER (WHERE NOT api AND id IS NULL),
        'updated',count(*) FILTER (WHERE NOT api AND id IS NOT NULL AND changed),
        'unchanged',count(*) FILTER (WHERE NOT api AND id IS NOT NULL AND NOT changed),
        'skippedApi',count(*) FILTER (WHERE api),'nativeTotal',sum(native_amount)::text,
        'savedMnt',coalesce(sum(round(native_amount*p_rate)) FILTER (WHERE NOT api),0)::text),
        md5(v_hash || jsonb_agg(jsonb_build_array(id,old_amount,old_rate,old_name,old_currency,old_timezone,ingestion_source,synced_at,covered_at)
            ORDER BY spent_at,campaign_id)::text)
    INTO v_summary,v_fingerprint FROM compared;
    SELECT count(*) INTO v_manual FROM marketing_spend_entries m
        WHERE m.shop_id=p_shop AND m.deleted_at IS NULL AND m.channel IN ('meta_ads','facebook_ads','instagram_ads')
          AND m.spent_at IN (SELECT spent_at FROM jsonb_to_recordset(p_rows) AS r(spent_at date))
          AND NOT EXISTS (SELECT 1 FROM meta_spend_coverage c WHERE c.shop_id=p_shop AND c.spent_at=m.spent_at);
    v_fingerprint := md5(v_fingerprint || v_manual::text);
    v_summary := v_summary || jsonb_build_object('fingerprint',v_fingerprint,'manualOverlap',v_manual);
    IF NOT p_commit THEN RETURN v_summary; END IF;
    IF p_expected IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION 'Ledger changed since preview' USING ERRCODE = '40001'; END IF;

    INSERT INTO meta_spend_imports(id,shop_id,created_by,file_name,account_id,currency,timezone,mnt_per_unit,from_date,to_date,content_hash,summary)
    VALUES(p_id,p_shop,p_user,p_file,p_account,p_currency,p_timezone,p_rate,v_from,v_to,v_hash,v_summary);
    INSERT INTO meta_daily_spend(shop_id,account_id,campaign_id,campaign_name,spent_at,native_amount,currency,timezone,mnt_per_unit,synced_at,ingestion_source,import_id)
    SELECT p_shop,p_account,r.campaign_id,r.campaign_name,r.spent_at,r.native_amount,p_currency,p_timezone,p_rate,now(),'file',p_id
    FROM jsonb_to_recordset(p_rows) AS r(campaign_id text,campaign_name text,spent_at date,native_amount numeric)
    WHERE NOT EXISTS (SELECT 1 FROM meta_spend_coverage c WHERE c.shop_id=p_shop AND c.account_id=p_account AND c.spent_at=r.spent_at)
    ON CONFLICT (shop_id,account_id,campaign_id,spent_at) DO UPDATE SET
        campaign_name=excluded.campaign_name,native_amount=excluded.native_amount,currency=excluded.currency,timezone=excluded.timezone,
        mnt_per_unit=excluded.mnt_per_unit,synced_at=excluded.synced_at,ingestion_source='file',import_id=p_id
    WHERE meta_daily_spend.ingestion_source='file'
        AND (meta_daily_spend.campaign_name,meta_daily_spend.native_amount,meta_daily_spend.currency,meta_daily_spend.timezone,meta_daily_spend.mnt_per_unit)
          IS DISTINCT FROM (excluded.campaign_name,excluded.native_amount,excluded.currency,excluded.timezone,excluded.mnt_per_unit);
    -- A file may be partial: do not delete absent rows or claim full-day/zero-day coverage.
    RETURN v_summary || jsonb_build_object('id',p_id);
END $$;
REVOKE ALL ON FUNCTION public.import_meta_daily_spend(uuid,uuid,uuid,text,text,text,text,numeric,jsonb,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_meta_daily_spend(uuid,uuid,uuid,text,text,text,text,numeric,jsonb,boolean,text) TO service_role;

-- Preserve the API transaction; tag rows it replaces as API-authoritative.
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
                         ELSE coalesce(meta_daily_spend.mnt_per_unit,excluded.mnt_per_unit) END, synced_at=excluded.synced_at,
        ingestion_source='api', import_id=NULL;
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
