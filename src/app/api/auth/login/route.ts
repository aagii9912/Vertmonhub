import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { cookies } from 'next/headers';
import crypto from 'crypto';

// Lazy-init pg pool
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

// Simple encryption for session cookie
const SESSION_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret-key-32chars-min!!';
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): string {
    const key = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
    const key = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * POST /api/auth/login — Custom login bypassing broken GoTrue
 * 1. Verify password via direct pg + pgcrypto
 * 2. Set encrypted session cookie
 * 3. Return user data
 */
export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Имэйл болон нууц үг шаардлагатай' },
                { status: 400 }
            );
        }

        // Verify password via direct pg
        const pool = getPool();
        const client = await pool.connect();
        let user: any = null;

        try {
            const result = await client.query(`
                SELECT 
                    u.id, 
                    u.email::text,
                    u.raw_user_meta_data->>'full_name' as full_name,
                    u.raw_app_meta_data,
                    COALESCE(r.role, 'viewer') as role
                FROM auth.users u
                LEFT JOIN public.user_roles r ON r.user_id = u.id
                WHERE u.email = $1::varchar 
                AND u.encrypted_password = extensions.crypt($2::text, u.encrypted_password)
            `, [email, password]);

            if (result.rows.length === 0) {
                return NextResponse.json(
                    { error: 'Имэйл эсвэл нууц үг буруу байна' },
                    { status: 401 }
                );
            }

            user = result.rows[0];

            // Update last_sign_in_at
            await client.query(
                'UPDATE auth.users SET last_sign_in_at = NOW(), updated_at = NOW() WHERE id = $1::uuid',
                [user.id]
            );
        } finally {
            client.release();
        }

        // Create session data
        const sessionData = {
            userId: user.id,
            email: user.email,
            fullName: user.full_name,
            role: user.role,
            loginAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
        };

        // Encrypt and set cookie
        const encrypted = encrypt(JSON.stringify(sessionData));

        const response = NextResponse.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
            },
        });

        response.cookies.set('vertmon-session', encrypted, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 24 * 60 * 60, // 24 hours
        });

        return response;

    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Нэвтрэх үед алдаа гарлаа: ' + (error.message || 'Unknown') },
            { status: 500 }
        );
    }
}

/**
 * GET /api/auth/login — Get current session
 */
export async function GET() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('vertmon-session');

        if (!sessionCookie) {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }

        try {
            const sessionData = JSON.parse(decrypt(sessionCookie.value));

            // Check expiry
            if (sessionData.expiresAt < Date.now()) {
                return NextResponse.json({ authenticated: false, error: 'Session expired' }, { status: 401 });
            }

            return NextResponse.json({
                authenticated: true,
                user: {
                    id: sessionData.userId,
                    email: sessionData.email,
                    full_name: sessionData.fullName,
                    role: sessionData.role,
                },
            });
        } catch {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }
    } catch {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }
}

/**
 * DELETE /api/auth/login — Logout
 */
export async function DELETE() {
    const response = NextResponse.json({ success: true });
    response.cookies.set('vertmon-session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    });
    return response;
}

// Export decrypt for use in middleware
export { decrypt };
