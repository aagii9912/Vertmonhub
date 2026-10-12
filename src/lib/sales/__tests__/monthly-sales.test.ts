import { describe, expect, it } from 'vitest';
import {
    emptyMonthlySales, MonthlySalesWriteSchema, monthlySalesAttainment, monthlySalesPatches,
    parseMonthlySalesAmount, summarizeMonthlySales, monthlySalesWithBlockTotals,
} from '../monthly';

describe('monthly sales monetary meaning', () => {
    it('preserves unknown and explicit zero, rejecting invalid amounts instead of coercing them', () => {
        expect(parseMonthlySalesAmount('')).toBeNull();
        expect(parseMonthlySalesAmount('0')).toBe(0);
        expect(parseMonthlySalesAmount('1,200.25')).toBe(1200.25);
        for (const value of ['-5', 'abc', 'Infinity', '12.345', '10000000000001']) expect(parseMonthlySalesAmount(value)).toBeUndefined();
        expect(monthlySalesAttainment(0, 100)).toBe(0);
        expect(monthlySalesAttainment(null, 100)).toBeNull();
        expect(monthlySalesAttainment(100, 0)).toBeNull();
    });

    it('sums only entered manual values and compares the same months without mixing computed actuals', () => {
        const months = emptyMonthlySales();
        expect(summarizeMonthlySales(months).totals.manual_cashflow_actual_amount.amount).toBeNull();
        months[0] = { ...months[0], target_amount: 100, manual_contract_actual_amount: 50,
            cashflow_target_amount: 10, manual_cashflow_actual_amount: 0 };
        const first = summarizeMonthlySales(months);
        expect(first.totals.manual_cashflow_actual_amount).toEqual({ amount: 0, filledMonths: 1, expectedMonths: 12 });
        expect(first.contractAttainmentPct).toBe(50);
        expect(first.cashflowAttainmentPct).toBe(0);
        months[1].target_amount = 100;
        expect(summarizeMonthlySales(months).contractAttainmentPct).toBeNull();
        expect(summarizeMonthlySales(months).totals.manual_contract_actual_amount.amount).toBe(50);
    });

    it('sends only changed cells and their original revision, including a deliberate clear', () => {
        const before = emptyMonthlySales();
        before[0] = { ...before[0], revision: 8, target_amount: 100, cashflow_target_amount: 40 };
        const after = before.map(row => ({ ...row }));
        after[0].cashflow_target_amount = null;
        after[1].manual_contract_actual_amount = 0;
        expect(monthlySalesPatches(before, after)).toEqual([
            { month: 1, expectedRevision: 8, cashflow_target_amount: null },
            { month: 2, expectedRevision: 0, manual_contract_actual_amount: 0 },
        ]);
    });

    it('requires a guarded, finite, partial update with unique months and strict fields', () => {
        const valid = { shopId: '20000000-0000-4000-8000-000000000001', year: 2026,
            months: [{ month: 10, expectedRevision: 0, manual_cashflow_actual_amount: null }] };
        expect(MonthlySalesWriteSchema.safeParse(valid).success).toBe(true);
        for (const value of [
            { ...valid, year: 2101 }, { ...valid, year: '2026' }, { ...valid, months: [valid.months[0], valid.months[0]] },
            { ...valid, months: [{ month: 10, target_amount: 1 }] },
            { ...valid, months: [{ month: 10, expectedRevision: 0 }] },
            { ...valid, months: [{ month: 10, expectedRevision: 0, target_amount: -1 }] },
            { ...valid, months: [{ month: 10, expectedRevision: 0, target_amount: Infinity }] },
            { ...valid, months: [{ month: 10, expectedRevision: 0, target_amount: '12' }] },
            { ...valid, months: [{ month: 10, expectedRevision: 0, paid_amount: 1 }] },
        ]) expect(MonthlySalesWriteSchema.safeParse(value).success).toBe(false);
    });

    it('sums block amounts by metric, keeps legacy totals, and patches only edited cells', () => {
        const before = emptyMonthlySales();
        before[0] = { ...before[0], revision: 3, target_amount: 500, cashflow_target_amount: 80 };
        const after = before.map(row => ({ ...row }));
        after[0] = monthlySalesWithBlockTotals({ ...after[0], block_amounts: {
            b1: { target_amount: 0.1, manual_contract_actual_amount: 0 },
            b2: { target_amount: 0.2 }, parking: { manual_cashflow_actual_amount: 25 },
        } });
        expect(after[0]).toMatchObject({ target_amount: 0.3, cashflow_target_amount: 80,
            manual_contract_actual_amount: 0, manual_cashflow_actual_amount: 25 });
        expect(monthlySalesPatches(before, after)).toEqual([{ month: 1, expectedRevision: 3,
            block_amounts: after[0].block_amounts }]);
        const cleared = monthlySalesWithBlockTotals({ ...after[0], block_amounts: {
            ...after[0].block_amounts, b1: { target_amount: null, manual_contract_actual_amount: 0 },
            b2: { target_amount: null },
        } });
        expect(cleared.target_amount).toBeNull();
        expect(cleared.manual_contract_actual_amount).toBe(0);
        expect(cleared.cashflow_target_amount).toBe(80);
        expect(monthlySalesPatches(after, [cleared])).toEqual([{ month: 1, expectedRevision: 3,
            block_amounts: { b1: { target_amount: null }, b2: { target_amount: null } } }]);
    });

    it('validates nested cells and rejects competing totals and block amounts', () => {
        const input = { shopId: '20000000-0000-4000-8000-000000000001', year: 2026 };
        const row = { month: 1, expectedRevision: 0, block_amounts: { b1: { target_amount: 0 } } };
        expect(MonthlySalesWriteSchema.safeParse({ ...input, months: [row] }).success).toBe(true);
        for (const block_amounts of [{}, { b3: { target_amount: 1 } }, { b1: {} }, { b1: { target_amount: '1' } },
            { b1: { target_amount: -1 } }, { b1: { target_amount: 1.001 } }, { b1: { paid_amount: 1 } }]) {
            expect(MonthlySalesWriteSchema.safeParse({ ...input, months: [{ ...row, block_amounts }] }).success).toBe(false);
        }
        expect(MonthlySalesWriteSchema.safeParse({ ...input, months: [{ ...row, target_amount: 12 }] }).success).toBe(false);
    });
});
