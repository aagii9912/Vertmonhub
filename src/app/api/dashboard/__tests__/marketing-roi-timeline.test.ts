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
            shops: [{ id: 'shop-1', facebook_ad_account_id: '111' }],
            meta_spend_sync: [{ shop_id: 'shop-1', account_id: 'act_111', currency: 'USD' }],
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
            marketing_campaigns: [{ id: 'm1', shop_id: 'shop-1', start_date: '2026-08-31', created_at: '2026-01-01T00:00:00Z' }],
            // Кампанит ажлын огноогүй 30 хоногийн snapshot нь эхэлсэн сард нь зардал болж орохгүй.
            ad_campaigns: [{ id: 'a1', shop_id: 'shop-1', platform: 'facebook', external_id: '120200', start_date: '2026-06-10', created_at: '2026-06-01T00:00:00Z', spend: 5000 }],
            meta_daily_spend: [
                { id: 's1', shop_id: 'shop-1', account_id: 'act_111', spent_at: '2026-09-05', native_amount: 40.5, currency: 'USD' },
                { id: 's2', shop_id: 'shop-1', account_id: 'act_111', spent_at: '2026-10-01', native_amount: '2.000000', currency: 'USD' },
                // Өмнө сонгосон өөр дансны мөр — валют өөр, нийлбэрт орохгүй.
                { id: 's3', shop_id: 'shop-1', account_id: 'act_999', spent_at: '2026-09-06', native_amount: 900, currency: 'EUR' },
            ],
            meta_spend_coverage: [...spendDays('2026-08-17', '2026-10-01'), ...spendDays('2026-06-01', '2026-06-30', 'act_999')],
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

    it('builds Ulaanbaatar months over every row and spends each Meta day in its own month', async () => {
        const response = await GET();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await response.json();
        expect(body.currency).toBe('USD');
        expect(body.months.map((m: { month: string }) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
        // 1,000 мөрийн хязгаараас цааш хуудаслаж уншина.
        expect(state.pages.filter(p => p.table === 'leads').map(p => p.from)).toEqual([0, 1000]);
        expect(month(body, '2026-09')).toEqual({ month: '2026-09', label: '9-р сар', leads: 1003, meetings: 2, activity: 0, spend: 40.5, spendDays: 30, spendPartial: false });
        expect(month(body, '2026-10')).toMatchObject({ leads: 1, meetings: 0, spend: 2, spendDays: 1, spendPartial: false });
        expect(month(body, '2026-08')).toMatchObject({ meetings: 0, activity: 2, spend: 0, spendDays: 15, spendPartial: true });
        // Snapshot зардал (5000) 6-р сард орохгүй; кампанит ажил идэвхжүүлэлтээр л тоологдоно.
        expect(month(body, '2026-06')).toMatchObject({ activity: 1, spend: null, spendDays: 0 });
        expect(month(body, '2026-05')).toMatchObject({ leads: 0, spend: null });
    });

    it('limits leads and meetings to a sales manager’s own leads in own projects', async () => {
        state.role = 'sales_manager';
        const body = await (await GET()).json();
        expect(month(body, '2026-09')).toMatchObject({ leads: 1, meetings: 1 });
        expect(month(body, '2026-10')).toMatchObject({ leads: 1 });
    });

    it('leaves spend empty without a selected ad account', async () => {
        state.rows.shops = [{ id: 'shop-1', facebook_ad_account_id: null }];
        const body = await (await GET()).json();
        expect(body.currency).toBeNull();
        expect(body.months.every((m: { spend: unknown }) => m.spend === null)).toBe(true);
        expect(state.reads).not.toContain('meta_daily_spend');
    });

    it.each(['leads', 'property_viewings', 'meta_daily_spend', 'meta_spend_coverage', 'meta_spend_sync'])('fails with a generic error instead of a zero series when %s cannot be read', async (table) => {
        state.failing = table;
        const response = await GET();
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).toContain('Цуваа татахад алдаа гарлаа');
        expect(text).not.toContain('db-host-7');
    });
});
