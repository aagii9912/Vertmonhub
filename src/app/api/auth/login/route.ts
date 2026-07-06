import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/auth/login — Login via Supabase Auth
 *
 * Uses the @supabase/ssr server client so signInWithPassword's session is
 * persisted as sb-* auth cookies on the response. Without this, the browser
 * never receives a session and middleware bounces the user back to /auth/login.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        // Имэйл/нууц үгийн үл үзэгдэх хоосон зай нэвтрэлтийг санамсаргүй унагадаг.
        // Нууц үгийг үүсгэх тал (POST /api/admin/users) trim хийдэг тул энд trim
        // хийх нь аюулгүй — чатаар хуулахад ордог сүүлчийн зай/мөрийг арилгана.
        const email = typeof body.email === 'string' ? body.email.trim() : body.email;
        const password = typeof body.password === 'string' ? body.password.trim() : body.password;

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Имэйл болон нууц үг шаардлагатай' },
                { status: 400 },
            );
        }

        const cookieStore = await cookies();

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options),
                            );
                        } catch {
                            // Route handler context — set should always succeed
                        }
                    },
                },
            },
        );

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error || !data.user) {
            console.error('signInWithPassword failed:', error?.code, error?.message);
            // Оношлогдохуйц тохиолдлуудыг ялгаж мэдээлнэ — бүгдийг "нууц үг буруу"
            // болгож нугалснаас админ жинхэнэ шалтгааныг олж чаддаггүй байв.
            const code = error?.code || '';
            const message = error?.message || '';
            let userError = 'Имэйл эсвэл нууц үг буруу байна';
            if (code === 'email_not_confirmed') {
                userError = 'Имэйл баталгаажаагүй байна — админд хандаж нууц үгээ шинэчлүүлнэ үү';
            } else if (code === 'over_request_rate_limit' || error?.status === 429) {
                userError = 'Хэт олон оролдлого хийгдлээ — хэсэг хүлээгээд дахин оролдоно уу';
            } else if (code === 'email_provider_disabled' || /logins are disabled/i.test(message)) {
                userError = 'Имэйл/нууц үгээр нэвтрэх идэвхгүй байна — админ Supabase Auth тохиргоог шалгана уу';
            } else if (code === 'user_banned') {
                userError = 'Энэ бүртгэл түр хаагдсан байна — админд хандана уу';
            }
            return NextResponse.json({ error: userError, code: code || undefined }, { status: 401 });
        }

        const user = data.user;

        // Look up role with service-role client (bypasses RLS)
        const adminSupabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const { data: roleData } = await adminSupabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single();

        const role = roleData?.role || 'viewer';

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || null,
                role,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        const message = err instanceof Error ? err.message : 'Unknown';
        return NextResponse.json(
            { error: 'Нэвтрэх үед алдаа гарлаа: ' + message },
            { status: 500 },
        );
    }
}

/**
 * GET /api/auth/login — Check current session
 */
export async function GET() {
    try {
        const cookieStore = await cookies();

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll() {
                        // No-op for GET
                    },
                },
            },
        );

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }
        return NextResponse.json({ authenticated: true, user_id: user.id });
    } catch {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }
}

/**
 * DELETE /api/auth/login — Logout
 */
export async function DELETE() {
    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options),
                    );
                },
            },
        },
    );

    await supabase.auth.signOut();

    const response = NextResponse.json({ success: true });

    // Clear legacy custom cookie if it exists
    response.cookies.set('vertmon-session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    });

    return response;
}
