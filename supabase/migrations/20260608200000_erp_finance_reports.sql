-- Vertmon Hub: ERP Phase 4 — Санхүүгийн тайлан + audit
-- Тайлангууд (P&L, мөнгөн урсгал, НӨАТ, AR/AP aging) нь одоо байгаа өгөгдлөөс тооцоологддог
-- тул шинэ хүснэгт шаардахгүй. Энд зөвхөн санхүүгийн audit лог нэмнэ.

CREATE TABLE IF NOT EXISTS finance_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,   -- transaction.create, bill.create, bill.pay, budget.create, ...
    entity VARCHAR(50),            -- finance_transaction, vendor_bill, project_budget
    entity_id UUID,
    amount DECIMAL(18, 2),
    meta JSONB DEFAULT '{}'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_shop ON finance_audit_log(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_audit_action ON finance_audit_log(shop_id, action);

ALTER TABLE finance_audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE finance_audit_log IS 'ERP: санхүүгийн бичилтийн аудит лог';
