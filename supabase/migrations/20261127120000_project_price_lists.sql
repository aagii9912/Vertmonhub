-- Several price lists per project (owner decision 2026-11-27: Mandala Garden's approved price and the
-- Forest Garden special price have different validity windows). Each list keeps its own versions,
-- validity window, source and archive; a project with one list («Үндсэн үнэ», key `main`) is unchanged.
ALTER TABLE public.project_pricing_configs
    ADD COLUMN IF NOT EXISTS list_key text NOT NULL DEFAULT 'main',
    ADD COLUMN IF NOT EXISTS list_name text NOT NULL DEFAULT 'Үндсэн үнэ',
    ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$
DECLARE
    v_constraint text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_pricing_list_key_shape' AND conrelid = 'public.project_pricing_configs'::regclass) THEN
        ALTER TABLE public.project_pricing_configs ADD CONSTRAINT project_pricing_list_key_shape CHECK (list_key ~ '^[a-z0-9-]{1,40}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_pricing_list_name_shape' AND conrelid = 'public.project_pricing_configs'::regclass) THEN
        ALTER TABLE public.project_pricing_configs ADD CONSTRAINT project_pricing_list_name_shape CHECK (list_name = btrim(list_name) AND length(list_name) BETWEEN 1 AND 80);
    END IF;
    -- Versions are numbered per list from now on: replace UNIQUE (shop_id, version) whatever its name is.
    FOR v_constraint IN
        SELECT c.conname FROM pg_constraint c
        WHERE c.conrelid = 'public.project_pricing_configs'::regclass AND c.contype = 'u'
            AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM unnest(c.conkey) AS k(attnum)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) = ARRAY['shop_id', 'version']
    LOOP
        EXECUTE format('ALTER TABLE public.project_pricing_configs DROP CONSTRAINT %I', v_constraint);
    END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS project_pricing_list_version ON public.project_pricing_configs(shop_id, list_key, version);
DROP INDEX IF EXISTS public.project_pricing_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS project_pricing_one_active_per_list ON public.project_pricing_configs(shop_id, list_key) WHERE status = 'active';

-- One list's next immutable version. Activation archives that list's previous active version and refuses
-- a price that another active list already gives for the same unit, condition and days (never two prices).
CREATE OR REPLACE FUNCTION public.save_project_price_list(
    p_shop_id uuid, p_actor uuid, p_list_key text, p_list_name text, p_expected_version integer, p_status text, p_config jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_version integer;
    v_name text := btrim(coalesce(p_list_name, ''));
    v_new public.project_pricing_configs%ROWTYPE;
    v_rule jsonb;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_actor AND role = 'super_admin')
        OR NOT (EXISTS (SELECT 1 FROM public.shops WHERE id = p_shop_id AND user_id = p_actor)
            OR EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_actor)) THEN
        RAISE EXCEPTION 'Үнийн тохиргоо засах эрх алга' USING ERRCODE = '42501';
    END IF;
    IF p_list_key IS NULL OR p_list_key !~ '^[a-z0-9-]{1,40}$' OR length(v_name) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'Үнийн жагсаалтын нэр буруу байна' USING ERRCODE = '22023';
    END IF;
    IF p_expected_version IS NULL OR p_expected_version < 0 OR p_status IS NULL OR p_status NOT IN ('draft', 'active')
        OR p_config IS NULL OR jsonb_typeof(p_config) <> 'object'
        OR NOT (p_config ?& ARRAY['source','valid_from','valid_until','inventory_area_confirmed','rules'])
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_config) AS k WHERE k NOT IN ('source','valid_from','valid_until','inventory_area_confirmed','rules'))
        OR jsonb_typeof(p_config->'source') IS DISTINCT FROM 'string'
        OR length(p_config->>'source') > 500
        OR jsonb_typeof(p_config->'inventory_area_confirmed') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(p_config->'valid_from') NOT IN ('string','null')
        OR jsonb_typeof(p_config->'valid_until') NOT IN ('string','null')
        OR jsonb_typeof(p_config->'rules') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Үнийн тохиргоо буруу байна' USING ERRCODE = '22023';
    END IF;
    IF (p_config->>'valid_from' IS NOT NULL AND (p_config->>'valid_from') !~ '^\d{4}-\d{2}-\d{2}$')
        OR (p_config->>'valid_until' IS NOT NULL AND (p_config->>'valid_until') !~ '^\d{4}-\d{2}-\d{2}$')
        OR jsonb_array_length(p_config->'rules') > 500 THEN
        RAISE EXCEPTION 'Үнийн хугацаа эсвэл мөрийн тоо буруу байна' USING ERRCODE = '22023';
    END IF;
    -- Date casts reject impossible calendar dates; lexical format was checked above.
    IF (p_config->>'valid_from')::date > (p_config->>'valid_until')::date THEN
        RAISE EXCEPTION 'Үнийн хугацаа буруу байна' USING ERRCODE = '22023';
    END IF;
    FOR v_rule IN SELECT value FROM jsonb_array_elements(p_config->'rules') LOOP
        IF jsonb_typeof(v_rule) <> 'object'
            OR NOT (v_rule ?& ARRAY['block','model','floor_min','floor_max','payment_condition','price_per_sqm','advance_percent'])
            OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_rule) AS k WHERE k NOT IN ('block','model','floor_min','floor_max','payment_condition','price_per_sqm','advance_percent'))
            OR jsonb_typeof(v_rule->'block') IS DISTINCT FROM 'string'
            OR jsonb_typeof(v_rule->'model') IS DISTINCT FROM 'string'
            OR jsonb_typeof(v_rule->'payment_condition') IS DISTINCT FROM 'string'
            OR length(btrim(v_rule->>'block')) NOT BETWEEN 1 AND 50
            OR length(btrim(v_rule->>'model')) NOT BETWEEN 1 AND 50
            OR length(btrim(v_rule->>'payment_condition')) NOT BETWEEN 1 AND 50
            OR jsonb_typeof(v_rule->'floor_min') IS DISTINCT FROM 'number'
            OR jsonb_typeof(v_rule->'floor_max') IS DISTINCT FROM 'number'
            OR jsonb_typeof(v_rule->'price_per_sqm') IS DISTINCT FROM 'number'
            OR jsonb_typeof(v_rule->'advance_percent') NOT IN ('number','null') THEN
            RAISE EXCEPTION 'Үнийн мөр буруу байна' USING ERRCODE = '22023';
        END IF;
        IF (v_rule->>'floor_min')::numeric NOT BETWEEN 1 AND 200
            OR (v_rule->>'floor_max')::numeric NOT BETWEEN 1 AND 200
            OR (v_rule->>'floor_min')::numeric <> trunc((v_rule->>'floor_min')::numeric)
            OR (v_rule->>'floor_max')::numeric <> trunc((v_rule->>'floor_max')::numeric)
            OR (v_rule->>'floor_min')::numeric > (v_rule->>'floor_max')::numeric
            OR (v_rule->>'price_per_sqm')::numeric NOT BETWEEN 1 AND 1000000000
            OR (v_rule->>'price_per_sqm')::numeric <> trunc((v_rule->>'price_per_sqm')::numeric)
            OR (v_rule->>'advance_percent' IS NOT NULL AND ((v_rule->>'advance_percent')::numeric NOT BETWEEN 0 AND 100
                OR (v_rule->>'advance_percent')::numeric * 100 <> trunc((v_rule->>'advance_percent')::numeric * 100))) THEN
            RAISE EXCEPTION 'Үнийн дүн, давхар эсвэл хувь буруу байна' USING ERRCODE = '22023';
        END IF;
    END LOOP;
    IF p_status = 'active' AND (length(btrim(p_config->>'source')) = 0
        OR p_config->>'valid_from' IS NULL OR p_config->>'valid_until' IS NULL
        OR p_config->>'inventory_area_confirmed' <> 'true' OR jsonb_array_length(p_config->'rules') = 0
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_config->'rules') r WHERE r->>'advance_percent' IS NULL)) THEN
        RAISE EXCEPTION 'Эх сурвалж, хугацаа, талбай, урьдчилгааг батална уу' USING ERRCODE = '22023';
    END IF;
    IF p_status = 'active' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_config->'rules') WITH ORDINALITY a(rule,idx)
        JOIN jsonb_array_elements(p_config->'rules') WITH ORDINALITY b(rule,idx) ON a.idx < b.idx
        WHERE translate(upper(btrim(a.rule->>'block')),'БЕ','BE') = translate(upper(btrim(b.rule->>'block')),'БЕ','BE')
            AND translate(upper(btrim(a.rule->>'model')),'БЕ','BE') = translate(upper(btrim(b.rule->>'model')),'БЕ','BE')
            AND translate(upper(btrim(a.rule->>'payment_condition')),'БЕ','BE') = translate(upper(btrim(b.rule->>'payment_condition')),'БЕ','BE')
            AND (a.rule->>'floor_min')::integer <= (b.rule->>'floor_max')::integer
            AND (b.rule->>'floor_min')::integer <= (a.rule->>'floor_max')::integer
    ) THEN RAISE EXCEPTION 'Үнийн давхарын зааг давхардсан байна' USING ERRCODE = '22023'; END IF;

    -- Every list of the shop shares the lock: the cross-list checks below see a settled state.
    PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::text), 10812);
    SELECT coalesce(max(version), 0) INTO v_version FROM public.project_pricing_configs WHERE shop_id = p_shop_id AND list_key = p_list_key;
    IF v_version <> p_expected_version THEN RAISE EXCEPTION 'Үнийн тохиргоо өөрчлөгдсөн байна' USING ERRCODE = '40001'; END IF;
    IF v_version = 0 AND (SELECT count(DISTINCT list_key) FROM public.project_pricing_configs WHERE shop_id = p_shop_id) >= 20 THEN
        RAISE EXCEPTION 'Үнийн жагсаалтын тоо хязгаарт хүрсэн' USING ERRCODE = '22023';
    END IF;
    -- A list is known by the name of its latest version; two lists never share one.
    IF EXISTS (
        SELECT 1 FROM (
            SELECT DISTINCT ON (list_key) list_key, list_name FROM public.project_pricing_configs
            WHERE shop_id = p_shop_id AND list_key <> p_list_key ORDER BY list_key, version DESC
        ) other WHERE lower(other.list_name) = lower(v_name)
    ) THEN RAISE EXCEPTION 'Ийм нэртэй үнийн жагсаалт байна' USING ERRCODE = '23505'; END IF;
    IF p_status = 'active' AND EXISTS (
        SELECT 1 FROM public.project_pricing_configs o
        CROSS JOIN LATERAL jsonb_array_elements(o.config->'rules') AS b(rule)
        JOIN jsonb_array_elements(p_config->'rules') AS a(rule)
            ON translate(upper(btrim(a.rule->>'block')),'БЕ','BE') = translate(upper(btrim(b.rule->>'block')),'БЕ','BE')
            AND translate(upper(btrim(a.rule->>'model')),'БЕ','BE') = translate(upper(btrim(b.rule->>'model')),'БЕ','BE')
            AND translate(upper(btrim(a.rule->>'payment_condition')),'БЕ','BE') = translate(upper(btrim(b.rule->>'payment_condition')),'БЕ','BE')
            AND (a.rule->>'floor_min')::integer <= (b.rule->>'floor_max')::integer
            AND (b.rule->>'floor_min')::integer <= (a.rule->>'floor_max')::integer
        WHERE o.shop_id = p_shop_id AND o.status = 'active' AND o.list_key <> p_list_key
            AND (o.config->>'valid_from')::date <= (p_config->>'valid_until')::date
            AND (p_config->>'valid_from')::date <= (o.config->>'valid_until')::date
    ) THEN RAISE EXCEPTION 'Өөр идэвхтэй үнийн жагсаалттай давхцаж байна' USING ERRCODE = '23P01'; END IF;

    IF p_status = 'active' THEN
        UPDATE public.project_pricing_configs SET status = 'archived', archived_at = clock_timestamp()
        WHERE shop_id = p_shop_id AND list_key = p_list_key AND status = 'active';
    END IF;
    INSERT INTO public.project_pricing_configs(shop_id,list_key,list_name,version,status,config,created_by)
    VALUES(p_shop_id,p_list_key,v_name,v_version + 1,p_status,p_config,p_actor) RETURNING * INTO v_new;
    INSERT INTO public.admin_audit_log(actor_id,action,target_id,meta)
    VALUES(p_actor,'pricing.' || p_status,p_shop_id::text,jsonb_build_object('list_key',p_list_key,'list_name',v_name,
        'before_version',v_version,'after_version',v_new.version,'config_id',v_new.id,'config',p_config));
    RETURN to_jsonb(v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.save_project_price_list(uuid,uuid,text,text,integer,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_price_list(uuid,uuid,text,text,integer,text,jsonb) TO service_role;

-- The earlier single-list entry point keeps working for the default list (code deployed before this change).
CREATE OR REPLACE FUNCTION public.save_project_pricing(
    p_shop_id uuid, p_actor uuid, p_expected_version integer, p_status text, p_config jsonb
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    SELECT public.save_project_price_list(p_shop_id, p_actor, 'main', coalesce((
        SELECT list_name FROM public.project_pricing_configs WHERE shop_id = p_shop_id AND list_key = 'main' ORDER BY version DESC LIMIT 1
    ), 'Үндсэн үнэ'), p_expected_version, p_status, p_config);
$$;
REVOKE ALL ON FUNCTION public.save_project_pricing(uuid,uuid,integer,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_pricing(uuid,uuid,integer,text,jsonb) TO service_role;

-- Withdraw a list's active price without a replacement (a special price that ends early, a wrong activation).
CREATE OR REPLACE FUNCTION public.retire_project_price_list(
    p_shop_id uuid, p_actor uuid, p_list_key text, p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_version integer;
    v_row public.project_pricing_configs%ROWTYPE;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_actor AND role = 'super_admin')
        OR NOT (EXISTS (SELECT 1 FROM public.shops WHERE id = p_shop_id AND user_id = p_actor)
            OR EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_actor)) THEN
        RAISE EXCEPTION 'Үнийн тохиргоо засах эрх алга' USING ERRCODE = '42501';
    END IF;
    IF p_list_key IS NULL OR p_list_key !~ '^[a-z0-9-]{1,40}$' OR p_expected_version IS NULL OR p_expected_version < 1 THEN
        RAISE EXCEPTION 'Үнийн жагсаалт буруу байна' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::text), 10812);
    SELECT coalesce(max(version), 0) INTO v_version FROM public.project_pricing_configs WHERE shop_id = p_shop_id AND list_key = p_list_key;
    IF v_version <> p_expected_version THEN RAISE EXCEPTION 'Үнийн тохиргоо өөрчлөгдсөн байна' USING ERRCODE = '40001'; END IF;
    UPDATE public.project_pricing_configs SET status = 'archived', archived_at = clock_timestamp()
    WHERE shop_id = p_shop_id AND list_key = p_list_key AND status = 'active' RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Идэвхтэй үнэ алга' USING ERRCODE = 'P0002'; END IF;
    INSERT INTO public.admin_audit_log(actor_id,action,target_id,meta)
    VALUES(p_actor,'pricing.retired',p_shop_id::text,jsonb_build_object('list_key',v_row.list_key,'list_name',v_row.list_name,
        'version',v_row.version,'config_id',v_row.id));
    RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.retire_project_price_list(uuid,uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retire_project_price_list(uuid,uuid,text,integer) TO service_role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.project_pricing_configs WHERE list_key IS NULL OR list_name IS NULL)
        OR to_regclass('public.project_pricing_one_active') IS NOT NULL
        OR to_regclass('public.project_pricing_one_active_per_list') IS NULL
        OR to_regclass('public.project_pricing_list_version') IS NULL THEN
        RAISE EXCEPTION 'VERIFY project price lists failed';
    END IF;
END;
$$;
