import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkUpdateLeads, createLead, fetchLeads, processContractAction, updateLeadStatus } from '../functions';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const lead = { id: 'lead-1', customer_name: 'Болд', status: 'contacted', lost_reason: null };

function query(table: string, data: unknown, error: unknown = null) {
    const result = { data, error };
    const chain = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue(result),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    from.mockImplementationOnce((name: string) => { expect(name).toBe(table); return chain; });
    return chain;
}
beforeEach(() => {
    from.mockReset();
    from.mockImplementation((table: string) => { throw new Error(`Unexpected query: ${table}`); });
});

describe('AI lead queues', () => {
    it('uses the same queue predicate, bounds results and includes ownership and exact times', async () => {
        const read = query('leads', [{ ...lead, sales_manager_name: 'Сараа', next_followup_at: '2026-09-13T02:00:00Z', created_at: '2026-09-10T00:00:00Z' }]);
        const result = await fetchLeads('shop-1', { queue: 'overdue', manager_name: 'Сараа', limit: 10000 });
        expect(read.limit).toHaveBeenCalledWith(100);
        expect(read.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(read.eq).toHaveBeenCalledWith('sales_manager_name', 'Сараа');
        expect(read.or).toHaveBeenCalledWith(expect.stringContaining('next_followup_at.lt.'));
        expect(result).toMatchObject([{ sales_manager_name: 'Сараа', next_followup_at: '2026-09-13T02:00:00Z', next_followup: '2026-09-13 10:00' }]);
    });
    it('does not report an empty queue when the database failed', async () => {
        query('leads', null, { message: 'unavailable' });
        expect(await fetchLeads('shop-1', {})).toHaveProperty('error');
    });
    it('rejects arbitrary filter expressions', async () => {
        expect(await fetchLeads('shop-1', { queue: 'status.eq.closed_won' })).toHaveProperty('error');
        expect(from).not.toHaveBeenCalled();
    });
});

describe('AI lead creation ownership', () => {
    it('keeps marketing-created leads unassigned and says so', async () => {
        query('user_profiles', { full_name: 'Маркетинг' });
        query('sales_managers', [{ name: 'Батаа', user_id: 'sales-1', is_active: true }]);
        const insert = query('leads', { id: lead.id, customer_name: lead.customer_name });
        const result = await createLead('shop-1', { customer_name: lead.customer_name }, true, 'Маркетинг', 'marketing-1');
        expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ shop_id: 'shop-1', sales_manager_name: null }));
        expect(result).toHaveProperty('message', expect.stringContaining('хариуцагчгүй'));
        expect(from).toHaveBeenCalledTimes(3);
    });
    it('uses the user-linked active roster name in the original insert', async () => {
        query('user_profiles', { full_name: 'Өөр нэр' });
        query('sales_managers', [{ name: 'Батаа', user_id: 'sales-1', is_active: true }]);
        const insert = query('leads', { id: lead.id, customer_name: lead.customer_name });
        expect(await createLead('shop-1', { customer_name: lead.customer_name }, true, 'Өөр нэр', 'sales-1')).toMatchObject({ success: true });
        expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ sales_manager_name: 'Батаа' }));
        expect(from).toHaveBeenCalledTimes(3); // No later best-effort manager stamp.
    });
    it.each(['closed_won', 'closed_lost'])('rejects closed creation %s before any write', async (status) => {
        expect(await createLead('shop-1', { customer_name: 'Болд', status }, true)).toHaveProperty('error');
        expect(from).not.toHaveBeenCalled();
    });
});

describe('AI individual lead closure', () => {
    it('requires an actual loss reason', async () => {
        query('leads', [lead]);
        expect(await updateLeadStatus('shop-1', { lead_id: lead.id, new_status: 'closed_lost' })).toHaveProperty('error', expect.stringContaining('lost_reason'));
        expect(from).toHaveBeenCalledTimes(1);
    });
    it('keeps the stated loss reason in preview and persists it in the tenant-scoped update', async () => {
        query('leads', [lead]);
        const preview = await updateLeadStatus('shop-1', { lead_id: lead.id, new_status: 'closed_lost', lost_reason: ' Үнэ тохироогүй ' });
        expect(preview).toMatchObject({ action: { args: { lost_reason: 'Үнэ тохироогүй' } } });
        if (!('action' in preview) || !preview.action) throw new Error('Expected preview');
        query('leads', [lead]);
        const update = query('leads', { id: lead.id });
        expect(await updateLeadStatus('shop-1', preview.action.args, true)).toMatchObject({ success: true });
        expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'closed_lost', lost_reason: 'Үнэ тохироогүй' }));
        expect(update.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(update.is).toHaveBeenCalledWith('deleted_at', null);
    });
    it.each([
        { contracts: [] },
        { contracts: [{ contract_number: 'C-1', total_price: 0, contract_status: 'active' }] },
        { contracts: [{ contract_number: 'C-1', total_price: 100, contract_status: 'cancelled' }] },
        { contracts: [{ contract_number: '  ', total_price: 100, contract_status: 'active' }] },
    ])('rejects won for absent, stub or cancelled contract $contracts', async ({ contracts }) => {
        query('leads', [lead]);
        query('property_contracts', contracts);
        expect(await updateLeadStatus('shop-1', { lead_id: lead.id, new_status: 'closed_won' }, true)).toHaveProperty('error');
        expect(from).toHaveBeenCalledTimes(2);
    });
    it('accepts a numbered, positive-value active contract', async () => {
        query('leads', [lead]);
        const contracts = query('property_contracts', [{ contract_number: 'C-1', total_price: '100', contract_status: 'active' }]);
        expect(await updateLeadStatus('shop-1', { lead_id: lead.id, new_status: 'closed_won' })).toHaveProperty('requiresConfirmation', true);
        expect(contracts.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(contracts.eq).toHaveBeenCalledWith('lead_id', lead.id);
    });
    it('does not report success after the lead is deleted between lookup and update', async () => {
        query('leads', [lead]);
        query('leads', null);
        expect(await updateLeadStatus('shop-1', { lead_id: lead.id, new_status: 'offered' }, true)).toHaveProperty('error');
    });
});

describe('bulk and composite lead changes', () => {
    it.each(['closed_won', 'closed_lost'])('blocks bulk terminal status %s before querying', async (status) => {
        expect(await bulkUpdateLeads('shop-1', { from_status: 'new', new_status: status }, true)).toHaveProperty('error');
        expect(from).not.toHaveBeenCalled();
    });
    it('freezes preview IDs instead of rerunning a broad status filter on confirmation', async () => {
        query('leads', [lead]);
        const preview = await bulkUpdateLeads('shop-1', { from_status: 'contacted', new_status: 'offered' });
        expect(preview).toMatchObject({ action: { args: { lead_ids: lead.id, new_status: 'offered' } } });
        if (!('action' in preview) || !preview.action) throw new Error('Expected preview');
        expect(preview.action.args).not.toHaveProperty('from_status');
        const read = query('leads', [lead]);
        const update = query('leads', [{ id: lead.id }]);
        expect(await bulkUpdateLeads('shop-1', preview.action.args, true)).toMatchObject({ success: true, count: 1 });
        expect(read.in).toHaveBeenCalledWith('id', [lead.id]);
        expect(update.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(update.is).toHaveBeenCalledWith('deleted_at', null);
    });
    it('reports a partial bulk write honestly', async () => {
        query('leads', [lead, { ...lead, id: 'lead-2' }]);
        query('leads', [{ id: lead.id }]);
        expect(await bulkUpdateLeads('shop-1', { lead_ids: 'lead-1,lead-2', new_status: 'offered' }, true)).toMatchObject({ partialSuccess: true, error: expect.any(String) });
    });
    it('does not silently truncate a bulk request above 100 leads', async () => {
        query('leads', Array.from({ length: 101 }, (_, i) => ({ ...lead, id: String(i) })));
        expect(await bulkUpdateLeads('shop-1', { from_status: 'new', new_status: 'offered' }, true)).toHaveProperty('error');
        expect(from).toHaveBeenCalledTimes(1);
    });
    it('rejects composite cancellation before mutation when loss reason is missing', async () => {
        query('leads', [lead]);
        expect(await processContractAction('shop-1', { action: 'cancel', lead_id: lead.id }, true)).toHaveProperty('error', expect.stringContaining('lost_reason'));
        expect(from).toHaveBeenCalledTimes(1);
    });
    it('preserves composite cancellation reason in the final preview payload', async () => {
        query('leads', [lead]);
        expect(await processContractAction('shop-1', { action: 'cancel', lead_id: lead.id, lost_reason: 'Худалдан авагч цуцалсан' })).toMatchObject({ action: { args: { lost_reason: 'Худалдан авагч цуцалсан' } } });
    });
});
