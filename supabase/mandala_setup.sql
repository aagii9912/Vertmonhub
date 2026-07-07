-- ════════════════════════════════════════════════════════════════════════
-- МАНДАЛА ГАРДЕН — нэгдсэн SQL (Supabase SQL Editor-т ХУУЛЖ БУУЛГАХАД бэлэн)
-- ════════════════════════════════════════════════════════════════════════
-- Энэ файл нь дараах 2 migration-ийг нэг дор агуулна (дарааллаар нь ажиллуулна):
--   1) 20260624120000_add_property_units.sql   — нэгжийн нөөц + блок харагдац
--   2) 20260624130000_add_meeting_analytics.sql — уулзалтын аналитик
--
-- БҮГД idempotent: дахин дахин ажиллуулж болно (IF NOT EXISTS / OR REPLACE /
-- DROP POLICY IF EXISTS).
--
-- ⚠ ШААРДАХ (target DB-д аль хэдийн байх ёстой):
--   • Хүснэгт: shops, projects, leads, property_viewings, property_contracts
--   • Функц:  get_user_shop_id()   (RLS-д хэрэглэнэ)
--   (Эдгээр нь Vertmon Hub-ийн үндсэн real-estate migration-ууд дотор үүсдэг.)
--
-- Ажиллуулсны дараа дата оруулах:
--   npx tsx scripts/import-mandala-units.ts --dir=<extracted-zips> --commit
--   npx tsx scripts/import-mandala-contracts.ts <Buh_geree.xlsx> --units-dir=<extracted-zips> --commit --wipe
-- ════════════════════════════════════════════════════════════════════════


-- updated_at trigger функц (өөртөө хүрэлцэхүйц байхын тулд энд бас тодорхойлов)
CREATE OR REPLACE FUNCTION update_property_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════════════════════════════
-- 1) PROPERTY UNITS — бодит нөөцийн сан (ээлж → блок → нэгж, зарагдсан+үлдсэн)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS property_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

    phase VARCHAR(50),             -- Zoo Garden / Zoo Plus / Water Garden
    block VARCHAR(50),             -- 301, 302, 201...
    building_number VARCHAR(50),   -- кодын угтвар (1489, 203, Г1486)
    floor VARCHAR(20),             -- Давхар (01, 02, B1)

    code VARCHAR(50) NOT NULL,     -- Код (201-440, 1489-1, Г1486-1)
    unit_number VARCHAR(50),       -- Шинэ тоот
    legacy_unit_number VARCHAR(50),-- Хуучин Тоот

    category VARCHAR(20) NOT NULL DEFAULT 'residential', -- residential/parking/industry/commercial
    unit_type VARCHAR(30),         -- Айлын төрөл
    model VARCHAR(50),             -- Загвар
    window_view VARCHAR(50),       -- Цонхны харагдац
    rooms INTEGER,                 -- Өрөөний тоо

    sale_area DECIMAL(10, 2),
    updated_sale_area DECIMAL(10, 2),
    contracted_area DECIMAL(10, 2),

    status VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'reserved', 'ordered', 'sold', 'handed_over')),
    raw_status VARCHAR(50),
    sales_channel VARCHAR(50),
    sales_manager VARCHAR(255),
    source_file VARCHAR(255),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (shop_id, phase, category, code)
);

CREATE INDEX IF NOT EXISTS idx_property_units_shop ON property_units(shop_id);
CREATE INDEX IF NOT EXISTS idx_property_units_phase_block ON property_units(shop_id, phase, block);
CREATE INDEX IF NOT EXISTS idx_property_units_category ON property_units(shop_id, category);
CREATE INDEX IF NOT EXISTS idx_property_units_status ON property_units(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_property_units_manager ON property_units(sales_manager);
CREATE INDEX IF NOT EXISTS idx_property_units_code ON property_units(shop_id, code);

DROP TRIGGER IF EXISTS property_units_updated_at ON property_units;
CREATE TRIGGER property_units_updated_at
    BEFORE UPDATE ON property_units
    FOR EACH ROW
    EXECUTE FUNCTION update_property_timestamp();

-- Блокийн нэгдсэн харагдац (зарагдсан/зарагдаагүй тоо)
-- security_invoker = on: CREATE OR REPLACE VIEW нь заагаагүй option-ыг устгадаг тул
-- энд тавихгүй бол 20260630130000-ийн SECURITY DEFINER засвар арчигдана.
CREATE OR REPLACE VIEW property_block_summary WITH (security_invoker = on) AS
SELECT
    shop_id, phase, block, category,
    COUNT(*) AS total_units,
    COUNT(*) FILTER (WHERE status = 'available') AS available_units,
    COUNT(*) FILTER (WHERE status IN ('sold', 'handed_over')) AS sold_units,
    COUNT(*) FILTER (WHERE status IN ('reserved', 'ordered')) AS pending_units,
    SUM(sale_area) AS total_area
FROM property_units
GROUP BY shop_id, phase, block, category;

-- Нэгж + худалдан авагч (гэрээнээс кодоор холбоно)
CREATE OR REPLACE VIEW property_units_with_buyer WITH (security_invoker = on) AS
SELECT
    pu.*,
    pc.customer_name         AS buyer_name,
    pc.customer_registration AS buyer_registration,
    pc.total_price           AS contract_total_price,
    pc.paid_amount           AS contract_paid_amount,
    pc.price_per_sqm         AS contract_price_per_sqm,
    pc.contract_status       AS contract_status,
    pc.contract_date         AS contract_date,
    pc.order_date            AS contract_order_date
FROM property_units pu
LEFT JOIN LATERAL (
    SELECT customer_name, customer_registration, total_price, paid_amount,
           price_per_sqm, contract_status, contract_date, order_date
    FROM property_contracts c
    WHERE c.shop_id = pu.shop_id
      AND split_part(c.unit_label, ',', 1) = pu.code
      AND c.product_type = pu.category
    ORDER BY (c.contract_status = 'closed') DESC,
             (c.contract_status = 'active') DESC,
             c.contract_date DESC NULLS LAST
    LIMIT 1
) pc ON TRUE;

-- RLS
ALTER TABLE property_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_owners_manage_units" ON property_units;
CREATE POLICY "shop_owners_manage_units"
    ON property_units FOR ALL
    USING (shop_id = get_user_shop_id());

DROP POLICY IF EXISTS "service_role_all_units" ON property_units;
CREATE POLICY "service_role_all_units"
    ON property_units FOR ALL
    TO service_role
    USING (true);


-- ════════════════════════════════════════════════════════════════════════
-- 2) MEETING ANALYTICS — уулзалтын төрөл + санхүүжилтийн суваг
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE property_viewings
    ADD COLUMN IF NOT EXISTS meeting_type VARCHAR(20)
        CHECK (meeting_type IN ('new_customer', 'repeat_customer', 'existing_buyer'));

CREATE INDEX IF NOT EXISTS idx_viewings_meeting_type ON property_viewings(meeting_type);

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS financing_intent VARCHAR(30);  -- bank_loan|cash|mortgage|leasing|barter|other

CREATE INDEX IF NOT EXISTS idx_leads_financing_intent ON leads(financing_intent);

-- Сарын уулзалтын нэгтгэл
CREATE OR REPLACE VIEW meeting_monthly_summary WITH (security_invoker = on) AS
SELECT
    v.shop_id,
    date_trunc('month', v.scheduled_at)::date AS month,
    COUNT(*) AS total_meetings,
    COUNT(*) FILTER (WHERE v.meeting_type = 'new_customer')    AS new_customer,
    COUNT(*) FILTER (WHERE v.meeting_type = 'repeat_customer') AS repeat_customer,
    COUNT(*) FILTER (WHERE v.meeting_type = 'existing_buyer')  AS existing_buyer,
    COUNT(*) FILTER (WHERE v.status = 'completed')             AS completed,
    COUNT(*) FILTER (WHERE l.financing_intent = 'bank_loan')   AS fin_bank_loan,
    COUNT(*) FILTER (WHERE l.financing_intent = 'cash')        AS fin_cash,
    COUNT(*) FILTER (WHERE l.financing_intent = 'mortgage')    AS fin_mortgage,
    COUNT(*) FILTER (WHERE l.financing_intent = 'leasing')     AS fin_leasing,
    COUNT(*) FILTER (WHERE l.financing_intent = 'barter')      AS fin_barter
FROM property_viewings v
LEFT JOIN leads l ON l.id = v.lead_id
GROUP BY v.shop_id, date_trunc('month', v.scheduled_at);


SELECT 'Mandala setup applied ✅ (property_units + views + meeting analytics)' AS result;
