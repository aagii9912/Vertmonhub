/**
 * ГҮЙЦЭТГЭХ УДИРДЛАГЫН хяналтын функцууд (AI tool-ын хэрэгжүүлэлт).
 *
 * ЯАГААД: систем өмнө нь зөвхөн ҮР ДҮНГ (гэрээ, орлого) хэмждэг байсан тул
 * «Болд өчигдөр юу хийсэн бэ?», «хэн идэвхгүй байна?» гэсэн удирдлагын
 * хамгийн энгийн асуултад хариулах өгөгдөл ч, tool ч байгаагүй. Мөн
 * manager_performance нь гэрээ хийсэн менежерийг л харуулдаг тул идэвхтэй
 * ажилласан ч гэрээ хаагаагүй хүн удирдлагад ОГТ харагддаггүй байв.
 *
 * Эдгээр tool бүгд ЗӨВХӨН УНШИНА — хяналт нь өөрчлөлт хийхгүй.
 */

import { supabaseAdmin } from '@/lib/supabase';
import {
    computeAnomalies,
    type ActivityRow,
    type LeadRow,
    type ManagerRow,
} from '@/lib/dashboard/oversight';

const db = () => supabaseAdmin();

function periodStart(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
}

function fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.toLocaleDateString('mn-MN')} ${d.toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Багийн ҮЙЛ АЖИЛЛАГАА — хэн юу хийж байна (үр дүн биш, ЯВЦ).
 * «Өнөөдөр хэн юу хийсэн бэ?», «Болд энэ долоо хоногт хэдэн дуудлага хийсэн бэ?»
 */
export async function getTeamActivity(shopId: string, args: any) {
    const days = Math.min(Math.max(Number(args?.days) || 1, 1), 90);
    const since = periodStart(days - 1).toISOString();

    let q = db()
        .from('activity_log')
        .select('actor_name, kind, outcome, occurred_at, entity_type, body')
        .eq('shop_id', shopId)
        .gte('occurred_at', since)
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false })
        .limit(1000);
    if (args?.manager) q = q.eq('actor_name', args.manager);

    const res = await q;
    if (res.error) {
        if (/activity_log/i.test(res.error.message)) {
            return {
                error:
                    'Үйл ажиллагааны бүртгэл (activity_log) хараахан үүсээгүй байна — ' +
                    '20260822120000_work_os_foundation.sql миграцийг ажиллуулна уу.',
            };
        }
        return { error: `Үйл ажиллагаа уншихад алдаа: ${res.error.message}` };
    }

    const rows = (res.data || []) as ActivityRow[];

    // Менежер тус бүрээр нэгтгэнэ
    const byManager = new Map<string, { total: number; kinds: Record<string, number>; last: string | null }>();
    for (const r of rows) {
        const name = r.actor_name || '(тодорхойгүй)';
        const cur = byManager.get(name) || { total: 0, kinds: {}, last: null };
        cur.total += 1;
        const kind = r.kind || 'other';
        cur.kinds[kind] = (cur.kinds[kind] || 0) + 1;
        if (r.occurred_at && (!cur.last || r.occurred_at > cur.last)) cur.last = r.occurred_at;
        byManager.set(name, cur);
    }

    return {
        period: `сүүлийн ${days} хоног`,
        totalActivities: rows.length,
        managers: [...byManager.entries()]
            .map(([name, v]) => ({
                manager: name,
                total: v.total,
                calls: v.kinds.call || 0,
                meetings: (v.kinds.meeting || 0) + (v.kinds.viewing || 0),
                messages: (v.kinds.messenger || 0) + (v.kinds.sms || 0),
                notes: v.kinds.note || 0,
                lastActivity: fmtDateTime(v.last),
            }))
            .sort((a, b) => b.total - a.total),
    };
}

/**
 * Нэг менежерийн ЯВЦ: үйл ажиллагаа + юүлүүр + борлуулалт нэг дор.
 * «Батбаяр энэ сар яаж байна?»
 */
export async function getManagerProgress(shopId: string, args: any) {
    const manager = typeof args?.manager === 'string' ? args.manager.trim() : '';
    if (!manager) return { error: 'manager (менежерийн нэр) шаардлагатай.' };

    const now = new Date();
    const year = Number(args?.year) || now.getFullYear();
    const month = Number(args?.month) || now.getMonth() + 1;
    const monthStart = new Date(year, month - 1, 1).toISOString();

    const [activityRes, leadsRes, viewingsRes, salesRes] = await Promise.all([
        db().from('activity_log')
            .select('kind, outcome, occurred_at')
            .eq('shop_id', shopId).eq('actor_name', manager)
            .gte('occurred_at', monthStart).is('deleted_at', null).limit(2000),
        db().from('leads')
            .select('status, created_at')
            .eq('shop_id', shopId).eq('sales_manager_name', manager)
            .is('deleted_at', null).limit(2000),
        db().from('property_viewings')
            .select('status, scheduled_at')
            .eq('shop_id', shopId).eq('sales_manager_name', manager)
            .gte('scheduled_at', monthStart).is('deleted_at', null).limit(1000),
        db().from('manager_monthly_sales')
            .select('actual_amount, contract_count, year, month')
            .eq('shop_id', shopId).eq('sales_manager', manager)
            .eq('year', year).eq('month', month).maybeSingle(),
    ]);

    const acts = (activityRes.data || []) as Array<{ kind: string; outcome: string | null }>;
    const leads = (leadsRes.data || []) as Array<{ status: string | null; created_at: string }>;
    const viewings = (viewingsRes.data || []) as Array<{ status: string | null }>;
    const sales: any = salesRes.data;

    const countKind = (k: string) => acts.filter((a) => a.kind === k).length;
    const countStatus = (s: string) => leads.filter((l) => l.status === s).length;

    return {
        manager,
        period: `${year}-${String(month).padStart(2, '0')}`,
        activity: {
            total: acts.length,
            calls: countKind('call'),
            connected: acts.filter((a) => a.outcome === 'connected').length,
            noAnswer: acts.filter((a) => a.outcome === 'no_answer').length,
            meetings: countKind('meeting') + countKind('viewing'),
            notes: countKind('note'),
            available: !activityRes.error,
        },
        pipeline: {
            totalLeads: leads.length,
            new: countStatus('new'),
            contacted: countStatus('contacted'),
            negotiating: countStatus('negotiating'),
            won: countStatus('closed_won'),
            lost: countStatus('closed_lost'),
        },
        viewings: {
            total: viewings.length,
            completed: viewings.filter((v) => v.status === 'completed').length,
            noShow: viewings.filter((v) => v.status === 'no_show').length,
        },
        sales: {
            amount: Number(sales?.actual_amount) || 0,
            contracts: Number(sales?.contract_count) || 0,
            currency: 'MNT',
        },
    };
}

/**
 * АНОМАЛИ: идэвхгүй менежер, хүйтэн лид, хугацаа хэтэрсэн дагалт.
 * «Хэн анхаарал татаж байна?», «Юу буруу явж байна?»
 */
export async function getAnomalies(shopId: string, args: any) {
    const staleDays = Math.min(Math.max(Number(args?.stale_days) || 5, 1), 60);
    const inactiveDays = Math.min(Math.max(Number(args?.inactive_days) || 2, 1), 30);

    const [rosterRes, activityRes, leadsRes] = await Promise.all([
        db().from('sales_managers').select('name, is_active').eq('shop_id', shopId),
        db().from('activity_log')
            .select('actor_name, occurred_at')
            .eq('shop_id', shopId)
            .gte('occurred_at', periodStart(inactiveDays).toISOString())
            .is('deleted_at', null).limit(2000),
        db().from('leads')
            .select('id, customer_name, sales_manager_name, status, updated_at, next_followup_at')
            .eq('shop_id', shopId)
            .not('status', 'in', '("closed_won","closed_lost")')
            .is('deleted_at', null).limit(2000),
    ]);

    const managers = ((rosterRes.data || []) as ManagerRow[]).filter((m) => m.is_active);
    const acts = (activityRes.data || []) as ActivityRow[];
    const leads = (leadsRes.data || []) as LeadRow[];

    const anomalies = computeAnomalies({
        managers,
        activities: acts,
        leads,
        staleDays,
        inactiveDays,
        now: new Date(),
    });

    return {
        checkedAt: fmtDateTime(new Date().toISOString()),
        thresholds: { staleDays, inactiveDays },
        activityLogAvailable: !activityRes.error,
        count: anomalies.length,
        anomalies,
    };
}
