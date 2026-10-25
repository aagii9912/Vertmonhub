// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMetaGraphUrl, scrubMetaBreadcrumb, scrubMetaSpan } from '../sentry-meta';

const sentry = vi.hoisted(() => ({ init: vi.fn(), fetch: vi.fn((options: unknown) => ({ name: 'NodeFetch', options })) }));
vi.mock('@sentry/nextjs', () => ({ init: sentry.init, nativeNodeFetchIntegration: sentry.fetch, captureRequestError: vi.fn(), captureMessage: vi.fn() }));

const DEBUG = 'https://graph.facebook.com/v26.0/debug_token?input_token=EAAGshort-user-token&appsecret_proof=abc123';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('Meta Graph URLs never reach Sentry with their query', () => {
    it('recognises only Graph hosts', () => {
        expect(isMetaGraphUrl(DEBUG)).toBe(true);
        expect(isMetaGraphUrl('https://graph.instagram.com/me')).toBe(true);
        expect(isMetaGraphUrl('https://www.vertmon.mn/api/x?input_token=1')).toBe(false);
        expect(isMetaGraphUrl('not a url')).toBe(false);
        expect(isMetaGraphUrl(null)).toBe(false);
    });

    it('drops http.query from a Graph fetch breadcrumb and leaves other breadcrumbs untouched', () => {
        const crumb = { category: 'fetch', data: { url: 'https://graph.facebook.com/v26.0/debug_token', 'http.method': 'GET', 'http.query': '?input_token=EAAGshort-user-token', status_code: 200 } };
        expect(scrubMetaBreadcrumb(crumb)).toEqual({ category: 'fetch', data: { url: 'https://graph.facebook.com/v26.0/debug_token', 'http.method': 'GET', status_code: 200 } });
        const other = { category: 'fetch', data: { url: 'https://api.openai.com/v1/responses', 'http.query': '?x=1' } };
        expect(scrubMetaBreadcrumb(other)).toBe(other);
        const log: { category: string; data?: Record<string, unknown> } = { category: 'console' };
        expect(scrubMetaBreadcrumb(log)).toBe(log);
    });

    it('strips the query from a Graph span (url.full, url.query, http.target, description)', () => {
        const span = { description: `GET ${DEBUG}`, data: { 'url.full': DEBUG, 'url.query': '?input_token=EAAGshort-user-token', 'http.target': '/v26.0/debug_token?input_token=EAAGshort-user-token', 'server.address': 'graph.facebook.com', 'http.response.status_code': 200 } };
        const clean = scrubMetaSpan(span);
        expect(JSON.stringify(clean)).not.toContain('short-user-token');
        expect(JSON.stringify(clean)).not.toContain('appsecret_proof');
        expect(clean).toEqual({ description: 'GET https://graph.facebook.com/v26.0/debug_token', data: {
            'url.full': 'https://graph.facebook.com/v26.0/debug_token', 'http.target': '/v26.0/debug_token', 'server.address': 'graph.facebook.com', 'http.response.status_code': 200,
        } });
        const local = { description: 'GET /api/x', data: { 'url.full': 'https://www.vertmon.mn/api/x?page=2' } };
        expect(scrubMetaSpan(local)).toBe(local);
    });

    it('wires the node runtime: Graph fetches are ignored for spans and breadcrumbs, both scrubbers are set', async () => {
        vi.stubEnv('NEXT_RUNTIME', 'nodejs');
        const { register } = await import('@/instrumentation');
        await register();
        const options = sentry.init.mock.calls[0][0];
        expect(options.beforeBreadcrumb).toBe(scrubMetaBreadcrumb);
        expect(options.beforeSendSpan).toBe(scrubMetaSpan);
        const { ignoreOutgoingRequests } = sentry.fetch.mock.calls[0][0] as { ignoreOutgoingRequests: (url: string) => boolean };
        expect(options.integrations).toEqual([{ name: 'NodeFetch', options: { ignoreOutgoingRequests } }]);
        expect(ignoreOutgoingRequests(DEBUG)).toBe(true);
        expect(ignoreOutgoingRequests('https://abc.supabase.co/rest/v1/shops')).toBe(false);

        vi.stubEnv('NEXT_RUNTIME', 'edge');
        sentry.init.mockClear();
        await register();
        expect(sentry.init.mock.calls[0][0]).toMatchObject({ beforeBreadcrumb: scrubMetaBreadcrumb, beforeSendSpan: scrubMetaSpan });
        expect(sentry.init.mock.calls[0][0].integrations).toBeUndefined();
    });
});
