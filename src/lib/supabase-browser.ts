import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseAnon } from './supabase-env';

/**
 * Create a Supabase client for Client Components (browser-side).
 * Uses cookie-based auth session automatically.
 * Returns a singleton to avoid "Multiple GoTrueClient instances" warning.
 */
let browserClient: SupabaseClient | null = null;

export function createSupabaseBrowserClient() {
    if (browserClient) return browserClient;

    const { url, anonKey } = requireSupabaseAnon();
    browserClient = createBrowserClient(url, anonKey);
    return browserClient;
}
