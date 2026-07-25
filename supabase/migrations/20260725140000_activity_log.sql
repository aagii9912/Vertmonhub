-- ============================================================
-- activity_log — нэгдсэн, өөрчлөгдөшгүй аудит мөр
-- ============================================================
-- АСУУДАЛ (аудит C-9, H-22..H-26): аудит 5 салангид хүснэгтэд тархсан
-- бөгөөд тус бүр өөр схемтэй байв:
--   data_audit_log    — shop+actor бий, before утга алга
--   admin_audit_log   — shop_id АЛГА (олон төсөлтэй үед ялгах боломжгүй)
--   finance_audit_log — actor АЛГА (мөнгөний үйлдлийг хэн хийснийг мэдэхгүй)
--   ai_audit_log      — зөвхөн tool+args
-- Аль нь ч before/after, IP, user-agent хадгалдаггүй бөгөөд 86 mutating
-- route-оос ердөө 5 нь л бичдэг байв (~6%).
--
-- Энэ хүснэгт нь гурван зорилгыг НЭГ ДОР хангана:
--   • удирдлагын хяналт  → actor_name/actor_role snapshot + summary
--   • өгөгдөл сэргээлт   → before/after (зөвхөн өөрчлөгдсөн талбарууд)
--   • аюулгүй байдал     → request_ip, user_agent, status='denied'
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ХЭН
    shop_id       UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    actor_id      UUID,
    actor_name    TEXT,          -- snapshot: хүн гарсан ч тайлан эвдэрхгүй
    actor_role    TEXT,          -- үйлдлийн үеийн дүр (snapshot)
    source        TEXT NOT NULL DEFAULT 'api',

    -- ЮУГ
    entity        TEXT NOT NULL,
    entity_id     TEXT,
    action        TEXT NOT NULL,
    summary       TEXT,          -- монголоор, хүн уншихуйц нэг мөр

    -- ЯАЖ ӨӨРЧЛӨГДСӨН
    before        JSONB,
    after         JSONB,

    -- ХААНААС
    request_ip    TEXT,
    user_agent    TEXT,
    request_id    TEXT,

    status        TEXT NOT NULL DEFAULT 'success',
    error_message TEXT,

    CONSTRAINT activity_log_source_chk
        CHECK (source IN ('ui', 'ai', 'cron', 'webhook', 'import', 'api')),
    CONSTRAINT activity_log_status_chk
        CHECK (status IN ('success', 'denied', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_activity_log_shop_time
    ON public.activity_log (shop_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity
    ON public.activity_log (entity, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor
    ON public.activity_log (actor_id, occurred_at DESC);
-- Аюулгүй байдлын самбар: эрх давсан оролдлого, амжилтгүй үйлдэл
CREATE INDEX IF NOT EXISTS idx_activity_log_problems
    ON public.activity_log (shop_id, status, occurred_at DESC)
    WHERE status <> 'success';

-- ============================================================
-- RLS — унших нь зөвхөн өөрийн төслийн мөр
-- ============================================================
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_log_read ON public.activity_log;
CREATE POLICY activity_log_read ON public.activity_log
    FOR SELECT
    USING (
        shop_id IN (SELECT shop_id FROM public.shop_members WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.shops s WHERE s.id = activity_log.shop_id AND s.user_id = auth.uid())
    );

-- INSERT/UPDATE/DELETE policy ЗОРИУДААР үүсгээгүй:
-- бичилт нь зөвхөн service-role-оор (logActivity) хийгдэнэ.
REVOKE INSERT, UPDATE, DELETE ON public.activity_log FROM anon, authenticated;

-- ============================================================
-- ӨӨРЧЛӨГДӨШГҮЙ (append-only)
-- ============================================================
-- Аудитын мөрийг өөрчилж/устгаж чаддаг бол аудит утгагүй. Энэ trigger нь
-- service-role-ыг ч зогсооно — өөрчлөх ганц зам нь migration-аар
-- trigger-ийг зориуд унтраах явдал бөгөөд тэр нь өөрөө ул мөр үлдээнэ.
CREATE OR REPLACE FUNCTION public.activity_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'activity_log нь өөрчлөгдөшгүй (append-only): % үйлдэл зөвшөөрөгдөхгүй', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_log_immutable ON public.activity_log;
CREATE TRIGGER trg_activity_log_immutable
    BEFORE UPDATE OR DELETE ON public.activity_log
    FOR EACH ROW EXECUTE FUNCTION public.activity_log_immutable();

COMMENT ON TABLE public.activity_log IS
    'Нэгдсэн аудит мөр. Append-only — UPDATE/DELETE trigger-ээр хориглогдсон. Бичилт зөвхөн service-role (lib/audit/log.ts).';
