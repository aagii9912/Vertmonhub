import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils/pagination';
import { MAX_SLA_HOURS } from '@/lib/service-logs/sla';
import { OPEN_SERVICE_STATUSES } from '@/lib/service-logs/labels';
import {
    activityRangeError, buildManagerActivity, shiftDate, ubDateStart,
    type ActivityCall, type ActivityGroup, type ActivityMeeting, type ActivityRequest, type ActivityRosterEntry, type DailyTargetRow,
} from './activity';

/**
 * Менежерийн идэвхийн тайлангийн эх өгөгдөл (нэг shop = нэг төсөл) — тогтмол 5 уншилт, алдааг
 * дуугүй хоосон болгохгүй (throw). API route, AI tool, сарын KPI (kpi-load) бүгд энд дамжина.
 *
 * Дуудлага: устгаагүй лидийн 'call' мөр (спам/туршилт/давхар лидийг админ устгавал тоологдохгүй).
 * Санал хүсэлт: хугацаанд бүртгэгдсэн/шийдвэрлэсэн, SLA-ийн үр дүн нь хугацаанд тодорхой болох
 * (хамгийн урт SLA-аар өмнө бүртгэгдсэн) болон одоо нээлттэй бүх хүсэлт.
 */
export async function loadManagerActivity(db: SupabaseClient, options: {
    shopId: string;
    from: string;
    to: string;
    group: ActivityGroup;
    only?: string | null;
    now?: Date;
}) {
    const { shopId, from, to, group } = options;
    const rangeError = activityRangeError(from, to);
    if (rangeError) throw new Error(rangeError);
    const now = options.now ?? new Date();
    const start = ubDateStart(from).toISOString();
    const end = ubDateStart(shiftDate(to, 1)).toISOString();
    const requestLookback = new Date(ubDateStart(from).getTime() - MAX_SLA_HOURS * 3_600_000).toISOString();
    const years = [Number(from.slice(0, 4)), Number(to.slice(0, 4))];

    const [calls, meetings, requests, rosterResult, targetResult] = await Promise.all([
        fetchAllRows<ActivityCall>((rangeFrom, rangeTo) => db.from('lead_activities').select('created_by, created_by_name, created_at, leads!inner(deleted_at)')
            .eq('shop_id', shopId).eq('type', 'call').is('leads.deleted_at', null).gte('created_at', start).lt('created_at', end)
            .order('created_at').order('id').range(rangeFrom, rangeTo)),
        fetchAllRows<ActivityMeeting>((rangeFrom, rangeTo) => db.from('property_viewings').select('sales_manager_name, scheduled_at, status, meeting_type')
            .eq('shop_id', shopId).is('deleted_at', null).in('status', ['completed', 'no_show'])
            .gte('scheduled_at', start).lt('scheduled_at', end).order('id').range(rangeFrom, rangeTo)),
        fetchAllRows<ActivityRequest>((rangeFrom, rangeTo) => db.from('service_logs').select('manager_name, priority, status, created_at, resolved_at')
            .eq('shop_id', shopId).lt('created_at', end)
            .or(`created_at.gte.${requestLookback},resolved_at.gte.${start},status.in.(${OPEN_SERVICE_STATUSES.join(',')})`)
            .order('id').range(rangeFrom, rangeTo)),
        db.from('sales_managers').select('name, user_id, is_active').eq('shop_id', shopId),
        db.from('sales_kpi_months').select('manager_name, year, month, daily').eq('shop_id', shopId).gte('year', years[0]).lte('year', years[1]),
    ]);
    if (rosterResult.error) throw rosterResult.error;
    if (targetResult.error) throw targetResult.error;
    const roster: ActivityRosterEntry[] = (rosterResult.data ?? []).map(row => ({ name: row.name as string, user_id: (row.user_id as string | null) ?? null, is_active: !!row.is_active }));

    return buildManagerActivity({
        from, to, group, now, roster, calls, meetings, requests,
        targets: (targetResult.data ?? []) as DailyTargetRow[],
        only: options.only ?? null,
    });
}

export type ActivityManagerLookup = { ok: true; name: string } | { ok: false; error: string; options: string[] };

/**
 * Багийн тайланд асуусан менежерийн нэрийг тухайн төслийн бүртгэлээр (идэвхтэй/идэвхгүй) шалгана.
 * Яг таарахгүй бол таамаглахгүй: төстэй нэрс (эсвэл идэвхтэй бүх нэр)-ийг сонголт болгон буцаана —
 * бүртгэлгүй нэрээр «0 дуудлага» гэсэн хоосон мөр үүсгэхээс сэргийлнэ.
 */
export async function findActivityManager(db: SupabaseClient, shopId: string, name: string): Promise<ActivityManagerLookup> {
    const { data, error } = await db.from('sales_managers').select('name, is_active').eq('shop_id', shopId);
    if (error) throw error;
    const roster = (data ?? []) as Array<{ name: string; is_active: boolean | null }>;
    const wanted = name.trim();
    const exact = roster.find(entry => entry.name === wanted);
    if (exact) return { ok: true, name: exact.name };
    const needle = wanted.toLowerCase();
    const similar = needle ? roster.filter(entry => entry.name.toLowerCase().includes(needle) || needle.includes(entry.name.toLowerCase())) : [];
    const options = (similar.length ? similar : roster.filter(entry => entry.is_active)).map(entry => entry.name).sort((a, b) => a.localeCompare(b, 'mn'));
    return { ok: false, error: 'Ийм менежер бүртгэлд алга', options };
}
