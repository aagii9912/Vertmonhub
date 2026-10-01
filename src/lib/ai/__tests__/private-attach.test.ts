// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { privateAttachmentUrl } from '../private-attachments';

const state = vi.hoisted(() => ({
    links: [] as Array<{ entity_type: string }>,
    metadataError: null as Error | null,
    insertError: null as Error | null,
    scopeReadError: null as Error | null,
    queries: [] as Array<{ table: string; filters: Array<[string, unknown]>; active: boolean; operation: string; payload?: unknown }>,
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));
vi.mock('@/lib/ai/data-assistant/audit', () => ({ logAiAudit: async () => {} }));

const db = {
    from: vi.fn((table: string) => {
        const record: typeof state.queries[number] = { table, filters: [], active: false, operation: 'select' };
        state.queries.push(record);
        const result = (single = false) => {
            if (table === 'ai_attachments') return { data: state.links, error: record.operation === 'insert' ? state.insertError : state.metadataError };
            const scopeRows: Record<string, Array<Record<string, unknown>>> = {
                user_profiles: [{ id: userId, full_name: 'Fixture manager' }],
                sales_managers: [{ shop_id: shopId, name: 'Fixture manager', user_id: userId, is_active: true }],
                sales_manager_projects: [{ shop_id: shopId, manager_name: 'Fixture manager', project_id: projectId }],
            };
            if (Object.hasOwn(scopeRows, table)) {
                const rows = scopeRows[table].filter(row => record.filters.every(([field, value]) => row[field] === value));
                return { data: single ? rows[0] || null : rows, error: state.scopeReadError };
            }
            if (table === 'leads') {
                const rows = [{ id: 'entity-1', shop_id: shopId, project_id: projectId, sales_manager_name: 'Fixture manager', customer_name: 'Synthetic customer' }]
                    .filter(row => record.filters.every(([field, value]) => Array.isArray(value) ? value.includes(row[field as keyof typeof row]) : row[field as keyof typeof row] === value));
                return { data: single ? rows[0] || null : rows, error: null };
            }
            if (single) return { data: { images: ['https://public.example/fixture.jpg'] }, error: null };
            return { data: [{ id: 'entity-1', name: 'Synthetic property', contract_number: 'SYNTHETIC-001', customer_name: 'Synthetic customer' }], error: null };
        };
        const query = {
            select: () => query,
            eq: (field: string, value: unknown) => { record.filters.push([field, value]); return query; },
            in: (field: string, values: string[]) => { record.filters.push([field, values]); return query; },
            is: (field: string, value: unknown) => { record.active = field === 'deleted_at' && value === null; return query; },
            ilike: () => query,
            order: () => query,
            range: () => query,
            insert: (payload: unknown) => { record.operation = 'insert'; record.payload = payload; return query; },
            update: (payload: unknown) => { record.operation = 'update'; record.payload = payload; return query; },
            single: async () => result(true),
            maybeSingle: async () => result(true),
            then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return query;
    }),
};

import { attachFile } from '../data-assistant/functions';
import { executeDataTool } from '../data-assistant';

const shopId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const otherId = '10000000-0000-4000-8000-000000000003';
const fileId = '10000000-0000-4000-8000-000000000004';
const projectId = '20000000-0000-4000-8000-000000000001';
const url = privateAttachmentUrl(`${shopId}/${userId}/${fileId}.png`);
const args = { entity_type: 'property', entity_id: 'entity-1', file_url: url, file_name: 'fixture.png', mime_type: 'image/png' };
const perms = { role: 'sales_manager', modules: ['properties', 'ai-assistant'], canWrite: true, canDelete: false };
beforeEach(() => {
    vi.clearAllMocks(); state.links = []; state.metadataError = null; state.insertError = null; state.scopeReadError = null; state.queries = [];
});

describe('private attach_file entity flow', () => {
    it('passes the authenticated actor and permissions through the real AI executor', async () => {
        const result = await executeDataTool('attach_file', args, shopId, perms, userId, true, 'Fixture manager');
        expect(result).toHaveProperty('success', true);
        const inserted = state.queries.find(query => query.table === 'ai_attachments' && query.operation === 'insert');
        expect(inserted?.payload).toMatchObject({ shop_id: shopId, entity_type: 'property', entity_id: 'entity-1', url, uploaded_by: 'Fixture manager' });
    });

    it('real AI execution resolves the actor roster/project scope before attaching to their assigned lead', async () => {
        const leadArgs = { ...args, entity_type: 'lead' };
        const leadPerms = { ...perms, modules: ['leads', 'ai-assistant'] };
        const result = await executeDataTool('attach_file', leadArgs, shopId, leadPerms, userId, true, 'Fixture manager');
        expect(result).toHaveProperty('success', true);
        expect(state.queries.find(query => query.table === 'ai_attachments' && query.operation === 'insert')?.payload)
            .toMatchObject({ entity_type: 'lead', entity_id: 'entity-1', shop_id: shopId });
        expect(state.queries.find(query => query.table === 'user_profiles')?.filters).toEqual([['id', userId]]);
        expect(state.queries.find(query => query.table === 'sales_managers')?.filters).toEqual([['shop_id', shopId]]);
        expect(state.queries.find(query => query.table === 'sales_manager_projects')?.filters).toEqual([['shop_id', shopId], ['manager_name', 'Fixture manager']]);
        expect(state.queries.find(query => query.table === 'leads')?.filters).toEqual([
            ['shop_id', shopId], ['project_id', [projectId]], ['sales_manager_name', 'Fixture manager'], ['id', 'entity-1'],
        ]);
    });

    it('real AI execution denies unreadable project scope before attachment or entity access', async () => {
        state.scopeReadError = new Error('Synthetic scope error');
        const result = await executeDataTool('attach_file', { ...args, entity_type: 'lead' }, shopId,
            { ...perms, modules: ['leads', 'ai-assistant'] }, userId, true, 'Fixture manager');
        expect(result).toHaveProperty('error');
        expect(state.queries.map(query => query.table)).toEqual(['user_profiles', 'sales_managers']);
        expect(state.queries.some(query => query.operation === 'insert')).toBe(false);
    });

    it('stores private property attachment metadata without writing private URLs to public property images', async () => {
        expect(await attachFile(shopId, args, true, 'Fixture manager', userId, perms)).toHaveProperty('success', true);
        const properties = state.queries.filter(query => query.table === 'properties');
        expect(properties).toHaveLength(1);
        expect(properties[0]).toMatchObject({ operation: 'select', active: true });
        expect(state.queries.some(query => query.operation === 'update')).toBe(false);
    });

    it('returns a confirmation preview without inserting metadata', async () => {
        expect(await attachFile(shopId, args, false, '', userId, perms)).toHaveProperty('requiresConfirmation', true);
        expect(state.queries.some(query => query.operation === 'insert')).toBe(false);
    });

    it('checks foreign shops and missing user context before metadata or entity lookup', async () => {
        expect(await attachFile(otherId, args, true, '', userId, perms)).toHaveProperty('error');
        expect(await attachFile(shopId, args, true)).toHaveProperty('error');
        expect(db.from).not.toHaveBeenCalled();
    });

    it('checks the source file module before looking up a newly selected entity', async () => {
        state.links = [{ entity_type: 'contract' }];
        expect(await attachFile(shopId, args, true, '', userId, perms)).toHaveProperty('error');
        expect(state.queries.map(query => query.table)).toEqual(['ai_attachments']);
        expect(state.queries.some(query => query.operation === 'insert')).toBe(false);
    });

    it('denies another member attaching an unlinked upload before entity lookup', async () => {
        expect(await attachFile(shopId, args, true, '', otherId, perms)).toHaveProperty('error');
        expect(state.queries.map(query => query.table)).toEqual(['ai_attachments']);
    });

    it('fails closed on unreadable metadata before entity lookup or writes', async () => {
        state.metadataError = new Error('Synthetic metadata error');
        await expect(attachFile(shopId, args, true, '', userId, perms)).rejects.toThrow('Synthetic metadata error');
        expect(state.queries.map(query => query.table)).toEqual(['ai_attachments']);
    });

    it('resolves only active same-shop contracts before saving their attachment metadata', async () => {
        const contractArgs = { ...args, entity_type: 'contract' };
        expect(await attachFile(shopId, contractArgs, true, '', userId, { ...perms, modules: ['ai-assistant', 'contracts'] })).toHaveProperty('success', true);
        const contract = state.queries.find(query => query.table === 'property_contracts');
        expect(contract).toMatchObject({ active: true, filters: [['shop_id', shopId], ['id', 'entity-1']] });
    });

    it('reports a metadata insert error without changing property images', async () => {
        state.insertError = new Error('Synthetic insert error');
        expect(await attachFile(shopId, args, true, '', userId, perms)).toHaveProperty('error');
        expect(state.queries.some(query => query.operation === 'update')).toBe(false);
    });
});
