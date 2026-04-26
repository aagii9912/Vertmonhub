import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/auth/login — Login via Supabase Auth
 * Uses signInWithPassword instead of direct pg password check
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

        // Use Supabase Auth to verify credentials
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error || !data.user) {
            return NextResponse.json(
                { error: 'Имэйл эсвэл нууц үг буруу байна' },
                { status: 401 }
            );
        }

        const user = data.user;

        // Get user role from user_roles table
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
            session: {
                access_token: data.session?.access_token,
                refresh_token: data.session?.refresh_token,
            },
        });

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
        
        // Check for Supabase session tokens in cookies
        const accessToken = cookieStore.getAll()
            .find(c => c.name.includes('auth-token') || c.name.includes('sb-'));
        
        if (!accessToken) {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }

        return NextResponse.json({ authenticated: true });
    } catch {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }
}

/**
 * DELETE /api/auth/login — Logout
 */
export async function DELETE() {
    const response = NextResponse.json({ success: true });
    
    // Clear legacy session cookie if it exists
    response.cookies.set('vertmon-session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    });
    
    return response;
}
