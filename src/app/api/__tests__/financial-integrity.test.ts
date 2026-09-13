// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    rows: {} as Record<string, Record<string, unknown>[]>,
    errors: {} as Record<string, { message: string; code?: string }>,
    writes: [] as string[],
    denied: null as Response | null,
    attribution: vi.fn(),
}));

vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => state.denied,
    requireModuleWrite: async () => state.denied,
    requireModuleDelete: async () => state.denied,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/services/CustomerScoringService', () => ({ recomputeCustomerScore: vi.fn() }));
vi.mock('@/lib/services/MarketingOps', () => ({ logMarketingSpend: vi.fn() }));
vi.mock('@/lib/marketing/attribution-events', () => ({ logAttributionEvent: state.attribution }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({ from: (table: string) => {
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        let patch: Record<string, unknown> | null = null;
        let range: [number, number] | null = null;
        let single = false;
        const run = () => {
            const error = state.errors[table + (patch ? ':update' : '')];
            if (error) return { data: null, error };
            let rows = (state.rows[table] || []).filter(r => filters.every(f => f(r)));
            if (range) rows = rows.slice(range[0], range[1] + 1);
            if (patch) {
                state.writes.push(table);
                for (const row of rows) Object.assign(row, patch);
            }
            return { data: single ? rows[0] || null : rows, error: null };
        };
        const q = {
            select: () => q,
            eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q; },
            is: (k: string, v: unknown) => { filters.push(r => (r[k] ?? null) === v); return q; },
            in: (k: string, values: unknown[]) => { filters.push(r => values.includes(r[k])); return q; },
            not: (k: string, _op: string, v: unknown) => { filters.push(r => (r[k] ?? null) !== v); return q; },
            gte: (k: string, v: string) => { filters.push(r => String(r[k]) >= v); return q; },
            lte: (k: string, v: string) => { filters.push(r => String(r[k]) <= v); return q; },
            order: () => q,
            range: (a: number, b: number) => { range = [a, b]; return q; },
            update: (v: Record<string, unknown>) => { patch = v; return q; },
            maybeSingle: () => { single = true; return Promise.resolve(run()); },
            then: (resolve: (value: ReturnType<typeof run>) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
        };
        return q;
    } }),
}));

import { POST as convert } from '../dashboard/leads/[id]/convert/route';
import { GET as budget } from '../marketing/budget/route';
import { GET as roi } from '../dashboard/marketing-roi/route';
import { PATCH as patchContract } from '../dashboard/contracts/[id]/route';

const lead = { id: 'lead-1', shop_id: 'shop-1', status: 'contacted', customer_id: null, source: 'facebook', facebook_campaign_id: 'campaign-1' };
const contract = { id: 'contract-1', shop_id: 'shop-1', lead_id: 'lead-1', contract_number: 'C-001', contract_status: 'active', total_price: 200 };
const convertRequest = (body: object = {}) => new NextRequest('http://localhost/api/dashboard/leads/lead-1/convert', { method: 'POST', body: JSON.stringify(body) });
const convertParams = { params: Promise.resolve({ id: 'lead-1' }) };

beforeEach(() => {
    state.rows = { leads: [{ ...lead }], property_contracts: [{ ...contract }], ad_campaigns: [] };
    state.errors = {};
    state.writes = [];
    state.denied = null;
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('conversion integrity', () => {
    it.each([
        [], [{ ...contract, shop_id: 'another-shop' }], [{ ...contract, deleted_at: '2026-01-01' }],
        [{ ...contract, contract_number: ' ' }], [{ ...contract, total_price: 0 }], [{ ...contract, contract_status: 'cancelled' }],
    ])('rejects absent, foreign, deleted, stub or cancelled contracts', async (...rows) => {
        state.rows.property_contracts = rows as Record<string, unknown>[];
        expect((await convert(convertRequest(), convertParams)).status).toBe(400);
        expect(state.writes).toEqual([]);
    });
    it('uses real contract value and retry does not duplicate the won event', async () => {
        const result = await convert(convertRequest(), convertParams);
        expect(result.status).toBe(200);
        expect(state.rows.leads[0]).toMatchObject({ status: 'closed_won', conversion_value: 200 });
        expect((await convert(convertRequest(), convertParams)).status).toBe(200);
        expect(state.writes).toEqual(['leads']);
        expect(state.attribution).toHaveBeenCalledTimes(1);
    });
    it('does not allow arbitrary declared revenue or report update failure as success', async () => {
        expect((await convert(convertRequest({ conversion_value: 1000 }), convertParams)).status).toBe(400);
        state.errors['leads:update'] = { message: 'write failed' };
        expect((await convert(convertRequest(), convertParams)).status).toBe(500);
        expect(state.attribution).not.toHaveBeenCalled();
    });
});

describe('budget aggregation', () => {
    const request = () => new NextRequest('http://localhost/api/marketing/budget?year=2026');
    it('includes all 1105 spend entries and returns only 100 display rows', async () => {
        state.rows.marketing_spend_entries = Array.from({ length: 1105 }, (_, id) => ({ id, shop_id: 'shop-1', spent_at: '2026-01-01', amount: 10, channel: 'other' }));
        state.rows.marketing_spend_entries.push({ id: -1, shop_id: 'other-shop', spent_at: '2026-01-01', amount: 999 });
        const response = await budget(request());
        const json = await response.json();
        expect(response.status).toBe(200);
        expect(json.overview.totals.spend).toBe(11050);
        expect(json.entries).toHaveLength(100);
    });
    it.each(['marketing_budgets', 'marketing_spend_entries', 'manager_monthly_sales', 'ad_campaigns'])('fails instead of showing zeros if %s fails', async table => {
        state.errors[table] = { message: `permission denied for table ${table}`, code: '42501' };
        const response = await budget(request());
        expect(response.status).toBe(500);
        expect(await response.json()).not.toHaveProperty('overview');
    });
    it('keeps missing migration distinguishable from permission failures', async () => {
        state.errors.marketing_spend_entries = { message: "Could not find the table 'public.marketing_spend_entries' in the schema cache", code: 'PGRST205' };
        expect(await (await budget(request())).json()).toMatchObject({ available: false, year: 2026 });
    });
});

describe('marketing attribution', () => {
    it('counts Facebook spend once, uses contracts, excludes deleted data and suppresses mismatched-period ratios', async () => {
        state.rows.leads.push({ ...lead, id: 'lead-2', source: 'facebook_ads' }, { ...lead, id: 'deleted', deleted_at: '2026-01-01' });
        state.rows.property_contracts.push({ ...contract, id: 'c-2', total_price: 999, deleted_at: '2026-01-01' });
        state.rows.ad_campaigns = [{ id: 'ad-1', shop_id: 'shop-1', platform: 'facebook', external_id: 'campaign-1', name: 'Campaign', spend: 50 }];
        const data = (await (await roi()).json()).roi;
        expect(data.sources).toHaveLength(1);
        expect(data.sources[0]).toMatchObject({ source: 'facebook', spend: 50, leads: 2 });
        expect(data.totals).toMatchObject({ spend: 50, leads: 2, won: 1, revenue: 200, cpl: null, cpa: null, roas: null, profit: null });
        expect(data.basis.comparable).toBe(false);
    });
    it('surfaces query errors and denied module access', async () => {
        state.errors.property_contracts = { message: 'database unavailable' };
        expect((await roi()).status).toBe(500);
        state.denied = new Response(null, { status: 403 });
        expect((await roi()).status).toBe(403);
        expect((await budget(new NextRequest('http://localhost/api/marketing/budget'))).status).toBe(403);
        expect((await convert(convertRequest(), convertParams)).status).toBe(403);
    });
});

describe('contract fields cannot bypass receipt accounting', () => {
    const patch = (body: object) => patchContract(new NextRequest('http://localhost/api/dashboard/contracts/contract-1', {
        method: 'PATCH', body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: 'contract-1' }) });
    it.each(['paid_amount', 'paid_percent', 'balance', 'prepayment_paid', 'prepayment_paid_cash', 'prepayment_paid_barter'])('rejects direct %s changes before any write', async field => {
        expect((await patch({ [field]: 100, customer_phone: '99999999' })).status).toBe(400);
        expect(state.writes).toHaveLength(0);
    });
    it('allows validated contract terms without altering imported paid snapshots', async () => {
        Object.assign(state.rows.property_contracts[0], { paid_amount: 50, prepayment_paid: 20, balance: 150 });
        expect((await patch({ customer_phone: '99999999', remaining_payment_condition: 'Банкны шилжүүлэг' })).status).toBe(200);
        expect(state.rows.property_contracts[0]).toMatchObject({ paid_amount: 50, prepayment_paid: 20, balance: 150, customer_phone: '99999999' });
        expect((await patch({ contract_status: 'invented-status' })).status).toBe(400);
    });
});
