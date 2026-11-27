// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { areasOfModel, buildModelAreas, modelAreaText, modelWithArea } from '@/lib/sales/model-area';
import { loadModelAreas, projectShowsModelArea } from '@/lib/sales/model-area-load';

// Mandala Garden block 201: the area of one plan changes by floor.
const units = [
    { block: '201', model: 'A', floor: 3, area_sqm: 96.81 },
    { block: '201', model: 'A', floor: 4, area_sqm: 96.62 },
    { block: '201', model: 'A', floor: 5, area_sqm: 96.57 }, { block: '201', model: 'A', floor: 6, area_sqm: 96.57 },
    { block: '201', model: 'A', floor: 9, area_sqm: 96.53 }, { block: '201', model: 'A', floor: 16, area_sqm: 96.53 },
    { block: '201', model: 'D', floor: 3, area_sqm: 48.48 }, { block: '201', model: 'D', floor: 4, area_sqm: 48.48 },
    { block: '202', model: 'A', floor: 3, area_sqm: 105.55 },
    { block: '202', model: 'B', floor: null, area_sqm: 81.02 },
    { block: null, model: 'A', floor: 1, area_sqm: 50 }, { block: '201', model: null, floor: 1, area_sqm: 50 }, { block: '201', model: 'Z', floor: 1, area_sqm: null },
];

describe('model + area', () => {
    const rows = buildModelAreas(units);

    it('folds the register to block × model × area with the floors of each area', () => {
        expect(rows).toEqual([
            { block: '201', model: 'A', area_sqm: 96.53, floors: [9, 16] },
            { block: '201', model: 'A', area_sqm: 96.57, floors: [5, 6] },
            { block: '201', model: 'A', area_sqm: 96.62, floors: [4] },
            { block: '201', model: 'A', area_sqm: 96.81, floors: [3] },
            { block: '201', model: 'D', area_sqm: 48.48, floors: [3, 4] },
            { block: '202', model: 'A', area_sqm: 105.55, floors: [3] },
            { block: '202', model: 'B', area_sqm: 81.02, floors: [] },
        ]);
    });

    it('the same letter is another plan in the next block', () => {
        expect(areasOfModel(rows, '201', 'A')).toEqual([96.53, 96.57, 96.62, 96.81]);
        expect(areasOfModel(rows, '202', 'a')).toEqual([105.55]);
        expect(areasOfModel(rows, '203', 'A')).toEqual([]);
    });

    it('a floor range keeps only the areas found on those floors; an area without floors always counts', () => {
        expect(areasOfModel(rows, '201', 'A', 9, 16)).toEqual([96.53]);
        expect(areasOfModel(rows, '201', 'A', 4, 8)).toEqual([96.57, 96.62]);
        expect(areasOfModel(rows, '201', 'A', 1, 2)).toEqual([]);
        expect(areasOfModel(rows, '202', 'B', 5, 9)).toEqual([81.02]);
    });

    it('writes one area, up to three, or the range', () => {
        expect(modelAreaText([])).toBeNull();
        expect(modelAreaText([48.48])).toBe('48.48 м²');
        expect(modelAreaText([55.45, 54.99, 55.45])).toBe('54.99, 55.45 м²');
        expect(modelAreaText([96.81, 96.53, 96.57, 96.62])).toBe('96.53–96.81 м²');
        expect(modelWithArea('D', [48.48])).toBe('D · 48.48 м²');
        expect(modelWithArea('Z', [])).toBe('Z');
    });
});

describe('the project switch', () => {
    const database = (projects: { data: unknown[] | null; error: { code?: string; message?: string } | null }, unitRows: unknown[] = []) => {
        const read: string[] = [];
        const db = { from(table: string) {
            read.push(table);
            const result = table === 'projects' ? projects : { data: unitRows, error: null };
            const query: Record<string, unknown> = {};
            for (const method of ['select', 'eq', 'order', 'limit', 'range']) query[method] = () => query;
            query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
            return query;
        } } as unknown as SupabaseClient;
        return { db, read };
    };

    it('is on only for the one project that has it', async () => {
        expect(await projectShowsModelArea(database({ data: [{ id: 'p', model_with_area: true }], error: null }).db, 'shop')).toBe(true);
        expect(await projectShowsModelArea(database({ data: [{ id: 'p', model_with_area: false }], error: null }).db, 'shop', 'p')).toBe(false);
        expect(await projectShowsModelArea(database({ data: [], error: null }).db, 'shop')).toBe(false);
        expect(await projectShowsModelArea(database({ data: [{ id: 'a', model_with_area: true }, { id: 'b', model_with_area: true }], error: null }).db, 'shop')).toBe(false);
    });

    it('is off, not an error, before the column exists; other failures surface', async () => {
        expect(await projectShowsModelArea(database({ data: null, error: { code: '42703', message: 'column projects.model_with_area does not exist' } }).db, 'shop')).toBe(false);
        await expect(projectShowsModelArea(database({ data: null, error: { code: '57014', message: 'timeout' } }).db, 'shop')).rejects.toMatchObject({ code: '57014' });
    });

    it('reads no units while the switch is off and folds them when it is on', async () => {
        const off = database({ data: [{ id: 'p', model_with_area: false }], error: null });
        expect(await loadModelAreas(off.db, 'shop')).toEqual([]);
        expect(off.read).toEqual(['projects']);
        const on = database({ data: [{ id: 'p', model_with_area: true }], error: null }, [
            { block: '201', model: 'D', floor: '03', sale_area: 48.4, updated_sale_area: 48.48, contracted_area: null },
            { block: '201', model: 'D', floor: 'B1', sale_area: 48.48, updated_sale_area: null, contracted_area: null },
        ]);
        expect(await loadModelAreas(on.db, 'shop')).toEqual([{ block: '201', model: 'D', area_sqm: 48.48, floors: [3] }]);
    });
});
