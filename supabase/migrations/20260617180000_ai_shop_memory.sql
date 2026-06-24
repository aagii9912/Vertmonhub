-- AI Orchestrator: per-shop long-term memory (key-value facts the AI learns)
-- Орчестратор дэлгүүрийн талаар сурсан баримтуудыг ярианаас үл хамааран санана.

CREATE TABLE IF NOT EXISTS ai_shop_memory (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    key         text NOT NULL,
    value       text NOT NULL,
    created_by  text,
    updated_at  timestamptz DEFAULT now(),
    UNIQUE (shop_id, key)
);

CREATE INDEX IF NOT EXISTS idx_ai_shop_memory_shop ON ai_shop_memory (shop_id, updated_at DESC);

ALTER TABLE ai_shop_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_shop_memory_shop_access ON ai_shop_memory;
CREATE POLICY ai_shop_memory_shop_access ON ai_shop_memory FOR ALL
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

COMMENT ON TABLE ai_shop_memory IS 'Orchestrator: per-shop long-term key-value memory';
