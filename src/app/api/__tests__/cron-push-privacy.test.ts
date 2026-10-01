import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as morning } from '../cron/morning-leads/route';
import { GET as digest } from '../cron/ai-digest/route';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('@/lib/auth/cron', () => ({ isAuthorizedCron: () => true }));
vi.mock('@/lib/notifications', () => ({ sendPushNotification: mocks.push }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    const query = {
        select: () => query, eq: () => query, is: () => query, not: () => query, lte: () => query, gte: () => query, gt: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'push_subscriptions' ? [{ shop_id: 'shop' }] : [], count: 125 }).then(resolve),
    };
    return query;
} }) }));
beforeEach(() => { vi.clearAllMocks(); mocks.push.mockResolvedValue({ success: 1, failed: 0 }); });

describe('shop-wide CRM push privacy', () => {
    it.each([morning, digest])('keeps shop-wide counts out of a broadcast', async run => {
        await run(new Request('http://localhost/api/cron'));
        expect(mocks.push).toHaveBeenCalledOnce();
        const payload = mocks.push.mock.calls[0][1];
        expect(payload.body).toContain('CRM шинэчлэгдлээ');
        expect(payload.body).not.toMatch(/\d/);
    });
});
