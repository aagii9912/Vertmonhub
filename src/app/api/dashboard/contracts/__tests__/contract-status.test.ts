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
import { PATCH } from '../[id]/route';

const patch = (body: unknown) => PATCH(new NextRequest('http://localhost/api/dashboard/contracts/c-1', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'c-1' }) });
const stored = () => state.db.tables.property_contracts.find((row) => row.id === 'c-1')!;
const contractWrites = () => state.db.writes.filter((write) => write.table === 'property_contracts');
const row = (id: string, fields: Record<string, unknown> = {}) => ({
    id, shop_id: 'shop-1', deleted_at: null, product_type: 'residential', unit_label: 'Б1-25', sales_manager: 'Номин', contract_status: 'active', ...fields,
});

beforeEach(() => {
    state.scope = { projectIds: null, managerName: null };
    state.db = createMemoryDb({
        property_contracts: [row('c-1')],
        payment_schedules: [{ id: 'pay-1', shop_id: 'shop-1', contract_id: 'c-1', amount: 1000, paid_amount: 500, status: 'partial' }],
        property_units: [{ id: 'u-1', shop_id: 'shop-1', code: 'Б1-25', category: 'residential', status: 'reserved' }],
        data_audit_log: [],
    });
});

describe('PATCH /api/dashboard/contracts/[id] — «Цуцлах» / «Сэргээх»', () => {
    it('cancels with an audit row and leaves payments and the unit untouched', async () => {
        const response = await patch({ contract_status: 'cancelled' });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ contract: { id: 'c-1', contract_status: 'cancelled' } });
        expect(stored().contract_status).toBe('cancelled');
        expect(state.db.tables.data_audit_log).toEqual([expect.objectContaining({
            shop_id: 'shop-1', actor_id: 'user-1', entity: 'contract', entity_id: 'c-1', action: 'update',
            changes: { contract_status: { from: 'active', to: 'cancelled' } },
        })]);
        expect(state.db.writes.map((write) => write.table).filter((table) => table !== 'data_audit_log')).toEqual(['property_contracts']);
        expect(state.db.tables.payment_schedules[0]).toMatchObject({ amount: 1000, paid_amount: 500, status: 'partial' });
        expect(state.db.tables.property_units[0].status).toBe('reserved');
    });

    it('treats a repeated cancel as done without a second audit row', async () => {
        expect((await patch({ contract_status: 'cancelled' })).status).toBe(200);
        expect((await patch({ contract_status: 'cancelled' })).status).toBe(200);
        expect(state.db.tables.data_audit_log).toHaveLength(1);
    });

    it('restores a cancelled contract when no other live contract holds the unit', async () => {
        stored().contract_status = 'cancelled';
        state.db.tables.property_contracts.push(
            row('c-cancelled', { contract_status: 'cancelled' }),
            row('c-deleted', { deleted_at: '2026-10-01T00:00:00Z' }),
            row('c-parking', { product_type: 'parking' }),
            row('c-other-unit', { unit_label: 'Б1-26' }),
            row('c-other-shop', { shop_id: 'shop-2' }),
        );
        const response = await patch({ contract_status: 'active' });
        expect(response.status).toBe(200);
        expect(stored().contract_status).toBe('active');
        expect(state.db.tables.data_audit_log.at(-1)).toMatchObject({ changes: { contract_status: { from: 'cancelled', to: 'active' } } });
    });

    it.each([
        ['active', {}],
        ['closed', { contract_status: 'closed' }],
        ['without a status', { contract_status: null }],
    ])('refuses to restore when another %s contract holds the same unit (409, nothing written)', async (_label, fields) => {
        stored().contract_status = 'cancelled';
        state.db.tables.property_contracts.push(row('c-resold', fields));
        const response = await patch({ contract_status: 'active' });
        expect(response.status).toBe(409);
        expect((await response.json()).error).toContain('«Б1-25» байранд өөр идэвхтэй гэрээ байна');
        expect(stored().contract_status).toBe('cancelled');
        expect(contractWrites()).toEqual([]);
        expect(state.db.tables.data_audit_log).toEqual([]);
    });

    it.each([
        ['the live contract carries extra codes after a comma', 'Б1-25', 'Б1-25, P-12'],
        ['the cancelled contract carries extra codes after a comma', 'Б1-25, P-12', 'Б1-25'],
        ['only the spacing differs', 'Б1-25 ,P-3', ' Б1-25'],
    ])('matches the unit like the floor map when %s (409)', async (_label, cancelledLabel, liveLabel) => {
        stored().contract_status = 'cancelled';
        stored().unit_label = cancelledLabel;
        state.db.tables.property_contracts.push(row('c-resold', { unit_label: liveLabel }));
        const response = await patch({ contract_status: 'active' });
        expect(response.status).toBe(409);
        expect((await response.json()).error).toContain('«Б1-25» байранд өөр идэвхтэй гэрээ байна');
        expect(contractWrites()).toEqual([]);
    });

    it('does not mistake a longer code that starts the same for the unit', async () => {
        stored().contract_status = 'cancelled';
        state.db.tables.property_contracts.push(row('c-250', { unit_label: 'Б1-250' }), row('c-other-block', { unit_label: 'ББ1-25' }));
        expect((await patch({ contract_status: 'active' })).status).toBe(200);
        expect(stored().contract_status).toBe('active');
    });

    it('writes the restore only while the contract is still cancelled (changed in between → 409, nothing written)', async () => {
        stored().contract_status = 'cancelled';
        // Байрны шалгалтын дараа, бичихээс өмнө өөр хүн гэрээг өөрчилсөн мэт.
        const from = state.db.from;
        state.db.from = (table: string) => {
            const query = from(table);
            const ilike = query.ilike;
            query.ilike = (...args: unknown[]) => { stored().contract_status = 'closed'; return ilike(...args); };
            return query;
        };
        const response = await patch({ contract_status: 'active' });
        expect(response.status).toBe(409);
        expect((await response.json()).error).toContain('Гэрээ өөрчлөгдсөн байна');
        expect(stored().contract_status).toBe('closed');
        expect(contractWrites()).toEqual([]);
        expect(state.db.tables.data_audit_log).toEqual([]);
    });

    it.each(['closed', 'transferred', null])('cancels only an active contract (%s → 409, nothing written)', async (status) => {
        stored().contract_status = status;
        const response = await patch({ contract_status: 'cancelled' });
        expect(response.status).toBe(409);
        expect((await response.json()).error).toContain('Зөвхөн идэвхтэй гэрээг цуцална');
        expect(stored().contract_status).toBe(status);
        expect(contractWrites()).toEqual([]);
        expect(state.db.tables.data_audit_log).toEqual([]);
    });

    it('writes the cancel only while the contract is still active (closed in between → 409, nothing written)', async () => {
        // Уншсаны дараа, бичихээс өмнө HUB импорт гэрээг хаасан мэт: хоёр дахь property_contracts хандалт = бичилт.
        const from = state.db.from;
        let calls = 0;
        state.db.from = (table: string) => {
            if (table === 'property_contracts' && ++calls === 2) stored().contract_status = 'closed';
            return from(table);
        };
        const response = await patch({ contract_status: 'cancelled' });
        expect(response.status).toBe(409);
        expect((await response.json()).error).toContain('Гэрээ өөрчлөгдсөн байна');
        expect(stored().contract_status).toBe('closed');
        expect(contractWrites()).toEqual([]);
        expect(state.db.tables.data_audit_log).toEqual([]);
    });

    it('does not check the unit when cancelling or for a contract without a unit', async () => {
        state.db.tables.property_contracts.push(row('c-resold'));
        expect((await patch({ contract_status: 'cancelled' })).status).toBe(200);
        stored().unit_label = null;
        expect((await patch({ contract_status: 'active' })).status).toBe(200);
        expect(stored().contract_status).toBe('active');
    });

    it('lets a restricted manager cancel only an own contract', async () => {
        state.scope = { projectIds: ['p-1'], managerName: 'Сараа' };
        expect((await patch({ contract_status: 'cancelled' })).status).toBe(404);
        expect(stored().contract_status).toBe('active');
        state.scope = { projectIds: ['p-1'], managerName: 'Номин' };
        expect((await patch({ contract_status: 'cancelled' })).status).toBe(200);
    });

    it.each(['transferred', 'deleted', ''])('rejects the status «%s» (allow-list)', async (status) => {
        expect((await patch({ contract_status: status })).status).toBe(400);
        expect(contractWrites()).toEqual([]);
    });
});
