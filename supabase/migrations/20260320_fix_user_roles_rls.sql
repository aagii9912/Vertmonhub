-- Fix: user_roles RLS infinite recursion
-- The old policies check user_roles to authorize user_roles access, causing infinite recursion
-- Solution: Use admins table instead of self-referencing user_roles

-- Drop all old policies  
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;

-- New policies that check admins table (no recursion)
CREATE POLICY "Users can view own role"
    ON user_roles FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM admins
            WHERE admins.user_id = auth.uid()::text
            AND admins.is_active = true
        )
    );

CREATE POLICY "Admins can manage roles"
    ON user_roles FOR ALL
    TO authenticated
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

-- Also allow service_role to bypass (explicit)
CREATE POLICY "Service role bypass"
    ON user_roles FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
