// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readSheetRows } from '@/lib/utils/xlsx';
import type { MemoryDb } from '@/test/memory-db';

const state = vi.hoisted(() => ({ db: null as unknown as MemoryDb, scope: { projectIds: null as string[] | null, managerName: null as string | null } }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: async () => null, resolvePermissions: async () => null }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/sales/project-scope', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/sales/project-scope')>(),
    resolveSalesProjectScope: async () => state.scope,
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));

import { createMemoryDb } from '@/test/memory-db';
import { GET } from '../route';

const lead = (id: string, extra: Record<string, unknown>) => ({
    id, shop_id: 'shop-1', project_id: 'p1', deleted_at: null, status: 'new', source: 'phone', customer_name: id,
    sales_manager_name: 'Манда', created_at: '2026-10-01T02:00:00Z', category_id: null, ...extra,
});

beforeEach(() => {
    state.scope = { projectIds: null, managerName: null };
    state.db = createMemoryDb({
        leads: [
            lead('Бат', { category_id: 'investor' }),
            lead('Сараа', { category_id: 'barter' }),
            lead('Дорж', {}),
            lead('Хамтрагчийн', { sales_manager_name: 'Хамтрагч', category_id: 'investor' }),
        ],
        lead_categories: [
            { id: 'investor', shop_id: 'shop-1', name: 'Хөрөнгө оруулагч', tone: 'success', sort_order: 10, is_active: true },
            { id: 'barter', shop_id: 'shop-1', name: 'Бартер', tone: 'neutral', sort_order: 20, is_active: false },
        ],
    });
});

async function exportLeads() {
    const response = await GET(new NextRequest('http://localhost/api/dashboard/export/excel?type=leads'));
    return { response, rows: response.status === 200 ? await readSheetRows(Buffer.from(await response.arrayBuffer())) : [] };
}

describe('leads Excel export', () => {
    it('adds the lead category column, marking archived and uncategorized leads', async () => {
        const { response, rows } = await exportLeads();
        expect(response.status).toBe(200);
        const byName = Object.fromEntries(rows.map((row) => [row['Нэр'], row['Ангилал']]));
        expect(byName).toEqual({ 'Бат': 'Хөрөнгө оруулагч', 'Сараа': 'Бартер (архив)', 'Дорж': 'Ангилалгүй', 'Хамтрагчийн': 'Хөрөнгө оруулагч' });
        expect(Object.keys(rows[0])).toEqual(expect.arrayContaining(['Эх сурвалж', 'Ангилал', 'Төлөв']));
    });

    it('keeps the personal lead scope and fails instead of exporting without categories', async () => {
        state.scope = { projectIds: ['p1'], managerName: 'Манда' };
        expect((await exportLeads()).rows.map((row) => row['Нэр']).sort()).toEqual(['Бат', 'Дорж', 'Сараа']);
        state.db.failNext.lead_categories = { code: '57014', message: 'timeout' };
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect((await exportLeads()).response.status).toBe(500);
    });
});
