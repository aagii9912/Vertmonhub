import { describe, expect, it } from 'vitest';
import { knownPeriodAmount, periodContractAmount, periodContractCount } from '../contract-dates';

const fmt = (value: number) => `${value}₮`;

describe('period contract counts with undated contracts', () => {
    it('prints plain numbers when every contract has a date', () => {
        expect(periodContractCount(0, 0)).toBe('0');
        expect(periodContractCount(1200, 0)).toBe('1,200');
        expect(periodContractAmount(0, 0, 0, fmt)).toBe('0₮');
        expect(knownPeriodAmount(0, 0, 0)).toBe(0);
    });

    it('never prints zero when undated contracts may belong to the period', () => {
        expect(periodContractCount(0, 77)).toBe('—');
        expect(periodContractAmount(0, 0, 77, fmt)).toBe('—');
        expect(knownPeriodAmount(0, 0, 77)).toBeNull();
    });

    it('marks partial counts as a lower bound', () => {
        expect(periodContractCount(3, 5)).toBe('3+');
        expect(periodContractAmount(450, 3, 5, fmt)).toBe('450₮+');
        expect(knownPeriodAmount(450, 3, 5)).toBe(450);
    });
});
