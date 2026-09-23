import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase';
import { POST } from '../route';

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

const projectId = '7e96e44e-32e3-4fec-b1f7-2205d2064e7c';
const shopId = '00000000-0000-0000-0000-000000000001';
const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const payload = { requestId, name: 'Test Lead', phone: '99112233', source: 'elysium/mono#contact' };

function post(body: object, token = 'test-secret') {
    return new Request('http://localhost/api/integrations/elysium/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    }) as Parameters<typeof POST>[0];
}

describe('Elysium lead intake', () => {
    const saved = new Map<string, string>();
    const inserts: Record<string, unknown>[] = [];

    beforeEach(() => {
        vi.stubEnv('ELYSIUM_LEAD_SYNC_SECRET', 'test-secret');
        vi.stubEnv('ELYSIUM_LEAD_PROJECT_ID', projectId);
        saved.clear();
        inserts.length = 0;
        vi.mocked(supabaseAdmin).mockReturnValue({
            from(table: string) {
                if (table === 'projects') return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: projectId, shop_id: shopId }, error: null }) }) }),
                };
                if (table === 'leads') return {
                    select: () => ({ eq: () => ({ eq: (_field: string, id: string) => ({
                        maybeSingle: async () => ({ data: saved.has(id) ? { id: saved.get(id), project_id: projectId } : null, error: null }),
                    }) }) }),
                    insert: (record: Record<string, unknown>) => ({ select: () => ({ single: async () => {
                        inserts.push(record);
                        const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
                        saved.set(record.client_request_id as string, id);
                        return { data: { id }, error: null };
                    } }) }),
                };
                throw new Error(`Unexpected table: ${table}`);
            },
        } as never);
    });

    it('rejects a wrong secret before using the database', async () => {
        const res = await POST(post(payload, 'wrong'));
        expect(res.status).toBe(401);
        expect(supabaseAdmin).not.toHaveBeenCalled();
    });

    it('requires a contact method', async () => {
        const res = await POST(post({ requestId, name: 'Test Lead' }));
        expect(res.status).toBe(400);
        expect(supabaseAdmin).not.toHaveBeenCalled();
    });

    it('binds the configured project and returns the same lead on retry', async () => {
        const first = await POST(post(payload));
        expect(first.status).toBe(200);
        expect(await first.json()).toMatchObject({ ok: true, duplicate: false });
        expect(inserts).toHaveLength(1);
        expect(inserts[0]).toMatchObject({
            shop_id: shopId,
            project_id: projectId,
            client_request_id: requestId,
            source: 'website',
        });

        const retry = await POST(post(payload));
        expect(await retry.json()).toMatchObject({ ok: true, duplicate: true });
        expect(inserts).toHaveLength(1);
    });
});
