-- ============================================
-- service_logs дээр customer_id FK нэмэх
-- (харилцагчийн профайл дээрээс хүсэлт/гомдол/бичиг бүртгэх боломжтой болгох)
-- ============================================

ALTER TABLE service_logs
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_logs_customer
    ON service_logs(customer_id)
    WHERE customer_id IS NOT NULL;
