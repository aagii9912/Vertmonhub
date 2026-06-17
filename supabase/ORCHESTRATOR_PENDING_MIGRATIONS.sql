-- =============================================================================
-- AI Orchestrator — хүлээгдэж буй бүх migration (нэг дор ажиллуулах)
-- Supabase Dashboard → SQL Editor дээр бүгдийг хуулж тавиад RUN дарна.
-- Бүх мэдэгдэл IF NOT EXISTS / DROP IF EXISTS тул дахин ажиллуулахад аюулгүй.
-- =============================================================================

-- 1) 20260616150000 — orchestrator trace (ai_messages)
ALTER TABLE ai_messages
    ADD COLUMN IF NOT EXISTS agents_used jsonb,
    ADD COLUMN IF NOT EXISTS trace jsonb;

-- 2) 20260617100000 — leads soft-delete
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads (shop_id, deleted_at);

-- 3) 20260617120000 — sales-manager attribution + soft-delete
ALTER TABLE leads             ADD COLUMN IF NOT EXISTS sales_manager_name TEXT;
ALTER TABLE property_viewings ADD COLUMN IF NOT EXISTS sales_manager_name TEXT;
ALTER TABLE customers         ADD COLUMN IF NOT EXISTS sales_manager_name TEXT;
ALTER TABLE property_viewings  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE property_contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE customers          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_property_viewings_deleted_at  ON property_viewings  (shop_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_property_contracts_deleted_at ON property_contracts (shop_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at          ON customers          (shop_id, deleted_at);

-- 4) 20260617140000 — ai_attachments (файл хавсралт)
CREATE TABLE IF NOT EXISTS ai_attachments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    entity_type text NOT NULL,
    entity_id   uuid NOT NULL,
    url         text NOT NULL,
    file_name   text,
    mime_type   text,
    uploaded_by text,
    created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_attachments_entity ON ai_attachments (shop_id, entity_type, entity_id);
ALTER TABLE ai_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_attachments_shop_access ON ai_attachments;
CREATE POLICY ai_attachments_shop_access ON ai_attachments FOR ALL
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

-- =============================================================================
-- ШАЛГАХ (заавал биш): доорхийг ажиллуулж багана/хүснэгт орсон эсэхийг харна
-- =============================================================================
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE (table_name='ai_messages'      AND column_name IN ('agents_used','trace'))
--     OR (table_name='leads'            AND column_name IN ('deleted_at','sales_manager_name'))
--     OR (table_name='property_viewings'AND column_name IN ('deleted_at','sales_manager_name'))
--     OR (table_name='property_contracts'AND column_name='deleted_at')
--     OR (table_name='customers'        AND column_name IN ('deleted_at','sales_manager_name'))
--  ORDER BY table_name, column_name;
-- SELECT to_regclass('public.ai_attachments') AS ai_attachments_exists;
