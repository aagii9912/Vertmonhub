-- Vertmon Hub: widen property_contracts string columns to fit real Odoo exports.
-- Original VARCHAR sizes were too small for real-world data (e.g. unit_label "1480-54, 4-н 1, Агуулах, МГ-1-Р ЭЭЛЖ \"ЗҮҮ ГАРДЕН\"")
-- Views depend on these columns, so drop and recreate around the ALTER.

DROP VIEW IF EXISTS contract_statistics;
DROP VIEW IF EXISTS manager_performance;
DROP VIEW IF EXISTS customer_service_dashboard;
DROP VIEW IF EXISTS contract_payment_status;

ALTER TABLE property_contracts
  ALTER COLUMN unit_number TYPE TEXT,
  ALTER COLUMN unit_label TYPE TEXT,
  ALTER COLUMN unit_type TYPE TEXT,
  ALTER COLUMN model TYPE TEXT,
  ALTER COLUMN floor TYPE TEXT,
  ALTER COLUMN product_type TYPE TEXT,
  ALTER COLUMN contract_number TYPE TEXT,
  ALTER COLUMN payment_condition TYPE TEXT,
  ALTER COLUMN prepayment_condition TYPE TEXT,
  ALTER COLUMN remaining_payment_condition TYPE TEXT,
  ALTER COLUMN sales_channel TYPE TEXT,
  ALTER COLUMN sales_manager TYPE TEXT,
  ALTER COLUMN bank_status TYPE TEXT,
  ALTER COLUMN barter_status TYPE TEXT,
  ALTER COLUMN barter_type TYPE TEXT,
  ALTER COLUMN balance_payment_method TYPE TEXT,
  ALTER COLUMN customer_name TYPE TEXT,
  ALTER COLUMN customer_first_name TYPE TEXT,
  ALTER COLUMN customer_last_name TYPE TEXT,
  ALTER COLUMN customer_registration TYPE TEXT,
  ALTER COLUMN customer_phone TYPE TEXT,
  ALTER COLUMN customer_mobile TYPE TEXT,
  ALTER COLUMN hubspot_contact_id TYPE TEXT;

-- Recreate views (same definitions as 20260415120000_extend_property_contracts.sql)
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

CREATE OR REPLACE VIEW customer_service_dashboard AS
SELECT
    pc.shop_id,
    COUNT(DISTINCT pc.id) AS total_contracts,
    COUNT(DISTINCT pc.id) FILTER (WHERE pc.contract_status = 'active') AS active_contracts,
    COUNT(DISTINCT pc.id) FILTER (WHERE pc.contract_status = 'closed') AS closed_contracts,
    COALESCE(SUM(pc.balance) FILTER (WHERE pc.overdue_days > 0), 0) AS total_overdue_amount,
    COUNT(DISTINCT pc.id) FILTER (WHERE pc.overdue_days > 0) AS overdue_contract_count,
    (SELECT COUNT(*) FROM service_logs sl WHERE sl.shop_id = pc.shop_id AND sl.status IN ('open','in_progress')) AS open_service_requests,
    (SELECT COUNT(*) FROM service_logs sl WHERE sl.shop_id = pc.shop_id AND sl.status = 'resolved') AS resolved_service_requests,
    (SELECT ROUND(AVG(sl.satisfaction_rating)::numeric, 1) FROM service_logs sl WHERE sl.shop_id = pc.shop_id AND sl.satisfaction_rating IS NOT NULL) AS avg_service_rating,
    (SELECT ROUND(AVG(ss.nps_score)::numeric, 1) FROM satisfaction_surveys ss WHERE ss.shop_id = pc.shop_id AND ss.nps_score IS NOT NULL) AS avg_nps,
    (SELECT ROUND(AVG(ss.csat_score)::numeric, 1) FROM satisfaction_surveys ss WHERE ss.shop_id = pc.shop_id AND ss.csat_score IS NOT NULL) AS avg_csat
FROM property_contracts pc
GROUP BY pc.shop_id;

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
    COUNT(ps.id) AS total_installments,
    COUNT(ps.id) FILTER (WHERE ps.status = 'paid') AS paid_installments,
    COUNT(ps.id) FILTER (WHERE ps.status = 'overdue') AS overdue_installments,
    COALESCE(SUM(ps.amount), 0) AS scheduled_total,
    COALESCE(SUM(ps.paid_amount), 0) AS collected_total,
    COALESCE(SUM(ps.amount) - SUM(ps.paid_amount), 0) AS remaining_total,
    MIN(ps.due_date) FILTER (WHERE ps.status IN ('pending','partial')) AS next_due_date
FROM payment_schedules ps
JOIN property_contracts pc ON pc.id = ps.contract_id
GROUP BY ps.contract_id, pc.shop_id, pc.contract_number, pc.customer_name,
         pc.customer_phone, pc.sales_manager, pc.total_price, pc.contract_status;
