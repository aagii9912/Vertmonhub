/**
 * Shared auth resolver for API routes.
 *
 * Supabase Auth is the only supported source — the legacy `vertmon-session`
 * cookie was retired and is no longer written by the login flow. The DELETE
 * branch of /api/auth/login still clears any straggler cookies on logout.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface ResolvedUser {
    id: string;
    email: string;
}

/**
 * Resolve the current authenticated user from the Supabase session.
 * Returns null if no valid session is present.
 */
export async function resolveApiUser(): Promise<ResolvedUser | null> {
    const cookieStore = await cookies();

    try {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll(); },
                    setAll(cookiesToSet) {
                        try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
                    },
                },
            }
        );
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            return { id: session.user.id, email: session.user.email || '' };
        }
    } catch {}

    return null;
}
