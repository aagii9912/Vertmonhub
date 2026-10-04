/**
 * Лидийн «Үнийн санал» (lead_activities type 'quote') — client-safe нэг эх сурвалж.
 *
 * Менежер харилцагчид хэлсэн үнийг {amount, unit_label?}-аар түүхэнд хадгална. Энэ нь
 * гэрээний дүн, орлого, зорилт, KPI БИШ — зөвхөн менежерүүдийн хооронд үнийн зөрүү
 * илрүүлэх (lib/leads/timeline.ts) зорилготой. Хязгаар нь DB-ийн CHECK
 * (20261004162000_lead_activity_quotes.sql)-тэй ижил.
 */
import { z } from 'zod';
import { formatMNT } from '@/lib/utils/currency';

/** 10 их наяд ₮ — DB CHECK-ийн дээд хязгаар. */
export const QUOTE_MAX_AMOUNT = 10_000_000_000_000;
export const QUOTE_UNIT_MAX = 60;

export const QuoteAmountSchema = z.number({ error: 'Үнийн саналын дүнг оруулна уу' })
    .int('Үнийн саналын дүнг бүхэл төгрөгөөр оруулна уу')
    .positive('Үнийн саналын дүнг оруулна уу')
    .max(QUOTE_MAX_AMOUNT, 'Үнийн саналын дүн хэт их байна');

/** Байр/тоот: хоосон бол null (DB-д хоосон мөр хадгалахгүй). */
export const QuoteUnitSchema = z.string().trim()
    .max(QUOTE_UNIT_MAX, `Байр/тоотыг ${QUOTE_UNIT_MAX} тэмдэгтээс богино оруулна уу`)
    .nullish()
    .transform((value) => value || null);

export interface LeadQuoteInput {
    amount: number;
    unitLabel?: string | null;
}

/** Тайлбаргүй саналын түүхийн текст: «Үнийн санал: 450,000,000₮ · A-1203». */
export function quoteContent(amount: number, unitLabel?: string | null): string {
    const unit = unitLabel?.trim();
    return `Үнийн санал: ${formatMNT(amount)}${unit ? ` · ${unit}` : ''}`;
}

/** UI-ийн дүнгийн талбар: «450,000,000», «450 000 000₮» → 450000000; хоосон/0 → null. */
export function parseQuoteAmount(raw: string): number | null {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return null;
    const value = Number(digits);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Зөрүү харьцуулах түлхүүр: том/жижиг үсэг, давхар зай, «-»/«/»-ийн ялгааг үл тооцно. */
export function quoteUnitKey(unitLabel: string | null | undefined): string {
    return (unitLabel ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*([-/])\s*/g, '$1');
}
