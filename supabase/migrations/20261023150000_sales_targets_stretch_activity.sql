-- Лхагвын хурлын нэмэлт (stretch) төлөвлөгөө, багийн идэвхжлийн сарын төлөвлөгөө (эзэмшигч 2026-10-22: W8, W11)
-- ба менежерийн бүртгэлийн нэрийг бүх лавлагаатай нь нэг гүйлгээнд солих RPC (W15).
--
-- • stretch_target_amount / stretch_cashflow_target_amount — сарын НИЙТ нэмэлт төлөвлөгөө (₮), блокоор задлахгүй.
--   Үндсэн төлөвлөгөөн дээр нэмэх зөрүү биш, слайдад харагдах бүтэн дүн (жишээ нь 7,152,996,000).
-- • activity_targets — багийн сарын идэвхжлийн төлөвлөгөө {hotline, manager_line, meetings_new, meetings_repeat, chats},
--   бүхэл тоо 0–1,000,000. Байхгүй түлхүүр = оруулаагүй («—»), 0 = оруулсан утга.
-- • save_team_monthly_sales — дээрх гурван сарын талбарыг ижил хувилбар шалгалт, аудиттай хадгална.
--   Блокийн түлхүүр b1/b2/parking хэвээр; блокийн нүдэнд нэмэлт талбар орохгүй.
-- • rename_sales_manager — roster-ийн нэр ба тэр нэрийг түлхүүр болгон хадгалдаг баганыг нэг гүйлгээнд солино.
--   Нэр солих нь шинэ хариуцуулалт биш: stamp_sales_handoff, private.enforce_sales_lead_assignment (20261001131000)
--   ба update_property_timestamp нь гүйлгээний доторх `vertmonhub.manager_rename` тэмдгийг хүндэтгэнэ.
--
-- NULL = тодорхойгүй. Additive, дахин ажиллуулж болно. Browser хандахгүй: функцууд зөвхөн service_role.

ALTER TABLE public.team_sales_targets
    ADD COLUMN IF NOT EXISTS stretch_target_amount numeric(18,2),
    ADD COLUMN IF NOT EXISTS stretch_cashflow_target_amount numeric(18,2),
    ADD COLUMN IF NOT EXISTS activity_targets jsonb;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.team_sales_targets'::regclass AND conname = 'team_sales_stretch_amounts') THEN
        ALTER TABLE public.team_sales_targets ADD CONSTRAINT team_sales_stretch_amounts CHECK (
            (stretch_target_amount IS NULL OR stretch_target_amount >= 0)
            AND (stretch_cashflow_target_amount IS NULL OR stretch_cashflow_target_amount >= 0)
        );
    END IF;
    -- CASE: төрлийг шалгасны дараа л тоо болгож харьцуулна (AND-ийн дараалал баталгаагүй).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.team_sales_targets'::regclass AND conname = 'team_sales_activity_targets') THEN
        ALTER TABLE public.team_sales_targets ADD CONSTRAINT team_sales_activity_targets CHECK (
            CASE WHEN activity_targets IS NULL THEN true
                WHEN jsonb_typeof(activity_targets) <> 'object' THEN false
                ELSE (activity_targets - ARRAY['hotline', 'manager_line', 'meetings_new', 'meetings_repeat', 'chats']) = '{}'::jsonb
                    AND NOT jsonb_path_exists(activity_targets, 'strict $.* ? (@.type() != "number" || @ < 0 || @ > 1000000 || @.floor() != @)')
            END
        );
    END IF;
END;
$$;

COMMENT ON COLUMN public.team_sales_targets.stretch_target_amount IS 'Сарын нэмэлт (stretch) гэрээний төлөвлөгөөний нийт дүн (₮), блокгүй; үндсэн төлөвлөгөөн дээр нэмэх зөрүү биш. NULL = оруулаагүй';
COMMENT ON COLUMN public.team_sales_targets.stretch_cashflow_target_amount IS 'Сарын нэмэлт (stretch) мөнгөн урсгалын төлөвлөгөөний нийт дүн (₮), блокгүй. NULL = оруулаагүй';
COMMENT ON COLUMN public.team_sales_targets.activity_targets IS 'Багийн сарын идэвхжлийн төлөвлөгөө {hotline, manager_line, meetings_new, meetings_repeat, chats} (бүхэл тоо); байхгүй түлхүүр = оруулаагүй';

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
    v_count_fields constant text[] := ARRAY['contract_count_target', 'manual_contract_count_actual'];
    v_fields constant text[] := ARRAY['target_amount', 'cashflow_target_amount', 'manual_contract_actual_amount', 'manual_cashflow_actual_amount',
        'contract_count_target', 'manual_contract_count_actual'];
    -- Сарын түвшний нэмэлт талбарууд (20261023150000): блокийн нүдэнд хэзээ ч орохгүй.
    v_stretch_fields constant text[] := ARRAY['stretch_target_amount', 'stretch_cashflow_target_amount'];
    v_extra_fields constant text[] := ARRAY['stretch_target_amount', 'stretch_cashflow_target_amount', 'activity_targets'];
    v_activity_keys constant text[] := ARRAY['hotline', 'manager_line', 'meetings_new', 'meetings_repeat', 'chats'];
    v_activity_key text;
    v_activity_value jsonb;
    v_activity jsonb;
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
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_patch) AS keys(key) WHERE key <> ALL (v_fields || v_extra_fields || ARRAY['month', 'expectedRevision', 'block_amounts']))
            OR NOT v_patch ?| (v_fields || v_extra_fields || ARRAY['block_amounts']) THEN
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
        -- Validate every value, including nested cells, without numeric coercion.
        FOR v_values IN
            SELECT v_patch - ARRAY['month', 'expectedRevision', 'block_amounts']
            UNION ALL SELECT value FROM jsonb_each(COALESCE(v_patch->'block_amounts', '{}'::jsonb))
        LOOP
            FOREACH v_field IN ARRAY v_fields
            LOOP
                IF v_values ? v_field AND v_values->v_field <> 'null'::jsonb THEN
                    IF jsonb_typeof(v_values->v_field) <> 'number' THEN
                        RAISE EXCEPTION 'Мөнгөн дүн эсвэл тоо буруу байна' USING ERRCODE = '22023';
                    END IF;
                    v_amount := (v_values->>v_field)::numeric;
                    IF v_field = ANY(v_count_fields) THEN
                        IF v_amount NOT BETWEEN 0 AND 1000000 OR v_amount <> trunc(v_amount) THEN
                            RAISE EXCEPTION 'Гэрээний тоо 0–1,000,000 хооронд бүхэл тоо байна' USING ERRCODE = '22023';
                        END IF;
                    ELSIF v_amount NOT BETWEEN 0 AND 10000000000000 OR v_amount <> round(v_amount, 2) THEN
                        RAISE EXCEPTION 'Мөнгөн дүнгийн хязгаар буруу байна' USING ERRCODE = '22023';
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
        -- Нэмэлт төлөвлөгөө: сарын нийт мөнгөн дүн, үндсэн дүнтэй ижил хязгаар.
        FOREACH v_field IN ARRAY v_stretch_fields
        LOOP
            IF v_patch ? v_field AND v_patch->v_field <> 'null'::jsonb THEN
                IF jsonb_typeof(v_patch->v_field) <> 'number' THEN
                    RAISE EXCEPTION 'Нэмэлт төлөвлөгөөний дүн буруу байна' USING ERRCODE = '22023';
                END IF;
                v_amount := (v_patch->>v_field)::numeric;
                IF v_amount NOT BETWEEN 0 AND 10000000000000 OR v_amount <> round(v_amount, 2) THEN
                    RAISE EXCEPTION 'Нэмэлт төлөвлөгөөний дүнгийн хязгаар буруу байна' USING ERRCODE = '22023';
                END IF;
            END IF;
        END LOOP;
        -- Идэвхжлийн төлөвлөгөө: null = бүгдийг цэвэрлэх; объект = зөвхөн өгсөн түлхүүрүүд (null = тэр түлхүүрийг арилгах).
        IF v_patch ? 'activity_targets' AND v_patch->'activity_targets' <> 'null'::jsonb THEN
            IF jsonb_typeof(v_patch->'activity_targets') <> 'object' OR v_patch->'activity_targets' = '{}'::jsonb
                OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_patch->'activity_targets') AS keys(key) WHERE key <> ALL (v_activity_keys)) THEN
                RAISE EXCEPTION 'Идэвхжлийн төлөвлөгөөний талбар буруу байна' USING ERRCODE = '22023';
            END IF;
            FOR v_activity_key, v_activity_value IN SELECT key, value FROM jsonb_each(v_patch->'activity_targets')
            LOOP
                IF v_activity_value <> 'null'::jsonb THEN
                    IF jsonb_typeof(v_activity_value) <> 'number' THEN
                        RAISE EXCEPTION 'Идэвхжлийн төлөвлөгөө 0–1,000,000 хооронд бүхэл тоо байна' USING ERRCODE = '22023';
                    END IF;
                    v_amount := (v_activity_value #>> '{}')::numeric;
                    IF v_amount NOT BETWEEN 0 AND 1000000 OR v_amount <> trunc(v_amount) THEN
                        RAISE EXCEPTION 'Идэвхжлийн төлөвлөгөө 0–1,000,000 хооронд бүхэл тоо байна' USING ERRCODE = '22023';
                    END IF;
                END IF;
            END LOOP;
        END IF;
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
                IF v_field = ANY(v_count_fields) AND v_amount > 1000000 THEN
                    RAISE EXCEPTION 'Сарын гэрээний тоо 1,000,000-аас хэтэрсэн байна' USING ERRCODE = '22023';
                ELSIF v_amount > 10000000000000 THEN
                    RAISE EXCEPTION 'Сарын нийт дүн 10,000,000,000,000₮-өөс хэтэрсэн байна' USING ERRCODE = '22023';
                END IF;
                v_values := jsonb_set(v_values, ARRAY[v_field], COALESCE(to_jsonb(v_amount), 'null'::jsonb));
            ELSIF v_patch ? v_field AND EXISTS (SELECT 1 FROM jsonb_each(v_blocks) WHERE value ? v_field) THEN
                -- Old aggregate writers cannot silently disagree with or erase a saved breakdown.
                RAISE EXCEPTION 'Блокийн задаргаатай дүнг Борлуулалтын төлөвлөгөө хэсгийн блокийн нүдээр засна уу' USING ERRCODE = '22023';
            END IF;
        END LOOP;
        -- Идэвхжлийн түлхүүрүүдийг хадгалсан утга дээр нэгтгэнэ; бүгд арилбал NULL (тодорхойгүй).
        v_activity := v_before.activity_targets;
        IF v_patch ? 'activity_targets' THEN
            v_activity := CASE WHEN v_patch->'activity_targets' = 'null'::jsonb THEN NULL
                ELSE NULLIF((COALESCE(v_before.activity_targets, '{}'::jsonb) || jsonb_strip_nulls(v_patch->'activity_targets'))
                    - ARRAY(SELECT key FROM jsonb_each(v_patch->'activity_targets') WHERE value = 'null'::jsonb), '{}'::jsonb) END;
        END IF;
        UPDATE public.team_sales_targets SET
            block_amounts = v_blocks,
            target_amount = CASE WHEN v_values ? 'target_amount' THEN (v_values->>'target_amount')::numeric ELSE target_amount END,
            cashflow_target_amount = CASE WHEN v_values ? 'cashflow_target_amount' THEN (v_values->>'cashflow_target_amount')::numeric ELSE cashflow_target_amount END,
            manual_contract_actual_amount = CASE WHEN v_values ? 'manual_contract_actual_amount' THEN (v_values->>'manual_contract_actual_amount')::numeric ELSE manual_contract_actual_amount END,
            manual_cashflow_actual_amount = CASE WHEN v_values ? 'manual_cashflow_actual_amount' THEN (v_values->>'manual_cashflow_actual_amount')::numeric ELSE manual_cashflow_actual_amount END,
            contract_count_target = CASE WHEN v_values ? 'contract_count_target' THEN (v_values->>'contract_count_target')::numeric::integer ELSE contract_count_target END,
            manual_contract_count_actual = CASE WHEN v_values ? 'manual_contract_count_actual' THEN (v_values->>'manual_contract_count_actual')::numeric::integer ELSE manual_contract_count_actual END,
            stretch_target_amount = CASE WHEN v_patch ? 'stretch_target_amount' THEN (v_patch->>'stretch_target_amount')::numeric ELSE stretch_target_amount END,
            stretch_cashflow_target_amount = CASE WHEN v_patch ? 'stretch_cashflow_target_amount' THEN (v_patch->>'stretch_cashflow_target_amount')::numeric ELSE stretch_cashflow_target_amount END,
            activity_targets = v_activity,
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

-- Нэр солих нь шинэ хариуцуулалт биш: rename_sales_manager гүйлгээний доторх (set_config local) тэмдэгтэй үед
-- sales_handoff_at-ийг шинээр зохиохгүй (20260921120000-ийн «never invent history» дүрэм). Бусад салаа өөрчлөгдөөгүй.
CREATE OR REPLACE FUNCTION public.stamp_sales_handoff() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sales_handoff_at := CASE WHEN nullif(trim(NEW.sales_manager_name), '') IS NOT NULL THEN now() ELSE NULL END;
  ELSIF OLD.sales_handoff_at IS NOT NULL THEN
    NEW.sales_handoff_at := OLD.sales_handoff_at;
  ELSIF current_setting('vertmonhub.manager_rename', true) = 'on' THEN
    NEW.sales_handoff_at := NULL;
  ELSIF nullif(trim(NEW.sales_manager_name), '') IS NOT NULL AND
    (NEW.sales_manager_name IS DISTINCT FROM OLD.sales_manager_name OR NEW.sales_handoff_at IS NOT NULL) THEN
    NEW.sales_handoff_at := now();
  ELSE
    NEW.sales_handoff_at := NULL;
  END IF;
  RETURN NEW;
END $$;

-- 20261001131000-ийн хуваарилалтын хамгаалалт (хамгийн сүүлийн body), нэг салаа нэмсэн: rename_sales_manager-ийн
-- гүйлгээнд (тэмдэг асаалттай) байгууллага, төсөл хэвээр, хуучин нэр бүртгэлээс гарч шинэ нэр бүртгэлд орсон бол энэ нь
-- ижил хүний нэр солих — шинэ хариуцуулалт биш (stamp_sales_handoff-ийн адил). Тэгэхгүй бол идэвхгүй менежерийн, төсөлгүй
-- эсвэл харьяалалгүй болсон төслийн (/admin/history-ийн noProject) лид нэг л байхад нэр солих бүхэлдээ 23514-өөр зогсоно.
-- Бусад бүх бичилт (тэмдэгтэй ч бодит хуваарилалт, төсөл солих) хуучин дүрмээрээ шалгагдана.
CREATE OR REPLACE FUNCTION private.enforce_sales_lead_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.shop_id IS NOT DISTINCT FROM OLD.shop_id
        AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
        AND NEW.sales_manager_name IS NOT DISTINCT FROM OLD.sales_manager_name THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND pg_catalog.current_setting('vertmonhub.manager_rename', true) = 'on'
        AND NEW.shop_id IS NOT DISTINCT FROM OLD.shop_id AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
        AND nullif(btrim(OLD.sales_manager_name), '') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.sales_managers WHERE shop_id = OLD.shop_id AND name = OLD.sales_manager_name)
        AND EXISTS (SELECT 1 FROM public.sales_managers WHERE shop_id = NEW.shop_id AND name = NEW.sales_manager_name)
    THEN RETURN NEW; END IF;
    IF NEW.project_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.projects WHERE id = NEW.project_id AND shop_id = NEW.shop_id
    ) THEN RAISE EXCEPTION 'Лидийн төсөл байгууллагад харьяалагдахгүй байна' USING ERRCODE = '23514'; END IF;
    IF nullif(btrim(NEW.sales_manager_name), '') IS NULL THEN RETURN NEW; END IF;
    IF NEW.project_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.sales_manager_projects AS membership
        JOIN public.sales_managers AS manager ON manager.shop_id = membership.shop_id
            AND manager.name = membership.manager_name AND manager.is_active
        WHERE membership.shop_id = NEW.shop_id AND membership.project_id = NEW.project_id
            AND membership.manager_name = NEW.sales_manager_name
    ) THEN RAISE EXCEPTION 'Тухайн төслийн идэвхтэй борлуулалтын менежерийг сонгоно уу' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_sales_lead_assignment() FROM PUBLIC, anon, authenticated;

-- Байрны бүртгэлийн огноо (report-inventory-ийн CRM fallback, AI list_properties-ийн as_of) нь max(property_units.updated_at):
-- нэр солих нь төлөвийн шинэчлэлт биш тул тэмдэгтэй гүйлгээнд updated_at-ийг хэвээр үлдээнэ. properties-тэй хуваалцсан
-- функц (20260128210000); тэмдэггүй бол өмнөх шигээ now().
CREATE OR REPLACE FUNCTION public.update_property_timestamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND pg_catalog.current_setting('vertmonhub.manager_rename', true) = 'on' THEN
        NEW.updated_at := OLD.updated_at;
        RETURN NEW;
    END IF;
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

/*
 * Менежерийн бүртгэлийн нэрийг солино (ижил хүн, жишээ нь «Khongoroo» → «Хонгорзул.Мөнхгэрэл»). Нэг гүйлгээнд:
 * бүртгэлийн мөр + энэ төслийн (shop) тэр нэрийг түлхүүр болгон хадгалдаг багана бүр. Багана бүрийн шийдвэр:
 *   СОЛИНО (эзэмшил, хамрах хүрээ, KPI, тайлангийн түлхүүр — нэг хүн):
 *     sales_managers.name; sales_manager_projects.manager_name, sales_kpi_months.manager_name (FK ON UPDATE CASCADE);
 *     leads.sales_manager_name (applyLeadScope, claim pool); property_viewings.sales_manager_name (уулзалтын KPI);
 *     property_contracts.sales_manager (гэрээний менежер); customers.sales_manager_name (AI-ийн оноолт);
 *     service_logs.manager_name (санал гомдлын хариуцагч, хүсэлтийн KPI); daily_report_counts.manager_name (нүдний түлхүүр);
 *     daily_report_settings.config.managers[].name (баганын дараалал, товчлол); property_units.sales_manager (яг таарсан нэр
 *     л — ижил хүн, давхрын зураглал); sales_targets.sales_manager (хуучин менежерийн төлөвлөгөө, хүснэгт байвал).
 *   ХЭВЭЭР (тухайн үеийн харагдах нэр, түүх, чөлөөт текст):
 *     *_by_name тамга (lead_activities.created_by_name, daily_report_counts.updated_by_name, daily_reports.completed_by_name,
 *     daily_report_changes.changed_by_name, contract_transfers / contract_list_imports.created_by_name);
 *     weekly_updates / weekly_report_slides.author_name; daily_report_changes.manager_name (append-only түүх, service_role
 *     ч засах эрхгүй — солихоос өмнөх мөрийг сэргээх боломжгүй болно); lead_activities.meta, admin/data audit-ийн meta;
 *     service_logs.assigned_to (дэлгэцийн чөлөөт текст); erp_imports / contract_list_imports.rows (импортын snapshot);
 *     marketing_*_owner_name (маркетингийн хариуцагч, борлуулалтын менежер биш).
 * Шинэ нэр бүртгэлд байвал 23505, хуучин нэр байхгүй бол P0002. Түлхүүртэй хүснэгтэд шинэ нэрээр мөр давхцвал 23505,
 * аль нэг хүснэгтийн шалгалт (CHECK, trigger) зөвшөөрөхгүй бол тэр хүснэгтийг нэрлэсэн 23514 — аль ч тохиолдолд юу ч бичихгүй.
 * Лидийн хуваарилалтын хамгаалалт ба байрны updated_at нэр солих тэмдгийг хүндэтгэнэ (дээрх хоёр функц).
 * admin_audit_log-д хүснэгт бүрийн тоог бичнэ.
 */
CREATE OR REPLACE FUNCTION public.rename_sales_manager(
    p_shop_id uuid, p_old text, p_new text, p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    v_manager_id uuid;
    v_count integer;
    v_counts jsonb := '{}'::jsonb;
    v_step text := 'менежерийн бүртгэл'; -- алдааны мессежид: аль хүснэгт зөвшөөрөөгүй (хувьсагч rollback-д үлдэнэ)
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_actor AND role = 'super_admin') THEN
        RAISE EXCEPTION 'Менежерийн нэрийг зөвхөн super_admin солино' USING ERRCODE = '42501';
    END IF;
    IF p_shop_id IS NULL OR NOT (
        EXISTS (SELECT 1 FROM public.shops WHERE id = p_shop_id AND user_id = p_actor)
        OR EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_actor)
    ) THEN
        RAISE EXCEPTION 'Энэ төсөлд хандах эрхгүй' USING ERRCODE = '42501';
    END IF;
    IF p_old IS NULL OR p_new IS NULL OR p_new <> btrim(p_new) OR char_length(p_new) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'Менежерийн шинэ нэр 1–120 тэмдэгт, эхэнд, төгсгөлд хоосон зайгүй байна' USING ERRCODE = '22023';
    END IF;
    IF p_new = p_old THEN
        RAISE EXCEPTION 'Шинэ нэр одоогийн нэртэй ижил байна' USING ERRCODE = '22023';
    END IF;

    -- save_sales_manager_roster-тэй ижил түгжээ: төслийн бүртгэлийн зэрэгцээ хадгалалтыг дарааллуулна.
    PERFORM id FROM public.shops WHERE id = p_shop_id FOR UPDATE;
    SELECT id INTO v_manager_id FROM public.sales_managers WHERE shop_id = p_shop_id AND name = p_old FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Менежерийн бүртгэлд «%» олдсонгүй', p_old USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.sales_managers WHERE shop_id = p_shop_id AND name = p_new) THEN
        RAISE EXCEPTION 'Бүртгэлд «%» нэртэй менежер аль хэдийн байна', p_new USING ERRCODE = '23505';
    END IF;

    BEGIN
        -- Лидийн sales_handoff_at-ийг нэр солихоор шинээр тамгалахгүй (stamp_sales_handoff).
        PERFORM pg_catalog.set_config('vertmonhub.manager_rename', 'on', true);

        -- ON UPDATE CASCADE-ээр шилжих мөрүүдийг солихоос өмнө тоолно.
        SELECT count(*) INTO v_count FROM public.sales_manager_projects WHERE shop_id = p_shop_id AND manager_name = p_old;
        v_counts := v_counts || jsonb_build_object('sales_manager_projects', v_count);
        SELECT count(*) INTO v_count FROM public.sales_kpi_months WHERE shop_id = p_shop_id AND manager_name = p_old;
        v_counts := v_counts || jsonb_build_object('sales_kpi_months', v_count);

        UPDATE public.sales_managers SET name = p_new WHERE id = v_manager_id;

        v_step := 'лид';
        UPDATE public.leads SET sales_manager_name = p_new WHERE shop_id = p_shop_id AND sales_manager_name = p_old;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('leads', v_count);

        v_step := 'уулзалт';
        UPDATE public.property_viewings SET sales_manager_name = p_new WHERE shop_id = p_shop_id AND sales_manager_name = p_old;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('property_viewings', v_count);

        v_step := 'гэрээ';
        UPDATE public.property_contracts SET sales_manager = p_new WHERE shop_id = p_shop_id AND sales_manager = p_old;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('property_contracts', v_count);

        v_step := 'харилцагч';
        UPDATE public.customers SET sales_manager_name = p_new WHERE shop_id = p_shop_id AND sales_manager_name = p_old;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('customers', v_count);

        v_step := 'санал гомдол';
        UPDATE public.service_logs SET manager_name = p_new WHERE shop_id = p_shop_id AND manager_name = p_old;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('service_logs', v_count);

        v_step := 'өдрийн тайлангийн нүд';
        UPDATE public.daily_report_counts SET manager_name = p_new WHERE shop_id = p_shop_id AND manager_name = p_old;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('daily_report_counts', v_count);

        -- Баганын тохиргоо: хуучин нэрийн мөрийг байрлал, товчлолтой нь шинэ нэрээр; шинэ нэртэй хуучирсан мөр (бүртгэлгүй)
        -- байвал давхардал (strict схем загварыг хүчингүй болгоно) үүсгэхгүйн тулд хасна.
        v_step := 'өдрийн тайлангийн загвар';
        UPDATE public.daily_report_settings AS settings SET config = jsonb_set(settings.config, '{managers}', (
            SELECT COALESCE(jsonb_agg(CASE WHEN entry->>'name' = p_old THEN jsonb_set(entry, '{name}', to_jsonb(p_new)) ELSE entry END
                ORDER BY ord) FILTER (WHERE entry->>'name' IS DISTINCT FROM p_new), '[]'::jsonb)
            FROM jsonb_array_elements(settings.config->'managers') WITH ORDINALITY AS managers(entry, ord)
        ))
        WHERE settings.shop_id = p_shop_id AND jsonb_typeof(settings.config->'managers') = 'array'
            AND jsonb_path_exists(settings.config, '$.managers[*] ? (@.name == $old)', jsonb_build_object('old', p_old));
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('daily_report_settings', v_count);

        v_step := 'байр';
        UPDATE public.property_units SET sales_manager = p_new WHERE shop_id = p_shop_id AND sales_manager = p_old;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('property_units', v_count);

        -- 20260701120000 зарим орчинд (production) үүсээгүй.
        IF to_regclass('public.sales_targets') IS NOT NULL THEN
            v_step := 'хуучин төлөвлөгөө';
            UPDATE public.sales_targets SET sales_manager = p_new WHERE shop_id = p_shop_id AND sales_manager = p_old;
            GET DIAGNOSTICS v_count = ROW_COUNT;
            v_counts := v_counts || jsonb_build_object('sales_targets', v_count);
        END IF;

        PERFORM pg_catalog.set_config('vertmonhub.manager_rename', '', true);
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'Шинэ нэрээр бүртгэгдсэн өгөгдөл (өдрийн тайлан, KPI эсвэл төлөвлөгөө) давхцаж байна. Юу ч өөрчлөгдсөнгүй.'
                USING ERRCODE = '23505';
        WHEN check_violation THEN
            RAISE EXCEPTION 'Нэр солих боломжгүй: «%» бүртгэлийн шалгалт шинэ нэрийг зөвшөөрсөнгүй. Юу ч өөрчлөгдсөнгүй.', v_step
                USING ERRCODE = '23514', DETAIL = SQLERRM;
    END;

    INSERT INTO public.admin_audit_log (actor_id, action, target_id, meta)
    VALUES (p_actor, 'sales.manager.rename', v_manager_id::text, jsonb_build_object(
        'shop_id', p_shop_id, 'old_name', p_old, 'new_name', p_new, 'counts', v_counts
    ));
    RETURN jsonb_build_object('old_name', p_old, 'new_name', p_new, 'counts', v_counts);
END;
$$;

REVOKE ALL ON FUNCTION public.rename_sales_manager(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_sales_manager(uuid, text, text, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
