/**
 * ActivityService — үйл ажиллагааны нэгдсэн бүртгэл (activity_log).
 *
 * ЯАГААД: систем өмнө нь ЗӨВХӨН ҮР ДҮНГ (гэрээ, орлого) бүртгэдэг байсан тул
 * «Болд өчигдөр юу хийсэн бэ?» гэдэгт хариулах өгөгдөл огт байгаагүй.
 * Улмаас удирдлага зөвхөн гэрээ хийсэн менежерийг хардаг, идэвхтэй ажилласан ч
 * гэрээ хаагаагүй хүн харагдахгүй байв.
 *
 * Бүх бичилт server route / AI tool-оор явна (activity_log-д зөвхөн service_role
 * INSERT хийх policy-тэй). Append-only — засах/устгах policy зориуд байхгүй.
 *
 * Best-effort: бүртгэл амжилтгүй болсон ч үндсэн үйлдлийг ХЭЗЭЭ Ч унагахгүй.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export type ActivityEntity =
    | 'lead' | 'customer' | 'viewing' | 'contract' | 'property' | 'unit' | 'task';

export type ActivityKind =
    | 'call' | 'sms' | 'messenger' | 'meeting' | 'viewing' | 'note'
    | 'status_change' | 'assign' | 'create' | 'update' | 'delete' | 'message_sent';

export type ActivityOutcome =
    | 'connected' | 'no_answer' | 'busy' | 'wrong_number' | 'scheduled' | 'n/a';

export type ActivitySource = 'ui' | 'ai' | 'webhook' | 'import' | 'cron';

export interface ActivityEntry {
    shopId: string;
    actorId?: string | null;
    /** Каноник менежерийн нэр (resolveManagerIdentity-ээс). */
    actorName?: string | null;
    entityType: ActivityEntity;
    entityId?: string | null;
    kind: ActivityKind;
    direction?: 'out' | 'in' | null;
    outcome?: ActivityOutcome | null;
    body?: string | null;
    durationSec?: number | null;
    source?: ActivitySource;
    payload?: Record<string, unknown> | null;
    occurredAt?: string | null;
}

/** Бичилтийн үр дүн — дуудагч шаардлагатай бол шалгаж чадна. */
export interface ActivityWriteResult {
    ok: boolean;
    error?: string;
}

/**
 * Нэг үйл ажиллагааг бүртгэнэ.
 *
 * ХЭЗЭЭ Ч throw хийхгүй — үндсэн үйлдлийг унагаахгүй. Гэхдээ үр дүнг БУЦААНА:
 * ихэнх дуудагчид үүнийг үл тоомсорлож болно (тэдний жинхэнэ бичилт тусад нь
 * шалгагддаг), харин бүртгэл нь ЦОРЫН ГАНЦ үр дүн болох дуудагч (log_activity)
 * үүнийг шалгаж, хэрэглэгчид худал «амжилттай» гэж хэлэхээс сэргийлнэ.
 */
export async function recordActivity(entry: ActivityEntry): Promise<ActivityWriteResult> {
    if (!entry.shopId) return { ok: false, error: 'shopId байхгүй' };
    try {
        const { error } = await supabaseAdmin()
            .from('activity_log')
            .insert({
                shop_id: entry.shopId,
                actor_id: entry.actorId ?? null,
                actor_name: entry.actorName?.trim() || null,
                entity_type: entry.entityType,
                entity_id: entry.entityId ?? null,
                kind: entry.kind,
                direction: entry.direction ?? null,
                outcome: entry.outcome ?? null,
                body: entry.body?.slice(0, 4000) ?? null,
                duration_sec: entry.durationSec ?? null,
                source: entry.source ?? 'ui',
                payload: entry.payload ?? null,
                occurred_at: entry.occurredAt ?? new Date().toISOString(),
            });

        if (error) {
            // Миграци ороогүй орчинд хүснэгт байхгүй байж болно — тасалдуулахгүй.
            logger.warn('[Activity] бичилт амжилтгүй', {
                error: error.message, kind: entry.kind, entity: entry.entityType,
            });
            return { ok: false, error: error.message };
        }
        return { ok: true };
    } catch (err) {
        logger.warn('[Activity] гэнэтийн алдаа', { error: String(err) });
        return { ok: false, error: String(err) };
    }
}

/** Хэд хэдэн үйл ажиллагааг зэрэг бүртгэнэ (тус бүрийн алдааг залгина). */
export async function recordActivities(entries: ActivityEntry[]): Promise<void> {
    await Promise.all(entries.map((e) => recordActivity(e)));
}
