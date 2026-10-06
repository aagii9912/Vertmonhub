import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { loadLeadCustomerCard } from '@/lib/leads/customer-card-load';
import { applyLeadScope, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/dashboard/leads/[id]/customer
 * Харилцагчийн картын нэмэлт хэсгүүд: утсаар таарсан харилцагч (customers), түүний мессеж (inbox),
 * лидийн болон ижил утастай гэрээ (contracts), санал гомдол (customer-service). Лид өөрөө
 * `applyLeadScope`-оор уншигдана; эрхгүй модулийн хэсэг огт уншигдахгүй (`access`-д false).
 */
export const GET = withRoute<{ id: string }>({ module: 'leads', error: 'Харилцагчийн мэдээлэл татахад алдаа гарлаа' }, async ({ shop, params }) => {
    const { id } = await params;
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    const { data: lead, error } = await applyLeadScope(db
        .from('leads')
        .select('id, customer_id, customer_phone')
        .eq('id', id)
        .eq('shop_id', shop.id)
        .is('deleted_at', null), scope)
        .maybeSingle();
    if (error) throw error;
    if (!lead) return NextResponse.json({ error: 'Лид олдсонгүй' }, { status: 404 });

    const resolved = await resolvePermissions();
    const can = (module: string) => !!resolved && (resolved.role === 'super_admin' || resolved.permissions.modules.includes(module));
    const card = await loadLeadCustomerCard(db, shop.id, lead, {
        customers: can('customers'),
        inbox: can('inbox'),
        contracts: can('contracts'),
        serviceLogs: can('customer-service'),
    });
    return NextResponse.json(card, { headers: { 'Cache-Control': 'private, no-store' } });
});
