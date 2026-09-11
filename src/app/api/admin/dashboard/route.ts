/**
 * Admin Dashboard API — платформын ерөнхий статистик.
 *
 * 2026-09 review (M6): өмнө нь `subscriptions` / `plans` / `invoices` (prod DB-д БАЙХГҮЙ
 * SaaS-billing хүснэгтүүд) уншиж бүх Promise алдаа өгдөг байв. Одоо бодит CRM тоонууд
 * (`crm`) + хуучин UI-ийн талбаруудыг тэгээр (хоосноор) буцаана — admin/dashboard хуудас
 * `crm`-д шилжтэл эвдрэхгүй.
 */

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
            return q.then((r: { count: number | null; error: unknown }) => (r.error ? 0 : r.count ?? 0));
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
                .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
                .order('created_at', { ascending: false })
                .limit(5),
        ]);

        return NextResponse.json({
            stats: {
                total_shops: totalShops,
                // Хуучин SaaS талбарууд — хүснэгт байхгүй тул тэг (UI-г crm руу шилжүүлэх хүртэл)
                subscriptions: { active: 0, canceled: 0, past_due: 0, total: 0 },
                revenue: { total_revenue: 0, pending_revenue: 0, paid_count: 0, pending_count: 0 },
                plans_count: 0,
            },
            crm: { users, leads, contracts, customers, viewings },
            plans: [],
            recent_shops: recentShopsResult.data || [],
            recent_invoices: [],
            admin: {
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        return safeErrorResponse(error, 'Dashboard мэдээлэл унших үед алдаа гарлаа');
    }
}
