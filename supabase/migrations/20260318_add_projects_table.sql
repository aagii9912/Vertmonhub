-- Projects table for real estate projects (Төсөл)
-- Each project groups properties, leads, contracts together

CREATE TABLE IF NOT EXISTS projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location TEXT,
    district TEXT,
    total_blocks INTEGER,
    total_floors TEXT,
    total_units INTEGER,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'planned', 'on_hold')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_projects_shop_id ON projects(shop_id);

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view projects"
    ON projects FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Admins can manage projects"
    ON projects FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admins
            WHERE admins.user_id = auth.uid()::text
            AND admins.is_active = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admins
            WHERE admins.user_id = auth.uid()::text
            AND admins.is_active = true
        )
    );

-- Trigger for updated_at
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
