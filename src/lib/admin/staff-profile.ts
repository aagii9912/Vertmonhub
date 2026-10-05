/**
 * Ажилтны профайлын дүрэм (нэр, утас) — Админ → Хэрэглэгчид UI, admin API болон AI
 * хэрэглэгч урих tool ижил дүрмийг ашиглана. Client-safe: DB/серверийн import-гүй.
 */
import { z } from 'zod';
import { normalizePhone } from '@/lib/utils/phone';

export const STAFF_PHONE_ERROR = 'Утасны дугаар 8 оронтой байх ёстой';
export const MANAGER_NAME_REQUIRED = 'Борлуулалтын менежерийн бодит нэрийг оруулна уу';
/**
 * Менежерийн бүртгэлд холбогдсон (идэвхгүй мөр ч) акаунтын нэр нь ERP, KPI, лидийн
 * хариуцагчийн canonical нэр: идэвхгүй холбоос дахин идэвхжихдээ хуучин нэрээрээ сэргэнэ.
 */
export const LINKED_MANAGER_RENAME_ERROR =
    'Борлуулалтын менежерийн бүртгэлтэй (идэвхгүй мөрийг оролцуулан) холбогдсон акаунтын нэрийг энд солихгүй: ERP, KPI болон лидийн хариуцагч тэр нэрээр холбогддог. Эхлээд Борлуулалтын төлөвлөгөө хэсэгт «Акаунтын холбоос салгах»-аар холбоосыг салгана.';

/**
 * Хоосон утга → null (утасгүй). Бусад үед `normalizePhone` (+976, зай, зураас хасна)
 * дараа яг 8 цифр байх ёстой. Хог текстийг null болгож чимээгүй залгихгүй.
 */
export const staffPhoneInput = z.preprocess(
    (value) => {
        if (value === undefined || value === null) return null;
        if (typeof value !== 'string') return value;
        if (!value.trim()) return null;
        return normalizePhone(value) ?? value;
    },
    z.string().regex(/^\d{8}$/, STAFF_PHONE_ERROR).nullable(),
);

/** Нормчилсон 8 оронтой дугаар, хоосон бол null, буруу бол false (UI-ийн шууд шалгалт). */
export function parseStaffPhone(raw: string | null | undefined): string | null | false {
    const parsed = staffPhoneInput.safeParse(raw);
    return parsed.success ? parsed.data : false;
}

/** «99112233» → «9911 2233». Нормчлогдоогүй хуучин утгыг байгаагаар нь харуулна. */
export function formatStaffPhone(phone: string | null | undefined): string {
    if (!phone) return '';
    return /^\d{8}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4)}` : phone;
}

/** Борлуулалтын менежерт имэйлээс өөр бодит нэр заавал (лид, KPI нэрээр холбогдоно). */
export function managerNameMissing(role: string | null | undefined, fullName: string | null | undefined, email: string | null | undefined): boolean {
    if (role !== 'sales_manager') return false;
    const name = (fullName || '').trim();
    return !name || name.toLowerCase() === (email || '').trim().toLowerCase();
}
