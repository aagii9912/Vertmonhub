import { NextRequest, NextResponse } from 'next/server';
import { ubDayRange } from '@/lib/utils/date';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { requireModuleWrite, requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { createViewing } from '@/lib/services/ViewingService';

/**
 * GET /api/dashboard/viewings?range=today|upcoming|past|all&status=&manager=&lead=
 * Уулзалтын жагсаалт (shop-scoped, зөөлөн устгасныг хасна) + лид/байрны нэр.
 * v1-д хуудас browser supabase-аар шууд уншдаг байсан; v2-т нэг API.
 */
export async function GET(request: NextRequest) {
    try {
        const denied = await requireModule('viewings');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const sp = new URL(request.url).searchParams;
        const range = sp.get('range') || 'upcoming';
        const status = sp.get('status');
        const manager = sp.get('manager');
        const lead = sp.get('lead');
        const limit = Math.min(500, Math.max(1, Number(sp.get('limit')) || 300));

        const db = supabaseAdmin();
        // «Өнөөдөр» — Улаанбаатарын өдрийн хилээр (сервер UTC)
        const { start: dayStart, end: dayEnd } = ubDayRange();

        let q = db
            .from('property_viewings')
            .select('*, leads(id, customer_name, customer_phone, status), properties(id, name, district)')
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .limit(limit);

        if (range === 'today') q = q.gte('scheduled_at', dayStart.toISOString()).lt('scheduled_at', dayEnd.toISOString()).order('scheduled_at', { ascending: true });
        else if (range === 'upcoming') q = q.gte('scheduled_at', dayStart.toISOString()).order('scheduled_at', { ascending: true });
        else if (range === 'past') q = q.lt('scheduled_at', dayStart.toISOString()).order('scheduled_at', { ascending: false });
        else q = q.order('scheduled_at', { ascending: false });

        if (status && status !== 'all') q = q.eq('status', status);
        if (manager && manager !== 'all') q = q.eq('sales_manager_name', manager);
        if (lead) q = q.eq('lead_id', lead);

        const { data, error } = await q;
        if (error) return NextResponse.json({ error: 'Уулзалт татахад алдаа гарлаа' }, { status: 500 });

        const viewings = (data || []).map((v: Record<string, unknown>) => {
            const { leads, properties, ...rest } = v as Record<string, unknown> & { leads?: unknown; properties?: unknown };
            return { ...rest, lead: leads ?? null, property: properties ?? null };
        });

        // Табын тоонууд (нэг дуудлагаар) — head count, зөөлөн устгасныг хасна
        const base = () => db.from('property_viewings').select('id', { count: 'exact', head: true }).eq('shop_id', authShop.id).is('deleted_at', null);
        const cnt = async (x: ReturnType<typeof base>) => { const r = await x; if (r.error) throw r.error; return r.count ?? 0; };
        const [today, upcoming, past] = await Promise.all([
            cnt(base().gte('scheduled_at', dayStart.toISOString()).lt('scheduled_at', dayEnd.toISOString()).eq('status', 'scheduled')),
            cnt(base().gte('scheduled_at', dayStart.toISOString()).eq('status', 'scheduled')),
            cnt(base().lt('scheduled_at', dayStart.toISOString())),
        ]);

        return NextResponse.json({ viewings, counts: { today, upcoming, past } });
    } catch (error) {
        return safeErrorResponse(error, 'Уулзалт татахад алдаа гарлаа');
    }
}

/** POST — UI ба AI ижил service ашиглана. */
export async function POST(request: NextRequest) {
    try {
        const denied = await requireModuleWrite('viewings');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const db = supabaseAdmin();
        const uid = await getUserId();
        const identity = uid ? await resolveManagerIdentity(db, authShop.id, uid) : null;
        const result = await createViewing(db, authShop.id, await request.json().catch(() => null), {
            userId: uid, managerName: identity?.isManager ? identity.managerName : null,
        });
        if (!result.ok) return NextResponse.json({ error: result.error, partialSuccess: result.partialSuccess, leadId: result.leadId }, { status: result.status });
        return NextResponse.json({ ...result.data, warning: result.warning }, { status: 201 });
    } catch (error) {
        return safeErrorResponse(error, 'Уулзалт үүсгэхэд алдаа гарлаа');
    }
}
