-- Migration: Fix Database Schema for Clerk IDs (Handle RLS Policies)
-- Purpose: Change user_id columns to TEXT by first dropping dependent policies

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- 1. DROP POLICIES ON SHOPS
    -- Loop through all policies on 'shops' table and drop them to free up the column
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'shops') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON shops';
    END LOOP;

    -- 2. DROP POLICIES ON FACEBOOK_TOKENS
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'facebook_tokens') THEN
        FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'facebook_tokens') LOOP
            EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON facebook_tokens';
        END LOOP;
    END IF;

    -- 3. DROP POLICIES ON USER_FACEBOOK_PAGES
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_facebook_pages') THEN
        FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'user_facebook_pages') LOOP
            EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON user_facebook_pages';
        END LOOP;
    END IF;

    -- 3.1. DROP POLICIES ON CARTS (Fix for dependency error)
    -- Explicitly drop the known conflicting policy if it exists
    BEGIN
        DROP POLICY IF EXISTS "Users can manage own shop carts" ON carts;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Ignore if table doesn't exist
    END;

    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'carts') THEN
        FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'carts') LOOP
            EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON carts';
        END LOOP;
    END IF;

    -- 4. DROP FOREIGN KEY CONSTRAINTS
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'shops') THEN
        ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_user_id_fkey;
        ALTER TABLE shops ALTER COLUMN user_id TYPE text;
    END IF;

    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'facebook_tokens') THEN
        ALTER TABLE facebook_tokens DROP CONSTRAINT IF EXISTS facebook_tokens_user_id_fkey;
        ALTER TABLE facebook_tokens ALTER COLUMN user_id TYPE text;
    END IF;

    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_facebook_pages') THEN
        ALTER TABLE user_facebook_pages DROP CONSTRAINT IF EXISTS user_facebook_pages_user_id_fkey;
        ALTER TABLE user_facebook_pages ALTER COLUMN user_id TYPE text;
    END IF;

    -- 5. RE-CREATE POLICIES (Updated for TEXT type)
    -- Note: We cast auth.uid() to text to match the new column type
    
    -- Shops Policies
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'shops') THEN
        EXECUTE 'CREATE POLICY "Users can view own shops" ON shops FOR SELECT USING (user_id = auth.uid()::text)';
        EXECUTE 'CREATE POLICY "Users can create shops" ON shops FOR INSERT WITH CHECK (user_id = auth.uid()::text)';
        EXECUTE 'CREATE POLICY "Users can update own shops" ON shops FOR UPDATE USING (user_id = auth.uid()::text)';
    END IF;

    -- Facebook Tokens Policies
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'facebook_tokens') THEN
        EXECUTE 'CREATE POLICY "Users can manage own FB tokens" ON facebook_tokens FOR ALL USING (user_id = auth.uid()::text)';
    END IF;

END $$;

SELECT 'Successfully updated schema and refreshed policies' as result;
