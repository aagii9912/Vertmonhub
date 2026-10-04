import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * Webhook ACK + хадгалалт (2026-09 review H7; DM бот хасагдсан 2026-10-04).
 *  - Гарын үсэг буруу → 403 (боловсруулалт огт эхлэхгүй)
 *  - Гарын үсэг зөв → 200 ШУУД; хадгалалт after() дотор (mock-оор шууд ажиллуулна)
 *  - Харилцагчийн DM-ийг харилцагч + chat_history-д хадгална, автомат хариу илгээхгүй
 */
const APP_SECRET = 'test-app-secret';
const afterCalls: Array<() => Promise<void> | void> = [];
const state = vi.hoisted(() => ({
    shop: null as null | { id: string; name: string; facebook_page_id: string; facebook_page_access_token: string | null },
    duplicate: false,
}));

vi.mock('next/server', async (importOriginal) => {
    const orig = await importOriginal<typeof import('next/server')>();
    return { ...orig, after: (fn: () => Promise<void> | void) => { afterCalls.push(fn); } };
});
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/facebook/messenger', () => ({ verifyWebhook: vi.fn(), appsecretProof: vi.fn(() => null) }));
vi.mock('@/lib/webhook/retryService', () => ({ isDuplicateWebhookEvent: vi.fn(async () => state.duplicate) }));
const service = vi.hoisted(() => ({
    getShopByPageId: vi.fn(async (_pageId: string) => state.shop),
    getShopByInstagramId: vi.fn(async () => null),
    getOrCreateCustomer: vi.fn(async () => ({ id: 'customer-1', name: 'Бат', phone: null })),
    getOrCreateInstagramCustomer: vi.fn(),
    updateCustomerInfo: vi.fn(async (customer: unknown) => customer),
    saveChatHistory: vi.fn(),
    incrementMessageCount: vi.fn(),
}));
vi.mock('@/lib/webhook/WebhookService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/webhook/WebhookService')>();
    return { ...service, incomingMessageText: actual.incomingMessageText };
});

function signed(body: string, secret = APP_SECRET) {
    return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}
function post(body: string, sig: string | null) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (sig) headers['x-hub-signature-256'] = sig;
    return new Request('http://localhost/api/webhook', { method: 'POST', body, headers }) as never;
}
const page = (messaging: unknown[]) => JSON.stringify({ object: 'page', entry: [{ id: 'page-1', messaging }] });
const payload = page([{ sender: { id: 'psid-1' }, message: { mid: 'm1', text: 'Сайн уу' } }]);

let POST: (req: never) => Promise<Response>;
beforeAll(async () => {
    vi.stubEnv('FACEBOOK_APP_SECRET', APP_SECRET);
    vi.stubEnv('FACEBOOK_VERIFY_TOKEN', 'verify');
    ({ POST } = await import('../route'));
});
beforeEach(() => {
    afterCalls.length = 0;
    state.shop = { id: 'shop-1', name: 'Shop', facebook_page_id: 'page-1', facebook_page_access_token: 'page-token' };
    state.duplicate = false;
    Object.values(service).forEach((fn) => fn.mockClear());
});

async function deliver(body: string) {
    const res = await POST(post(body, signed(body)));
    expect(res.status).toBe(200);
    for (const fn of afterCalls.splice(0)) await fn();
}

describe('POST /api/webhook', () => {
    it('буруу гарын үсэг → 403, боловсруулалт эхлэхгүй', async () => {
        const res = await POST(post(payload, signed(payload, 'wrong')));
        expect(res.status).toBe(403);
        expect(afterCalls.length).toBe(0);
        expect(service.getShopByPageId).not.toHaveBeenCalled();
    });
    it('гарын үсэггүй → 403', async () => {
        expect((await POST(post(payload, null))).status).toBe(403);
    });
    it('зөв гарын үсэг → 200 шууд, хадгалалт after() дотор', async () => {
        const res = await POST(post(payload, signed(payload)));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok' });
        expect(afterCalls.length).toBe(1);
        // ACK-ийн ДАРАА л shop хайж эхэлнэ
        expect(service.getShopByPageId).not.toHaveBeenCalled();
        await afterCalls[0]();
        expect(service.getShopByPageId).toHaveBeenCalledWith('page-1');
    });
    it('буруу object type → 400', async () => {
        const bad = JSON.stringify({ object: 'user', entry: [] });
        expect((await POST(post(bad, signed(bad)))).status).toBe(400);
    });

    it('харилцагчийн текстийг хадгалж, хариу илгээхгүй', async () => {
        await deliver(payload);
        expect(service.getOrCreateCustomer).toHaveBeenCalledWith('shop-1', 'psid-1', 'page-token');
        expect(service.saveChatHistory).toHaveBeenCalledWith('shop-1', 'customer-1', 'Сайн уу');
        expect(service.incrementMessageCount).toHaveBeenCalledWith('customer-1');
    });
    it('хавсралтыг URL-гүй шошгоор хадгална', async () => {
        await deliver(page([{ sender: { id: 'psid-1' }, message: { mid: 'm2', attachments: [{ type: 'image', payload: { url: 'https://cdn.example.invalid/x.jpg' } }, { type: 'sticker' }] } }]));
        expect(service.saveChatHistory).toHaveBeenCalledWith('shop-1', 'customer-1', '[Зураг] [Хавсралт]');
    });
    it('echo, давхар mid, токенгүй shop-ийг хадгалахгүй', async () => {
        await deliver(page([{ sender: { id: 'page-1' }, message: { mid: 'm3', text: 'echo', is_echo: true } }]));
        state.duplicate = true;
        await deliver(payload);
        state.duplicate = false;
        state.shop = { ...state.shop!, facebook_page_access_token: null };
        vi.stubEnv('FACEBOOK_PAGE_ACCESS_TOKEN', '');
        await deliver(payload);
        expect(service.saveChatHistory).not.toHaveBeenCalled();
    });
});
