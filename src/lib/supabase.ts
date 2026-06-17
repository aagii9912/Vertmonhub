import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseAnon, requireSupabaseService } from './supabase-env';

// Lazy singleton — created on first property access rather than at module load.
// This avoids "supabaseUrl is required" during Next.js page-data collection,
// where the module can be evaluated before the runtime env is wired up.
let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
    if (_supabase) return _supabase;
    const { url, anonKey } = requireSupabaseAnon();
    _supabase = createClient(url, anonKey);
    return _supabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
    get(_target, prop, receiver) {
        const client = getSupabase();
        const value = Reflect.get(client, prop, client);
        return typeof value === 'function' ? value.bind(client) : value;
    },
}) as SupabaseClient;

// Server-side client with service role key (for admin operations)
export const supabaseAdmin = (): SupabaseClient => {
    const { url, serviceKey } = requireSupabaseService();
    return createClient(url, serviceKey);
};
