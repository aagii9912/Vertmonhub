// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
    role: 'admin',
    modules: ['marketing-roi'] as string[],
    gates: [] as string[],
    reads: [] as string[],
    pages: [] as Array<{ table: string; from: number }>,
    failing: null as string | null,
    rows: {} as Record<string, Row[]>,
}));
vi.mock('@/lib/auth/require-permission', () => {
    const gate = async (module: string) => {
        state.gates.push(module);
        return state.modules.includes(module) ? null : NextResponse.json({ error: 'Эрх хүрэлцэхгүй' }, { status: 403 });
    };
    return {
        requireModule: gate, requireModuleWrite: gate, requireModuleDelete: gate, requireAnyModule: gate,
        resolvePermissions: async () => ({ role: state.role, permissions: { modules: state.modules } }),
    };
});
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1', name: 'Mandala Garden' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    state.reads.push(table);
    const get = (row: Row, key: string) => key.split('.').reduce<any>((value, part) => value?.[part], row);
    // DATE багана (YYYY-MM-DD) мөрөөр, timestamp цагаар харьцуулна.
    const cmp = (a: string, b: string) => (/^\d{4}-\d{2}-\d{2}$/.test(b) ? a.localeCompare(b) : Date.parse(a) - Date.parse(b));
    const filters: Array<(row: Row) => boolean> = [];
    let first = 0;
    let last = Infinity;
    const rows = () => (state.rows[table] ?? []).filter(row => filters.every(filter => filter(row))).slice(first, last + 1).slice(0, 1000);
    const result = () => (table === state.failing ? { data: null, error: { message: 'connection reset by db-host-7' } } : { data: rows(), error: null });
    const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => get(row, key) === value); return query; },
        is: (key: string, value: unknown) => { filters.push(row => (get(row, key) ?? null) === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(get(row, key))); return query; },
        gte: (key: string, value: string) => { filters.push(row => get(row, key) != null && cmp(get(row, key), value) >= 0); return query; },
        lte: (key: string, value: string) => { filters.push(row => get(row, key) != null && cmp(get(row, key), value) <= 0); return query; },
        lt: (key: string, value: string) => { filters.push(row => get(row, key) != null && cmp(get(row, key), value) < 0); return query; },
        order: () => query,
        range: (from: number, to: number) => { first = from; last = to; state.pages.push({ table, from }); return query; },
        maybeSingle: async () => { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
} }) }));

import { GET } from '../marketing-roi/timeline/route';

const mandala = '00000000-0000-4000-8000-000000000001';
const elysium = '00000000-0000-4000-8000-000000000002';
const lead = (id: string, created_at: string, extra: Row = {}): Row => ({
    id, shop_id: 'shop-1', deleted_at: null, created_at, project_id: mandala, sales_manager_name: 'Манда', ...extra,
});
const spendDays = (from: string, to: string, account = 'act_111') => {
    const out: Row[] = [];
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
        out.push({ shop_id: 'shop-1', account_id: account, spent_at: new Date(t).toISOString().slice(0, 10) });
    }
    return out;
};
const spendRow = (id: string, campaign: string, spent_at: string, native_amount: number | string, amount_mnt: number | string | null): Row => ({
    id, shop_id: 'shop-1', account_id: 'act_111', campaign_id: campaign, campaign_name: `Кампанит ажил ${campaign}`, spent_at,
    native_amount, currency: 'USD', timezone: 'Asia/Ulaanbaatar', amount_mnt, mnt_per_unit: amount_mnt === null ? null : 3500,
});
const month = (body: { months: Array<Record<string, unknown>> }, key: string) => body.months.find(m => m.month === key);

describe('GET /api/dashboard/marketing-roi/timeline', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => {
        // Vercel шиг UTC сервер; УБ-ийн 10-01 04:00 (UTC-ээр 09-30 хэвээр).
        process.env.TZ = 'UTC';
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-30T20:00:00Z'));
        Object.assign(state, { role: 'admin', modules: ['marketing-roi'], gates: [], reads: [], pages: [], failing: null });
        state.rows = {
            user_profiles: [{ id: 'user-1', full_name: 'Манда' }],
            sales_managers: [{ shop_id: 'shop-1', name: 'Манда', user_id: 'user-1', is_active: true }],
            sales_manager_projects: [{ shop_id: 'shop-1', manager_name: 'Манда', project_id: mandala }],
            leads: [
                ...Array.from({ length: 1001 }, (_, i) => lead(`bulk-${i}`, '2026-09-15T04:00:00Z', { sales_manager_name: 'Хамтрагч' })),
                lead('sep-last', '2026-09-30T15:59:59Z'), // УБ 09-30 23:59
                lead('oct-first', '2026-09-30T16:00:00Z'), // УБ 10-01 00:00
                lead('before-window', '2026-04-30T15:59:59Z'),
                lead('deleted', '2026-09-20T00:00:00Z', { deleted_at: '2026-09-21T00:00:00Z' }),
                lead('other-shop', '2026-09-20T00:00:00Z', { shop_id: 'shop-2' }),
                lead('elysium', '2026-09-20T00:00:00Z', { project_id: elysium }),
            ],
            property_viewings: [
                { id: 'v1', shop_id: 'shop-1', deleted_at: null, scheduled_at: '2026-08-31T16:30:00Z', leads: { project_id: mandala, sales_manager_name: 'Манда' } },
                { id: 'v2', shop_id: 'shop-1', deleted_at: '2026-09-02T00:00:00Z', scheduled_at: '2026-09-01T04:00:00Z', leads: { project_id: mandala, sales_manager_name: 'Манда' } },
                { id: 'v3', shop_id: 'shop-1', deleted_at: null, scheduled_at: '2026-09-10T04:00:00Z', leads: { project_id: elysium, sales_manager_name: 'Бусад' } },
            ],
            social_posts: [
                { id: 'p1', shop_id: 'shop-1', status: 'published', published_at: '2026-07-31T16:00:00Z' }, // УБ 08-01
                { id: 'p2', shop_id: 'shop-1', status: 'draft', published_at: '2026-08-05T00:00:00Z' },
            ],
            // Акц нь Meta campaign ID-аар зардлыг төсөлд холбоно; цуцалсан акц идэвхжүүлэлтэд орохгүй.
            marketing_campaigns: [
                { id: 'm1', shop_id: 'shop-1', name: 'Mandala', project_id: mandala, external_campaign_id: '120200', status: 'active', start_date: '2026-08-31', created_at: '2026-01-01T00:00:00Z' },
                { id: 'm2', shop_id: 'shop-1', name: 'Elysium', project_id: elysium, external_campaign_id: '120300', status: 'active', start_date: '2026-09-02', created_at: '2026-01-01T00:00:00Z' },
                { id: 'm3', shop_id: 'shop-1', name: 'Цуцалсан', project_id: mandala, external_campaign_id: null, status: 'cancelled', start_date: '2026-08-10', created_at: '2026-01-01T00:00:00Z' },
            ],
            // Retired 30-day snapshot: never read.
            ad_campaigns: [{ id: 'a1', shop_id: 'shop-1', platform: 'facebook', external_id: '120200', start_date: '2026-06-10', created_at: '2026-06-01T00:00:00Z', spend: 5000 }],
            meta_daily_spend: [
                spendRow('s1', '120200', '2026-09-05', 40.5, 141750),
                spendRow('s2', '120200', '2026-10-01', '2.000000', '7000'),
                // Ханшгүй мөр төгрөгт нэмэгдэхгүй — эх валютаар тусдаа.
                spendRow('s3', '120300', '2026-09-06', 12, null),
                // Өмнөх дансны EUR мөр: ханшгүй, өөрийн валютаар.
                { ...spendRow('s4', '120900', '2026-09-07', 900, null), account_id: 'act_999', currency: 'EUR' },
            ],
            meta_spend_coverage: spendDays('2026-08-17', '2026-10-01'),
        };
    });
    afterEach(() => {
        vi.useRealTimers();
        process.env.TZ = originalTz;
    });

    it('requires the marketing-roi module before reading data', async () => {
        state.modules = ['leads'];
        expect((await GET()).status).toBe(403);
        expect(state.gates).toEqual(['marketing-roi']);
        expect(state.reads).toEqual([]);
    });

    it('builds Ulaanbaatar months over every row and spends each Meta day in its own month, ₮ only from stored rates', async () => {
        const response = await GET();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await response.json();
        expect(body.months.map((m: { month: string }) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
        // 1,000 мөрийн хязгаараас цааш хуудаслаж уншина.
        expect(state.pages.filter(p => p.table === 'leads').map(p => p.from)).toEqual([0, 1000]);
        expect(month(body, '2026-09')).toEqual({
            month: '2026-09', label: '9-р сар', leads: 1003, meetings: 2, activity: 1,
            spend: 141750, pending: { USD: 12, EUR: 900 }, spendDays: 30, spendPartial: false,
        });
        expect(month(body, '2026-10')).toMatchObject({ leads: 1, meetings: 0, spend: 7000, pending: {}, spendDays: 1, spendPartial: false });
        expect(month(body, '2026-08')).toMatchObject({ meetings: 0, activity: 2, spend: 0, spendDays: 15, spendPartial: true });
        // Snapshot зардал (5000) 6-р сард орохгүй; ad_campaigns огт уншихгүй.
        expect(month(body, '2026-06')).toMatchObject({ activity: 0, spend: null, spendDays: 0 });
        expect(month(body, '2026-05')).toMatchObject({ leads: 0, spend: null });
        expect(state.reads).not.toContain('ad_campaigns');
    });

    it('limits leads, meetings, activity and Meta spend to a sales manager’s own projects', async () => {
        state.role = 'sales_manager';
        const body = await (await GET()).json();
        expect(month(body, '2026-09')).toMatchObject({ leads: 1, meetings: 1, activity: 0, spend: 141750, pending: {} });
        expect(month(body, '2026-10')).toMatchObject({ leads: 1, spend: 7000 });
        expect(month(body, '2026-08')).toMatchObject({ activity: 2 });
    });

    it('leaves spend empty, not zero, when no Meta day was synced', async () => {
        state.rows.meta_daily_spend = [];
        state.rows.meta_spend_coverage = [];
        const body = await (await GET()).json();
        expect(body.months.every((m: { spend: unknown; spendDays: number }) => m.spend === null && m.spendDays === 0)).toBe(true);
    });

    it.each(['leads', 'property_viewings', 'social_posts', 'marketing_campaigns', 'meta_daily_spend', 'meta_spend_coverage'])('fails with a generic error instead of a zero series when %s cannot be read', async (table) => {
        state.failing = table;
        const response = await GET();
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain('Цуваа татахад алдаа гарлаа');
        expect(text).not.toContain('db-host-7');
    });
});
