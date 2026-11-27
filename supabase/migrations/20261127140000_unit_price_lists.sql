-- Per-unit price lists (owner decision 2026-11-27): parking spaces, storage and service space are sold at a
-- price per unit, not per m² — Mandala Garden's approved «Зогсоолын үнийн санал» lists one price (or one price
-- per payment condition) for every space by its code. Apartments stay in project_pricing_configs.
-- A list is versioned like the apartment price lists: immutable versions, one active version per list,
-- written only through the RPCs below.
CREATE TABLE IF NOT EXISTS public.project_unit_price_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    list_key text NOT NULL CHECK (list_key ~ '^[a-z0-9-]{1,40}$'),
    list_name text NOT NULL CHECK (list_name = btrim(list_name) AND length(list_name) BETWEEN 1 AND 80),
    category text NOT NULL CHECK (category IN ('parking', 'industry', 'commercial')),
    version integer NOT NULL CHECK (version > 0),
    status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
    config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    archived_at timestamptz,
    UNIQUE (shop_id, list_key, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_unit_price_one_active_per_list ON public.project_unit_price_lists(shop_id, list_key) WHERE status = 'active';
ALTER TABLE public.project_unit_price_lists ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_unit_price_lists FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_unit_price_lists TO service_role;

-- config = { source, valid_from, valid_until, note, conditions: [{ label, advance_percent }],
--            rows: [{ block, code, model, area_sqm, prices: { <condition label>: whole tugrik } }] }
-- valid_until may be null: «2026/10/08-с хүчинтэй» has no end day.
CREATE OR REPLACE FUNCTION public.save_project_unit_price_list(
    p_shop_id uuid, p_actor uuid, p_list_key text, p_list_name text, p_category text, p_expected_version integer, p_status text, p_config jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_version integer;
    v_name text := btrim(coalesce(p_list_name, ''));
    v_category text;
    v_new public.project_unit_price_lists%ROWTYPE;
    v_from date;
    v_until date;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_actor AND role = 'super_admin')
        OR NOT (EXISTS (SELECT 1 FROM public.shops WHERE id = p_shop_id AND user_id = p_actor)
            OR EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_actor)) THEN
        RAISE EXCEPTION 'Үнийн тохиргоо засах эрх алга' USING ERRCODE = '42501';
    END IF;
    IF p_list_key IS NULL OR p_list_key !~ '^[a-z0-9-]{1,40}$' OR length(v_name) NOT BETWEEN 1 AND 80
        OR p_category IS NULL OR p_category NOT IN ('parking', 'industry', 'commercial') THEN
        RAISE EXCEPTION 'Үнийн жагсаалтын нэр эсвэл төрөл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF p_expected_version IS NULL OR p_expected_version < 0 OR p_status IS NULL OR p_status NOT IN ('draft', 'active')
        OR p_config IS NULL OR jsonb_typeof(p_config) <> 'object'
        OR NOT (p_config ?& ARRAY['source','valid_from','valid_until','note','conditions','rows'])
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_config) AS k WHERE k NOT IN ('source','valid_from','valid_until','note','conditions','rows'))
        OR jsonb_typeof(p_config->'source') IS DISTINCT FROM 'string' OR length(p_config->>'source') > 500
        OR jsonb_typeof(p_config->'note') IS DISTINCT FROM 'string' OR length(p_config->>'note') > 2000
        OR jsonb_typeof(p_config->'valid_from') NOT IN ('string','null')
        OR jsonb_typeof(p_config->'valid_until') NOT IN ('string','null')
        OR (p_config->>'valid_from' IS NOT NULL AND (p_config->>'valid_from') !~ '^\d{4}-\d{2}-\d{2}$')
        OR (p_config->>'valid_until' IS NOT NULL AND (p_config->>'valid_until') !~ '^\d{4}-\d{2}-\d{2}$')
        OR jsonb_typeof(p_config->'conditions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'conditions') > 12
        OR jsonb_typeof(p_config->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'rows') > 3000 THEN
        RAISE EXCEPTION 'Үнийн тохиргоо буруу байна' USING ERRCODE = '22023';
    END IF;
    -- Date casts reject impossible calendar dates; the lexical format was checked above.
    v_from := (p_config->>'valid_from')::date;
    v_until := (p_config->>'valid_until')::date;
    IF v_from > v_until THEN RAISE EXCEPTION 'Үнийн хугацаа буруу байна' USING ERRCODE = '22023'; END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_config->'conditions') c
        WHERE jsonb_typeof(c) <> 'object' OR NOT (c ?& ARRAY['label','advance_percent'])
            OR EXISTS (SELECT 1 FROM jsonb_object_keys(c) AS k WHERE k NOT IN ('label','advance_percent'))
            OR jsonb_typeof(c->'label') IS DISTINCT FROM 'string' OR length(btrim(c->>'label')) NOT BETWEEN 1 AND 50 OR c->>'label' <> btrim(c->>'label')
            OR jsonb_typeof(c->'advance_percent') NOT IN ('number','null')
            OR (c->>'advance_percent' IS NOT NULL AND ((c->>'advance_percent')::numeric NOT BETWEEN 0 AND 100
                OR (c->>'advance_percent')::numeric * 100 <> trunc((c->>'advance_percent')::numeric * 100)))
    ) OR (SELECT count(*) <> count(DISTINCT c->>'label') FROM jsonb_array_elements(p_config->'conditions') c) THEN
        RAISE EXCEPTION 'Төлбөрийн нөхцөл буруу эсвэл давхардсан байна' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_config->'rows') r
        WHERE jsonb_typeof(r) <> 'object' OR NOT (r ?& ARRAY['block','code','model','area_sqm','prices'])
            OR EXISTS (SELECT 1 FROM jsonb_object_keys(r) AS k WHERE k NOT IN ('block','code','model','area_sqm','prices'))
            OR jsonb_typeof(r->'block') IS DISTINCT FROM 'string' OR length(btrim(r->>'block')) NOT BETWEEN 1 AND 50
            OR jsonb_typeof(r->'code') IS DISTINCT FROM 'string' OR length(btrim(r->>'code')) NOT BETWEEN 1 AND 50
            OR jsonb_typeof(r->'model') NOT IN ('string','null') OR length(coalesce(r->>'model', '')) > 50
            OR jsonb_typeof(r->'area_sqm') NOT IN ('number','null')
            OR (r->>'area_sqm' IS NOT NULL AND (r->>'area_sqm')::numeric NOT BETWEEN 0.01 AND 99999999.99)
            OR jsonb_typeof(r->'prices') IS DISTINCT FROM 'object'
            OR EXISTS (SELECT 1 FROM jsonb_each(r->'prices') AS p(label, amount)
                WHERE jsonb_typeof(p.amount) IS DISTINCT FROM 'number'
                    OR (p.amount #>> '{}')::numeric NOT BETWEEN 1 AND 100000000000
                    OR (p.amount #>> '{}')::numeric <> trunc((p.amount #>> '{}')::numeric)
                    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_config->'conditions') c WHERE c->>'label' = p.label))
    ) THEN RAISE EXCEPTION 'Үнийн мөр буруу байна' USING ERRCODE = '22023'; END IF;
    IF p_status = 'active' AND (length(btrim(p_config->>'source')) = 0 OR v_from IS NULL
        OR jsonb_array_length(p_config->'conditions') = 0 OR jsonb_array_length(p_config->'rows') = 0
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_config->'rows') r WHERE r->'prices' = '{}'::jsonb)
        OR (SELECT count(*) <> count(DISTINCT upper(btrim(r->>'code'))) FROM jsonb_array_elements(p_config->'rows') r)) THEN
        RAISE EXCEPTION 'Эх сурвалж, эхлэх огноо, нөхцөл, үнийн мөрийг шалгана уу (код давхардаж болохгүй)' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::text), 10813);
    SELECT coalesce(max(version), 0), max(category) INTO v_version, v_category
    FROM public.project_unit_price_lists WHERE shop_id = p_shop_id AND list_key = p_list_key;
    IF v_version <> p_expected_version THEN RAISE EXCEPTION 'Үнийн тохиргоо өөрчлөгдсөн байна' USING ERRCODE = '40001'; END IF;
    -- A list keeps the kind it was created with.
    IF v_category IS NOT NULL AND v_category <> p_category THEN RAISE EXCEPTION 'Жагсаалтын төрлийг өөрчилж болохгүй' USING ERRCODE = '22023'; END IF;
    IF v_version = 0 AND (SELECT count(DISTINCT list_key) FROM public.project_unit_price_lists WHERE shop_id = p_shop_id) >= 40 THEN
        RAISE EXCEPTION 'Үнийн жагсаалтын тоо хязгаарт хүрсэн' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM (
            SELECT DISTINCT ON (list_key) list_key, list_name FROM public.project_unit_price_lists
            WHERE shop_id = p_shop_id AND list_key <> p_list_key ORDER BY list_key, version DESC
        ) other WHERE lower(other.list_name) = lower(v_name)
    ) THEN RAISE EXCEPTION 'Ийм нэртэй үнийн жагсаалт байна' USING ERRCODE = '23505'; END IF;
    -- One unit never has two active prices on the same days (an open end overlaps everything after its start).
    IF p_status = 'active' AND EXISTS (
        SELECT 1 FROM public.project_unit_price_lists o
        CROSS JOIN LATERAL jsonb_array_elements(o.config->'rows') AS b(item)
        JOIN jsonb_array_elements(p_config->'rows') AS a(item) ON upper(btrim(a.item->>'code')) = upper(btrim(b.item->>'code'))
        WHERE o.shop_id = p_shop_id AND o.status = 'active' AND o.list_key <> p_list_key AND o.category = p_category
            AND (o.config->>'valid_from')::date <= coalesce(v_until, 'infinity'::date)
            AND v_from <= coalesce((o.config->>'valid_until')::date, 'infinity'::date)
    ) THEN RAISE EXCEPTION 'Өөр идэвхтэй үнийн жагсаалттай давхцаж байна' USING ERRCODE = '23P01'; END IF;

    IF p_status = 'active' THEN
        UPDATE public.project_unit_price_lists SET status = 'archived', archived_at = clock_timestamp()
        WHERE shop_id = p_shop_id AND list_key = p_list_key AND status = 'active';
    END IF;
    INSERT INTO public.project_unit_price_lists(shop_id,list_key,list_name,category,version,status,config,created_by)
    VALUES(p_shop_id,p_list_key,v_name,p_category,v_version + 1,p_status,p_config,p_actor) RETURNING * INTO v_new;
    INSERT INTO public.admin_audit_log(actor_id,action,target_id,meta)
    VALUES(p_actor,'unit_pricing.' || p_status,p_shop_id::text,jsonb_build_object('list_key',p_list_key,'list_name',v_name,'category',p_category,
        'before_version',v_version,'after_version',v_new.version,'config_id',v_new.id,'rows',jsonb_array_length(p_config->'rows'),
        'source',p_config->>'source','valid_from',p_config->>'valid_from','valid_until',p_config->>'valid_until'));
    RETURN to_jsonb(v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.save_project_unit_price_list(uuid,uuid,text,text,text,integer,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_unit_price_list(uuid,uuid,text,text,text,integer,text,jsonb) TO service_role;

-- Withdraw a list's active price without a replacement.
CREATE OR REPLACE FUNCTION public.retire_project_unit_price_list(
    p_shop_id uuid, p_actor uuid, p_list_key text, p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_version integer;
    v_row public.project_unit_price_lists%ROWTYPE;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_actor AND role = 'super_admin')
        OR NOT (EXISTS (SELECT 1 FROM public.shops WHERE id = p_shop_id AND user_id = p_actor)
            OR EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_actor)) THEN
        RAISE EXCEPTION 'Үнийн тохиргоо засах эрх алга' USING ERRCODE = '42501';
    END IF;
    IF p_list_key IS NULL OR p_list_key !~ '^[a-z0-9-]{1,40}$' OR p_expected_version IS NULL OR p_expected_version < 1 THEN
        RAISE EXCEPTION 'Үнийн жагсаалт буруу байна' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(p_shop_id::text), 10813);
    SELECT coalesce(max(version), 0) INTO v_version FROM public.project_unit_price_lists WHERE shop_id = p_shop_id AND list_key = p_list_key;
    IF v_version <> p_expected_version THEN RAISE EXCEPTION 'Үнийн тохиргоо өөрчлөгдсөн байна' USING ERRCODE = '40001'; END IF;
    UPDATE public.project_unit_price_lists SET status = 'archived', archived_at = clock_timestamp()
    WHERE shop_id = p_shop_id AND list_key = p_list_key AND status = 'active' RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Идэвхтэй үнэ алга' USING ERRCODE = 'P0002'; END IF;
    INSERT INTO public.admin_audit_log(actor_id,action,target_id,meta)
    VALUES(p_actor,'unit_pricing.retired',p_shop_id::text,jsonb_build_object('list_key',v_row.list_key,'list_name',v_row.list_name,
        'category',v_row.category,'version',v_row.version,'config_id',v_row.id));
    RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.retire_project_unit_price_list(uuid,uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retire_project_unit_price_list(uuid,uuid,text,integer) TO service_role;
