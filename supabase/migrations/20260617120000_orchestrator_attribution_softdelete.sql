-- AI Orchestrator: sales-manager attribution + soft-delete for CRM/sales entities
-- Үүсгэх/устгах үйлдлийг борлуулалтын менежерийн нэртэй хадгална.

-- Sales manager name attribution (property_contracts аль хэдийн sales_manager TEXT-тэй)
ALTER TABLE leads             ADD COLUMN IF NOT EXISTS sales_manager_name TEXT;
ALTER TABLE property_viewings ADD COLUMN IF NOT EXISTS sales_manager_name TEXT;
ALTER TABLE customers         ADD COLUMN IF NOT EXISTS sales_manager_name TEXT;

-- Soft-delete (leads аль хэдийн deleted_at-тэй: 20260617100000)
ALTER TABLE property_viewings  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE property_contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE customers          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_property_viewings_deleted_at  ON property_viewings  (shop_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_property_contracts_deleted_at ON property_contracts (shop_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at          ON customers          (shop_id, deleted_at);

COMMENT ON COLUMN leads.sales_manager_name IS 'Орчестратороор үүсгэсэн/өөрчилсөн борлуулалтын менежерийн нэр';
COMMENT ON COLUMN property_viewings.sales_manager_name IS 'Орчестратороор товлосон борлуулалтын менежерийн нэр';
COMMENT ON COLUMN customers.sales_manager_name IS 'Орчестратороор үүсгэсэн борлуулалтын менежерийн нэр';
