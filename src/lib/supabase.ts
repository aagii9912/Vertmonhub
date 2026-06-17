import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseService } from './supabase-env';
import { createSupabaseBrowserClient } from './supabase-browser';

/**
 * Browser Supabase client.
 *
 * Cookie-д суурилсан НЭГ session (AuthContext + middleware-тэй хуваалцдаг,
 * middleware шинэчилж байдаг) дээр тулгуурлана — өмнө нь localStorage-ийн
 * тусдаа session ашигладаг байсан тул хуучирч 401 (Unauthorized) өгдөг байв.
 * Lazy Proxy — зөвхөн браузерт (эхний хандалтад) instantiate болно.
 */
export const supabase = new Proxy({} as SupabaseClient, {
    get(_target, prop, receiver) {
        const client = createSupabaseBrowserClient();
        const value = Reflect.get(client, prop, client);
        return typeof value === 'function' ? value.bind(client) : value;
    },
}) as SupabaseClient;

// Server-side client with service role key (for admin operations)
export const supabaseAdmin = (): SupabaseClient => {
    const { url, serviceKey } = requireSupabaseService();
    return createClient(url, serviceKey);
};
