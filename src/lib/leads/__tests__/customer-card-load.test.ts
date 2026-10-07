import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadLeadCustomerCard, type CustomerCardAccess } from '../customer-card-load';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let failing: Set<string>;
let reads: string[];

const like = (pattern: string) => new RegExp(`^${pattern.split('%').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');

/** PostgREST-ийн хэрэгтэй хэсгийг дуурайна: eq, is, in, ilike, or(col.ilike.x,…), order, limit. */
function fakeDb(): SupabaseClient {
    return {
        from(table: string) {
            reads.push(table);
            let rows = [...(tables[table] ?? [])];
            let limit = Infinity;
            const chain = {
                select: () => chain,
                eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return chain; },
                is: (key: string, value: unknown) => { rows = rows.filter((r) => (r[key] ?? null) === value); return chain; },
                in: (key: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[key])); return chain; },
                ilike: (key: string, pattern: string) => { rows = rows.filter((r) => like(pattern).test(String(r[key] ?? ''))); return chain; },
                or: (filter: string) => {
                    const parts = filter.split(',').map((part) => part.match(/^(\w+)\.ilike\.(.+)$/)!);
                    rows = rows.filter((r) => parts.some(([, key, pattern]) => like(pattern).test(String(r[key] ?? ''))));
                    return chain;
                },
                order: (key: string, options?: { ascending?: boolean }) => {
                    rows.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * (options?.ascending === false ? -1 : 1));
                    return chain;
                },
                limit: (n: number) => { limit = n; return chain; },
                maybeSingle: async () => failing.has(table) ? { data: null, error: { message: `${table} down` } } : { data: rows[0] ?? null, error: null },
                then: (resolve: (value: unknown) => unknown) => Promise.resolve(failing.has(table)
                    ? { data: null, error: { message: `${table} down` } }
                    : { data: rows.slice(0, limit), error: null }).then(resolve),
            };
            return chain;
        },
    } as unknown as SupabaseClient;
}

const all: CustomerCardAccess = { customers: true, inbox: true, contracts: true, serviceLogs: true };
const lead = { id: 'lead-1', customer_id: null, customer_phone: '+976 9911-2233' };

beforeEach(() => {
    failing = new Set();
    reads = [];
    tables = {
        customers: [
            { id: 'cust-1', shop_id: 'shop-1', deleted_at: null, name: 'Б. Энхжин', phone: '99112233', phone_normalized: '99112233', email: null, facebook_id: 'fb-1', instagram_id: null, message_count: 3, last_contact_at: '2026-10-05T13:15:00Z', created_at: '2026-10-01T00:00:00Z' },
            { id: 'other-shop', shop_id: 'shop-2', deleted_at: null, name: 'Өөр', phone_normalized: '99112233' },
        ],
        chat_history: [
            { id: 'm1', shop_id: 'shop-1', customer_id: 'cust-1', message: '3 өрөөний үнэ хэд вэ?', response: null, intent: null, created_at: '2026-10-05T13:15:00Z' },
            { id: 'm2', shop_id: 'shop-1', customer_id: 'cust-1', message: null, response: 'Сайн байна уу', intent: 'human_reply', created_at: '2026-10-05T13:20:00Z' },
        ],
        property_contracts: [
            { id: 'c-lead', shop_id: 'shop-1', deleted_at: null, lead_id: 'lead-1', contract_number: 'VM-1', contract_date: '2026-09-01', customer_phone: null, customer_mobile: null },
            { id: 'c-phone', shop_id: 'shop-1', deleted_at: null, lead_id: null, contract_number: 'VM-2', contract_date: '2026-10-01', customer_phone: '9911 2233', customer_mobile: null },
            // ilike нэр дэвшигч мөртлөө өөр дугаар (урд нь илүү цифр) — орохгүй.
            { id: 'c-near', shop_id: 'shop-1', deleted_at: null, lead_id: null, contract_number: 'VM-3', contract_date: '2026-10-02', customer_phone: '899112233', customer_mobile: null },
        ],
        service_logs: [
            { id: 's-cust', shop_id: 'shop-1', customer_id: 'cust-1', customer_phone: null, type: 'complaint', subject: 'Цахилгаан', status: 'open', priority: 'high', created_at: '2026-10-04T00:00:00Z' },
            { id: 's-phone', shop_id: 'shop-1', customer_id: null, customer_phone: '99112233', type: 'inquiry', subject: 'Төлбөр', status: 'resolved', priority: 'low', created_at: '2026-10-02T00:00:00Z' },
            { id: 's-other', shop_id: 'shop-1', customer_id: null, customer_phone: '88001122', type: 'inquiry', subject: 'Өөр', status: 'open', priority: 'low', created_at: '2026-10-03T00:00:00Z' },
        ],
    };
});

describe('loadLeadCustomerCard', () => {
    it('joins the customer, messages, contracts and complaints of the same phone', async () => {
        const card = await loadLeadCustomerCard(fakeDb(), 'shop-1', lead, all);
        expect(card.partial).toEqual([]);
        expect(card.customer).toMatchObject({ id: 'cust-1', name: 'Б. Энхжин', channel: 'messenger', duplicates: 0 });
        expect(card.messages?.items.map((m) => m.from)).toEqual(['customer', 'staff']);
        expect(card.messages?.lastCustomerAt).toBe('2026-10-05T13:15:00Z');
        expect(card.contracts.map((c) => [c.id, c.matched_by])).toEqual([['c-phone', 'phone'], ['c-lead', 'lead']]);
        expect(card.contracts[0]).not.toHaveProperty('customer_phone');
        expect(card.serviceLogs.map((s) => s.id)).toEqual(['s-cust', 's-phone']);
    });

    it('reads only the sections the user may open', async () => {
        const card = await loadLeadCustomerCard(fakeDb(), 'shop-1', lead, { customers: false, inbox: false, contracts: false, serviceLogs: false });
        expect(card).toMatchObject({ customer: null, messages: null, contracts: [], serviceLogs: [] });
        expect(reads).toEqual([]);

        reads = [];
        const inboxOnly = await loadLeadCustomerCard(fakeDb(), 'shop-1', lead, { customers: false, inbox: true, contracts: false, serviceLogs: false });
        // Мессежийн тулд харилцагчийг дотооддоо олно, гэхдээ профайлыг буцаахгүй.
        expect(inboxOnly.customer).toBeNull();
        expect(inboxOnly.messages?.items).toHaveLength(2);
        expect(reads).not.toContain('property_contracts');
        expect(reads).not.toContain('service_logs');
    });

    it('does not match by a short phone', async () => {
        const card = await loadLeadCustomerCard(fakeDb(), 'shop-1', { ...lead, customer_phone: '2233' }, all);
        expect(card.customer).toBeNull();
        expect(card.contracts.map((c) => c.id)).toEqual(['c-lead']);
        expect(card.serviceLogs).toEqual([]);
    });

    it('names a failed source instead of passing it off as empty', async () => {
        failing.add('service_logs');
        const card = await loadLeadCustomerCard(fakeDb(), 'shop-1', lead, all);
        expect(card.partial).toEqual(['serviceLogs']);
        expect(card.contracts).toHaveLength(2);

        failing = new Set(['customers']);
        const noCustomer = await loadLeadCustomerCard(fakeDb(), 'shop-1', lead, all);
        expect(noCustomer.partial).toContain('customer');
        expect(noCustomer.messages).toBeNull();
    });
});
