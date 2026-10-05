// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * Lead Ads: Meta нэг app-д Page-ийн ганц callback URL зөвшөөрдөг тул leadgen өөрчлөлт /api/webhook-ээр
 * ирнэ. ACK-аас өмнө хадгалж, түр зуурын алдаа гарвал 503 → Meta дахин илгээнэ; DM after()-д хэвээр.
 */
const APP_SECRET = 'test-app-secret';
const afterCalls: Array<() => Promise<void> | void> = [];
const leadgen = vi.hoisted(() => ({
    ingest: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
    const orig = await importOriginal<typeof import('next/server')>();
    return { ...orig, after: (fn: () => Promise<void> | void) => { afterCalls.push(fn); } };
});
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ db: true }) }));
vi.mock('@/lib/webhook/retryService', () => ({ isDuplicateWebhookEvent: vi.fn(async () => false) }));
vi.mock('@/lib/webhook/WebhookService', () => ({
    getShopByPageId: vi.fn(async () => null), getShopByInstagramId: vi.fn(async () => null),
    getOrCreateCustomer: vi.fn(), getOrCreateInstagramCustomer: vi.fn(), updateCustomerInfo: vi.fn(),
    incomingMessageText: vi.fn(() => null), saveChatHistory: vi.fn(), incrementMessageCount: vi.fn(),
}));
vi.mock('@/lib/facebook/leadgen', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/facebook/leadgen')>();
    return { ...actual, ingestLeadgenWebhook: leadgen.ingest };
});

const sign = (body: string) => 'sha256=' + createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex');
const post = (body: string, signature: string | null = sign(body)) => new Request('http://localhost/api/webhook', {
    method: 'POST', body, headers: { 'content-type': 'application/json', ...(signature ? { 'x-hub-signature-256': signature } : {}) },
}) as never;
const leadgenBody = (object = 'page', extra: Record<string, unknown> = {}) => JSON.stringify({
    object, entry: [{ id: '1111', time: 1, changes: [{ field: 'leadgen', value: { leadgen_id: '9001', page_id: '1111' } }], ...extra }],
});
const summary = (over: Record<string, unknown> = {}) => ({ received: 1, ingested: 1, duplicate: 0, skipped: 0, failed: 0, reasons: {}, ...over });

async function load(secret = APP_SECRET) {
    vi.resetModules();
    vi.stubEnv('FACEBOOK_APP_SECRET', secret);
    vi.stubEnv('FACEBOOK_VERIFY_TOKEN', 'verify');
    return (await import('../route')).POST as (req: never) => Promise<Response>;
}

beforeEach(() => {
    afterCalls.length = 0;
    leadgen.ingest.mockReset();
    leadgen.ingest.mockResolvedValue(summary());
});

describe('POST /api/webhook — Lead Ads', () => {
    it('stores leadgen changes before acknowledging and returns 200 when all were handled', async () => {
        const POST = await load();
        const started = Date.now();
        const res = await POST(post(leadgenBody()));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ status: 'ok', leadgen: { ingested: 1 } });
        const [db, body, deadline] = leadgen.ingest.mock.calls[0];
        expect(db).toEqual({ db: true });
        expect(body).toMatchObject({ object: 'page' });
        expect(deadline).toBeGreaterThanOrEqual(started + 15_000);
        expect(deadline).toBeLessThanOrEqual(Date.now() + 15_000);
    });

    it('acknowledges skipped (configuration) events so Meta does not retry them', async () => {
        leadgen.ingest.mockResolvedValue(summary({ ingested: 0, skipped: 1, reasons: { page_not_connected: 1 } }));
        expect((await (await load())(post(leadgenBody()))).status).toBe(200);
    });

    it('asks Meta to retry (503) on transient failures or an unexpected error', async () => {
        const POST = await load();
        leadgen.ingest.mockResolvedValue(summary({ ingested: 0, failed: 1, reasons: { graph_unavailable: 1 } }));
        expect((await POST(post(leadgenBody()))).status).toBe(503);
        leadgen.ingest.mockRejectedValue(new Error('boom'));
        expect((await POST(post(leadgenBody()))).status).toBe(503);
    });

    it('still schedules DM storage when a batch mixes messaging and leadgen', async () => {
        const POST = await load();
        const res = await POST(post(leadgenBody('page', { messaging: [{ sender: { id: 'psid' }, message: { mid: 'm1', text: 'Сайн уу' } }] })));
        expect(res.status).toBe(200);
        expect(afterCalls).toHaveLength(1);
        expect(leadgen.ingest).toHaveBeenCalledTimes(1);
    });

    it('does not run leadgen for message-only, Instagram or unsigned payloads', async () => {
        const POST = await load();
        const dm = JSON.stringify({ object: 'page', entry: [{ id: '1111', messaging: [] }] });
        expect((await POST(post(dm))).status).toBe(200);
        expect((await POST(post(leadgenBody('instagram')))).status).toBe(200);
        expect((await POST(post(leadgenBody(), 'sha256=' + '0'.repeat(64)))).status).toBe(403);
        expect((await POST(post(leadgenBody(), null))).status).toBe(403);
        expect(leadgen.ingest).not.toHaveBeenCalled();
    });

    it('fails closed when FACEBOOK_APP_SECRET is missing', async () => {
        const POST = await load('');
        const body = leadgenBody();
        const res = await POST(post(body, 'sha256=' + createHmac('sha256', '').update(body).digest('hex')));
        expect(res.status).toBe(500);
        expect(leadgen.ingest).not.toHaveBeenCalled();
    });
});
