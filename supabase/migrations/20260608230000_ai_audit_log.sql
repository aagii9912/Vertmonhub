-- Vertmon Hub: AI Assistant аудит — LLM-ээр хийсэн өөрчлөлтийг бүртгэх
-- Ажилтан LLM-ээр write/delete хийхэд хэн, хэзээ, юу хийснийг хадгална.

CREATE TABLE IF NOT EXISTS ai_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    user_id UUID,
    tool VARCHAR(64) NOT NULL,        -- update_lead_status, update_property_price, ...
    args JSONB DEFAULT '{}'::jsonb,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_shop ON ai_audit_log(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_user ON ai_audit_log(user_id, created_at DESC);

ALTER TABLE ai_audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ai_audit_log IS 'AI Assistant-ээр хийсэн write/delete үйлдлийн аудит лог';
