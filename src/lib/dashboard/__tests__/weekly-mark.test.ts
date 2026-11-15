import { describe, expect, it } from 'vitest';
import { periodContractAmount, periodContractCount } from '../contract-dates';
import { WEEKLY_LOWER_BOUND_MARK, weeklyContractAmount, weeklyContractCount, weeklyMark, weeklyPlanValue } from '../weekly-mark';

const money = (value: number) => `${value.toLocaleString('en-US')}₮`;

describe('Wednesday report lower-bound mark (owner decision 2026-11-15: no «+»)', () => {
    it('is switched off', () => {
        expect(WEEKLY_LOWER_BOUND_MARK).toBe('');
        expect(weeklyMark(true)).toBe('');
        expect(weeklyMark(3)).toBe('');
        expect(weeklyMark(false)).toBe('');
    });

    it('shows counts and amounts without «+», but an unknown period stays «—», never 0', () => {
        expect(weeklyContractCount(5, 0)).toBe('5');
        expect(weeklyContractCount(5, 9)).toBe('5');
        expect(weeklyContractCount(0, 9)).toBe('—');
        expect(weeklyContractCount(0, 0)).toBe('0');
        expect(weeklyContractAmount(540_000_000, 2, 9, money)).toBe('540,000,000₮');
        expect(weeklyContractAmount(0, 0, 9, money)).toBe('—');
        expect(weeklyPlanValue(1200, true, money)).toBe('1,200₮');
        expect(weeklyPlanValue(null, true, money)).toBe('—');
    });

    it('leaves the other pages\' helpers marked', () => {
        expect(periodContractCount(5, 9)).toBe('5+');
        expect(periodContractAmount(540_000_000, 2, 9, money)).toBe('540,000,000₮+');
    });
});
