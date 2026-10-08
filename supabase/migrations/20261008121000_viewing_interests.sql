-- Interest selections are snapshots; prices are derived server-side, never cash receipts.
ALTER TABLE public.property_viewings ADD COLUMN IF NOT EXISTS interests jsonb NOT NULL DEFAULT '[]'::jsonb;
DO $$ BEGIN
    ALTER TABLE public.property_viewings ADD CONSTRAINT property_viewings_interests_array
        CHECK (jsonb_typeof(interests) = 'array' AND jsonb_array_length(interests) <= 20);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service-role callers only. Recheck inventory while the lead/viewing locks are held.
CREATE OR REPLACE FUNCTION public.validate_viewing_interests(p_shop_id uuid,p_project_id uuid,p_interests jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE item jsonb;
BEGIN
    IF jsonb_typeof(p_interests) IS DISTINCT FROM 'array' OR jsonb_array_length(p_interests) > 20 THEN
        RAISE EXCEPTION 'Байрны сонголт буруу байна' USING ERRCODE='22023';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_interests) LOOP
        IF jsonb_typeof(item) <> 'object' OR jsonb_typeof(item->'block') IS DISTINCT FROM 'string'
            OR jsonb_typeof(item->'model') IS DISTINCT FROM 'string'
            OR jsonb_typeof(item->'area_sqm') IS DISTINCT FROM 'number'
            OR (item->>'area_sqm')::numeric <= 0
            OR (item->>'floor' IS NOT NULL AND (jsonb_typeof(item->'floor') <> 'number' OR (item->>'floor')::numeric <> trunc((item->>'floor')::numeric)))
            OR (item->>'unit_id' IS NOT NULL AND jsonb_typeof(item->'unit_id') <> 'string')
            OR (item->>'payment_condition' IS NOT NULL AND jsonb_typeof(item->'payment_condition') <> 'string') THEN
            RAISE EXCEPTION 'Байрны сонголт буруу байна' USING ERRCODE='22023';
        END IF;
        PERFORM u.id FROM public.property_units u
        WHERE u.shop_id=p_shop_id AND u.project_id=p_project_id AND u.category='residential'
            AND translate(upper(trim(u.block)), 'БЕ', 'BE')=translate(upper(trim(item->>'block')), 'БЕ', 'BE')
            AND translate(upper(trim(u.model)), 'БЕ', 'BE')=translate(upper(trim(item->>'model')), 'БЕ', 'BE')
            AND coalesce(CASE WHEN u.updated_sale_area>0 THEN u.updated_sale_area END,CASE WHEN u.sale_area>0 THEN u.sale_area END,CASE WHEN u.contracted_area>0 THEN u.contracted_area END)=(item->>'area_sqm')::numeric
            AND (item->>'floor' IS NULL OR (trim(u.floor) ~ '^[0-9]+$' AND trim(u.floor)::numeric=(item->>'floor')::numeric))
            AND (item->>'unit_id' IS NULL OR u.id=(item->>'unit_id')::uuid)
        FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Байрны сонголт олдсонгүй' USING ERRCODE='P0002'; END IF;
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_viewing_interests(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_viewing_interests(uuid,uuid,jsonb) TO service_role;

-- Төслийн менежерийн уулзалт үүсгэх үйлдэл лидийн одоогийн эзэмшигчийг дахин шалгана.
-- Уулзалт, лидийн төлөв, үйл ажиллагааны түүх нэг гүйлгээнд хадгалагдана.
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
BEGIN
    IF p_shop_id IS NULL OR p_lead_id IS NULL OR (p_project_ids IS NOT NULL AND (p_user_id IS NULL
        OR p_manager_name IS NULL OR coalesce(cardinality(p_project_ids),0)=0)) THEN
        RAISE EXCEPTION 'Лид олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
        OR jsonb_typeof(p_input->'walk_in') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(p_input->'project_id') IS DISTINCT FROM 'string'
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS fields(key)
            WHERE key NOT IN ('project_id','property_id','scheduled_at','meeting_type','agent_notes','walk_in','interest_level','customer_feedback','interests'))
        OR EXISTS (SELECT 1 FROM jsonb_each(p_input) AS fields(key,value)
            WHERE (key IN ('agent_notes','customer_feedback') AND
                (jsonb_typeof(value) NOT IN ('string','null') OR length(value #>> '{}') > 4000))
            OR (key IN ('property_id','scheduled_at') AND jsonb_typeof(value) NOT IN ('string','null'))
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

    INSERT INTO public.property_viewings(shop_id,lead_id,property_id,scheduled_at,status,meeting_type,
        agent_notes,sales_manager_name,completed_at,interest_level,customer_feedback,interests)
    VALUES (p_shop_id,p_lead_id,v_property_id,v_scheduled_at,
        CASE WHEN v_walk_in THEN 'completed' ELSE 'scheduled' END,v_meeting_type,p_input->>'agent_notes',coalesce(v_lead.sales_manager_name,p_manager_name),
        CASE WHEN v_walk_in THEN v_now ELSE NULL END,
        CASE WHEN v_walk_in THEN v_interest_level ELSE NULL END,
        CASE WHEN v_walk_in THEN p_input->>'customer_feedback' ELSE NULL END,coalesce(p_input->'interests','[]'::jsonb))
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
            WHERE key NOT IN ('status', 'scheduled_at', 'agent_notes', 'customer_feedback', 'interest_level', 'next_followup_at', 'deleted_at', 'property_id', 'meeting_type', 'interests')) THEN
        RAISE EXCEPTION 'Уулзалтын өөрчлөлт буруу байна' USING ERRCODE = '22023';
    END IF;
    IF (p_patch ? 'status' AND (jsonb_typeof(p_patch->'status') <> 'string'
        OR p_patch->>'status' NOT IN ('scheduled', 'completed', 'cancelled', 'no_show')))
        OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) AS fields(key,value)
            WHERE (key IN ('agent_notes', 'customer_feedback') AND
                (jsonb_typeof(value) NOT IN ('string', 'null') OR length(value #>> '{}') > 4000))
            OR (key IN ('scheduled_at', 'deleted_at') AND jsonb_typeof(value) <> 'string')
            OR (key = 'next_followup_at' AND jsonb_typeof(value) NOT IN ('string', 'null'))
            OR (key = 'property_id' AND jsonb_typeof(value) NOT IN ('string','null'))
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
    IF p_patch ? 'status' AND v_next.status IS DISTINCT FROM v_viewing.status THEN
        v_next.completed_at := CASE WHEN v_next.status = 'completed' THEN v_now ELSE NULL END;
    END IF;
    IF p_patch - 'next_followup_at' <> '{}'::jsonb THEN
        UPDATE public.property_viewings SET status = v_next.status, scheduled_at = v_next.scheduled_at,
            completed_at = v_next.completed_at, agent_notes = v_next.agent_notes,
            customer_feedback = v_next.customer_feedback, interest_level = v_next.interest_level,
            deleted_at = v_next.deleted_at, property_id=v_next.property_id, meeting_type=v_next.meeting_type, interests=v_next.interests
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
    IF p_patch ?| ARRAY['interests','property_id','meeting_type','agent_notes'] AND v_lead_id IS NOT NULL THEN
        INSERT INTO public.lead_activities(shop_id,lead_id,type,content,meta,created_by,created_by_name)
        VALUES (p_shop_id,v_lead_id,'note','Уулзалтын мэдээлэл шинэчлэв',
            jsonb_build_object('viewing_id',p_viewing_id,'interests',v_next.interests,'action','viewing_update'),p_user_id,p_manager_name);
    END IF;
    RETURN jsonb_build_object('id',v_next.id,'status',v_next.status,'scheduled_at',v_next.scheduled_at,
        'lead_id',v_next.lead_id,'property_id',v_next.property_id,'interests',v_next.interests);
END;
$$;

REVOKE ALL ON FUNCTION public.update_scoped_sales_viewing(uuid,uuid,uuid,text,uuid[],jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_scoped_sales_viewing(uuid,uuid,uuid,text,uuid[],jsonb) TO service_role;
