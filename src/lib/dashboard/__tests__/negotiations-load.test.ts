import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadNegotiations } from '../negotiations-load';
import { UNRESTRICTED_SALES_SCOPE } from '@/lib/sales/project-scope';

type Row = Record<string, unknown>;
type DbError = { code: string; message: string };

/** eq/is/in/not/or(цуцлаагүй) шүүлт, limit, maybeSingle-ийг дуурайна; `columnErrors` — тухайн баганыг сонгосон асуулгад алдаа. */
function fakeDb(tables: Record<string, Row[]>, options: { errors?: Record<string, DbError>; columnErrors?: Record<string, DbError> } = {}, calls: string[] = []) {
    return { from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        let selected = '';
        let limit = Infinity;
        const result = () => {
            const columnError = Object.entries(options.columnErrors ?? {}).find(([column]) => selected.includes(column))?.[1];
            const error = options.errors?.[table] ?? columnError;
            if (error) return { data: null, error };
            return { data: (tables[table] ?? []).filter(row => filters.every(f => f(row))).slice(0, limit), error: null };
        };
        const query: Record<string, unknown> = {
            select: (columns: string) => { selected = columns; calls.push(`${table}:${columns}`); return query; },
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); calls.push(`${table}.eq:${key}=${String(value)}`); return query; },
            is: (key: string, value: null) => { filters.push(row => (row[key] ?? null) === value); return query; },
            in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); calls.push(`${table}.in:${key}`); return query; },
            not: (key: string, operator: string, value: null) => { if (operator === 'is' && value === null) filters.push(row => row[key] != null); return query; },
            or: (expression: string) => { if (expression.includes('neq.cancelled')) filters.push(row => row.contract_status !== 'cancelled'); return query; },
            order: () => query, range: () => query,
            limit: (count: number) => { limit = count; return query; },
            maybeSingle: async () => {
                const { data, error } = result();
                return { data: data?.[0] ?? null, error };
            },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return query;
    } } as unknown as SupabaseClient;
}

const config = {
    source: 'Үнийн жагсаалт', valid_from: '2026-10-01', valid_until: '2026-12-31', inventory_area_confirmed: true,
    rules: [{ block: 'Б2', model: 'A', floor_min: 1, floor_max: 23, payment_condition: '10-30%', price_per_sqm: 7_600_000, advance_percent: 10 }],
};
const interest = [{ block: 'Б2', model: 'A', area_sqm: 57.87, floor: 12, unit_id: null, payment_condition: '10-30%', quote: null }];
const base = () => ({
    leads: [
        { id: 'L1', shop_id: 's', status: 'negotiating', sales_manager_name: 'Khongoroo', project_id: 'p1', deleted_at: null, customer_name: 'Нууц' },
        { id: 'L2', shop_id: 's', status: 'offered', sales_manager_name: 'Ариунбилэг', project_id: 'p1', deleted_at: null },
        { id: 'L3', shop_id: 's', status: 'negotiating', sales_manager_name: 'Khongoroo', project_id: 'p1', deleted_at: '2026-10-01T00:00:00Z' },
        { id: 'L4', shop_id: 's', status: 'contacted', sales_manager_name: 'Khongoroo', project_id: 'p1', deleted_at: null },
        { id: 'LX', shop_id: 'x', status: 'negotiating', sales_manager_name: 'Other', project_id: 'px', deleted_at: null },
    ],
    property_contracts: [
        // L2: амьд гэрээтэй → хасагдана. L1-ийн цуцалсан, устгасан гэрээ тооцогдохгүй.
        { id: 'c1', shop_id: 's', lead_id: 'L2', contract_status: 'active', deleted_at: null },
        { id: 'c2', shop_id: 's', lead_id: 'L1', contract_status: 'cancelled', deleted_at: null },
        { id: 'c3', shop_id: 's', lead_id: 'L1', contract_status: 'active', deleted_at: '2026-10-10T00:00:00Z' },
    ],
    property_viewings: [
        { id: 'v1', shop_id: 's', lead_id: 'L1', scheduled_at: '2026-10-15T03:00:00Z', sales_manager_name: 'Khongoroo', interests: interest, deleted_at: null, referral_source_id: 'r1' },
        { id: 'v-del', shop_id: 's', lead_id: 'L1', scheduled_at: '2026-10-20T03:00:00Z', sales_manager_name: 'Khongoroo', interests: [{ ...interest[0], model: 'B' }], deleted_at: '2026-10-21T00:00:00Z' },
        { id: 'v2', shop_id: 's', lead_id: 'L2', scheduled_at: '2026-10-16T03:00:00Z', sales_manager_name: 'Ариунбилэг', interests: interest, deleted_at: null },
    ],
    property_units: [{ id: 'u1', shop_id: 's', category: 'residential', block: 'Б2', model: 'A', rooms: 2 }],
    project_pricing_configs: [
        { id: 'draft', shop_id: 's', version: 3, status: 'draft', config },
        { id: 'cfg', shop_id: 's', version: 2, status: 'active', config },
    ],
    sales_referral_sources: [{ id: 'r1', shop_id: 's', name: 'Ойрхон амьдардаг' }],
});

describe('loadNegotiations', () => {
    it('reads live, in-scope negotiation leads, drops those with a live contract and prices them with the active list', async () => {
        const report = await loadNegotiations(fakeDb(base()), { shopId: 's', scope: UNRESTRICTED_SALES_SCOPE, today: '2026-10-23' });
        expect(report.rows).toEqual([expect.objectContaining({
            leadId: 'L1', manager: 'Khongoroo', block: 'Б2', rooms: 2, floor: 12, area: 57.87, condition: '10-30%',
            pricePerSqm: 7_600_000, total: 439_812_000, advance: 43_981_200, referral: 'Ойрхон амьдардаг', viewedAt: '2026-10-15',
        })]);
        expect(report.pricing).toEqual({ version: 2, source: 'Үнийн жагсаалт' });
        expect(report.notes).toContain('1 лид амьд гэрээтэй тул жагсаалтад ороогүй.');
        // Захиалагчийн нэр гаргахгүй.
        expect(JSON.stringify(report)).not.toContain('Нууц');
    });

    it('applies the lead scope to the lead read', async () => {
        const calls: string[] = [];
        await loadNegotiations(fakeDb(base(), {}, calls), { shopId: 's', scope: { projectIds: ['p1'], managerName: 'Khongoroo' }, today: '2026-10-23' });
        expect(calls).toEqual(expect.arrayContaining(['leads.in:project_id', 'leads.eq:sales_manager_name=Khongoroo']));
    });

    it('keeps «Сэжим» unknown when the referral column is missing and skips extra reads for an empty pipeline', async () => {
        const missing = await loadNegotiations(fakeDb(base(), { columnErrors: { referral_source_id: { code: '42703', message: 'missing column' } } }),
            { shopId: 's', scope: UNRESTRICTED_SALES_SCOPE, today: '2026-10-23' });
        expect(missing.rows[0].referral).toBeNull();
        expect(missing.notes).toContain('«Сэжим (хаанаас ирсэн)» талбар хараахан нэмэгдээгүй.');

        const calls: string[] = [];
        const empty = await loadNegotiations(fakeDb({ ...base(), leads: [] }, {}, calls), { shopId: 's', scope: UNRESTRICTED_SALES_SCOPE, today: '2026-10-23' });
        expect(empty.rows).toEqual([]);
        expect(calls.some(call => call.startsWith('project_pricing_configs') || call.startsWith('property_viewings'))).toBe(false);
    });

    it('surfaces read errors instead of an empty pipeline', async () => {
        await expect(loadNegotiations(fakeDb(base(), { errors: { leads: { code: '57014', message: 'leads timeout' } } }), { shopId: 's', scope: UNRESTRICTED_SALES_SCOPE }))
            .rejects.toThrow('leads timeout');
        await expect(loadNegotiations(fakeDb(base(), { errors: { project_pricing_configs: { code: '57014', message: 'x' } } }), { shopId: 's', scope: UNRESTRICTED_SALES_SCOPE }))
            .rejects.toMatchObject({ status: 503 });
    });
});
