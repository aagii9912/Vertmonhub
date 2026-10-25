// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    modules: ['marketing-roi'] as string[],
    tables: {} as Record<string, unknown>,
    errors: {} as Record<string, { code?: string; message: string }>,
    calls: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
}));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async (module: string) => state.modules.includes(module) ? null : new Response(JSON.stringify({ error: 'denied' }), { status: 403 }),
    requireModuleWrite: async () => null, requireModuleDelete: async () => null, requireAnyModule: async () => null,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1', name: 'Elysium Residence' }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from: (table: string) => {
            const ops: Array<[string, unknown[]]> = [];
            state.calls.push({ table, ops });
            const builder: Record<string, unknown> = new Proxy({}, {
                get(_t, prop: string) {
                    if (prop === 'then') {
                        const platform = ops.find(([op, args]) => op === 'eq' && args[0] === 'platform')?.[1][1];
                        const key = table === 'social_insights_sync' ? `${table}:${platform}` : table;
                        const result = state.errors[key] ? { data: null, error: state.errors[key] } : { data: state.tables[key] ?? null, error: null };
                        return (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
                    }
                    return (...args: unknown[]) => { ops.push([prop, args]); return builder; };
                },
            });
            return builder;
        },
    }),
}));

import { GET } from '../dashboard/marketing/connections/route';

const PAGE_TOKEN = 'EAAG-page-secret-token';
const USER_TOKEN = 'EAAG-user-secret-token';
const sync = (patch: Record<string, unknown> = {}) => ({ last_attempt_at: '2026-10-25T04:30:00Z', last_success_at: '2026-10-25T04:30:00Z', last_from: '2026-09-25', last_to: '2026-10-24', last_error: null, ...patch });
const get = () => GET(new NextRequest('http://test/api/dashboard/marketing/connections'));

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T06:00:00Z'));
    delete process.env.META_ADS_SYSTEM_TOKEN;
    Object.assign(state, {
        modules: ['marketing-roi'], errors: {}, calls: [],
        tables: {
            shops: {
                facebook_page_id: '676357242225387', facebook_page_name: 'Elysium Residence', facebook_page_access_token: PAGE_TOKEN,
                instagram_business_account_id: '17841475771440904', instagram_username: 'elysiumbymoncon',
                facebook_ad_account_id: '1129994262383674', meta_ads_user_access_token: USER_TOKEN, meta_ads_user_token_expires_at: '2026-11-04T10:00:00Z',
            },
            'social_insights_sync:facebook': sync(),
            meta_insights_sync: sync({ last_error: 'Meta-гийн хандах эрх хүрэлцэхгүй (#200).' }),
            meta_spend_sync: { ...sync(), currency: 'USD', mnt_per_unit: null },
        },
    });
});
afterEach(() => { vi.useRealTimers(); delete process.env.META_ADS_SYSTEM_TOKEN; });

describe('GET /api/dashboard/marketing/connections', () => {
    it('requires the marketing-roi module', async () => {
        state.modules = ['reports'];
        expect((await get()).status).toBe(403);
        expect(state.calls).toHaveLength(0);
    });

    it('returns the current project\'s connection status without any token value', async () => {
        const response = await get();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await response.text();
        expect(body).not.toContain(PAGE_TOKEN);
        expect(body).not.toContain(USER_TOKEN);
        const { connections } = JSON.parse(body);
        expect(connections).toEqual({
            page: { connected: true, name: 'Elysium Residence', sync: { lastAttemptAt: '2026-10-25T04:30:00Z', lastSuccessAt: '2026-10-25T04:30:00Z', from: '2026-09-25', to: '2026-10-24', error: null } },
            instagram: { connected: true, username: 'elysiumbymoncon', sync: null },
            ads: {
                accountId: 'act_1129994262383674', tokenSource: 'user', tokenDaysLeft: 10, tokenExpired: false,
                insights: expect.objectContaining({ error: 'Meta-гийн хандах эрх хүрэлцэхгүй (#200).' }), spend: expect.objectContaining({ error: null }),
                currency: 'USD', mntPerUnit: null,
            },
        });
        // Зөвхөн идэвхтэй төсөл.
        for (const call of state.calls) {
            expect(call.ops).toEqual(expect.arrayContaining([['eq', [call.table === 'shops' ? 'id' : 'shop_id', 'shop-1']]]));
        }
        expect(state.calls.find(call => call.table === 'meta_spend_sync')!.ops).toEqual(expect.arrayContaining([['eq', ['account_id', 'act_1129994262383674']]]));
    });

    it('prefers the System User token (no expiry) and reports a saved rate', async () => {
        process.env.META_ADS_SYSTEM_TOKEN = 'system-secret';
        state.tables.meta_spend_sync = { ...sync(), currency: 'USD', mnt_per_unit: '3450.000000' };
        const response = await get();
        const text = await response.text();
        expect(text).not.toContain('system-secret');
        expect(JSON.parse(text).connections.ads).toMatchObject({ tokenSource: 'system', tokenDaysLeft: null, tokenExpired: false, mntPerUnit: 3450 });
    });

    it('marks an expired user token and an unselected account without reading the ad sync tables', async () => {
        state.tables.shops = { ...(state.tables.shops as object), meta_ads_user_token_expires_at: '2026-10-20T00:00:00Z' };
        expect((await (await get()).json()).connections.ads).toMatchObject({ tokenSource: null, tokenDaysLeft: null, tokenExpired: true });

        state.calls = [];
        state.tables.shops = { facebook_page_id: null, facebook_page_name: null, facebook_ad_account_id: null, meta_ads_user_access_token: null };
        const { connections } = await (await get()).json();
        expect(connections).toMatchObject({ page: { connected: false, sync: null }, instagram: { connected: false }, ads: { accountId: null, tokenSource: null, insights: null, spend: null } });
        expect(state.calls.map(call => call.table)).toEqual(['shops']);
    });

    it('treats a missing insights table as «not synced» but surfaces other read errors', async () => {
        state.errors.meta_insights_sync = { code: 'PGRST205', message: "Could not find the table 'public.meta_insights_sync' in the schema cache" };
        expect((await (await get()).json()).connections.ads.insights).toBeNull();
        state.errors.meta_spend_sync = { code: '57014', message: 'canceling statement due to statement timeout' };
        const failed = await get();
        expect(failed.status).toBe(500);
        expect((await failed.json()).error).toBe('Холболтын төлөвийг уншиж чадсангүй');
    });
});
