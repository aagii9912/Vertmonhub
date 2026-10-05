import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase';
import { POST } from '../route';

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const projectId = '7e96e44e-32e3-4fec-b1f7-2205d2064e7c';
const shopId = '00000000-0000-0000-0000-000000000001';

function post(body: object) {
    return new Request('http://localhost/api/integrations/elysium/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer test-secret' },
        body: JSON.stringify(body),
    }) as Parameters<typeof POST>[0];
}

/** Нэргүй маягт: нэр заавал биш (утас/и-мэйл заавал хэвээр), нэр null-ээр хадгалагдана. */
describe('Elysium anonymous lead intake', () => {
    const inserts: Record<string, unknown>[] = [];

    beforeEach(() => {
        vi.stubEnv('ELYSIUM_LEAD_SYNC_SECRET', 'test-secret');
        vi.stubEnv('ELYSIUM_LEAD_PROJECT_ID', projectId);
        inserts.length = 0;
        vi.mocked(supabaseAdmin).mockReturnValue({
            from(table: string) {
                if (table === 'projects') return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: projectId, shop_id: shopId }, error: null }) }) }),
                };
                // Татан авалтаар орсон лид байхгүй: push-ийн давхардлын хамгаалалт шинэ лид үүсгэхийг зөвшөөрнө.
                if (table === 'external_lead_imports') {
                    const chain: Record<string, unknown> = {};
                    for (const method of ['select', 'eq', 'not', 'gte']) chain[method] = () => chain;
                    chain.limit = async () => ({ data: [], error: null });
                    return chain;
                }
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
                    insert: (record: Record<string, unknown>) => ({ select: () => ({ single: async () => {
                        inserts.push(record);
                        return { data: { id: `lead-${inserts.length}` }, error: null };
                    } }) }),
                };
            },
        } as never);
    });

    it('stores a missing, blank or placeholder name as an anonymous lead', async () => {
        const requests = [
            { requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', phone: '99112233' },
            { requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', name: '   ', email: 'bat@example.mn' },
            { requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', name: 'Нэргүй харилцагч', phone: '99112233' },
        ];
        for (const body of requests) expect((await POST(post(body))).status).toBe(200);
        expect(inserts.map((row) => row.customer_name)).toEqual([null, null, null]);
    });

    it('still requires a phone or email when the name is missing', async () => {
        expect((await POST(post({ requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4' }))).status).toBe(400);
        expect(inserts).toEqual([]);
    });
});
