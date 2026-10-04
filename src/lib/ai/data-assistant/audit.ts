import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * AI аудитыг (`GET /api/dashboard/ai-audit`) админ түвшний бүх дүр уншдаг тул ажилтны
 * хувийн мэдээллийг утгагүйгээр бичнэ: талбар байсныг харуулж, утгыг нууна.
 */
const REDACTED_AUDIT_ARGS: Partial<Record<string, readonly string[]>> = {
    invite_user: ['phone'],
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

/**
 * AI Assistant-ээр хийсэн write/delete үйлдлийг бүртгэх. Best-effort —
 * алдаа гарвал үндсэн урсгалыг тасалдуулахгүй.
 */
export async function logAiAudit(params: {
    shopId: string;
    userId?: string | null;
    tool: string;
    args?: Record<string, unknown>;
    success?: boolean;
}): Promise<void> {
    try {
        await supabaseAdmin()
            .from('ai_audit_log')
            .insert({
                shop_id: params.shopId,
                user_id: params.userId || null,
                tool: params.tool,
                args: redactAuditArgs(params.tool, params.args),
                success: params.success ?? true,
            });
    } catch (error) {
        logger.warn('[AI Audit] log failed', { tool: params.tool, error });
    }
}
