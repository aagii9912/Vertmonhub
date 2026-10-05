// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { DEFAULT_PAGE_SUBSCRIBE_FIELDS, subscribePageToApp } from '../marketing-api';

const calls: string[][] = [];
let replies: Array<Record<string, unknown>> = [];

beforeEach(() => {
    calls.length = 0;
    replies = [];
    vi.stubEnv('FACEBOOK_APP_SECRET', 'app-secret');
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
        const url = new URL(input);
        calls.push(url.searchParams.get('subscribed_fields')!.split(','));
        expect(url.searchParams.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/);
        return new Response(JSON.stringify(replies.shift() ?? { success: true }), { status: 200 });
    }));
});

describe('subscribePageToApp', () => {
    it('subscribes DM fields and leadgen together', async () => {
        expect(DEFAULT_PAGE_SUBSCRIBE_FIELDS).toEqual(expect.arrayContaining(['messages', 'leadgen']));
        expect(await subscribePageToApp('1111', 'page-token')).toEqual({ success: true, leadgen: true });
        expect(calls).toEqual([DEFAULT_PAGE_SUBSCRIBE_FIELDS]);
    });

    it('keeps DM fields subscribed when the token lacks leads_retrieval', async () => {
        replies = [{ error: { message: '(#200) To subscribe to the leadgen field, one of these permissions is needed: leads_retrieval' } }];
        const result = await subscribePageToApp('1111', 'page-token');
        expect(result).toEqual({ success: true, leadgen: false, leadgenError: expect.stringContaining('leads_retrieval') });
        expect(calls[1]).not.toContain('leadgen');
        expect(calls[1]).toContain('messages');
    });

    it('reports a failure when even the DM fields cannot be subscribed', async () => {
        replies = [{ error: { message: 'leadgen denied' } }, { error: { message: 'pages_manage_metadata missing' } }];
        expect(await subscribePageToApp('1111', 'page-token')).toEqual({
            success: false, error: 'pages_manage_metadata missing', leadgen: false, leadgenError: 'leadgen denied',
        });
        expect(await subscribePageToApp('1111', 'page-token', ['messages'])).toEqual({ success: true, leadgen: false });
    });
});
