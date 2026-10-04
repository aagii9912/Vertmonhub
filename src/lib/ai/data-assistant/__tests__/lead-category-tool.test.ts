// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryDb } from '@/test/memory-db';

const state = vi.hoisted(() => ({ db: null as unknown as MemoryDb }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('../audit', () => ({ logAiAudit: vi.fn() }));

import { createMemoryDb } from '@/test/memory-db';
import { executeDataTool } from '../index';
import { TOOL_CATALOG } from '@/lib/ai/tool-catalog';
import { TOOL_DEFINITIONS } from '../tools';
import { SOURCES } from '@/lib/leads/labels';

const garden = '00000000-0000-4000-8000-000000000010';
const investor = '40000000-0000-4000-8000-000000000001';
const barter = '40000000-0000-4000-8000-000000000002';
const admin = { role: 'admin', canWrite: true, canDelete: true, modules: ['leads', 'reports-leads'] };
const manager = { role: 'sales_manager', canWrite: true, canDelete: false, modules: ['leads'] };
const run = (tool: string, args: Record<string, unknown>, perms: typeof admin = admin, confirm = true) =>
    executeDataTool(tool, args, 'shop', perms, 'user', confirm, 'Батаа');
const lead = (id: string, extra: Record<string, unknown> = {}) => ({
    id, shop_id: 'shop', project_id: garden, customer_name: id, customer_phone: null, status: 'new', source: 'phone',
    sales_manager_name: 'Батаа', category_id: null, deleted_at: null, created_at: '2026-10-01T02:00:00Z', ...extra,
});

beforeEach(() => {
    // functions.ts нь service client-ийг анх хандахад нь cache-лдаг тул нэг db-г хадгалж хүснэгтийг шинэчилнэ.
    const fresh = createMemoryDb({
        user_profiles: [{ id: 'user', full_name: 'Батаа' }],
        sales_managers: [{ shop_id: 'shop', name: 'Батаа', user_id: 'user', is_active: true }, { shop_id: 'shop', name: 'Сараа', user_id: 'other', is_active: true }],
        sales_manager_projects: [{ shop_id: 'shop', manager_name: 'Батаа', project_id: garden }, { shop_id: 'shop', manager_name: 'Сараа', project_id: garden }],
        projects: [{ id: garden, shop_id: 'shop', name: 'Mandala Garden' }],
        lead_categories: [
            { id: investor, shop_id: 'shop', name: 'Хөрөнгө оруулагч', description: 'Дахин зарах', tone: 'success', sort_order: 10, is_active: true },
            { id: barter, shop_id: 'shop', name: 'Бартер', description: null, tone: 'neutral', sort_order: 20, is_active: false },
        ],
        leads: [lead('Болд'), lead('Хуучин', { category_id: barter }), lead('Сараагийн', { sales_manager_name: 'Сараа' })],
        lead_activities: [],
    });
    if (!state.db) state.db = fresh;
    else Object.assign(state.db, { tables: fresh.tables, writes: [], failNext: {} });
});

describe('lead category AI tools', () => {
    it('registers list (read) and set (scoped, auto, never money) tools with matching schemas', () => {
        expect(TOOL_CATALOG.list_lead_categories).toEqual({ kind: 'read', module: ['leads', 'reports-leads'] });
        expect(TOOL_CATALOG.set_lead_category).toMatchObject({ kind: 'write', module: 'leads', scoped: true, auto: 'Ангилал тавих' });
        const schema = (name: string) => TOOL_DEFINITIONS.find((tool) => tool.name === name)!.parameters as { properties: Record<string, { enum?: string[] }>; required?: string[] };
        expect(schema('set_lead_category').required).toEqual(['category']);
        expect(schema('list_leads').properties.source.enum).toEqual(SOURCES);
        expect(schema('list_leads').properties.category).toBeDefined();
        expect(schema('create_lead').properties.category).toBeDefined();
    });

    it('lists the project categories with archived flags for lead readers', async () => {
        const result = await run('list_lead_categories', {}, { ...admin, modules: ['reports-leads'] });
        expect(result.categories).toEqual([
            { name: 'Хөрөнгө оруулагч', description: 'Дахин зарах', archived: false },
            { name: 'Бартер', description: null, archived: true },
        ]);
        expect(await run('list_lead_categories', {}, { ...admin, modules: ['dashboard'] })).toHaveProperty('error');
        state.db.tables.lead_categories = [];
        expect((await run('list_lead_categories', {})).guidance).toContain('бүү зохио');
    });

    it('previews as an auto action, then sets the category by exact name and records the history', async () => {
        expect(await run('set_lead_category', { customer_name: 'Болд', category: 'хөрөнгө оруулагч' }, admin, false))
            .toMatchObject({ requiresConfirmation: true, label: 'Ангилал тавих' });
        expect(state.db.writes).toEqual([]);
        const result = await run('set_lead_category', { customer_name: 'Болд', category: 'хөрөнгө оруулагч' });
        expect(result).toMatchObject({ success: true, message: '«Болд» лидийг «Хөрөнгө оруулагч» ангилалд орууллаа.' });
        expect(state.db.tables.leads.find((row) => row.id === 'Болд')?.category_id).toBe(investor);
        expect(state.db.tables.lead_activities).toEqual([expect.objectContaining({
            lead_id: 'Болд', type: 'system', content: 'Ангилал: Ангилалгүй → Хөрөнгө оруулагч', created_by: 'user', created_by_name: 'Батаа',
            meta: expect.objectContaining({ field: 'category', from: null, to: investor }),
        })]);
        // Ижил ангилал — бичилтгүй.
        const writes = state.db.writes.length;
        expect(await run('set_lead_category', { customer_name: 'Болд', category: 'Хөрөнгө оруулагч' })).toMatchObject({ unchanged: true });
        expect(state.db.writes).toHaveLength(writes);
    });

    it('never invents a category: unknown or newly archived names return the options, clearing works', async () => {
        const unknown = await run('set_lead_category', { customer_name: 'Болд', category: 'VIP' });
        expect(unknown.error).toContain('Боломжтой ангилал: Хөрөнгө оруулагч');
        expect(await run('set_lead_category', { customer_name: 'Болд', category: 'Бартер' })).toHaveProperty('error', expect.stringContaining('архивлагдсан'));
        expect(state.db.writes).toEqual([]);
        expect(await run('set_lead_category', { customer_name: 'Хуучин', category: 'Ангилалгүй' })).toMatchObject({ success: true });
        expect(state.db.tables.leads.find((row) => row.id === 'Хуучин')?.category_id).toBeNull();
        expect(state.db.tables.lead_activities.at(-1)).toMatchObject({ content: 'Ангилал: Бартер → Ангилалгүй' });
    });

    it('keeps a sales manager inside their own leads', async () => {
        expect(await run('set_lead_category', { customer_name: 'Сараагийн', category: 'Хөрөнгө оруулагч' }, manager)).toEqual({ error: 'Лид олдсонгүй' });
        expect(await run('set_lead_category', { customer_name: 'Болд', category: 'Хөрөнгө оруулагч' }, manager)).toMatchObject({ success: true });
        expect(await run('set_lead_category', { customer_name: 'Болд', category: 'Хөрөнгө оруулагч' }, { ...manager, canWrite: false })).toHaveProperty('error');
    });

    it('filters and labels leads by category in list_leads', async () => {
        state.db.tables.leads[0].category_id = investor;
        const byName = await run('list_leads', { category: 'ХӨРӨНГӨ ОРУУЛАГЧ' });
        expect(byName.map((row: { name: string; category: string }) => [row.name, row.category])).toEqual([['Болд', 'Хөрөнгө оруулагч']]);
        expect((await run('list_leads', { category: 'бартер' })).map((row: { name: string }) => row.name)).toEqual(['Хуучин']);
        expect((await run('list_leads', { category: 'Ангилалгүй' })).map((row: { name: string; category: string }) => [row.name, row.category])).toEqual([['Сараагийн', 'Ангилалгүй']]);
        expect(await run('list_leads', { category: 'VIP' })).toHaveProperty('error', expect.stringContaining('Ангилал олдсонгүй'));
    });

    it('creates a lead with an exact category and shows it in the preview', async () => {
        const args = { project_id: garden, customer_name: 'Шинэ', category: 'хөрөнгө оруулагч' };
        const preview = await run('create_lead', args, admin, false);
        expect(preview).toMatchObject({ requiresConfirmation: true, preview: { Ангилал: 'Хөрөнгө оруулагч' } });
        expect(await run('create_lead', { ...args, category: 'Таамаг' }, admin, false)).toHaveProperty('error', expect.stringContaining('Ангилал олдсонгүй'));
        expect(await run('create_lead', args)).toMatchObject({ success: true });
        expect(state.db.tables.leads.find((row) => row.customer_name === 'Шинэ')).toMatchObject({ category_id: investor, project_id: garden });
        expect((await run('create_lead', { project_id: garden, customer_name: 'Ангилалгүй хүн' }, admin, false)).preview).toMatchObject({ Ангилал: 'Ангилалгүй' });
    });
});
