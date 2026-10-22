// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { MemoryDb } from '@/test/memory-db';

const { state, gate } = vi.hoisted(() => {
    const state = { db: null as unknown as MemoryDb, granted: ['contracts'] as string[], asked: [] as string[] };
    const gate = async (module: string | string[]) => {
        const modules = Array.isArray(module) ? module : [module];
        state.asked.push(...modules);
        return modules.some(name => state.granted.includes(name)) ? null : new Response(JSON.stringify({ error: 'Эрхгүй' }), { status: 403 });
    };
    return { state, gate };
});

vi.mock('@/lib/auth/require-permission', () => ({ requireModule: gate, requireModuleWrite: gate, requireModuleDelete: gate, requireAnyModule: gate }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { createMemoryDb } from '@/test/memory-db';
import { GET } from '../managers/route';

const get = () => GET(new NextRequest('http://localhost/api/dashboard/contracts/managers'), { params: Promise.resolve({}) });

beforeEach(() => {
    state.granted = ['contracts'];
    state.asked = [];
    state.db = createMemoryDb({
        sales_managers: [
            { shop_id: 'shop-1', name: 'Khongoroo', is_active: true },
            { shop_id: 'shop-1', name: 'Чанцалдулам.Раднаа', is_active: true },
            { shop_id: 'shop-1', name: 'Хуучин', is_active: false },
            { shop_id: 'shop-2', name: 'Гадны', is_active: true },
        ],
        property_contracts: [
            { id: 'c1', shop_id: 'shop-1', sales_manager: 'Хонгорзул.Мөнхгэрэл', deleted_at: null },
            { id: 'c2', shop_id: 'shop-1', sales_manager: 'Хонгорзул.Мөнхгэрэл', deleted_at: null },
            { id: 'c3', shop_id: 'shop-1', sales_manager: 'Чанцалдулам.Раднаа', deleted_at: null },
            { id: 'c4', shop_id: 'shop-1', sales_manager: null, deleted_at: null },
            { id: 'c5', shop_id: 'shop-1', sales_manager: 'Устгасан', deleted_at: '2026-10-01T00:00:00Z' },
            { id: 'c6', shop_id: 'shop-2', sales_manager: 'Гадны гэрээ', deleted_at: null },
        ],
    });
});

describe('GET /api/dashboard/contracts/managers', () => {
    it('lists active roster names and names already on live contracts of this project, without duplicates', async () => {
        const response = await get();
        expect(response.status).toBe(200);
        expect((await response.json()).managers).toEqual([
            { name: 'Хонгорзул.Мөнхгэрэл', roster: false, contracts: 2 },
            { name: 'Чанцалдулам.Раднаа', roster: true, contracts: 1 },
            { name: 'Khongoroo', roster: true, contracts: 0 },
        ]);
    });

    it('is gated by the contracts module', async () => {
        expect((await get()).status).toBe(200);
        expect(state.asked).toEqual(['contracts']);
        state.granted = ['leads', 'reports', 'dashboard'];
        expect((await get()).status).toBe(403);
    });
});
