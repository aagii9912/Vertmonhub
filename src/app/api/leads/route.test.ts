// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    userId: null as string | null,
    shopId: '20000000-0000-4000-8000-000000000001',
    role: 'sales_manager',
    denied: false,
    rows: {} as Record<string, Row[]>,
    errors: {} as Record<string, Error>,
    writes: [] as Row[],
    rateChecks: 0,
    capi: [] as Row[],
}));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => state.userId,
    getUserShop: async () => ({ id: state.shopId }),
}));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModuleWrite: async () => state.denied ? NextResponse.json({ error: 'Denied' }, { status: 403 }) : null,
    resolvePermissions: async () => ({ role: state.role, permissions: { modules: ['leads'] } }),
}));
vi.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: class {
    getGenerativeModel() { return { generateContent: async () => ({ response: { text: () => 'Хүсэлт хүлээн авлаа' } }) }; }
} }));
vi.mock('@/lib/email/email', () => ({ sendLeadWelcomeEmail: async () => {} }));
vi.mock('@/lib/marketing/meta-capi', () => ({ sendMetaCapiEvent: async (event: Row) => { state.capi.push(event); }, buildFbc: () => null }));
vi.mock('@/lib/utils/rate-limiter', () => ({
    checkRateLimit: async () => { state.rateChecks++; return { allowed: true }; },
    getClientIdentifier: () => 'fixture-ip',
    createRateLimitResponse: () => NextResponse.json({ error: 'Rate limit' }, { status: 429 }),
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let payload: Row[] | null = null;
    let start = 0;
    let end = Infinity;
    const run = () => {
        if (state.errors[table]) return { data: null, error: state.errors[table] };
        if (payload) {
            state.writes.push(...payload);
            return { data: payload.map(row => ({ id: 'lead-1', internal_notes: 'Private fixture', ...row })), error: null };
        }
        return { data: (state.rows[table] || []).filter(row => filters.every(filter => filter(row))).slice(start, end + 1), error: null };
    };
    const one = () => { const result = run(); return { ...result, data: result.data?.[0] || null }; };
    const query = {
        select: () => query,
        insert: (rows: Row[] | Row) => { payload = Array.isArray(rows) ? rows : [rows]; return query; },
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
        order: () => query,
        range: (from: number, to: number) => { start = from; end = to; return query; },
        maybeSingle: async () => one(),
        single: async () => one(),
        then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return query;
} }) }));

import { POST } from './route';

const shop = '20000000-0000-4000-8000-000000000001';
const otherShop = '20000000-0000-4000-8000-000000000002';
const user = '10000000-0000-4000-8000-000000000001';
const garden = '30000000-0000-4000-8000-000000000001';
const elysium = '30000000-0000-4000-8000-000000000002';
const foreign = '30000000-0000-4000-8000-000000000003';
const request = (body: Row = {}, origin = 'https://garden.example') => new NextRequest('https://app.example/api/leads', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Харилцагч', phone: '99001122', ...body }),
});
beforeEach(() => {
    state.userId = null; state.shopId = shop; state.role = 'sales_manager'; state.denied = false;
    state.writes = []; state.errors = {}; state.rateChecks = 0; state.capi = [];
    state.rows = {
        projects: [{ id: garden, shop_id: shop }, { id: elysium, shop_id: shop }, { id: foreign, shop_id: otherShop }],
        shops: [{ id: shop, name: 'Байгууллага' }, { id: otherShop, name: 'Өөр байгууллага' }],
        user_profiles: [{ id: user, full_name: 'Өөрчлөгдсөн нэр' }],
        sales_managers: [{ shop_id: shop, name: 'Канон Бат', user_id: user, is_active: true }],
        sales_manager_projects: [{ shop_id: shop, manager_name: 'Канон Бат', project_id: garden }],
    };
    vi.stubEnv('LEAD_PROJECT_ID', ''); vi.stubEnv('LEAD_PROJECT_ORIGINS', ''); vi.stubEnv('LEAD_SHOP_ID', '');
    vi.stubEnv('LEAD_ALLOWED_ORIGINS', 'https://garden.example,https://elysium.example,https://app.example');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example'); vi.stubEnv('TURNSTILE_SECRET_KEY', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('project-bound public and staff lead intake', () => {
    it('requires a server project binding and never falls back to the first shop', async () => {
        expect((await POST(request())).status).toBe(503);
        vi.stubEnv('LEAD_PROJECT_ID', 'bad');
        expect((await POST(request())).status).toBe(503);
        expect(state.writes).toEqual([]);
    });
    it('ignores public project spoofing and returns only a public receipt', async () => {
        vi.stubEnv('LEAD_PROJECT_ID', garden);
        const response = await POST(request({ project_id: foreign, sales_manager_name: 'Өөр менежер' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, receipt_id: 'lead-1' });
        expect(state.writes).toMatchObject([{ shop_id: shop, project_id: garden, sales_manager_name: null }]);
        expect(state.rateChecks).toBe(1);
    });
    it('maps exact public origins and rejects unmapped or broken origin configuration', async () => {
        vi.stubEnv('LEAD_PROJECT_ORIGINS', JSON.stringify({ 'https://garden.example': garden, 'https://elysium.example': elysium }));
        expect((await POST(request({}, 'https://elysium.example'))).status).toBe(200);
        expect(state.writes[0]).toMatchObject({ project_id: elysium });
        vi.stubEnv('LEAD_PROJECT_ID', garden);
        expect((await POST(request({}, 'https://app.example'))).status).toBe(503);
        vi.stubEnv('LEAD_PROJECT_ORIGINS', '{invalid');
        expect((await POST(request())).status).toBe(503);
        expect(state.writes).toHaveLength(1);
    });
    it('rejects mismatched tenant configuration and missing project schema before writes', async () => {
        vi.stubEnv('LEAD_PROJECT_ID', garden); vi.stubEnv('LEAD_SHOP_ID', otherShop);
        expect((await POST(request())).status).toBe(503);
        vi.stubEnv('LEAD_SHOP_ID', shop); state.errors.projects = new Error('Project schema unavailable');
        expect((await POST(request())).status).toBe(503);
        expect(state.writes).toEqual([]);
    });
    it('denies logged-in callers without leads write instead of treating them as public users', async () => {
        state.userId = user; state.denied = true; vi.stubEnv('LEAD_PROJECT_ID', garden);
        expect((await POST(request())).status).toBe(403);
        expect(state.writes).toEqual([]); expect(state.rateChecks).toBe(0);
    });
    it('uses actual staff shop and canonical project membership for attribution', async () => {
        state.userId = user;
        expect((await POST(request({ project_id: garden }))).status).toBe(200);
        expect(state.writes).toMatchObject([{ shop_id: shop, project_id: garden, sales_manager_name: 'Канон Бат' }]);
        expect((await POST(request({ project_id: elysium }))).status).toBe(403);
        expect((await POST(request({ project_id: foreign }))).status).toBe(403);
        state.rows.sales_manager_projects = [];
        expect((await POST(request({ project_id: garden }))).status).toBe(403);
        expect(state.writes).toHaveLength(1);
        // Ажилтны таблетын бүртгэл Meta руу харилцагчийн event болж явахгүй.
        expect(state.capi).toEqual([]);
    });
    it('stores sources from the shared vocabulary and reports only visitor submissions to Meta', async () => {
        vi.stubEnv('LEAD_PROJECT_ID', garden);
        expect((await POST(request({ utm_source: 'google' }))).status).toBe(200);
        expect((await POST(request({ utm_source: 'newsletter' }))).status).toBe(200);
        expect((await POST(request({ source: 'board' }))).status).toBe(200);
        expect((await POST(request({ fbclid: 'fbclid-1' }))).status).toBe(200);
        expect(state.writes.map(row => [row.source, row.utm_source ?? null])).toEqual([
            ['google_ads', 'google'], ['website', 'newsletter'], ['board', null], ['facebook_ads', null],
        ]);
        expect(state.capi).toHaveLength(4);
    });
});
