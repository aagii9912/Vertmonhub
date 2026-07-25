import { NextRequest, NextResponse } from 'next/server';
import { apiContext } from '@/lib/api/context';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/dashboard/audit
 *
 * Нэгдсэн аудит мөр (`activity_log`) харах. Өмнө нь 5 аудит хүснэгтийн
 * зөвхөн `ai_audit_log`-ийг харах цонх байсан — бусад нь бичигддэг ч хэн ч
 * хардаггүй «dead log» байв.
 *
 * Эрх: `reports` модуль. Аудит нь удирдлагын хяналтын хэрэгсэл тул
 * тайлангийн эрхтэй хүн харна.
 *
 * Шүүлтүүр: ?actor= &entity= &action= &status= &from= &to= &q= &page= &pageSize=
 */
export async function GET(request: NextRequest) {
    try {
        const r = await apiContext(request, { module: 'reports' });
        if ('error' in r) return r.error;
        const { ctx } = r;

        const sp = request.nextUrl.searchParams;
        const page = Math.max(1, Number(sp.get('page') || 1));
        const pageSize = Math.min(200, Math.max(10, Number(sp.get('pageSize') || 50)));
        const from = (page - 1) * pageSize;

        const db = supabaseAdmin();
        let q = db
            .from('activity_log')
            .select(
                'id, occurred_at, actor_id, actor_name, actor_role, source, entity, entity_id, ' +
                'action, summary, before, after, request_ip, status, error_message',
                { count: 'exact' },
            )
            .eq('shop_id', ctx.shopId);

        const actor = sp.get('actor');
        const entity = sp.get('entity');
        const action = sp.get('action');
        const status = sp.get('status');
        const dateFrom = sp.get('from');
        const dateTo = sp.get('to');
        const search = sp.get('q')?.trim();

        if (actor) q = q.eq('actor_id', actor);
        if (entity) q = q.eq('entity', entity);
        if (action) q = q.eq('action', action);
        if (status) q = q.eq('status', status);
        if (dateFrom) q = q.gte('occurred_at', dateFrom);
        if (dateTo) q = q.lte('occurred_at', dateTo);
        if (search) q = q.or(`summary.ilike.%${search}%,actor_name.ilike.%${search}%,entity_id.ilike.%${search}%`);

        const { data, error, count } = await q
            .order('occurred_at', { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) {
            // Migration ороогүй орчинд хоосон буцаана (500 биш)
            if (/relation .*activity_log.* does not exist/i.test(error.message)) {
                return NextResponse.json({ entries: [], total: 0, available: false });
            }
            return NextResponse.json({ error: 'Аудит татахад алдаа гарлаа' }, { status: 500 });
        }

        return NextResponse.json({
            entries: data || [],
            total: count ?? 0,
            page,
            pageSize,
            available: true,
        });
    } catch (error) {
        return safeErrorResponse(error, 'Аудит татахад алдаа гарлаа');
    }
}
