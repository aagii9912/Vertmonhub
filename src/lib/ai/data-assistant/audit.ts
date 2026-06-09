import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

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
                args: params.args || {},
                success: params.success ?? true,
            });
    } catch (error) {
        logger.warn('[AI Audit] log failed', { tool: params.tool, error });
    }
}
