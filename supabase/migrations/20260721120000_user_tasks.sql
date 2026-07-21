-- ============================================================
-- Хувийн ажлын жагсаалт (user_tasks) — 2026-07-21
-- ============================================================
-- Хэрэглэгч бүр өөрийн хийх ажлаа чөлөөт форматаар бүртгэж, сануулга (push)
-- авна. Дууссан ажлууд нь сарын KPI тайланд «Хийсэн ажлууд» болж автоматаар
-- нэгтгэгдэнэ (/api/dashboard/kpi-report).
--
-- • note        — чөлөөт форматын тэмдэглэл (ямар ч бүтэцгүй текст)
-- • due_at      — дуусах хугацаа (сонголттой)
-- • remind_at   — сануулга илгээх цаг (cron: /api/cron/task-reminders)
-- • reminder_sent_at — давхардуулж илгээхээс сэргийлнэ; remind_at өөрчлөгдвөл
--   API null болгож дахин «зэвсэглүүлнэ»
-- • Устгал ЗӨӨЛӨН (deleted_at) — бусад CRM хүснэгтүүдтэй ижил жишиг

CREATE TABLE IF NOT EXISTS user_tasks (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id           uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title             text NOT NULL,
    note              text,
    due_at            timestamptz,
    remind_at         timestamptz,
    reminder_sent_at  timestamptz,
    status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    completed_at      timestamptz,
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now(),
    deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_tasks_user_shop_status
    ON user_tasks (user_id, shop_id, status);

-- Cron-ийн «илгээх ёстой сануулга» хайлтад зориулсан partial index
CREATE INDEX IF NOT EXISTS idx_user_tasks_due_reminders
    ON user_tasks (remind_at)
    WHERE reminder_sent_at IS NULL AND status = 'pending' AND deleted_at IS NULL;

-- updated_at триггер (20260701140000-ийн туслах функцыг дахин ашиглана)
DROP TRIGGER IF EXISTS trg_user_tasks_updated ON user_tasks;
CREATE TRIGGER trg_user_tasks_updated
    BEFORE UPDATE ON user_tasks
    FOR EACH ROW EXECUTE FUNCTION update_sales_targets_updated_at();

-- RLS: зөвхөн ӨӨРИЙН ажлууд + shop-ийн гишүүнчлэл (user_dashboard_prefs-ийн жишиг)
ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_tasks_self_access ON user_tasks;
CREATE POLICY user_tasks_self_access ON user_tasks FOR ALL
    USING (
        user_id = auth.uid()
        AND shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
            UNION
            SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
            UNION
            SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
        )
    );

COMMENT ON TABLE user_tasks IS 'Хувийн ажлын жагсаалт: чөлөөт форматын хийх ажил + сануулга (KPI тайланд автоматаар нэгтгэгдэнэ)';
