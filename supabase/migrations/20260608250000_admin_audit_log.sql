-- Vertmon Hub: Admin үйлдлийн аудит лог
-- Admin хэрэглэгч/дүр үүсгэх/устгах/өөрчлөх зэрэг эмзэг үйлдлийг бүртгэнэ.

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,                 -- үйлдэл хийсэн admin
    action VARCHAR(64) NOT NULL,   -- user.create, user.delete, user.role_update, role.create, ...
    target_id TEXT,                -- зорилтот хэрэглэгч/дүр
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_log(action);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE admin_audit_log IS 'Admin панелийн эмзэг үйлдлийн аудит лог';
