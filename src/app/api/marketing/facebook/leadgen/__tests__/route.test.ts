// @vitest-environment node
import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    inserts: [] as Row[],
    savedRequestIds: new Set<string>(),
    insertError: null as null | { code?: string; message: string },
    events: [] as Row[],
    mappedProject: 'project-garden' as string | null,
}));

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger }));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: (value: string | null) => value }));
vi.mock('@/lib/marketing/attribution-events', () => ({ logAttributionEvent: async (event: Row) => { state.events.push(event); } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    let payload: Row | null = null;
    const query = {
        select: () => query,
        eq: () => query,
        insert: (row: Row) => { payload = row; return query; },
        maybeSingle: async () => ({ data: table === 'marketing_campaigns' && state.mappedProject ? { project_id: state.mappedProject } : null, error: null }),
        single: async () => {
            if (table === 'shops') return { data: { id: 'shop-1', facebook_page_access_token: 'page-token' }, error: null };
            state.inserts.push(payload!);
            if (state.insertError) return { data: null, error: state.insertError };
            const key = String(payload!.client_request_id);
            if (state.savedRequestIds.has(key)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
            state.savedRequestIds.add(key);
            return { data: { id: `lead-${state.savedRequestIds.size}` }, error: null };
        },
    };
    return query;
} }) }));

import { POST } from '../route';

const APP_SECRET = 'app-secret';
const sign = (raw: string, secret = APP_SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
const webhook = (leadgenId = '9001') => {
    const raw = JSON.stringify({ entry: [{ id: 'page-1', changes: [{ field: 'leadgen', value: { leadgen_id: leadgenId, page_id: 'page-1' } }] }] });
    return new NextRequest('https://app.example/api/marketing/facebook/leadgen', {
        method: 'POST',
        headers: { 'x-hub-signature-256': sign(raw) },
        body: raw,
    });
};
const LEAD = {
    campaign_id: 'cmp-1',
    field_data: [
        { name: 'full_name', values: ['Бат Дорж'] },
        { name: 'phone_number', values: ['+976 9911 2233'] },
        { name: 'email', values: ['bat@example.mn'] },
    ],
};
const http = vi.fn();

beforeEach(() => {
    state.inserts = []; state.savedRequestIds = new Set(); state.insertError = null; state.events = []; state.mappedProject = 'project-garden';
    vi.clearAllMocks();
    vi.stubEnv('FACEBOOK_APP_SECRET', APP_SECRET);
    http.mockReset();
    http.mockImplementation(async () => new Response(JSON.stringify(LEAD), { status: 200 }));
    vi.stubGlobal('fetch', http);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Facebook Lead Ads intake', () => {
    it('saves the lead into the real CRM columns and logs attribution', async () => {
        const response = await POST(webhook());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, ingested: 1 });
        expect(state.inserts[0]).toMatchObject({
            shop_id: 'shop-1', customer_name: 'Бат Дорж', customer_phone: '+976 9911 2233', customer_email: 'bat@example.mn',
            source: 'facebook_ads', facebook_campaign_id: 'cmp-1', project_id: 'project-garden',
        });
        expect(state.inserts[0].client_request_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(state.events).toEqual([expect.objectContaining({ leadId: 'lead-1', eventType: 'lead' })]);
    });

    it('keeps leads from unmapped campaigns for an admin to assign a project', async () => {
        state.mappedProject = null;
        expect((await POST(webhook('9004'))).status).toBe(200);
        expect(state.inserts[0]).toMatchObject({ project_id: null, customer_name: 'Бат Дорж' });
    });

    it('does not duplicate a lead when Meta delivers it again', async () => {
        await POST(webhook('9002'));
        const retry = await POST(webhook('9002'));
        expect(retry.status).toBe(200);
        expect(state.inserts).toHaveLength(2);
        expect(state.inserts[1].client_request_id).toBe(state.inserts[0].client_request_id);
        expect(state.events).toHaveLength(1);
    });

    it('asks Meta to retry when the lead could not be stored', async () => {
        state.insertError = { code: 'PGRST204', message: 'column missing' };
        const response = await POST(webhook());
        expect(response.status).toBe(500);
        expect(state.events).toEqual([]);
        http.mockImplementation(async () => new Response('{}', { status: 400 }));
        state.insertError = null;
        expect((await POST(webhook('9003'))).status).toBe(500);
    });

    it('rejects an unsigned or wrongly signed delivery before reading Graph', async () => {
        const request = webhook();
        const raw = await request.clone().text();
        const forged = new NextRequest(request.url, { method: 'POST', headers: { 'x-hub-signature-256': sign(raw, 'other-secret') }, body: raw });
        expect((await POST(forged)).status).toBe(401);
        expect(http).not.toHaveBeenCalled();
    });
});

describe('Lead Ads retrieval on Graph v26', () => {
    it('reads the lead with the Page token only in the Authorization header and an appsecret_proof', async () => {
        expect((await POST(webhook('9101'))).status).toBe(200);
        expect(http).toHaveBeenCalledTimes(1);
        const [url, init] = http.mock.calls[0] as [URL, RequestInit];
        expect(url.origin + url.pathname).toBe('https://graph.facebook.com/v26.0/9101');
        expect(url.searchParams.get('fields')).toBe('field_data,campaign_id,adset_id,ad_id');
        expect(url.searchParams.get('appsecret_proof')).toBe(crypto.createHmac('sha256', APP_SECRET).update('page-token').digest('hex'));
        expect(url.searchParams.has('access_token')).toBe(false);
        expect(url.toString()).not.toContain('page-token');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer page-token');
    });

    it('fails closed without FACEBOOK_APP_SECRET: no Graph call, Meta is asked to retry', async () => {
        vi.stubEnv('FACEBOOK_APP_SECRET', '');
        const response = await POST(webhook('9102'));
        expect(response.status).toBe(500);
        expect(http).not.toHaveBeenCalled();
        expect(state.inserts).toEqual([]);
    });

    it('retries a transient Graph error once in-process and logs only status/code', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        http.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: 2, message: 'temporary page-token' } }), { status: 503 }));
        const pending = POST(webhook('9103'));
        await vi.runAllTimersAsync();
        expect((await pending).status).toBe(200);
        expect(http).toHaveBeenCalledTimes(2);
        expect(state.inserts[0]).toMatchObject({ customer_name: 'Бат Дорж', facebook_campaign_id: 'cmp-1' });

        http.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 190, message: 'expired page-token' } }), { status: 400 }));
        expect((await POST(webhook('9104'))).status).toBe(500);
        expect(logger.warn).toHaveBeenCalledWith('[Leadgen] fetch failed', { leadgenId: '9104', status: 400, code: 190 });
        const logged = JSON.stringify([logger.warn.mock.calls, logger.error.mock.calls, logger.info.mock.calls]);
        expect(logged).not.toContain('page-token');
        expect(logged).not.toContain('graph.facebook.com');
    });
});
