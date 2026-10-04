// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
    readDenied: null as Response | null,
    writeDenied: null as Response | null,
    userId: 'user-1' as string | null,
    scope: vi.fn(),
    rpc: vi.fn(),
    history: { data: [] as unknown[], error: null as unknown },
    calls: [] as string[],
}));

vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: vi.fn(async (module: string) => { state.calls.push(`read:${module}`); return state.readDenied; }),
    requireModuleWrite: vi.fn(async (module: string) => { state.calls.push(`write:${module}`); return state.writeDenied; }),
    requireModuleDelete: vi.fn(async () => null),
    requireAnyModule: vi.fn(async () => null),
    resolvePermissions: vi.fn(),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => state.userId }));
vi.mock('@/lib/sales/project-scope', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/sales/project-scope')>(), resolveSalesProjectScope: state.scope,
}));
vi.mock('@/lib/sales/manager-identity', () => ({ resolveManagerIdentity: async () => ({ managerName: 'Номин', fullName: 'Номин Бат' }) }));
vi.mock('@/lib/services/CustomerScoringService', () => ({ recomputeCustomerScore: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => {
        const query = {
            select: () => query, eq: () => query, order: () => query,
            limit: async () => state.history,
        };
        return { rpc: state.rpc, from: () => query };
    },
}));

import { GET, POST } from '../[id]/transfer/route';
import { ProjectScopeError } from '@/lib/sales/project-scope';

const requestId = '11111111-1111-4111-8111-111111111111';
const body = { client_request_id: requestId, kind: 'transfer', customer_name: 'Дорж Сараа', customer_registration: 'ЧБ88020202', reason: 'Худалдсан', effective_date: '2026-06-01' };
const params = { params: Promise.resolve({ id: 'contract-1' }) };
const post = (payload: unknown) => POST(new NextRequest('http://localhost/api/dashboard/contracts/contract-1/transfer', { method: 'POST', body: JSON.stringify(payload) }), params);
const get = () => GET(new NextRequest('http://localhost/api/dashboard/contracts/contract-1/transfer'), params);

beforeEach(() => {
    vi.clearAllMocks();
    state.readDenied = null;
    state.writeDenied = null;
    state.userId = 'user-1';
    state.calls = [];
    state.history = { data: [], error: null };
    state.scope.mockResolvedValue({ projectIds: null, managerName: null });
    state.rpc.mockResolvedValue({ data: { id: 'transfer-1', kind: 'transfer', to_customer_name: 'Дорж Сараа', replayed: false, customer_created: false }, error: null });
});

describe('POST /api/dashboard/contracts/[id]/transfer', () => {
    it('requires contracts write before reading the body or calling the RPC', async () => {
        state.writeDenied = Response.json({ error: 'Эрхгүй' }, { status: 403 });
        expect((await post(body)).status).toBe(403);
        expect(state.calls).toEqual(['write:contracts']);
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it('records the authenticated actor and canonical manager name, never body-supplied identity', async () => {
        const response = await post(body);
        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ transfer: { id: 'transfer-1' }, replayed: false, message: 'Гэрээ шилжүүлэгдлээ' });
        expect(state.rpc).toHaveBeenCalledWith('transfer_contract', expect.objectContaining({
            p_shop_id: 'shop-1', p_contract_id: 'contract-1', p_actor: 'user-1', p_actor_name: 'Номин', p_scope_manager: null, p_request_id: requestId,
        }));
        expect((await post({ ...body, created_by: 'someone-else' })).status).toBe(400);
        expect((await post({ ...body, paid_amount: 0 })).status).toBe(400);
        expect(state.rpc).toHaveBeenCalledTimes(1);
    });

    it('passes the restricted manager scope to the RPC and maps scope failures', async () => {
        state.scope.mockResolvedValue({ projectIds: ['project-1'], managerName: 'Номин' });
        await post(body);
        expect(state.rpc.mock.calls[0][1].p_scope_manager).toBe('Номин');
        state.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Зөвхөн өөрийн борлуулсан гэрээг шилжүүлэх боломжтой' } });
        expect((await post(body)).status).toBe(403);
        state.scope.mockRejectedValue(new ProjectScopeError(503, 'Менежерийн харьяаллыг шалгаж чадсангүй'));
        expect((await post(body)).status).toBe(503);
    });

    it('answers a replay with 200, a missing RPC with 503 and a stale dialog with 409', async () => {
        state.rpc.mockResolvedValue({ data: { id: 'transfer-1', kind: 'rename', to_customer_name: 'Бат', replayed: true }, error: null });
        const replay = await post(body);
        expect(replay.status).toBe(200);
        expect(await replay.json()).toMatchObject({ replayed: true, message: 'Эзэмшигчийн нэр засагдлаа' });
        state.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing' } });
        expect((await post(body)).status).toBe(503);
        state.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'Гэрээний эзэмшигч өөрчлөгдсөн байна' } });
        const stale = await post(body);
        expect(stale.status).toBe(409);
        expect(await stale.json()).toEqual({ error: 'Гэрээний эзэмшигч өөрчлөгдсөн байна' });
    });

    it('requires a signed-in user id', async () => {
        state.userId = null;
        expect((await post(body)).status).toBe(401);
        expect(state.rpc).not.toHaveBeenCalled();
    });
});

describe('GET /api/dashboard/contracts/[id]/transfer', () => {
    it('is gated by contracts read and returns the shop history', async () => {
        state.history = { data: [{ id: 'transfer-1' }], error: null };
        const response = await get();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ transfers: [{ id: 'transfer-1' }], available: true });
        expect(state.calls).toEqual(['read:contracts']);
        state.readDenied = Response.json({ error: 'Эрхгүй' }, { status: 403 });
        expect((await get()).status).toBe(403);
    });
});
