-- CRITICAL FIX: Drop auth triggers that block user creation
-- The handle_new_user trigger causes "Database error creating new user"  
-- because any trigger failure on auth.users rolls back the entire transaction
-- Solution: move user_profiles creation to application code

-- Drop the problematic triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;

-- Keep the functions but they won't be auto-triggered
-- user_profiles creation will be handled by API code after auth user is created
