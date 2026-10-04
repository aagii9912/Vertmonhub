import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, getAuthUser } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

const LoginSchema = z.object({
    // Админ хэрэглэгч үүсгэхдээ имэйлийг жижиг үсгээр хадгалдаг; нэвтрэлт ч мөн адил.
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    password: z.string().min(1).max(1024),
});

/**
 * POST /api/auth/login — Login via Supabase Auth
 *
 * Uses the @supabase/ssr server client so signInWithPassword's session is
 * persisted as sb-* auth cookies on the response. Without this, the browser
 * never receives a session and middleware bounces the user back to /auth/login.
 */
export async function POST(request: NextRequest) {
    try {
        const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Имэйл болон нууц үгээ зөв оруулна уу' },
                { status: 400 },
            );
        }
        const { email, password } = parsed.data;

        const supabase = await createSupabaseServerClient();
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
        const { data: roleData } = await supabaseAdmin()
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
        return NextResponse.json(
            { error: 'Нэвтрэх үед алдаа гарлаа. Дахин оролдоно уу' },
            { status: 500 },
        );
    }
}

/**
 * GET /api/auth/login — Check current session
 */
export async function GET() {
    try {
        const user = await getAuthUser();
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
    const supabase = await createSupabaseServerClient();
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
