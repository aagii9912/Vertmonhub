import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase';
import { POST } from '../route';

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

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

/** Шүүлтүүрийг үл тоох, хариуг нь тогтмол өгөх PostgREST гинж. */
function chain(result: () => { data: unknown; error: unknown }) {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'not', 'gte', 'order', 'limit']) builder[method] = () => builder;
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return builder;
}

describe('Elysium lead intake', () => {
    const saved = new Map<string, string>();
    const inserts: Record<string, unknown>[] = [];
    const activities: Record<string, unknown>[] = [];
    /** Татан авалтаар орсон лид (external_lead_imports + leads). */
    let importedLeads: Record<string, unknown>[] = [];

    beforeEach(() => {
        vi.stubEnv('ELYSIUM_LEAD_SYNC_SECRET', 'test-secret');
        vi.stubEnv('ELYSIUM_LEAD_PROJECT_ID', projectId);
        saved.clear();
        inserts.length = 0;
        activities.length = 0;
        importedLeads = [];
        vi.mocked(supabaseAdmin).mockReturnValue({
            from(table: string) {
                if (table === 'projects') return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: projectId, shop_id: shopId }, error: null }) }) }),
                };
                if (table === 'external_lead_imports') return chain(() => ({ data: importedLeads.map((lead) => ({ lead_id: lead.id })), error: null }));
                if (table === 'lead_activities') return {
                    ...chain(() => ({ data: [], error: null })),
                    insert: (record: Record<string, unknown>) => ({ select: () => ({ single: async () => {
                        activities.push(record);
                        return { data: { id: 'activity', ...record }, error: null };
                    } }) }),
                };
                if (table === 'leads') return {
                    select: () => ({ eq: () => ({ eq: (_field: string, id: string) => ({
                        maybeSingle: async () => ({ data: saved.has(id) ? { id: saved.get(id), project_id: projectId } : null, error: null }),
                        in: async () => ({ data: importedLeads, error: null }),
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

    it('keeps the shared notes format (message, event, site source)', async () => {
        await POST(post({ ...payload, message: ' Үнийн санал авъя ', event: 'Нээлттэй хаалга' }));
        expect(inserts[0].notes).toBe('Үнийн санал авъя\n\nАрга хэмжээ: Нээлттэй хаалга\n\nСайтын эх сурвалж: elysium/mono#contact');
    });

    it('returns the lead the reconciliation pull already imported instead of creating a second one', async () => {
        importedLeads = [{
            id: 'imported-lead', shop_id: shopId, project_id: projectId, client_request_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            customer_phone: '9911 2233', customer_email: null, notes: 'Сайтын эх сурвалж: elysium/mono#contact',
            created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), deleted_at: null,
        }];
        const res = await POST(post({ ...payload, phone: '+976 99112233' }));
        expect(await res.json()).toEqual({ ok: true, leadId: 'imported-lead', duplicate: true });
        expect(inserts).toHaveLength(0);
        expect(activities).toHaveLength(0);

        // Өөр мессежтэй дахин илгээлт лидийн түүхэнд «дахин хүсэлт» болно.
        const changed = await POST(post({ ...payload, requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', message: 'Өөр асуулт' }));
        expect(await changed.json()).toMatchObject({ leadId: 'imported-lead', duplicate: true });
        expect(inserts).toHaveLength(0);
        expect(activities).toEqual([expect.objectContaining({ lead_id: 'imported-lead', type: 'system', content: expect.stringContaining('Өөр асуулт') })]);

        // Өөр утастай хүсэлт шинэ лид болно.
        await POST(post({ ...payload, requestId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', phone: '88001122' }));
        expect(inserts).toHaveLength(1);
    });

    it('answers a concurrent request ID from another project with 409, not 500', async () => {
        let reads = 0;
        vi.mocked(supabaseAdmin).mockReturnValue({
            from(table: string) {
                if (table === 'projects') return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: projectId, shop_id: shopId }, error: null }) }) }),
                };
                return {
                    // Эхний шалгалтад хоосон, unique зөрчлийн дараах дахин уншилтад өөр төслийн лид.
                    select: () => ({ eq: () => ({ eq: () => ({
                        maybeSingle: async () => ({ data: reads++ === 0 ? null : { id: 'other-lead', project_id: 'other-project' }, error: null }),
                    }) }) }),
                    insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }),
                };
            },
        } as never);
        const res = await POST(post(payload));
        expect(res.status).toBe(409);
    });
});
