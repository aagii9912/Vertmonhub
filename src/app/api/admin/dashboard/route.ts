/** Admin Dashboard API — бодит CRM тоонууд. */

import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

export async function GET() {
    try {
        const admin = await getAdminUser();

        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();
        const count = (table: string, filter?: (q: any) => any) => {
            let q = supabase.from(table).select('id', { count: 'exact', head: true });
            if (filter) q = filter(q);
            return q.then((r: { count: number | null; error: unknown }) => {
                if (r.error) throw r.error;
                return r.count ?? 0;
            });
        };

        const [totalShops, users, leads, contracts, customers, viewings, recentShopsResult] = await Promise.all([
            count('shops'),
            count('user_profiles'),
            count('leads', (q) => q.is('deleted_at', null)),
            count('property_contracts', (q) => q.is('deleted_at', null)),
            count('customers', (q) => q.is('deleted_at', null)),
            count('property_viewings', (q) => q.is('deleted_at', null)),
            supabase.from('shops')
                .select('id, name, created_at')
                .order('created_at', { ascending: false })
                .limit(5),
        ]);
        if (recentShopsResult.error) throw recentShopsResult.error;

        return NextResponse.json({
            stats: { total_shops: totalShops },
            crm: { users, leads, contracts, customers, viewings },
            recent_shops: recentShopsResult.data || [],
            admin: {
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        return safeErrorResponse(error, 'Dashboard мэдээлэл унших үед алдаа гарлаа');
    }
}
