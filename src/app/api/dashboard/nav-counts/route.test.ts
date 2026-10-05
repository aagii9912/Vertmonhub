// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    role: 'admin',
    modules: [] as string[],
    tables: {} as Record<string, Row[]>,
    failing: new Set<string>(),
    queried: [] as string[],
}));

const allowed = (module: string) => state.role === 'super_admin' || state.modules.includes(module);
vi.mock('@/lib/auth/require-permission', () => ({
    resolvePermissions: async () => ({ role: state.role, permissions: { modules: state.modules, canWrite: false, canDelete: false } }),
    requireModule: async (module: string) => allowed(module) ? null : NextResponse.json({ error: 'Энэ хэсэгт хандах эрх танд алга' }, { status: 403 }),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }), getUserId: async () => 'user-1' }));
vi.mock('@/lib/sales/project-scope', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/sales/project-scope')>()),
    resolveSalesProjectScope: async () => ({ projectIds: null, managerName: null }),
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    state.queried.push(table);
    const filters: Array<(row: Row) => boolean> = [];
    let head = false;
    let sort: { key: string; ascending: boolean } | null = null;
    let limit = Infinity;
    const read = (row: Row, key: string) => key.split('.').reduce<unknown>((value, part) => (value as Row | null)?.[part], row);
    // chat_history нь `customers!inner(...)` embed-ийг дуурайна (харилцагчгүй мөр хасагдана).
    const source = (): Row[] => table === 'chat_history'
        ? (state.tables.chat_history ?? []).map(chat => ({ ...chat, customers: (state.tables.customers ?? []).find(c => c.id === chat.customer_id) ?? null })).filter(chat => chat.customers)
        : state.tables[table] ?? [];
    const run = () => {
        if (state.failing.has(table)) return { data: null, count: null, error: { message: 'боломжгүй' } };
        let rows = source().filter(row => filters.every(filter => filter(row)));
        if (sort) {
            const { key, ascending } = sort;
            rows = [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
        }
        rows = rows.slice(0, limit);
        return { data: head ? null : rows, count: rows.length, error: null };
    };
    const query = {
        select: (_columns?: string, options?: { head?: boolean }) => { head = !!options?.head; return query; },
        eq: (key: string, value: unknown) => { filters.push(row => read(row, key) === value); return query; },
        is: (key: string, value: unknown) => { filters.push(row => (read(row, key) ?? null) === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(read(row, key))); return query; },
        gte: () => query,
        lt: () => query,
        order: (key: string, options?: { ascending?: boolean }) => { sort = { key, ascending: options?.ascending ?? true }; return query; },
        limit: (n: number) => { limit = n; return query; },
        then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return query;
} }) }));

import { GET as navCounts } from './route';
import { GET as conversations } from '../conversations/route';

const customer = (id: string, extra: Row = {}) => ({ id, shop_id: 'shop-1', name: id, deleted_at: null, ...extra });
const fromCustomer = (customer_id: string, at: string, shop_id = 'shop-1') => ({ id: `${customer_id}-${at}`, shop_id, customer_id, message: 'Үнэ хэд вэ?', response: null, created_at: `2026-10-05T${at}:00Z` });
const staffReply = (customer_id: string, at: string) => ({ id: `${customer_id}-${at}`, shop_id: 'shop-1', customer_id, message: '', response: 'Сайн байна уу, мэдээлэл илгээлээ', created_at: `2026-10-05T${at}:00Z` });

beforeEach(() => {
    state.role = 'admin';
    state.modules = ['leads', 'viewings', 'inbox'];
    state.failing = new Set();
    state.queried = [];
    state.tables = {
        leads: [{ id: 'lead-1', shop_id: 'shop-1', status: 'new', deleted_at: null }],
        property_viewings: [{ id: 'viewing-1', shop_id: 'shop-1', status: 'scheduled', deleted_at: null }],
        customers: [customer('waiting'), customer('answered'), customer('legacy-bot'), customer('twice'), customer('removed', { deleted_at: '2026-10-04T00:00:00Z' }), customer('other-shop', { shop_id: 'shop-2' })],
        chat_history: [
            fromCustomer('waiting', '08:00'), staffReply('waiting', '09:00'), fromCustomer('waiting', '10:00'),
            fromCustomer('answered', '10:00'), staffReply('answered', '10:30'),
            { id: 'legacy', shop_id: 'shop-1', customer_id: 'legacy-bot', message: 'Байр байна уу?', response: 'Тийм, байна.', created_at: '2026-10-05T11:00:00Z' },
            staffReply('twice', '07:00'), fromCustomer('twice', '07:30'), fromCustomer('twice', '07:45'),
            fromCustomer('removed', '12:00'),
            fromCustomer('other-shop', '12:30', 'shop-2'),
        ],
    };
});

describe('GET /api/dashboard/nav-counts — inbox', () => {
    it('counts conversations whose latest message is from the customer', async () => {
        const response = await navCounts();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        // waiting + twice; staff-answered, legacy bot-answered, removed customer and other shop excluded
        expect(await response.json()).toEqual({ leads: 1, meetings: 1, inbox: 2 });
    });

    it('matches the unread badges of the Inbox conversation list', async () => {
        const list = (await (await conversations(new NextRequest('http://localhost/api/dashboard/conversations'))).json()).conversations as { id: string; unread_count: number }[];
        expect(Object.fromEntries(list.map(c => [c.id, c.unread_count]))).toEqual({ waiting: 1, answered: 0, 'legacy-bot': 0, twice: 2 });
        expect(list.filter(c => c.unread_count > 0)).toHaveLength((await (await navCounts()).json()).inbox);
    });

    it('only counts conversations visible in the Inbox window of the latest messages', async () => {
        const replies = Array.from({ length: 200 }, (_, i) => ({ ...staffReply('answered', '10:30'), id: `bulk-${i}`, created_at: `2026-10-06T00:00:${String(i % 60).padStart(2, '0')}Z` }));
        state.tables.chat_history = [fromCustomer('waiting', '06:00'), ...replies];
        expect((await (await navCounts()).json()).inbox).toBe(0);
    });

    it('omits the inbox count and never reads messages without inbox access', async () => {
        state.role = 'sales_manager';
        state.modules = ['leads', 'viewings'];
        const body = await (await navCounts()).json();
        expect(body).toEqual({ leads: 1, meetings: 1 });
        expect(state.queried).not.toContain('chat_history');
    });

    it('leaves inbox undefined when the messages cannot be read, keeping the other counts', async () => {
        state.failing.add('chat_history');
        const response = await navCounts();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ leads: 1, meetings: 1 });
    });

    it('lets super_admin see the inbox count', async () => {
        state.role = 'super_admin';
        state.modules = [];
        expect((await (await navCounts()).json()).inbox).toBe(2);
    });
});
