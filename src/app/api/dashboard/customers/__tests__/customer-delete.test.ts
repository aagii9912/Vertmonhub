// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    denied: false,
    shop: { id: 'shop-1' } as { id: string } | null,
    rows: [] as Row[],
    chats: [] as Row[],
}));

vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => null,
    requireModuleDelete: async () => state.denied ? NextResponse.json({ error: 'Denied' }, { status: 403 }) : null,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => state.shop }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    const matches = () => (table === 'customers' ? state.rows : state.chats).filter((row) => filters.every((filter) => filter(row)));
    const query = {
        select: () => query,
        update: (values: Row) => { patch = values; return query; },
        eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
        is: (key: string, value: unknown) => { filters.push((row) => (row[key] ?? null) === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
        order: () => query,
        limit: () => query,
        maybeSingle: async () => {
            const row = matches()[0] ?? null;
            if (row && patch) Object.assign(row, patch);
            return { data: row, error: null };
        },
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: matches(), error: null }).then(resolve),
    };
    return query;
} }) }));

import { DELETE } from '../[id]/route';
import { GET as listConversations } from '../../conversations/route';

const customerId = '00000000-0000-4000-8000-000000000011';
const call = (id = customerId) => DELETE(new NextRequest(`https://app.example/api/dashboard/customers/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

beforeEach(() => {
    state.denied = false;
    state.shop = { id: 'shop-1' };
    state.rows = [
        { id: customerId, shop_id: 'shop-1', name: 'Бат', deleted_at: null },
        { id: 'other-shop-customer', shop_id: 'shop-2', name: 'Өөр', deleted_at: null },
    ];
    state.chats = [{ id: 'chat-1', shop_id: 'shop-1', customer_id: customerId, message: 'Сайн байна уу', response: null, created_at: '2026-10-04T01:00:00Z' }];
});

describe('customer soft delete', () => {
    it('requires customers delete permission before touching data', async () => {
        state.denied = true;
        expect((await call()).status).toBe(403);
        expect(state.rows[0].deleted_at).toBeNull();
    });

    it('marks the customer deleted inside the caller shop only, keeping chat history', async () => {
        expect((await call()).status).toBe(200);
        expect(state.rows[0].deleted_at).toEqual(expect.any(String));
        expect(state.chats).toHaveLength(1);
        expect((await call('00000000-0000-4000-8000-000000000099')).status).toBe(404);
        expect((await call('not-a-uuid')).status).toBe(400);
        expect((await call()).status).toBe(404); // already deleted
    });

    it('hides a deleted customer conversation from the inbox', async () => {
        expect((await (await listConversations(new NextRequest('https://app.example/api/dashboard/conversations'))).json()).conversations).toHaveLength(1);
        await call();
        expect((await (await listConversations(new NextRequest('https://app.example/api/dashboard/conversations'))).json()).conversations).toHaveLength(0);
    });
});
