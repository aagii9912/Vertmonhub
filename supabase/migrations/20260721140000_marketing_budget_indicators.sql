-- ============================================================
-- Маркетингийн төсвийн хяналт + зах зээлийн үзүүлэлт — 2026-07-21
-- ============================================================
-- 1) marketing_budgets      — сар бүрийн маркетингийн төсөв (shop бүрээр)
-- 2) marketing_spend_entries — бодит зарцуулалтын гар бүртгэл (билборд, радио,
--    boost г.м; Meta Ads-ийн автомат spend нь ad_campaigns-д тусдаа байдаг)
-- 3) market_indicators      — макро/зах зээлийн үзүүлэлт (ипотекийн хүү,
--    банкны нөхцөл) — судалгааны хэсэгт гараар бүртгэж хянана
--
-- Самбар дээр төсөв vs зарцуулалт vs борлуулалтын орлого (гэрээний дүн,
-- manager_monthly_sales) өнгөөр ялгагдаж харагдана (<80% ногоон,
-- 80-100% шар, >100% улаан) — /marketing/budget.

CREATE TABLE IF NOT EXISTS marketing_budgets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    year        int  NOT NULL CHECK (year BETWEEN 2020 AND 2100),
    month       int  NOT NULL CHECK (month BETWEEN 1 AND 12),
    amount      numeric(14, 0) NOT NULL DEFAULT 0,
    note        text,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    UNIQUE (shop_id, year, month)
);

CREATE TABLE IF NOT EXISTS marketing_spend_entries (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    spent_at    date NOT NULL DEFAULT current_date,
    amount      numeric(14, 0) NOT NULL CHECK (amount >= 0),
    -- Канон жагсаалт: src/lib/marketing/budget.ts SPEND_CHANNELS
    channel     text NOT NULL DEFAULT 'other',
    note        text,
    created_by  uuid,
    created_at  timestamptz DEFAULT now(),
    deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_marketing_spend_shop_date
    ON marketing_spend_entries (shop_id, spent_at);

CREATE TABLE IF NOT EXISTS market_indicators (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    -- mortgage = ипотекийн зээл, bank = банкны нөхцөл, macro = макро, other
    category    text NOT NULL DEFAULT 'mortgage'
                CHECK (category IN ('mortgage', 'bank', 'macro', 'other')),
    name        text NOT NULL,   -- ж: «Хаан банк ипотек»
    value       text NOT NULL,   -- ж: «10.8% / 30 жил»
    note        text,            -- нөхцөл, тайлбар
    source_url  text,
    recorded_at date DEFAULT current_date,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_market_indicators_shop
    ON market_indicators (shop_id, category);

-- updated_at триггерүүд (20260701140000-ийн туслах функцыг дахин ашиглана)
DROP TRIGGER IF EXISTS trg_marketing_budgets_updated ON marketing_budgets;
CREATE TRIGGER trg_marketing_budgets_updated
    BEFORE UPDATE ON marketing_budgets
    FOR EACH ROW EXECUTE FUNCTION update_sales_targets_updated_at();
DROP TRIGGER IF EXISTS trg_market_indicators_updated ON market_indicators;
CREATE TRIGGER trg_market_indicators_updated
    BEFORE UPDATE ON market_indicators
    FOR EACH ROW EXECUTE FUNCTION update_sales_targets_updated_at();

-- RLS: shop-ийн гишүүнчлэлээр (эзэмшигч + гишүүн)
ALTER TABLE marketing_budgets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_spend_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_indicators      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_budgets_shop_access ON marketing_budgets;
CREATE POLICY marketing_budgets_shop_access ON marketing_budgets FOR ALL
    USING (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS marketing_spend_shop_access ON marketing_spend_entries;
CREATE POLICY marketing_spend_shop_access ON marketing_spend_entries FOR ALL
    USING (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS market_indicators_shop_access ON market_indicators;
CREATE POLICY market_indicators_shop_access ON market_indicators FOR ALL
    USING (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (shop_id IN (
        SELECT id FROM shops WHERE user_id = auth.uid()
        UNION SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    ));

COMMENT ON TABLE marketing_budgets IS 'Сар бүрийн маркетингийн төсөв (төсөв vs зарцуулалт vs орлогын хяналт)';
COMMENT ON TABLE marketing_spend_entries IS 'Маркетингийн бодит зарцуулалтын гар бүртгэл (сувгаар)';
COMMENT ON TABLE market_indicators IS 'Зах зээлийн үзүүлэлт: ипотекийн хүү, банкны нөхцөл, макро мэдээлэл';
