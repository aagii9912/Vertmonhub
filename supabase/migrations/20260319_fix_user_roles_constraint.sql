-- Fix: Expand user_roles role CHECK constraint
-- The old constraint only allowed 4 roles, but the system now supports dynamic roles

-- Drop the old constraint
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;

-- Add expanded constraint that includes super_admin and common roles  
-- Using a more permissive check since roles are now dynamic
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check 
    CHECK (role IS NOT NULL AND length(role) > 0);
