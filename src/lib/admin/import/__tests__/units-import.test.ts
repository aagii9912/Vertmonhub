// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { InventoryUnitInsert } from '../units';
import { importInventoryUnits } from '../units-import';

const shopId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const anotherProject = '33333333-3333-4333-8333-333333333333';

function unit(overrides: Partial<InventoryUnitInsert> = {}): InventoryUnitInsert {
    return {
        shop_id: shopId, project_id: projectId, phase: 'Elysium', block: 'Б1',
        building_number: null, floor: '2', code: 'Б1-201', unit_number: '201', legacy_unit_number: null,
        category: 'residential', unit_type: null, model: 'A', window_view: null, rooms: 2,
        sale_area: 65, updated_sale_area: null, contracted_area: null,
        status: 'available', raw_status: 'Худалдаанд', sales_channel: null, sales_manager: null,
        source_file: 'elysium.csv', ...overrides,
    };
}

type LiveUnit = Omit<InventoryUnitInsert, 'project_id' | 'block'> & {
    id: string;
    project_id: string | null;
    block: string | null;
};

function live(overrides: Partial<LiveUnit> = {}): LiveUnit {
    return { ...unit(), id: 'live', ...overrides };
}

interface DbOptions {
    readErrorAt?: number;
    readNull?: boolean;
    insertError?: { code: string; message: string };
    beforeInsert?: (rows: LiveUnit[]) => void;
    returnLimit?: number;
    exactCount?: number | null;
    throwOnInsert?: boolean;
}

function database(initial: LiveUnit[] = [], options: DbOptions = {}) {
    const rows = structuredClone(initial);
    const reads: Array<{ filters: Array<{ field: string; values: unknown[] }>; range: [number, number]; order: string }> = [];
    const inserts: InventoryUnitInsert[][] = [];
    const key = (row: InventoryUnitInsert | LiveUnit) => JSON.stringify([row.shop_id, row.phase, row.category, row.code]);
    const db = {
        from(table: string) {
            expect(table).toBe('property_units');
            const filters: Array<{ field: string; values: unknown[] }> = [];
            let range: [number, number] = [0, 999];
            let order = '';
            let payload: InventoryUnitInsert[] | null = null;
            let fields = '';
            const run = () => {
                if (payload) {
                    expect(fields).toBe('id');
                    inserts.push(structuredClone(payload));
                    options.beforeInsert?.(rows);
                    if (options.throwOnInsert) throw new Error('connection interrupted');
                    if (options.insertError) return { data: null, error: options.insertError, count: null };
                    if (payload.some((incoming) => rows.some((existing) => key(incoming) === key(existing)))) {
                        return { data: null, error: { code: '23505', message: 'duplicate key' }, count: null };
                    }
                    const added = payload.map((incoming, index) => ({ ...incoming, id: `new-${rows.length + index}` }));
                    rows.push(...added);
                    const count = options.exactCount === undefined ? added.length : options.exactCount;
                    return {
                        data: added.slice(0, options.returnLimit ?? added.length).map((row) => ({ id: row.id })),
                        error: null,
                        count,
                    };
                }
                expect(fields).toBe('id, shop_id, project_id, phase, block, category, code');
                reads.push({ filters, range, order });
                if (options.readErrorAt === reads.length) {
                    return { data: null, error: { message: 'database read failed' }, count: null };
                }
                if (options.readNull) return { data: null, error: null, count: null };
                const matches = rows.filter((row) => filters.every(({ field, values }) => values.includes(row[field as keyof LiveUnit])))
                    .sort((left, right) => left.id.localeCompare(right.id))
                    .slice(range[0], range[1] + 1);
                return { data: matches, error: null, count: null };
            };
            const query = {
                select(value: string) { fields = value; return query; },
                eq(field: string, value: unknown) { filters.push({ field, values: [value] }); return query; },
                in(field: string, values: unknown[]) { filters.push({ field, values }); return query; },
                order(field: string) { order = field; return query; },
                range(from: number, to: number) { range = [from, to]; return query; },
                insert(value: InventoryUnitInsert[], config: { count: string }) {
                    expect(config).toEqual({ count: 'exact' });
                    payload = value;
                    return query;
                },
                then(resolve: (value: ReturnType<typeof run>) => unknown, reject: (error: unknown) => unknown) {
                    return Promise.resolve().then(run).then(resolve, reject);
                },
            };
            return query;
        },
    } as unknown as SupabaseClient;
    return { db, rows, reads, inserts };
}

describe('inventory import preserves live units', () => {
    it('previews grouped source counts with no writes or changes to existing sale data', async () => {
        const existing = live({ status: 'sold', raw_status: 'Гэрээ баталгаажсан', sales_manager: 'Менежер' });
        const state = database([existing]);
        const result = await importInventoryUnits(state.db, [unit(), unit({ code: 'Б1-202', status: 'reserved' })], true);
        expect(result).toMatchObject({ success: true, imported: 0, skipped: 1 });
        expect(result.preview).toEqual({
            total: 2, fresh: 1, existing: 1,
            groups: [{ phase: 'Elysium', block: 'Б1', category: 'residential', total: 2, statuses: { available: 1, reserved: 1 } }],
        });
        expect(state.inserts).toEqual([]);
        expect(state.rows).toEqual([existing]);
    });

    it('inserts fresh units once and skips reimports without overwriting live fields', async () => {
        const existing = live({ status: 'handed_over', contracted_area: 66, sales_manager: 'Менежер', source_file: 'original.csv' });
        const state = database([existing]);
        const source = [unit(), unit({ code: 'Б1-202' }), unit({ code: 'Б1-203', category: 'parking' })];
        const result = await importInventoryUnits(state.db, source, false);
        expect(result).toMatchObject({ success: true, imported: 2, skipped: 1 });
        expect(state.inserts).toEqual([[source[1], source[2]]]);
        expect(state.rows[0]).toEqual(existing);
        expect(state.rows.slice(1)).toMatchObject(source.slice(1));
        expect(await importInventoryUnits(state.db, source, false)).toMatchObject({ success: true, imported: 0, skipped: 3 });
        expect(state.inserts).toHaveLength(1);
    });

    it.each(['shop', 'project', 'both'])('skips existing units for uppercase %s UUIDs', async (scope) => {
        const canonicalShop = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
        const canonicalProject = 'bcdefabc-defa-4bcd-8efa-bcdefabcdef0';
        const existing = live({ shop_id: canonicalShop, project_id: canonicalProject, status: 'sold' });
        const state = database([existing]);
        const source = [unit({
            shop_id: scope === 'project' ? canonicalShop : canonicalShop.toUpperCase(),
            project_id: scope === 'shop' ? canonicalProject : canonicalProject.toUpperCase(),
        })];
        expect(await importInventoryUnits(state.db, source, true)).toMatchObject({
            success: true, imported: 0, skipped: 1, preview: { fresh: 0, existing: 1 },
        });
        expect(await importInventoryUnits(state.db, source, false)).toMatchObject({ success: true, imported: 0, skipped: 1 });
        expect(state.inserts).toEqual([]);
        expect(state.rows).toEqual([existing]);
    });

    it('reads one shop once when source UUID casing differs across categories', async () => {
        const canonicalShop = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
        const source = [
            unit({ shop_id: canonicalShop }),
            unit({ shop_id: canonicalShop.toUpperCase(), category: 'parking' }),
        ];
        const state = database(source.map((row, index) => live({ ...row, shop_id: canonicalShop, id: `live-${index}` })));
        expect(await importInventoryUnits(state.db, source, false)).toMatchObject({ success: true, imported: 0, skipped: 2 });
        expect(state.reads).toHaveLength(1);
        expect(state.inserts).toEqual([]);
    });

    it.each([
        { project_id: anotherProject },
        { project_id: null },
        { block: 'Б2' },
        { block: null },
    ])('stops the whole batch for an existing project/block mismatch: %j', async (mismatch) => {
        const existing = live(mismatch);
        const state = database([existing]);
        const result = await importInventoryUnits(state.db, [unit({ code: 'fresh' }), unit()], false);
        expect(result.success).toBe(false);
        expect(result.errors?.[0]).toContain('Б1-201');
        expect(state.inserts).toEqual([]);
        expect(state.rows).toEqual([existing]);
    });

    it('stops a preview when a legacy unit has no project instead of classifying it as existing', async () => {
        const state = database([live({ project_id: null })]);
        const result = await importInventoryUnits(state.db, [unit()], true);
        expect(result.success).toBe(false);
        expect(result.preview).toBeUndefined();
        expect(state.inserts).toEqual([]);
    });

    it('matches the full identity and ignores unrelated project/category and phase/code combinations', async () => {
        const unrelated = [
            live({ project_id: anotherProject, category: 'parking' }),
            live({ id: 'cross-phase', project_id: anotherProject, phase: 'Phase 2' }),
            live({ id: 'other-shop', shop_id: 'different-shop', project_id: anotherProject }),
        ];
        const state = database(unrelated);
        const source = [unit(), unit({ phase: 'Phase 2', code: 'Б1-202' })];
        expect(await importInventoryUnits(state.db, source, false)).toMatchObject({ success: true, imported: 2, skipped: 0 });
        expect(state.rows.slice(0, 3)).toEqual(unrelated);
        expect(state.inserts).toEqual([source]);
    });

    it('rejects duplicate source identities before any database read or write', async () => {
        const state = database();
        const result = await importInventoryUnits(state.db, [unit(), unit({ block: 'Б2' })], false);
        expect(result.success).toBe(false);
        expect(state.reads).toEqual([]);
        expect(state.inserts).toEqual([]);
    });

    it('rejects ambiguous duplicate existing records', async () => {
        const state = database([live(), live({ id: 'duplicate' })]);
        expect((await importInventoryUnits(state.db, [unit(), unit({ code: 'fresh' })], false)).success).toBe(false);
        expect(state.inserts).toEqual([]);
    });

    it('fails closed for a read error after a successful first code batch', async () => {
        const state = database([], { readErrorAt: 2 });
        const source = Array.from({ length: 201 }, (_, index) => unit({ code: `code-${index}` }));
        const result = await importInventoryUnits(state.db, source, false);
        expect(result.success).toBe(false);
        expect(result.message).toContain('database read failed');
        expect(state.reads).toHaveLength(2);
        expect(state.inserts).toEqual([]);
        expect(state.rows).toEqual([]);
        expect(state.reads.map((read) => read.filters.find((filter) => filter.field === 'code')?.values.length)).toEqual([200, 1]);
    });

    it('fails closed for a missing read acknowledgement', async () => {
        const state = database([], { readNull: true });
        expect((await importInventoryUnits(state.db, [unit()], false)).success).toBe(false);
        expect(state.inserts).toEqual([]);
    });

    it('paginates beyond 1000 records and detects a collision on the second page', async () => {
        const source = Array.from({ length: 1200 }, (_, index) => unit({
            phase: `Phase ${Math.floor(index / 200)}`, code: `code-${index % 200}`,
        }));
        const existing = source.map((row, index) => live({
            ...row, id: `id-${String(index).padStart(4, '0')}`,
            project_id: index === 1199 ? anotherProject : projectId,
        }));
        const state = database(existing);
        const result = await importInventoryUnits(state.db, source, false);
        expect(result.success).toBe(false);
        expect(state.reads.map((read) => read.range)).toEqual([[0, 999], [1000, 1999]]);
        expect(state.reads.every((read) => read.order === 'id')).toBe(true);
        expect(state.inserts).toEqual([]);
        expect(state.rows).toEqual(existing);
    });

    it('uses one atomic insert and advises retry when a concurrent import wins the unique key', async () => {
        const concurrent = live({ status: 'sold' });
        const state = database([], { beforeInsert: (rows) => rows.push(concurrent) });
        const source = [unit({ code: 'fresh' }), unit()];
        const result = await importInventoryUnits(state.db, source, false);
        expect(result).toMatchObject({ success: false, imported: 0 });
        expect(result.message).toContain('дахин оролдоно уу');
        expect(state.inserts).toEqual([source]);
        expect(state.rows).toEqual([concurrent]);
    });

    it('does not retry an insert by dropping project metadata on schema failure', async () => {
        const state = database([], { insertError: { code: 'PGRST204', message: 'project_id column missing' } });
        const result = await importInventoryUnits(state.db, [unit()], false);
        expect(result.success).toBe(false);
        expect(state.inserts).toEqual([[unit()]]);
        expect(state.rows).toEqual([]);
    });

    it('confirms a large single insert through exact count and returned IDs despite response row limits', async () => {
        const source = Array.from({ length: 1100 }, (_, index) => unit({ code: `code-${index}` }));
        const state = database([], { returnLimit: 1000 });
        expect(await importInventoryUnits(state.db, source, false)).toMatchObject({ success: true, imported: 1100, skipped: 0 });
        expect(state.inserts).toEqual([source]);
        expect(state.rows).toHaveLength(1100);
    });

    it('reports an uncertain save without repeating mutations when acknowledgements are incomplete', async () => {
        const state = database([], { exactCount: null, returnLimit: 1 });
        const source = [unit(), unit({ code: 'Б1-202' })];
        const result = await importInventoryUnits(state.db, source, false);
        expect(result.success).toBe(false);
        expect(result.message).toContain('хадгалагдсан байж болох');
        expect(state.inserts).toEqual([source]);
        expect(await importInventoryUnits(state.db, source, true)).toMatchObject({
            success: true, preview: { total: 2, fresh: 0, existing: 2 },
        });
        expect(state.inserts).toHaveLength(1);
    });
});
