// @vitest-environment node
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAPPED_PROJECT, PAGE_ID, PROJECT, SHOP, fakeDb, graphLead, seededDb, type Row } from './lead-ads-db';

const attribution = vi.hoisted(() => [] as Row[]);
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: (value: string | null | undefined) => value || null }));
vi.mock('@/lib/marketing/attribution-events', () => ({ logAttributionEvent: async (event: Row) => { attribution.push(event); } }));

import { classifyGraphError, ingestLeadgenWebhook, leadgenRefs, leadgenRequestId, mapLeadFields } from '../leadgen';

const SECRET = 'app-secret';
type Reply = Row | { status: number; body: Row } | Error;
let graph: Record<string, Reply[]> = {};
const requests: Array<{ url: URL; headers: Record<string, string> }> = [];

function webhookBody(...leadgenIds: Array<string | null>) {
    return {
        object: 'page',
        entry: [{ id: PAGE_ID, time: 1, changes: leadgenIds.map(id => ({ field: 'leadgen', value: { leadgen_id: id, page_id: PAGE_ID, form_id: '8880001', ad_id: '7770001', created_time: 1759633965 } })) }],
    };
}
const run = (db: ReturnType<typeof fakeDb>, body: unknown, deadline = Date.now() + 15_000) => ingestLeadgenWebhook(db.client, body, deadline);

beforeEach(() => {
    attribution.length = 0;
    requests.length = 0;
    graph = {};
    vi.stubEnv('FACEBOOK_APP_SECRET', SECRET);
    vi.stubGlobal('fetch', vi.fn(async (input: URL, init?: RequestInit) => {
        const url = new URL(input);
        requests.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
        const id = url.pathname.split('/').pop()!;
        const reply = graph[id]?.shift() ?? graphLead(id);
        if (reply instanceof Error) throw reply;
        if ('status' in reply && 'body' in reply) return new Response(JSON.stringify(reply.body), { status: reply.status as number });
        return new Response(JSON.stringify(reply), { status: 200 });
    }));
});

describe('Facebook Lead Ads webhook ingest', () => {
    it('saves the lead under the mapped campaign project and records the event', async () => {
        const db = seededDb({ marketing_campaigns: [{ shop_id: SHOP, external_campaign_id: '5550001', project_id: MAPPED_PROJECT }] });
        const summary = await run(db, webhookBody('9001'));

        expect(summary).toMatchObject({ received: 1, ingested: 1, duplicate: 0, skipped: 0, failed: 0 });
        expect(db.tables.leads).toEqual([expect.objectContaining({
            shop_id: SHOP, project_id: MAPPED_PROJECT, client_request_id: leadgenRequestId('9001'),
            customer_name: 'Бат Дорж', customer_phone: '+976 9911 2233', customer_email: 'bat@example.mn',
            source: 'facebook_ads', facebook_campaign_id: '5550001', facebook_adset_id: '6660001', facebook_ad_id: '7770001',
            created_at: '2026-10-01T03:12:45.000Z', notes: 'Lead Ads форм:\nсонирхож_буй_өрөө: 3 өрөө',
        })]);
        expect(attribution).toEqual([expect.objectContaining({ shopId: SHOP, eventType: 'lead', source: 'facebook_ads', facebook_campaign_id: '5550001' })]);
        expect(db.tables.meta_leadgen_events).toEqual([expect.objectContaining({
            leadgen_id: '9001', page_id: PAGE_ID, shop_id: SHOP, lead_id: db.tables.leads[0].id, status: 'saved', reason: null,
            origin: 'webhook', form_id: '8880001', ad_id: '7770001', campaign_id: '5550001',
        })]);
    });

    it('reads the lead from Graph v26 with appsecret_proof and the token only in the Authorization header', async () => {
        await run(seededDb(), webhookBody('9002'));
        const [{ url, headers }] = requests;
        expect(url.origin + url.pathname).toBe('https://graph.facebook.com/v26.0/9002');
        expect(url.searchParams.get('access_token')).toBeNull();
        expect(url.searchParams.get('appsecret_proof')).toBe(createHmac('sha256', SECRET).update('page-token').digest('hex'));
        expect(url.searchParams.get('fields')).toContain('field_data');
        expect(headers.authorization).toBe('Bearer page-token');
    });

    it('falls back to the shop\'s only project when the campaign is not mapped, and to no project without one', async () => {
        const db = seededDb();
        await run(db, webhookBody('9003'));
        expect(db.tables.leads[0].project_id).toBe(PROJECT);

        const empty = seededDb({ projects: [] });
        expect((await run(empty, webhookBody('9004'))).ingested).toBe(1);
        expect(empty.tables.leads[0].project_id).toBeNull();
    });

    it('does not fetch, insert or record again when Meta re-delivers a saved lead', async () => {
        const db = seededDb();
        await run(db, webhookBody('9005'));
        const before = { ...db.tables.meta_leadgen_events[0] };
        const retry = await run(db, webhookBody('9005'));
        expect(retry).toMatchObject({ received: 1, ingested: 0, duplicate: 1 });
        expect(requests).toHaveLength(1);
        expect(db.tables.leads).toHaveLength(1);
        expect(attribution).toHaveLength(1);
        expect(db.tables.meta_leadgen_events).toEqual([before]);
    });

    it('records a page that is not connected to any shop and skips without calling Graph', async () => {
        const db = fakeDb();
        const summary = await run(db, webhookBody('9006'));
        expect(summary).toMatchObject({ skipped: 1, failed: 0, reasons: { page_not_connected: 1 } });
        expect(requests).toHaveLength(0);
        expect(db.tables.meta_leadgen_events).toEqual([expect.objectContaining({ leadgen_id: '9006', shop_id: null, status: 'skipped', reason: 'page_not_connected' })]);
    });

    it('skips (and records) a connected page without a token or without the app secret', async () => {
        const db = fakeDb({ shops: [{ id: SHOP, facebook_page_id: PAGE_ID, facebook_page_access_token: null, is_active: true }] });
        expect((await run(db, webhookBody('9007'))).reasons).toEqual({ token_missing: 1 });

        vi.stubEnv('FACEBOOK_APP_SECRET', '');
        const noSecret = seededDb();
        expect((await run(noSecret, webhookBody('9008'))).reasons).toEqual({ app_secret_missing: 1 });
        expect(requests).toHaveLength(0);
        expect(noSecret.tables.leads).toHaveLength(0);
    });

    it('counts transient Graph failures as failed (Meta retries) and saves on the retry', async () => {
        const db = seededDb();
        graph['9009'] = [new Error('socket hang up'), { status: 500, body: { error: { code: 2, message: 'Service temporarily unavailable' } } }];
        expect(await run(db, webhookBody('9009'))).toMatchObject({ failed: 1, reasons: { graph_unavailable: 1 } });
        expect(db.tables.meta_leadgen_events[0]).toMatchObject({ status: 'failed', reason: 'graph_unavailable' });
        expect((await run(db, webhookBody('9009'))).failed).toBe(1);

        expect((await run(db, webhookBody('9009'))).ingested).toBe(1);
        expect(db.tables.meta_leadgen_events).toEqual([expect.objectContaining({ status: 'saved', reason: null })]);
    });

    it('skips permanent Graph errors without asking Meta to retry', async () => {
        const db = seededDb();
        graph['9010'] = [{ status: 400, body: { error: { code: 190, message: 'expired' } } }];
        graph['9011'] = [{ status: 403, body: { error: { code: 200, message: 'Requires leads_retrieval' } } }];
        graph['9012'] = [{ status: 400, body: { error: { code: 100, message: 'Unsupported get request' } } }];
        graph['9013'] = [{ id: '9999' }];
        const summary = await run(db, webhookBody('9010', '9011', '9012', '9013'));
        expect(summary).toMatchObject({ received: 4, skipped: 4, failed: 0, reasons: { token_invalid: 1, permission_missing: 1, not_found: 1, graph_error: 1 } });
        expect(db.tables.leads).toHaveLength(0);
        expect(db.tables.meta_leadgen_events.map(e => e.reason)).toEqual(['token_invalid', 'permission_missing', 'not_found', 'graph_error']);
    });

    it('fails transient database errors and skips rejected rows', async () => {
        const db = seededDb();
        db.fail['leads:insert'] = { code: '08006', message: 'connection failure' };
        expect(await run(db, webhookBody('9014'))).toMatchObject({ failed: 1, reasons: { db_error: 1 } });
        db.fail['leads:insert'] = { code: '23514', message: 'check violation' };
        expect(await run(db, webhookBody('9015'))).toMatchObject({ skipped: 1, reasons: { lead_rejected: 1 } });
        db.fail['leads:insert'] = undefined;
        db.fail['shops:select'] = { code: '57014', message: 'timeout' };
        expect(await run(db, webhookBody('9016'))).toMatchObject({ failed: 1, reasons: { db_error: 1 } });
        expect(attribution).toEqual([]);
    });

    it('still saves the lead when the events table is missing', async () => {
        const db = seededDb();
        db.fail['meta_leadgen_events:upsert'] = { code: 'PGRST205', message: 'relation does not exist' };
        expect((await run(db, webhookBody('9017'))).ingested).toBe(1);
        expect(db.tables.leads).toHaveLength(1);
    });

    it('counts malformed changes, ignores other fields and stops at the deadline', async () => {
        const db = seededDb();
        const body = webhookBody(null, '9018');
        (body.entry[0].changes as Row[]).push({ field: 'feed', value: { item: 'post' } });
        const late = await run(db, body, Date.now() - 1);
        expect(late).toMatchObject({ received: 2, skipped: 1, failed: 1, reasons: { invalid_payload: 1, time_budget: 1 } });
        expect(requests).toHaveLength(0);
        expect(leadgenRefs(body).refs).toEqual([expect.objectContaining({ leadgenId: '9018', pageId: PAGE_ID })]);
    });
});

describe('lead form fields and Graph error classes', () => {
    it('joins first/last names, keeps extra answers as a bounded note', () => {
        const mapped = mapLeadFields([
            { name: 'first_name', values: ['Бат'] }, { name: 'last_name', values: ['Дорж'] },
            { name: 'work_phone_number', values: ['99112233'] }, { name: 'budget', values: ['x'.repeat(3000)] },
        ]);
        expect(mapped).toMatchObject({ name: 'Бат Дорж', phone: '99112233', email: null });
        expect(mapped.notes!.length).toBeLessThanOrEqual(2000);
        expect(mapLeadFields(undefined)).toEqual({ name: null, phone: null, email: null, notes: null });
    });

    it('treats rate limits and 5xx as transient, auth and permission errors as permanent', () => {
        expect(classifyGraphError(400, 613, false).transient).toBe(true);
        expect(classifyGraphError(400, 80004, false).transient).toBe(true);
        expect(classifyGraphError(400, undefined, true).transient).toBe(true);
        expect(classifyGraphError(502, undefined, false).transient).toBe(true);
        expect(classifyGraphError(400, 190, false)).toMatchObject({ transient: false, reason: 'token_invalid' });
        expect(classifyGraphError(403, 10, false)).toMatchObject({ transient: false, reason: 'permission_missing' });
        expect(classifyGraphError(400, 999, false)).toMatchObject({ transient: false, reason: 'graph_error' });
    });
});
