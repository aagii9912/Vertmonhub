-- Create user via direct SQL to bypass GoTrue API bug
-- This function creates auth user + identity in a single transaction

CREATE OR REPLACE FUNCTION public.create_auth_user(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_encrypted_password TEXT;
BEGIN
    -- Check if email already exists
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
    IF v_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'User with email % already exists', p_email;
    END IF;

    -- Generate user ID
    v_user_id := gen_random_uuid();
    
    -- Hash password using pgcrypto (same as GoTrue uses)
    v_encrypted_password := crypt(p_password, gen_salt('bf'));

    -- Insert into auth.users
    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_sso_user,
        is_anonymous,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change_token_current
    ) VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        p_email,
        v_encrypted_password,
        NOW(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', COALESCE(p_full_name, p_email), 'email', p_email),
        false,
        false,
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    );

    -- Insert identity record (required for login)
    INSERT INTO auth.identities (
        id,
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at,
        email
    ) VALUES (
        gen_random_uuid(),
        v_user_id::text,
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'full_name', COALESCE(p_full_name, p_email)),
        'email',
        NOW(),
        NOW(),
        NOW(),
        p_email
    );

    RETURN v_user_id;
END;
$$;

-- Grant execute to service_role (our admin API uses this)
GRANT EXECUTE ON FUNCTION public.create_auth_user TO service_role;
