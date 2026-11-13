import { describe, expect, it } from 'vitest';
import {
    AdvancePaymentTermPatchSchema, AdvancePaymentTermSchema, PAYMENT_TERM_OPTIONS, RemainderPaymentTermPatchSchema, RemainderPaymentTermSchema,
    paymentTermLabel, paymentTermsText, selectablePaymentTerms,
} from '@/lib/viewings/payment-terms';

describe('уулзалтын урьдчилгаа / үлдэгдэл төлбөрийн нөхцөл', () => {
    it('keeps the agreed options in order, with codes the database column accepts', () => {
        expect(PAYMENT_TERM_OPTIONS.advance.map(option => option.label)).toEqual(['Бэлэн', 'Бартер', 'Урьдчилгаа хуваах']);
        expect(PAYMENT_TERM_OPTIONS.remainder.map(option => option.label)).toEqual(['Ипотек', 'Энгийн зээл', 'Хувь лизинг', 'Бэлэн']);
        for (const options of Object.values(PAYMENT_TERM_OPTIONS)) {
            expect(new Set(options.map(option => option.code)).size).toBe(options.length);
            // migration 20261113120000-ийн CHECK ба RPC-ийн шалгалттай ижил хэлбэр.
            for (const option of options) expect(option.code).toMatch(/^[a-z][a-z_]{0,39}$/);
        }
    });

    it('labels codes per kind, shows unknown stored codes as they are and never invents a value', () => {
        expect(paymentTermLabel('advance', 'cash')).toBe('Бэлэн');
        expect(paymentTermLabel('remainder', 'bank_loan')).toBe('Энгийн зээл');
        expect(paymentTermLabel('advance', 'old_code')).toBe('old_code');
        expect(paymentTermLabel('advance', null)).toBeNull();
        expect(paymentTermsText({ advance_payment_term: 'barter', remainder_payment_term: 'mortgage' })).toBe('Урьдчилгаа: Бартер · Үлдэгдэл: Ипотек');
        expect(paymentTermsText({ advance_payment_term: null, remainder_payment_term: 'leasing' })).toBe('Үлдэгдэл: Хувь лизинг');
        expect(paymentTermsText({})).toBeNull();
        expect(selectablePaymentTerms('advance').map(option => option.code)).toEqual(['cash', 'barter', 'split']);
    });

    it('accepts only the codes of its own kind; null clears and undefined leaves the value alone', () => {
        expect(AdvancePaymentTermSchema.parse('split')).toBe('split');
        expect(AdvancePaymentTermSchema.parse(null)).toBeNull();
        expect(AdvancePaymentTermSchema.parse(undefined)).toBeUndefined();
        expect(AdvancePaymentTermSchema.safeParse('mortgage').success).toBe(false);
        expect(RemainderPaymentTermSchema.safeParse('barter').success).toBe(false);
        expect(RemainderPaymentTermSchema.safeParse('Ипотек').success).toBe(false);
        expect(AdvancePaymentTermPatchSchema.parse(null)).toBeNull();
        expect(RemainderPaymentTermPatchSchema.parse('cash')).toBe('cash');
        expect(RemainderPaymentTermPatchSchema.safeParse('').success).toBe(false);
    });
});
