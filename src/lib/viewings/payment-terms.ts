/**
 * Уулзалтын «Урьдчилгаа төлбөрийн нөхцөл», «Үлдэгдэл төлбөрийн нөхцөл» — харилцагчийн сонирхсон төлбөрийн хэлбэр
 * (борлуулалтын багийн хүсэлт 2026-11-12; эзэмшигчийн шийдвэр 2026-11-13: тогтмол жагсаалт). Client-safe, pure.
 *
 * • DB-д КОД хадгална (`property_viewings.advance_payment_term` / `remainder_payment_term`); нэр, дараалал ЭНД.
 *   Шинэ сонголт нэмэхэд энэ файлд мөр нэмэхэд хангалттай (migration хэрэггүй). Хэрэглэгдсэн кодыг устгахгүй —
 *   хуучин мөр нэрээ алдана; хэрэглэхээ больсон бол `retired: true` (шинээр сонгогдохгүй, нэр нь харагдана).
 * • Мөнгө биш: сонирхол. Гэрээний `prepayment_condition`, сонирхсон байрны үнийн «Төлбөрийн нөхцөл»
 *   (`interests[].payment_condition`: 10–30%, 30%, 50%) хоёулаа тусдаа ойлголт — хооронд нь хольж тоолохгүй.
 * • Уулзалт бүрт төрөл тус бүрээс нэг сонголт; NULL = бүртгээгүй (тайланд «Тодорхойгүй», 0 биш).
 */
import { z } from 'zod';

export type PaymentTermKind = 'advance' | 'remainder';
export interface PaymentTermOption { code: string; label: string; retired?: boolean }

export const PAYMENT_TERM_FIELD_LABEL: Record<PaymentTermKind, string> = {
    advance: 'Урьдчилгаа төлбөрийн нөхцөл',
    remainder: 'Үлдэгдэл төлбөрийн нөхцөл',
};

export const PAYMENT_TERM_COLUMN = {
    advance: 'advance_payment_term',
    remainder: 'remainder_payment_term',
} as const satisfies Record<PaymentTermKind, string>;

export const PAYMENT_TERM_OPTIONS: Record<PaymentTermKind, readonly PaymentTermOption[]> = {
    advance: [
        { code: 'cash', label: 'Бэлэн' },
        { code: 'barter', label: 'Бартер' },
        { code: 'split', label: 'Урьдчилгаа хуваах' },
    ],
    remainder: [
        { code: 'mortgage', label: 'Ипотек' },
        { code: 'bank_loan', label: 'Энгийн зээл' },
        { code: 'leasing', label: 'Хувь лизинг' },
        { code: 'cash', label: 'Бэлэн' },
    ],
};

/** Шинээр сонгож болох сонголтууд; `current` — мөрийн одоогийн (хэрэглэхээ больсон ч) утга хэвээр харагдана. */
export function selectablePaymentTerms(kind: PaymentTermKind, current?: string | null): PaymentTermOption[] {
    return PAYMENT_TERM_OPTIONS[kind].filter(option => !option.retired || option.code === current);
}

/** Кодын монгол нэр; жагсаалтад байхгүй код (хуучин өгөгдөл) өөрөөрөө харагдана, хоосон бол null. */
export function paymentTermLabel(kind: PaymentTermKind, code: string | null | undefined): string | null {
    if (!code) return null;
    return PAYMENT_TERM_OPTIONS[kind].find(option => option.code === code)?.label ?? code;
}

/** Нэг мөрийн тайлбар: «Урьдчилгаа: Бэлэн · Үлдэгдэл: Ипотек»; хоёулаа хоосон бол null. */
export function paymentTermsText(terms: { advance_payment_term?: string | null; remainder_payment_term?: string | null }): string | null {
    const advance = paymentTermLabel('advance', terms.advance_payment_term);
    const remainder = paymentTermLabel('remainder', terms.remainder_payment_term);
    return [advance ? `Урьдчилгаа: ${advance}` : null, remainder ? `Үлдэгдэл: ${remainder}` : null].filter(Boolean).join(' · ') || null;
}

const codeSchema = (kind: PaymentTermKind) => z.string().refine(
    value => PAYMENT_TERM_OPTIONS[kind].some(option => option.code === value && !option.retired),
    { message: `«${PAYMENT_TERM_FIELD_LABEL[kind]}» буруу байна` },
);

/** Шинэ уулзалт: кодыг сонгоогүй бол null/undefined. */
export const AdvancePaymentTermSchema = codeSchema('advance').nullish();
export const RemainderPaymentTermSchema = codeSchema('remainder').nullish();
/** Засвар: null = цэвэрлэх, undefined = хөндөхгүй. */
export const AdvancePaymentTermPatchSchema = codeSchema('advance').nullable().optional();
export const RemainderPaymentTermPatchSchema = codeSchema('remainder').nullable().optional();
