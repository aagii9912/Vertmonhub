// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, gte: [] as Array<[string, string, string]> }));

vi.mock('@/lib/auth/require-permission', () => ({ requireModule: async () => null }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1', name: 'Мандала Гарден' }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/sales/project-scope', () => ({
    resolveSalesProjectScope: async () => ({ projectIds: null }),
    applyLeadScope: (query: unknown) => query,
    ProjectScopeError: class extends Error {},
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is']) query[method] = () => query;
    query.gte = (column: string, value: string) => { state.gte.push([table, column, value]); return query; };
    query.then = (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: state.tables[table] ?? [], error: null }).then(resolve);
    return query;
} }) }));

import { GET } from '../route';

const months = async () => (await (await GET()).json()).months as Array<{ month: string; label: string; leads: number; meetings: number; spend: number }>;

describe('marketing ROI timeline months (Ulaanbaatar calendar on a UTC server)', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => {
        process.env.TZ = 'UTC';
        vi.useFakeTimers();
        state.tables = {};
        state.gte = [];
    });
    afterEach(() => {
        vi.useRealTimers();
        process.env.TZ = originalTz;
    });

    it('counts the first hours of a month in that month, not the previous one', async () => {
        // 2026-10-01 05:00 УБ = 2026-09-30 21:00 UTC.
        vi.setSystemTime(new Date('2026-09-30T21:00:00Z'));
        state.tables.leads = [
            { created_at: '2026-09-30T20:00:00Z' }, // 10-р сарын 1, 04:00 УБ
            { created_at: '2026-09-30T15:00:00Z' }, // 9-р сарын 30, 23:00 УБ
        ];
        state.tables.property_viewings = [{ scheduled_at: '2026-04-30T16:30:00Z' }]; // 5-р сарын 1, 00:30 УБ
        state.tables.ad_campaigns = [{ spend: 120, start_date: '2026-10-01', created_at: '2026-09-28T00:00:00Z' }];

        const result = await months();
        expect(result.map((m) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
        expect(result.at(-1)).toMatchObject({ label: '10-р сар', leads: 1, spend: 120 });
        expect(result.find((m) => m.month === '2026-09')?.leads).toBe(1);
        expect(result[0]).toMatchObject({ month: '2026-05', meetings: 1 });
    });

    it('starts the window at Ulaanbaatar midnight of the first month', async () => {
        vi.setSystemTime(new Date('2026-09-30T21:00:00Z'));
        await months();
        // 2026-05-01 00:00 УБ = 2026-04-30 16:00 UTC.
        expect(state.gte).toContainEqual(['leads', 'created_at', '2026-04-30T16:00:00.000Z']);
        expect(state.gte).toContainEqual(['property_viewings', 'scheduled_at', '2026-04-30T16:00:00.000Z']);
    });

    it('crosses the year boundary', async () => {
        vi.setSystemTime(new Date('2027-01-15T04:00:00Z'));
        expect((await months()).map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
    });
});
