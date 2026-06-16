/**
 * AuditService tests — best-effort бичилт, алдааг залгих
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: vi.fn(() => ({
        from: vi.fn(() => ({ insert: insertMock })),
    })),
}));

vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { recordAudit } from '@/lib/services/AuditService';

describe('recordAudit', () => {
    beforeEach(() => vi.clearAllMocks());

    it('inserts an audit row with normalized fields', async () => {
        insertMock.mockResolvedValueOnce({ error: null });

        await recordAudit({
            shopId: 'shop-1',
            actorId: 'user-1',
            entity: 'customer',
            entityId: 'cust-1',
            action: 'create',
            changes: { name: 'A' },
        });

        expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
            shop_id: 'shop-1',
            actor_id: 'user-1',
            entity: 'customer',
            entity_id: 'cust-1',
            action: 'create',
            changes: { name: 'A' },
        }));
    });

    it('defaults missing optional fields to null/empty', async () => {
        insertMock.mockResolvedValueOnce({ error: null });

        await recordAudit({ entity: 'lead', action: 'update' });

        expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
            shop_id: null,
            actor_id: null,
            entity_id: null,
            changes: {},
        }));
    });

    it('does not throw when the insert errors (best-effort)', async () => {
        insertMock.mockResolvedValueOnce({ error: { message: 'boom' } });
        await expect(recordAudit({ entity: 'contract', action: 'delete' })).resolves.toBeUndefined();
    });

    it('does not throw when supabase throws', async () => {
        insertMock.mockRejectedValueOnce(new Error('network'));
        await expect(recordAudit({ entity: 'customer', action: 'create' })).resolves.toBeUndefined();
    });
});
