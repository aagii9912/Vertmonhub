import { describe, expect, it } from 'vitest';
import { accountCurrencyLabel, formatAccountMoney, formatMNT, formatMNTShort } from '../currency';

describe('formatMNT', () => {
    it('formats whole tugrik amounts with thousands separators', () => {
        expect(formatMNT(380_000_000)).toBe('380,000,000₮');
        expect(formatMNT(1234.6)).toBe('1,235₮');
        expect(formatMNT(-5000)).toBe('-5,000₮');
    });

    it('keeps a real zero as 0₮', () => {
        expect(formatMNT(0)).toBe('0₮');
        expect(formatMNT(0, { compact: true })).toBe('0₮');
    });

    it('shows missing or non-numeric values as unavailable instead of 0₮', () => {
        for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
            expect(formatMNT(value)).toBe('—');
            expect(formatMNT(value, { compact: true })).toBe('—');
        }
        expect(formatMNT('' as unknown as number)).toBe('—');
        expect(formatMNT('abc' as unknown as number)).toBe('—');
    });

    it('accepts numeric strings returned for DB numeric columns', () => {
        expect(formatMNT('4850000' as unknown as number)).toBe('4,850,000₮');
    });

    it('abbreviates large amounts in compact mode', () => {
        expect(formatMNT(3_500_000_000, { compact: true })).toBe('3.5 тэрбум₮');
        expect(formatMNT(1_240_000, { compact: true })).toBe('1.2 сая₮');
        expect(formatMNT(98_000, { compact: true })).toBe('98,000₮');
        expect(formatMNT(950, { compact: true })).toBe('950₮');
    });
});

describe('formatMNTShort', () => {
    it('uses the v2 KPI abbreviations', () => {
        expect(formatMNTShort(1_240_000_000)).toBe('1.24 тэрбум ₮');
        expect(formatMNTShort(1_000_000_000)).toBe('1 тэрбум ₮');
        expect(formatMNTShort(331_400_000)).toBe('331 сая ₮');
        expect(formatMNTShort(12_500_000)).toBe('12.5 сая ₮');
        expect(formatMNTShort(980_000)).toBe('980,000 ₮');
    });

    it('keeps a real zero and marks missing values as unavailable', () => {
        expect(formatMNTShort(0)).toBe('0 ₮');
        for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(formatMNTShort(value)).toBe('—');
        }
    });
});

describe('formatAccountMoney', () => {
    it('renders ad-account amounts in their own currency, never as ₮', () => {
        expect(formatAccountMoney(300.38, 'USD')).toBe('$300.38');
        expect(formatAccountMoney(1234.5, 'usd')).toBe('$1,234.50');
        expect(formatAccountMoney(12.5, 'EUR')).toBe('€12.50');
        expect(formatAccountMoney(0, 'USD')).toBe('$0.00');
    });

    it('uses ₮ only when the account itself is in MNT', () => {
        expect(formatAccountMoney(1_500_000, 'MNT')).toBe('1,500,000₮');
    });

    it('shows a bare number when the currency is unknown and «—» when the amount is missing', () => {
        expect(formatAccountMoney(300.384, null)).toBe('300.38');
        expect(formatAccountMoney(300, 'dollars')).toBe('300');
        expect(formatAccountMoney(null, 'USD')).toBe('—');
        expect(formatAccountMoney(Number.NaN, 'USD')).toBe('—');
    });

    it('labels the currency or says it is unknown', () => {
        expect(accountCurrencyLabel(' usd ')).toBe('USD');
        expect(accountCurrencyLabel(null)).toBe('валют тодорхойгүй');
        expect(accountCurrencyLabel('')).toBe('валют тодорхойгүй');
    });
});
