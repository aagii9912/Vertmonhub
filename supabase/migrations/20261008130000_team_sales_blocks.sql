-- Monthly Б1 / Б2 / parking amounts; totals stay in the existing report columns.
-- Existing aggregate-only values are preserved until a metric is entered by block.
ALTER TABLE public.team_sales_targets
    ADD COLUMN IF NOT EXISTS block_amounts jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.team_sales_targets'::regclass AND conname = 'team_sales_block_amounts_object') THEN
        ALTER TABLE public.team_sales_targets ADD CONSTRAINT team_sales_block_amounts_object
            CHECK (jsonb_typeof(block_amounts) = 'object');
    END IF;
END;
$$;

COMMENT ON COLUMN public.team_sales_targets.block_amounts IS 'Б1, Б2, зогсоолын сарын төлөвлөгөө/гүйцэтгэл; байхгүй талбар = задаргаа оруулаагүй, NULL = хоосон, 0 = оруулсан дүн';

CREATE OR REPLACE FUNCTION public.save_team_monthly_sales(
    p_shop_id uuid, p_year integer, p_months jsonb, p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    v_patch jsonb;
    v_month integer;
    v_seen integer[] := ARRAY[]::integer[];
    v_field text;
    v_amount numeric;
    v_block text;
    v_values jsonb;
    v_blocks jsonb;
    v_block_patch jsonb;
    v_fields constant text[] := ARRAY['target_amount', 'cashflow_target_amount', 'manual_contract_actual_amount', 'manual_cashflow_actual_amount'];
    v_before public.team_sales_targets%ROWTYPE;
    v_after public.team_sales_targets%ROWTYPE;
    v_before_json jsonb;
    v_saved jsonb := '[]'::jsonb;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_actor AND role = 'super_admin') THEN
        RAISE EXCEPTION 'Төлөвлөгөөг зөвхөн super_admin хадгална' USING ERRCODE = '42501';
    END IF;
    IF p_shop_id IS NULL OR NOT (
        EXISTS (SELECT 1 FROM public.shops WHERE id = p_shop_id AND user_id = p_actor)
        OR EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_actor)
    ) THEN
        RAISE EXCEPTION 'Энэ төсөлд хандах эрхгүй' USING ERRCODE = '42501';
    END IF;
    IF p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2100 OR p_months IS NULL OR jsonb_typeof(p_months) <> 'array' THEN
        RAISE EXCEPTION 'Сарын мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_months) NOT BETWEEN 1 AND 12 THEN
        RAISE EXCEPTION '1–12 сарын өөрчлөлт шаардлагатай' USING ERRCODE = '22023';
    END IF;

    -- Validate all rows before casting/sorting or writing anything.
    FOR v_patch IN SELECT value FROM jsonb_array_elements(p_months)
    LOOP
        IF jsonb_typeof(v_patch) <> 'object'
            OR jsonb_typeof(v_patch->'month') IS DISTINCT FROM 'number'
            OR (v_patch->>'month')::numeric NOT BETWEEN 1 AND 12
            OR (v_patch->>'month')::numeric <> trunc((v_patch->>'month')::numeric)
            OR jsonb_typeof(v_patch->'expectedRevision') IS DISTINCT FROM 'number'
            OR (v_patch->>'expectedRevision')::numeric NOT BETWEEN 0 AND 2147483646
            OR (v_patch->>'expectedRevision')::numeric <> trunc((v_patch->>'expectedRevision')::numeric)
        THEN
            RAISE EXCEPTION 'Сар эсвэл хувилбар буруу байна' USING ERRCODE = '22023';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_patch) AS keys(key) WHERE key <> ALL (ARRAY[
            'month', 'expectedRevision', 'target_amount', 'cashflow_target_amount',
            'manual_contract_actual_amount', 'manual_cashflow_actual_amount', 'block_amounts'
        ])) OR NOT v_patch ?| (v_fields || ARRAY['block_amounts']) THEN
            RAISE EXCEPTION 'Өөрчлөх талбар буруу байна' USING ERRCODE = '22023';
        END IF;
        v_month := (v_patch->>'month')::numeric::integer;
        IF v_month = ANY(v_seen) THEN
            RAISE EXCEPTION 'Сар давхар байна' USING ERRCODE = '22023';
        END IF;
        v_seen := array_append(v_seen, v_month);
        IF v_patch ? 'block_amounts' THEN
            IF jsonb_typeof(v_patch->'block_amounts') <> 'object' OR v_patch->'block_amounts' = '{}'::jsonb THEN
                RAISE EXCEPTION 'Блокийн мэдээлэл буруу байна' USING ERRCODE = '22023';
            END IF;
            FOR v_block, v_block_patch IN SELECT key, value FROM jsonb_each(v_patch->'block_amounts')
            LOOP
                IF v_block <> ALL (ARRAY['b1', 'b2', 'parking'])
                    OR jsonb_typeof(v_block_patch) <> 'object' OR v_block_patch = '{}'::jsonb THEN
                    RAISE EXCEPTION 'Блокийн мэдээлэл буруу байна' USING ERRCODE = '22023';
                END IF;
                IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_block_patch) AS keys(key) WHERE key <> ALL (v_fields))
                    OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_block_patch) AS keys(key) WHERE v_patch ? key) THEN
                    RAISE EXCEPTION 'Блокийн талбар буруу эсвэл нийт дүнтэй давхардсан байна' USING ERRCODE = '22023';
                END IF;
            END LOOP;
        END IF;
        -- Validate every amount, including nested cells, without numeric coercion.
        FOR v_values IN
            SELECT v_patch - ARRAY['month', 'expectedRevision', 'block_amounts']
            UNION ALL SELECT value FROM jsonb_each(COALESCE(v_patch->'block_amounts', '{}'::jsonb))
        LOOP
            FOREACH v_field IN ARRAY v_fields
            LOOP
                IF v_values ? v_field AND v_values->v_field <> 'null'::jsonb THEN
                    IF jsonb_typeof(v_values->v_field) <> 'number' THEN
                        RAISE EXCEPTION 'Мөнгөн дүн буруу байна' USING ERRCODE = '22023';
                    END IF;
                    v_amount := (v_values->>v_field)::numeric;
                    IF v_amount NOT BETWEEN 0 AND 10000000000000 OR v_amount <> round(v_amount, 2) THEN
                        RAISE EXCEPTION 'Мөнгөн дүнгийн хязгаар буруу байна' USING ERRCODE = '22023';
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    -- Consistent lock order also serializes concurrent creation of an absent month.
    FOR v_patch IN SELECT value FROM jsonb_array_elements(p_months) ORDER BY (value->>'month')::numeric::integer
    LOOP
        v_month := (v_patch->>'month')::numeric::integer;
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text || ':' || p_year::text || ':' || v_month::text, 0));
        SELECT * INTO v_before FROM public.team_sales_targets
            WHERE shop_id = p_shop_id AND year = p_year AND month = v_month FOR UPDATE;
        v_before_json := CASE WHEN FOUND THEN to_jsonb(v_before) ELSE NULL END;
        IF COALESCE(v_before.revision, 0) <> (v_patch->>'expectedRevision')::numeric::integer THEN
            RAISE EXCEPTION 'Сарын мэдээлэл өөрчлөгдсөн. Шинэ мэдээллийг авч дахин оруулна уу.' USING ERRCODE = '40001';
        END IF;
        IF v_before_json IS NULL THEN
            INSERT INTO public.team_sales_targets (shop_id, year, month)
                VALUES (p_shop_id, p_year, v_month) RETURNING * INTO v_before;
        END IF;
        v_blocks := v_before.block_amounts;
        FOR v_block, v_block_patch IN SELECT key, value FROM jsonb_each(COALESCE(v_patch->'block_amounts', '{}'::jsonb))
        LOOP
            v_blocks := jsonb_set(v_blocks, ARRAY[v_block], COALESCE(v_blocks->v_block, '{}'::jsonb) || v_block_patch);
        END LOOP;
        v_values := v_patch;
        FOREACH v_field IN ARRAY v_fields
        LOOP
            IF EXISTS (SELECT 1 FROM jsonb_each(COALESCE(v_patch->'block_amounts', '{}'::jsonb)) WHERE value ? v_field) THEN
                SELECT sum((value->>v_field)::numeric) INTO v_amount FROM jsonb_each(v_blocks);
                IF v_amount > 10000000000000 THEN
                    RAISE EXCEPTION 'Сарын нийт дүн 10,000,000,000,000₮-өөс хэтэрсэн байна' USING ERRCODE = '22023';
                END IF;
                v_values := jsonb_set(v_values, ARRAY[v_field], COALESCE(to_jsonb(v_amount), 'null'::jsonb));
            ELSIF v_patch ? v_field AND EXISTS (SELECT 1 FROM jsonb_each(v_blocks) WHERE value ? v_field) THEN
                -- Old aggregate writers cannot silently disagree with or erase a saved breakdown.
                RAISE EXCEPTION 'Блокийн задаргаатай дүнг Борлуулалтын төлөвлөгөө хэсгийн блокийн нүдээр засна уу' USING ERRCODE = '22023';
            END IF;
        END LOOP;
        UPDATE public.team_sales_targets SET
            block_amounts = v_blocks,
            target_amount = CASE WHEN v_values ? 'target_amount' THEN (v_values->>'target_amount')::numeric ELSE target_amount END,
            cashflow_target_amount = CASE WHEN v_values ? 'cashflow_target_amount' THEN (v_values->>'cashflow_target_amount')::numeric ELSE cashflow_target_amount END,
            manual_contract_actual_amount = CASE WHEN v_values ? 'manual_contract_actual_amount' THEN (v_values->>'manual_contract_actual_amount')::numeric ELSE manual_contract_actual_amount END,
            manual_cashflow_actual_amount = CASE WHEN v_values ? 'manual_cashflow_actual_amount' THEN (v_values->>'manual_cashflow_actual_amount')::numeric ELSE manual_cashflow_actual_amount END,
            revision = revision + 1, updated_by = p_actor, updated_at = now()
        WHERE id = v_before.id RETURNING * INTO v_after;

        INSERT INTO public.admin_audit_log (actor_id, action, target_id, meta)
        VALUES (p_actor, 'sales.monthly.update', v_after.id::text, jsonb_build_object(
            'shop_id', p_shop_id, 'year', p_year, 'month', v_month,
            'before', v_before_json, 'after', to_jsonb(v_after), 'patch', v_patch
        ));
        v_saved := v_saved || jsonb_build_array(to_jsonb(v_after));
    END LOOP;
    RETURN jsonb_build_object('months', v_saved);
END;
$$;

REVOKE ALL ON FUNCTION public.save_team_monthly_sales(uuid, integer, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_team_monthly_sales(uuid, integer, jsonb, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
