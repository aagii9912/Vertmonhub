import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMeetingDetails, loadViewingReferrals } from '../meeting-details-load';

type Row = Record<string, unknown>;
type DbError = { code: string; message: string };

/**
 * eq/is/in/gte/lt/not шүүлтийг дуурайна. `columnErrors` — тухайн баганыг сонгосон асуулгад алдаа
 * (migration ороогүй багана), `errors` — хүснэгтийн бүх асуулгад алдаа.
 */
function fakeDb(tables: Record<string, Row[]>, options: { errors?: Record<string, DbError>; columnErrors?: Record<string, DbError> } = {}, calls: string[] = []) {
    return { from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        let selected = '';
        const result = () => {
            const columnError = Object.entries(options.columnErrors ?? {}).find(([column]) => selected.includes(column))?.[1];
            const error = options.errors?.[table] ?? columnError;
            if (error) return { data: null, error };
            return { data: (tables[table] ?? []).filter(row => filters.every(f => f(row))), error: null };
        };
        let ascending: string | null = null;
        let limit = Infinity;
        const sorted = () => {
            const { data, error } = result();
            return { data: data && ascending ? [...data].sort((a, b) => String(a[ascending!]).localeCompare(String(b[ascending!]))).slice(0, limit) : data, error };
        };
        const query: Record<string, unknown> = {
            select: (columns: string) => { selected = columns; calls.push(`${table}:${columns}`); return query; },
            limit: (value: number) => { limit = value; return query; },
            maybeSingle: () => { const { data, error } = sorted(); return Promise.resolve({ data: data?.[0] ?? null, error }); },
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            is: (key: string, value: null) => { filters.push(row => (row[key] ?? null) === value); return query; },
            in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
            not: (key: string, operator: string, value: null) => { if (operator === 'is' && value === null) filters.push(row => row[key] != null); return query; },
            gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return query; },
            lt: (key: string, value: string) => { filters.push(row => String(row[key]) < value); return query; },
            order: (key: string, opts?: { ascending?: boolean }) => { if (opts?.ascending) ascending = key; return query; }, range: () => query,
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return query;
    } } as unknown as SupabaseClient;
}

const interest = (block: string, model: string, area_sqm: number) => [{ block, model, area_sqm, floor: null, unit_id: null, payment_condition: '50%', quote: null }];
const base = () => ({
    property_viewings: [
        // УБ 10-14 01:30 (UTC-ээр 10-13) → тайлант 7 хоног.
        { id: 'v1', shop_id: 's', scheduled_at: '2026-10-13T17:30:00Z', status: 'completed', meeting_type: 'new_customer', deleted_at: null, interests: interest('Б1', 'E3', 85.19), referral_source_id: 'r1' },
        { id: 'v2', shop_id: 's', scheduled_at: '2026-10-15T03:00:00Z', status: 'completed', meeting_type: 'new_customer', deleted_at: null, interests: [], referral_source_id: 'r-archived' },
        { id: 'v3', shop_id: 's', scheduled_at: '2026-10-15T04:00:00Z', status: 'completed', meeting_type: 'new_customer', deleted_at: null, interests: null, referral_source_id: null },
        { id: 'v4', shop_id: 's', scheduled_at: '2026-10-15T05:00:00Z', status: 'no_show', meeting_type: 'new_customer', deleted_at: null, interests: interest('Б2', 'A', 57.87) },
        { id: 'v5', shop_id: 's', scheduled_at: '2026-10-15T06:00:00Z', status: 'completed', meeting_type: 'new_customer', deleted_at: '2026-10-16T00:00:00Z', interests: [] },
        // УБ 10-13 23:30 → өмнөх 7 хоног.
        { id: 'v6', shop_id: 's', scheduled_at: '2026-10-13T15:30:00Z', status: 'completed', meeting_type: 'repeat_customer', deleted_at: null, interests: interest('Б2', 'A', 57.87) },
        { id: 'vx', shop_id: 'x', scheduled_at: '2026-10-15T03:00:00Z', status: 'completed', meeting_type: 'new_customer', deleted_at: null, interests: [] },
    ],
    property_units: [
        { id: 'u1', shop_id: 's', category: 'residential', block: 'Б1', model: 'E3', rooms: 3 },
        { id: 'u2', shop_id: 's', category: 'residential', block: 'Б2', model: 'A', rooms: 2 },
        { id: 'u3', shop_id: 's', category: 'parking', block: 'Б1', model: 'E3', rooms: 1 },
    ],
    sales_referral_sources: [
        { id: 'r1', shop_id: 's', name: 'Ойрхон амьдардаг', archived_at: null },
        { id: 'r-archived', shop_id: 's', name: 'Бармаш түрээслэгч', archived_at: '2026-10-20T00:00:00Z' },
        { id: 'r-other', shop_id: 'x', name: 'Бусад төсөл', archived_at: null },
    ],
});

const original = process.env.TZ;
afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
});

describe('loadMeetingDetails', () => {
    it('reads completed meetings by Ulaanbaatar day (server in UTC), rooms from the register and «Сэжим» names', async () => {
        process.env.TZ = 'UTC';
        const report = await loadMeetingDetails(fakeDb(base()), { shopId: 's', meetingDate: '2026-10-21' });
        expect(report.weeks[3]).toMatchObject({ total: 3, withoutInterest: 2, byModel: [{ key: 'B1|E3', label: 'Б1 E3 · 85.19 м² · 3 өрөө', count: 1 }] });
        expect(report.weeks[2]).toMatchObject({ total: 1, withoutInterest: 0, byModel: [{ key: 'B2|A', label: 'Б2 A · 57.87 м² · 2 өрөө', count: 1 }] });
        // Архивласан сэжим нэрээ хадгална.
        expect(report.referral).toEqual({ rows: [{ label: 'Бармаш түрээслэгч', count: 1 }, { label: 'Ойрхон амьдардаг', count: 1 }], unknown: 1, total: 3, available: true });
    });

    it('marks weeks before the first recorded meeting unknown and the straddling week a lower bound', async () => {
        const report = await loadMeetingDetails(fakeDb(base()), { shopId: 's', meetingDate: '2026-10-21' });
        // Хамгийн эртний (устгаагүй, ямар ч төлөвтэй) уулзалт: УБ 10-13 (v6) → өмнөх хоёр 7 хоног бүртгэлгүй, 10/07–10/13 доод хязгаар.
        expect(report.weeks.map(week => [week.label, week.coverage])).toEqual([
            ['09/23–09/29', 'none'], ['09/30–10/06', 'none'], ['10/07–10/13', 'partial'], ['10/14–10/20', 'full'],
        ]);
        expect(report.notes.join(' ')).toMatch(/Уулзалтын бүртгэл 2026-10-13-нээс эхэлсэн/);
    });

    it('treats every new meeting as unknown when the referral column or table is missing', async () => {
        const missingColumn = await loadMeetingDetails(fakeDb(base(), { columnErrors: { referral_source_id: { code: '42703', message: 'column property_viewings.referral_source_id does not exist' } } }),
            { shopId: 's', meetingDate: '2026-10-21' });
        expect(missingColumn.referral).toEqual({ rows: [], unknown: 3, total: 3, available: false });
        expect(missingColumn.weeks[3].total).toBe(3);
        const missingTable = await loadMeetingDetails(fakeDb(base(), { errors: { sales_referral_sources: { code: 'PGRST205', message: 'Could not find the table' } } }),
            { shopId: 's', meetingDate: '2026-10-21' });
        expect(missingTable.referral).toMatchObject({ unknown: 3, available: false });
    });

    it('surfaces other read errors instead of an empty report', async () => {
        await expect(loadMeetingDetails(fakeDb(base(), { errors: { property_units: { code: '57014', message: 'units timeout' } } }), { shopId: 's', meetingDate: '2026-10-21' }))
            .rejects.toThrow('units timeout');
        await expect(loadMeetingDetails(fakeDb(base(), { errors: { sales_referral_sources: { code: '57014', message: 'sources timeout' } } }), { shopId: 's', meetingDate: '2026-10-21' }))
            .rejects.toThrow('sources timeout');
    });
});

describe('loadViewingReferrals', () => {
    it('still probes the column with no meetings so availability is reported truthfully', async () => {
        const calls: string[] = [];
        const missing = await loadViewingReferrals(fakeDb(base(), { columnErrors: { referral_source_id: { code: '42703', message: 'missing' } } }, calls), 's', []);
        expect(missing.available).toBe(false);
        expect(calls).toEqual(['property_viewings:id, referral_source_id']);
        expect((await loadViewingReferrals(fakeDb(base()), 's', [])).available).toBe(true);
    });

    it('never resolves another shop\'s source names', async () => {
        const tables = base();
        tables.property_viewings[0].referral_source_id = 'r-other';
        const result = await loadViewingReferrals(fakeDb(tables), 's', ['v1']);
        expect(result.byViewing.get('v1')).toBeNull();
    });
});
