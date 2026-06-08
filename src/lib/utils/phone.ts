/**
 * Phone utilities — Монголын утасны дугаар нормчлох / таних
 *
 * Хуучин `(\d{8})` regex нь мессеж доторх дурын 8 оронтой тоог утас гэж андуурдаг
 * байсныг сайжруулна. Dedup-д ашиглах canonical хэлбэр: зөвхөн цифр, Монголын
 * улсын код (976)-ыг 8 оронтой дотоод дугаар руу хасна.
 */

/**
 * Дугаарыг нэгдсэн (canonical) хэлбэрт оруулна. Dedup болон phone_normalized-д ашиглана.
 * Жишээ: "+976 9911-2233" → "99112233", "97688445566" → "88445566"
 */
export function normalizePhone(raw?: string | null): string | null {
    if (!raw) return null;
    let digits = String(raw).replace(/\D/g, '');
    if (!digits) return null;

    // Монголын улсын кодыг хасах (976 / 00976)
    if (digits.length === 11 && digits.startsWith('976')) {
        digits = digits.slice(3);
    } else if (digits.length === 13 && digits.startsWith('00976')) {
        digits = digits.slice(5);
    }

    return digits || null;
}

/**
 * Нормчилсон дугаар нь Монголын мобайл дугаарын хэв маягтай эсэх (8 орон, 6-9-өөр эхэлнэ).
 */
export function isValidMongolianMobile(normalized?: string | null): boolean {
    return !!normalized && /^[6-9]\d{7}$/.test(normalized);
}

/**
 * Чөлөөт текстээс (чат мессеж) утасны дугаар олж нормчилсан хэлбэрээр буцаана.
 * Хүчинтэй Монгол мобайл дугаар олдвол л буцаана — санамсаргүй 8 оронтой тоог авахгүй.
 */
export function extractPhoneFromText(text?: string | null): string | null {
    if (!text) return null;
    const candidates = text.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
    for (const candidate of candidates) {
        const normalized = normalizePhone(candidate);
        if (isValidMongolianMobile(normalized)) {
            return normalized;
        }
    }
    return null;
}
