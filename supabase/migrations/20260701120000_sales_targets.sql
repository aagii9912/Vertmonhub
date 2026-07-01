-- ============================================================
-- SALES TARGETS — Борлуулалтын менежерийн төлөвлөгөө — 2026-07-01
-- ============================================================
-- Admin панелаас менежер тус бүрийн САРЫН борлуулалтын төлөвлөгөө (₮)-г
-- оруулна. Сар бүр өөр өөр дүнтэй байж болно (задалж оруулна).
--   • Улирлын төлөвлөгөө = тухайн улирлын 3 сарын нийлбэр.
--   • Жилийн төлөвлөгөө  = тухайн жилийн 12 сарын нийлбэр.
-- Гүйцэтгэл нь property_contracts (total_price, contract_date, sales_manager)-оос
-- бодогдож, менежерийн dashboard болон manager-performance report дээр
-- төлөвлөгөөтэй харьцуулагдана.
--
-- Менежерийн таних тэмдэг: sales_manager (нэр, property_contracts-той тааруулна)
-- + user_id (заавал биш — акаунттай холбож, dashboard дээр найдвартай тааруулна).

CREATE TABLE IF NOT EXISTS sales_targets (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id        uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    sales_manager  text NOT NULL,                                   -- property_contracts.sales_manager-тай таарна
    user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- заавал биш: акаунттай холбоос
    year           int NOT NULL,
    month          int NOT NULL CHECK (month BETWEEN 1 AND 12),
    target_amount  numeric(18, 2) NOT NULL DEFAULT 0,               -- сарын төлөвлөгөө (₮)
    created_at     timestamptz DEFAULT now(),
    updated_at     timestamptz DEFAULT now(),
    UNIQUE (shop_id, sales_manager, year, month)
);

CREATE INDEX IF NOT EXISTS idx_sales_targets_shop_year
    ON sales_targets (shop_id, year);
CREATE INDEX IF NOT EXISTS idx_sales_targets_user
    ON sales_targets (user_id) WHERE user_id IS NOT NULL;

-- updated_at-г автоматаар шинэчлэх
CREATE OR REPLACE FUNCTION update_sales_targets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sales_targets_updated_at ON sales_targets;
CREATE TRIGGER trigger_sales_targets_updated_at
    BEFORE UPDATE ON sales_targets
    FOR EACH ROW
    EXECUTE FUNCTION update_sales_targets_updated_at();

-- RLS — service-role (server) RLS-ийг алгасдаг ч аюулгүй байдлын үүднээс асаана
ALTER TABLE sales_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_targets_shop_access ON sales_targets;
CREATE POLICY sales_targets_shop_access ON sales_targets FOR ALL
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

COMMENT ON TABLE sales_targets IS 'Борлуулалтын менежерийн сарын төлөвлөгөө (₮); улирал/жил = сарын нийлбэр';

-- ============================================================
-- Гүйцэтгэлийн view: менежер × жил × сар → бодит борлуулалт (₮ + тоо)
-- ============================================================
-- Постгресийн зүгээс нэгтгэдэг тул 1000-мөрийн тайрлага (client truncation)
-- үүсэхгүй. shop_id + year-ээр шүүхэд max (менежер × 12) мөр буцна.
-- security_invoker = on: base table-ийн shop-scoped RLS-ийг мөрдөнө.
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
GROUP BY shop_id, sales_manager, EXTRACT(YEAR FROM contract_date), EXTRACT(MONTH FROM contract_date);

COMMENT ON VIEW manager_monthly_sales IS 'Менежерийн бодит борлуулалт сар тутмаар (property_contracts дээр)';
