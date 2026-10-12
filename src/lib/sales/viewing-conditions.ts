import { pricingKey } from './pricing';
import type { ViewingCondition, ViewingUnitOption } from '@/lib/viewings/interests';

/** Known interest choices only; current approved pricing still owns every amount and advance. */
export function elysiumViewingConditions(projectName: string, units: readonly ViewingUnitOption[]): ViewingCondition[] {
    if (projectName.trim().toLowerCase() !== 'elysium residence') return [];
    const groups = new Map<string, { block: string; model: string; terms: string[]; floors: number[] }>();
    for (const unit of units) {
        const block = pricingKey(unit.block), model = pricingKey(unit.model);
        const terms = block === 'B1' && /^E[1-7]$/.test(model)
            ? ['10-30%', '30%', ...(['E1', 'E5', 'E6'].includes(model) ? [] : ['50%'])]
            : block === 'B2' && /^[A-F]$/.test(model) ? ['10-30%', '30%', '10-50%', '50%'] : [];
        if (!terms.length) continue;
        const key = `${block}|${model}`;
        const group = groups.get(key) ?? { block: unit.block, model: unit.model, terms, floors: [] };
        if (unit.floor !== null && Number.isInteger(unit.floor) && unit.floor > 0 && unit.floor <= 200) group.floors.push(unit.floor);
        groups.set(key, group);
    }
    return [...groups.values()].flatMap(group => group.terms.map(payment_condition => ({
        block: group.block, model: group.model,
        floor_min: group.floors.length ? Math.min(...group.floors) : 1,
        floor_max: group.floors.length ? Math.max(...group.floors) : 200,
        payment_condition,
    })));
}
