import type { SupabaseClient } from '@supabase/supabase-js';
import { daySpan, shiftDate, ubDateStart } from '@/lib/sales/activity';
import { ubDateStr } from '@/lib/utils/date';
import { fetchAllRows } from '@/lib/utils/pagination';
import { DAILY_RANGE_MAX_DAYS } from './daily-report';
import { loadDailyReportConfig } from './daily-report-load';
import { buildSalesActivity, salesActivityWindow, type SalesActivityCountRow, type SalesActivityReport } from './sales-activity';

/** Багана/хүснэгт алга (migration ороогүй): уншилт «тодорхойгүй» болно. */
export function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    return ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error.code ?? '')
        || /does not exist|could not find/i.test(error.message ?? '');
}

/**
 * Хурлын «тоон мэдээлэл»-ийн эх өгөгдөл (нэг shop = нэг төсөл): өдрийн тайлангийн загвар, тоо,
 * баталгаажуулалт, `completed` уулзалт, уулзалтын бүртгэл эхэлсэн өдөр, сарын идэвхжлийн төлөвлөгөө.
 * Уншилтын алдааг хоосон тайлан болгож нуухгүй (throw); өдрийн тайлангийн хүснэгт алга бол
 * `DailyReportUnavailableError`. Төлөвлөгөөний багана алга бол төлөвлөгөө «—».
 */
export async function loadSalesActivity(db: SupabaseClient, options: { shopId: string; shopName: string; meetingDate: string }): Promise<SalesActivityReport> {
    const { shopId, meetingDate } = options;
    const window = salesActivityWindow(meetingDate);
    if (daySpan(window.from, window.to) > DAILY_RANGE_MAX_DAYS) throw new Error(`sales-activity window exceeds ${DAILY_RANGE_MAX_DAYS} days`);
    const start = ubDateStart(window.from).toISOString();
    const end = ubDateStart(shiftDate(window.to, 1)).toISOString();
    const year = Number(window.month.month.slice(0, 4));
    const month = Number(window.month.month.slice(5, 7));

    const settings = await loadDailyReportConfig(db, shopId, options.shopName);
    const [counts, reports, meetings, first, target] = await Promise.all([
        fetchAllRows<SalesActivityCountRow>((from, to) => db.from('daily_report_counts').select('report_date, manager_name, metric, value')
            .eq('shop_id', shopId).gte('report_date', window.from).lte('report_date', window.to)
            .order('report_date').order('manager_name').order('metric').range(from, to)),
        fetchAllRows<{ report_date: string; completed_at: string | null }>((from, to) => db.from('daily_reports').select('report_date, completed_at')
            .eq('shop_id', shopId).gte('report_date', window.from).lte('report_date', window.to).order('report_date').range(from, to)),
        fetchAllRows<{ scheduled_at: string; meeting_type: string | null }>((from, to) => db.from('property_viewings').select('scheduled_at, meeting_type')
            .eq('shop_id', shopId).is('deleted_at', null).eq('status', 'completed').gte('scheduled_at', start).lt('scheduled_at', end)
            .order('scheduled_at').order('id').range(from, to)),
        // Уулзалтын бүртгэл эхэлсэн өдөр: устгаагүй, ямар ч төлөвтэй хамгийн эртний уулзалт.
        db.from('property_viewings').select('scheduled_at').eq('shop_id', shopId).is('deleted_at', null)
            .order('scheduled_at', { ascending: true }).limit(1).maybeSingle(),
        db.from('team_sales_targets').select('activity_targets').eq('shop_id', shopId).eq('year', year).eq('month', month).maybeSingle(),
    ]);
    if (first.error) throw new Error(first.error.message);
    const targetsAvailable = !isMissingSchemaError(target.error);
    if (target.error && targetsAvailable) throw new Error(target.error.message);

    return buildSalesActivity({
        meetingDate,
        config: settings.config,
        configSaved: settings.saved,
        configInvalid: settings.invalid,
        counts: counts.map(row => ({ ...row, value: Number(row.value) || 0 })),
        confirmedDates: reports.filter(row => row.completed_at).map(row => row.report_date),
        meetings: meetings.map(row => ({ day: ubDateStr(new Date(row.scheduled_at)), type: row.meeting_type })),
        meetingsSince: first.data?.scheduled_at ? ubDateStr(new Date(first.data.scheduled_at as string)) : null,
        targets: targetsAvailable ? (target.data as { activity_targets?: unknown } | null)?.activity_targets ?? null : null,
        targetsAvailable,
        today: ubDateStr(),
    });
}
