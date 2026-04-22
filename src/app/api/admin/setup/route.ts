/**
 * Admin Setup API
 * This endpoint automatically sets up the current user as a super admin.
 * 
 * WARNING: This should be disabled or protected in production!
 */

import { NextResponse } from 'next/server';
import { getAuthUser, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { logger } from '@/lib/utils/logger';

const isProduction = process.env.NODE_ENV === 'production';

export async function GET() {
    if (isProduction) {
        return NextResponse.json({
            error: 'Endpoint disabled in production',
            hint: 'This setup endpoint is only available in development environment'
        }, { status: 403 });
    }

    try {
        const user = await getAuthUser();

        if (!user) {
            return NextResponse.json({
                error: 'Not authenticated',
                hint: 'Please sign in first at /auth/login'
            }, { status: 401 });
        }

        const userId = user.id;
        const email = user.email || 'admin@vertmonhub.mn';
        const supabase = supabaseAdmin();

        // Step 1: Check if admins table exists and fix schema if needed
        try {
            await supabase.rpc('exec_sql', {
                sql: `
                    DO $$ 
                    DECLARE r RECORD;
                    BEGIN
                        -- Drop policies first
                        FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'admins') LOOP
                            EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON admins';
                        END LOOP;
                        
                        -- Drop FK and change type
                        ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_user_id_fkey;
                        
                        -- Only alter if not already text
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name = 'admins' AND column_name = 'user_id' AND data_type = 'uuid'
                        ) THEN
                            ALTER TABLE admins ALTER COLUMN user_id TYPE text;
                        END IF;
                    END $$;
                `
            });
        } catch (rpcError) {
            // RPC might not exist, try direct approach
            logger.debug('RPC not available, using direct approach');
        }

        // Step 2: Try to insert/update admin record
        const { data: existingAdmin } = await supabase
            .from('admins')
            .select('id, user_id, email, role')
            .eq('email', email)
            .single();

        let result;

        if (existingAdmin) {
            // Update existing admin with new user_id
            const { data, error } = await supabase
                .from('admins')
                .update({
                    user_id: userId,
                    role: 'super_admin',
                    is_active: true
                })
                .eq('email', email)
                .select()
                .single();

            if (error) throw error;
            result = { action: 'updated', admin: data };
        } else {
            // Create new admin
            const { data, error } = await supabase
                .from('admins')
                .insert({
                    user_id: userId,
                    email: email,
                    role: 'super_admin',
                    is_active: true
                })
                .select()
                .single();

            if (error) throw error;
            result = { action: 'created', admin: data };
        }

        return NextResponse.json({
            success: true,
            message: `Super admin ${result.action} successfully!`,
            details: {
                user_id: userId,
                email: email,
                role: 'super_admin'
            },
            next_step: 'Now go to /admin to access the admin dashboard'
        });

    } catch (error: unknown) {
        const err = error as { message?: string; code?: string };
        console.error('Admin setup error:', err);

        // Check if it's a type mismatch error
        if (err.message?.includes('uuid') || err.code === '22P02') {
            return NextResponse.json({
                error: 'Database schema needs manual fix',
                hint: 'The admins.user_id column is still UUID type. Please update it in Supabase.'
            }, { status: 500 });
        }

        return NextResponse.json({
            error: err.message || 'Unknown error',
            hint: 'Check server logs for details'
        }, { status: 500 });
    }
}
