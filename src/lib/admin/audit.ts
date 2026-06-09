import { supabaseAdmin } from '@/lib/auth/supabase-auth';
import { logger } from '@/lib/utils/logger';

/**
 * Admin панелийн эмзэг үйлдлийг бүртгэх (best-effort).
 */
export async function logAdminAudit(params: {
    actorId?: string | null;
    action: string;
    targetId?: string | null;
    meta?: Record<string, unknown>;
}): Promise<void> {
    try {
        await supabaseAdmin()
            .from('admin_audit_log')
            .insert({
                actor_id: params.actorId || null,
                action: params.action,
                target_id: params.targetId || null,
                meta: params.meta || {},
            });
    } catch (error) {
        logger.warn('[Admin Audit] log failed', { action: params.action, error });
    }
}
