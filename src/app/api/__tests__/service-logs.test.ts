// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ canWrite: true, creates: [] as Array<Record<string, unknown>>, updates: [] as Array<Record<string, unknown>>, result: { ok: true, data: { id: 'log-1' } } as Record<string, unknown> }));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => null, requireAnyModule: async () => null, requireModuleDelete: async () => null,
    requireModuleWrite: async (module: string) => state.canWrite && module === 'customer-service' ? null : new Response('{}', { status: 403 }),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('@/lib/services/ServiceLogService', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/services/ServiceLogService')>(),
    createServiceLog: async (_db: unknown, options: Record<string, unknown>) => { state.creates.push(options); return state.result; },
    updateServiceLog: async (_db: unknown, options: Record<string, unknown>) => { state.updates.push(options); return state.result; },
}));

import { POST } from '../dashboard/service-logs/route';
import { PATCH } from '../dashboard/service-logs/[id]/route';

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const post = (body: unknown) => POST(new NextRequest('http://test/api/dashboard/service-logs', json(body)));
const patch = (body: unknown) => PATCH(new NextRequest('http://test/api/dashboard/service-logs/log-1', { ...json(body), method: 'PATCH' }), { params: Promise.resolve({ id: 'log-1' }) });

beforeEach(() => Object.assign(state, { canWrite: true, creates: [], updates: [], result: { ok: true, data: { id: 'log-1' } } }));

describe('service logs API', () => {
    it('creates a suggestion through the service with the server user and shop', async () => {
        const response = await post({ subject: 'Тоглоомын талбай нэмэх', type: 'suggestion', channel: 'phone', manager_name: 'Номин', customer_id: '' });
        expect(response.status).toBe(201);
        expect(state.creates[0]).toMatchObject({ shopId: 'shop-1', userId: 'user-1', input: { type: 'suggestion', manager_name: 'Номин', customer_id: null } });
    });

    it('rejects unknown fields, bad values and missing write access before any write', async () => {
        expect(await (await post({ subject: 'x', shop_id: 'other' })).json()).toEqual({ error: 'Зөвшөөрөгдөөгүй талбар: shop_id' });
        expect((await post({ subject: 'x', priority: 'asap' })).status).toBe(400);
        expect((await patch({ status: 'done' })).status).toBe(400);
        expect((await patch({ resolved_at: '2026-01-01' })).status).toBe(400);
        state.canWrite = false;
        expect((await post({ subject: 'x' })).status).toBe(403);
        expect(state.creates).toHaveLength(0);
        expect(state.updates).toHaveLength(0);
    });

    it('passes the allow-listed patch and maps service errors', async () => {
        expect((await patch({ status: 'resolved', manager_name: 'Сараа' })).status).toBe(200);
        expect(state.updates[0]).toMatchObject({ shopId: 'shop-1', id: 'log-1', userId: 'user-1', patch: { status: 'resolved', manager_name: 'Сараа' } });
        state.result = { ok: false, status: 409, error: 'Хүсэлтийг өөр хэрэглэгч шинэчилсэн байна.' };
        const conflict = await patch({ status: 'closed' });
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toEqual({ error: 'Хүсэлтийг өөр хэрэглэгч шинэчилсэн байна.' });
    });
});
