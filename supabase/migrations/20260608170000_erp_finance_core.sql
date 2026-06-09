-- Vertmon Hub: ERP Phase 1 — Санхүүгийн цөм (Chart of Accounts + кассын дэвтэр + НӨАТ)
-- CRM-ийн дараа ар талын санхүүг native байдлаар босгоно. Орлого/AR-ыг property_contracts/
-- payment_schedules дээр суурилуулж, шинэ давхар "орлого" хадгалахгүй — зөвхөн бодит мөнгөн
-- гүйлгээг finance_transactions-д бичнэ.

-- ============================================
-- 1) Дансны төлөвлөгөө (Chart of Accounts)
-- ============================================
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
    parent_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(shop_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coa_shop ON chart_of_accounts(shop_id);
CREATE INDEX IF NOT EXISTS idx_coa_type ON chart_of_accounts(shop_id, type);

-- Анхдагч Монгол дансны жагсаалтыг shop бүрд seed хийнэ (давхардахгүй)
INSERT INTO chart_of_accounts (shop_id, code, name, type)
SELECT s.id, a.code, a.name, a.type
FROM shops s
CROSS JOIN (VALUES
    ('1000', 'Касс', 'asset'),
    ('1100', 'Харилцах данс (банк)', 'asset'),
    ('1200', 'Худалдааны авлага', 'asset'),
    ('1300', 'Бараа материал', 'asset'),
    ('2000', 'Худалдааны өглөг', 'liability'),
    ('2100', 'НӨАТ-ын өглөг', 'liability'),
    ('3000', 'Эзэмшигчийн өмч', 'equity'),
    ('4000', 'Борлуулалтын орлого', 'income'),
    ('5000', 'Борлуулалтын өртөг', 'expense'),
    ('5100', 'Үйл ажиллагааны зардал', 'expense')
) AS a(code, name, type)
ON CONFLICT (shop_id, code) DO NOTHING;

-- ============================================
-- 2) Кассын/гүйлгээний дэвтэр (бодит мөнгөн орлого/зарлага)
-- ============================================
CREATE TABLE IF NOT EXISTS finance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    txn_date DATE NOT NULL DEFAULT CURRENT_DATE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('receipt', 'disbursement')),
    amount DECIMAL(18, 2) NOT NULL,
    vat_amount DECIMAL(18, 2) DEFAULT 0,
    method VARCHAR(30),  -- cash, bank, barter, mortgage
    account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    contract_id UUID REFERENCES property_contracts(id) ON DELETE SET NULL,
    payment_schedule_id UUID REFERENCES payment_schedules(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    note TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_txn_shop ON finance_transactions(shop_id);
CREATE INDEX IF NOT EXISTS idx_fin_txn_date ON finance_transactions(shop_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_txn_type ON finance_transactions(shop_id, type);
CREATE INDEX IF NOT EXISTS idx_fin_txn_contract ON finance_transactions(contract_id);
CREATE INDEX IF NOT EXISTS idx_fin_txn_project ON finance_transactions(project_id);

-- ============================================
-- 3) НӨАТ талбар (property_contracts)
-- ============================================
ALTER TABLE property_contracts ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5, 2) DEFAULT 10;
ALTER TABLE property_contracts ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(18, 2);

-- ============================================
-- 4) RLS — серверийн service-role хандана (API routes). Анхдагчаар хаалттай.
-- ============================================
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE chart_of_accounts IS 'ERP: дансны төлөвлөгөө (shop тус бүрд)';
COMMENT ON TABLE finance_transactions IS 'ERP: бодит мөнгөн орлого/зарлагын дэвтэр (cash-basis)';
COMMENT ON COLUMN property_contracts.vat_amount IS 'Гэрээний дүнгээс тооцсон НӨАТ (10%)';
