/**
 * Shared auth resolver for API routes
 *
 * ЗӨВХӨН Supabase Auth. Хуучин `vertmon-session` cookie-ийн дэмжлэгийг аюулгүй
 * байдлын аудитын дараа бүрмөсөн хассан: нэвтрэлтийн урсгал уг cookie-г
 * олгохоо больсон (`/api/auth/login` зөвхөн цэвэрлэдэг) байхад код нь түүнийг
 * хүлээн авсаар байсан тул нэвтрэлт тойрох боломж үүсгэж байв.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface ResolvedUser {
    id: string;
    email: string;
}

/**
 * Resolve the current authenticated user from the Supabase session.
 * Returns null if no valid session found.
 */
export async function resolveApiUser(): Promise<ResolvedUser | null> {
    const cookieStore = await cookies();

    try {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
            {
                cookies: {
                    getAll() { return cookieStore.getAll(); },
                    setAll(cookiesToSet: any[]) {
                        try { cookiesToSet.forEach(({ name, value, options }: any) => cookieStore.set(name, value, options)); } catch {}
                    },
                },
            }
        );
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            return { id: user.id, email: user.email || '' };
        }
    } catch {}

    return null;
}
