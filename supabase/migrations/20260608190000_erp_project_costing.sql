-- Vertmon Hub: ERP Phase 3 — Төслийн өртөг & Төсөв
-- Гэрээг төсөлтэй холбож (орлого), Phase 2-ийн bills (зардал) дээр суурилан төсөл тус бүрийн
-- орлого vs өртөг → margin, төсөв vs гүйцэтгэлийг тооцоолно.

-- 1) Гэрээ ↔ төсөл холбоос
ALTER TABLE property_contracts
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_prop_contracts_project ON property_contracts(project_id);

-- 2) Төслийн төсөв (ангилал = данс тус бүрд төлөвлөсөн дүн)
CREATE TABLE IF NOT EXISTS project_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    label VARCHAR(255),
    planned_amount DECIMAL(18, 2) NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_budgets_shop ON project_budgets(shop_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_project ON project_budgets(project_id);

ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN property_contracts.project_id IS 'Холбоотой төсөл (өртгийн төв)';
COMMENT ON TABLE project_budgets IS 'ERP: төслийн төсөв (данс/ангилал тус бүрд төлөвлөсөн дүн)';
