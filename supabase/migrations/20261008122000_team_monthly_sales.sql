-- Project monthly contract/incoming-money plans and manually confirmed actuals.
-- Existing contract targets stay unchanged. NULL is unknown; zero is an entered value.
-- Monetary edits, optimistic revision checks and the audit entry share one transaction.

ALTER TABLE public.team_sales_targets
    ALTER COLUMN target_amount DROP NOT NULL,
    ALTER COLUMN target_amount DROP DEFAULT,
    ADD COLUMN IF NOT EXISTS cashflow_target_amount numeric(18, 2),
    ADD COLUMN IF NOT EXISTS manual_contract_actual_amount numeric(18, 2),
    ADD COLUMN IF NOT EXISTS manual_cashflow_actual_amount numeric(18, 2),
    ADD COLUMN IF NOT EXISTS updated_by uuid,
    ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.team_sales_targets'::regclass AND conname = 'team_monthly_sales_values') THEN
        ALTER TABLE public.team_sales_targets ADD CONSTRAINT team_monthly_sales_values CHECK (
            year BETWEEN 2000 AND 2100 AND revision >= 0
            AND (target_amount IS NULL OR target_amount BETWEEN 0 AND 10000000000000)
            AND (cashflow_target_amount IS NULL OR cashflow_target_amount BETWEEN 0 AND 10000000000000)
            AND (manual_contract_actual_amount IS NULL OR manual_contract_actual_amount BETWEEN 0 AND 10000000000000)
            AND (manual_cashflow_actual_amount IS NULL OR manual_cashflow_actual_amount BETWEEN 0 AND 10000000000000)
        ) NOT VALID;
        -- Existing values are preserved; invalid legacy rows are flagged on future edits.
    END IF;
END;
$$;

COMMENT ON COLUMN public.team_sales_targets.target_amount IS 'Сарын гэрээний төлөвлөгөө (₮); NULL = оруулаагүй';
COMMENT ON COLUMN public.team_sales_targets.cashflow_target_amount IS 'Тухайн сард орсон мөнгөний төлөвлөгөө (₮), цэвэр урсгал биш';
COMMENT ON COLUMN public.team_sales_targets.manual_contract_actual_amount IS 'Гараар баталгаажуулсан сарын гэрээний гүйцэтгэл (₮), CRM/ERP дүнтэй нэмж нийлбэрлэхгүй';
COMMENT ON COLUMN public.team_sales_targets.manual_cashflow_actual_amount IS 'Гараар баталгаажуулсан тухайн сарын орсон мөнгө (₮), CRM/ERP дүнтэй нэмж нийлбэрлэхгүй';

ALTER TABLE public.team_sales_targets ENABLE ROW LEVEL SECURITY;
-- The new cash actuals require API-level finance checks. Direct browser reads
-- must not inherit the old dashboard grant for the contract target column.
REVOKE ALL ON TABLE public.team_sales_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.team_sales_targets TO service_role;

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
            'manual_contract_actual_amount', 'manual_cashflow_actual_amount'
        ])) OR NOT v_patch ?| ARRAY['target_amount', 'cashflow_target_amount', 'manual_contract_actual_amount', 'manual_cashflow_actual_amount'] THEN
            RAISE EXCEPTION 'Өөрчлөх талбар буруу байна' USING ERRCODE = '22023';
        END IF;
        v_month := (v_patch->>'month')::numeric::integer;
        IF v_month = ANY(v_seen) THEN
            RAISE EXCEPTION 'Сар давхар байна' USING ERRCODE = '22023';
        END IF;
        v_seen := array_append(v_seen, v_month);
        FOREACH v_field IN ARRAY ARRAY['target_amount', 'cashflow_target_amount', 'manual_contract_actual_amount', 'manual_cashflow_actual_amount']
        LOOP
            IF v_patch ? v_field AND v_patch->v_field <> 'null'::jsonb THEN
                IF jsonb_typeof(v_patch->v_field) <> 'number' THEN
                    RAISE EXCEPTION 'Мөнгөн дүн буруу байна' USING ERRCODE = '22023';
                END IF;
                v_amount := (v_patch->>v_field)::numeric;
                IF v_amount NOT BETWEEN 0 AND 10000000000000 OR v_amount <> round(v_amount, 2) THEN
                    RAISE EXCEPTION 'Мөнгөн дүнгийн хязгаар буруу байна' USING ERRCODE = '22023';
                END IF;
            END IF;
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
        UPDATE public.team_sales_targets SET
            target_amount = CASE WHEN v_patch ? 'target_amount' THEN (v_patch->>'target_amount')::numeric ELSE target_amount END,
            cashflow_target_amount = CASE WHEN v_patch ? 'cashflow_target_amount' THEN (v_patch->>'cashflow_target_amount')::numeric ELSE cashflow_target_amount END,
            manual_contract_actual_amount = CASE WHEN v_patch ? 'manual_contract_actual_amount' THEN (v_patch->>'manual_contract_actual_amount')::numeric ELSE manual_contract_actual_amount END,
            manual_cashflow_actual_amount = CASE WHEN v_patch ? 'manual_cashflow_actual_amount' THEN (v_patch->>'manual_cashflow_actual_amount')::numeric ELSE manual_cashflow_actual_amount END,
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
