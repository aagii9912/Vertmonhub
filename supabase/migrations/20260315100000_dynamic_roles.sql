-- Dynamic Role-Based Access Control
-- Super admin-д custom role үүсгэх, module permissions удирдах боломж олгоно

-- ========================================
-- 1. roles table
-- ========================================
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    display_name_mn TEXT NOT NULL,
    description TEXT,
    can_write BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_access_admin BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 2. role_permissions table
-- ========================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    module TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, module)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

-- ========================================
-- 3. RLS
-- ========================================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Roles: anyone authenticated can read (needed for sidebar filtering)
CREATE POLICY "Authenticated users can read roles"
    ON roles FOR SELECT TO authenticated USING (true);

-- Roles: only super admins can insert/update/delete
CREATE POLICY "Super admins can manage roles"
    ON roles FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admins
            WHERE admins.user_id = auth.uid()::text
            AND admins.role = 'super_admin'
            AND admins.is_active = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admins
            WHERE admins.user_id = auth.uid()::text
            AND admins.role = 'super_admin'
            AND admins.is_active = true
        )
    );

-- Role permissions: anyone authenticated can read
CREATE POLICY "Authenticated users can read role_permissions"
    ON role_permissions FOR SELECT TO authenticated USING (true);

-- Role permissions: only super admins can manage
CREATE POLICY "Super admins can manage role_permissions"
    ON role_permissions FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admins
            WHERE admins.user_id = auth.uid()::text
            AND admins.role = 'super_admin'
            AND admins.is_active = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admins
            WHERE admins.user_id = auth.uid()::text
            AND admins.role = 'super_admin'
            AND admins.is_active = true
        )
    );

-- ========================================
-- 4. Auto-update trigger
-- ========================================
CREATE OR REPLACE FUNCTION update_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION update_roles_updated_at();

-- ========================================
-- 5. Seed default roles
-- ========================================
DO $$
DECLARE
    v_admin_id UUID;
    v_sales_id UUID;
    v_marketing_id UUID;
    v_viewer_id UUID;
BEGIN
    -- Admin role
    INSERT INTO roles (name, display_name, display_name_mn, description, can_write, can_delete, can_access_admin, is_system)
    VALUES ('admin', 'Admin', 'Админ', 'Бүх хандалтын эрхтэй', true, true, true, true)
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO v_admin_id;

    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM roles WHERE name = 'admin';
    END IF;

    -- Sales Manager role
    INSERT INTO roles (name, display_name, display_name_mn, description, can_write, can_delete, can_access_admin, is_system)
    VALUES ('sales_manager', 'Sales Manager', 'Борлуулалтын менежер', 'Борлуулалтын бүх хэрэгслүүд', true, false, false, true)
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO v_sales_id;

    IF v_sales_id IS NULL THEN
        SELECT id INTO v_sales_id FROM roles WHERE name = 'sales_manager';
    END IF;

    -- Marketing role
    INSERT INTO roles (name, display_name, display_name_mn, description, can_write, can_delete, can_access_admin, is_system)
    VALUES ('marketing', 'Marketing', 'Маркетинг', 'Маркетинг, ROI, судалгаа хэрэгслүүд', true, false, false, true)
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO v_marketing_id;

    IF v_marketing_id IS NULL THEN
        SELECT id INTO v_marketing_id FROM roles WHERE name = 'marketing';
    END IF;

    -- Viewer role
    INSERT INTO roles (name, display_name, display_name_mn, description, can_write, can_delete, can_access_admin, is_system)
    VALUES ('viewer', 'Viewer', 'Зөвхөн харагч', 'Зөвхөн тайлан, самбар харах', false, false, false, true)
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO v_viewer_id;

    IF v_viewer_id IS NULL THEN
        SELECT id INTO v_viewer_id FROM roles WHERE name = 'viewer';
    END IF;

    -- ========================================
    -- 6. Seed module permissions
    -- ========================================

    -- Admin: all 14 modules
    INSERT INTO role_permissions (role_id, module) VALUES
        (v_admin_id, 'dashboard'),
        (v_admin_id, 'properties'),
        (v_admin_id, 'leads'),
        (v_admin_id, 'viewings'),
        (v_admin_id, 'contracts'),
        (v_admin_id, 'customers'),
        (v_admin_id, 'inbox'),
        (v_admin_id, 'reports'),
        (v_admin_id, 'reports-leads'),
        (v_admin_id, 'marketing-roi'),
        (v_admin_id, 'surveys'),
        (v_admin_id, 'ai-assistant'),
        (v_admin_id, 'ai-settings'),
        (v_admin_id, 'settings')
    ON CONFLICT (role_id, module) DO NOTHING;

    -- Sales Manager: 10 modules
    INSERT INTO role_permissions (role_id, module) VALUES
        (v_sales_id, 'dashboard'),
        (v_sales_id, 'properties'),
        (v_sales_id, 'leads'),
        (v_sales_id, 'viewings'),
        (v_sales_id, 'contracts'),
        (v_sales_id, 'customers'),
        (v_sales_id, 'inbox'),
        (v_sales_id, 'reports'),
        (v_sales_id, 'reports-leads'),
        (v_sales_id, 'ai-assistant')
    ON CONFLICT (role_id, module) DO NOTHING;

    -- Marketing: 9 modules
    INSERT INTO role_permissions (role_id, module) VALUES
        (v_marketing_id, 'dashboard'),
        (v_marketing_id, 'marketing-roi'),
        (v_marketing_id, 'reports'),
        (v_marketing_id, 'reports-leads'),
        (v_marketing_id, 'surveys'),
        (v_marketing_id, 'ai-assistant'),
        (v_marketing_id, 'ai-settings'),
        (v_marketing_id, 'leads'),
        (v_marketing_id, 'customers')
    ON CONFLICT (role_id, module) DO NOTHING;

    -- Viewer: 2 modules
    INSERT INTO role_permissions (role_id, module) VALUES
        (v_viewer_id, 'dashboard'),
        (v_viewer_id, 'reports')
    ON CONFLICT (role_id, module) DO NOTHING;

    RAISE NOTICE 'Dynamic roles seeded: admin=%, sales=%, marketing=%, viewer=%',
        v_admin_id, v_sales_id, v_marketing_id, v_viewer_id;
END $$;

-- Comments
COMMENT ON TABLE roles IS 'Dynamic role definitions for RBAC';
COMMENT ON TABLE role_permissions IS 'Module-level permissions per role';
