-- ============================================================
-- Vertmon Hub — AI ажлын орчны суурь (Work OS foundation)
-- 2026-08-22
-- ============================================================
-- Энэ миграци docs/AI-FIRST-WORK-OS-PLAN.md-ийн Фаз 0/1/3-ын схемийн
-- шаардлагыг хангана:
--   1) Лид→гэрээ триггер менежерийн нэрийг бичдэггүй БЛОКЕРЫГ засах + backfill
--   2) activity_log — үйл ажиллагааны цорын ганц бүртгэл (append-only)
--   3) property_viewings — уулзалтын үр дүн (мөчлөгийг хаах)
--   4) user_tasks — оноож болдог ажил (assignee_id / assigned_by / priority)
--   5) ai_audit_log — RLS асаалттай мөртлөө policy байхгүйг засах
--   6) work_anomalies — хяналтын давхаргын анхааруулга
-- Бүх алхам ДАХИН АЖИЛЛУУЛАХАД АЮУЛГҮЙ (idempotent).


-- ============================================================
-- 1) Лид «closed_won» болоход үүсэх гэрээ менежерийн нэргүй үүсдэгийг засах
-- ============================================================
-- Өмнө нь INSERT-ийн баганын жагсаалтад sales_manager БАЙГААГҮЙ тул хаасан
-- гэрээ manager_performance / manager_monthly_sales харагдацуудаас (эдгээр нь
-- sales_manager-ээр бүлэглэдэг) бүрмөсөн унадаг байв. Үүний улмаас менежер
-- өөрийн хаасан борлуулалтаа «Миний самбар» дээрээ ч, удирдлага нь багийн
-- харагдац дээрээ ч харж чаддаггүй байсан.
-- Мөн total_price := conversion_value нь ихэвчлэн NULL байдаг тул budget_max
-- руу уналаа (0 биш — тайлангийн дүн худал өсгөхгүй).

CREATE OR REPLACE FUNCTION create_contract_on_lead_won()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'closed_won' AND (OLD.status IS DISTINCT FROM 'closed_won') THEN
        IF NEW.converted_at IS NULL THEN
            NEW.converted_at := NOW();
        END IF;

        IF NOT EXISTS (SELECT 1 FROM property_contracts WHERE lead_id = NEW.id) THEN
            INSERT INTO property_contracts (
                shop_id, lead_id, customer_id, product_type, contract_status,
                customer_name, customer_phone, total_price, contract_date,
                sales_channel, sales_manager
            ) VALUES (
                NEW.shop_id, NEW.id, NEW.customer_id, 'residential', 'active',
                NEW.customer_name, NEW.customer_phone,
                COALESCE(NEW.conversion_value, NEW.budget_max),
                CURRENT_DATE, 'ПРОПЕРТИС',
                NULLIF(TRIM(COALESCE(NEW.sales_manager_name, '')), '')
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_lead_won_create_contract ON leads;
CREATE TRIGGER trg_lead_won_create_contract
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION create_contract_on_lead_won();

-- Backfill: аль хэдийн үүссэн, эзэнгүй үлдсэн гэрээнүүдийг лидийнх нь
-- менежер рүү буцааж холбоно (зөвхөн хоосон талбарыг дүүргэнэ — гараар
-- оруулсан утгыг ХЭЗЭЭ Ч дарж бичихгүй).
UPDATE property_contracts c
   SET sales_manager = NULLIF(TRIM(l.sales_manager_name), '')
  FROM leads l
 WHERE c.lead_id = l.id
   AND NULLIF(TRIM(COALESCE(c.sales_manager, '')), '') IS NULL
   AND NULLIF(TRIM(COALESCE(l.sales_manager_name, '')), '') IS NOT NULL;

UPDATE property_contracts c
   SET total_price = COALESCE(l.conversion_value, l.budget_max)
  FROM leads l
 WHERE c.lead_id = l.id
   AND COALESCE(c.total_price, 0) = 0
   AND COALESCE(l.conversion_value, l.budget_max) IS NOT NULL;


-- ============================================================
-- 2) activity_log — үйл ажиллагааны цорын ганц бүртгэл
-- ============================================================
-- Одоог хүртэл систем ЗӨВХӨН ҮР ДҮНГ (гэрээ, орлого) бүртгэдэг байсан тул
-- «Болд өчигдөр юу хийсэн бэ?» гэдэгт хариулах өгөгдөл байхгүй байв.
-- Append-only: UPDATE/DELETE policy ЗОРИУД үүсгээгүй.

CREATE TABLE IF NOT EXISTS activity_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id      uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    actor_id     uuid,          -- auth.users.id — үнэний эх сурвалж
    actor_name   text,          -- каноник roster нэр (харуулах хуулбар)
    entity_type  text NOT NULL CHECK (entity_type IN
                    ('lead','customer','viewing','contract','property','unit','task')),
    entity_id    uuid,
    kind         text NOT NULL CHECK (kind IN
                    ('call','sms','messenger','meeting','viewing','note','status_change',
                     'assign','create','update','delete','message_sent')),
    direction    text CHECK (direction IN ('out','in')),
    outcome      text CHECK (outcome IN
                    ('connected','no_answer','busy','wrong_number','scheduled','n/a')),
    body         text,
    duration_sec int,
    source       text NOT NULL DEFAULT 'ui' CHECK (source IN ('ui','ai','webhook','import','cron')),
    payload      jsonb,
    occurred_at  timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_activity_shop_actor
    ON activity_log (shop_id, actor_name, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_entity
    ON activity_log (shop_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_shop_time
    ON activity_log (shop_id, occurred_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Унших: тухайн shop-ийн гишүүн (багийн харагдацыг API давхар шүүнэ).
DROP POLICY IF EXISTS activity_log_read ON activity_log;
CREATE POLICY activity_log_read ON activity_log FOR SELECT
    USING (
        shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
            UNION
            SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
        )
    );

-- Бичих: зөвхөн service_role (бүх бичилт сервер route-аар явна).
DROP POLICY IF EXISTS activity_log_service_write ON activity_log;
CREATE POLICY activity_log_service_write ON activity_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE activity_log IS
    'Үйл ажиллагааны append-only бүртгэл: хэн · юуг · хэзээ. Хяналтын давхаргын өгөгдлийн эх сурвалж';


-- ============================================================
-- 3) Уулзалтын мөчлөг — индекс (схем аль хэдийн хангалттай)
-- ============================================================
-- ЗАСВАР: анхны төлөвлөгөө outcome/outcome_note/completed_at багана нэмэхээр
-- байсан ч кодыг шалгахад property_viewings-д ЭДГЭЭР АЛЬ ХЭДИЙН БАЙНА:
--   status (scheduled|completed|cancelled|no_show), completed_at,
--   customer_feedback, agent_notes, interest_level (1-5).
-- Тиймээс жинхэнэ дутагдал нь СХЕМ биш — уулзалтыг дүгнэх API/tool байхгүй
-- явдал байв (Фаз 1-д нэмэгдэнэ). Давхардсан багана нэмэхгүй.
-- Энд зөвхөн менежерийн хуваарийн хайлтад шаардлагатай индекс нэмнэ.

CREATE INDEX IF NOT EXISTS idx_viewings_manager_time
    ON property_viewings (shop_id, sales_manager_name, scheduled_at);

-- ============================================================
-- 4) user_tasks — оноож болдог ажил
-- ============================================================
-- ⚠ ИНВАРИАНТ ӨӨРЧЛӨГДӨЖ БАЙНА: user_tasks нь өмнө нь ХАТУУ ХУВИЙН байсан.
-- Одооноос удирдлага ажил онооно, тиймээс RLS нь «эзэн ЭСВЭЛ оноогч» болно.

ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS assignee_id uuid;
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS assigned_by uuid;
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS priority    text DEFAULT 'normal';
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS entity_id   uuid;

-- Хуучин мөрүүд: эзэн нь өөрөө
UPDATE user_tasks SET assignee_id = user_id WHERE assignee_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_tasks_priority_check') THEN
        ALTER TABLE user_tasks ADD CONSTRAINT user_tasks_priority_check
            CHECK (priority IN ('low','normal','high'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_tasks_entity_type_check') THEN
        ALTER TABLE user_tasks ADD CONSTRAINT user_tasks_entity_type_check
            CHECK (entity_type IS NULL OR entity_type IN ('lead','viewing','contract','customer'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_tasks_assignee
    ON user_tasks (shop_id, assignee_id, due_at) WHERE deleted_at IS NULL;

-- RLS-ийг «эзэн ЭСВЭЛ оноогч» болгож солино
DROP POLICY IF EXISTS user_tasks_self_access ON user_tasks;
DROP POLICY IF EXISTS user_tasks_access ON user_tasks;
CREATE POLICY user_tasks_access ON user_tasks FOR ALL
    USING (
        (COALESCE(assignee_id, user_id) = auth.uid() OR assigned_by = auth.uid())
        AND shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
            UNION
            SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        (COALESCE(assignee_id, user_id) = auth.uid() OR assigned_by = auth.uid())
        AND shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
            UNION
            SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
        )
    );


-- ============================================================
-- 5) ai_audit_log — RLS асаалттай мөртлөө policy БАЙХГҮЙ байсан
-- ============================================================
-- Ингэснээр хэрэглэгчийн клиентээс огт уншигдахгүй байв (зөвхөн service_role).
DROP POLICY IF EXISTS ai_audit_log_read ON ai_audit_log;
CREATE POLICY ai_audit_log_read ON ai_audit_log FOR SELECT
    USING (
        shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
            UNION
            SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS ai_audit_log_service_write ON ai_audit_log;
CREATE POLICY ai_audit_log_service_write ON ai_audit_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');


-- ============================================================
-- 6) work_anomalies — хяналтын давхаргын анхааруулга
-- ============================================================
CREATE TABLE IF NOT EXISTS work_anomalies (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id      uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    -- NOT NULL DEFAULT '': давхардлаас сэргийлэх unique index нь ЖИРИЙН
    -- баганууд дээр байх ёстой. Илэрхийлэлт (COALESCE(...)) индекстэй бол
    -- PostgREST-ийн `onConflict: 'shop_id,manager_name,...'` таарахгүй бөгөөд
    -- "no unique or exclusion constraint matching the ON CONFLICT
    -- specification" алдаа өгч upsert бүр унана. Мөн SQL-д NULL-ууд хоорондоо
    -- ялгаатай тул NULL manager_name давхардлыг зогсоохгүй.
    -- '' = «менежерт хамаарахгүй» (жишээ: эзэнгүй лийд).
    manager_name text NOT NULL DEFAULT '',
    kind         text NOT NULL CHECK (kind IN
                    ('no_activity','cold_lead','overdue_followup','unassigned_lead',
                     'target_risk','overdue_contract','stale_viewing')),
    severity     text NOT NULL DEFAULT 'warn' CHECK (severity IN ('info','warn','critical')),
    detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
    detected_on  date NOT NULL DEFAULT CURRENT_DATE,
    resolved_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Нэг өдөрт нэг менежерийн нэг төрлийн аномали НЭГ л удаа
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_anomalies_daily
    ON work_anomalies (shop_id, manager_name, kind, detected_on);
CREATE INDEX IF NOT EXISTS idx_work_anomalies_open
    ON work_anomalies (shop_id, detected_on DESC) WHERE resolved_at IS NULL;

ALTER TABLE work_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_anomalies_read ON work_anomalies;
CREATE POLICY work_anomalies_read ON work_anomalies FOR SELECT
    USING (
        shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
            UNION
            SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS work_anomalies_service_write ON work_anomalies;
CREATE POLICY work_anomalies_service_write ON work_anomalies FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE work_anomalies IS
    'Хяналтын анхааруулга: идэвхгүй менежер, хүйтэн лид, зорилтын эрсдэл (cron: /api/cron/anomaly-watch)';


-- ============================================================
-- 7) Лидийн дагалтын индекс (next_followup_at одоо бичигдэнэ)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leads_next_followup
    ON leads (shop_id, next_followup_at)
    WHERE next_followup_at IS NOT NULL;
