// @vitest-environment node
// Real route + permission helpers; database/storage/network I/O is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const snapshot = { roles: [
    { name: 'viewer', modules: ['dashboard', 'reports'], can_write: false, can_delete: false },
    { name: 'sales_manager', modules: ['dashboard', 'leads', 'properties'], can_write: true, can_delete: false },
    { name: 'marketing', modules: ['dashboard', 'marketing-roi', 'ai-settings', 'customers'], can_write: true, can_delete: false },
] };

const state = vi.hoisted(() => ({
    role: 'viewer', signedIn: true,
    definition: {} as Record<string, unknown>,
    mutations: [] as string[],
    writes: [] as { table: string; data: unknown }[],
    filters: [] as { table: string; column: string; value: unknown }[],
    rows: {} as Record<string, Record<string, unknown> | null>,
    shopAccess: true,
}));

function query(table: string) {
    const q: Record<string, any> = {};
    const filters: { column: string; value: unknown }[] = [];
    for (const method of ['select', 'is', 'order', 'range', 'limit', 'or', 'gte', 'lte']) q[method] = () => q;
    for (const method of ['eq', 'in']) q[method] = (column: string, value: unknown) => {
        filters.push({ column, value });
        state.filters.push({ table, column, value });
        return q;
    };
    for (const method of ['insert', 'update', 'delete']) q[method] = (data: unknown) => {
        state.mutations.push(`${table}.${method}`);
        state.writes.push({ table, data });
        return q;
    };
    const row = () => {
        if (table === 'user_roles') return { role: state.role };
        if (table === 'roles') return state.definition;
        const data = Object.hasOwn(state.rows, table) ? state.rows[table] : { id: 'fixture-id', shop_id: 'fixture-shop' };
        return data && filters.every(f => !(f.column in data) || (Array.isArray(f.value) ? f.value.includes(data[f.column]) : data[f.column] === f.value)) ? data : null;
    };
    q.maybeSingle = async () => ({ data: row(), error: null });
    q.single = async () => ({ data: row(), error: null });
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
    return q;
}

vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => state.signedIn ? 'fixture-user' : null,
    getUserShop: async () => state.signedIn && state.shopAccess ? { id: 'fixture-shop' } : null,
    assertShopAccess: async (id?: string) => state.shopAccess && (!id || id === 'fixture-shop') ? 'fixture-shop' : null,
    getAccessibleShopIds: async () => new Set(state.shopAccess ? ['fixture-shop'] : []),
    supabaseAdmin: () => ({ from: query }),
}));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from: query,
        storage: { from: () => ({
            upload: async () => { state.mutations.push('storage.upload'); return { error: null }; },
            getPublicUrl: () => ({ data: { publicUrl: 'https://example.invalid/fixture.png' } }),
        }) },
    }),
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/CustomerScoringService', () => ({ recomputeCustomerScore: vi.fn() }));
vi.mock('@/lib/services/AuditService', () => ({ recordAudit: vi.fn() }));
vi.mock('@/lib/auth/resolve-user', () => ({ resolveApiUser: async () => state.signedIn ? { id: 'fixture-user' } : null }));
vi.mock('@/lib/crypto/tokens', () => ({ encryptToken: (value: string) => `encrypted:${value}`, decryptToken: (value: string) => value }));
vi.mock('@/lib/facebook/marketing-api', () => ({ subscribePageToApp: vi.fn(async () => ({ success: true })) }));

import * as aiSettings from '@/app/api/ai-settings/route';
import * as properties from '@/app/api/properties/route';
import * as customers from '@/app/api/dashboard/customers/route';
import * as indicators from '@/app/api/marketing/indicators/route';
import * as competitors from '@/app/api/dashboard/competitors/route';
import * as upload from '@/app/api/properties/upload/route';
import * as propertyDetail from '@/app/api/properties/[id]/route';
import * as shop from '@/app/api/shop/route';
import * as userShops from '@/app/api/user/shops/route';
import * as disconnect from '@/app/api/shop/disconnect/route';
import * as attachments from '@/app/api/dashboard/ai-attachments/route';
import * as surveys from '@/app/api/surveys/route';
import * as surveyDetail from '@/app/api/surveys/[id]/route';
import * as channelContracts from '@/app/api/marketing/contracts/route';
import * as conversations from '@/app/api/ai-assistant/conversations/route';
import * as conversationDetail from '@/app/api/ai-assistant/conversations/[id]/route';
import * as facebook from '@/app/api/auth/facebook/route';
import * as facebookCallback from '@/app/api/auth/facebook/callback/route';
import * as facebookPages from '@/app/api/auth/facebook/pages/route';
import * as instagram from '@/app/api/auth/instagram/route';
import * as instagramCallback from '@/app/api/auth/instagram/callback/route';
import * as navCounts from '@/app/api/dashboard/nav-counts/route';
import * as director from '@/app/api/dashboard/director/route';
import * as adCampaigns from '@/app/api/marketing/facebook/ads/campaigns/route';
import * as adInsights from '@/app/api/marketing/facebook/ads/insights/route';
import { requireModule, requireModuleWrite, requireModuleDelete } from '@/lib/auth/require-permission';

function asRole(role: string) {
    state.role = role;
    const row = snapshot.roles.find(r => r.name === role)!;
    state.definition = { ...row, role_permissions: row.modules.map(module => ({ module })) };
}
function request(path: string, method = 'GET', body?: unknown) {
    return new NextRequest(`http://localhost${path}`, {
        method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
}

beforeEach(() => {
    state.signedIn = true;
    state.mutations = [];
    state.writes = [];
    state.filters = [];
    state.rows = {};
    state.shopAccess = true;
    asRole('viewer');
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Audit probes prohibit network calls'); }));
});
afterEach(() => vi.unstubAllGlobals());

describe('control cases: real shared permission helper with representative role definitions', () => {
    it('rejects an unauthenticated user', async () => {
        state.signedIn = false;
        expect((await requireModule('leads'))?.status).toBe(401);
    });
    it('allows sales leads writes and rejects deletes', async () => {
        asRole('sales_manager');
        expect(await requireModuleWrite('leads')).toBeNull();
        expect((await requireModuleDelete('leads'))?.status).toBe(403);
    });
    it('rejects marketing property writes when the module guard is used', async () => {
        asRole('marketing');
        expect((await requireModuleWrite('properties'))?.status).toBe(403);
    });
    it('rejects viewer property creation', async () => {
        expect((await properties.POST(request('/api/properties', 'POST', { name: 'Fixture', type: 'apartment', price: 1 }))).status).toBe(403);
        expect(state.mutations).toEqual([]);
    });
});

describe('security expectations: current routes must reject these calls', () => {
    it('viewer cannot create AI settings', async () => {
        const res = await aiSettings.POST(request('/api/ai-settings', 'POST', { type: 'faqs', question: 'Fixture', answer: 'Fixture' }));
        expect({ status: res.status, mutations: state.mutations }).toEqual({ status: 403, mutations: [] });
    });
    it('viewer cannot delete AI settings', async () => {
        const res = await aiSettings.DELETE(request('/api/ai-settings?type=faqs&id=fixture-id', 'DELETE'));
        expect({ status: res.status, mutations: state.mutations }).toEqual({ status: 403, mutations: [] });
    });
    it('viewer cannot read customer data', async () => {
        expect((await customers.GET(request('/api/dashboard/customers'))).status).toBe(403);
    });
    it('marketing cannot create properties without the properties module', async () => {
        asRole('marketing');
        const res = await properties.POST(request('/api/properties', 'POST', { name: 'Fixture', type: 'apartment', price: 1 }));
        expect({ status: res.status, mutations: state.mutations }).toEqual({ status: 403, mutations: [] });
    });
    it('marketing cannot delete market indicators without canDelete', async () => {
        asRole('marketing');
        const res = await indicators.DELETE(request('/api/marketing/indicators?id=fixture-id', 'DELETE'));
        expect({ status: res.status, mutations: state.mutations }).toEqual({ status: 403, mutations: [] });
    });
    it('marketing cannot delete competitors without canDelete', async () => {
        asRole('marketing');
        const res = await competitors.DELETE(request('/api/dashboard/competitors?id=fixture-id', 'DELETE'));
        expect({ status: res.status, mutations: state.mutations }).toEqual({ status: 403, mutations: [] });
    });
    it('viewer cannot upload property images', async () => {
        const form = new FormData();
        form.append('file', new File(['fixture'], 'fixture.png', { type: 'image/png' }));
        const res = await upload.POST(new NextRequest('http://localhost/api/properties/upload', { method: 'POST', body: form }));
        expect({ status: res.status, mutations: state.mutations }).toEqual({ status: 403, mutations: [] });
    });
});

const params = { params: Promise.resolve({ id: 'fixture-id' }) };
const moduleCases: [string, () => Promise<Response>][] = [
    ['AI settings read', () => aiSettings.GET()],
    ['AI settings update', () => aiSettings.PATCH(request('/api/ai-settings', 'PATCH', {}))],
    ['property read', () => propertyDetail.GET(request('/api/properties/fixture-id'), params)],
    ['property update', () => propertyDetail.PATCH(request('/api/properties/fixture-id', 'PATCH', {}), params)],
    ['property delete', () => propertyDetail.DELETE(request('/api/properties/fixture-id', 'DELETE'), params)],
    ['shop read', () => shop.GET()],
    ['shop creation', () => shop.POST(request('/api/shop', 'POST', {}))],
    ['shop AI edit', () => shop.PATCH(request('/api/shop', 'PATCH', { custom_knowledge: { fixture: 'text' } }))],
    ['shop creation alternative', () => userShops.POST(request('/api/user/shops', 'POST', {}))],
    ['social disconnect', () => disconnect.POST(request('/api/shop/disconnect', 'POST', { platform: 'facebook' }))],
    ['property attachments', () => attachments.GET(request('/api/dashboard/ai-attachments?entity_type=property&entity_id=fixture-id'))],
    ['survey read', () => surveys.GET(request('/api/surveys'))],
    ['survey create', () => surveys.POST(request('/api/surveys', 'POST', {}))],
    ['survey summary', () => surveyDetail.GET(request('/api/surveys/fixture-id'), params)],
    ['offline response', () => surveyDetail.POST(request('/api/surveys/fixture-id', 'POST', { answers: {}, source: 'offline' }), params)],
    ['marketing contract', () => channelContracts.POST(request('/api/marketing/contracts', 'POST', {}))],
    ['conversation list', () => conversations.GET(request('/api/ai-assistant/conversations?shopId=fixture-shop'))],
    ['conversation create', () => conversations.POST(request('/api/ai-assistant/conversations', 'POST', {}))],
    ['conversation read', () => conversationDetail.GET(request('/api/ai-assistant/conversations/fixture-id'), params)],
    ['conversation rename', () => conversationDetail.PATCH(request('/api/ai-assistant/conversations/fixture-id', 'PATCH', { title: 'Fixture' }), params)],
    ['conversation delete', () => conversationDetail.DELETE(request('/api/ai-assistant/conversations/fixture-id', 'DELETE'), params)],
    ['Facebook OAuth start', () => facebook.GET(request('/api/auth/facebook'))],
    ['Facebook OAuth callback', () => facebookCallback.GET(request('/api/auth/facebook/callback?code=fixture'))],
    ['Facebook pages', () => facebookPages.GET()],
    ['Facebook page token', () => facebookPages.POST(request('/api/auth/facebook/pages', 'POST', { pageId: 'fixture' }))],
    ['Instagram OAuth start', () => instagram.GET(request('/api/auth/instagram'))],
    ['Instagram OAuth callback', () => instagramCallback.GET(request('/api/auth/instagram/callback?code=fixture'))],
];

describe.each([false, true])('module boundaries (signed in: %s)', signedIn => {
    it.each(moduleCases)('%s denies access before writes or external calls', async (_name, invoke) => {
        state.signedIn = signedIn;
        const response = await invoke();
        expect(response.status).toBe(signedIn ? 403 : 401);
        expect(state.mutations).toEqual([]);
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('allowed operations, field permissions and tenant boundaries', () => {
    it('sidebar counts do not expose modules hidden from the viewer', async () => {
        const response = await navCounts.GET();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({});
        expect(state.filters.some(filter => ['leads', 'property_viewings', 'customers'].includes(filter.table))).toBe(false);
    });
    it('removing reports permission from admin also denies the director report', async () => {
        asRole('marketing');
        state.role = 'admin';
        expect((await director.GET(request('/api/dashboard/director'))).status).toBe(403);
        expect(state.mutations).toEqual([]);
    });
    it('allows an authorized AI settings write scoped to the active member shop', async () => {
        asRole('marketing');
        const response = await aiSettings.POST(request('/api/ai-settings', 'POST', { type: 'faqs', question: 'Fixture', answer: 'Answer' }));
        expect(response.status).toBe(200);
        expect(state.writes).toContainEqual({ table: 'shop_faqs', data: expect.objectContaining({ shop_id: 'fixture-shop' }) });
    });
    it('module access alone cannot grant writes or deletes', async () => {
        asRole('marketing');
        state.definition.can_write = false;
        expect((await aiSettings.POST(request('/api/ai-settings', 'POST', { type: 'faqs' }))).status).toBe(403);
        expect((await shop.PATCH(request('/api/shop', 'PATCH', { custom_knowledge: { fixture: 'text' } }))).status).toBe(403);
        expect((await facebook.GET(request('/api/auth/facebook'))).status).toBe(403);
        expect((await adCampaigns.GET(request('/api/marketing/facebook/ads/campaigns'))).status).toBe(403);
        expect((await adInsights.GET(request('/api/marketing/facebook/ads/insights'))).status).toBe(403);
        expect((await aiSettings.DELETE(request('/api/ai-settings?type=faqs&id=fixture-id', 'DELETE'))).status).toBe(403);
        expect(state.mutations).toEqual([]);
        expect(fetch).not.toHaveBeenCalled();
    });
    it('AI settings updates cannot reassign records to another shop', async () => {
        asRole('marketing');
        const response = await aiSettings.PATCH(request('/api/ai-settings', 'PATCH', { type: 'faqs', id: 'fixture-id', question: 'Fixture', shop_id: 'other-shop' }));
        expect(response.status).toBe(400);
        expect(state.mutations).toEqual([]);
    });
    it('mixed shop edits require permission for every touched module', async () => {
        asRole('marketing');
        const response = await shop.PATCH(request('/api/shop', 'PATCH', { custom_knowledge: { fixture: 'Text' }, bank_name: 'Unauthorized bank change' }));
        expect(response.status).toBe(403);
        expect(state.mutations).toEqual([]);
    });
    it('shop reads exclude settings from modules the caller cannot access', async () => {
        asRole('marketing');
        state.definition.role_permissions = [{ module: 'marketing-roi' }];
        state.rows.shops = { id: 'fixture-shop', name: 'Fixture', custom_knowledge: { private: 'Text' }, bank_name: 'Private bank', facebook_page_id: 'fixture-page', facebook_page_access_token: 'secret' };
        expect((await (await shop.GET()).json()).shop).toEqual({ id: 'fixture-shop', name: 'Fixture', facebook_page_id: 'fixture-page' });
    });
    it('authorized AI shop edits preserve member scope and hide stored tokens', async () => {
        asRole('marketing');
        state.rows.shops = { id: 'fixture-shop', facebook_page_access_token: 'secret', instagram_access_token: 'secret', facebook_user_access_token: 'secret', meta_ads_user_access_token: 'secret', name: 'Fixture' };
        const response = await shop.PATCH(request('/api/shop', 'PATCH', { custom_knowledge: { fixture: 'Text' } }));
        expect(response.status).toBe(200);
        expect((await response.json()).shop).toEqual({ id: 'fixture-shop', name: 'Fixture' });
        expect(state.filters).toContainEqual({ table: 'shops', column: 'id', value: 'fixture-shop' });
        expect(state.writes).toContainEqual({ table: 'shops', data: { custom_knowledge: { fixture: 'Text' } } });
        expect((await (await shop.GET()).json()).shop).not.toHaveProperty('facebook_page_access_token');
    });
    it('shop update rejects ownership fields and revoked membership', async () => {
        asRole('marketing');
        expect((await shop.PATCH(request('/api/shop', 'PATCH', { user_id: 'other-user' }))).status).toBe(400);
        state.shopAccess = false;
        expect((await shop.PATCH(request('/api/shop', 'PATCH', { custom_knowledge: { fixture: 'Text' } }))).status).toBe(404);
        expect(state.mutations).toEqual([]);
    });
    it('marketing contract rejects a channel from another tenant', async () => {
        asRole('marketing');
        const channelId = '00000000-0000-4000-8000-000000000001';
        state.rows.marketing_channels = { id: channelId, shop_id: 'other-shop' };
        expect((await channelContracts.POST(request('/api/marketing/contracts', 'POST', { channel_id: channelId, start_date: '2026-09-28', budget: 100 }))).status).toBe(404);
        expect(state.mutations).toEqual([]);
    });
    it('personal AI conversation creation allows read-only AI access, but never foreign shop IDs', async () => {
        state.definition.role_permissions = [{ module: 'ai-assistant' }];
        expect((await conversations.POST(request('/api/ai-assistant/conversations', 'POST', { shopId: 'other-shop' }))).status).toBe(403);
        expect(state.mutations).toEqual([]);
        expect((await conversations.POST(request('/api/ai-assistant/conversations', 'POST', { shopId: 'fixture-shop' }))).status).toBe(200);
        expect(state.writes).toContainEqual({ table: 'ai_conversations', data: expect.objectContaining({ user_id: 'fixture-user', shop_id: 'fixture-shop' }) });
    });
    it('membership revocation blocks old AI history and mutations', async () => {
        state.definition.role_permissions = [{ module: 'ai-assistant' }];
        state.rows.ai_conversations = { id: 'fixture-id', user_id: 'fixture-user', shop_id: 'fixture-shop' };
        state.shopAccess = false;
        expect((await conversationDetail.GET(request('/fixture'), params)).status).toBe(404);
        expect((await conversationDetail.PATCH(request('/fixture', 'PATCH', { title: 'Fixture' }), params)).status).toBe(404);
        expect((await conversationDetail.DELETE(request('/fixture', 'DELETE'), params)).status).toBe(404);
        expect(state.mutations).toEqual([]);
    });
    it('public survey responses remain possible, but inactive surveys and foreign customer links are rejected', async () => {
        state.signedIn = false;
        state.rows.surveys = { is_active: true, shop_id: 'fixture-shop' };
        const submit = (extra = {}) => surveyDetail.POST(request('/api/surveys/fixture-id', 'POST', { answers: { answer: 'Fixture' }, ...extra }), params);
        expect((await submit()).status).toBe(201);
        expect(state.writes).toContainEqual({ table: 'survey_responses', data: [expect.objectContaining({ shop_id: 'fixture-shop', source: 'online' })] });
        state.mutations = [];
        state.rows.customers = null;
        expect((await submit({ customer_id: '00000000-0000-4000-8000-000000000002' })).status).toBe(401);
        state.rows.surveys.is_active = false;
        expect((await submit()).status).toBe(400);
        expect(state.mutations).toEqual([]);
    });
    it('authorized staff survey responses still enforce survey and customer tenant scope', async () => {
        asRole('marketing');
        state.definition.role_permissions = [{ module: 'surveys' }];
        state.rows.surveys = { is_active: true, shop_id: 'other-shop' };
        const submit = (extra = {}) => surveyDetail.POST(request('/api/surveys/fixture-id', 'POST', { answers: {}, source: 'offline', ...extra }), params);
        expect((await submit()).status).toBe(403);
        state.rows.surveys.shop_id = 'fixture-shop';
        state.rows.customers = null;
        expect((await submit({ customer_id: '00000000-0000-4000-8000-000000000002' })).status).toBe(404);
        expect(state.mutations).toEqual([]);
        expect((await submit()).status).toBe(201);
    });
});
