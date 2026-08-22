import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ensureUserProvisioned } from '@/lib/auth/ensure-provisioned';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');

    if (code) {
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
                                cookieStore.set(name, value, options)
                            );
                        } catch {
                            // Ignore
                        }
                    },
                },
            }
        );

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        // Google/Facebook-ээр анх нэвтэрсэн хэрэглэгчид user_profiles ба
        // shop_members мөр үүсдэггүй байсан (handle_new_user триггерийг
        // 20260322_drop_auth_triggers.sql-д устгасан) тул getUserShop() null
        // буцааж бүх дашбоардын API 401 өгдөг байв. Энд гинжийг бүрдүүлнэ.
        if (!error && data?.user?.id) {
            await ensureUserProvisioned(data.user.id);
        }
    }

    return NextResponse.redirect(new URL('/dashboard', requestUrl.origin));
}
