import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getClerkUser } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { Pool } from 'pg';

// Lazy-init pg pool for direct DB access (user creation)
let pgPool: Pool | null = null;
function getPool(): Pool {
    if (!pgPool) {
        pgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 2,
        });
    }
    return pgPool;
}

/**
 * GET /api/admin/users — List all users with roles
 * Uses direct pg connection (GoTrue admin.listUsers fails)
 */
export async function GET() {
    try {
        const userId = await getClerkUser();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check admin
        const { data: admin } = await supabase.from('admins').select('role').eq('user_id', userId).single();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        // Get all users via direct pg (GoTrue listUsers returns empty)
        const pool = getPool();
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT 
                    u.id,
                    u.email::text,
                    u.raw_user_meta_data->>'full_name' as full_name,
                    COALESCE(r.role, 'viewer') as role,
                    u.created_at
                FROM auth.users u
                LEFT JOIN public.user_roles r ON r.user_id = u.id
                ORDER BY u.created_at DESC
            `);

            const users = result.rows.map(u => ({
                id: u.id,
                email: u.email || '',
                full_name: u.full_name || null,
                role: u.role || 'viewer',
                created_at: u.created_at,
            }));

            return NextResponse.json({ users });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('GET /api/admin/users error:', error);
        return safeErrorResponse(error, 'Хэрэглэгчдийн жагсаалт унших үед алдаа гарлаа');
    }
}

/**
 * PATCH /api/admin/users — Update user role
 */
export async function PATCH(request: NextRequest) {
    try {
        const userId = await getClerkUser();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check admin
        const { data: admin } = await supabase.from('admins').select('role').eq('user_id', userId).single();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const { userId: targetUserId, role } = await request.json();

        if (!targetUserId || !role) {
            return NextResponse.json({ error: 'userId and role required' }, { status: 400 });
        }

        // Upsert role
        const { error } = await supabase
            .from('user_roles')
            .upsert({ user_id: targetUserId, role }, { onConflict: 'user_id' });

        if (error) return safeErrorResponse(error, 'Хэрэглэгчийн эрх шинэчлэх үед алдаа гарлаа');

        return NextResponse.json({ success: true, message: `Role updated to ${role}` });
    } catch (error) {
        return safeErrorResponse(error, 'Хэрэглэгчийн эрх шинэчлэх үед алдаа гарлаа');
    }
}

/**
 * POST /api/admin/users — Create a new user (admin only)
 * Uses direct PostgreSQL connection to bypass GoTrue API issues
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getClerkUser();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        // Check admin
        const { data: admin } = await supabase.from('admins').select('role').eq('user_id', userId).single();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin required' }, { status: 403 });
        }

        const { email, password, full_name, role } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Имэйл болон нууц үг шаардлагатай' }, { status: 400 });
        }

        if (password.length < 8) {
            return NextResponse.json({ error: 'Нууц үг хамгийн багадаа 8 тэмдэгт байх ёстой' }, { status: 400 });
        }

        const pool = getPool();
        const client = await pool.connect();

        try {
            await client.query('BEGIN');
            await client.query("SET search_path TO auth, public, extensions;");

            // Check if email already exists
            const existing = await client.query(
                'SELECT id FROM auth.users WHERE email = $1::varchar',
                [email]
            );
            if (existing.rows.length > 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Энэ имэйл хаягаар бүртгэл үүссэн байна' }, { status: 409 });
            }

            // Create auth user with hashed password
            const createResult = await client.query(`
                INSERT INTO auth.users (
                    id, instance_id, aud, role, email, encrypted_password,
                    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                    is_sso_user, is_anonymous, created_at, updated_at,
                    confirmation_token, recovery_token, email_change_token_new, email_change_token_current
                ) VALUES (
                    gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid,
                    'authenticated'::varchar, 'authenticated'::varchar, $1::varchar,
                    extensions.crypt($2::text, extensions.gen_salt('bf')),
                    NOW(),
                    '{"provider":"email","providers":["email"]}'::jsonb,
                    jsonb_build_object('full_name', $3::text, 'email', $1::text),
                    false, false, NOW(), NOW(),
                    ''::varchar, ''::varchar, ''::varchar, ''::varchar
                ) RETURNING id
            `, [email, password, full_name || email]);

            const newUserId = createResult.rows[0].id;

            // Create identity record (required for Supabase login)
            await client.query(`
                INSERT INTO auth.identities (
                    id, provider_id, user_id, identity_data, provider,
                    last_sign_in_at, created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), $1::text, $1::uuid,
                    jsonb_build_object('sub', $1::text, 'email', $2::text, 'full_name', $3::text, 'email_verified', false),
                    'email'::text, NOW(), NOW(), NOW()
                )
            `, [newUserId, email, full_name || email]);

            // Create user_profiles entry
            await client.query(`
                INSERT INTO public.user_profiles (id, email, full_name, created_at, updated_at)
                VALUES ($1::uuid, $2::text, $3::text, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE SET email = $2::text, full_name = $3::text, updated_at = NOW()
            `, [newUserId, email, full_name || email]);

            // Assign role if provided
            let roleWarning: string | null = null;
            if (role) {
                try {
                    await client.query(`
                        INSERT INTO public.user_roles (id, user_id, role, created_at, updated_at)
                        VALUES (gen_random_uuid(), $1::uuid, $2::text, NOW(), NOW())
                        ON CONFLICT (user_id) DO UPDATE SET role = $2::text, updated_at = NOW()
                    `, [newUserId, role]);
                } catch (roleErr: any) {
                    roleWarning = 'Дүр оноох үед алдаа: ' + roleErr.message;
                    console.error('Role assignment warning:', roleErr.message);
                }
            }

            await client.query('COMMIT');

            return NextResponse.json({
                success: true,
                warning: roleWarning,
                user: {
                    id: newUserId,
                    email,
                    full_name: full_name || null,
                    role: role || 'viewer',
                    created_at: new Date().toISOString(),
                },
            }, { status: 201 });
        } catch (dbError: any) {
            await client.query('ROLLBACK');
            console.error('DB transaction error:', dbError);
            return NextResponse.json({ error: 'Хэрэглэгч үүсгэх үед DB алдаа: ' + dbError.message }, { status: 500 });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('POST /api/admin/users full error:', error);
        return safeErrorResponse(error, 'Хэрэглэгч үүсгэх үед алдаа гарлаа');
    }
}
