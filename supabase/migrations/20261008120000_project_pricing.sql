-- Offer rates only. No ERP snapshots, contracts, inventory, or payments are changed.
CREATE TABLE IF NOT EXISTS public.project_pricing_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    version integer NOT NULL CHECK (version > 0),
    status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
    config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (shop_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_pricing_one_active ON public.project_pricing_configs(shop_id) WHERE status = 'active';
ALTER TABLE public.project_pricing_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_pricing_configs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_pricing_configs TO service_role;

-- Immutable versions; activation archives the previous active version atomically with an audit.
-- Only this RPC can write. API also checks session super_admin and selected-shop membership.
CREATE OR REPLACE FUNCTION public.save_project_pricing(
    p_shop_id uuid, p_actor uuid, p_expected_version integer, p_status text, p_config jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_version integer;
    v_previous public.project_pricing_configs%ROWTYPE;
    v_new public.project_pricing_configs%ROWTYPE;
    v_rule jsonb;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_actor AND role = 'super_admin')
        OR NOT (EXISTS (SELECT 1 FROM public.shops WHERE id = p_shop_id AND user_id = p_actor)
            OR EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_actor)) THEN
        RAISE EXCEPTION 'Үнийн тохиргоо засах эрх алга' USING ERRCODE = '42501';
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

    PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::text), 10812);
    SELECT * INTO v_previous FROM public.project_pricing_configs WHERE shop_id = p_shop_id ORDER BY version DESC LIMIT 1;
    v_version := coalesce(v_previous.version, 0);
    IF v_version <> p_expected_version THEN RAISE EXCEPTION 'Үнийн тохиргоо өөрчлөгдсөн байна' USING ERRCODE = '40001'; END IF;
    IF p_status = 'active' THEN UPDATE public.project_pricing_configs SET status = 'archived' WHERE shop_id = p_shop_id AND status = 'active'; END IF;
    INSERT INTO public.project_pricing_configs(shop_id,version,status,config,created_by)
    VALUES(p_shop_id,v_version + 1,p_status,p_config,p_actor) RETURNING * INTO v_new;
    INSERT INTO public.admin_audit_log(actor_id,action,target_id,meta)
    VALUES(p_actor,'pricing.' || p_status,p_shop_id::text,jsonb_build_object('before_version',v_version,'after_version',v_new.version,'config_id',v_new.id,'config',p_config));
    RETURN to_jsonb(v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.save_project_pricing(uuid,uuid,integer,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_pricing(uuid,uuid,integer,text,jsonb) TO service_role;
