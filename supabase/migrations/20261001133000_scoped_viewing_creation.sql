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
    IF p_shop_id IS NULL OR p_lead_id IS NULL OR p_user_id IS NULL
        OR p_manager_name IS NULL OR coalesce(cardinality(p_project_ids), 0) = 0 THEN
        RAISE EXCEPTION 'Лид олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
        OR jsonb_typeof(p_input->'walk_in') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(p_input->'project_id') IS DISTINCT FROM 'string'
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS fields(key)
            WHERE key NOT IN ('project_id','property_id','scheduled_at','meeting_type','agent_notes','walk_in','interest_level','customer_feedback'))
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
        OR NOT coalesce(v_lead.project_id = ANY(p_project_ids),false)
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
    IF v_property_id IS NOT NULL THEN
        SELECT name INTO v_property_name FROM public.properties
        WHERE id = v_property_id AND shop_id = p_shop_id AND project_id = v_lead.project_id AND deleted_at IS NULL
        FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Байр олдсонгүй' USING ERRCODE = 'P0002'; END IF;
    END IF;

    INSERT INTO public.property_viewings(shop_id,lead_id,property_id,scheduled_at,status,meeting_type,
        agent_notes,sales_manager_name,completed_at,interest_level,customer_feedback)
    VALUES (p_shop_id,p_lead_id,v_property_id,v_scheduled_at,
        CASE WHEN v_walk_in THEN 'completed' ELSE 'scheduled' END,v_meeting_type,p_input->>'agent_notes',p_manager_name,
        CASE WHEN v_walk_in THEN v_now ELSE NULL END,
        CASE WHEN v_walk_in THEN v_interest_level ELSE NULL END,
        CASE WHEN v_walk_in THEN p_input->>'customer_feedback' ELSE NULL END)
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
        jsonb_build_object('viewing_id',v_viewing.id,'scheduled_at',v_scheduled_at,'walk_in',v_walk_in),
        p_user_id,p_manager_name);
    RETURN jsonb_build_object('id',v_viewing.id,'status',v_viewing.status,'scheduled_at',v_viewing.scheduled_at);
END;
$$;

REVOKE ALL ON FUNCTION public.create_scoped_sales_viewing(uuid,uuid,uuid,text,uuid[],jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_scoped_sales_viewing(uuid,uuid,uuid,text,uuid[],jsonb) TO service_role;
