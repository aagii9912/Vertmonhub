-- Жилийн төслийн төсөв: 12 сарын нэг bulk upsert нь нэг transaction болно.
-- Байгууллагын marketing_budgets болон хуучин AI бичилтийг өөрчлөхгүй.
-- 20260921120000_marketing_performance.sql-ийн scope trigger-ийг дахин ашиглана.
CREATE TABLE IF NOT EXISTS marketing_project_budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    year int NOT NULL CHECK (year BETWEEN 2020 AND 2100),
    month int NOT NULL CHECK (month BETWEEN 1 AND 12),
    amount numeric(14,0) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shop_id, project_id, year, month)
);

ALTER TABLE marketing_project_budgets ENABLE ROW LEVEL SECURITY;
-- API нь module/operation, shop, project шалгалтыг хийсний дараа service_role ашиглана.
REVOKE ALL ON marketing_project_budgets FROM PUBLIC, anon, authenticated;
GRANT ALL ON marketing_project_budgets TO service_role;

DROP TRIGGER IF EXISTS marketing_project_budget_scope ON marketing_project_budgets;
CREATE TRIGGER marketing_project_budget_scope BEFORE INSERT OR UPDATE ON marketing_project_budgets
    FOR EACH ROW EXECUTE FUNCTION validate_marketing_scope();
DROP TRIGGER IF EXISTS marketing_project_budget_updated ON marketing_project_budgets;
CREATE TRIGGER marketing_project_budget_updated BEFORE UPDATE ON marketing_project_budgets
    FOR EACH ROW EXECUTE FUNCTION update_sales_targets_updated_at();

COMMENT ON TABLE marketing_project_budgets IS 'Төслийн жилийн маркетингийн төсвийн сарын хуваарилалт; байгууллагын нийт төсвөөс тусдаа';
