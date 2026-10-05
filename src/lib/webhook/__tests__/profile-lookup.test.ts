// @vitest-environment node
import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ inserts: [] as Row[] }));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock('@/lib/utils/logger', () => ({ logger }));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: (value: string | null) => value }));
// Шинэ харилцагч: хайлт хоосон, insert хийсэн мөрийг буцаана.
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: () => {
    let payload: Row | null = null;
    const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        insert: (row: Row) => { payload = row; state.inserts.push(row); return query; },
        single: async () => ({ data: payload ? { id: 'new-customer', ...payload } : null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
    };
    return query;
} }) }));

import { getOrCreateCustomer, getOrCreateInstagramCustomer } from '../WebhookService';

const TOKEN = 'page-token-secret';
const proof = crypto.createHmac('sha256', 'page-app-secret').update(TOKEN).digest('hex');
const http = vi.fn();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
    vi.clearAllMocks();
    state.inserts = [];
    vi.stubGlobal('fetch', http);
    vi.stubEnv('FACEBOOK_APP_SECRET', 'page-app-secret');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); http.mockReset(); });

function graphCall(index = 0) {
    const [url, init] = http.mock.calls[index] as [URL, RequestInit];
    return { url, init };
}

describe('Meta profile lookups for new DM customers', () => {
    it('reads the Messenger profile on Graph v26 with the token in the header and an appsecret_proof', async () => {
        http.mockResolvedValueOnce(reply({ id: 'psid-1', first_name: 'Бат', last_name: 'Дорж', name: 'Бат Дорж' }));

        const customer = await getOrCreateCustomer('shop-1', 'psid-1', TOKEN);

        expect(customer).toMatchObject({ id: 'new-customer', name: 'Бат Дорж' });
        expect(state.inserts[0]).toMatchObject({ facebook_id: 'psid-1', name: 'Бат Дорж' });
        const { url, init } = graphCall();
        expect(url.origin + url.pathname).toBe('https://graph.facebook.com/v26.0/psid-1');
        expect(url.searchParams.get('fields')).toBe('first_name,last_name,name');
        expect(url.searchParams.get('appsecret_proof')).toBe(proof);
        expect(url.searchParams.has('access_token')).toBe(false);
        expect(url.toString()).not.toContain(TOKEN);
        expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('reads the Instagram profile (name, then username) on Graph v26', async () => {
        http.mockResolvedValueOnce(reply({ id: 'igsid-1', username: 'saraa.mn' }));

        const customer = await getOrCreateInstagramCustomer('shop-1', 'igsid-1', TOKEN);

        expect(customer).toMatchObject({ name: 'saraa.mn', platform: 'instagram' });
        const { url } = graphCall();
        expect(url.origin + url.pathname).toBe('https://graph.facebook.com/v26.0/igsid-1');
        expect(url.searchParams.get('fields')).toBe('username,name');
        expect(url.searchParams.get('appsecret_proof')).toBe(proof);
        expect(url.searchParams.has('access_token')).toBe(false);
    });

    it('fails closed without FACEBOOK_APP_SECRET: no Graph call, customer saved without a name', async () => {
        vi.stubEnv('FACEBOOK_APP_SECRET', '');

        const customer = await getOrCreateCustomer('shop-1', 'psid-2', TOKEN);

        expect(http).not.toHaveBeenCalled();
        expect(customer).toMatchObject({ id: 'new-customer', name: null });
    });

    it('tries once on a Graph error and logs only status/code, never the token or URL', async () => {
        http.mockResolvedValue(reply({ error: { code: 2, message: `temporary ${TOKEN}` } }, 503));

        const customer = await getOrCreateCustomer('shop-1', 'psid-3', TOKEN);

        expect(customer.name).toBeNull();
        expect(http).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith('Could not fetch Meta profile', { userId: 'psid-3', status: 503, code: 2 });
        const logged = JSON.stringify(logger.warn.mock.calls);
        expect(logged).not.toContain(TOKEN);
        expect(logged).not.toContain('graph.facebook.com');
    });
});
