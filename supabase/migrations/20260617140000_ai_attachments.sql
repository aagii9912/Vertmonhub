-- AI Orchestrator: file attachments linked to CRM/sales entities.
-- Хэрэглэгч чатад файл хавсаргахад AI түүнийг тодорхой бичлэгт (байр/лийд/харилцагч/гэрээ)
-- холбож хадгална. Байрны зургийг properties.images[]-д давхар нэмнэ.

CREATE TABLE IF NOT EXISTS ai_attachments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    entity_type text NOT NULL,            -- property | lead | customer | contract
    entity_id   uuid NOT NULL,
    url         text NOT NULL,
    file_name   text,
    mime_type   text,
    uploaded_by text,                     -- борлуулалтын менежерийн нэр
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_attachments_entity ON ai_attachments (shop_id, entity_type, entity_id);

ALTER TABLE ai_attachments ENABLE ROW LEVEL SECURITY;

-- Хэрэглэгч зөвхөн өөрийн хандах эрхтэй shop-ийн хавсралтыг харна/удирдана.
-- (Сервер талын service-role RLS-г алгасдаг тул энэ нь нэмэлт хамгаалалт.)
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

COMMENT ON TABLE ai_attachments IS 'Orchestrator: files attached by AI to property/lead/customer/contract records';
