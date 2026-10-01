import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../dashboard/inbox/remind/route';

const mocks = vi.hoisted(() => ({ facebookId: null as string | null, push: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModuleWrite: async () => null }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop' }) }));
vi.mock('@/lib/notifications', () => ({ sendPushNotification: mocks.push }));
vi.mock('@/lib/facebook/messenger', () => ({ sendTextMessage: mocks.send }));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: () => 'fixture-token' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    const query = {
        select: () => query, eq: () => query,
        single: async () => ({ data: table === 'customers' ? { id: 'customer', name: 'Private Customer', phone: '99112233', facebook_id: mocks.facebookId } : { facebook_page_access_token: 'fixture' } }),
        insert: async () => ({ error: null }),
    };
    return query;
} }) }));
beforeEach(() => {
    vi.clearAllMocks();
    mocks.facebookId = null;
    mocks.push.mockResolvedValue({ success: 1, failed: 0 });
    mocks.send.mockResolvedValue(undefined);
});

describe('inbox reminder push privacy', () => {
    it.each([false, true])('broadcasts no contact details (Facebook reachable: %s)', async reachable => {
        mocks.facebookId = reachable ? 'recipient' : null;
        const response = await POST(new NextRequest('http://localhost/api/dashboard/inbox/remind', { method: 'POST', body: JSON.stringify({ customerId: '00000000-0000-4000-8000-000000000001' }) }));
        expect(response.status).toBe(200);
        expect(mocks.push).toHaveBeenCalledOnce();
        const payload = mocks.push.mock.calls[0][1];
        expect(payload.body).toContain('Inbox хэсэгт шалгана уу.');
        expect(JSON.stringify(payload)).not.toMatch(/Private Customer|99112233|customer|00000000/);
        expect(mocks.send).toHaveBeenCalledTimes(reachable ? 1 : 0);
    });
});
