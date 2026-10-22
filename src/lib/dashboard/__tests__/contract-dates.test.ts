import { describe, expect, it } from 'vitest';
import { knownPeriodAmount, periodContractAmount, periodContractCount, undatedContractsHint, undatedContractsShort } from '../contract-dates';

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

    it('tells users to date the contract (or import the HUB file), never that an ERP export fixes it', () => {
        expect(undatedContractsShort(10)).toBe('Огноогүй 10 гэрээ · «Захиалга өгсөн огноо» оруулах');
        expect(undatedContractsHint(10)).toMatch(/«Огноо оруулах».*HUB файл/);
        for (const text of [undatedContractsShort(10), undatedContractsHint(10)]) {
            expect(text).not.toMatch(/ERP/);
            expect(text).not.toMatch(/орсон мөнгө/);
        }
    });
});
