-- ============================================
-- Vertmon Hub: Extend property_contracts for full Excel import
-- Migration: 20260415120000_extend_property_contracts.sql
--
-- Adds columns required by the Mongolian sales-tracking Excel:
--   Шинэ тоот / Тоот, Барилгын дугаар, Сууцны тэмдэглэгээ, Айлын төрөл,
--   1-р үнэ, Урьдчилгаа %, Төлөх урьд. төлбөр, Төлөгдсөн урьд. төлбөр (бэлэн / бартер),
--   Төлсөн %, Гэрээ хаагдсан эсэх
-- ============================================

ALTER TABLE property_contracts
    -- Тоот (хуучин дугаар) — `unit_number` нь Шинэ тоот-ыг агуулна
    ADD COLUMN IF NOT EXISTS legacy_unit_number VARCHAR(50),

    -- Барилгын дугаар (1475 гэх мэт)
    ADD COLUMN IF NOT EXISTS building_number VARCHAR(50),

    -- Сууцны тэмдэглэгээ (4a, 3b гэх мэт)
    ADD COLUMN IF NOT EXISTS unit_label VARCHAR(50),

    -- Айлын төрөл (G, A, B гэсэн нэг үсэг)
    ADD COLUMN IF NOT EXISTS unit_type VARCHAR(20),

    -- 1-р үнэ (анхны үнэ — `price_per_sqm`-ээс өөр)
    ADD COLUMN IF NOT EXISTS first_price DECIMAL(15, 2),

    -- Урьдчилгаатай холбоотой задаргаа
    ADD COLUMN IF NOT EXISTS prepayment_percent DECIMAL(5, 2),
    ADD COLUMN IF NOT EXISTS prepayment_due DECIMAL(18, 2),
    ADD COLUMN IF NOT EXISTS prepayment_paid DECIMAL(18, 2),
    ADD COLUMN IF NOT EXISTS prepayment_paid_cash DECIMAL(18, 2),
    ADD COLUMN IF NOT EXISTS prepayment_paid_barter DECIMAL(18, 2),

    -- Төлсөн %
    ADD COLUMN IF NOT EXISTS paid_percent DECIMAL(5, 2),

    -- Гэрээний төлөв (Хаагдсан / Идэвхтэй / Цуцалсан)
    ADD COLUMN IF NOT EXISTS contract_status VARCHAR(20) DEFAULT 'active';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prop_contracts_status ON property_contracts(contract_status);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_building ON property_contracts(building_number);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_unit_type ON property_contracts(unit_type);

-- Үлдсэн төлбөр / overdue-г илүү хурдан хайхад
CREATE INDEX IF NOT EXISTS idx_prop_contracts_overdue
    ON property_contracts(overdue_days)
    WHERE overdue_days > 0;

CREATE INDEX IF NOT EXISTS idx_prop_contracts_balance
    ON property_contracts(balance)
    WHERE balance > 0;

-- ============================================
-- Refresh views to include new columns
-- ============================================
DROP VIEW IF EXISTS contract_statistics;
CREATE OR REPLACE VIEW contract_statistics AS
SELECT
    shop_id,
    product_type,
    sales_channel,
    contract_status,
    COUNT(*) as contract_count,
    SUM(total_price) as total_sales,
    SUM(paid_amount) as total_paid,
    SUM(balance) as total_balance,
    SUM(prepayment_paid) as total_prepayment_paid,
    CASE
        WHEN SUM(total_price) > 0
        THEN ROUND((SUM(paid_amount) / SUM(total_price) * 100)::numeric, 1)
        ELSE 0
    END as collection_rate_pct,
    AVG(contracted_area) as avg_area_sqm,
    AVG(price_per_sqm) as avg_price_per_sqm
FROM property_contracts
GROUP BY shop_id, product_type, sales_channel, contract_status;

DROP VIEW IF EXISTS manager_performance;
CREATE OR REPLACE VIEW manager_performance AS
SELECT
    shop_id,
    sales_manager,
    COUNT(*) as contract_count,
    COUNT(*) FILTER (WHERE contract_status = 'closed') as closed_count,
    SUM(total_price) as total_sales,
    SUM(paid_amount) as total_collected,
    SUM(balance) as total_outstanding,
    CASE
        WHEN SUM(total_price) > 0
        THEN ROUND((SUM(paid_amount) / SUM(total_price) * 100)::numeric, 1)
        ELSE 0
    END as collection_rate_pct,
    COUNT(DISTINCT customer_registration) as unique_customers
FROM property_contracts
WHERE sales_manager IS NOT NULL
GROUP BY shop_id, sales_manager;

-- ============================================
-- SUCCESS
-- ============================================
SELECT 'property_contracts extended with Excel-import columns ✅' as result;
