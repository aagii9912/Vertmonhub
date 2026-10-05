// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { DEFAULT_PAGE_SUBSCRIBE_FIELDS, subscribePageToApp } from '../marketing-api';
import { PAGE_OAUTH_SCOPES } from '../page-connect';

const calls: string[][] = [];
let replies: Array<{ status: number; body: Record<string, unknown> }> = [];

beforeEach(() => {
    calls.length = 0;
    replies = [];
    vi.stubEnv('FACEBOOK_APP_SECRET', 'app-secret');
    vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit) => {
        expect(new URL(input).pathname).toBe('/v26.0/1111/subscribed_apps');
        expect(new Headers(init.headers).get('authorization')).toBe('Bearer page-token');
        const body = new URLSearchParams(String(init.body));
        calls.push(body.get('subscribed_fields')!.split(','));
        expect(body.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/);
        const reply = replies.shift() ?? { status: 200, body: { success: true } };
        return new Response(JSON.stringify(reply.body), { status: reply.status });
    }));
});

const permissionError = { status: 403, body: { error: { code: 200, message: '(#200) To subscribe to the leadgen field, one of these permissions is needed: leads_retrieval' } } };

describe('subscribePageToApp', () => {
    it('subscribes DM fields and leadgen together', async () => {
        expect(DEFAULT_PAGE_SUBSCRIBE_FIELDS).toEqual(expect.arrayContaining(['messages', 'leadgen']));
        expect(await subscribePageToApp('1111', 'page-token')).toEqual({ success: true, leadgen: true });
        expect(calls).toEqual([DEFAULT_PAGE_SUBSCRIBE_FIELDS]);
    });

    it('keeps DM fields subscribed when the token lacks leads_retrieval', async () => {
        replies = [permissionError];
        const result = await subscribePageToApp('1111', 'page-token');
        expect(result).toEqual({ success: true, leadgen: false, leadgenError: expect.stringContaining('leads_retrieval') });
        expect(calls[1]).not.toContain('leadgen');
        expect(calls[1]).toContain('messages');
    });

    it('reports a failure when even the DM fields cannot be subscribed', async () => {
        replies = [permissionError, { status: 403, body: { error: { code: 200, message: 'pages_manage_metadata missing' } } }];
        expect(await subscribePageToApp('1111', 'page-token')).toEqual({
            success: false, error: expect.any(String), leadgen: false, leadgenError: expect.stringContaining('leads_retrieval'),
        });
        expect(await subscribePageToApp('1111', 'page-token', ['messages'])).toEqual({ success: true, leadgen: false });
    });
});

it('asks for the Lead Ads permissions in the Page OAuth dialog', () => {
    expect(PAGE_OAUTH_SCOPES).toEqual(expect.arrayContaining(['pages_manage_metadata', 'pages_messaging', 'leads_retrieval', 'pages_manage_ads']));
    expect(PAGE_OAUTH_SCOPES).not.toContain('email');
});
