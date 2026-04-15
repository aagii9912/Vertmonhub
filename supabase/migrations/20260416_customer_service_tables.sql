-- ============================================
-- Vertmon Hub: Customer Service & Гэрээний Хяналт
-- Migration: 20260416_customer_service_tables.sql
--
-- Шинэ хүснэгтүүд:
--   1. payment_schedules    — Гэрээний төлбөрийн хуваарь
--   2. service_logs         — Үйлчилгээний бүртгэл (гомдол, хүсэлт, засвар)
--   3. handover_records     — Хүлээлгэн өгөх акт
--   4. satisfaction_surveys — Сэтгэл ханамж (NPS / CSAT)
-- ============================================

-- ============================================
-- 1. PAYMENT SCHEDULES
-- Гэрээ бүрийн хуваарьтай төлбөр
-- ============================================
CREATE TABLE IF NOT EXISTS payment_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES property_contracts(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

    installment_number INTEGER NOT NULL DEFAULT 1,
    label VARCHAR(100),                          -- "Урьдчилгаа", "2-р төлбөр", "Эцсийн төлбөр" гэх мэт
    due_date DATE NOT NULL,
    amount DECIMAL(18, 2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(18, 2) DEFAULT 0,
    paid_date DATE,
    payment_method VARCHAR(50),                  -- cash, bank_transfer, barter, mortgage
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'overdue', 'partial', 'cancelled')),
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_schedules_contract ON payment_schedules(contract_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_shop ON payment_schedules(shop_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_status ON payment_schedules(status);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_due_date ON payment_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_overdue
    ON payment_schedules(due_date)
    WHERE status IN ('pending', 'partial');

-- RLS
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shop payment schedules"
    ON payment_schedules FOR SELECT TO authenticated
    USING (shop_id = get_user_shop_id());

CREATE POLICY "Users can manage own shop payment schedules"
    ON payment_schedules FOR ALL TO authenticated
    USING (shop_id = get_user_shop_id())
    WITH CHECK (shop_id = get_user_shop_id());

CREATE POLICY "Service role full access on payment_schedules"
    ON payment_schedules FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- 2. SERVICE LOGS
-- Борлуулалтын дараах үйлчилгээний бүртгэл
-- ============================================
CREATE TABLE IF NOT EXISTS service_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES property_contracts(id) ON DELETE SET NULL,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),

    type VARCHAR(30) NOT NULL DEFAULT 'inquiry'
        CHECK (type IN ('inquiry', 'complaint', 'maintenance', 'handover', 'payment', 'other')),
    priority VARCHAR(10) DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    subject TEXT NOT NULL,
    description TEXT,

    status VARCHAR(20) DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    assigned_to VARCHAR(255),

    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_logs_contract ON service_logs(contract_id);
CREATE INDEX IF NOT EXISTS idx_service_logs_shop ON service_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_service_logs_status ON service_logs(status);
CREATE INDEX IF NOT EXISTS idx_service_logs_type ON service_logs(type);
CREATE INDEX IF NOT EXISTS idx_service_logs_priority ON service_logs(priority);
CREATE INDEX IF NOT EXISTS idx_service_logs_assigned ON service_logs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_service_logs_open
    ON service_logs(created_at)
    WHERE status IN ('open', 'in_progress');

-- RLS
ALTER TABLE service_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shop service logs"
    ON service_logs FOR SELECT TO authenticated
    USING (shop_id = get_user_shop_id());

CREATE POLICY "Users can manage own shop service logs"
    ON service_logs FOR ALL TO authenticated
    USING (shop_id = get_user_shop_id())
    WITH CHECK (shop_id = get_user_shop_id());

CREATE POLICY "Service role full access on service_logs"
    ON service_logs FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- 3. HANDOVER RECORDS
-- Байрны хүлээлгэн өгөх акт
-- ============================================
CREATE TABLE IF NOT EXISTS handover_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES property_contracts(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

    handover_date DATE,
    status VARCHAR(20) DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'completed', 'disputed', 'cancelled')),

    -- Шалгах хуудас (checklist)
    checklist JSONB DEFAULT '{}'::jsonb,
    -- Жишээ: {
    --   "key_delivered": true,
    --   "key_count": 3,
    --   "electricity_meter": "12345",
    --   "water_meter": "67890",
    --   "heating_ok": true,
    --   "walls_ok": true,
    --   "floor_ok": true,
    --   "windows_ok": true,
    --   "plumbing_ok": true,
    --   "door_locks_ok": true
    -- }

    condition_notes TEXT,
    photos TEXT[],                                -- Зурагны URL жагсаалт

    accepted_by VARCHAR(255),                     -- Хүлээн авагч (худалдан авагч)
    delivered_by VARCHAR(255),                    -- Хүлээлгэн өгсөн (менежер)

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handover_contract ON handover_records(contract_id);
CREATE INDEX IF NOT EXISTS idx_handover_shop ON handover_records(shop_id);
CREATE INDEX IF NOT EXISTS idx_handover_status ON handover_records(status);

-- RLS
ALTER TABLE handover_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shop handover records"
    ON handover_records FOR SELECT TO authenticated
    USING (shop_id = get_user_shop_id());

CREATE POLICY "Users can manage own shop handover records"
    ON handover_records FOR ALL TO authenticated
    USING (shop_id = get_user_shop_id())
    WITH CHECK (shop_id = get_user_shop_id());

CREATE POLICY "Service role full access on handover_records"
    ON handover_records FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- 4. SATISFACTION SURVEYS
-- Сэтгэл ханамжийн хэмжилт (NPS / CSAT)
-- ============================================
CREATE TABLE IF NOT EXISTS satisfaction_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES property_contracts(id) ON DELETE SET NULL,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

    survey_type VARCHAR(30) NOT NULL DEFAULT 'after_contract'
        CHECK (survey_type IN ('after_contract', 'after_handover', 'quarterly', 'ad_hoc')),

    nps_score INTEGER CHECK (nps_score BETWEEN 0 AND 10),     -- Net Promoter Score
    csat_score INTEGER CHECK (csat_score BETWEEN 1 AND 5),    -- Customer Satisfaction
    responses JSONB DEFAULT '[]'::jsonb,                      -- [{question, answer}]
    feedback_text TEXT,

    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),

    sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_satisfaction_contract ON satisfaction_surveys(contract_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_shop ON satisfaction_surveys(shop_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_type ON satisfaction_surveys(survey_type);

-- RLS
ALTER TABLE satisfaction_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shop satisfaction surveys"
    ON satisfaction_surveys FOR SELECT TO authenticated
    USING (shop_id = get_user_shop_id());

CREATE POLICY "Users can manage own shop satisfaction surveys"
    ON satisfaction_surveys FOR ALL TO authenticated
    USING (shop_id = get_user_shop_id())
    WITH CHECK (shop_id = get_user_shop_id());

CREATE POLICY "Service role full access on satisfaction_surveys"
    ON satisfaction_surveys FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================
-- 5. AUTO-UPDATE TRIGGERS
-- ============================================
CREATE TRIGGER update_payment_schedules_updated_at
    BEFORE UPDATE ON payment_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_logs_updated_at
    BEFORE UPDATE ON service_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_handover_records_updated_at
    BEFORE UPDATE ON handover_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. VIEWS
-- ============================================

-- Customer Service Dashboard KPI
CREATE OR REPLACE VIEW customer_service_dashboard AS
SELECT
    pc.shop_id,
    -- Гэрээний тоо
    COUNT(DISTINCT pc.id) as total_contracts,
    COUNT(DISTINCT pc.id) FILTER (WHERE pc.contract_status = 'active') as active_contracts,
    COUNT(DISTINCT pc.id) FILTER (WHERE pc.contract_status = 'closed') as closed_contracts,

    -- Төлбөрийн хоцрогдол
    COALESCE(SUM(pc.balance) FILTER (WHERE pc.overdue_days > 0), 0) as total_overdue_amount,
    COUNT(DISTINCT pc.id) FILTER (WHERE pc.overdue_days > 0) as overdue_contract_count,

    -- Үйлчилгээний хүсэлт
    (SELECT COUNT(*) FROM service_logs sl WHERE sl.shop_id = pc.shop_id AND sl.status IN ('open', 'in_progress')) as open_service_requests,
    (SELECT COUNT(*) FROM service_logs sl WHERE sl.shop_id = pc.shop_id AND sl.status = 'resolved') as resolved_service_requests,
    (SELECT ROUND(AVG(sl.satisfaction_rating)::numeric, 1) FROM service_logs sl WHERE sl.shop_id = pc.shop_id AND sl.satisfaction_rating IS NOT NULL) as avg_service_rating,

    -- NPS / CSAT
    (SELECT ROUND(AVG(ss.nps_score)::numeric, 1) FROM satisfaction_surveys ss WHERE ss.shop_id = pc.shop_id AND ss.nps_score IS NOT NULL) as avg_nps,
    (SELECT ROUND(AVG(ss.csat_score)::numeric, 1) FROM satisfaction_surveys ss WHERE ss.shop_id = pc.shop_id AND ss.csat_score IS NOT NULL) as avg_csat

FROM property_contracts pc
GROUP BY pc.shop_id;

-- Гэрээ бүрийн төлбөрийн нэгтгэл
CREATE OR REPLACE VIEW contract_payment_status AS
SELECT
    ps.contract_id,
    pc.shop_id,
    pc.contract_number,
    pc.customer_name,
    pc.customer_phone,
    pc.sales_manager,
    pc.total_price,
    pc.contract_status,
    COUNT(ps.id) as total_installments,
    COUNT(ps.id) FILTER (WHERE ps.status = 'paid') as paid_installments,
    COUNT(ps.id) FILTER (WHERE ps.status = 'overdue') as overdue_installments,
    COALESCE(SUM(ps.amount), 0) as scheduled_total,
    COALESCE(SUM(ps.paid_amount), 0) as collected_total,
    COALESCE(SUM(ps.amount) - SUM(ps.paid_amount), 0) as remaining_total,
    MIN(ps.due_date) FILTER (WHERE ps.status IN ('pending', 'partial')) as next_due_date
FROM payment_schedules ps
JOIN property_contracts pc ON pc.id = ps.contract_id
GROUP BY ps.contract_id, pc.shop_id, pc.contract_number, pc.customer_name,
         pc.customer_phone, pc.sales_manager, pc.total_price, pc.contract_status;

-- ============================================
-- 7. COMMENTS
-- ============================================
COMMENT ON TABLE payment_schedules IS 'Гэрээний төлбөрийн хуваарь — milestone бүрийг тусад нь хянах';
COMMENT ON TABLE service_logs IS 'Борлуулалтын дараах үйлчилгээний бүртгэл — гомдол, хүсэлт, засвар';
COMMENT ON TABLE handover_records IS 'Байрны хүлээлгэн өгөх акт — checklist, зураг, нөхцөл';
COMMENT ON TABLE satisfaction_surveys IS 'Сэтгэл ханамжийн хэмжилт — NPS, CSAT, чөлөөт хариулт';

-- ============================================
-- DONE
-- ============================================
SELECT 'Customer Service tables created successfully ✅' as result;
