import { pricingKey } from './pricing';

/**
 * «Загвар + м²» (owner request 2026-11-27, Mandala Garden): a project may name a plan together with its area —
 * the same letter is another plan in the next block and the area changes by floor — so where the project's
 * `model_with_area` switch is on, a model is shown with its register area. Display only: prices, saved
 * interests and reports keep the model and the area as separate values. Client-safe.
 */

/** One register area of a model in a block and the floors that have it (empty = the floor is not recorded). */
export interface ModelAreaRow { block: string; model: string; area_sqm: number; floors: number[] }

type AreaUnit = { block: string | null; model: string | null; floor: number | null; area_sqm: number | null };

/** The register's residential units folded to block × model × area. */
export function buildModelAreas(units: readonly AreaUnit[]): ModelAreaRow[] {
    const rows = new Map<string, ModelAreaRow & { seen: Set<number> }>();
    for (const unit of units) {
        if (!unit.block?.trim() || !unit.model?.trim() || unit.area_sqm == null || !(unit.area_sqm > 0)) continue;
        const key = `${pricingKey(unit.block)}|${pricingKey(unit.model)}|${unit.area_sqm}`;
        const row = rows.get(key) ?? { block: unit.block.trim(), model: unit.model.trim(), area_sqm: unit.area_sqm, floors: [], seen: new Set<number>() };
        if (unit.floor != null && !row.seen.has(unit.floor)) { row.seen.add(unit.floor); row.floors.push(unit.floor); }
        rows.set(key, row);
    }
    return [...rows.values()].map(({ block, model, area_sqm, floors }) => ({ block, model, area_sqm, floors: floors.sort((a, b) => a - b) }))
        .sort((a, b) => a.block.localeCompare(b.block, 'mn', { numeric: true }) || a.model.localeCompare(b.model, 'mn', { numeric: true }) || a.area_sqm - b.area_sqm);
}

/**
 * The areas of a model in a block, smallest first. With a floor range only the areas found on those floors
 * (an area whose floors are not recorded always counts).
 */
export function areasOfModel(rows: readonly ModelAreaRow[], block: string, model: string, floorMin?: number | null, floorMax?: number | null): number[] {
    const ranged = floorMin != null && floorMax != null;
    const areas = rows.filter(row => pricingKey(row.block) === pricingKey(block) && pricingKey(row.model) === pricingKey(model)
        && (!ranged || !row.floors.length || row.floors.some(floor => floor >= floorMin && floor <= floorMax))).map(row => row.area_sqm);
    return [...new Set(areas)].sort((a, b) => a - b);
}

/** «96.53 м²», «54.99, 55.45 м²», or the range «96.53–96.81 м²» when there are more than three. Null without an area. */
export function modelAreaText(areas: readonly number[]): string | null {
    const sorted = [...new Set(areas)].sort((a, b) => a - b);
    if (!sorted.length) return null;
    return `${sorted.length <= 3 ? sorted.join(', ') : `${sorted[0]}–${sorted[sorted.length - 1]}`} м²`;
}

/** «A · 96.53 м²»; the bare model when the register has no area for it. */
export function modelWithArea(model: string, areas: readonly number[]): string {
    const text = modelAreaText(areas);
    return text ? `${model} · ${text}` : model;
}
