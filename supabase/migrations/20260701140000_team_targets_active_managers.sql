-- ============================================================
-- TEAM SALES TARGETS + ACTIVE MANAGER ROSTER — 2026-07-01
-- ============================================================
-- Загварын өөрчлөлт: төлөвлөгөөг менежер ТУС БҮРЭЭР биш, БҮХ БАГААР (нэг
-- team target) тавина. Мөн гэрээнд гарч байсан бүх (all-time) менежерээс
-- одоо ИДЭВХТЭЙ ажиллаж буйг нь сонгодог болгов (sales_managers.is_active).
--
-- • team_sales_targets — shop бүрийн САРЫН нэгдсэн төлөвлөгөө (₮).
--   Улирал/жил = сарын нийлбэр.
-- • sales_managers    — менежерийн бүртгэл; is_active-аар идэвхтэйг тэмдэглэнэ.
--   Багийн гүйцэтгэл = идэвхтэй менежерүүдийн борлуулалтын нийлбэр.
--
-- Өмнөх 20260701120000-ийн per-manager sales_targets хүснэгтийг устгана.

DROP TABLE IF EXISTS sales_targets CASCADE;

-- updated_at туслах функц (migration 1-тэй ижил, найдвартай байхаар дахин үүсгэв)
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

-- ============================================================
-- 1) Багийн сарын төлөвлөгөө
-- ============================================================
CREATE TABLE IF NOT EXISTS team_sales_targets (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id        uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    year           int NOT NULL,
    month          int NOT NULL CHECK (month BETWEEN 1 AND 12),
    target_amount  numeric(18, 2) NOT NULL DEFAULT 0,
    created_at     timestamptz DEFAULT now(),
    updated_at     timestamptz DEFAULT now(),
    UNIQUE (shop_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_team_sales_targets_shop_year
    ON team_sales_targets (shop_id, year);

DROP TRIGGER IF EXISTS trg_team_sales_targets_updated ON team_sales_targets;
CREATE TRIGGER trg_team_sales_targets_updated
    BEFORE UPDATE ON team_sales_targets
    FOR EACH ROW EXECUTE FUNCTION update_sales_targets_updated_at();

ALTER TABLE team_sales_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_sales_targets_shop_access ON team_sales_targets;
CREATE POLICY team_sales_targets_shop_access ON team_sales_targets FOR ALL
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

COMMENT ON TABLE team_sales_targets IS 'Багийн (shop) сарын борлуулалтын төлөвлөгөө (₮); улирал/жил = нийлбэр';

-- ============================================================
-- 2) Менежерийн бүртгэл (идэвхтэй эсэх)
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_managers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name        text NOT NULL,                                    -- property_contracts.sales_manager-тай таарна
    user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- заавал биш: акаунттай холбоос
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    UNIQUE (shop_id, name)
);
CREATE INDEX IF NOT EXISTS idx_sales_managers_active
    ON sales_managers (shop_id) WHERE is_active;

DROP TRIGGER IF EXISTS trg_sales_managers_updated ON sales_managers;
CREATE TRIGGER trg_sales_managers_updated
    BEFORE UPDATE ON sales_managers
    FOR EACH ROW EXECUTE FUNCTION update_sales_targets_updated_at();

ALTER TABLE sales_managers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_managers_shop_access ON sales_managers;
CREATE POLICY sales_managers_shop_access ON sales_managers FOR ALL
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

COMMENT ON TABLE sales_managers IS 'Борлуулалтын менежерийн бүртгэл; is_active = одоо идэвхтэй эсэх';
