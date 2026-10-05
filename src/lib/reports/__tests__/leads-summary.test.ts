import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLeadsSummary, leadsReportInstants, resolveLeadsReportRange, type LeadsSummaryLead } from '../leads-summary';
import { loadLeadsSummary } from '../leads-summary-load';

type Row = Record<string, any>;

const mandala = '00000000-0000-4000-8000-000000000001';
const elysium = '00000000-0000-4000-8000-000000000002';

const lead = (status: string, extra: Partial<LeadsSummaryLead> = {}): LeadsSummaryLead =>
    ({ status, source: 'facebook', project_id: mandala, sales_manager_name: 'Номин', ...extra });

/** PostgREST-тэй адил: шүүлтүүр, range, нэг хариунд дээд тал нь 1000 мөр. */
function database(tables: Record<string, Row[]>, failing?: string): SupabaseClient & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        from: (table: string) => {
            const filters: Array<(row: Row) => boolean> = [];
            let first = 0;
            let last = Infinity;
            const query = {
                select: () => query,
                eq: (key: string, value: unknown) => { calls.push(`${table}.eq.${key}`); filters.push(row => row[key] === value); return query; },
                is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
                in: (key: string, values: unknown[]) => { calls.push(`${table}.in.${key}`); filters.push(row => values.includes(row[key])); return query; },
                gte: (key: string, value: string) => { filters.push(row => Date.parse(row[key]) >= Date.parse(value)); return query; },
                lt: (key: string, value: string) => { filters.push(row => Date.parse(row[key]) < Date.parse(value)); return query; },
                order: () => query,
                range: (from: number, to: number) => { first = from; last = to; return query; },
                then: (resolve: (value: unknown) => unknown) => Promise.resolve(table === failing
                    ? { data: null, error: { message: 'connection reset' } }
                    : { data: (tables[table] ?? []).filter(row => filters.every(filter => filter(row))).slice(first, last + 1).slice(0, 1000), error: null }).then(resolve),
            };
            return query;
        },
    } as unknown as SupabaseClient & { calls: string[] };
}

describe('resolveLeadsReportRange', () => {
    const now = new Date('2026-10-05T05:00:00Z'); // УБ 13:00

    it('defaults to the last 30 Ulaanbaatar days including today', () => {
        expect(resolveLeadsReportRange({}, now)).toEqual({ ok: true, range: { period: 'month', from: '2026-09-06', to: '2026-10-05' } });
        expect(resolveLeadsReportRange({ period: '' }, now)).toMatchObject({ ok: true, range: { period: 'month' } });
    });

    it('maps each period to a rolling window of whole UB days', () => {
        const range = (period: string) => resolveLeadsReportRange({ period }, now);
        expect(range('today')).toEqual({ ok: true, range: { period: 'today', from: '2026-10-05', to: '2026-10-05' } });
        expect(range('week')).toMatchObject({ range: { from: '2026-09-29', to: '2026-10-05' } });
        expect(range('quarter')).toMatchObject({ range: { from: '2026-07-08', to: '2026-10-05' } });
        expect(range('year')).toMatchObject({ range: { from: '2025-10-06', to: '2026-10-05' } });
    });

    it('accepts an explicit from/to range and rejects invalid input', () => {
        expect(resolveLeadsReportRange({ from: '2026-09-01', to: '2026-09-30', period: 'year' }, now))
            .toEqual({ ok: true, range: { period: null, from: '2026-09-01', to: '2026-09-30' } });
        expect(resolveLeadsReportRange({ period: 'decade' }, now)).toEqual({ ok: false, error: 'Хугацааны сонголт буруу байна' });
        for (const input of [{ from: '2026-09-30', to: '2026-09-01' }, { from: '2025-01-01', to: '2026-09-30' }, { from: '2026-09-01' }, { from: '01/09/2026', to: '2026-09-30' }]) {
            expect(resolveLeadsReportRange(input, now)).toMatchObject({ ok: false });
        }
    });

    it('converts UB days into created_at instants', () => {
        expect(leadsReportInstants({ from: '2026-10-01', to: '2026-10-05' }))
            .toEqual({ start: '2026-09-30T16:00:00.000Z', end: '2026-10-05T16:00:00.000Z' });
    });

    describe('on a UTC server (Vercel)', () => {
        const originalTz = process.env.TZ;
        beforeEach(() => { process.env.TZ = 'UTC'; });
        afterEach(() => { process.env.TZ = originalTz; });

        it('uses the Ulaanbaatar date before 08:00 UB, not the UTC date', () => {
            const early = new Date('2026-10-04T20:30:00Z'); // УБ 10-05 04:30, UTC-ээр 10-04 хэвээр
            expect(resolveLeadsReportRange({ period: 'today' }, early)).toEqual({ ok: true, range: { period: 'today', from: '2026-10-05', to: '2026-10-05' } });
            expect(leadsReportInstants({ from: '2026-10-05', to: '2026-10-05' })).toEqual({ start: '2026-10-04T16:00:00.000Z', end: '2026-10-05T16:00:00.000Z' });
        });
    });
});

describe('buildLeadsSummary', () => {
    const projects = [{ id: mandala, name: 'Mandala Garden' }, { id: elysium, name: 'Elysium Residence' }];

    it('counts totals, statuses and conversion from every lead', () => {
        const summary = buildLeadsSummary([
            lead('new'), lead('new'), lead('contacted'), lead('viewing_scheduled'), lead('negotiating'),
            lead('closed_won'), lead('closed_won'), lead('closed_lost'),
        ], projects);
        expect(summary.total).toBe(8);
        expect(summary.conversion).toEqual({ won: 2, lost: 1, open: 5, inProgress: 3 });
        expect(summary.byStatus).toEqual([
            { status: 'new', count: 2 }, { status: 'contacted', count: 1 }, { status: 'viewing_scheduled', count: 1 },
            { status: 'offered', count: 0 }, { status: 'negotiating', count: 1 }, { status: 'closed_won', count: 2 }, { status: 'closed_lost', count: 1 },
        ]);
    });

    it('groups sources, real projects and managers with won counts and no money', () => {
        const summary = buildLeadsSummary([
            lead('closed_won', { source: 'facebook', project_id: elysium, sales_manager_name: 'Эли' }),
            lead('new', { source: null, project_id: null, sales_manager_name: null }),
            lead('new', { source: 'phone', project_id: mandala, sales_manager_name: ' Номин ' }),
            lead('closed_won', { source: 'facebook', project_id: mandala, sales_manager_name: 'Номин' }),
            lead('contacted', { source: 'facebook', project_id: 'ffffffff-0000-4000-8000-000000000000', sales_manager_name: '' }),
        ], projects);
        expect(summary.bySource).toEqual([
            { source: 'facebook', count: 3, won: 2 }, { source: 'other', count: 1, won: 0 }, { source: 'phone', count: 1, won: 0 },
        ]);
        expect(summary.byProject).toEqual([
            { projectId: mandala, name: 'Mandala Garden', count: 2, won: 1 },
            { projectId: 'ffffffff-0000-4000-8000-000000000000', name: null, count: 1, won: 0 },
            { projectId: elysium, name: 'Elysium Residence', count: 1, won: 1 },
            { projectId: null, name: null, count: 1, won: 0 },
        ]);
        expect(summary.byManager).toEqual([
            { manager: 'Номин', count: 2, won: 1 }, { manager: 'Эли', count: 1, won: 1 }, { manager: null, count: 2, won: 0 },
        ]);
        expect(JSON.stringify(summary)).not.toMatch(/budget|value/);
    });

    it('groups lead categories by id with won counts, uncategorized last', () => {
        const summary = buildLeadsSummary([
            lead('closed_won', { category_id: 'cat-invest' }),
            lead('new', { category_id: 'cat-invest' }),
            lead('new', { category_id: 'cat-family' }),
            lead('new', { category_id: null }),
            lead('closed_won'),
        ], projects);
        expect(summary.byCategory).toEqual([
            { categoryId: 'cat-invest', count: 2, won: 1 },
            { categoryId: 'cat-family', count: 1, won: 0 },
            { categoryId: null, count: 2, won: 1 },
        ]);
    });

    it('returns an empty report without inventing rows', () => {
        const summary = buildLeadsSummary([], projects);
        expect(summary).toMatchObject({ total: 0, bySource: [], byProject: [], byManager: [], conversion: { won: 0, lost: 0, open: 0, inProgress: 0 } });
        expect(summary.byStatus.every(row => row.count === 0)).toBe(true);
    });
});

describe('loadLeadsSummary', () => {
    const range = { period: null, from: '2026-09-01', to: '2026-09-30' };
    const row = (index: number, extra: Row = {}) => ({
        id: `lead-${index}`, shop_id: 'shop', deleted_at: null, created_at: '2026-09-15T04:00:00Z',
        status: index % 10 === 0 ? 'closed_won' : 'new', source: 'facebook', project_id: mandala, sales_manager_name: 'Номин', ...extra,
    });
    const tables = () => ({
        projects: [{ id: mandala, shop_id: 'shop', name: 'Mandala Garden' }, { id: elysium, shop_id: 'shop', name: 'Elysium Residence' }],
        leads: [
            ...Array.from({ length: 1205 }, (_, index) => row(index)),
            row(5000, { created_at: '2026-08-31T15:59:59Z' }), // УБ 08-31 23:59 → хугацаанаас өмнө
            row(5001, { created_at: '2026-09-30T16:00:00Z' }), // УБ 10-01 00:00 → хугацааны дараа
            row(5002, { created_at: '2026-08-31T16:00:00Z', project_id: elysium, sales_manager_name: 'Эли' }), // УБ 09-01 00:00
            row(5003, { deleted_at: '2026-09-20T00:00:00Z' }),
            row(5004, { shop_id: 'other-shop' }),
        ],
    });

    it('reads past the 1,000-row page cap and keeps the UB date boundaries', async () => {
        const report = await loadLeadsSummary(database(tables()), { shopId: 'shop', scope: { projectIds: null, managerName: null }, range });
        expect(report.range).toEqual(range);
        expect(report.total).toBe(1206);
        expect(report.conversion.won).toBe(121);
        expect(report.byProject).toEqual([
            { projectId: mandala, name: 'Mandala Garden', count: 1205, won: 121 },
            { projectId: elysium, name: 'Elysium Residence', count: 1, won: 0 },
        ]);
    });

    it('applies the manager project scope to leads and project names', async () => {
        const db = database(tables());
        const report = await loadLeadsSummary(db, { shopId: 'shop', scope: { projectIds: [elysium], managerName: 'Эли' }, range });
        expect(report.total).toBe(1);
        expect(report.byManager).toEqual([{ manager: 'Эли', count: 1, won: 0 }]);
        expect(db.calls).toEqual(expect.arrayContaining(['leads.in.project_id', 'leads.eq.sales_manager_name', 'projects.in.id']));
    });

    it('fails instead of returning a partial report when a read fails', async () => {
        await expect(loadLeadsSummary(database(tables(), 'leads'), { shopId: 'shop', scope: { projectIds: null, managerName: null }, range }))
            .rejects.toThrow('connection reset');
    });
});
