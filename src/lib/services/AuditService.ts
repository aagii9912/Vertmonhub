/**
 * AuditService - CRM өгөгдлийн өөрчлөлтийн аудит лог
 *
 * Харилцагч/lead/гэрээ зэрэг бизнес өгөгдлийн create/update/delete үйлдлийг
 * data_audit_log хүснэгтэд бүртгэнэ. Best-effort — аудит бичилт амжилтгүй
 * болсон ч үндсэн үйлдлийг хэзээ ч унагахгүй.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export type AuditEntity = 'customer' | 'lead' | 'contract' | 'property' | 'viewing';
export type AuditAction = 'create' | 'update' | 'delete';

export interface AuditEntry {
    shopId?: string | null;
    actorId?: string | null;
    entity: AuditEntity;
    entityId?: string | null;
    action: AuditAction;
    changes?: Record<string, unknown>;
}

/**
 * Аудит бичилт хийнэ. Алдааг залгиж (best-effort) үндсэн урсгалыг хамгаална.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
    try {
        const supabase = supabaseAdmin();
        const { error } = await supabase.from('data_audit_log').insert({
            shop_id: entry.shopId ?? null,
            actor_id: entry.actorId ?? null,
            entity: entry.entity,
            entity_id: entry.entityId ?? null,
            action: entry.action,
            changes: entry.changes ?? {},
        });

        if (error) {
            logger.warn('[Audit] insert failed', { error: error.message, entity: entry.entity, action: entry.action });
        }
    } catch (err) {
        logger.warn('[Audit] unexpected error', { error: String(err) });
    }
}
