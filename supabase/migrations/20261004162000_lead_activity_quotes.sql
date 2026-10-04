-- ============================================================
-- Лидийн «Үнийн санал» (quote) — менежерүүдийн Time-line (2026-10-04 уулзалт, №5)
--
-- • lead_activities.type-д 'quote' нэмнэ: менежер бүр харилцагчид хэлсэн үнийг
--   түүхэнд {amount, unit_label?}-аар хадгална. Гэрээний дүн, орлого, KPI, зорилт БИШ —
--   тайлан, борлуулалтын нэгтгэлд хэзээ ч орохгүй (зөвхөн зөрүү илрүүлэхэд).
-- • Санал нь холбоо барилт гэж тооцогдож leads.last_contact_at-г шинэчилнэ; статусыг өөрчлөхгүй.
-- • record_scoped_sales_lead_contact-ийг ИЖИЛ гарын үсэг, түгжээ, эзэмшигчийн шалгалттайгаар
--   дахин тодорхойлж 'quote'-г зөвшөөрнө (хязгаарлагдсан менежер зөвхөн өөрийн лидэд).
-- Additive, idempotent: дахин ажиллуулахад өөрчлөлтгүй. Өгөгдөл шилжүүлэхгүй.
-- ============================================================

-- 1) Төрлийн CHECK: inline CHECK-ийн нэр (lead_activities_type_check) орчноос хамаарч өөр байж
--    болзошгүй тул 'note'-той, 'quote'-гүй CHECK-ийг нэрээс үл хамааран хайж солино.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.lead_activities'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%''note''%'
          AND pg_get_constraintdef(oid) NOT LIKE '%''quote''%'
    LOOP
        EXECUTE format('ALTER TABLE public.lead_activities DROP CONSTRAINT %I', r.conname);
    END LOOP;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.lead_activities'::regclass AND conname = 'lead_activities_type_check'
    ) THEN
        ALTER TABLE public.lead_activities ADD CONSTRAINT lead_activities_type_check
            CHECK (type IN ('note', 'call', 'status', 'manager', 'meeting', 'contract', 'system', 'quote'));
    END IF;
END $$;

-- 2) Үнийн саналын meta: amount — 0-ээс их, 1e13 хүртэлх бүхэл ₮; unit_label — 1..60 тэмдэгт (заавал биш).
--    CASE нь буруу төрлийн утгыг numeric болгох гэж алдаа өгөхөөс сэргийлнэ (CHECK зөрчил болно).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.lead_activities'::regclass AND conname = 'lead_activities_quote_meta_check'
    ) THEN
        ALTER TABLE public.lead_activities ADD CONSTRAINT lead_activities_quote_meta_check CHECK (
            type <> 'quote' OR (
                CASE WHEN jsonb_typeof(meta->'amount') = 'number'
                    THEN (meta->>'amount')::numeric > 0
                        AND (meta->>'amount')::numeric <= 10000000000000
                        AND (meta->>'amount')::numeric = trunc((meta->>'amount')::numeric)
                    ELSE false END
                AND CASE WHEN NOT meta ? 'unit_label' THEN true
                    WHEN jsonb_typeof(meta->'unit_label') = 'string'
                        THEN char_length(btrim(meta->>'unit_label')) BETWEEN 1 AND 60
                    ELSE false END
            )
        );
    END IF;
END $$;

COMMENT ON TABLE public.lead_activities IS
    'Лидийн үйл ажиллагааны түүх (v2 timeline): note/call/status/manager/meeting/contract/system/quote. quote = менежерийн хэлсэн үнэ (орлого биш)';

-- 3) Хязгаарлагдсан менежерийн холбоо барилтын бүртгэл — 20261001134000-ийн хуулбар, ялгаа нь:
--    type 'quote' + p_input.quote {amount, unit_label?}; 'quote' түлхүүр бусад төрөлд хориотой;
--    last_contact_at нь call ба quote-д шинэчлэгдэнэ; meta-д amount, unit_label нэмэгдэнэ.
CREATE OR REPLACE FUNCTION public.record_scoped_sales_lead_contact(
    p_shop_id uuid,
    p_lead_id uuid,
    p_user_id uuid,
    p_manager_name text,
    p_project_ids uuid[],
    p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    v_lead public.leads%ROWTYPE;
    v_activity public.lead_activities%ROWTYPE;
    v_now timestamptz := now();
    v_next_followup_at timestamptz;
    v_type text;
    v_amount numeric;
    v_unit_label text;
    v_meta jsonb := '{}'::jsonb;
BEGIN
    IF p_shop_id IS NULL OR p_lead_id IS NULL OR p_user_id IS NULL
        OR p_manager_name IS NULL OR coalesce(cardinality(p_project_ids), 0) = 0 THEN
        RAISE EXCEPTION 'Лид олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
        OR jsonb_typeof(p_input->'type') IS DISTINCT FROM 'string'
        OR p_input->>'type' NOT IN ('note','call','quote')
        OR jsonb_typeof(p_input->'content') IS DISTINCT FROM 'string'
        OR length(btrim(p_input->>'content')) NOT BETWEEN 1 AND 4000
        OR (p_input ? 'next_followup_at' AND jsonb_typeof(p_input->'next_followup_at') NOT IN ('string','null'))
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS fields(key)
            WHERE key NOT IN ('type','content','next_followup_at','quote')) THEN
        RAISE EXCEPTION 'Дуудлага/тэмдэглэлийн мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    v_type := p_input->>'type';
    IF v_type = 'quote' THEN
        IF jsonb_typeof(p_input->'quote') IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Үнийн саналын мэдээлэл буруу байна' USING ERRCODE = '22023';
        END IF;
        IF jsonb_typeof(p_input->'quote'->'amount') IS DISTINCT FROM 'number'
            OR (p_input->'quote' ? 'unit_label' AND jsonb_typeof(p_input->'quote'->'unit_label') NOT IN ('string','null'))
            OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_input->'quote') AS fields(key)
                WHERE key NOT IN ('amount','unit_label')) THEN
            RAISE EXCEPTION 'Үнийн саналын мэдээлэл буруу байна' USING ERRCODE = '22023';
        END IF;
        v_amount := (p_input->'quote'->>'amount')::numeric;
        v_unit_label := nullif(btrim(p_input->'quote'->>'unit_label'), '');
        IF v_amount <= 0 OR v_amount > 10000000000000 OR v_amount <> trunc(v_amount)
            OR char_length(coalesce(v_unit_label, '')) > 60 THEN
            RAISE EXCEPTION 'Үнийн саналын дүн буруу байна' USING ERRCODE = '22023';
        END IF;
    ELSIF p_input ? 'quote' THEN
        RAISE EXCEPTION 'Дуудлага/тэмдэглэлийн мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    v_next_followup_at := (p_input->>'next_followup_at')::timestamptz;
    IF v_next_followup_at IS NOT NULL AND NOT isfinite(v_next_followup_at) THEN
        RAISE EXCEPTION 'Дараагийн холбооны огноо буруу байна' USING ERRCODE = '22023';
    END IF;

    -- Хуваарилалт түрүүлсэн бол шинэ төсөл/эзэмшигчээр нь шалгаж, хуучин менежерийн бичилтийг хаана.
    SELECT * INTO v_lead FROM public.leads
    WHERE id = p_lead_id AND shop_id = p_shop_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND OR NOT coalesce(v_lead.project_id = ANY(p_project_ids),false)
        OR v_lead.sales_manager_name IS DISTINCT FROM p_manager_name THEN
        RAISE EXCEPTION 'Лид олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    IF (SELECT count(*) FROM public.sales_managers WHERE shop_id = p_shop_id AND user_id = p_user_id) <> 1 THEN
        RAISE EXCEPTION 'Лид олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    PERFORM name FROM public.sales_managers
    WHERE shop_id = p_shop_id AND name = p_manager_name AND user_id = p_user_id AND is_active
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Лид олдсонгүй' USING ERRCODE = 'P0002'; END IF;
    PERFORM project_id FROM public.sales_manager_projects
    WHERE shop_id = p_shop_id AND manager_name = p_manager_name AND project_id = v_lead.project_id
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Лид олдсонгүй' USING ERRCODE = 'P0002'; END IF;

    IF v_type IN ('call','quote') OR p_input ? 'next_followup_at' THEN
        UPDATE public.leads SET updated_at = v_now,
            last_contact_at = CASE WHEN v_type IN ('call','quote') THEN v_now ELSE last_contact_at END,
            next_followup_at = CASE WHEN p_input ? 'next_followup_at' THEN v_next_followup_at ELSE next_followup_at END
        WHERE id = p_lead_id AND shop_id = p_shop_id;
    END IF;
    IF p_input ? 'next_followup_at' THEN
        v_meta := jsonb_build_object('next_followup_at', p_input->'next_followup_at');
    END IF;
    IF v_type = 'quote' THEN
        v_meta := v_meta || jsonb_build_object('amount', v_amount::bigint)
            || CASE WHEN v_unit_label IS NOT NULL THEN jsonb_build_object('unit_label', v_unit_label) ELSE '{}'::jsonb END;
    END IF;
    INSERT INTO public.lead_activities(shop_id,lead_id,type,content,meta,created_by,created_by_name)
    VALUES (p_shop_id,p_lead_id,v_type,p_input->>'content',v_meta,p_user_id,p_manager_name)
    RETURNING * INTO v_activity;
    RETURN jsonb_build_object('id',v_activity.id,'lead_id',v_activity.lead_id,'type',v_activity.type,
        'content',v_activity.content,'meta',v_activity.meta,'created_by',v_activity.created_by,
        'created_by_name',v_activity.created_by_name,'created_at',v_activity.created_at);
END;
$$;

REVOKE ALL ON FUNCTION public.record_scoped_sales_lead_contact(uuid,uuid,uuid,text,uuid[],jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_scoped_sales_lead_contact(uuid,uuid,uuid,text,uuid[],jsonb) TO service_role;
