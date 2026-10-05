import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Lead Ads тестийн in-memory Supabase: select/eq/in/gte/order/limit/maybeSingle/single,
 * insert (leads-д shop_id + client_request_id unique → 23505), upsert (onConflict), алдаа тарих.
 */
export type Row = Record<string, unknown>;
type Failure = { code?: string; message: string };

export interface FakeDb {
    client: SupabaseClient;
    tables: Record<string, Row[]>;
    /** `${table}:${op}` → алдаа (op: select | insert | upsert). */
    fail: Record<string, Failure | undefined>;
    calls: string[];
}

export function fakeDb(seed: Record<string, Row[]> = {}): FakeDb {
    const tables: Record<string, Row[]> = { shops: [], leads: [], projects: [], marketing_campaigns: [], meta_leadgen_events: [], ...seed };
    const fail: FakeDb['fail'] = {};
    const calls: string[] = [];
    let ids = 0;

    const from = (table: string) => {
        tables[table] ??= [];
        const filters: Array<(row: Row) => boolean> = [];
        let op: 'select' | 'insert' | 'upsert' = 'select';
        let payload: Row | null = null;
        let conflict: string | null = null;
        let limit = Infinity;

        const run = (): { data: Row[] | null; error: Failure | null } => {
            calls.push(`${table}:${op}`);
            const injected = fail[`${table}:${op}`];
            if (injected) return { data: null, error: injected };
            if (op === 'insert') {
                const row = { id: `${table}-${++ids}`, ...payload } as Row;
                if (table === 'leads' && row.client_request_id && tables.leads.some(l => l.shop_id === row.shop_id && l.client_request_id === row.client_request_id)) {
                    return { data: null, error: { code: '23505', message: 'duplicate key' } };
                }
                tables[table].push(row);
                return { data: [row], error: null };
            }
            if (op === 'upsert') {
                const key = conflict ?? 'id';
                const index = tables[table].findIndex(row => row[key] === payload![key]);
                if (index >= 0) tables[table][index] = { ...tables[table][index], ...payload };
                else tables[table].push({ created_at: new Date().toISOString(), ...payload });
                return { data: null, error: null };
            }
            return { data: tables[table].filter(row => filters.every(f => f(row))).slice(0, limit), error: null };
        };

        const query = {
            select: () => query,
            eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return query; },
            in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return query; },
            gte: (column: string, value: string) => { filters.push(row => String(row[column]) >= value); return query; },
            order: () => query,
            limit: (n: number) => { limit = n; return query; },
            insert: (row: Row) => { op = 'insert'; payload = row; return query; },
            upsert: (row: Row, options?: { onConflict?: string }) => { op = 'upsert'; payload = row; conflict = options?.onConflict ?? null; return query; },
            maybeSingle: async () => {
                const { data, error } = run();
                if (error) return { data: null, error };
                if ((data?.length ?? 0) > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
                return { data: data?.[0] ?? null, error: null };
            },
            single: async () => {
                const { data, error } = run();
                if (error) return { data: null, error };
                return data?.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } };
            },
            then: (resolve: (value: { data: Row[] | null; error: Failure | null }) => unknown, reject?: (reason: unknown) => unknown) =>
                Promise.resolve(run()).then(resolve, reject),
        };
        return query;
    };

    return { client: { from } as unknown as SupabaseClient, tables, fail, calls };
}

export const PAGE_ID = '1111';
export const SHOP = 'shop-1';
export const PROJECT = '30000000-0000-4000-8000-000000000001';
export const MAPPED_PROJECT = '30000000-0000-4000-8000-000000000002';

/** Нэг Page-тэй, нэг төсөлтэй shop. */
export function seededDb(extra: Record<string, Row[]> = {}): FakeDb {
    return fakeDb({
        shops: [{ id: SHOP, facebook_page_id: PAGE_ID, facebook_page_access_token: 'page-token', is_active: true }],
        projects: [{ id: PROJECT, shop_id: SHOP }],
        ...extra,
    });
}

/** Graph-ийн lead хариу. */
export function graphLead(id: string, overrides: Row = {}): Row {
    return {
        id,
        created_time: '2026-10-01T03:12:45+0000',
        campaign_id: '5550001',
        adset_id: '6660001',
        ad_id: '7770001',
        form_id: '8880001',
        field_data: [
            { name: 'full_name', values: ['Бат Дорж'] },
            { name: 'phone_number', values: ['+976 9911 2233'] },
            { name: 'email', values: ['bat@example.mn'] },
            { name: 'сонирхож_буй_өрөө', values: ['3 өрөө'] },
        ],
        ...overrides,
    };
}
