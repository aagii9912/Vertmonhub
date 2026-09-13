import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueue, flushOutbox, outboxList, remove, retryOutboxItem } from '../outbox';
import { dashboardFetch } from '@/lib/api/dashboardFetch';

vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardFetch: vi.fn() }));
const scope = { userId: 'manager-a', shopId: 'shop-a' };
const draft = { url: '/api/dashboard/leads', method: 'POST' as const, label: 'Лид · Болд', body: { customer_name: 'Болд', client_request_id: 'stable-request' } };
const current = () => true;
const KEY = 'vertmonhub_outbox_v1';

beforeEach(() => { vi.restoreAllMocks(); vi.mocked(dashboardFetch).mockReset(); localStorage.clear(); });

describe('offline draft recovery', () => {
    it('does not report a successful enqueue when storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
        expect(() => enqueue(draft, scope)).toThrow();
    });

    it.each([401, 403, 429])('preserves %s failures for explicit retry with the same request id', async (status) => {
        const item = enqueue(draft, scope);
        vi.mocked(dashboardFetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'failed' }), { status }));
        await flushOutbox(scope, current);
        expect(outboxList(scope)).toMatchObject([{ id: item.id, paused: true, body: draft.body }]);
        await flushOutbox(scope, current);
        expect(dashboardFetch).toHaveBeenCalledTimes(1);
        retryOutboxItem(item.id, scope);
        vi.mocked(dashboardFetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));
        await flushOutbox(scope, current);
        expect(outboxList(scope)).toEqual([]);
        expect(dashboardFetch).toHaveBeenLastCalledWith(draft.url, expect.objectContaining({ shopId: scope.shopId, body: JSON.stringify(draft.body) }));
    });

    it('keeps exhausted server-error retries until the owner retries or discards', async () => {
        const item = enqueue(draft, scope);
        vi.mocked(dashboardFetch).mockImplementation(async () => new Response('{}', { status: 503 }));
        for (let attempt = 0; attempt < 35; attempt++) await flushOutbox(scope, current);
        expect(dashboardFetch).toHaveBeenCalledTimes(30);
        expect(outboxList(scope)).toMatchObject([{ id: item.id, paused: true, attempts: 30 }]);
        remove(item.id, { ...scope, userId: 'someone-else' });
        expect(outboxList(scope)).toHaveLength(1);
        remove(item.id, scope);
        expect(outboxList(scope)).toEqual([]);
    });

    it('never displays or replays another account, shop, or ownerless legacy draft', async () => {
        localStorage.setItem(KEY, JSON.stringify([{ ...draft, id: 'legacy', shopId: scope.shopId }]));
        enqueue(draft, { ...scope, userId: 'other-user' });
        enqueue(draft, { ...scope, shopId: 'other-shop' });
        const mine = enqueue(draft, scope);
        expect(outboxList(scope).map((item) => item.id)).toEqual([mine.id]);
        vi.mocked(dashboardFetch).mockResolvedValue(new Response('{}', { status: 200 }));
        await flushOutbox(scope, current);
        expect(dashboardFetch).toHaveBeenCalledTimes(1);
        expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(3);
    });

    it('stops replay when the active account or shop changes', async () => {
        enqueue(draft, scope); enqueue(draft, scope);
        let active = true;
        vi.mocked(dashboardFetch).mockImplementation(async () => { active = false; return new Response('{}', { status: 200 }); });
        await flushOutbox(scope, () => active);
        expect(dashboardFetch).toHaveBeenCalledTimes(1);
        expect(outboxList(scope)).toHaveLength(1);
    });

    it('preserves malformed storage instead of replacing it with a new draft', () => {
        localStorage.setItem(KEY, '{broken');
        expect(() => enqueue(draft, scope)).toThrow();
        expect(localStorage.getItem(KEY)).toBe('{broken');
    });
});
