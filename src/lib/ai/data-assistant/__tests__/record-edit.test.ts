import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, recordAudit } = vi.hoisted(() => ({ from: vi.fn(), recordAudit: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from }) }));
vi.mock('@/lib/services/AuditService', () => ({ recordAudit }));
vi.mock('@/lib/ai/data-assistant/audit', () => ({ logAiAudit: vi.fn() }));
vi.mock('@/lib/sales/manager-identity', () => ({
    resolveManagerIdentity: async () => ({ isManager: false, managerName: null }),
    resolveActiveManagerName: async () => ({ ok: false, status: 400, error: 'Идэвхтэй менежер олдсонгүй' }),
    resolveSalesManagerName: async () => null,
}));

import { executeDataTool, type AssistantPerms } from '../index';

const admin: AssistantPerms = { role: 'admin', canWrite: true, canDelete: true, modules: ['leads', 'customers', 'properties'] };
const P1 = '00000000-0000-4000-8000-000000000001';
const lead = { id: 'lead-1', project_id: P1, customer_name: 'Болд', customer_phone: '99112233', status: 'contacted', sales_manager_name: null, lost_reason: null };
const customer = { id: '00000000-0000-4000-8000-0000000000c1', name: 'Сараа', phone: '88112233', tags: [], facebook_id: null, notes: 'VIP' };
const unit = { id: 'unit-1', code: '201-440', unit_number: '440', block: '201', phase: 'Zoo Garden', status: 'available', rooms: 3, sale_area: 62.5, unit_type: null, model: 'A2', window_view: null, sales_channel: null, sales_manager: null };

function query(table: string, data: unknown, error: unknown = null) {
    const result = { data, error };
    const chain = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue(result),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    from.mockImplementationOnce((name: string) => { expect(name).toBe(table); return chain; });
    return chain;
}

const run = (tool: string, args: Record<string, unknown>, confirm = false, perms = admin) =>
    executeDataTool(tool, args, 'shop-1', perms, 'user-1', confirm, 'Батаа');

beforeEach(() => {
    from.mockReset();
    recordAudit.mockReset();
    from.mockImplementation((table: string) => { throw new Error(`Unexpected query: ${table}`); });
});

describe('update_lead', () => {
    it('validates before looking up and previews readable changes', async () => {
        expect(await run('update_lead', { customer_name: 'Болд', preferred_rooms: 2.5 })).toHaveProperty('error', expect.stringContaining('өрөө'));
        expect(from).not.toHaveBeenCalled();

        query('leads', [lead]);
        expect(await run('update_lead', { customer_name: 'Болд', preferred_rooms: 3, preferred_type: 'apartment', budget_max: 300000000 })).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'update_lead', args: { lead_id: 'lead-1', preferred_rooms: 3, preferred_type: 'apartment', budget_max: 300000000 } },
            preview: { Лид: 'Болд', Өрөө: 3, Төрөл: 'Орон сууц', 'Дээд төсөв': expect.stringContaining('300') },
        });
    });

    it('applies the shared lead rule on confirmation', async () => {
        query('leads', [lead]);
        query('leads', lead);
        const write = query('leads', { id: lead.id });
        expect(await run('update_lead', { lead_id: lead.id, preferred_rooms: 3 }, true)).toMatchObject({ success: true, leadId: lead.id });
        expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ preferred_rooms: 3 }));
        expect(write.eq).toHaveBeenCalledWith('project_id', P1);
    });

    it('asks which lead when several match', async () => {
        query('leads', [lead, { ...lead, id: 'lead-2', customer_name: 'Болдбаатар' }]);
        expect(await run('update_lead', { customer_name: 'Болд', budget_max: 1 })).toMatchObject({ error: expect.stringContaining('Олон лид'), options: expect.any(Array) });
    });
});

describe('update_customer', () => {
    it('appends notes instead of overwriting and previews the edit', async () => {
        query('customers', [customer]);
        expect(await run('update_customer', { customer_name: 'Сараа', new_phone: '99001122', note: 'Хүүхэдтэй' })).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'update_customer', args: { customer_id: customer.id, new_phone: '99001122', note: 'Хүүхэдтэй' } },
            preview: { Утас: '99001122', 'Тэмдэглэл нэмэх': 'Хүүхэдтэй' },
        });

        query('customers', [customer]);
        const write = query('customers', { ...customer, phone: '99001122' });
        expect(await run('update_customer', { customer_id: customer.id, new_phone: '99001122', note: 'Хүүхэдтэй' }, true)).toMatchObject({ success: true });
        expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ phone: '99001122', notes: 'VIP\nХүүхэдтэй' }));
        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entity: 'customer', action: 'update', actorId: 'user-1' }));
    });

    it('rejects invalid values and never looks up removed customers', async () => {
        expect(await run('update_customer', { customer_name: 'Сараа', email: 'bad' })).toHaveProperty('error');
        expect(from).not.toHaveBeenCalled();
        const lookup = query('customers', []);
        expect(await run('update_customer', { customer_name: 'Сараа', new_name: 'Сараа Б' })).toHaveProperty('error', 'Харилцагч олдсонгүй');
        expect(lookup.is).toHaveBeenCalledWith('deleted_at', null);
    });
});

describe('update_unit', () => {
    it('previews old and new values and writes through the shared unit rule', async () => {
        query('property_units', [unit]);
        expect(await run('update_unit', { code: '201-440', rooms: 2, sale_area: '58.6' })).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'update_unit', args: { unit_id: 'unit-1', rooms: 2, sale_area: 58.6 } },
            preview: { Нэгж: '201-440', 'Өрөөний тоо': '3 → 2', 'Борлуулах талбай': '62.5 → 58.6' },
        });

        query('property_units', [unit]);
        const write = query('property_units', { ...unit, rooms: 2 });
        expect(await run('update_unit', { unit_id: 'unit-1', rooms: 2 }, true)).toMatchObject({ success: true, unit: '201-440' });
        expect(write.update).toHaveBeenCalledWith({ rooms: 2, updated_at: expect.any(String) });
        expect(write.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
    });

    it('does not edit status or structure through update_unit', async () => {
        expect(await run('update_unit', { code: '201-440', status: 'sold', block: '999' })).toHaveProperty('error', expect.stringContaining('Засах талбар алга'));
        expect(from).not.toHaveBeenCalled();
    });
});

describe('permissions', () => {
    it('blocks edit tools without the module or write permission before any read', async () => {
        expect(await run('update_customer', { customer_name: 'Сараа', new_name: 'Б' }, false, { ...admin, modules: ['leads'] })).toHaveProperty('error', expect.stringContaining('customers'));
        expect(await run('update_unit', { code: '201-440', rooms: 2 }, false, { ...admin, canWrite: false })).toHaveProperty('error', expect.stringContaining('бичих'));
        expect(await run('update_lead', { lead_id: 'lead-1', budget_max: 1 }, false, { ...admin, modules: ['customers'] })).toHaveProperty('error', expect.stringContaining('leads'));
        expect(from).not.toHaveBeenCalled();
    });
});
