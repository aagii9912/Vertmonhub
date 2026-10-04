/**
 * Гэрээ шилжүүлэх (шинэ эзэмшигч) ба эзэмшигчийн нэр засах — client-safe дүрэм.
 * API (`ContractService`), AI tool, `ContractTransferDialog` нэг schema-гаар шалгана;
 * `transfer_contract` RPC бүгдийг дахин шалгаж, гэрээг түгжээд нэг гүйлгээнд бичнэ.
 * Төлсөн дүн, менежер, гэрээний огноо, лид, тоот, дугаар энэ урсгалд өөрчлөгдөхгүй.
 */
import { z } from 'zod';
import type { ContractTransfer } from '@/types/property';

export const CONTRACT_TRANSFER_KINDS = ['transfer', 'rename'] as const;
export type ContractTransferKind = typeof CONTRACT_TRANSFER_KINDS[number];

/** Зөвхөн идэвхтэй/хаагдсан гэрээ (цуцалсан, ERP «Тоот шилжсэн» биш) — RPC-тэй ижил. */
export const TRANSFERABLE_CONTRACT_STATUSES: readonly string[] = ['active', 'closed'];
export function isTransferableContract(status: string | null | undefined): boolean {
    return !!status && TRANSFERABLE_CONTRACT_STATUSES.includes(status);
}

/** Регистр/паспорт: зайг хасаж том үсгээр. Улсын тодорхой форматыг шаардахгүй (гадаад паспорт). */
export function normalizeRegistration(raw: string): string {
    return raw.replace(/\s+/g, '').toUpperCase();
}
const REGISTRATION_RE = /^[\p{L}\d-]{4,20}$/u;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const optionalText = (max: number, message: string) => z.string().trim().max(max, message).nullable().optional();

export const TransferContractSchema = z.object({
    /** Нэг цонх/preview-д нэг UUID — давтан илгээлт давхар шилжүүлэг үүсгэхгүй. */
    client_request_id: z.string().uuid('Хүсэлтийн UUID буруу байна'),
    kind: z.enum(CONTRACT_TRANSFER_KINDS, 'Шилжүүлгийн төрлийг сонгоно уу'),
    customer_name: z.string().trim().min(1, 'Шинэ эзэмшигчийн нэрийг оруулна уу').max(255, 'Нэр хэт урт байна'),
    customer_first_name: optionalText(100, 'Нэр хэт урт байна'),
    customer_last_name: optionalText(100, 'Овог хэт урт байна'),
    customer_registration: z.string().transform(normalizeRegistration).nullable().optional(),
    customer_phone: optionalText(50, 'Утасны дугаар хэт урт байна'),
    customer_mobile: optionalText(50, 'Утасны дугаар хэт урт байна'),
    /** YYYY-MM-DD; өгөхгүй бол өнөөдөр (УБ). */
    effective_date: z.string().regex(DATE_RE, 'Шилжүүлсэн огноо YYYY-MM-DD хэлбэртэй байна')
        .refine(isCalendarDate, 'Шилжүүлсэн огноо буруу байна').optional(),
    reason: optionalText(2000, 'Шалтгаан 2000 тэмдэгтээс ихгүй байна'),
    /** Цонх нээх үеийн эзэмшигч — хооронд нь өөр хүн сольсон бол 409. */
    expected_customer_name: z.string().max(1000).nullable().optional(),
}).strict().superRefine((value, ctx) => {
    const registration = value.customer_registration || null;
    if (registration && !REGISTRATION_RE.test(registration)) {
        ctx.addIssue({ code: 'custom', path: ['customer_registration'], message: 'Регистр/паспортын дугаар 4–20 үсэг, тоо байна' });
    }
    if (value.kind === 'transfer') {
        if (!registration) ctx.addIssue({ code: 'custom', path: ['customer_registration'], message: 'Шинэ эзэмшигчийн регистрийг оруулна уу' });
        if (!value.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Шилжүүлсэн шалтгааныг оруулна уу' });
    }
});
export type TransferContractInput = z.input<typeof TransferContractSchema>;
export type TransferContractData = z.output<typeof TransferContractSchema>;

/** Zod алдааг хэрэглэгчид харуулах нэг монгол мессеж болгоно. */
export function transferInputError(error: z.ZodError): string {
    const issue = error.issues[0];
    if (!issue) return 'Гэрээ шилжүүлэх өгөгдөл буруу байна';
    if (issue.code === 'unrecognized_keys') {
        return `Гэрээ шилжүүлэхэд зөвшөөрөгдөөгүй талбар: ${issue.keys.join(', ')}. Төлбөр, менежер, огноог энэ урсгалаар өөрчлөхгүй.`;
    }
    if (issue.path[0] === 'client_request_id') return 'Давхар илгээлтээс хамгаалах хүсэлтийн UUID шаардлагатай. Цонхоо дахин нээнэ үү.';
    return /[А-Яа-яӨөҮүЁё]/.test(issue.message) ? issue.message : 'Гэрээ шилжүүлэх өгөгдөл буруу байна';
}

/** Шилжүүлсэн огноо гэрээний огнооноос хойш, өнөөдрөөс (УБ) хэтрэхгүй. Бүх утга YYYY-MM-DD. */
export function transferDateError(effectiveDate: string, contractDate: string | null | undefined, today: string): string | null {
    if (effectiveDate > today) return 'Шилжүүлсэн огноо өнөөдрөөс хэтрэхгүй';
    const signed = contractDate ? contractDate.slice(0, 10) : null;
    if (signed && effectiveDate < signed) return 'Шилжүүлсэн огноо гэрээ байгуулсан огнооноос өмнө байж болохгүй';
    return null;
}

export interface ContractTransferSummary {
    /** Анхны худалдан авагч (эхний шилжүүлгийн өмнөх эзэмшигч). Зөвхөн нэр засвартай бол null. */
    originalHolder: string | null;
    /** Сүүлийн шилжүүлгийн (нэр засвар биш) огноо. */
    lastTransferDate: string | null;
    transfers: number;
}

/** Нэг гэрээний түүхээс экспорт/самбарын хураангуй. Мөрүүдийн дараалал хамаагүй. */
export function summarizeContractTransfers(
    rows: ReadonlyArray<Pick<ContractTransfer, 'kind' | 'effective_date' | 'from_customer_name' | 'created_at'>>,
): ContractTransferSummary {
    const ordered = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const transfers = ordered.filter(row => row.kind === 'transfer');
    return {
        originalHolder: transfers.length ? ordered[0].from_customer_name || null : null,
        lastTransferDate: transfers.length ? transfers[transfers.length - 1].effective_date : null,
        transfers: transfers.length,
    };
}
