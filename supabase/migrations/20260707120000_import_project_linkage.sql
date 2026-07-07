-- Vertmon Hub: Админ дата импортын төсөл-холболт (2026-07-07)
-- /admin/import нь projectId-г сервер талд ашигладаг болсонтой хамт:
--   1) properties / leads-д project_id — нэг shop дотор олон төслийн өгөгдлийг ялгах.
--      (property_contracts.project_id аль хэдийн бий — migration 20260608190000.)
--   2) property_contracts.notes — импортын "Тэмдэглэл" багана алдагдахгүй хадгалагдана.
-- Импортын код багана байхгүй орчинд best-effort ажиллана (баганыг хасаад дахин
-- оролддог) тул энэ migration-ыг хожуу хийсэн ч импорт эвдрэхгүй.

-- ============================================
-- 1) properties.project_id
-- ============================================
ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_project
    ON properties(project_id) WHERE project_id IS NOT NULL;

COMMENT ON COLUMN properties.project_id IS 'Харьяалагдах барилгын төсөл (админ импортоос тамгалагдана)';

-- ============================================
-- 2) leads.project_id
-- ============================================
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_project
    ON leads(project_id) WHERE project_id IS NOT NULL;

COMMENT ON COLUMN leads.project_id IS 'Сонирхож буй барилгын төсөл (админ импортоос тамгалагдана)';

-- ============================================
-- 3) property_contracts.notes
-- ============================================
ALTER TABLE property_contracts
    ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN property_contracts.notes IS 'Чөлөөт тэмдэглэл (админ импортын "Тэмдэглэл" багана)';
