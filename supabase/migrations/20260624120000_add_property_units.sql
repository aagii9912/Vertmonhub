-- ============================================
-- Vertmon Hub: Property Units (бодит нөөцийн сан / inventory grid)
-- Migration: 20260624120000_add_property_units.sql
--
-- Зорилго: Мандала Гарден маягийн "ээлж → блок → нэгж" бүтэцтэй БҮХ нэгжийг
-- (зарагдсан БА зарагдаагүй) хадгалах. Энэ нь хурлын "блокоор харах" шаардлагын
-- эх дата. property_contracts (зөвхөн гэрээтэй нэгж, санхүүтэй) -ээс `code`-оор
-- холбогдоно.
--
-- Яагаад `properties`-ийг ашиглаагүй вэ:
--   - properties.type ENUM (apartment/house/office/land/commercial) нь
--     зогсоол/агуулахыг илэрхийлж чадахгүй (нийт нэгжийн ~57% нь зогсоол/агуулах).
--   - properties нь зураг/featured-тэй listing хүснэгт; 1000+ зогсоолыг listing
--     болгох нь буруу. property_units нь түүхий нөөцийн grid.
-- ============================================

CREATE TABLE IF NOT EXISTS property_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

    -- Шатлал
    phase VARCHAR(50),             -- Zoo Garden / Zoo Plus / Water Garden
    block VARCHAR(50),             -- 301, 302, 201... (цамхаг/блок)
    building_number VARCHAR(50),   -- кодын угтвар (1489, 203, Г1486)
    floor VARCHAR(20),             -- Давхар (01, 02, B1)

    -- Танигч
    code VARCHAR(50) NOT NULL,     -- Код (201-440, 1489-1, Г1486-1)
    unit_number VARCHAR(50),       -- Шинэ тоот
    legacy_unit_number VARCHAR(50),-- Хуучин Тоот

    -- Ангилал
    category VARCHAR(20) NOT NULL DEFAULT 'residential', -- residential/parking/industry/commercial
    unit_type VARCHAR(30),         -- Айлын төрөл (301-P, A, B, F)
    model VARCHAR(50),             -- Загвар (1A-8, VIP-1)
    window_view VARCHAR(50),       -- Цонхны харагдац
    rooms INTEGER,                 -- Өрөөний тоо

    -- Талбай
    sale_area DECIMAL(10, 2),         -- Борлуулах талбай
    updated_sale_area DECIMAL(10, 2), -- Шинэчилсэн борлуулах талбай
    contracted_area DECIMAL(10, 2),   -- Гэрээлсэн талбай

    -- Төлөв / борлуулалт
    status VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'reserved', 'ordered', 'sold', 'handed_over')),
    raw_status VARCHAR(50),        -- эх төлөв (Худалдаанд, Гэрээ баталгаажсан...)
    sales_channel VARCHAR(50),     -- Борлуулалтын суваг (Пропертис/Бартер/ХО-н нөхцөл)
    sales_manager VARCHAR(255),    -- Борлуулалтын менежер

    source_file VARCHAR(255),      -- эх файл (provenance)

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Нэг нэгж нэг л удаа (дахин импорт = upsert). Код нь ангилал хооронд
    -- давхардаж болзошгүй (зогсоол 1484-1 ба агуулах 1484-1) тул бүгдийг оруулна.
    UNIQUE (shop_id, phase, category, code)
);

-- Indexes (блок харагдац + шүүлтэд)
CREATE INDEX IF NOT EXISTS idx_property_units_shop ON property_units(shop_id);
CREATE INDEX IF NOT EXISTS idx_property_units_phase_block ON property_units(shop_id, phase, block);
CREATE INDEX IF NOT EXISTS idx_property_units_category ON property_units(shop_id, category);
CREATE INDEX IF NOT EXISTS idx_property_units_status ON property_units(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_property_units_manager ON property_units(sales_manager);
CREATE INDEX IF NOT EXISTS idx_property_units_code ON property_units(shop_id, code);

-- updated_at trigger (одоо байгаа функцийг дахин ашиглана)
DROP TRIGGER IF EXISTS property_units_updated_at ON property_units;
CREATE TRIGGER property_units_updated_at
    BEFORE UPDATE ON property_units
    FOR EACH ROW
    EXECUTE FUNCTION update_property_timestamp();

-- ============================================
-- Блокийн нэгдсэн харагдац (зарагдсан/зарагдаагүй тоо)
-- ============================================
CREATE OR REPLACE VIEW property_block_summary AS
SELECT
    shop_id,
    phase,
    block,
    category,
    COUNT(*) AS total_units,
    COUNT(*) FILTER (WHERE status = 'available') AS available_units,
    COUNT(*) FILTER (WHERE status IN ('sold', 'handed_over')) AS sold_units,
    COUNT(*) FILTER (WHERE status IN ('reserved', 'ordered')) AS pending_units,
    SUM(sale_area) AS total_area
FROM property_units
GROUP BY shop_id, phase, block, category;

-- ============================================
-- Нэгж + худалдан авагч (гэрээнээс). Гэрээний unit_label нь кодоор эхэлдэг
-- ("203-305, 3B-2, ..."), тиймээс split_part(...) = code-оор холбоно. Ангиллыг
-- (product_type = category) нэмж давхар-кодын мөргөлдөөнийг арилгана.
-- Нэг кодод олон гэрээ байвал хаагдсан > идэвхтэй > сүүлийнхийг сонгоно.
-- ============================================
CREATE OR REPLACE VIEW property_units_with_buyer AS
SELECT
    pu.*,
    pc.customer_name        AS buyer_name,
    pc.customer_registration AS buyer_registration,
    pc.total_price          AS contract_total_price,
    pc.paid_amount          AS contract_paid_amount,
    pc.price_per_sqm        AS contract_price_per_sqm,
    pc.contract_status      AS contract_status,
    pc.contract_date        AS contract_date,
    pc.order_date           AS contract_order_date
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

-- ============================================
-- RLS (property_contracts-тэй ижил загвар)
-- ============================================
ALTER TABLE property_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_owners_manage_units"
    ON property_units FOR ALL
    USING (shop_id = get_user_shop_id());

CREATE POLICY "service_role_all_units"
    ON property_units FOR ALL
    TO service_role
    USING (true);

-- ============================================
SELECT 'property_units table + block summary view created ✅' as result;
