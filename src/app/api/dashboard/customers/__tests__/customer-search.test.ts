// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ or: [] as string[] }));

vi.mock('@/lib/auth/require-permission', () => ({ requireModule: async () => null }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1', name: 'Мандала Гарден' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/utils/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: () => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'contains', 'order', 'range']) query[method] = () => query;
    query.or = (filter: string) => { state.or.push(filter); return query; };
    query.then = (resolve: (value: { data: unknown[]; error: null; count: number }) => unknown) =>
        Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
    return query;
} }) }));

import { GET } from '../route';

const search = (term: string) => GET(new NextRequest(`https://app.example/api/dashboard/customers?search=${encodeURIComponent(term)}`));

beforeEach(() => { state.or = []; });

describe('GET /api/dashboard/customers search', () => {
    it('searches name and phone with the plain term', async () => {
        const response = await search('Болд');
        expect(response.status).toBe(200);
        expect(state.or).toEqual(['name.ilike.%Болд%,phone.ilike.%Болд%']);
    });

    it('keeps commas and parentheses from breaking or widening the filter', async () => {
        const response = await search('Болд, (Бат)');
        expect(response.status).toBe(200);
        expect(state.or).toEqual(['name.ilike.%Болд Бат%,phone.ilike.%Болд Бат%']);
    });

    it('skips the filter when nothing searchable is left', async () => {
        await search(' ,() ');
        expect(state.or).toEqual([]);
    });
});
