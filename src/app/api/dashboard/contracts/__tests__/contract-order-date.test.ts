// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { MemoryDb } from '@/test/memory-db';

const state = vi.hoisted(() => ({ db: null as unknown as MemoryDb, scope: { projectIds: null as string[] | null, managerName: null as string | null } }));

vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => null, requireModuleWrite: async () => null, requireModuleDelete: async () => null, requireAnyModule: async () => null,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/sales/project-scope', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/sales/project-scope')>(),
    resolveSalesProjectScope: async () => state.scope,
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { createMemoryDb } from '@/test/memory-db';
import { ubDateStr } from '@/lib/utils/date';
import { PATCH } from '../[id]/route';

const patch = (body: unknown) => PATCH(new NextRequest('http://localhost/api/dashboard/contracts/c-1', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'c-1' }) });
const stored = () => state.db.tables.property_contracts[0];
const contractWrites = () => state.db.writes.filter((write) => write.table === 'property_contracts');

beforeEach(() => {
    state.scope = { projectIds: null, managerName: null };
    state.db = createMemoryDb({
        property_contracts: [{ id: 'c-1', shop_id: 'shop-1', deleted_at: null, order_date: null, contract_date: null, sales_manager: 'Номин', contract_status: 'active' }],
        data_audit_log: [],
    });
});

describe('PATCH /api/dashboard/contracts/[id] — «Огноо оруулах»', () => {
    it('fills an empty order date and the empty contract date, auditing both like other fields', async () => {
        const response = await patch({ order_date: '2026-09-15' });
        expect(response.status).toBe(200);
        expect(stored()).toMatchObject({ order_date: '2026-09-15', contract_date: '2026-09-15' });
        expect(state.db.tables.data_audit_log).toEqual([expect.objectContaining({
            shop_id: 'shop-1', actor_id: 'user-1', entity: 'contract', entity_id: 'c-1', action: 'update',
            changes: { order_date: { from: null, to: '2026-09-15' }, contract_date: { from: null, to: '2026-09-15' } },
        })]);
    });

    it('keeps an existing contract date', async () => {
        stored().contract_date = '2026-09-20';
        expect((await patch({ order_date: '2026-09-15' })).status).toBe(200);
        expect(stored()).toMatchObject({ order_date: '2026-09-15', contract_date: '2026-09-20' });
        expect(state.db.tables.data_audit_log[0].changes).toEqual({ order_date: { from: null, to: '2026-09-15' } });
    });

    it('refuses to replace an order date that is already set (409, nothing written)', async () => {
        stored().order_date = '2026-08-01';
        const response = await patch({ order_date: '2026-09-15' });
        expect(response.status).toBe(409);
        expect((await response.json()).error).toContain('солихгүй');
        expect(contractWrites()).toEqual([]);
        expect(state.db.tables.data_audit_log).toEqual([]);
    });

    it('treats a retry of the same date as done (no second write, no second audit row)', async () => {
        expect((await patch({ order_date: '2026-09-15' })).status).toBe(200);
        const writes = contractWrites().length;
        const retry = await patch({ order_date: '2026-09-15' });
        expect(retry.status).toBe(200);
        expect(await retry.json()).toMatchObject({ replayed: true, contract: { id: 'c-1', order_date: '2026-09-15' } });
        expect(contractWrites()).toHaveLength(writes);
        expect(state.db.tables.data_audit_log).toHaveLength(1);
        // Өөр огноо эсвэл өөр талбартай бол давталт биш.
        expect((await patch({ order_date: '2026-09-16' })).status).toBe(409);
        expect((await patch({ order_date: '2026-09-15', overdue_days: 3 })).status).toBe(409);
        expect(stored().order_date).toBe('2026-09-15');
        expect(stored().overdue_days ?? null).toBeNull();
    });

    it('checks «not in the future» against the Ulaanbaatar day even on a UTC server', async () => {
        const original = process.env.TZ;
        process.env.TZ = 'UTC';
        vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-22T17:30:00Z') }); // УБ 2026-10-23 01:30
        try {
            expect((await patch({ order_date: '2026-10-24' })).status).toBe(400);
            expect((await patch({ order_date: '2026-10-23' })).status).toBe(200);
        } finally {
            vi.useRealTimers();
            if (original === undefined) delete process.env.TZ;
            else process.env.TZ = original;
        }
    });

    it('answers 409 when a colleague set the date between the read and the write', async () => {
        const from = state.db.from;
        let reads = 0;
        state.db.from = (table: string) => {
            const query = from(table);
            if (table !== 'property_contracts') return query;
            const maybeSingle = query.maybeSingle;
            query.maybeSingle = async () => {
                const result = await maybeSingle();
                if (++reads === 1) stored().order_date = '2026-09-01';
                return result;
            };
            return query;
        };
        expect((await patch({ order_date: '2026-09-15' })).status).toBe(409);
        expect(stored().order_date).toBe('2026-09-01');
        expect(state.db.tables.data_audit_log).toEqual([]);
    });

    it.each([
        ['a future day', { order_date: '2999-01-01' }],
        ['an impossible day', { order_date: '2026-02-30' }],
        ['a timestamp', { order_date: '2026-09-15T10:00:00Z' }],
        ['clearing it', { order_date: null }],
    ])('rejects %s', async (_label, body) => {
        expect((await patch(body)).status).toBe(400);
        expect(contractWrites()).toEqual([]);
    });

    it('accepts today in Ulaanbaatar', async () => {
        expect((await patch({ order_date: ubDateStr() })).status).toBe(200);
    });

    it('lets a restricted manager date only their own contract', async () => {
        state.scope = { projectIds: ['p-1'], managerName: 'Сараа' };
        expect((await patch({ order_date: '2026-09-15' })).status).toBe(404);
        state.scope = { projectIds: ['p-1'], managerName: 'Номин' };
        expect((await patch({ order_date: '2026-09-15' })).status).toBe(200);
    });
});
