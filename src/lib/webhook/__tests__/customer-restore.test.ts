// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ customers: [] as Row[], updates: [] as Row[] }));

vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/facebook/messenger', () => ({ appsecretProof: () => null }));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: (value: string | null) => value }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: () => {
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    const first = () => state.customers.find((row) => filters.every((filter) => filter(row))) ?? null;
    const query = {
        select: () => query,
        insert: () => query,
        update: (values: Row) => { patch = values; return query; },
        eq: (key: string, value: unknown) => {
            filters.push((row) => row[key] === value);
            if (patch && key === 'id') { const row = first(); if (row) { Object.assign(row, patch); state.updates.push({ id: value, ...patch }); } }
            return query;
        },
        order: () => query,
        limit: () => query,
        single: async () => ({ data: first(), error: null }),
        maybeSingle: async () => ({ data: first(), error: null }),
        then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    return query;
} }) }));

import { getOrCreateCustomer, getOrCreateInstagramCustomer } from '../WebhookService';

beforeEach(() => {
    state.updates = [];
    state.customers = [
        { id: 'fb-customer', shop_id: 'shop-1', facebook_id: 'psid-1', name: 'Бат', deleted_at: '2026-10-01T00:00:00Z' },
        { id: 'ig-customer', shop_id: 'shop-1', instagram_id: 'igsid-1', name: 'Сараа', deleted_at: null },
    ];
});

describe('incoming messages from removed customers', () => {
    it('brings a soft-deleted customer back instead of hiding the new conversation', async () => {
        const customer = await getOrCreateCustomer('shop-1', 'psid-1', 'page-token');
        expect(customer.id).toBe('fb-customer');
        expect(state.updates).toEqual([{ id: 'fb-customer', deleted_at: null }]);
        expect(state.customers[0].deleted_at).toBeNull();
    });

    it('leaves active customers untouched', async () => {
        await getOrCreateInstagramCustomer('shop-1', 'igsid-1', 'ig-token');
        expect(state.updates).toEqual([]);
    });
});
