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
    IF p_shop_id IS NULL OR p_viewing_id IS NULL OR p_user_id IS NULL
        OR p_manager_name IS NULL OR coalesce(cardinality(p_project_ids), 0) = 0 THEN
        RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) AS fields(key)
            WHERE key NOT IN ('status', 'scheduled_at', 'agent_notes', 'customer_feedback', 'interest_level', 'next_followup_at', 'deleted_at')) THEN
        RAISE EXCEPTION 'Уулзалтын өөрчлөлт буруу байна' USING ERRCODE = '22023';
    END IF;
    IF (p_patch ? 'status' AND (jsonb_typeof(p_patch->'status') <> 'string'
        OR p_patch->>'status' NOT IN ('scheduled', 'completed', 'cancelled', 'no_show')))
        OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) AS fields(key,value)
            WHERE (key IN ('agent_notes', 'customer_feedback') AND
                (jsonb_typeof(value) NOT IN ('string', 'null') OR length(value #>> '{}') > 4000))
            OR (key IN ('scheduled_at', 'deleted_at') AND jsonb_typeof(value) <> 'string')
            OR (key = 'next_followup_at' AND jsonb_typeof(value) NOT IN ('string', 'null'))
            OR (key = 'interest_level' AND jsonb_typeof(value) NOT IN ('number', 'null'))) THEN
        RAISE EXCEPTION 'Уулзалтын өөрчлөлт буруу байна' USING ERRCODE = '22023';
    END IF;

    SELECT lead_id INTO v_lead_id FROM public.property_viewings
    WHERE id = p_viewing_id AND shop_id = p_shop_id AND deleted_at IS NULL;
    IF NOT FOUND OR v_lead_id IS NULL THEN
        RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002';
    END IF;

    -- Лидийг эхэлж түгжинэ. Зэрэгцээ хуваарилалт түрүүлсэн бол шинэ эзэмшигчээр шалгана.
    SELECT * INTO v_lead FROM public.leads
    WHERE id = v_lead_id AND shop_id = p_shop_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND OR v_lead.project_id IS NULL OR NOT coalesce(v_lead.project_id = ANY(p_project_ids), false)
        OR v_lead.sales_manager_name IS DISTINCT FROM p_manager_name THEN
        RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
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

    -- Шалгалтын хооронд уулзалтын lead_id солигдсон бол бичихгүй.
    SELECT * INTO v_viewing FROM public.property_viewings
    WHERE id = p_viewing_id AND shop_id = p_shop_id AND lead_id = v_lead_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002'; END IF;
    v_next := jsonb_populate_record(v_viewing, p_patch - 'next_followup_at');
    IF v_next.scheduled_at IS NULL OR NOT isfinite(v_next.scheduled_at)
        OR (v_next.deleted_at IS NOT NULL AND NOT isfinite(v_next.deleted_at))
        OR (p_patch->>'next_followup_at' IS NOT NULL AND NOT isfinite((p_patch->>'next_followup_at')::timestamptz))
        OR (v_next.interest_level IS NOT NULL AND v_next.interest_level NOT BETWEEN 1 AND 5) THEN
        RAISE EXCEPTION 'Уулзалтын огноо эсвэл сонирхлын түвшин буруу байна' USING ERRCODE = '22023';
    END IF;
    IF p_patch ? 'status' THEN
        v_next.completed_at := CASE WHEN v_next.status = 'completed' THEN v_now ELSE NULL END;
    END IF;
    IF p_patch - 'next_followup_at' <> '{}'::jsonb THEN
        UPDATE public.property_viewings SET status = v_next.status, scheduled_at = v_next.scheduled_at,
            completed_at = v_next.completed_at, agent_notes = v_next.agent_notes,
            customer_feedback = v_next.customer_feedback, interest_level = v_next.interest_level,
            deleted_at = v_next.deleted_at
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
    RETURN jsonb_build_object('id',v_next.id,'status',v_next.status,'scheduled_at',v_next.scheduled_at,
        'lead_id',v_next.lead_id,'property_id',v_next.property_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_scoped_sales_viewing(uuid,uuid,uuid,text,uuid[],jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_scoped_sales_viewing(uuid,uuid,uuid,text,uuid[],jsonb) TO service_role;
