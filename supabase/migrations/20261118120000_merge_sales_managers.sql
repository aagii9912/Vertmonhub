-- Менежерийн давхар бүртгэлийг нэгтгэх (2026-11-18, Mandala Garden: акаунтын латин нэрээр шинэ мөр үүсч, ижил хүн
-- кирилл «Нэр.Овог»-оор гэрээтэйгээ бүртгэлд аль хэдийн байсан — Nomin ↔ Номин.Одончимэг гэх мэт).
--
-- • merge_sales_managers(shop, source, target, actor) — source нэрийг түлхүүр болгосон бүх баганыг (rename_sales_manager-ийн
--   жагсаалт: лид, уулзалт, гэрээ, харилцагч, санал гомдол, өдрийн тайлан, тайлангийн загвар, байр, KPI сар, хуучин
--   төлөвлөгөө) БАЙГАА target нэр рүү нэг гүйлгээнд шилжүүлж, source мөрийг бүртгэлээс хасна. Төслийн харьяаллыг нэгтгэнэ,
--   ажлын төлөвлөгөөний хариуцагч (sales_managers.id) target-ийн id болно. Target нь акаунтгүй бол source-ийн акаунтыг
--   авна; хоёулаа өөр акаунттай бол татгалзана. Аль нэг нь идэвхтэй бол target идэвхтэй.
-- • Ижил хүний хоёр нэр — шинэ хариуцуулалт биш: rename-ийн гүйлгээний тэмдэг `vertmonhub.manager_rename`-ийг ашиглана
--   (source мөрийг эхлээд хасдаг тул лидийн хамгаалалт «хуучин нэр бүртгэлээс гарч, шинэ нэр бүртгэлд байна» гэж таньна;
--   sales_handoff_at, байрны updated_at шинээр тамгалагдахгүй).
-- • Нэг өдрийн нэг мөрөнд (өдрийн тайлан) эсвэл нэг сард (KPI) хоёр нэр зэрэг утгатай бол юу ч бичихгүй (хэзээ ч нэмэхгүй).
-- • «Хэн оруулсан» тамга, өөрчлөлтийн түүх (daily_report_changes, lead_activities) хуучин нэрээрээ үлдэнэ.
--
-- Additive, дахин ажиллуулж болно. Browser хандахгүй: зөвхөн service_role.

CREATE OR REPLACE FUNCTION public.merge_sales_managers(
    p_shop_id uuid, p_source text, p_target text, p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    v_source public.sales_managers%ROWTYPE;
    v_target public.sales_managers%ROWTYPE;
    v_user uuid;
    v_active boolean;
    v_clash text;
    v_count integer;
    v_counts jsonb := '{}'::jsonb;
    v_step text := 'менежерийн бүртгэл'; -- алдааны мессежид: аль хүснэгт зөвшөөрөөгүй
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_actor AND role = 'super_admin') THEN
        RAISE EXCEPTION 'Менежерийн бүртгэлийг зөвхөн super_admin нэгтгэнэ' USING ERRCODE = '42501';
    END IF;
    IF p_shop_id IS NULL OR NOT (
        EXISTS (SELECT 1 FROM public.shops WHERE id = p_shop_id AND user_id = p_actor)
        OR EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_actor)
    ) THEN
        RAISE EXCEPTION 'Энэ төсөлд хандах эрхгүй' USING ERRCODE = '42501';
    END IF;
    IF p_source IS NULL OR p_target IS NULL OR p_source = p_target THEN
        RAISE EXCEPTION 'Нэгтгэх хоёр өөр менежерийг сонгоно уу' USING ERRCODE = '22023';
    END IF;

    -- save_sales_manager_roster, rename_sales_manager-тэй ижил түгжээ.
    PERFORM id FROM public.shops WHERE id = p_shop_id FOR UPDATE;
    SELECT * INTO v_source FROM public.sales_managers WHERE shop_id = p_shop_id AND name = p_source FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Менежерийн бүртгэлд «%» олдсонгүй', p_source USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_target FROM public.sales_managers WHERE shop_id = p_shop_id AND name = p_target FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Менежерийн бүртгэлд «%» олдсонгүй', p_target USING ERRCODE = 'P0002';
    END IF;
    IF v_source.user_id IS NOT NULL AND v_target.user_id IS NOT NULL AND v_source.user_id <> v_target.user_id THEN
        RAISE EXCEPTION '«%» ба «%» өөр өөр акаунттай холбогдсон байна. Буруу холбоосыг эхлээд салгана уу. Юу ч өөрчлөгдсөнгүй.', p_source, p_target
            USING ERRCODE = '23505';
    END IF;

    -- Хоёр нэр нэг нүдэнд зэрэг утгатай бол нэмэхгүй, аль нэгийг сонгохгүй: админ цэвэрлээд дахин оролдоно.
    SELECT string_agg(DISTINCT pg_catalog.to_char(source.report_date, 'YYYY-MM-DD'), ', ') INTO v_clash
    FROM public.daily_report_counts AS source
    JOIN public.daily_report_counts AS target ON target.shop_id = source.shop_id AND target.report_date = source.report_date
        AND target.metric = source.metric AND target.manager_name = p_target
    WHERE source.shop_id = p_shop_id AND source.manager_name = p_source;
    IF v_clash IS NOT NULL THEN
        RAISE EXCEPTION 'Өдрийн тайланд «%» ба «%» нэг өдөр, нэг мөрөнд тоотой байна (%). Аль нэгийн нүдийг цэвэрлээд дахин оролдоно уу. Юу ч өөрчлөгдсөнгүй.',
            p_source, p_target, v_clash USING ERRCODE = '23505';
    END IF;
    SELECT string_agg(DISTINCT source.year || '-' || pg_catalog.lpad(source.month::text, 2, '0'), ', ') INTO v_clash
    FROM public.sales_kpi_months AS source
    JOIN public.sales_kpi_months AS target ON target.shop_id = source.shop_id AND target.year = source.year
        AND target.month = source.month AND target.manager_name = p_target
    WHERE source.shop_id = p_shop_id AND source.manager_name = p_source;
    IF v_clash IS NOT NULL THEN
        RAISE EXCEPTION 'KPI-д «%» ба «%» нэг сард бүртгэлтэй байна (%). Юу ч өөрчлөгдсөнгүй.', p_source, p_target, v_clash
            USING ERRCODE = '23505';
    END IF;

    v_user := COALESCE(v_target.user_id, v_source.user_id);
    v_active := v_target.is_active OR v_source.is_active;

    BEGIN
        -- Ижил хүний хоёр нэр: лидийн хамгаалалт, хариуцуулалтын ба байрны тамга нэр солихтой адил.
        PERFORM pg_catalog.set_config('vertmonhub.manager_rename', 'on', true);

        v_step := 'төслийн харьяалал';
        INSERT INTO public.sales_manager_projects (shop_id, manager_name, project_id)
        SELECT shop_id, p_target, project_id FROM public.sales_manager_projects WHERE shop_id = p_shop_id AND manager_name = p_source
        ON CONFLICT (shop_id, manager_name, project_id) DO NOTHING;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('sales_manager_projects', v_count);

        -- source мөрийг хасахаас өмнө (ON DELETE CASCADE).
        v_step := 'KPI';
        UPDATE public.sales_kpi_months SET manager_name = p_target WHERE shop_id = p_shop_id AND manager_name = p_source;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('sales_kpi_months', v_count);

        -- Хариуцагч нь sales_managers.id (20261113150000; зарим орчинд хүснэгт алга): source → target, давхардалгүй, дараалал хэвээр.
        IF to_regclass('public.sales_work_plan_items') IS NOT NULL THEN
            v_step := 'ажлын төлөвлөгөө';
            UPDATE public.sales_work_plan_items AS item SET assignee_ids = ARRAY(
                SELECT assignee.id FROM unnest(pg_catalog.array_replace(item.assignee_ids, v_source.id, v_target.id))
                    WITH ORDINALITY AS assignee(id, ord)
                GROUP BY assignee.id ORDER BY min(assignee.ord)
            )
            WHERE item.shop_id = p_shop_id AND v_source.id = ANY (item.assignee_ids);
            GET DIAGNOSTICS v_count = ROW_COUNT;
            v_counts := v_counts || jsonb_build_object('sales_work_plan_items', v_count);
        END IF;

        v_step := 'менежерийн бүртгэл';
        DELETE FROM public.sales_managers WHERE id = v_source.id;
        UPDATE public.sales_managers SET user_id = v_user, is_active = v_active WHERE id = v_target.id;

        v_step := 'лид';
        UPDATE public.leads SET sales_manager_name = p_target WHERE shop_id = p_shop_id AND sales_manager_name = p_source;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('leads', v_count);

        v_step := 'уулзалт';
        UPDATE public.property_viewings SET sales_manager_name = p_target WHERE shop_id = p_shop_id AND sales_manager_name = p_source;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('property_viewings', v_count);

        v_step := 'гэрээ';
        UPDATE public.property_contracts SET sales_manager = p_target WHERE shop_id = p_shop_id AND sales_manager = p_source;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('property_contracts', v_count);

        v_step := 'харилцагч';
        UPDATE public.customers SET sales_manager_name = p_target WHERE shop_id = p_shop_id AND sales_manager_name = p_source;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('customers', v_count);

        v_step := 'санал гомдол';
        UPDATE public.service_logs SET manager_name = p_target WHERE shop_id = p_shop_id AND manager_name = p_source;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('service_logs', v_count);

        v_step := 'өдрийн тайлангийн нүд';
        UPDATE public.daily_report_counts SET manager_name = p_target WHERE shop_id = p_shop_id AND manager_name = p_source;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('daily_report_counts', v_count);

        -- Баганын тохиргоо: target-ийн мөр байвал түүний байрлал, товчлол үлдэж source-ийн мөр хасагдана;
        -- байхгүй бол source-ийн мөр target нэртэй болно.
        v_step := 'өдрийн тайлангийн загвар';
        UPDATE public.daily_report_settings AS settings SET config = jsonb_set(settings.config, '{managers}', (
            SELECT COALESCE(jsonb_agg(CASE WHEN entry->>'name' = p_source THEN jsonb_set(entry, '{name}', to_jsonb(p_target)) ELSE entry END
                ORDER BY ord) FILTER (WHERE entry->>'name' IS DISTINCT FROM p_source OR NOT jsonb_path_exists(settings.config,
                    '$.managers[*] ? (@.name == $target)', jsonb_build_object('target', p_target))), '[]'::jsonb)
            FROM jsonb_array_elements(settings.config->'managers') WITH ORDINALITY AS managers(entry, ord)
        ))
        WHERE settings.shop_id = p_shop_id AND jsonb_typeof(settings.config->'managers') = 'array'
            AND jsonb_path_exists(settings.config, '$.managers[*] ? (@.name == $source)', jsonb_build_object('source', p_source));
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('daily_report_settings', v_count);

        v_step := 'байр';
        UPDATE public.property_units SET sales_manager = p_target WHERE shop_id = p_shop_id AND sales_manager = p_source;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object('property_units', v_count);

        -- 20260701120000 зарим орчинд (production) үүсээгүй.
        IF to_regclass('public.sales_targets') IS NOT NULL THEN
            v_step := 'хуучин төлөвлөгөө';
            UPDATE public.sales_targets SET sales_manager = p_target WHERE shop_id = p_shop_id AND sales_manager = p_source;
            GET DIAGNOSTICS v_count = ROW_COUNT;
            v_counts := v_counts || jsonb_build_object('sales_targets', v_count);
        END IF;

        PERFORM pg_catalog.set_config('vertmonhub.manager_rename', '', true);
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'Нэгтгэх боломжгүй: хоёр нэрийн өгөгдөл (өдрийн тайлан, KPI эсвэл төлөвлөгөө) давхцаж байна. Юу ч өөрчлөгдсөнгүй.'
                USING ERRCODE = '23505';
        WHEN check_violation THEN
            RAISE EXCEPTION 'Нэгтгэх боломжгүй: «%» бүртгэлийн шалгалт зөвшөөрсөнгүй. Юу ч өөрчлөгдсөнгүй.', v_step
                USING ERRCODE = '23514', DETAIL = SQLERRM;
    END;

    INSERT INTO public.admin_audit_log (actor_id, action, target_id, meta)
    VALUES (p_actor, 'sales.manager.merge', v_target.id::text, jsonb_build_object(
        'shop_id', p_shop_id, 'source_name', p_source, 'target_name', p_target, 'source_id', v_source.id,
        'user_linked', v_target.user_id IS NULL AND v_source.user_id IS NOT NULL, 'is_active', v_active, 'counts', v_counts
    ));
    RETURN jsonb_build_object('source_name', p_source, 'target_name', p_target, 'counts', v_counts,
        'user_linked', v_target.user_id IS NULL AND v_source.user_id IS NOT NULL, 'is_active', v_active);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_sales_managers(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_sales_managers(uuid, text, text, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
