import { NextResponse, NextRequest } from 'next/server';
import { requireModule } from '@/lib/auth/require-permission';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { fetchAllRows } from '@/lib/utils/pagination';
import { withRoute } from '@/lib/api/route';
import { CreateServiceLogSchema, createServiceLog, serviceLogInputError } from '@/lib/services/ServiceLogService';

// ============================================
// GET /api/dashboard/service-logs
// Үйлчилгээний бүртгэл жагсаалт
// ============================================
export async function GET(request: NextRequest) {
    try {
        const denied = await requireModule('customer-service');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ logs: [], stats: emptyStats() });
        }

        const supabase = supabaseAdmin();
        const sp = request.nextUrl.searchParams;

        const status = sp.get('status');
        const type = sp.get('type');
        const priority = sp.get('priority');
        const assignedTo = sp.get('assigned_to');
        const managerName = sp.get('manager');
        const customerId = sp.get('customer_id');
        const channel = sp.get('channel');
        const search = sp.get('search')?.trim() || '';

        const buildQuery = () => {
            let q = supabase
                .from('service_logs')
                .select('*')
                .eq('shop_id', authShop.id);

            if (status) q = q.eq('status', status);
            if (type) q = q.eq('type', type);
            if (priority) q = q.eq('priority', priority);
            if (assignedTo) q = q.eq('assigned_to', assignedTo);
            if (managerName) q = q.eq('manager_name', managerName);
            if (customerId) q = q.eq('customer_id', customerId);
            if (channel) q = q.eq('channel', channel);

            if (search) {
                q = q.or(
                    `subject.ilike.%${search}%,` +
                    `customer_name.ilike.%${search}%,` +
                    `customer_phone.ilike.%${search}%,` +
                    `description.ilike.%${search}%`
                );
            }
            return q.order('created_at', { ascending: false }).order('id');
        };

        const logs = await fetchAllRows<Record<string, unknown>>((from, to) => buildQuery().range(from, to));
        return NextResponse.json({ logs, stats: computeStats(logs) });
    } catch (error) {
        logger.error('[ServiceLogs API] GET error:', { error });
        return NextResponse.json(
            { error: 'Санал гомдлын бүртгэл татахад алдаа гарлаа', logs: [], stats: emptyStats() },
            { status: 500 }
        );
    }
}

// ============================================
// POST /api/dashboard/service-logs
// Шинэ хүсэлт/гомдол нээх — хатуу allow-list, хариуцагч менежерийг ServiceLogService тогтооно.
// ============================================
export const POST = withRoute({ module: 'customer-service', access: 'write', error: 'Хүсэлт бүртгэхэд алдаа гарлаа' }, async ({ request, shop: authShop }) => {
    const parsed = CreateServiceLogSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: serviceLogInputError(parsed.error) }, { status: 400 });
    const result = await createServiceLog(supabaseAdmin(), { shopId: authShop.id, userId: await getUserId(), input: parsed.data });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(
        { log: result.data, message: 'Хүсэлт амжилттай бүртгэлээ' },
        { status: 201 }
    );
});

// ============================================
// HELPERS
// ============================================

interface ServiceStats {
    total: number;
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
    avg_rating: number | null;
    by_type: Record<string, number>;
    by_priority: Record<string, number>;
}

function emptyStats(): ServiceStats {
    return {
        total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0,
        avg_rating: null, by_type: {}, by_priority: {},
    };
}

function computeStats(logs: Array<Record<string, unknown>>): ServiceStats {
    const stats = emptyStats();
    let ratingSum = 0;
    let ratingCount = 0;

    for (const log of logs) {
        stats.total += 1;

        const status = String(log.status || '');
        if (status === 'open') stats.open += 1;
        else if (status === 'in_progress') stats.in_progress += 1;
        else if (status === 'resolved') stats.resolved += 1;
        else if (status === 'closed') stats.closed += 1;

        const type = String(log.type || 'other');
        stats.by_type[type] = (stats.by_type[type] || 0) + 1;

        const priority = String(log.priority || 'medium');
        stats.by_priority[priority] = (stats.by_priority[priority] || 0) + 1;

        if (typeof log.satisfaction_rating === 'number') {
            ratingSum += log.satisfaction_rating;
            ratingCount += 1;
        }
    }

    stats.avg_rating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;
    return stats;
}
