import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils/pagination';
import { MAX_SLA_HOURS } from '@/lib/service-logs/sla';
import {
    activityRangeError, buildManagerActivity, shiftDate, ubDateStart,
    type ActivityCall, type ActivityGroup, type ActivityMeeting, type ActivityRequest, type ActivityRosterEntry, type DailyTargetRow,
} from './activity';

/**
 * Менежерийн идэвхийн тайлангийн эх өгөгдөл (нэг shop = нэг төсөл) — тогтмол 5 уншилт, алдааг
 * дуугүй хоосон болгохгүй (throw). API route, AI tool, сарын KPI (kpi-load) бүгд энд дамжина.
 *
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
        fetchAllRows<ActivityCall>((rangeFrom, rangeTo) => db.from('lead_activities').select('created_by, created_by_name, created_at')
            .eq('shop_id', shopId).eq('type', 'call').gte('created_at', start).lt('created_at', end)
            .order('created_at').order('id').range(rangeFrom, rangeTo)),
        fetchAllRows<ActivityMeeting>((rangeFrom, rangeTo) => db.from('property_viewings').select('sales_manager_name, scheduled_at, status, meeting_type')
            .eq('shop_id', shopId).is('deleted_at', null).in('status', ['completed', 'no_show'])
            .gte('scheduled_at', start).lt('scheduled_at', end).order('id').range(rangeFrom, rangeTo)),
        fetchAllRows<ActivityRequest>((rangeFrom, rangeTo) => db.from('service_logs').select('manager_name, assigned_to, priority, status, created_at, resolved_at')
            .eq('shop_id', shopId).lt('created_at', end)
            .or(`created_at.gte.${requestLookback},resolved_at.gte.${start},status.in.(open,in_progress)`)
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
