import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findActivityManager, loadManagerActivity } from '../activity-load';

type Row = Record<string, unknown>;
const originalTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'UTC'; });
afterAll(() => { process.env.TZ = originalTz; });

/** PostgREST-ийн OR шүүлтүүрийн (gte/in) хялбар орчуулга. */
function orFilter(expression: string) {
    const parts = expression.match(/[^,(]+(\([^)]*\))?/g) ?? [];
    const tests = parts.map(part => {
        const [key, op, ...rest] = part.split('.');
        const value = rest.join('.');
        if (op === 'gte') return (row: Row) => row[key] !== null && row[key] !== undefined && String(row[key]) >= value;
        if (op === 'in') return (row: Row) => value.slice(1, -1).split(',').includes(String(row[key]));
        throw new Error(`unsupported ${part}`);
    });
    return (row: Row) => tests.some(test => test(row));
}

/** `leads.deleted_at` г.м embed-ийн баганыг уншина (PostgREST-ийн `leads!inner(...)` шүүлтүүр). */
const field = (row: Row, key: string): unknown => key.split('.').reduce<unknown>((value, part) => (value as Row | null | undefined)?.[part], row);

function fakeDb(tables: Record<string, Row[]>, failing?: string) {
    const queries: Array<{ table: string; calls: unknown[][] }> = [];
    const db = { from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        const log = { table, calls: [] as unknown[][] };
        queries.push(log);
        const query: Record<string, unknown> = {};
        const record = (name: string, filter?: (...args: never[]) => (row: Row) => boolean) => (...args: unknown[]) => {
            log.calls.push([name, ...args]);
            if (filter) filters.push((filter as (...a: unknown[]) => (row: Row) => boolean)(...args));
            return query;
        };
        Object.assign(query, {
            select: record('select'), order: record('order'), range: record('range'),
            eq: record('eq', (key: string, value: unknown) => (row: Row) => row[key] === value),
            is: record('is', (key: string, value: unknown) => (row: Row) => (field(row, key) ?? null) === value),
            in: record('in', (key: string, values: unknown[]) => (row: Row) => values.includes(row[key])),
            gte: record('gte', (key: string, value: unknown) => (row: Row) => String(row[key]) >= String(value)),
            lte: record('lte', (key: string, value: unknown) => (row: Row) => Number(row[key]) <= Number(value)),
            lt: record('lt', (key: string, value: string) => (row: Row) => String(row[key]) < value),
            or: record('or', (expression: string) => orFilter(expression)),
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(table === failing
                ? { data: null, error: { message: `${table} унших алдаа` } }
                : { data: (tables[table] ?? []).filter(row => filters.every(filter => filter(row))), error: null }).then(resolve),
        });
        return query;
    } } as unknown as SupabaseClient;
    return { db, queries };
}

const tables = () => ({
    sales_managers: [{ shop_id: 's', name: 'Номин', user_id: 'u-nomin', is_active: true }, { shop_id: 's', name: 'Сараа', user_id: null, is_active: true }],
    sales_kpi_months: [{ shop_id: 's', manager_name: 'Номин', year: 2026, month: 10, daily: { calls: 3, meetings: 1 } }],
    lead_activities: [
        { shop_id: 's', type: 'call', created_by: 'u-nomin', created_by_name: 'Номин', created_at: '2026-10-04T16:00:00.000Z', leads: { deleted_at: null } },
        { shop_id: 's', type: 'call', created_by: 'u-nomin', created_by_name: 'Номин', created_at: '2026-10-04T15:59:59.000Z', leads: { deleted_at: null } },
        // Админ устгасан (спам/давхар) лидийн дуудлага — тоологдохгүй.
        { shop_id: 's', type: 'call', created_by: 'u-nomin', created_by_name: 'Номин', created_at: '2026-10-05T02:00:00.000Z', leads: { deleted_at: '2026-10-06T00:00:00.000Z' } },
        { shop_id: 'other', type: 'call', created_by: 'u-nomin', created_by_name: 'Номин', created_at: '2026-10-05T03:00:00.000Z' },
    ],
    property_viewings: [
        { shop_id: 's', sales_manager_name: 'Сараа', scheduled_at: '2026-10-05T03:00:00.000Z', status: 'completed', meeting_type: 'new_customer', deleted_at: null },
        { shop_id: 's', sales_manager_name: 'Сараа', scheduled_at: '2026-10-05T04:00:00.000Z', status: 'completed', meeting_type: 'new_customer', deleted_at: '2026-10-05T05:00:00.000Z' },
        { shop_id: 's', sales_manager_name: 'Сараа', scheduled_at: '2026-10-05T05:00:00.000Z', status: 'cancelled', meeting_type: 'new_customer', deleted_at: null },
    ],
    service_logs: [
        // 20 хоногийн өмнө бүртгэж, одоо ч нээлттэй (хэтэрсэн) — OR-ийн status салбараар уншина.
        { id: 1, shop_id: 's', manager_name: 'Сараа', priority: 'low', status: 'open', created_at: '2026-09-15T00:00:00.000Z', resolved_at: null },
        // 9 хоногийн өмнөх бага чухалтай — SLA нь хугацаанд дуусна (lookback салбар).
        { id: 2, shop_id: 's', manager_name: 'Сараа', priority: 'low', status: 'closed', created_at: '2026-09-26T00:00:00.000Z', resolved_at: '2026-10-07T00:00:00.000Z' },
        // Хэт хуучин, хугацаанаас өмнө хаагдсан — уншихгүй.
        { id: 3, shop_id: 's', manager_name: 'Сараа', priority: 'urgent', status: 'closed', created_at: '2026-08-01T00:00:00.000Z', resolved_at: '2026-08-01T05:00:00.000Z' },
    ],
});

describe('loadManagerActivity', () => {
    it('reads Ulaanbaatar day boundaries and the request lookback with a fixed set of queries', async () => {
        const { db, queries } = fakeDb(tables());
        const report = await loadManagerActivity(db, { shopId: 's', from: '2026-10-05', to: '2026-10-07', group: 'day', now: new Date('2026-10-07T04:00:00Z') });
        expect(queries.map(query => query.table).sort()).toEqual(['lead_activities', 'property_viewings', 'sales_kpi_months', 'sales_managers', 'service_logs']);
        const calls = queries.find(query => query.table === 'lead_activities')!.calls;
        expect(calls).toContainEqual(['gte', 'created_at', '2026-10-04T16:00:00.000Z']);
        expect(calls).toContainEqual(['lt', 'created_at', '2026-10-07T16:00:00.000Z']);
        expect(calls).toContainEqual(['eq', 'type', 'call']);
        expect(calls).toContainEqual(['select', 'created_by, created_by_name, created_at, leads!inner(deleted_at)']);
        expect(calls).toContainEqual(['is', 'leads.deleted_at', null]);
        expect(queries.find(query => query.table === 'service_logs')!.calls)
            .toContainEqual(['or', 'created_at.gte.2026-09-24T16:00:00.000Z,resolved_at.gte.2026-10-04T16:00:00.000Z,status.in.(open,in_progress)']);

        const nomin = report.managers.find(row => row.manager === 'Номин')!;
        expect(nomin.rows.map(row => row.calls)).toEqual([1, 0, 0]);
        expect(nomin.rows[0]).toMatchObject({ target: { calls: 3, meetings: 1 }, attainment: { calls: 33.3, meetings: 0 } });
        const saraa = report.managers.find(row => row.manager === 'Сараа')!;
        expect(saraa.totals).toMatchObject({ meetingsHeld: 1, meetingsNew: 1 });
        // id 2: SLA 10-06-нд дууссан (хэтэрсэн), 10-07-нд хаагдсан; id 1 одоо ч нээлттэй хэтэрсэн.
        expect(saraa.totals.requests).toMatchObject({ received: 0, resolved: 1, slaTotal: 1, slaMet: 0 });
        expect(saraa.openOverdue).toBe(1);
    });

    it('limits to one manager and surfaces read errors instead of empty data', async () => {
        const { db } = fakeDb(tables());
        const own = await loadManagerActivity(db, { shopId: 's', from: '2026-10-05', to: '2026-10-05', group: 'day', only: 'Номин', now: new Date('2026-10-05T04:00:00Z') });
        expect(own.managers.map(row => row.manager)).toEqual(['Номин']);
        expect(own.unattributed).toBeNull();
        await expect(loadManagerActivity(fakeDb(tables(), 'service_logs').db, { shopId: 's', from: '2026-10-05', to: '2026-10-05', group: 'day' })).rejects.toThrow('service_logs унших алдаа');
        await expect(loadManagerActivity(fakeDb(tables(), 'sales_managers').db, { shopId: 's', from: '2026-10-05', to: '2026-10-05', group: 'day' })).rejects.toMatchObject({ message: 'sales_managers унших алдаа' });
        await expect(loadManagerActivity(db, { shopId: 's', from: '2026-10-05', to: '2026-10-01', group: 'day' })).rejects.toThrow('дараалл');
    });
});

describe('findActivityManager', () => {
    const roster = () => ({ sales_managers: [
        { shop_id: 's', name: 'Номин-Эрдэнэ', user_id: 'u-1', is_active: true },
        { shop_id: 's', name: 'Сараа', user_id: null, is_active: true },
        { shop_id: 's', name: 'Хуучин', user_id: null, is_active: false },
        { shop_id: 'other', name: 'Номин', user_id: null, is_active: true },
    ] });

    it('accepts an exact roster name of this project (inactive included) and never guesses a near match', async () => {
        const { db } = fakeDb(roster());
        expect(await findActivityManager(db, 's', ' Сараа ')).toEqual({ ok: true, name: 'Сараа' });
        expect(await findActivityManager(db, 's', 'Хуучин')).toEqual({ ok: true, name: 'Хуучин' });
        // Өөр төслийн «Номин» биш; төстэй нэрийг сонголтоор санал болгоно.
        expect(await findActivityManager(db, 's', 'Номин')).toEqual({ ok: false, error: 'Ийм менежер бүртгэлд алга', options: ['Номин-Эрдэнэ'] });
        // Төстэй нэргүй бол идэвхтэй бүх нэр.
        expect(await findActivityManager(db, 's', 'Дорж')).toMatchObject({ ok: false, options: ['Номин-Эрдэнэ', 'Сараа'] });
        await expect(findActivityManager(fakeDb(roster(), 'sales_managers').db, 's', 'Сараа')).rejects.toMatchObject({ message: 'sales_managers унших алдаа' });
    });
});
