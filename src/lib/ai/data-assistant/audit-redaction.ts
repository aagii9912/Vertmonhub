/**
 * AI аудитыг (`GET /api/dashboard/ai-audit`) админ түвшний бүх дүр уншдаг тул ажилтны
 * хувийн мэдээллийг утгагүйгээр бичнэ: талбар байсныг харуулж, утгыг нууна.
 */
const REDACTED_AUDIT_ARGS: Partial<Record<string, readonly string[]>> = {
    invite_user: ['phone'],
    // Гэрээний шинэ эзэмшигчийн регистр/паспорт, утас: «Гэрээ» модульгүй админ дүр аудитаас уншихгүй.
    transfer_contract: ['customer_registration', 'customer_phone', 'customer_mobile'],
};
export const AUDIT_REDACTED = '(нуусан)';

/** Аудитад бичих tool-ийн args — хувийн талбаруудыг (байвал) `(нуусан)` болгоно. */
export function redactAuditArgs(tool: string, args: Record<string, unknown> = {}): Record<string, unknown> {
    const keys = REDACTED_AUDIT_ARGS[tool];
    if (!keys?.length) return args;
    const redacted = { ...args };
    for (const key of keys) {
        const value = redacted[key];
        if (value !== undefined && value !== null && value !== '') redacted[key] = AUDIT_REDACTED;
    }
    return redacted;
}
