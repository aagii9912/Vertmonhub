import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    admin: { id: 'admin-1', role: 'super_admin' } as { id: string; role: string } | null,
    rpc: vi.fn(),
}));

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: vi.fn(async () => state.admin) }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ rpc: state.rpc }) }));
vi.mock('@/lib/rbac', () => ({ ALL_MODULES: ['dashboard', 'leads', 'reports'], clearPermissionsCache: vi.fn() }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAudit: vi.fn() }));

import { POST } from '../route';
import { PATCH } from '../[id]/route';

const saved = { id: 'role-1', name: 'analyst', role_permissions: [{ id: 'p1', module: 'dashboard' }] };
const json = (body: unknown, method = 'POST') => new Request('http://localhost/api/admin/roles', { method, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: 'role-1' }) };

beforeEach(() => {
    state.admin = { id: 'admin-1', role: 'super_admin' };
    state.rpc.mockReset().mockResolvedValue({ data: saved, error: null });
});

describe('POST /api/admin/roles', () => {
    it('creates the role, grants and audit in one save_role call', async () => {
        const res = await POST(json({ name: 'analyst', display_name: 'Analyst', display_name_mn: 'Шинжээч', modules: ['dashboard'] }));
        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ role: saved });
        expect(state.rpc).toHaveBeenCalledTimes(1);
        expect(state.rpc).toHaveBeenCalledWith('save_role', {
            p_role_id: null,
            p_fields: { name: 'analyst', display_name: 'Analyst', display_name_mn: 'Шинжээч', description: null, can_write: false, can_delete: false, can_access_admin: false },
            p_modules: ['dashboard'],
            p_actor: 'admin-1',
        });
    });

    it('maps a duplicate name to 409 and a missing migration to 503', async () => {
        state.rpc.mockResolvedValueOnce({ data: null, error: { code: '23505' } });
        expect((await POST(json({ name: 'analyst', display_name: 'A', display_name_mn: 'A' }))).status).toBe(409);
        state.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
        expect((await POST(json({ name: 'other', display_name: 'A', display_name_mn: 'A' }))).status).toBe(503);
    });

    it('rejects unknown modules before writing', async () => {
        expect((await POST(json({ name: 'analyst', display_name: 'A', display_name_mn: 'A', modules: ['finance'] }))).status).toBe(400);
        expect(state.rpc).not.toHaveBeenCalled();
    });
});

describe('PATCH /api/admin/roles/[id]', () => {
    it('replaces only the module grants when modules are sent', async () => {
        const res = await PATCH(json({ modules: ['dashboard', 'leads'] }, 'PATCH'), params);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ role: saved });
        expect(state.rpc).toHaveBeenCalledWith('save_role', { p_role_id: 'role-1', p_fields: {}, p_modules: ['dashboard', 'leads'], p_actor: 'admin-1' });
    });

    it('keeps grants (null modules) when only a field changes', async () => {
        await PATCH(json({ can_write: true }, 'PATCH'), params);
        expect(state.rpc).toHaveBeenCalledWith('save_role', { p_role_id: 'role-1', p_fields: { can_write: true }, p_modules: null, p_actor: 'admin-1' });
    });

    it('returns 404 for a missing role and 400 for an empty change', async () => {
        state.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002' } });
        expect((await PATCH(json({ can_write: true }, 'PATCH'), params)).status).toBe(404);
        expect((await PATCH(json({}, 'PATCH'), params)).status).toBe(400);
    });

    it('requires a super admin', async () => {
        state.admin = { id: 'admin-2', role: 'admin' };
        expect((await PATCH(json({ can_write: true }, 'PATCH'), params)).status).toBe(403);
        expect(state.rpc).not.toHaveBeenCalled();
    });
});
