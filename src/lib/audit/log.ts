/**
 * Нэгдсэн аудит мөр — `activity_log`.
 *
 * Өмнө нь аудит 5 салангид хүснэгтэд тархсан, тус бүр өөр схемтэй байсан
 * (санхүүд actor алга, админд shop алга, аль нь ч before/after эсвэл IP
 * хадгалдаггүй). Энэ модуль тэдгээрийг НЭГ схем рүү нэгтгэнэ.
 *
 * Хэрэглэх гол зам нь `apiContext()` (src/lib/api/context.ts) — тэр нь
 * actor / shop / IP / user-agent-ыг урьдчилан бөглөсөн бичигч буцаадаг.
 * Шууд `logActivity` дуудах нь cron, webhook зэрэг хэрэглэгчгүй урсгалд.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export type AuditSource = 'ui' | 'ai' | 'cron' | 'webhook' | 'import' | 'api';
export type AuditStatus = 'success' | 'denied' | 'error';

export interface AuditActor {
    id?: string | null;
    name?: string | null;
    role?: string | null;
}

export interface AuditEvent {
    shopId?: string | null;
    actor?: AuditActor;
    source?: AuditSource;
    entity: string;
    entityId?: string | null;
    action: string;
    summary?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    status?: AuditStatus;
    errorMessage?: string | null;
    /** Хүсэлт өгвөл IP / user-agent автоматаар салгаж авна */
    request?: Request | null;
    requestId?: string | null;
}

/**
 * Логт ХЭЗЭЭ Ч орж болохгүй талбарууд. Аудит нь нотлох баримт болох ёстой
 * ч нууц задруулах суваг болох ёсгүй.
 */
const REDACTED_KEYS = [
    'password', 'passwd', 'secret', 'token', 'access_token', 'refresh_token',
    'api_key', 'apikey', 'authorization', 'cookie', 'session',
    'facebook_page_access_token', 'instagram_access_token', 'service_role',
    'vapid_private_key', 'private_key',
];

function isSensitiveKey(key: string): boolean {
    const k = key.toLowerCase();
    return REDACTED_KEYS.some(s => k.includes(s));
}

/** Эмзэг талбарыг '[redacted]' болгоно (гүн рекурс). */
export function redact(value: unknown, depth = 0): unknown {
    if (depth > 6 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = isSensitiveKey(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
}

function shallowEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a === 'object' || typeof b === 'object') {
        try {
            return JSON.stringify(a) === JSON.stringify(b);
        } catch {
            return false;
        }
    }
    // Огноо/тоо нь string ба number хэлбэрээр ирж болзошгүй тул сул харьцуулна
    return String(a) === String(b);
}

/**
 * before/after хоёроос ЗӨВХӨН өөрчлөгдсөн талбарыг ялгана.
 *
 * Бүтэн мөрийг хадгалбал лог хэдэн дахин том болж, унших ч хэцүү болно.
 * Зөвхөн зөрүүг үлдээснээр «юу өөрчлөгдсөн» нь шууд харагдана.
 */
export function diffFields<T extends Record<string, unknown>>(
    before: T | null | undefined,
    after: T | null | undefined,
    ignore: string[] = ['updated_at', 'created_at'],
): { before: Record<string, unknown>; after: Record<string, unknown> } {
    const skip = new Set(ignore);
    const b: Record<string, unknown> = {};
    const a: Record<string, unknown> = {};

    if (!before && !after) return { before: b, after: a };

    const keys = new Set([
        ...Object.keys(before || {}),
        ...Object.keys(after || {}),
    ]);

    for (const key of keys) {
        if (skip.has(key)) continue;
        const bv = before ? (before as Record<string, unknown>)[key] : undefined;
        const av = after ? (after as Record<string, unknown>)[key] : undefined;
        if (!shallowEqual(bv, av)) {
            if (bv !== undefined) b[key] = bv;
            if (av !== undefined) a[key] = av;
        }
    }

    return { before: b, after: a };
}

/** Прокси/CDN-ийн ард байгаа клиентийн IP-г таамаглана. */
function clientIp(request?: Request | null): string | null {
    if (!request) return null;
    const fwd = request.headers.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim() || null;
    return request.headers.get('x-real-ip') || null;
}

/**
 * Аудит мөр бичнэ.
 *
 * Best-effort — бичилт унасан ч үндсэн үйлдлийг ХЭЗЭЭ Ч унагахгүй. Гэхдээ
 * хуучин 4 суваг шиг ЧИМЭЭГҮЙ алга болохгүй: алдааг logger.error-оор
 * тэмдэглэнэ (Sentry идэвхжсэн тул бодитоор хүрнэ).
 */
export async function logActivity(event: AuditEvent): Promise<void> {
    try {
        const { before, after } = {
            before: event.before ? (redact(event.before) as Record<string, unknown>) : null,
            after: event.after ? (redact(event.after) as Record<string, unknown>) : null,
        };

        const { error } = await supabaseAdmin()
            .from('activity_log')
            .insert({
                shop_id: event.shopId ?? null,
                actor_id: event.actor?.id ?? null,
                actor_name: event.actor?.name ?? null,
                actor_role: event.actor?.role ?? null,
                source: event.source ?? 'api',
                entity: event.entity,
                entity_id: event.entityId ?? null,
                action: event.action,
                summary: event.summary ?? null,
                before,
                after,
                request_ip: clientIp(event.request),
                user_agent: event.request?.headers.get('user-agent') ?? null,
                request_id: event.requestId ?? null,
                status: event.status ?? 'success',
                error_message: event.errorMessage ?? null,
            });

        if (error) {
            // Хүснэгт хараахан үүсээгүй орчинд (migration ороогүй) чимээгүй өнгөрнө
            if (/relation .*activity_log.* does not exist/i.test(error.message)) return;
            logger.error('[activity_log] бичилт амжилтгүй', {
                message: error.message, entity: event.entity, action: event.action,
            });
        }
    } catch (err) {
        logger.error('[activity_log] гэнэтийн алдаа', { error: String(err) });
    }
}
