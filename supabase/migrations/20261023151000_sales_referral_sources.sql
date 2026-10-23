-- «Сэжим (хаанаас ирсэн)» — уулзалт, гэрээнд сонгох төслийн жагсаалт (эзэмшигчийн шийдвэр W12, 2026-10-22).
--
-- • sales_referral_sources — төсөл (= shop) бүрийн жагсаалт (Facebook, Ойрхон амьдардаг, Мандала Гарден ОС …).
--   Ашиглагдсан сонголтыг устгахгүй, архивлана (archived_at); архивласан нь өмнө оноосон мөрөнд харагдсаар.
--   Анхны жагсаалтыг энд seed хийхгүй (өгөгдлийн өөрчлөлт) — Тохиргооны «Санал болгосон жагсаалт нэмэх» товч
--   (lib/sales/referral-sources-store.ts) төсөл бүрт байхгүйг нь нэмнэ.
-- • property_viewings.referral_source_id / property_contracts.referral_source_id — composite FK
--   (shop_id, referral_source_id) нь өөр төслийн сонголтод холбохыг DB түвшинд хориглоно (leads.category_id-ийн
--   загвар). NULL = бүртгээгүй (хуучин мөр хэвээр). Чөлөөт «Тэмдэглэл» (agent_notes) тусдаа хэвээр.
-- • create_scoped_sales_viewing / update_scoped_sales_viewing (20261008121000) ба record_daily_report_meeting
--   (20261019120000) — оролтын JSON-д referral_source_id хүлээн авч, ижил төсөл + архивлаагүйг шалгаад хадгална.
--   Бусад бүх дүрэм өмнөх хувилбартай яг ижил.
--
-- Эрх (модуль, хамрах хүрээ, шинэ харилцагчийн уулзалтад заавал эсэх)-ийг API шалгана. Additive, дахин ажиллуулж
-- болно. Browser шууд хандахгүй: зөвхөн service_role.

CREATE TABLE IF NOT EXISTS public.sales_referral_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
    -- NULL = идэвхтэй; утгатай = архивласан (шинэ мөрөнд сонгогдохгүй).
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- auth.users FK-гүй (lead_categories-ийн адил)
    created_by uuid,
    CONSTRAINT sales_referral_sources_shop_id_key UNIQUE (shop_id, id)
);

-- Нэрийн давхардлын түлхүүр: том/жижиг үсэг, давхар зай ялгахгүй. lower() нь өгөгдлийн сангийн locale-оос
-- хамаарч кирилл үсгийг жижигрүүлэхгүй байж болох тул translate()-аар шууд хувиргана (lead_category_name_key-тэй ижил).
CREATE OR REPLACE FUNCTION public.referral_source_name_key(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
    SELECT lower(translate(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'),
        'АБВГДЕЁЖЗИЙКЛМНОӨПРСТУҮФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмноөпрстуүфхцчшщъыьэюя'));
$$;
REVOKE ALL ON FUNCTION public.referral_source_name_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_source_name_key(text) TO service_role;

-- Идэвхтэй сонголтын нэр төсөлд давтагдахгүй (архивласан ижил нэрийг дахин нэмж болно).
CREATE UNIQUE INDEX IF NOT EXISTS sales_referral_sources_shop_name_key
    ON public.sales_referral_sources (shop_id, public.referral_source_name_key(name))
    WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS sales_referral_sources_shop_order_idx
    ON public.sales_referral_sources (shop_id, sort_order);

COMMENT ON TABLE public.sales_referral_sources IS
    '«Сэжим (хаанаас ирсэн)» — төсөл/shop бүрийн сонголт. Уулзалт (property_viewings) ба гэрээ (property_contracts)-нд referral_source_id-аар холбогдоно; ашиглагдсаныг архивлана.';

ALTER TABLE public.sales_referral_sources ENABLE ROW LEVEL SECURITY;
-- Устгахгүй (архивлана): service_role-д DELETE олгохгүй. Shop устгахад FK cascade-аар цэвэрлэгдэнэ.
REVOKE ALL ON TABLE public.sales_referral_sources FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sales_referral_sources TO service_role;

-- Уулзалт ба гэрээний «Сэжим». MATCH SIMPLE: NULL = бүртгээгүй (шалгахгүй). NO ACTION: ашиглагдсан сонголтыг
-- устгах боломжгүй. Анхаар: мөрийг өөр shop руу шилжүүлбэл эхлээд referral_source_id-г NULL болгоно.
ALTER TABLE public.property_viewings ADD COLUMN IF NOT EXISTS referral_source_id uuid;
ALTER TABLE public.property_contracts ADD COLUMN IF NOT EXISTS referral_source_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'property_viewings_referral_same_shop_fkey' AND conrelid = 'public.property_viewings'::regclass
    ) THEN
        ALTER TABLE public.property_viewings ADD CONSTRAINT property_viewings_referral_same_shop_fkey
            FOREIGN KEY (shop_id, referral_source_id) REFERENCES public.sales_referral_sources (shop_id, id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'property_contracts_referral_same_shop_fkey' AND conrelid = 'public.property_contracts'::regclass
    ) THEN
        ALTER TABLE public.property_contracts ADD CONSTRAINT property_contracts_referral_same_shop_fkey
            FOREIGN KEY (shop_id, referral_source_id) REFERENCES public.sales_referral_sources (shop_id, id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_property_viewings_shop_referral
    ON public.property_viewings (shop_id, referral_source_id) WHERE referral_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_contracts_shop_referral
    ON public.property_contracts (shop_id, referral_source_id) WHERE referral_source_id IS NOT NULL;

COMMENT ON COLUMN public.property_viewings.referral_source_id IS
    '«Сэжим (хаанаас ирсэн)» (sales_referral_sources; ижил shop — composite FK). NULL = бүртгээгүй. Чөлөөт тэмдэглэл agent_notes-д.';
COMMENT ON COLUMN public.property_contracts.referral_source_id IS
    '«Сэжим (хаанаас ирсэн)» (sales_referral_sources; ижил shop — composite FK). NULL = бүртгээгүй. PATCH allow-list-ээр л бичигдэнэ.';

-- Төслийн менежерийн уулзалт үүсгэх үйлдэл лидийн одоогийн эзэмшигчийг дахин шалгана.
-- Уулзалт, лидийн төлөв, үйл ажиллагааны түүх нэг гүйлгээнд хадгалагдана. «Сэжим»-ийг шалгаж хадгална.
CREATE OR REPLACE FUNCTION public.create_scoped_sales_viewing(
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
    v_viewing public.property_viewings%ROWTYPE;
    v_now timestamptz := now();
    v_scheduled_at timestamptz;
    v_property_id uuid;
    v_property_name text;
    v_walk_in boolean;
    v_interest_level integer;
    v_meeting_type text;
    v_referral_source_id uuid;
BEGIN
    IF p_shop_id IS NULL OR p_lead_id IS NULL OR (p_project_ids IS NOT NULL AND (p_user_id IS NULL
        OR p_manager_name IS NULL OR coalesce(cardinality(p_project_ids),0)=0)) THEN
        RAISE EXCEPTION 'Лид олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
        OR jsonb_typeof(p_input->'walk_in') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(p_input->'project_id') IS DISTINCT FROM 'string'
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS fields(key)
            WHERE key NOT IN ('project_id','property_id','scheduled_at','meeting_type','agent_notes','walk_in','interest_level','customer_feedback','interests','referral_source_id'))
        OR EXISTS (SELECT 1 FROM jsonb_each(p_input) AS fields(key,value)
            WHERE (key IN ('agent_notes','customer_feedback') AND
                (jsonb_typeof(value) NOT IN ('string','null') OR length(value #>> '{}') > 4000))
            OR (key IN ('property_id','scheduled_at','referral_source_id') AND jsonb_typeof(value) NOT IN ('string','null'))
            OR (key = 'interest_level' AND jsonb_typeof(value) NOT IN ('number','null'))) THEN
        RAISE EXCEPTION 'Уулзалтын мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    v_walk_in := (p_input->>'walk_in')::boolean;
    v_scheduled_at := CASE WHEN v_walk_in THEN v_now ELSE (p_input->>'scheduled_at')::timestamptz END;
    v_property_id := (p_input->>'property_id')::uuid;
    v_interest_level := (p_input->>'interest_level')::integer;
    v_meeting_type := coalesce(p_input->>'meeting_type','new_customer');
    IF v_scheduled_at IS NULL OR NOT isfinite(v_scheduled_at)
        OR v_meeting_type NOT IN ('new_customer','repeat_customer','existing_buyer')
        OR (v_interest_level IS NOT NULL AND v_interest_level NOT BETWEEN 1 AND 5) THEN
        RAISE EXCEPTION 'Уулзалтын огноо, төрөл, сонирхлын түвшин буруу байна' USING ERRCODE = '22023';
    END IF;

    -- Хуваарилалт түрүүлж өөрчлөгдсөн бол шинэ эзэмшигч/төслөөр нь шалгана.
    SELECT * INTO v_lead FROM public.leads
    WHERE id = p_lead_id AND shop_id = p_shop_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND OR v_lead.project_id IS DISTINCT FROM (p_input->>'project_id')::uuid
        OR (p_project_ids IS NOT NULL AND (NOT coalesce(v_lead.project_id = ANY(p_project_ids),false)
        OR v_lead.sales_manager_name IS DISTINCT FROM p_manager_name)) THEN
        RAISE EXCEPTION 'Лид олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    IF p_project_ids IS NOT NULL THEN
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
    END IF;
    PERFORM public.validate_viewing_interests(p_shop_id,v_lead.project_id,coalesce(p_input->'interests','[]'::jsonb));
    IF v_property_id IS NOT NULL THEN
        SELECT name INTO v_property_name FROM public.properties
        WHERE id = v_property_id AND shop_id = p_shop_id AND project_id = v_lead.project_id AND deleted_at IS NULL
        FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Байр олдсонгүй' USING ERRCODE = 'P0002'; END IF;
    END IF;
    -- «Сэжим (хаанаас ирсэн)»: энэ төслийн идэвхтэй (архивлаагүй) сонголт.
    v_referral_source_id := (p_input->>'referral_source_id')::uuid;
    IF v_referral_source_id IS NOT NULL THEN
        PERFORM id FROM public.sales_referral_sources
        WHERE id = v_referral_source_id AND shop_id = p_shop_id AND archived_at IS NULL
        FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Сэжим олдсонгүй эсвэл архивлагдсан' USING ERRCODE = '22023'; END IF;
    END IF;

    INSERT INTO public.property_viewings(shop_id,lead_id,property_id,scheduled_at,status,meeting_type,
        agent_notes,sales_manager_name,completed_at,interest_level,customer_feedback,interests,referral_source_id)
    VALUES (p_shop_id,p_lead_id,v_property_id,v_scheduled_at,
        CASE WHEN v_walk_in THEN 'completed' ELSE 'scheduled' END,v_meeting_type,p_input->>'agent_notes',coalesce(v_lead.sales_manager_name,p_manager_name),
        CASE WHEN v_walk_in THEN v_now ELSE NULL END,
        CASE WHEN v_walk_in THEN v_interest_level ELSE NULL END,
        CASE WHEN v_walk_in THEN p_input->>'customer_feedback' ELSE NULL END,coalesce(p_input->'interests','[]'::jsonb),v_referral_source_id)
    RETURNING * INTO v_viewing;

    UPDATE public.leads SET updated_at = v_now,
        last_contact_at = CASE WHEN v_walk_in THEN v_now ELSE last_contact_at END,
        viewing_scheduled_at = CASE WHEN NOT v_walk_in THEN v_scheduled_at ELSE viewing_scheduled_at END,
        status = CASE WHEN v_walk_in AND status = 'new' THEN 'contacted'
            WHEN NOT v_walk_in AND status IN ('new','contacted') THEN 'viewing_scheduled' ELSE status END
    WHERE id = p_lead_id AND shop_id = p_shop_id;
    INSERT INTO public.lead_activities(shop_id,lead_id,type,content,meta,created_by,created_by_name)
    VALUES (p_shop_id,p_lead_id,'meeting',
        CASE WHEN v_walk_in THEN 'Ирсэн уулзалт бүртгэв' ELSE 'Уулзалт товлов' END
            || CASE WHEN v_property_name IS NOT NULL THEN ' · ' || v_property_name ELSE '' END,
        jsonb_build_object('viewing_id',v_viewing.id,'scheduled_at',v_scheduled_at,'walk_in',v_walk_in,'interests',v_viewing.interests),
        p_user_id,p_manager_name);
    RETURN jsonb_build_object('id',v_viewing.id,'status',v_viewing.status,'scheduled_at',v_viewing.scheduled_at);
END;
$$;

REVOKE ALL ON FUNCTION public.create_scoped_sales_viewing(uuid,uuid,uuid,text,uuid[],jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_scoped_sales_viewing(uuid,uuid,uuid,text,uuid[],jsonb) TO service_role;


-- Хариуцагч/төсөл солигдсон лидийн уулзалтыг хуучин менежер өөрчилж болохгүй.
-- Лид, уулзалт, үйл ажиллагааны түүх нэг гүйлгээнд хадгалагдана.
CREATE OR REPLACE FUNCTION public.update_scoped_sales_viewing(
    p_shop_id uuid,
    p_viewing_id uuid,
    p_user_id uuid,
    p_manager_name text,
    p_project_ids uuid[],
    p_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    v_lead_id uuid;
    v_lead public.leads%ROWTYPE;
    v_viewing public.property_viewings%ROWTYPE;
    v_next public.property_viewings%ROWTYPE;
    v_now timestamptz := now();
    v_content text;
BEGIN
    IF p_shop_id IS NULL OR p_viewing_id IS NULL OR (p_project_ids IS NOT NULL AND (p_user_id IS NULL
        OR p_manager_name IS NULL OR coalesce(cardinality(p_project_ids),0)=0)) THEN
        RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) AS fields(key)
            WHERE key NOT IN ('status', 'scheduled_at', 'agent_notes', 'customer_feedback', 'interest_level', 'next_followup_at', 'deleted_at', 'property_id', 'meeting_type', 'interests', 'referral_source_id')) THEN
        RAISE EXCEPTION 'Уулзалтын өөрчлөлт буруу байна' USING ERRCODE = '22023';
    END IF;
    IF (p_patch ? 'status' AND (jsonb_typeof(p_patch->'status') <> 'string'
        OR p_patch->>'status' NOT IN ('scheduled', 'completed', 'cancelled', 'no_show')))
        OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) AS fields(key,value)
            WHERE (key IN ('agent_notes', 'customer_feedback') AND
                (jsonb_typeof(value) NOT IN ('string', 'null') OR length(value #>> '{}') > 4000))
            OR (key IN ('scheduled_at', 'deleted_at') AND jsonb_typeof(value) <> 'string')
            OR (key = 'next_followup_at' AND jsonb_typeof(value) NOT IN ('string', 'null'))
            OR (key IN ('property_id','referral_source_id') AND jsonb_typeof(value) NOT IN ('string','null'))
            OR (key = 'meeting_type' AND (jsonb_typeof(value) <> 'string' OR value #>> '{}' NOT IN ('new_customer','repeat_customer','existing_buyer')))
            OR (key = 'interest_level' AND jsonb_typeof(value) NOT IN ('number', 'null'))) THEN
        RAISE EXCEPTION 'Уулзалтын өөрчлөлт буруу байна' USING ERRCODE = '22023';
    END IF;

    SELECT lead_id INTO v_lead_id FROM public.property_viewings
    WHERE id = p_viewing_id AND shop_id = p_shop_id AND deleted_at IS NULL;
    IF NOT FOUND OR (p_project_ids IS NOT NULL AND v_lead_id IS NULL) THEN
        RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002';
    END IF;

    -- Лидийг эхэлж түгжинэ. Зэрэгцээ хуваарилалт түрүүлсэн бол шинэ эзэмшигчээр шалгана.
    IF v_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads
    WHERE id = v_lead_id AND shop_id = p_shop_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND OR (p_project_ids IS NOT NULL AND (v_lead.project_id IS NULL OR NOT coalesce(v_lead.project_id = ANY(p_project_ids), false)
        OR v_lead.sales_manager_name IS DISTINCT FROM p_manager_name)) THEN
        RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    END IF;
    IF p_project_ids IS NOT NULL THEN
    IF (SELECT count(*) FROM public.sales_managers WHERE shop_id = p_shop_id AND user_id = p_user_id) <> 1 THEN
        RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    PERFORM name FROM public.sales_managers
    WHERE shop_id = p_shop_id AND name = p_manager_name AND user_id = p_user_id AND is_active
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002'; END IF;
    PERFORM project_id FROM public.sales_manager_projects
    WHERE shop_id = p_shop_id AND manager_name = p_manager_name AND project_id = v_lead.project_id
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002'; END IF;

    END IF;

    -- Шалгалтын хооронд уулзалтын lead_id солигдсон бол бичихгүй.
    SELECT * INTO v_viewing FROM public.property_viewings
    WHERE id = p_viewing_id AND shop_id = p_shop_id AND lead_id IS NOT DISTINCT FROM v_lead_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002'; END IF;
    v_next := jsonb_populate_record(v_viewing, p_patch - 'next_followup_at');
    IF v_next.scheduled_at IS NULL OR NOT isfinite(v_next.scheduled_at)
        OR (v_next.deleted_at IS NOT NULL AND NOT isfinite(v_next.deleted_at))
        OR (p_patch->>'next_followup_at' IS NOT NULL AND NOT isfinite((p_patch->>'next_followup_at')::timestamptz))
        OR (v_next.interest_level IS NOT NULL AND v_next.interest_level NOT BETWEEN 1 AND 5) THEN
        RAISE EXCEPTION 'Уулзалтын огноо эсвэл сонирхлын түвшин буруу байна' USING ERRCODE = '22023';
    END IF;
    IF p_patch ? 'interests' THEN
        -- Existing snapshots survive later inventory/price changes. Recheck only newly selected alternatives.
        PERFORM public.validate_viewing_interests(p_shop_id,v_lead.project_id,coalesce((
            SELECT jsonb_agg(item) FROM jsonb_array_elements(v_next.interests) item
            WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_viewing.interests) saved
                WHERE item - 'quote' - 'quote_unavailable_reason' = saved - 'quote' - 'quote_unavailable_reason')
        ),'[]'::jsonb));
    END IF;
    IF p_patch ? 'property_id' AND v_next.property_id IS NOT NULL THEN
        PERFORM id FROM public.properties WHERE id=v_next.property_id AND shop_id=p_shop_id
            AND project_id IS NOT DISTINCT FROM v_lead.project_id AND deleted_at IS NULL FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Байр олдсонгүй' USING ERRCODE='P0002'; END IF;
    END IF;
    -- «Сэжим»: шинээр зөвхөн идэвхтэй сонголт; одоогийн (архивласан) сонголтоо хэвээр үлдээж болно.
    IF p_patch ? 'referral_source_id' AND v_next.referral_source_id IS NOT NULL
        AND v_next.referral_source_id IS DISTINCT FROM v_viewing.referral_source_id THEN
        PERFORM id FROM public.sales_referral_sources
        WHERE id=v_next.referral_source_id AND shop_id=p_shop_id AND archived_at IS NULL FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Сэжим олдсонгүй эсвэл архивлагдсан' USING ERRCODE='22023'; END IF;
    END IF;
    IF p_patch ? 'status' AND v_next.status IS DISTINCT FROM v_viewing.status THEN
        v_next.completed_at := CASE WHEN v_next.status = 'completed' THEN v_now ELSE NULL END;
    END IF;
    IF p_patch - 'next_followup_at' <> '{}'::jsonb THEN
        UPDATE public.property_viewings SET status = v_next.status, scheduled_at = v_next.scheduled_at,
            completed_at = v_next.completed_at, agent_notes = v_next.agent_notes,
            customer_feedback = v_next.customer_feedback, interest_level = v_next.interest_level,
            deleted_at = v_next.deleted_at, property_id=v_next.property_id, meeting_type=v_next.meeting_type, interests=v_next.interests,
            referral_source_id=v_next.referral_source_id
        WHERE id = p_viewing_id AND shop_id = p_shop_id;
    END IF;

    IF p_patch ?| ARRAY['status', 'scheduled_at', 'next_followup_at'] THEN
        UPDATE public.leads SET updated_at = v_now,
            last_contact_at = CASE WHEN p_patch->>'status' = 'completed' THEN v_now ELSE last_contact_at END,
            next_followup_at = CASE WHEN p_patch ? 'next_followup_at' THEN (p_patch->>'next_followup_at')::timestamptz ELSE next_followup_at END,
            viewing_scheduled_at = CASE WHEN p_patch->>'status' IN ('cancelled', 'no_show') THEN NULL
                WHEN p_patch ? 'scheduled_at' THEN v_next.scheduled_at ELSE viewing_scheduled_at END,
            status = CASE WHEN p_patch->>'status' IN ('cancelled', 'no_show') AND status = 'viewing_scheduled'
                THEN 'contacted' ELSE status END
        WHERE id = v_lead_id AND shop_id = p_shop_id;
        IF p_patch ?| ARRAY['status', 'scheduled_at'] THEN
            v_content := CASE
                WHEN p_patch->>'status' = 'completed' THEN 'Уулзалт болов'
                    || CASE WHEN v_next.interest_level IS NOT NULL THEN ' · сонирхол ' || v_next.interest_level || '/5' ELSE '' END
                    || CASE WHEN nullif(v_next.customer_feedback, '') IS NOT NULL THEN ' · ' || v_next.customer_feedback ELSE '' END
                WHEN p_patch->>'status' = 'no_show' THEN 'Уулзалтад ирээгүй'
                WHEN p_patch->>'status' = 'cancelled' THEN 'Уулзалт цуцлагдав'
                WHEN p_patch ? 'scheduled_at' THEN 'Уулзалтын цаг өөрчлөгдөв'
                ELSE 'Уулзалт дахин товлогдов' END;
            INSERT INTO public.lead_activities(shop_id,lead_id,type,content,meta,created_by,created_by_name)
            VALUES (p_shop_id,v_lead_id,'meeting',v_content,
                jsonb_build_object('viewing_id',p_viewing_id,'status',v_next.status,'scheduled_at',v_next.scheduled_at),
                p_user_id,p_manager_name);
        END IF;
    END IF;
    IF p_patch ?| ARRAY['interests','property_id','meeting_type','agent_notes','referral_source_id'] AND v_lead_id IS NOT NULL THEN
        INSERT INTO public.lead_activities(shop_id,lead_id,type,content,meta,created_by,created_by_name)
        VALUES (p_shop_id,v_lead_id,'note','Уулзалтын мэдээлэл шинэчлэв',
            jsonb_build_object('viewing_id',p_viewing_id,'interests',v_next.interests,'action','viewing_update'),p_user_id,p_manager_name);
    END IF;
    RETURN jsonb_build_object('id',v_next.id,'status',v_next.status,'scheduled_at',v_next.scheduled_at,
        'lead_id',v_next.lead_id,'property_id',v_next.property_id,'interests',v_next.interests,
        'referral_source_id',v_next.referral_source_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_scoped_sales_viewing(uuid,uuid,uuid,text,uuid[],jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_scoped_sales_viewing(uuid,uuid,uuid,text,uuid[],jsonb) TO service_role;

-- Ээлжийн менежер (эсвэл байгууллагын хэрэглэгч) хамт олныхоо БОЛСОН уулзалтыг тухайн менежерийн нэр дээр
-- бүртгэнэ. Лид өгөөгүй бол тухайн менежерийн нэр дээр шинэ лид үүснэ (өөрийн нэр дээр давхар лид үүсэхгүй).
-- p_actor_project_ids NULL = байгууллагын хэрэглэгч (API шалгасан); үгүй бол бүртгэлтэй менежер. «Сэжим»-ийг шалгаж хадгална.
CREATE OR REPLACE FUNCTION public.record_daily_report_meeting(
    p_shop_id uuid,
    p_user_id uuid,
    p_actor_name text,
    p_actor_project_ids uuid[],
    p_manager_name text,
    p_report_date date,
    p_input jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    v_restricted boolean := p_actor_project_ids IS NOT NULL;
    v_now timestamptz := now();
    v_num numeric;
    v_interest integer;
    v_scheduled_at timestamptz;
    v_meeting_type text;
    v_project_id uuid;
    v_lead public.leads%ROWTYPE;
    v_lead_created boolean := false;
    v_viewing_id uuid;
    v_referral_source_id uuid;
    -- Өөрийн уулзалт эсэхийг нэрээр биш акаунтаар шийднэ (албан нэр бүртгэлийн нэрээс ялгаатай байж болно).
    v_self boolean;
BEGIN
    IF v_restricted AND (p_user_id IS NULL OR p_actor_name IS NULL OR cardinality(p_actor_project_ids) = 0) THEN
        RAISE EXCEPTION 'Уулзалт бүртгэх эрхгүй' USING ERRCODE = 'P0002';
    END IF;
    IF p_shop_id IS NULL OR p_report_date IS NULL OR p_manager_name IS NULL
        OR p_manager_name <> btrim(p_manager_name) OR char_length(p_manager_name) NOT BETWEEN 1 AND 120
        OR nullif(btrim(p_actor_name), '') IS NULL OR char_length(p_actor_name) > 120
        OR p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
        RAISE EXCEPTION 'Уулзалтын мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS fields(key)
            WHERE key NOT IN ('project_id', 'lead_id', 'customer_name', 'customer_phone', 'meeting_type', 'scheduled_at',
                'agent_notes', 'customer_feedback', 'interest_level', 'customer_label', 'referral_source_id'))
        OR jsonb_typeof(p_input->'project_id') IS DISTINCT FROM 'string'
        OR jsonb_typeof(p_input->'scheduled_at') IS DISTINCT FROM 'string'
        OR EXISTS (SELECT 1 FROM jsonb_each(p_input) AS fields(key, value)
            WHERE (key IN ('lead_id', 'customer_name', 'customer_phone', 'meeting_type', 'agent_notes', 'customer_feedback', 'customer_label', 'referral_source_id')
                AND jsonb_typeof(value) NOT IN ('string', 'null'))
            OR (key = 'interest_level' AND jsonb_typeof(value) NOT IN ('number', 'null'))) THEN
        RAISE EXCEPTION 'Уулзалтын мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF (p_input->>'project_id') !~ v_uuid
        OR (p_input->>'lead_id' IS NOT NULL AND (p_input->>'lead_id') !~ v_uuid)
        OR (p_input->>'referral_source_id' IS NOT NULL AND (p_input->>'referral_source_id') !~ v_uuid)
        OR char_length(coalesce(p_input->>'customer_name', '')) > 200
        OR (p_input->>'customer_phone' IS NOT NULL AND (p_input->>'customer_phone') !~ '^[0-9]{8,15}$')
        -- Шинэ лид утасгүй үүсэхгүй (нэргүй лид утас шаардана).
        OR (p_input->>'lead_id' IS NULL AND p_input->>'customer_phone' IS NULL)
        OR coalesce(p_input->>'meeting_type', 'new_customer') NOT IN ('new_customer', 'repeat_customer', 'existing_buyer')
        OR char_length(coalesce(p_input->>'agent_notes', '')) > 4000
        OR char_length(coalesce(p_input->>'customer_feedback', '')) > 4000
        OR char_length(coalesce(p_input->>'customer_label', '')) > 200 THEN
        RAISE EXCEPTION 'Уулзалтын мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_input->'interest_level') = 'number' THEN
        v_num := (p_input->>'interest_level')::numeric;
        IF v_num <> trunc(v_num) OR v_num < 1 OR v_num > 5 THEN
            RAISE EXCEPTION 'Сонирхлын түвшин буруу байна' USING ERRCODE = '22023';
        END IF;
        v_interest := v_num::integer;
    END IF;
    BEGIN
        v_scheduled_at := (p_input->>'scheduled_at')::timestamptz;
    EXCEPTION WHEN data_exception THEN
        RAISE EXCEPTION 'Уулзалтын цаг буруу байна' USING ERRCODE = '22023';
    END;
    -- Зөвхөн болсон уулзалт: ирээдүйн цаг болохгүй, тайлангийн өдөртэй (Улаанбаатарын өдөр) таарна.
    IF NOT isfinite(v_scheduled_at) OR v_scheduled_at > v_now + interval '5 minutes'
        OR (v_scheduled_at AT TIME ZONE 'Asia/Ulaanbaatar')::date <> p_report_date THEN
        RAISE EXCEPTION 'Уулзалтын цаг буруу байна' USING ERRCODE = '22023';
    END IF;
    v_meeting_type := coalesce(p_input->>'meeting_type', 'new_customer');
    v_project_id := (p_input->>'project_id')::uuid;

    PERFORM id FROM public.projects WHERE id = v_project_id AND shop_id = p_shop_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Төсөл олдсонгүй' USING ERRCODE = 'P0002'; END IF;
    -- «Сэжим (хаанаас ирсэн)»: энэ төслийн идэвхтэй (архивлаагүй) сонголт.
    v_referral_source_id := (p_input->>'referral_source_id')::uuid;
    IF v_referral_source_id IS NOT NULL THEN
        PERFORM id FROM public.sales_referral_sources
        WHERE id = v_referral_source_id AND shop_id = p_shop_id AND archived_at IS NULL
        FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Сэжим олдсонгүй эсвэл архивлагдсан' USING ERRCODE = '22023'; END IF;
    END IF;

    IF v_restricted THEN
        IF NOT coalesce(v_project_id = ANY(p_actor_project_ids), false)
            OR (SELECT count(*) FROM public.sales_managers WHERE shop_id = p_shop_id AND user_id = p_user_id) <> 1 THEN
            RAISE EXCEPTION 'Уулзалт бүртгэх эрхгүй' USING ERRCODE = 'P0002';
        END IF;
        PERFORM name FROM public.sales_managers
        WHERE shop_id = p_shop_id AND name = p_actor_name AND user_id = p_user_id AND is_active
        FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт бүртгэх эрхгүй' USING ERRCODE = 'P0002'; END IF;
        PERFORM project_id FROM public.sales_manager_projects
        WHERE shop_id = p_shop_id AND manager_name = p_actor_name AND project_id = v_project_id
        FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт бүртгэх эрхгүй' USING ERRCODE = 'P0002'; END IF;
    END IF;

    SELECT coalesce(user_id = p_user_id, false) INTO v_self FROM public.sales_managers
    WHERE shop_id = p_shop_id AND name = p_manager_name AND is_active
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Тухайн төслийн идэвхтэй борлуулалтын менежерийг сонгоно уу' USING ERRCODE = '22023';
    END IF;
    PERFORM project_id FROM public.sales_manager_projects
    WHERE shop_id = p_shop_id AND manager_name = p_manager_name AND project_id = v_project_id
    FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Тухайн төслийн идэвхтэй борлуулалтын менежерийг сонгоно уу' USING ERRCODE = '22023';
    END IF;

    IF p_input->>'lead_id' IS NOT NULL THEN
        -- Зөвхөн тухайн менежерийн энэ төслийн лид.
        SELECT * INTO v_lead FROM public.leads
        WHERE id = (p_input->>'lead_id')::uuid AND shop_id = p_shop_id AND deleted_at IS NULL
            AND project_id = v_project_id AND sales_manager_name = p_manager_name
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Лид олдсонгүй' USING ERRCODE = 'P0002'; END IF;
    ELSE
        -- Ижил утастай зэрэгцээ бүртгэлийг дарааллуулж, API-ийн хайлтын дараа үүссэн лидийг давхардуулахгүй
        -- (normalizePhone-той ижил: зөвхөн цифр, 976 / 00976-г хасна).
        PERFORM pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':' || v_project_id::text || ':' || (p_input->>'customer_phone'), 0));
        IF EXISTS (SELECT 1 FROM (
                SELECT regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g') AS digits FROM public.leads
                WHERE shop_id = p_shop_id AND project_id = v_project_id AND deleted_at IS NULL
            ) AS phones
            WHERE CASE WHEN char_length(digits) = 11 AND digits LIKE '976%' THEN substr(digits, 4)
                WHEN char_length(digits) = 13 AND digits LIKE '00976%' THEN substr(digits, 6)
                ELSE digits END = p_input->>'customer_phone') THEN
            RAISE EXCEPTION 'Энэ утастай лид бүртгэгдсэн байна' USING ERRCODE = '23505';
        END IF;
        INSERT INTO public.leads(shop_id, project_id, customer_name, customer_phone, status, source, sales_manager_name, last_contact_at)
        VALUES (p_shop_id, v_project_id, nullif(btrim(p_input->>'customer_name'), ''), p_input->>'customer_phone',
            'contacted', 'meeting', p_manager_name, v_scheduled_at)
        RETURNING * INTO v_lead;
        v_lead_created := true;
    END IF;

    INSERT INTO public.property_viewings(shop_id, lead_id, property_id, scheduled_at, status, completed_at, meeting_type,
        agent_notes, customer_feedback, interest_level, sales_manager_name, interests, referral_source_id)
    VALUES (p_shop_id, v_lead.id, NULL, v_scheduled_at, 'completed', v_now, v_meeting_type,
        p_input->>'agent_notes', p_input->>'customer_feedback', v_interest, p_manager_name, '[]'::jsonb, v_referral_source_id)
    RETURNING id INTO v_viewing_id;

    IF NOT v_lead_created THEN
        UPDATE public.leads SET updated_at = v_now,
            last_contact_at = greatest(coalesce(last_contact_at, v_scheduled_at), v_scheduled_at),
            status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END
        WHERE id = v_lead.id AND shop_id = p_shop_id;
    END IF;

    INSERT INTO public.lead_activities(shop_id, lead_id, type, content, meta, created_by, created_by_name)
    VALUES (p_shop_id, v_lead.id, 'meeting',
        CASE WHEN NOT v_self
            THEN 'Болсон уулзалт бүртгэв (' || p_actor_name || ' — ' || p_manager_name || '-ийн өмнөөс)'
            ELSE 'Ирсэн уулзалт бүртгэв' END,
        jsonb_build_object('viewing_id', v_viewing_id, 'scheduled_at', v_scheduled_at, 'via', 'daily_report',
            'on_behalf_of', p_manager_name),
        p_user_id, p_actor_name);

    INSERT INTO public.daily_report_changes(shop_id, report_date, kind, manager_name, viewing_id, new_text, meta,
        changed_by, changed_by_name, changed_at)
    VALUES (p_shop_id, p_report_date, 'meeting', p_manager_name, v_viewing_id, nullif(btrim(p_input->>'customer_label'), ''),
        jsonb_build_object('action', 'record', 'meeting_type', v_meeting_type, 'lead_created', v_lead_created),
        p_user_id, p_actor_name, v_now);

    RETURN jsonb_build_object('viewing_id', v_viewing_id, 'lead_id', v_lead.id, 'lead_created', v_lead_created);
END;
$$;

REVOKE ALL ON FUNCTION public.record_daily_report_meeting(uuid, uuid, text, uuid[], text, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_report_meeting(uuid, uuid, text, uuid[], text, date, jsonb) TO service_role;
