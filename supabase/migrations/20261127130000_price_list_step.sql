-- Step price (owner decision 2026-11-27, Mandala Garden Forest Garden): the m² price of a model rises by a
-- fixed amount with every contract of that model, for pre-order apartments until the list ends. A list's
-- config may carry `step` = { amount_per_sqm, counts_from }; counting contracts is the application's job
-- (live contracts of the block's apartments dated from `counts_from`). Everything else is unchanged from
-- 20261127120000.
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
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_config) AS k WHERE k NOT IN ('source','valid_from','valid_until','inventory_area_confirmed','rules','step'))
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
    -- Optional step: the m² price of a model rises by a fixed amount with every contract of that model.
    IF p_config ? 'step' AND jsonb_typeof(p_config->'step') <> 'null' THEN
        IF jsonb_typeof(p_config->'step') <> 'object'
            OR NOT (p_config->'step' ?& ARRAY['amount_per_sqm','counts_from'])
            OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_config->'step') AS k WHERE k NOT IN ('amount_per_sqm','counts_from'))
            OR jsonb_typeof(p_config->'step'->'amount_per_sqm') IS DISTINCT FROM 'number'
            OR jsonb_typeof(p_config->'step'->'counts_from') IS DISTINCT FROM 'string'
            OR (p_config->'step'->>'counts_from') !~ '^\d{4}-\d{2}-\d{2}$' THEN
            RAISE EXCEPTION 'Гэрээ бүрд нэмэгдэх үнийн тохиргоо буруу байна' USING ERRCODE = '22023';
        END IF;
        IF (p_config->'step'->>'amount_per_sqm')::numeric NOT BETWEEN 1 AND 100000000
            OR (p_config->'step'->>'amount_per_sqm')::numeric <> trunc((p_config->'step'->>'amount_per_sqm')::numeric)
            OR (p_config->'step'->>'counts_from')::date IS NULL THEN
            RAISE EXCEPTION 'Гэрээ бүрд нэмэгдэх үнийн дүн эсвэл огноо буруу байна' USING ERRCODE = '22023';
        END IF;
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
