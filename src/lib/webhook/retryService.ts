/**
 * Webhook helpers — Graph API илгээлтийн exponential backoff ба Meta event-ийн давхардлын шалгалт.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * Retry configuration
 */
export interface RetryConfig {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 60000, // 1 minute max
    backoffMultiplier: 2,
};

/**
 * Calculate delay for exponential backoff
 */
export function calculateBackoffDelay(
    attempt: number,
    config: RetryConfig = {}
): number {
    const { initialDelayMs, maxDelayMs, backoffMultiplier } = {
        ...DEFAULT_RETRY_CONFIG,
        ...config,
    };

    const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);

    return Math.min(delay + jitter, maxDelayMs);
}

/**
 * Webhook event давхардсан эсэхийг шалгана (idempotency).
 *
 * Meta нэг event-ийг хэд хэдэн удаа илгээж болдог тул event_id-г
 * webhook_dedup хүснэгтэд оруулахыг оролдоно. Оруулж чадвал анх удаа
 * (давхардаагүй) → false. Unique зөрчил гарвал давхардсан → true.
 *
 * DB алдаа гарвал боловсруулалтыг зогсоохгүйн тулд false буцаана
 * (хариу алдагдахаас давхардал илүү дээр гэж үзэв — fail-open).
 */
export async function isDuplicateWebhookEvent(eventId: string): Promise<boolean> {
    if (!eventId) return false;

    const supabase = supabaseAdmin();

    try {
        const { error } = await supabase
            .from('webhook_dedup')
            .insert({ event_id: eventId });

        if (!error) return false; // Амжилттай оруулсан → анх удаа

        // 23505 = unique_violation → аль хэдийн боловсруулсан event
        if (error.code === '23505') {
            logger.info('Duplicate webhook event skipped', { eventId });
            return true;
        }

        logger.warn('Webhook dedup check failed, processing anyway', { eventId, error: error.message });
        return false;
    } catch (err) {
        logger.warn('Webhook dedup error, processing anyway', { eventId, error: String(err) });
        return false;
    }
}
