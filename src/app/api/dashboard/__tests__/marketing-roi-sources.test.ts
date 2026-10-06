// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    leads: [] as Row[],
    scope: { projectIds: null as string[] | null, managerName: null as string | null },
    requests: 0,
}));

vi.mock('@/lib/auth/require-permission', () => ({ requireModule: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: vi.fn().mockResolvedValue({ id: 'shop-1' }) }));
vi.mock('@/lib/sales/project-scope', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/sales/project-scope')>()),
    resolveSalesProjectScope: vi.fn(async () => state.scope),
}));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from: (table: string) => {
            const filters: ((row: Row) => boolean)[] = [];
            let window: [number, number] = [0, Number.MAX_SAFE_INTEGER];
            const chain: Record<string, unknown> = {
                select: () => chain,
                order: () => chain,
                eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return chain; },
                is: (column: string, value: unknown) => { filters.push(row => (row[column] ?? null) === value); return chain; },
                in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return chain; },
                range: (from: number, to: number) => { window = [from, to]; return chain; },
                then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
                    state.requests++;
                    const rows = (table === 'leads' ? state.leads : []).filter(row => filters.every(f => f(row)))
                        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
                        .slice(window[0], window[1] + 1)
                        // PostgREST нэг хариунд дээд тал нь 1000 мөр өгдөг.
                        .slice(0, 1000);
                    return Promise.resolve({ data: rows, error: null }).then(resolve);
                },
            };
            return chain;
        },
    }),
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { requireModule } from '@/lib/auth/require-permission';
import { GET } from '../marketing-roi/sources/route';

let seq = 0;
const lead = (fields: Row): Row => ({
    id: `lead-${String(seq++).padStart(5, '0')}`, shop_id: 'shop-1', deleted_at: null,
    source: 'facebook_ads', status: 'new', created_at: '2026-09-15T04:00:00Z', project_id: 'p-1', sales_manager_name: 'Болд', ...fields,
});
const many = (count: number, fields: (i: number) => Row) => Array.from({ length: count }, (_, i) => lead(fields(i)));
const read = async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    return (await response.json()).stats;
};

describe('GET /api/dashboard/marketing-roi/sources', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => {
        // Vercel ажилладаг шиг UTC сервер.
        process.env.TZ = 'UTC';
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-05T04:00:00Z'));
        state.scope = { projectIds: null, managerName: null };
        state.requests = 0;
        seq = 0;
    });
    afterEach(() => {
        vi.useRealTimers();
        process.env.TZ = originalTz;
    });

    it('aggregates every lead past the 1000-row response cap, gated by the marketing-roi module', async () => {
        state.leads = [
            // Хамгийн хуучин 450 лид Instagram-аас — сүүлийн 1000-аар тооцвол бүхэлдээ алга болдог байсан.
            ...many(450, i => ({ source: 'instagram', status: i < 90 ? 'closed_won' : 'contacted', created_at: '2025-01-10T04:00:00Z' })),
            ...many(900, i => ({ status: i < 90 ? 'closed_won' : i < 120 ? 'closed_lost' : 'new' })),
            ...many(150, () => ({ source: null })),
            // Устгасан болон өөр байгууллагын лид тоонд орохгүй.
            ...many(5, () => ({ deleted_at: '2026-09-20T00:00:00Z', status: 'closed_won' })),
            ...many(5, () => ({ shop_id: 'shop-2', status: 'closed_won' })),
        ];
        const stats = await read();
        expect(requireModule).toHaveBeenCalledWith('marketing-roi');
        expect(state.requests).toBe(2);
        expect(stats.totals).toEqual({ total: 1500, won: 180, lost: 30, active: 1290, conversionRate: 12 });
        expect(stats.sources).toEqual([
            { source: 'facebook_ads', total: 900, won: 90, lost: 30, active: 780, conversionRate: 10 },
            { source: 'instagram', total: 450, won: 90, lost: 0, active: 360, conversionRate: 20 },
            { source: 'other', total: 150, won: 0, lost: 0, active: 150, conversionRate: 0 },
        ]);
        expect(stats.bestSource).toBe('instagram');
    });

    it('returns the latest six Ulaanbaatar months even while UTC is still in the previous month', async () => {
        // УБ 2026-10-01 01:00 = UTC 2026-09-30 17:00.
        vi.setSystemTime(new Date('2026-09-30T17:00:00Z'));
        // Хуучин хуудас шиг шинэ → хуучин дараалалтай.
        state.leads = [
            lead({ created_at: '2026-09-30T16:30:00Z' }), // УБ 10-01 00:30 → 10-р сар
            lead({ created_at: '2026-09-30T15:59:59Z' }), // УБ 09-30 23:59 → 9-р сар
            lead({ created_at: '2026-04-30T16:00:00Z' }), // УБ 05-01 00:00 → 5-р сар
            lead({ created_at: '2026-04-30T15:59:59Z' }), // УБ 04-30 → цонхноос гадуур, нийтэд орно
        ];
        const stats = await read();
        expect(stats.monthly).toEqual([
            { month: '2026-05', label: '5-р сар', count: 1 },
            { month: '2026-06', label: '6-р сар', count: 0 },
            { month: '2026-07', label: '7-р сар', count: 0 },
            { month: '2026-08', label: '8-р сар', count: 0 },
            { month: '2026-09', label: '9-р сар', count: 1 },
            { month: '2026-10', label: '10-р сар', count: 1 },
        ]);
        expect(stats.totals.total).toBe(4);
    });

    it('limits a project-scoped manager to their own project leads', async () => {
        state.scope = { projectIds: ['p-1'], managerName: 'Болд' };
        state.leads = [
            lead({ status: 'closed_won' }),
            lead({ sales_manager_name: 'Сараа' }),
            lead({ project_id: 'p-2' }),
        ];
        const stats = await read();
        expect(stats.totals).toEqual({ total: 1, won: 1, lost: 0, active: 0, conversionRate: 100 });
    });

    it('returns empty totals and zero months without leads', async () => {
        state.leads = [];
        const stats = await read();
        expect(stats.totals.total).toBe(0);
        expect(stats.sources).toEqual([]);
        expect(stats.bestSource).toBeNull();
        expect(stats.monthly.map((m: { month: string }) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    });
});
