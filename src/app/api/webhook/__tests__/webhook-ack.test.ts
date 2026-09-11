import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * Wave 3: webhook ACK урсгал (2026-09 review H7).
 *  - Гарын үсэг буруу → 403 (боловсруулалт огт эхлэхгүй)
 *  - Гарын үсэг зөв → 200 ШУУД; боловсруулалт after() дотор (mock-оор шууд ажиллуулна)
 *  - Bot унтраалттай (FACEBOOK_BOT_ENABLED != true) → 200 data_only, AI дуудагдахгүй
 */
const APP_SECRET = 'test-app-secret';
const afterCalls: Array<() => Promise<void> | void> = [];

vi.mock('next/server', async (importOriginal) => {
    const orig = await importOriginal<typeof import('next/server')>();
    return { ...orig, after: (fn: () => Promise<void> | void) => { afterCalls.push(fn); } };
});
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/ai/AIRouter', () => ({ routeToAI: vi.fn(), analyzeProductImageWithPlan: vi.fn() }));
vi.mock('@/lib/facebook/messenger', () => ({
    verifyWebhook: vi.fn(), sendTextMessage: vi.fn(), sendSenderAction: vi.fn(), sendMessageWithQuickReplies: vi.fn(),
}));
vi.mock('@/lib/webhook/retryService', () => ({ isDuplicateWebhookEvent: vi.fn(async () => false), queueWebhookJob: vi.fn() }));
vi.mock('@/lib/ai/tools/memory', () => ({ getCustomerMemory: vi.fn() }));
vi.mock('@/lib/ai/intent-detector', () => ({ detectIntent: vi.fn(() => ({ intent: 'x', confidence: 1 })) }));
vi.mock('@/lib/ai/comment-detector', () => ({ shouldReplyToComment: vi.fn(() => false) }));
const getShopByPageId = vi.fn(async (_pageId: string) => null);
vi.mock('@/lib/webhook/WebhookService', () => ({
    getShopByPageId: (pageId: string) => getShopByPageId(pageId),
    getShopByInstagramId: vi.fn(async () => null),
    getAIFeatures: vi.fn(), getOrCreateCustomer: vi.fn(), getOrCreateInstagramCustomer: vi.fn(), updateCustomerInfo: vi.fn(),
    getChatHistory: vi.fn(), saveChatHistory: vi.fn(), incrementMessageCount: vi.fn(), buildNotifySettings: vi.fn(),
    generateFallbackResponse: vi.fn(), processAIResponse: vi.fn(), replyToComment: vi.fn(),
}));

function signed(body: string, secret = APP_SECRET) {
    return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}
function post(body: string, sig: string | null) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (sig) headers['x-hub-signature-256'] = sig;
    return new Request('http://localhost/api/webhook', { method: 'POST', body, headers }) as any;
}

let POST: (req: any) => Promise<Response>;
beforeAll(async () => {
    vi.stubEnv('FACEBOOK_APP_SECRET', APP_SECRET);
    vi.stubEnv('FACEBOOK_VERIFY_TOKEN', 'verify');
    vi.stubEnv('FACEBOOK_BOT_ENABLED', 'true');
    ({ POST } = await import('../route'));
});

const payload = JSON.stringify({ object: 'page', entry: [{ id: 'page-1', messaging: [{ sender: { id: 'psid-1' }, message: { mid: 'm1', text: 'Сайн уу' } }] }] });

describe('POST /api/webhook', () => {
    it('буруу гарын үсэг → 403, боловсруулалт эхлэхгүй', async () => {
        const res = await POST(post(payload, signed(payload, 'wrong')));
        expect(res.status).toBe(403);
        expect(afterCalls.length).toBe(0);
        expect(getShopByPageId).not.toHaveBeenCalled();
    });
    it('гарын үсэггүй → 403', async () => {
        const res = await POST(post(payload, null));
        expect(res.status).toBe(403);
    });
    it('зөв гарын үсэг → 200 шууд, боловсруулалт after() дотор', async () => {
        const res = await POST(post(payload, signed(payload)));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok' });
        expect(afterCalls.length).toBe(1);
        // ACK-ийн ДАРАА л shop хайж эхэлнэ
        expect(getShopByPageId).not.toHaveBeenCalled();
        await afterCalls[0]();
        expect(getShopByPageId).toHaveBeenCalledWith('page-1');
    });
    it('буруу object type → 400', async () => {
        const bad = JSON.stringify({ object: 'user', entry: [] });
        const res = await POST(post(bad, signed(bad)));
        expect(res.status).toBe(400);
    });
});
