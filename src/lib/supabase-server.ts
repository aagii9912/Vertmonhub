import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireSupabaseAnon } from './supabase-env';

/**
 * Create a Supabase client for Server Components, Route Handlers, and Server Actions.
 * Reads/writes auth cookies from the request.
 */
export async function createSupabaseServerClient() {
    const cookieStore = await cookies();
    const { url, anonKey } = requireSupabaseAnon();

    return createServerClient(
        url,
        anonKey,
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
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing sessions.
                    }
                },
            },
        }
    );
}
