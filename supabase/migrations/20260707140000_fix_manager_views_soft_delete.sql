-- ============================================================
-- Менежерийн view-үүд soft-delete-ийг харгалзана — 2026-07-07
-- ============================================================
-- manager_performance / manager_monthly_sales нь deleted_at-ийг шүүдэггүй
-- байсан тул зөөлөн устгасан гэрээ менежерийн гүйцэтгэл, сарын борлуулалтад
-- тоологдсоор байв. Хоёр view-г deleted_at IS NULL шүүлттэй дахин үүсгэнэ.
-- Баганын жагсаалт ЯГ хэвээр (reports/manager-performance, lib/sales/targets,
-- export, director-digest хэрэглэгчид эвдрэхгүй).
-- security_invoker = on — 20260630130000/20260707130000-ийн конвенц
-- (CREATE OR REPLACE reloption арчдаг тул DROP+CREATE хийнэ).
-- Эдгээр view mandala_setup.sql-д байхгүй тул тэндээс дахин арчигдахгүй.

DROP VIEW IF EXISTS manager_performance;
CREATE VIEW manager_performance
WITH (security_invoker = on) AS
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
  AND deleted_at IS NULL
GROUP BY shop_id, sales_manager;

COMMENT ON VIEW manager_performance IS 'Менежер тус бүрийн гэрээний гүйцэтгэл (зөөлөн устгасан гэрээг хасна)';

DROP VIEW IF EXISTS manager_monthly_sales;
CREATE VIEW manager_monthly_sales
WITH (security_invoker = on) AS
SELECT
    shop_id,
    sales_manager,
    EXTRACT(YEAR  FROM contract_date)::int AS year,
    EXTRACT(MONTH FROM contract_date)::int AS month,
    COALESCE(SUM(total_price), 0)          AS actual_amount,
    COUNT(*)                               AS contract_count
FROM property_contracts
WHERE sales_manager IS NOT NULL
  AND contract_date IS NOT NULL
  AND deleted_at IS NULL
GROUP BY shop_id, sales_manager, EXTRACT(YEAR FROM contract_date), EXTRACT(MONTH FROM contract_date);

COMMENT ON VIEW manager_monthly_sales IS 'Менежерийн бодит борлуулалт сар тутмаар (зөөлөн устгасан гэрээг хасна)';
