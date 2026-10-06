import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const { from, recordAudit } = vi.hoisted(() => ({ from: vi.fn(), recordAudit: vi.fn() }));
vi.mock('@/lib/services/AuditService', () => ({ recordAudit }));
vi.mock('@/lib/facebook/messenger', () => ({ sendTextMessage: vi.fn() }));

import { updateCustomerInfo } from '../CustomerOps';

const db = { from } as unknown as SupabaseClient;
const id = '00000000-0000-4000-8000-0000000000c1';

function query(table: string, data: unknown, error: unknown = null) {
    const result = { data, error };
    const chain = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result),
    };
    from.mockImplementationOnce((name: string) => { expect(name).toBe(table); return chain; });
    return chain;
}

beforeEach(() => {
    from.mockReset();
    recordAudit.mockReset();
    from.mockImplementation((table: string) => { throw new Error(`Unexpected query: ${table}`); });
});

describe('customer edit shared by PATCH /customers and the AI', () => {
    it('rejects invalid input and empty edits before writing', async () => {
        expect(await updateCustomerInfo(db, 'shop-1', { id, email: 'not-an-email' }, 'user-1')).toMatchObject({ status: 400 });
        expect(await updateCustomerInfo(db, 'shop-1', { id, name: '' }, 'user-1')).toMatchObject({ status: 400 });
        expect(await updateCustomerInfo(db, 'shop-1', { id }, 'user-1')).toMatchObject({ status: 400, error: 'Засах талбар алга' });
        expect(from).not.toHaveBeenCalled();
    });

    it('updates only an active customer of the shop, normalizes the phone and audits the change', async () => {
        const write = query('customers', { id, name: 'Болд', phone: '9911 2233' });
        const result = await updateCustomerInfo(db, 'shop-1', { id, phone: '9911 2233', email: '', address: 'Хан-Уул' }, 'user-1');
        expect(result).toMatchObject({ customer: { id, name: 'Болд' } });
        expect(write.update).toHaveBeenCalledWith({ phone: '9911 2233', phone_normalized: expect.stringContaining('99112233'), email: null, address: 'Хан-Уул' });
        expect(write.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(write.is).toHaveBeenCalledWith('deleted_at', null);
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ shopId: 'shop-1', actorId: 'user-1', entity: 'customer', entityId: id, action: 'update' }));
    });

    it('reports a removed or foreign customer as not found without auditing', async () => {
        query('customers', null);
        expect(await updateCustomerInfo(db, 'shop-1', { id, name: 'Болд' }, 'user-1')).toMatchObject({ status: 404 });
        query('customers', null, { message: 'write rejected' });
        expect(await updateCustomerInfo(db, 'shop-1', { id, name: 'Болд' }, 'user-1')).toMatchObject({ status: 500 });
        expect(recordAudit).not.toHaveBeenCalled();
    });
});
