import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * Санхүүгийн аудит лог бичих туслах. Алдаа гарвал үндсэн үйлдлийг тасалдуулахгүй
 * (best-effort) — зөвхөн warning бичнэ.
 */
export async function logFinanceAudit(params: {
    shopId: string;
    action: string;
    entity?: string;
    entityId?: string | null;
    amount?: number | null;
    meta?: Record<string, unknown>;
}): Promise<void> {
    try {
        const supabase = supabaseAdmin();
        await supabase.from('finance_audit_log').insert({
            shop_id: params.shopId,
            action: params.action,
            entity: params.entity || null,
            entity_id: params.entityId || null,
            amount: params.amount ?? null,
            meta: params.meta || {},
        });
    } catch (error) {
        logger.warn('[Finance Audit] log failed', { action: params.action, error });
    }
}
