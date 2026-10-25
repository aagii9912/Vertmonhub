import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSalesActivity } from '../sales-activity-load';
import { DailyReportUnavailableError } from '../daily-report-load';

type Row = Record<string, unknown>;
type DbError = { code: string; message: string };

/** eq/is/gte/lte/lt/in шүүлт, order (эхний багана), limit, maybeSingle-ийг дуурайна; хүснэгтээр алдаа буцааж болно. */
function fakeDb(tables: Record<string, Row[]>, errors: Record<string, DbError> = {}, calls: string[] = []) {
    return { from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        let sort: { key: string; ascending: boolean } | null = null;
        let limit = Infinity;
        const result = () => {
            if (errors[table]) return { data: null, error: errors[table] };
            let rows = (tables[table] ?? []).filter(row => filters.every(f => f(row)));
            if (sort) {
                const { key, ascending } = sort;
                rows = [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
            }
            return { data: rows.slice(0, limit), error: null };
        };
        const query: Record<string, unknown> = {
            select: (columns: string) => { calls.push(`${table}:${columns}`); return query; },
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            is: (key: string, value: null) => { filters.push(row => (row[key] ?? null) === value); return query; },
            in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
            gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return query; },
            lte: (key: string, value: string) => { filters.push(row => String(row[key]) <= value); return query; },
            lt: (key: string, value: string) => { filters.push(row => String(row[key]) < value); return query; },
            order: (key: string, options?: { ascending?: boolean }) => { sort ??= { key, ascending: options?.ascending ?? true }; return query; },
            limit: (count: number) => { limit = count; return query; },
            range: () => query,
            maybeSingle: async () => {
                const { data, error } = result();
                return { data: data?.[0] ?? null, error };
            },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return query;
    } } as unknown as SupabaseClient;
}

const config = {
    lines: [
        { key: 'l1', label: '7786-2222', categories: ['new', 'repeat', 'other'] },
        { key: 'l2', label: '8888/9008', categories: ['new', 'repeat', 'other'] },
    ],
    chats: [{ key: 'page', label: 'Пэйж FB' }, { key: 'personal', label: 'Хувь чат' }],
};
const base = () => ({
    daily_report_settings: [{ shop_id: 's', config, updated_at: '2026-10-17T00:00:00Z' }],
    daily_report_counts: [
        { shop_id: 's', report_date: '2026-10-08', manager_name: 'Khongoroo', metric: 'call.l1.new', value: 2 },
        { shop_id: 's', report_date: '2026-10-08', manager_name: 'Khongoroo', metric: 'call.l1.total', value: 2 },
        { shop_id: 's', report_date: '2026-10-15', manager_name: 'Khongoroo', metric: 'call.l2.new', value: 6 },
        { shop_id: 's', report_date: '2026-10-15', manager_name: 'Khongoroo', metric: 'chat.page', value: 4 },
        { shop_id: 'x', report_date: '2026-10-15', manager_name: 'Other', metric: 'call.l1.new', value: 99 },
    ],
    daily_reports: [
        { shop_id: 's', report_date: '2026-10-15', completed_at: '2026-10-15T12:00:00Z' },
        { shop_id: 's', report_date: '2026-10-16', completed_at: null },
    ],
    property_viewings: [
        // 2026-10-13T17:30Z = УБ 10-14 01:30 → 10/14–10/20 хэсэг.
        { id: 'v1', shop_id: 's', scheduled_at: '2026-10-13T17:30:00Z', status: 'completed', meeting_type: 'new_customer', deleted_at: null },
        // 2026-10-13T15:30Z = УБ 10-13 23:30 → 10/07–10/13 хэсэг.
        { id: 'v2', shop_id: 's', scheduled_at: '2026-10-13T15:30:00Z', status: 'completed', meeting_type: 'repeat_customer', deleted_at: null },
        { id: 'v3', shop_id: 's', scheduled_at: '2026-10-15T03:00:00Z', status: 'no_show', meeting_type: 'new_customer', deleted_at: null },
        { id: 'v4', shop_id: 's', scheduled_at: '2026-10-15T03:00:00Z', status: 'completed', meeting_type: 'new_customer', deleted_at: '2026-10-16T00:00:00Z' },
        { id: 'v0', shop_id: 's', scheduled_at: '2026-10-06T16:30:00Z', status: 'scheduled', meeting_type: 'new_customer', deleted_at: null },
        { id: 'vx', shop_id: 'x', scheduled_at: '2026-01-01T03:00:00Z', status: 'completed', meeting_type: 'new_customer', deleted_at: null },
    ],
    team_sales_targets: [{ shop_id: 's', year: 2026, month: 10, activity_targets: { hotline: 550, manager_line: 300, meetings_new: 110, meetings_repeat: 30, chats: 85 } }],
});

const original = process.env.TZ;
afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
});

describe('loadSalesActivity', () => {
    it('reads the shop window, buckets meetings by Ulaanbaatar day (server in UTC) and attaches the month plan', async () => {
        process.env.TZ = 'UTC';
        const calls: string[] = [];
        const report = await loadSalesActivity(fakeDb(base(), {}, calls), { shopId: 's', shopName: 'Elysium Residence', meetingDate: '2026-10-21' });
        const [, , , previous, current] = report.buckets;
        expect(previous.values).toEqual({ hotline: 2, managerLine: null, newMeetings: 0, repeatMeetings: 1, chats: null });
        expect(current.values).toEqual({ hotline: null, managerLine: 6, newMeetings: 1, repeatMeetings: 0, chats: 4 });
        expect(current).toMatchObject({ confirmedDays: 1, knownDays: 1 });
        // Уулзалтын бүртгэл эхэлсэн өдөр: устгаагүй, ямар ч төлөвтэй хамгийн эртний (УБ 10-07).
        expect(report.dataSince).toBe('2026-10-07');
        expect(report.buckets[2].values.newMeetings).toBeNull();
        // Өдрийн тайлангийн тоо 10/08-нд эхэлсэн тул 10-р сарын дуудлага доод хязгаар, хувь «—» (0 өдрүүдийг тооцохгүй).
        expect(report.month.metrics.hotline).toEqual({ actual: 2, plan: 550, planToDate: 367, pct: null, partial: true });
        expect(calls).toContain('daily_report_counts:report_date');
        // Уулзалтын бүртгэл 10/07-нд эхэлсэн тул сарын тоо доод хязгаар, хувь «—».
        expect(report.month.metrics.repeatMeetings).toEqual({ actual: 1, plan: 30, planToDate: 20, pct: null, partial: true });
        expect(report.lines.hotline).toBe('7786-2222');
        expect(calls).toContain('daily_report_counts:report_date, manager_name, metric, value');
    });

    it('degrades plans to unknown when the activity_targets column is missing', async () => {
        const report = await loadSalesActivity(fakeDb(base(), { team_sales_targets: { code: '42703', message: 'column team_sales_targets.activity_targets does not exist' } }),
            { shopId: 's', shopName: 'Elysium Residence', meetingDate: '2026-10-21' });
        expect(report.month.metrics.hotline.plan).toBeNull();
        expect(report.notes.join(' ')).toContain('шинэчлэл суулгаагүй');
    });

    it('surfaces other read errors and a missing daily report schema instead of an empty report', async () => {
        await expect(loadSalesActivity(fakeDb(base(), { team_sales_targets: { code: '57014', message: 'timeout' } }),
            { shopId: 's', shopName: 'E', meetingDate: '2026-10-21' })).rejects.toThrow('timeout');
        await expect(loadSalesActivity(fakeDb(base(), { daily_report_settings: { code: '42P01', message: 'relation does not exist' } }),
            { shopId: 's', shopName: 'E', meetingDate: '2026-10-21' })).rejects.toBeInstanceOf(DailyReportUnavailableError);
        await expect(loadSalesActivity(fakeDb(base(), { daily_report_counts: { code: '57014', message: 'counts failed' } }),
            { shopId: 's', shopName: 'E', meetingDate: '2026-10-21' })).rejects.toThrow('counts failed');
    });
});
