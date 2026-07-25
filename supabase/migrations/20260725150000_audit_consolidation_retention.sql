-- ============================================================
-- Хуучин аудит сувгуудыг activity_log руу нэгтгэх + хадгалах хугацаа
-- ============================================================
-- Аудитаар илэрсэн C-9 / H-26: аудит 5 салангид хүснэгтэд тархсан, тус бүр
-- өөр схемтэй, 4-ийг нь UI-аас харах зам байхгүй байв. `activity_log` нь
-- одоо нэгдсэн суваг болсон тул хуучин өгөгдлийг НЭГ дор харах боломжтой
-- болгоно.
--
-- Хуучин хүснэгтүүдийг УСТГАХГҮЙ — зөвхөн унших архив болгож үлдээнэ.
-- (Аудитын түүхийг устгах нь өөрөө аудитын зарчмыг зөрчинө.)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Түүхэн өгөгдлийн нэгдсэн харагдац
-- ------------------------------------------------------------
-- Хуучин 4 суваг + шинэ activity_log-ийг нэг мөрийн бүтэц болгож нэгтгэнэ.
-- `security_invoker = on` — уншигчийн RLS хүчинтэй байна (миграци
-- 20260707130000-д тогтоосон конвенцын дагуу).
CREATE OR REPLACE VIEW public.audit_unified
WITH (security_invoker = on)
AS
    SELECT
        a.id,
        a.occurred_at,
        a.shop_id,
        a.actor_id,
        a.actor_name,
        a.actor_role,
        a.source,
        a.entity,
        a.entity_id,
        a.action,
        a.summary,
        a.before,
        a.after,
        a.status,
        'activity_log'::TEXT AS origin
    FROM public.activity_log a

    UNION ALL

    -- data_audit_log: shop + actor бий, before утга алга
    SELECT
        d.id,
        d.created_at AS occurred_at,
        d.shop_id,
        d.actor_id,
        NULL::TEXT AS actor_name,
        NULL::TEXT AS actor_role,
        'api'::TEXT AS source,
        d.entity,
        d.entity_id::TEXT,
        d.action,
        NULL::TEXT AS summary,
        NULL::JSONB AS before,
        d.changes AS after,
        'success'::TEXT AS status,
        'data_audit_log'::TEXT AS origin
    FROM public.data_audit_log d

    UNION ALL

    -- ai_audit_log: AI-ийн tool гүйцэтгэл
    SELECT
        ai.id,
        ai.created_at AS occurred_at,
        ai.shop_id,
        ai.user_id AS actor_id,
        NULL::TEXT, NULL::TEXT,
        'ai'::TEXT AS source,
        'ai_tool'::TEXT AS entity,
        ai.tool AS entity_id,
        ai.tool AS action,
        NULL::TEXT AS summary,
        NULL::JSONB AS before,
        ai.args AS after,
        CASE WHEN ai.success THEN 'success' ELSE 'error' END AS status,
        'ai_audit_log'::TEXT AS origin
    FROM public.ai_audit_log ai;

COMMENT ON VIEW public.audit_unified IS
    'Шинэ activity_log + хуучин data_audit_log/ai_audit_log-ийг нэг бүтцээр харуулна. Хуучин сувгууд нь зөвхөн унших архив.';

-- ------------------------------------------------------------
-- 2) Хадгалах хугацааны бодлого (24 сар)
-- ------------------------------------------------------------
-- Аудит хязгааргүй хуримтлагдвал хүснэгт хэт томроод хайлт удааширна.
-- 24 сар нь дотоод хяналт, маргаан таслахад хүрэлцээтэй хугацаа.
--
-- ЧУХАЛ: activity_log нь append-only (UPDATE/DELETE trigger-ээр хориотой)
-- тул цэвэрлэгээ нь trigger-ыг ТҮР унтраан ажиллах ёстой. Иймд зөвхөн
-- SECURITY DEFINER функцээр дамжуулан цэвэрлэнэ — гараас DELETE хийх
-- боломжгүй хэвээр.
CREATE OR REPLACE FUNCTION public.prune_activity_log(p_months INTEGER DEFAULT 24)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    IF p_months < 6 THEN
        RAISE EXCEPTION 'Хадгалах хугацаа 6 сараас багагүй байх ёстой (өгсөн: %)', p_months;
    END IF;

    ALTER TABLE public.activity_log DISABLE TRIGGER trg_activity_log_immutable;

    WITH removed AS (
        DELETE FROM public.activity_log
        WHERE occurred_at < NOW() - (p_months || ' months')::INTERVAL
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_deleted FROM removed;

    ALTER TABLE public.activity_log ENABLE TRIGGER trg_activity_log_immutable;

    -- Цэвэрлэгээ нь өөрөө ул мөр үлдээнэ
    INSERT INTO public.activity_log (entity, action, summary, after, source)
    VALUES (
        'activity_log', 'prune',
        format('Аудитын архив цэвэрлэв: %s мөр (%s сараас өмнөх)', v_deleted, p_months),
        jsonb_build_object('deleted', v_deleted, 'months', p_months),
        'cron'
    );

    RETURN v_deleted;
EXCEPTION WHEN OTHERS THEN
    -- Алдаа гарсан ч trigger-ыг заавал сэргээнэ
    BEGIN
        ALTER TABLE public.activity_log ENABLE TRIGGER trg_activity_log_immutable;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_activity_log(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_activity_log(INTEGER) FROM anon, authenticated;

COMMENT ON FUNCTION public.prune_activity_log(INTEGER) IS
    'Аудитын архивыг цэвэрлэнэ (дефолт 24 сар). Append-only trigger-ыг түр унтраадаг тул зөвхөн service-role дуудна.';
