import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseService } from './supabase-env';

/**
 * Service-role client — зөвхөн сервер талд (webhook, cron, auth/RBAC шалгалт хийсэн API).
 * RLS-ийг тойрдог тул дуудахаас өмнө эрх ба shop-ийн хилийг заавал шалгана.
 * Browser талд `@/lib/supabase-browser`-ийг ашиглана.
 */
export const supabaseAdmin = (): SupabaseClient => {
    const { url, serviceKey } = requireSupabaseService();
    return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
};
