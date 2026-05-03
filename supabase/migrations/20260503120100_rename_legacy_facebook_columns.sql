-- Rename legacy Facebook/Instagram columns if a project was bootstrapped
-- with supabase/vertmonhub_complete_setup.sql instead of the migration
-- history. That setup file uses older column names that don't match what
-- the application code expects:
--
--   facebook_access_token         -> facebook_page_access_token
--   instagram_account_id          -> instagram_business_account_id
--
-- It also lacks instagram_username, which we add unconditionally.
--
-- Each block is a no-op when the modern column already exists, so this
-- migration is safe to run on databases that already followed the proper
-- migration sequence.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'shops'
          AND column_name = 'facebook_access_token'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'shops'
          AND column_name = 'facebook_page_access_token'
    ) THEN
        ALTER TABLE public.shops
            RENAME COLUMN facebook_access_token TO facebook_page_access_token;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'shops'
          AND column_name = 'instagram_account_id'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'shops'
          AND column_name = 'instagram_business_account_id'
    ) THEN
        ALTER TABLE public.shops
            RENAME COLUMN instagram_account_id TO instagram_business_account_id;
    END IF;
END $$;

ALTER TABLE public.shops
    ADD COLUMN IF NOT EXISTS instagram_username TEXT;
