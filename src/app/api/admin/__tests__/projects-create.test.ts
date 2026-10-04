// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    admin: true,
    calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    result: { data: null as unknown, error: null as null | { code?: string; message?: string } },
}));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => 'actor-id',
    supabaseAdmin: () => ({
        rpc: async (fn: string, args: Record<string, unknown>) => { state.calls.push({ fn, args }); return state.result; },
        from: () => { throw new Error('Төсөл үүсгэх нь зөвхөн RPC-ээр явна'); },
    }),
}));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => state.admin ? { id: 'actor-id', role: 'super_admin' } : null }));

import { POST } from '../projects/route';

const post = (body: unknown) => POST(new Request('http://test/api/admin/projects', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}) as never);
const member = '10000000-0000-4000-8000-000000000002';

beforeEach(() => {
    state.admin = true;
    state.calls = [];
    state.result = { data: { id: 'p1', shop_id: 's1', name: 'Elysium Residence', shops: { name: 'Elysium Residence' } }, error: null };
});

describe('POST /api/admin/projects (shop = project)', () => {
    it('creates the project as its own shop through one RPC with the chosen staff', async () => {
        const response = await post({ name: 'Elysium Residence', district: 'Хан-Уул', member_ids: [member] });
        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ project: state.result.data });
        expect(state.calls).toEqual([{ fn: 'create_project_shop', args: {
            p_fields: { name: 'Elysium Residence', district: 'Хан-Уул' }, p_member_ids: [member], p_actor: 'actor-id',
        } }]);
    });

    it('rejects a shop id: a project never becomes a sub-project of another shop', async () => {
        const response = await post({ name: 'Дэд төсөл', shop_id: '20000000-0000-4000-8000-000000000001' });
        expect(response.status).toBe(400);
        expect(state.calls).toEqual([]);
    });

    it('maps duplicate names to 409 and database validation to 400', async () => {
        state.result = { data: null, error: { code: '23505', message: 'duplicate' } };
        expect((await post({ name: 'Mandala Garden' })).status).toBe(409);
        state.result = { data: null, error: { code: '22023', message: 'Сонгосон ажилтан олдсонгүй' } };
        const invalid = await post({ name: 'Шинэ', member_ids: [member] });
        expect(invalid.status).toBe(400);
        expect(await invalid.json()).toEqual({ error: 'Сонгосон ажилтан олдсонгүй' });
    });

    it('requires super admin', async () => {
        state.admin = false;
        expect((await post({ name: 'Шинэ' })).status).toBe(403);
        expect(state.calls).toEqual([]);
    });
});
