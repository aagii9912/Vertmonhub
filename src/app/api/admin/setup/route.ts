/**
 * Admin Setup API
 *
 * Bootstrap endpoint to grant the current authenticated user the `super_admin`
 * role. Disabled by default — only active when `ADMIN_SETUP_SECRET` is set in
 * the environment AND the request supplies the matching secret via the
 * `x-admin-setup-secret` header (or `?secret=` query param as a fallback).
 *
 * Without the env var the endpoint returns 404 so its existence is hidden.
 */

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { logger } from '@/lib/utils/logger';

function notFound() {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

function constantTimeEquals(a: string, b: string): boolean {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
}

export async function GET(request: NextRequest) {
    const expectedSecret = process.env.ADMIN_SETUP_SECRET;

    if (!expectedSecret || expectedSecret.length < 16) {
        return notFound();
    }

    const providedSecret =
        request.headers.get('x-admin-setup-secret') ||
        request.nextUrl.searchParams.get('secret') ||
        '';

    if (!providedSecret || !constantTimeEquals(providedSecret, expectedSecret)) {
        return notFound();
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

        try {
            await supabase.rpc('exec_sql', {
                sql: `
                    DO $$
                    DECLARE r RECORD;
                    BEGIN
                        FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'admins') LOOP
                            EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON admins';
                        END LOOP;

                        ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_user_id_fkey;

                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name = 'admins' AND column_name = 'user_id' AND data_type = 'uuid'
                        ) THEN
                            ALTER TABLE admins ALTER COLUMN user_id TYPE text;
                        END IF;
                    END $$;
                `
            });
        } catch {
            logger.debug('RPC not available, using direct approach');
        }

        const { data: existingAdmin } = await supabase
            .from('admins')
            .select('id, user_id, email, role')
            .eq('email', email)
            .single();

        let result;

        if (existingAdmin) {
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

        logger.info('Admin setup invoked', { userId, email, action: result.action });

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
        logger.error('Admin setup error', { error: err.message, code: err.code });

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
