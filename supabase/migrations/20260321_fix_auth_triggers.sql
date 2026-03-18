-- Fix: Make handle_new_user trigger more resilient
-- Add EXCEPTION handler so trigger failures don't block user creation

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_profiles (id, email, full_name, created_at, updated_at)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    -- Log but don't fail — user creation should not be blocked
    RAISE WARNING 'handle_new_user failed for %: %', NEW.email, SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also fix handle_new_admin with exception handling
CREATE OR REPLACE FUNCTION public.handle_new_admin()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    IF NEW.email IN ('admin@smarthub.mn', 'info@syncly.mn', 'aagii9912@gmail.com') THEN
      INSERT INTO public.admins (user_id, email, role, is_active)
      VALUES (NEW.id::text, NEW.email, 'super_admin', true)
      ON CONFLICT (email) DO UPDATE
      SET role = 'super_admin', is_active = true, user_id = NEW.id::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_admin failed for %: %', NEW.email, SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also handle potential email uniqueness issue in user_profiles
-- Drop and recreate email unique constraint to handle edge cases
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_email_key;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_email_key UNIQUE (email);
