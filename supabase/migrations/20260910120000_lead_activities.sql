-- ============================================================
-- Лидийн үйл ажиллагааны түүх (timeline) — v2 «Лид» хажуугийн панел
--
-- • Тэмдэглэл, дуудлага, статусын өөрчлөлт, уулзалт, гэрээ, системийн үйлдэл
--   бүгд нэг хүснэгтэд, лид бүрээр цагийн дарааллаар.
-- • Статус/менежер өөрчлөлтийг API автоматаар бичнэ (meta: {from, to}).
-- • Устгахгүй (append-only). Лид зөөлөн устгагдвал хамт нуугдана.
-- • RLS: тухайн shop-ын гишүүд унших/бичих; service role бүрэн.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_activities (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id         uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    type            text NOT NULL CHECK (type IN ('note', 'call', 'status', 'manager', 'meeting', 'contract', 'system')),
    content         text,
    meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_created
    ON lead_activities (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activities_shop_created
    ON lead_activities (shop_id, created_at DESC);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_activities_shop_members ON lead_activities;
CREATE POLICY lead_activities_shop_members ON lead_activities FOR ALL
    USING (
        shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
            UNION
            SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
            UNION
            SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
        )
    );

COMMENT ON TABLE lead_activities IS 'Лидийн үйл ажиллагааны түүх (v2 timeline): note/call/status/manager/meeting/contract/system';
