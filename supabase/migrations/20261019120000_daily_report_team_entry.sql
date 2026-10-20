-- Өдрийн тайлан — ээлжийн менежерийн оруулга, өөрчлөлтийн түүх (эзэмшигчийн шийдвэр 2026-10-19).
-- Тайлан өдөр бүр ээлжээр хийгддэг тул төслийн бүртгэлтэй менежер бүр хамт олныхоо дуудлага, чатын
-- тоог оруулж/засаж/цэвэрлэж болно. Нүд бүр хэн оруулсныг хадгална, өөрчлөлт бүр түүхэд (хуучин → шинэ)
-- үлдэнэ, буруу оруулгыг түүхээс сэргээнэ. Ээлжийн менежер хамт олныхоо болсон уулзалтыг тухайн
-- менежерийн нэр дээр бүртгэж, тухайн өдрийн товлосон уулзалтыг «Болсон» / «Ирээгүй» болгоно; админ
-- уулзалтыг аль менежерт тооцохыг засна. Уулзалт зөвхөн property_viewings хэвээр (KPI дүрэм өөрчлөгдөхгүй).
--
-- • daily_report_counts.updated_by_name — нүдийг сүүлд оруулсан хүний нэр (UI-д харагдана).
-- • daily_report_changes — тайлангийн өөрчлөлтийн түүх (append-only): тоо, тэмдэглэл, баталгаажуулалт, уулзалт.
-- • save_daily_report — тоо, тэмдэглэл, баталгаажуулалтыг нэг гүйлгээнд: зөрчил (өөр хүн энэ хооронд
--   өөрчилсөн) байвал юу ч бичихгүй; өөрчлөгдсөн нүд бүрт түүхийн мөр.
-- • record_daily_report_meeting / complete_daily_report_meeting / reassign_daily_report_meeting — уулзалт.
--
-- Эрх (модуль, менежерийн бүртгэл, админ эсэх)-ийг API шалгана; функцууд хэлбэр, бүртгэлийг дахин шалгаад
-- атомаар бичнэ. Additive, дахин ажиллуулж болно. Browser шууд хандахгүй: зөвхөн service_role.

ALTER TABLE public.daily_report_counts ADD COLUMN IF NOT EXISTS updated_by_name text;
DO $$ BEGIN
    ALTER TABLE public.daily_report_counts ADD CONSTRAINT daily_report_counts_updated_by_name_length
        CHECK (updated_by_name IS NULL OR char_length(updated_by_name) <= 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON COLUMN public.daily_report_counts.updated_by_name IS 'Нүдийг сүүлд оруулсан хүний нэр (менежерийн бүртгэлийн нэр, эсвэл профайлын нэр).';

CREATE TABLE IF NOT EXISTS public.daily_report_changes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    report_date date NOT NULL,
    kind text NOT NULL CHECK (kind IN ('count', 'note', 'complete', 'meeting')),
    -- count: баганын менежер; meeting: уулзалтыг тооцох менежер.
    manager_name text CHECK (manager_name IS NULL OR char_length(manager_name) <= 120),
    metric text CHECK (metric IS NULL OR metric ~ '^(call\.[a-z0-9]{1,16}\.(total|new|repeat|other)|chat\.[a-z0-9]{1,16})$'),
    note_key text CHECK (note_key IS NULL OR note_key ~ '^(line\.[a-z0-9]{1,16}|chats|general)$'),
    -- NULL = хоосон нүд.
    old_value integer CHECK (old_value IS NULL OR old_value BETWEEN 0 AND 10000),
    new_value integer CHECK (new_value IS NULL OR new_value BETWEEN 0 AND 10000),
    -- note: тэмдэглэл; complete: баталгаажуулсан хүн; meeting: богино тайлбар.
    old_text text CHECK (old_text IS NULL OR char_length(old_text) <= 2000),
    new_text text CHECK (new_text IS NULL OR char_length(new_text) <= 2000),
    -- FK-гүй: уулзалт зөөлөн устгагдсан ч түүх үлдэнэ.
    viewing_id uuid,
    restored_from bigint REFERENCES public.daily_report_changes(id),
    meta jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(meta) = 'object'),
    changed_by uuid,
    changed_by_name text CHECK (changed_by_name IS NULL OR char_length(changed_by_name) <= 120),
    changed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT daily_report_changes_kind_fields CHECK (
        (kind <> 'count' OR (manager_name IS NOT NULL AND metric IS NOT NULL))
        AND (kind <> 'note' OR note_key IS NOT NULL)
        AND (kind <> 'meeting' OR (viewing_id IS NOT NULL
            AND coalesce(char_length(old_text), 0) <= 500 AND coalesce(char_length(new_text), 0) <= 500))
    )
);

CREATE INDEX IF NOT EXISTS daily_report_changes_day_idx
    ON public.daily_report_changes (shop_id, report_date, changed_at DESC);
CREATE INDEX IF NOT EXISTS daily_report_changes_actor_idx
    ON public.daily_report_changes (shop_id, changed_by, changed_at DESC);

COMMENT ON TABLE public.daily_report_changes IS 'Өдрийн тайлангийн өөрчлөлтийн түүх (зөвхөн нэмэгдэнэ): хэн, хэзээ, юуг (тоо, тэмдэглэл, баталгаажуулалт, уулзалт), хуучин → шинэ.';

ALTER TABLE public.daily_report_changes ENABLE ROW LEVEL SECURITY;
-- Append-only: service_role ч засах, устгах эрхгүй (Supabase-ийн default privilege-ийг цуцална).
REVOKE ALL ON TABLE public.daily_report_changes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.daily_report_changes TO service_role;
REVOKE ALL ON SEQUENCE public.daily_report_changes_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.daily_report_changes_id_seq TO service_role;

-- Админы «Өөрчлөлтийн түүх»: хэрэглэгч бүрээр шүүнэ. data_audit_log (20260616130000) зарим орчинд
-- (production 2026-10-20) үүсээгүй — тэр үед алгасна; хүснэгт үүсэхэд энэ файлыг дахин ажиллуулна.
-- Аудит лог зөвхөн серверт (20260928120000-ийн дүрэм): browser-ийн role-уудын эрхийг цуцална.
DO $$ BEGIN
    IF to_regclass('public.data_audit_log') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_data_audit_actor_created
            ON public.data_audit_log (shop_id, actor_id, created_at DESC);
        REVOKE ALL ON TABLE public.data_audit_log FROM anon, authenticated;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_lead_activities_creator
    ON public.lead_activities (shop_id, created_by, created_at DESC);

-- Тоо, тэмдэглэл, баталгаажуулалтыг хадгална. expected өгсөн нүд/тэмдэглэл одоогийн утгаасаа зөрвөл
-- (өөр хүн энэ хооронд өөрчилсөн) юу ч бичихгүй, {ok:false, conflicts} буцаана.
-- p_notes: зөвхөн илгээсэн түлхүүр өөрчлөгдөнө; '' бол тухайн тэмдэглэлийг цэвэрлэнэ.
-- p_complete: true = баталгаажуулна, false = цуцална, NULL = хөндөхгүй.
CREATE OR REPLACE FUNCTION public.save_daily_report(
    p_shop_id uuid,
    p_date date,
    p_user_id uuid,
    p_user_name text,
    p_cells jsonb,
    p_notes jsonb,
    p_complete boolean,
    p_restored_from bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    -- SQL NULL ба JSON null = хоосон.
    v_cells jsonb := CASE WHEN jsonb_typeof(p_cells) IS DISTINCT FROM 'null' THEN coalesce(p_cells, '[]'::jsonb) ELSE '[]'::jsonb END;
    v_notes_in jsonb := CASE WHEN jsonb_typeof(p_notes) IS DISTINCT FROM 'null' THEN coalesce(p_notes, '[]'::jsonb) ELSE '[]'::jsonb END;
    v_cell jsonb;
    v_note jsonb;
    v_num numeric;
    v_manager text;
    v_metric text;
    v_value integer;
    v_current integer;
    v_key text;
    v_line text;
    v_text text;
    v_current_text text;
    v_lines jsonb;
    v_notes jsonb;
    v_report public.daily_reports%ROWTYPE;
    v_completed_by uuid;
    v_completed_by_name text;
    v_completed_at timestamptz;
    v_report_changed boolean := false;
    v_conflicts jsonb := '[]'::jsonb;
    v_changes integer := 0;
    v_now timestamptz := now();
BEGIN
    IF p_shop_id IS NULL OR p_date IS NULL OR char_length(coalesce(p_user_name, '')) > 120
        OR jsonb_typeof(v_cells) <> 'array' OR jsonb_typeof(v_notes_in) <> 'array' THEN
        RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_cells) > 600 OR jsonb_array_length(v_notes_in) > 20 THEN
        RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;

    FOR v_cell IN SELECT value FROM jsonb_array_elements(v_cells) LOOP
        IF jsonb_typeof(v_cell) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_cell) AS fields(key)
                WHERE key NOT IN ('manager', 'metric', 'value', 'expected'))
            OR jsonb_typeof(v_cell->'manager') IS DISTINCT FROM 'string'
            OR jsonb_typeof(v_cell->'metric') IS DISTINCT FROM 'string'
            OR coalesce(jsonb_typeof(v_cell->'value'), 'missing') NOT IN ('number', 'null')
            OR (v_cell ? 'expected' AND jsonb_typeof(v_cell->'expected') NOT IN ('number', 'null')) THEN
            RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
        END IF;
        v_manager := v_cell->>'manager';
        IF v_manager <> btrim(v_manager) OR char_length(v_manager) NOT BETWEEN 1 AND 120
            OR (v_cell->>'metric') !~ '^(call\.[a-z0-9]{1,16}\.(total|new|repeat|other)|chat\.[a-z0-9]{1,16})$' THEN
            RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
        END IF;
        IF jsonb_typeof(v_cell->'value') = 'number' THEN
            v_num := (v_cell->>'value')::numeric;
            IF v_num <> trunc(v_num) OR v_num < 0 OR v_num > 10000 THEN
                RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
            END IF;
        END IF;
        IF jsonb_typeof(v_cell->'expected') = 'number' THEN
            v_num := (v_cell->>'expected')::numeric;
            IF v_num <> trunc(v_num) OR v_num < 0 OR v_num > 10000 THEN
                RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
            END IF;
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM (SELECT DISTINCT value->>'manager', value->>'metric' FROM jsonb_array_elements(v_cells)) AS cells)
        <> jsonb_array_length(v_cells) THEN
        RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;

    FOR v_note IN SELECT value FROM jsonb_array_elements(v_notes_in) LOOP
        IF jsonb_typeof(v_note) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_note) AS fields(key)
                WHERE key NOT IN ('key', 'value', 'expected'))
            OR jsonb_typeof(v_note->'key') IS DISTINCT FROM 'string'
            OR jsonb_typeof(v_note->'value') IS DISTINCT FROM 'string'
            OR (v_note ? 'expected' AND jsonb_typeof(v_note->'expected') NOT IN ('string', 'null')) THEN
            RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
        END IF;
        IF (v_note->>'key') !~ '^(line\.[a-z0-9]{1,16}|chats|general)$' OR char_length(v_note->>'value') > 2000 THEN
            RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
        END IF;
    END LOOP;
    IF (SELECT count(DISTINCT value->>'key') FROM jsonb_array_elements(v_notes_in)) <> jsonb_array_length(v_notes_in) THEN
        RAISE EXCEPTION 'Тайлангийн мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;

    IF p_restored_from IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.daily_report_changes
        WHERE id = p_restored_from AND shop_id = p_shop_id AND report_date = p_date AND kind IN ('count', 'note')
    ) THEN
        RAISE EXCEPTION 'Сэргээх өөрчлөлт олдсонгүй' USING ERRCODE = '22023';
    END IF;

    -- Нэг өдрийн зэрэгцээ хадгалалтыг дарааллуулна.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':' || p_date::text, 0));

    SELECT * INTO v_report FROM public.daily_reports
    WHERE shop_id = p_shop_id AND report_date = p_date
    FOR UPDATE;
    v_notes := CASE WHEN jsonb_typeof(v_report.notes) = 'object' THEN v_report.notes ELSE '{}'::jsonb END;
    v_completed_by := v_report.completed_by;
    v_completed_by_name := v_report.completed_by_name;
    v_completed_at := v_report.completed_at;

    -- Зөрчил: бичихээс өмнө бүгдийг шалгана.
    FOR v_cell IN SELECT value FROM jsonb_array_elements(v_cells) LOOP
        CONTINUE WHEN NOT v_cell ? 'expected';
        SELECT value INTO v_current FROM public.daily_report_counts
        WHERE shop_id = p_shop_id AND report_date = p_date
            AND manager_name = v_cell->>'manager' AND metric = v_cell->>'metric';
        IF v_current IS DISTINCT FROM (v_cell->>'expected')::numeric::integer THEN
            v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('kind', 'count',
                'manager', v_cell->>'manager', 'metric', v_cell->>'metric', 'current', v_current));
        END IF;
    END LOOP;
    FOR v_note IN SELECT value FROM jsonb_array_elements(v_notes_in) LOOP
        CONTINUE WHEN NOT v_note ? 'expected';
        v_key := v_note->>'key';
        v_current_text := coalesce(CASE WHEN v_key LIKE 'line.%' THEN
                CASE WHEN jsonb_typeof(v_notes->'lines') = 'object' THEN v_notes->'lines'->>substr(v_key, 6) END
            ELSE v_notes->>v_key END, '');
        -- Шугам, чатын тэмдэглэлийг тайлан зайг нь шахаж харуулдаг тул тэр хэлбэрээр харьцуулна.
        IF ((CASE WHEN v_key = 'general' THEN v_current_text ELSE btrim(regexp_replace(v_current_text, '\s+', ' ', 'g')) END)
            IS DISTINCT FROM (CASE WHEN v_key = 'general' THEN coalesce(v_note->>'expected', '')
                ELSE btrim(regexp_replace(coalesce(v_note->>'expected', ''), '\s+', ' ', 'g')) END)) THEN
            v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('kind', 'note',
                'key', v_key, 'current', v_current_text));
        END IF;
    END LOOP;
    IF jsonb_array_length(v_conflicts) > 0 THEN
        RETURN jsonb_build_object('ok', false, 'conflicts', v_conflicts);
    END IF;

    -- Тоо: өөрчлөгдсөн нүд бүрт бичилт + түүх; өөрчлөгдөөгүй нүдэд юу ч бичихгүй.
    FOR v_cell IN SELECT value FROM jsonb_array_elements(v_cells) LOOP
        v_manager := v_cell->>'manager';
        v_metric := v_cell->>'metric';
        v_value := (v_cell->>'value')::numeric::integer;
        SELECT value INTO v_current FROM public.daily_report_counts
        WHERE shop_id = p_shop_id AND report_date = p_date AND manager_name = v_manager AND metric = v_metric;
        CONTINUE WHEN v_value IS NOT DISTINCT FROM v_current;
        IF v_value IS NULL THEN
            DELETE FROM public.daily_report_counts
            WHERE shop_id = p_shop_id AND report_date = p_date AND manager_name = v_manager AND metric = v_metric;
        ELSE
            INSERT INTO public.daily_report_counts(shop_id, report_date, manager_name, metric, value, updated_by, updated_by_name, updated_at)
            VALUES (p_shop_id, p_date, v_manager, v_metric, v_value, p_user_id, p_user_name, v_now)
            ON CONFLICT (shop_id, report_date, manager_name, metric) DO UPDATE
                SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
                    updated_by_name = EXCLUDED.updated_by_name, updated_at = EXCLUDED.updated_at;
        END IF;
        INSERT INTO public.daily_report_changes(shop_id, report_date, kind, manager_name, metric, old_value, new_value,
            restored_from, changed_by, changed_by_name, changed_at)
        VALUES (p_shop_id, p_date, 'count', v_manager, v_metric, v_current, v_value,
            p_restored_from, p_user_id, p_user_name, v_now);
        v_changes := v_changes + 1;
    END LOOP;

    -- Тэмдэглэл: илгээсэн түлхүүр бүрийг тусад нь нэгтгэнэ.
    FOR v_note IN SELECT value FROM jsonb_array_elements(v_notes_in) LOOP
        v_key := v_note->>'key';
        v_text := regexp_replace(v_note->>'value', '^\s+|\s+$', '', 'g');
        v_current_text := coalesce(CASE WHEN v_key LIKE 'line.%' THEN
                CASE WHEN jsonb_typeof(v_notes->'lines') = 'object' THEN v_notes->'lines'->>substr(v_key, 6) END
            ELSE v_notes->>v_key END, '');
        CONTINUE WHEN v_text = v_current_text OR (v_key <> 'general'
            AND btrim(regexp_replace(v_text, '\s+', ' ', 'g')) = btrim(regexp_replace(v_current_text, '\s+', ' ', 'g')));
        IF v_key LIKE 'line.%' THEN
            v_line := substr(v_key, 6);
            v_lines := CASE WHEN jsonb_typeof(v_notes->'lines') = 'object' THEN v_notes->'lines' ELSE '{}'::jsonb END;
            v_lines := CASE WHEN v_text = '' THEN v_lines - v_line ELSE v_lines || jsonb_build_object(v_line, v_text) END;
            v_notes := CASE WHEN v_lines = '{}'::jsonb THEN v_notes - 'lines' ELSE v_notes || jsonb_build_object('lines', v_lines) END;
        ELSE
            v_notes := CASE WHEN v_text = '' THEN v_notes - v_key ELSE v_notes || jsonb_build_object(v_key, v_text) END;
        END IF;
        INSERT INTO public.daily_report_changes(shop_id, report_date, kind, note_key, old_text, new_text,
            restored_from, changed_by, changed_by_name, changed_at)
        VALUES (p_shop_id, p_date, 'note', v_key, nullif(v_current_text, ''), nullif(v_text, ''),
            p_restored_from, p_user_id, p_user_name, v_now);
        v_changes := v_changes + 1;
        v_report_changed := true;
    END LOOP;

    -- Баталгаажуулалт («Тайлан хийж гүйцэтгэсэн»).
    IF p_complete IS TRUE THEN
        INSERT INTO public.daily_report_changes(shop_id, report_date, kind, old_text, new_text, changed_by, changed_by_name, changed_at)
        VALUES (p_shop_id, p_date, 'complete', CASE WHEN v_completed_at IS NOT NULL THEN v_completed_by_name END,
            p_user_name, p_user_id, p_user_name, v_now);
        v_completed_by := p_user_id;
        v_completed_by_name := p_user_name;
        v_completed_at := v_now;
        v_changes := v_changes + 1;
        v_report_changed := true;
    ELSIF p_complete IS FALSE AND v_completed_at IS NOT NULL THEN
        INSERT INTO public.daily_report_changes(shop_id, report_date, kind, old_text, new_text, changed_by, changed_by_name, changed_at)
        VALUES (p_shop_id, p_date, 'complete', v_completed_by_name, NULL, p_user_id, p_user_name, v_now);
        v_completed_by := NULL;
        v_completed_by_name := NULL;
        v_completed_at := NULL;
        v_changes := v_changes + 1;
        v_report_changed := true;
    END IF;

    IF v_report_changed THEN
        INSERT INTO public.daily_reports(shop_id, report_date, notes, completed_by, completed_by_name, completed_at, updated_by, updated_at)
        VALUES (p_shop_id, p_date, v_notes, v_completed_by, v_completed_by_name, v_completed_at, p_user_id, v_now)
        ON CONFLICT (shop_id, report_date) DO UPDATE
            SET notes = EXCLUDED.notes, completed_by = EXCLUDED.completed_by,
                completed_by_name = EXCLUDED.completed_by_name, completed_at = EXCLUDED.completed_at,
                updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
    END IF;

    RETURN jsonb_build_object('ok', true, 'changes', v_changes);
END;
$$;

-- Ээлжийн менежер (эсвэл байгууллагын хэрэглэгч) хамт олныхоо БОЛСОН уулзалтыг тухайн менежерийн нэр дээр
-- бүртгэнэ. Лид өгөөгүй бол тухайн менежерийн нэр дээр шинэ лид үүснэ (өөрийн нэр дээр давхар лид үүсэхгүй).
-- p_actor_project_ids NULL = байгууллагын хэрэглэгч (API шалгасан); үгүй бол бүртгэлтэй менежер.
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
                'agent_notes', 'customer_feedback', 'interest_level', 'customer_label'))
        OR jsonb_typeof(p_input->'project_id') IS DISTINCT FROM 'string'
        OR jsonb_typeof(p_input->'scheduled_at') IS DISTINCT FROM 'string'
        OR EXISTS (SELECT 1 FROM jsonb_each(p_input) AS fields(key, value)
            WHERE (key IN ('lead_id', 'customer_name', 'customer_phone', 'meeting_type', 'agent_notes', 'customer_feedback', 'customer_label')
                AND jsonb_typeof(value) NOT IN ('string', 'null'))
            OR (key = 'interest_level' AND jsonb_typeof(value) NOT IN ('number', 'null'))) THEN
        RAISE EXCEPTION 'Уулзалтын мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF (p_input->>'project_id') !~ v_uuid
        OR (p_input->>'lead_id' IS NOT NULL AND (p_input->>'lead_id') !~ v_uuid)
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
        agent_notes, customer_feedback, interest_level, sales_manager_name, interests)
    VALUES (p_shop_id, v_lead.id, NULL, v_scheduled_at, 'completed', v_now, v_meeting_type,
        p_input->>'agent_notes', p_input->>'customer_feedback', v_interest, p_manager_name, '[]'::jsonb)
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

-- Тухайн өдрийн товлосон уулзалтыг «Болсон» / «Ирээгүй» болгоно. Уулзалт тооцогдох менежер өөрчлөгдөхгүй.
-- p_day_start/p_day_end = тайлангийн өдрийн (Улаанбаатар) хязгаар.
CREATE OR REPLACE FUNCTION public.complete_daily_report_meeting(
    p_shop_id uuid,
    p_user_id uuid,
    p_actor_name text,
    p_actor_project_ids uuid[],
    p_viewing_id uuid,
    p_status text,
    p_input jsonb,
    p_report_date date,
    p_day_start timestamptz,
    p_day_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    v_input jsonb := CASE WHEN jsonb_typeof(p_input) IS DISTINCT FROM 'null' THEN coalesce(p_input, '{}'::jsonb) ELSE '{}'::jsonb END;
    v_restricted boolean := p_actor_project_ids IS NOT NULL;
    v_now timestamptz := now();
    v_num numeric;
    v_lead_id uuid;
    v_lead public.leads%ROWTYPE;
    v_viewing public.property_viewings%ROWTYPE;
    v_interest integer;
    v_feedback text;
    v_content text;
    v_self boolean;
BEGIN
    IF v_restricted AND (p_user_id IS NULL OR p_actor_name IS NULL OR cardinality(p_actor_project_ids) = 0) THEN
        RAISE EXCEPTION 'Уулзалт бүртгэх эрхгүй' USING ERRCODE = 'P0002';
    END IF;
    IF p_shop_id IS NULL OR p_viewing_id IS NULL OR p_report_date IS NULL
        OR nullif(btrim(p_actor_name), '') IS NULL OR char_length(p_actor_name) > 120
        OR p_status IS NULL OR p_status NOT IN ('completed', 'no_show')
        OR p_day_start IS NULL OR p_day_end IS NULL OR NOT isfinite(p_day_start) OR NOT isfinite(p_day_end)
        OR p_day_end <= p_day_start OR p_day_end - p_day_start > interval '1 day'
        OR (p_day_start AT TIME ZONE 'Asia/Ulaanbaatar')::date <> p_report_date
        OR jsonb_typeof(v_input) <> 'object' THEN
        RAISE EXCEPTION 'Уулзалтын мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_input) AS fields(key) WHERE key NOT IN ('interest_level', 'customer_feedback'))
        OR (v_input ? 'interest_level' AND jsonb_typeof(v_input->'interest_level') NOT IN ('number', 'null'))
        OR (v_input ? 'customer_feedback' AND (jsonb_typeof(v_input->'customer_feedback') NOT IN ('string', 'null')
            OR char_length(coalesce(v_input->>'customer_feedback', '')) > 4000)) THEN
        RAISE EXCEPTION 'Уулзалтын мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_input->'interest_level') = 'number' THEN
        v_num := (v_input->>'interest_level')::numeric;
        IF v_num <> trunc(v_num) OR v_num < 1 OR v_num > 5 THEN
            RAISE EXCEPTION 'Сонирхлын түвшин буруу байна' USING ERRCODE = '22023';
        END IF;
    END IF;

    SELECT lead_id INTO v_lead_id FROM public.property_viewings
    WHERE id = p_viewing_id AND shop_id = p_shop_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002'; END IF;

    -- Бусад уулзалтын RPC-тэй адил лидийг эхэлж түгжинэ (deadlock-оос сэргийлнэ).
    IF v_lead_id IS NOT NULL THEN
        SELECT * INTO v_lead FROM public.leads
        WHERE id = v_lead_id AND shop_id = p_shop_id AND deleted_at IS NULL
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002'; END IF;
    END IF;

    IF v_restricted THEN
        -- Хариуцагчгүй (claim pool) лид хариуцаж авах хүртэл зөвхөн уншигдана.
        IF v_lead_id IS NULL OR v_lead.project_id IS NULL OR NOT coalesce(v_lead.project_id = ANY(p_actor_project_ids), false)
            OR nullif(btrim(v_lead.sales_manager_name), '') IS NULL
            OR (SELECT count(*) FROM public.sales_managers WHERE shop_id = p_shop_id AND user_id = p_user_id) <> 1 THEN
            RAISE EXCEPTION 'Уулзалт бүртгэх эрхгүй' USING ERRCODE = 'P0002';
        END IF;
        PERFORM name FROM public.sales_managers
        WHERE shop_id = p_shop_id AND name = p_actor_name AND user_id = p_user_id AND is_active
        FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт бүртгэх эрхгүй' USING ERRCODE = 'P0002'; END IF;
        PERFORM project_id FROM public.sales_manager_projects
        WHERE shop_id = p_shop_id AND manager_name = p_actor_name AND project_id = v_lead.project_id
        FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт бүртгэх эрхгүй' USING ERRCODE = 'P0002'; END IF;
    END IF;

    -- Зөвхөн тухайн өдрийн, цаг нь болсон, товлосон уулзалт. Шалгалтын хооронд lead_id солигдсон бол бичихгүй.
    SELECT * INTO v_viewing FROM public.property_viewings
    WHERE id = p_viewing_id AND shop_id = p_shop_id AND lead_id IS NOT DISTINCT FROM v_lead_id AND deleted_at IS NULL
        AND status = 'scheduled' AND scheduled_at >= p_day_start AND scheduled_at < p_day_end
        AND scheduled_at <= v_now + interval '5 minutes'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002'; END IF;

    v_self := p_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.sales_managers
        WHERE shop_id = p_shop_id AND name = v_viewing.sales_manager_name AND user_id = p_user_id);
    v_interest := v_viewing.interest_level;
    v_feedback := v_viewing.customer_feedback;
    IF p_status = 'completed' THEN
        IF v_input ? 'interest_level' THEN v_interest := (v_input->>'interest_level')::numeric::integer; END IF;
        IF v_input ? 'customer_feedback' THEN v_feedback := v_input->>'customer_feedback'; END IF;
    END IF;
    UPDATE public.property_viewings SET status = p_status,
        completed_at = CASE WHEN p_status = 'completed' THEN v_now ELSE NULL END,
        interest_level = v_interest, customer_feedback = v_feedback
    WHERE id = p_viewing_id AND shop_id = p_shop_id;

    IF v_lead_id IS NOT NULL THEN
        UPDATE public.leads SET updated_at = v_now,
            last_contact_at = CASE WHEN p_status = 'completed' THEN v_now ELSE last_contact_at END,
            viewing_scheduled_at = CASE WHEN p_status = 'no_show' THEN NULL ELSE viewing_scheduled_at END,
            status = CASE WHEN p_status = 'no_show' AND status = 'viewing_scheduled' THEN 'contacted' ELSE status END
        WHERE id = v_lead_id AND shop_id = p_shop_id;
        v_content := CASE WHEN p_status = 'completed' THEN 'Уулзалт болов'
                || CASE WHEN v_interest IS NOT NULL THEN ' · сонирхол ' || v_interest || '/5' ELSE '' END
                || CASE WHEN nullif(v_feedback, '') IS NOT NULL THEN ' · ' || v_feedback ELSE '' END
            ELSE 'Уулзалтад ирээгүй' END
            || CASE WHEN NOT v_self THEN ' (' || p_actor_name || ' бүртгэв)' ELSE '' END;
        INSERT INTO public.lead_activities(shop_id, lead_id, type, content, meta, created_by, created_by_name)
        VALUES (p_shop_id, v_lead_id, 'meeting', v_content,
            jsonb_build_object('viewing_id', p_viewing_id, 'status', p_status, 'scheduled_at', v_viewing.scheduled_at, 'via', 'daily_report'),
            p_user_id, p_actor_name);
    END IF;

    INSERT INTO public.daily_report_changes(shop_id, report_date, kind, manager_name, viewing_id, old_text, new_text, meta,
        changed_by, changed_by_name, changed_at)
    VALUES (p_shop_id, p_report_date, 'meeting', left(nullif(btrim(v_viewing.sales_manager_name), ''), 120), p_viewing_id,
        'Товлосон', CASE WHEN p_status = 'completed' THEN 'Болсон' ELSE 'Ирээгүй' END,
        jsonb_build_object('action', CASE WHEN p_status = 'completed' THEN 'complete' ELSE 'no_show' END),
        p_user_id, p_actor_name, v_now);

    RETURN jsonb_build_object('viewing_id', p_viewing_id, 'status', p_status);
END;
$$;

-- Админ: уулзалтыг аль менежерт тооцохыг засна (эрхийг API шалгана). Лидийн хариуцагч өөрчлөгдөхгүй.
CREATE OR REPLACE FUNCTION public.reassign_daily_report_meeting(
    p_shop_id uuid,
    p_user_id uuid,
    p_actor_name text,
    p_viewing_id uuid,
    p_manager_name text,
    p_report_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    v_lead_id uuid;
    v_lead public.leads%ROWTYPE;
    v_viewing public.property_viewings%ROWTYPE;
    v_project_id uuid;
    v_old text;
    v_now timestamptz := now();
BEGIN
    IF p_shop_id IS NULL OR p_viewing_id IS NULL OR p_report_date IS NULL OR p_manager_name IS NULL
        OR p_manager_name <> btrim(p_manager_name) OR char_length(p_manager_name) NOT BETWEEN 1 AND 120
        OR nullif(btrim(p_actor_name), '') IS NULL OR char_length(p_actor_name) > 120 THEN
        RAISE EXCEPTION 'Уулзалтын мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;

    SELECT lead_id INTO v_lead_id FROM public.property_viewings
    WHERE id = p_viewing_id AND shop_id = p_shop_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002'; END IF;
    IF v_lead_id IS NOT NULL THEN
        SELECT * INTO v_lead FROM public.leads WHERE id = v_lead_id AND shop_id = p_shop_id FOR UPDATE;
    END IF;
    -- Тухайн өдрийн тайланд харагдах уулзалт (Улаанбаатарын өдөр).
    SELECT * INTO v_viewing FROM public.property_viewings
    WHERE id = p_viewing_id AND shop_id = p_shop_id AND lead_id IS NOT DISTINCT FROM v_lead_id AND deleted_at IS NULL
        AND (scheduled_at AT TIME ZONE 'Asia/Ulaanbaatar')::date = p_report_date
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Уулзалт олдсонгүй' USING ERRCODE = 'P0002'; END IF;

    v_project_id := v_lead.project_id;
    IF v_project_id IS NULL THEN
        SELECT CASE WHEN count(*) = 1 THEN (array_agg(id))[1] END INTO v_project_id
        FROM public.projects WHERE shop_id = p_shop_id;
        IF v_project_id IS NULL THEN
            RAISE EXCEPTION 'Уулзалтын төслийг тодорхойлж чадсангүй' USING ERRCODE = '22023';
        END IF;
    END IF;

    PERFORM name FROM public.sales_managers
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

    v_old := v_viewing.sales_manager_name;
    IF v_old IS NOT DISTINCT FROM p_manager_name THEN
        RETURN jsonb_build_object('viewing_id', p_viewing_id, 'changed', false);
    END IF;

    UPDATE public.property_viewings SET sales_manager_name = p_manager_name
    WHERE id = p_viewing_id AND shop_id = p_shop_id;

    IF v_lead.id IS NOT NULL THEN
        INSERT INTO public.lead_activities(shop_id, lead_id, type, content, meta, created_by, created_by_name)
        VALUES (p_shop_id, v_lead.id, 'meeting',
            'Уулзалтын менежер: ' || coalesce(nullif(btrim(v_old), ''), '—') || ' → ' || p_manager_name,
            jsonb_build_object('viewing_id', p_viewing_id, 'from', v_old, 'to', p_manager_name, 'via', 'daily_report'),
            p_user_id, p_actor_name);
    END IF;

    INSERT INTO public.daily_report_changes(shop_id, report_date, kind, manager_name, viewing_id, old_text, new_text, meta,
        changed_by, changed_by_name, changed_at)
    VALUES (p_shop_id, p_report_date, 'meeting', p_manager_name, p_viewing_id, left(nullif(btrim(v_old), ''), 500), p_manager_name,
        jsonb_build_object('action', 'reassign'), p_user_id, p_actor_name, v_now);

    RETURN jsonb_build_object('viewing_id', p_viewing_id, 'changed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_daily_report(uuid, date, uuid, text, jsonb, jsonb, boolean, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_daily_report(uuid, date, uuid, text, jsonb, jsonb, boolean, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.record_daily_report_meeting(uuid, uuid, text, uuid[], text, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_report_meeting(uuid, uuid, text, uuid[], text, date, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.complete_daily_report_meeting(uuid, uuid, text, uuid[], uuid, text, jsonb, date, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_daily_report_meeting(uuid, uuid, text, uuid[], uuid, text, jsonb, date, timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.reassign_daily_report_meeting(uuid, uuid, text, uuid, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_daily_report_meeting(uuid, uuid, text, uuid, text, date) TO service_role;
