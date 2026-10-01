-- Лидийн одоогийн хариуцагчийг түгжиж шалгаад холбооны цаг, түүхийг хамт хадгална.
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
BEGIN
    IF p_shop_id IS NULL OR p_lead_id IS NULL OR p_user_id IS NULL
        OR p_manager_name IS NULL OR coalesce(cardinality(p_project_ids), 0) = 0 THEN
        RAISE EXCEPTION 'Лид олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
        OR jsonb_typeof(p_input->'type') IS DISTINCT FROM 'string'
        OR p_input->>'type' NOT IN ('note','call')
        OR jsonb_typeof(p_input->'content') IS DISTINCT FROM 'string'
        OR length(btrim(p_input->>'content')) NOT BETWEEN 1 AND 4000
        OR (p_input ? 'next_followup_at' AND jsonb_typeof(p_input->'next_followup_at') NOT IN ('string','null'))
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS fields(key)
            WHERE key NOT IN ('type','content','next_followup_at')) THEN
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

    IF p_input->>'type' = 'call' OR p_input ? 'next_followup_at' THEN
        UPDATE public.leads SET updated_at = v_now,
            last_contact_at = CASE WHEN p_input->>'type' = 'call' THEN v_now ELSE last_contact_at END,
            next_followup_at = CASE WHEN p_input ? 'next_followup_at' THEN v_next_followup_at ELSE next_followup_at END
        WHERE id = p_lead_id AND shop_id = p_shop_id;
    END IF;
    INSERT INTO public.lead_activities(shop_id,lead_id,type,content,meta,created_by,created_by_name)
    VALUES (p_shop_id,p_lead_id,p_input->>'type',p_input->>'content',
        CASE WHEN p_input ? 'next_followup_at' THEN jsonb_build_object('next_followup_at',p_input->'next_followup_at') ELSE '{}'::jsonb END,
        p_user_id,p_manager_name)
    RETURNING * INTO v_activity;
    RETURN jsonb_build_object('id',v_activity.id,'lead_id',v_activity.lead_id,'type',v_activity.type,
        'content',v_activity.content,'meta',v_activity.meta,'created_by_name',v_activity.created_by_name,'created_at',v_activity.created_at);
END;
$$;

REVOKE ALL ON FUNCTION public.record_scoped_sales_lead_contact(uuid,uuid,uuid,text,uuid[],jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_scoped_sales_lead_contact(uuid,uuid,uuid,text,uuid[],jsonb) TO service_role;
