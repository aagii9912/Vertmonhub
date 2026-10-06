import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

const state = vi.hoisted(() => ({
    scope: vi.fn(),
    database: vi.fn(),
    from: vi.fn(),
    queries: [] as Array<{ table: string; operation: string; filters: Record<string, unknown> }>,
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: state.database }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: vi.fn().mockResolvedValue({ id: 'shop' }), getUserId: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModuleWrite: vi.fn().mockResolvedValue(null), resolvePermissions: vi.fn() }));
vi.mock('@/lib/sales/project-scope', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/sales/project-scope')>(), resolveSalesProjectScope: state.scope,
}));
vi.mock('@/lib/services/CustomerScoringService', () => ({ recomputeCustomerScore: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/ai/data-assistant/audit', () => ({ logAiAudit: vi.fn().mockResolvedValue(undefined) }));

import { mergeCustomers } from '@/lib/services/CustomerOps';
import { mergeCustomersTool } from '@/lib/ai/data-assistant/actions2';
import { executeDataTool } from '@/lib/ai/data-assistant';
import { POST } from '@/app/api/dashboard/customers/merge/route';
import { ProjectScopeError, UNRESTRICTED_SALES_SCOPE } from '@/lib/sales/project-scope';

const primaryId = '00000000-0000-4000-8000-000000000001';
const duplicateId = '00000000-0000-4000-8000-000000000002';
const restricted = { projectIds: ['project'], managerName: 'Манда' };
const customers = [{ id: primaryId, name: 'Primary', tags: [] }, { id: duplicateId, name: 'Duplicate', tags: [] }];

function database() {
    state.from.mockImplementation((table: string) => {
        const record = { table, operation: 'select', filters: {} as Record<string, unknown> };
        state.queries.push(record);
        const result = () => ({
            data: table === 'customers' && record.operation === 'select'
                ? customers.filter(customer => !record.filters.id || customer.id === record.filters.id) : null,
            error: null,
        });
        const query = {
            select: () => query,
            eq: (column: string, value: unknown) => { record.filters[column] = value; return query; },
            is: (column: string, value: unknown) => { record.filters[column] = value; return query; },
            in: () => query,
            update: () => { record.operation = 'update'; return query; },
            delete: () => { record.operation = 'delete'; return query; },
            limit: () => query,
            single: async () => ({ data: customers[0], error: null }),
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return query;
    });
    return { from: state.from } as unknown as SupabaseClient;
}

beforeEach(() => {
    vi.clearAllMocks();
    state.queries = [];
    state.scope.mockResolvedValue(restricted);
    state.database.mockReturnValue(database());
});

describe('customer merge preserves lead ownership', () => {
    it('direct service callers cannot repoint another manager’s leads when scope is restricted', async () => {
        expect(await mergeCustomers(database(), 'shop', primaryId, duplicateId, restricted)).toMatchObject({ status: 403 });
        expect(state.from).not.toHaveBeenCalled();
    });

    it('omitting service scope resolves the current actor instead of granting organization access', async () => {
        expect(await mergeCustomers(database(), 'shop', primaryId, duplicateId)).toMatchObject({ status: 403 });
        expect(state.scope).toHaveBeenCalledWith(expect.anything(), 'shop');
        expect(state.from).not.toHaveBeenCalled();
    });

    it('denies the customer API before any child table is repointed', async () => {
        const response = await POST(new NextRequest('http://localhost/api/dashboard/customers/merge', {
            method: 'POST', body: JSON.stringify({ primaryId, duplicateId }),
        }));
        expect(response.status).toBe(403);
        expect(state.from).not.toHaveBeenCalled();
    });

    it('AI preview and confirmed execution deny restricted managers before customer lookup', async () => {
        for (const confirm of [false, true]) {
            expect(await mergeCustomersTool('shop', { primary_id: primaryId, duplicate_id: duplicateId }, confirm, restricted)).toHaveProperty('error');
        }
        expect(state.from).not.toHaveBeenCalled();
    });

    it('AI direct calls also resolve scope when the executor did not provide it', async () => {
        expect(await mergeCustomersTool('shop', { primary_id: primaryId, duplicate_id: duplicateId }, true)).toHaveProperty('error');
        expect(state.scope).toHaveBeenCalledWith(expect.anything(), 'shop');
        expect(state.from).not.toHaveBeenCalled();
    });

    it('AI executor resolves the trusted actor before passing scope to customer merge', async () => {
        const result = await executeDataTool('merge_customers', { primary_id: primaryId, duplicate_id: duplicateId }, 'shop', {
            role: 'sales_manager', canWrite: true, canDelete: true, modules: ['customers'],
        }, 'actor', true);
        expect(result).toHaveProperty('error');
        expect(state.scope).toHaveBeenCalledWith(expect.anything(), 'shop', { userId: 'actor', role: 'sales_manager' });
        expect(state.from).not.toHaveBeenCalled();
    });

    it('organization roles retain merging and every child update stays in the authenticated shop', async () => {
        const result = await mergeCustomers(database(), 'shop', primaryId, duplicateId, UNRESTRICTED_SALES_SCOPE);
        expect(result).toHaveProperty('merged');
        const leadUpdate = state.queries.find(query => query.table === 'leads');
        expect(leadUpdate).toMatchObject({ operation: 'update', filters: { shop_id: 'shop', customer_id: duplicateId } });
        expect(state.scope).not.toHaveBeenCalled();
    });

    it('repoints contract holder history to the primary before the duplicate is deleted', async () => {
        await mergeCustomers(database(), 'shop', primaryId, duplicateId, UNRESTRICTED_SALES_SCOPE);
        const relinks = state.queries.filter(query => query.table === 'contract_transfers');
        expect(relinks).toEqual([
            { table: 'contract_transfers', operation: 'update', filters: { shop_id: 'shop', from_customer_id: duplicateId } },
            { table: 'contract_transfers', operation: 'update', filters: { shop_id: 'shop', to_customer_id: duplicateId } },
        ]);
        const deleteIndex = state.queries.findIndex(query => query.table === 'customers' && query.operation === 'delete');
        expect(deleteIndex).toBeGreaterThan(state.queries.lastIndexOf(relinks[1]));
    });

    it('organization AI calls retain confirmation previews', async () => {
        expect(await mergeCustomersTool('shop', { primary_id: primaryId, duplicate_id: duplicateId }, false, UNRESTRICTED_SALES_SCOPE)).toMatchObject({ requiresConfirmation: true });
        expect(state.queries.some(query => query.operation !== 'select')).toBe(false);
    });

    it('scope lookup failures keep their error status at the API boundary', async () => {
        state.scope.mockRejectedValue(new ProjectScopeError(503, 'Scope unavailable'));
        const response = await POST(new NextRequest('http://localhost/api/dashboard/customers/merge', {
            method: 'POST', body: JSON.stringify({ primaryId, duplicateId }),
        }));
        expect(response.status).toBe(503);
        expect(state.from).not.toHaveBeenCalled();
    });
});
