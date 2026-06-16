-- CRM өгөгдлийн аудит лог
-- Харилцагч/lead/гэрээ зэрэг бизнес өгөгдлийн өөрчлөлтийг (хэн, юуг, хэзээ)
-- бүртгэнэ. admin_audit_log-оос ялгаатай нь shop_id-аар scope хийгдсэн тул
-- multi-tenant орчинд аль shop-ийн өгөгдөл өөрчлөгдснийг хянана.

CREATE TABLE IF NOT EXISTS data_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID,                       -- аль shop-ийн өгөгдөл
    actor_id UUID,                      -- үйлдэл хийсэн хэрэглэгч (NULL = систем/webhook)
    entity VARCHAR(48) NOT NULL,        -- customer, lead, contract, ...
    entity_id TEXT,                     -- зорилтот мөрийн ID
    action VARCHAR(24) NOT NULL,        -- create, update, delete
    changes JSONB DEFAULT '{}'::jsonb,  -- өөрчлөгдсөн талбарууд
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_audit_shop_created
    ON data_audit_log(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_audit_entity
    ON data_audit_log(entity, entity_id);

ALTER TABLE data_audit_log ENABLE ROW LEVEL SECURITY;

-- Зөвхөн service role бичнэ (API route-ууд supabaseAdmin-аар бичнэ).
-- Унших эрхийг хожим dashboard-д RLS policy-аар нэмж болно.
DROP POLICY IF EXISTS "Service role only" ON data_audit_log;
CREATE POLICY "Service role only" ON data_audit_log
    FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE data_audit_log IS 'CRM бизнес өгөгдлийн өөрчлөлтийн аудит лог (shop-scoped)';
