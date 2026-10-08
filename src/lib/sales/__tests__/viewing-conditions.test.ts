import { describe, expect, it } from 'vitest';
import { elysiumViewingConditions } from '../viewing-conditions';
import type { ViewingUnitOption } from '@/lib/viewings/interests';

const unit = (block: string, model: string, floor: number | null = 5, area = 51.72): ViewingUnitOption => ({
    id: `${block}-${model}-${floor}`, project_id: 'elysium', block, model, area_sqm: area, floor,
    unit_number: null, code: `${block}-${model}`, status: 'available',
});
const terms = (units: ViewingUnitOption[], project = 'Elysium Residence') =>
    elysiumViewingConditions(project, units).map(condition => condition.payment_condition);

describe('Elysium viewing condition choices without amounts', () => {
    it.each(['E1', 'E5', 'E6'])('excludes 50%% for B1 %s', model => {
        expect(terms([unit('Б1', model)])).toEqual(['10-30%', '30%']);
    });

    it('keeps 50% for B1 E3 even when its area is around 80 m²', () => {
        expect(terms([unit('B1', 'E3', 5, 80.91)])).toEqual(['10-30%', '30%', '50%']);
    });

    it.each(['A', 'B', 'C', 'D', 'E', 'F'])('provides all four choices for B2 %s', model => {
        expect(terms([unit('Б2', model)])).toEqual(['10-30%', '30%', '10-50%', '50%']);
    });

    it('normalizes Cyrillic block/model aliases, groups duplicates and derives actual floor bounds', () => {
        const result = elysiumViewingConditions('  ELYSIUM RESIDENCE  ', [unit('Б1', 'Е3', 2), unit('B1', 'E3', 13), unit('Б1', 'E3', null)]);
        expect(result).toEqual(['10-30%', '30%', '50%'].map(payment_condition => ({
            block: 'Б1', model: 'Е3', floor_min: 2, floor_max: 13, payment_condition,
        })));
        expect(result[0]).not.toHaveProperty('price_per_sqm');
        expect(result[0]).not.toHaveProperty('advance_percent');
    });

    it('allows any valid floor when no actual floor is known', () => {
        expect(elysiumViewingConditions('Elysium Residence', [unit('B2', 'A', null), unit('B2', 'A', 0)]))
            .toEqual(['10-30%', '30%', '10-50%', '50%'].map(payment_condition => ({
                block: 'B2', model: 'A', floor_min: 1, floor_max: 200, payment_condition,
            })));
    });

    it.each(['Mandala Garden', 'Elysium', 'Elysium Residence II', ''])('does not apply Elysium choices to %s', project => {
        expect(terms([unit('B1', 'E3'), unit('B2', 'A')], project)).toEqual([]);
    });

    it('does not guess choices for unknown blocks, models or missing inventory', () => {
        expect(terms([unit('B1', 'E8'), unit('B1', 'A'), unit('B2', 'G'), unit('B3', 'A')])).toEqual([]);
        expect(terms([])).toEqual([]);
    });
});
