-- Vertmon Hub: ERP Phase 2 — Худалдан авалт & Зардал (AP)
-- Нийлүүлэгч, нэхэмжлэх (vendor bill) ба түүний мөрүүд. Bill төлөгдөхөд Phase 1-ийн
-- finance_transactions-д зарлага (disbursement) бичигдэнэ. project_id-аар Phase 3
-- (төслийн өртөг)-д холбогдоно.

-- ============================================
-- 1) Нийлүүлэгч (Vendors)
-- ============================================
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    registration VARCHAR(50),
    phone VARCHAR(50),
    email VARCHAR(255),
    bank_name VARCHAR(100),
    account_number VARCHAR(50),
    account_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_shop ON vendors(shop_id);

-- ============================================
-- 2) Нийлүүлэгчийн нэхэмжлэх (Vendor Bills / AP)
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    bill_number VARCHAR(100),
    bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    subtotal DECIMAL(18, 2) DEFAULT 0,
    vat_amount DECIMAL(18, 2) DEFAULT 0,
    total_amount DECIMAL(18, 2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(18, 2) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('draft', 'pending', 'partial', 'paid', 'cancelled')),
    note TEXT,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_bills_shop ON vendor_bills(shop_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bills_vendor ON vendor_bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bills_project ON vendor_bills(project_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bills_status ON vendor_bills(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_bills_due ON vendor_bills(shop_id, due_date);

-- ============================================
-- 3) Нэхэмжлэхийн мөр (зардлын ангилал тус бүрд)
-- ============================================
CREATE TABLE IF NOT EXISTS bill_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES vendor_bills(id) ON DELETE CASCADE,
    description VARCHAR(500),
    account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    amount DECIMAL(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_lines_bill ON bill_lines(bill_id);

-- RLS — серверийн service-role хандана (API routes). Анхдагчаар хаалттай.
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_lines ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE vendors IS 'ERP: нийлүүлэгчийн бүртгэл';
COMMENT ON TABLE vendor_bills IS 'ERP: нийлүүлэгчийн нэхэмжлэх (өглөг/AP)';
COMMENT ON TABLE bill_lines IS 'ERP: нэхэмжлэхийн мөр (данс тус бүрийн зардал)';
