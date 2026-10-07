import type { SupabaseClient } from '@supabase/supabase-js';
import { leadDisplayName } from '@/lib/leads/labels';
import { shiftDate, ubDateStart } from '@/lib/sales/activity';
import { fetchAllRows } from '@/lib/utils/pagination';
import {
    buildDailyReport, readDailyReportConfig, readDailyReportNotes,
    type DailyCountRow, type DailyMeetingRow, type DailyReport, type DailyReportConfig, type DailyRosterEntry, type SaveDailyReportInput,
} from './daily-report';

/**
 * «Өдрийн тайлан»-гийн DB давхарга — API route ба AI tool нэг loader-аар уншина. Алдааг хоосон тайлан
 * болгож нуухгүй (throw); migration хэрэглэгдээгүй бол `DailyReportUnavailableError`.
 */
export class DailyReportUnavailableError extends Error {
    constructor() { super('Өдрийн тайлангийн хэсэг хараахан идэвхжээгүй байна. Админд хандаж шинэчлэлийг суулгана уу.'); }
}

const MISSING_TABLE = ['42P01', 'PGRST205'];
function assertOk(error: { code?: string; message: string } | null) {
    if (!error) return;
    if (MISSING_TABLE.includes(error.code || '')) throw new DailyReportUnavailableError();
    throw new Error(error.message);
}

export async function loadDailyReportConfig(db: SupabaseClient, shopId: string) {
    const { data, error } = await db.from('daily_report_settings').select('config, updated_at').eq('shop_id', shopId).maybeSingle();
    assertOk(error);
    return { ...readDailyReportConfig(data?.config ?? null), updatedAt: (data?.updated_at as string | undefined) ?? null };
}

export async function loadDailyRoster(db: SupabaseClient, shopId: string): Promise<DailyRosterEntry[]> {
    const { data, error } = await db.from('sales_managers').select('name, is_active').eq('shop_id', shopId);
    assertOk(error);
    return (data ?? []).filter(row => !!row.name).map(row => ({ name: row.name as string, is_active: !!row.is_active }));
}

type MeetingSelect = {
    id: string; sales_manager_name: string | null; meeting_type: string | null; scheduled_at: string;
    agent_notes: string | null; customer_feedback: string | null;
    // PostgREST embed: many-to-one нь объект, supabase-js-ийн төрөлд массив байж болно.
    leads: Embedded<{ customer_name: string | null }>; properties: Embedded<{ name: string | null }>;
};
type Embedded<T> = T | T[] | null;
const one = <T,>(value: Embedded<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export async function loadDailyReport(db: SupabaseClient, options: {
    shopId: string;
    shopName: string;
    date: string;
    /** Хувийн горим: зөвхөн энэ менежерийн тоо, уулзалт. */
    only: string | null;
}): Promise<{ report: DailyReport; config: DailyReportConfig; configSaved: boolean; configInvalid: boolean; roster: DailyRosterEntry[] }> {
    const { shopId, date, only } = options;
    const start = ubDateStart(date).toISOString();
    const end = ubDateStart(shiftDate(date, 1)).toISOString();
    const settings = await loadDailyReportConfig(db, shopId);

    const [roster, counts, meetings, pending, reportRow] = await Promise.all([
        loadDailyRoster(db, shopId),
        fetchAllRows<DailyCountRow>((from, to) => {
            let query = db.from('daily_report_counts').select('manager_name, metric, value').eq('shop_id', shopId).eq('report_date', date);
            if (only) query = query.eq('manager_name', only);
            return query.order('manager_name').order('metric').range(from, to);
        }),
        fetchAllRows<MeetingSelect>((from, to) => {
            let query = db.from('property_viewings')
                .select('id, sales_manager_name, meeting_type, scheduled_at, agent_notes, customer_feedback, leads(customer_name), properties(name)')
                .eq('shop_id', shopId).is('deleted_at', null).eq('status', 'completed').gte('scheduled_at', start).lt('scheduled_at', end);
            if (only) query = query.eq('sales_manager_name', only);
            return query.order('scheduled_at').order('id').range(from, to);
        }),
        (() => {
            let query = db.from('property_viewings').select('id', { count: 'exact', head: true })
                .eq('shop_id', shopId).is('deleted_at', null).eq('status', 'scheduled').gte('scheduled_at', start).lt('scheduled_at', end);
            if (only) query = query.eq('sales_manager_name', only);
            return query;
        })(),
        db.from('daily_reports').select('notes, completed_by_name, completed_at').eq('shop_id', shopId).eq('report_date', date).maybeSingle(),
    ]);
    assertOk(pending.error);
    assertOk(reportRow.error);

    const meetingRows: DailyMeetingRow[] = meetings.map(row => ({
        id: row.id,
        manager: row.sales_manager_name?.trim() || null,
        type: row.meeting_type,
        customer: leadDisplayName(one(row.leads)),
        property: one(row.properties)?.name ?? null,
        notes: row.agent_notes,
        feedback: row.customer_feedback,
        scheduled_at: row.scheduled_at,
    }));
    const report = buildDailyReport({
        date,
        title: settings.config.title || `${options.shopName} баг`,
        config: settings.config,
        roster,
        counts,
        meetings: meetingRows,
        pendingMeetings: pending.count ?? 0,
        // Хувийн горимд багийн тэмдэглэл, баталгаажуулалт харуулахгүй (зөвхөн өөрийн багана).
        notes: only ? {} : readDailyReportNotes(reportRow.data?.notes),
        completed: !only && reportRow.data?.completed_at
            ? { by: (reportRow.data.completed_by_name as string | null) ?? null, at: reportRow.data.completed_at as string }
            : null,
        only,
    });
    return { report, config: settings.config, configSaved: settings.saved, configInvalid: settings.invalid, roster };
}

/**
 * Тоо (нүд), тэмдэглэл, баталгаажуулалтыг хадгална. Эрх, менежер, үзүүлэлтийн шалгалтыг дуудагч
 * (route) хийнэ. Дахин илгээхэд ижил үр дүн (idempotent) — хэсэгчилсэн алдааны дараа дахин хадгалж болно.
 */
export async function saveDailyReport(db: SupabaseClient, input: {
    shopId: string;
    userId: string | null;
    /** «Тайлан хийж гүйцэтгэсэн»-д бичих нэр. */
    userName: string;
    data: SaveDailyReportInput;
}): Promise<void> {
    const { shopId, userId, data } = input;
    const now = new Date().toISOString();
    const upserts = data.cells.filter(cell => cell.value !== null).map(cell => ({
        shop_id: shopId, report_date: data.date, manager_name: cell.manager, metric: cell.metric, value: cell.value,
        updated_by: userId, updated_at: now,
    }));
    if (upserts.length) {
        const { error } = await db.from('daily_report_counts').upsert(upserts, { onConflict: 'shop_id,report_date,manager_name,metric' });
        assertOk(error);
    }
    const clears = new Map<string, string[]>();
    for (const cell of data.cells) if (cell.value === null) clears.set(cell.manager, [...(clears.get(cell.manager) ?? []), cell.metric]);
    for (const [manager, metrics] of clears) {
        const { error } = await db.from('daily_report_counts').delete()
            .eq('shop_id', shopId).eq('report_date', data.date).eq('manager_name', manager).in('metric', metrics);
        assertOk(error);
    }
    if (data.notes === undefined && data.complete === undefined) return;
    const row: Record<string, unknown> = { shop_id: shopId, report_date: data.date, updated_by: userId, updated_at: now };
    if (data.notes !== undefined) row.notes = data.notes;
    if (data.complete === true) Object.assign(row, { completed_by: userId, completed_by_name: input.userName, completed_at: now });
    if (data.complete === false) Object.assign(row, { completed_by: null, completed_by_name: null, completed_at: null });
    const { error } = await db.from('daily_reports').upsert(row, { onConflict: 'shop_id,report_date' });
    assertOk(error);
}

export async function saveDailyReportConfig(db: SupabaseClient, shopId: string, config: DailyReportConfig, userId: string | null): Promise<void> {
    const { error } = await db.from('daily_report_settings')
        .upsert({ shop_id: shopId, config, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'shop_id' });
    assertOk(error);
}
