import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Create a Supabase client for Client Components (browser-side).
 * Uses cookie-based auth session automatically.
 * Returns a singleton to avoid "Multiple GoTrueClient instances" warning.
 */
let browserClient: SupabaseClient | null = null;

export function createSupabaseBrowserClient() {
    if (browserClient) return browserClient;

    browserClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    return browserClient;
}
