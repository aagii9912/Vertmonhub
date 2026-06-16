/**
 * Webhook Retry Service
 * Handles failed webhook deliveries with exponential backoff
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { captureException } from '@/lib/monitoring/errorMonitoring';

/**
 * Webhook job status
 */
export type WebhookJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead';

/**
 * Webhook job data
 */
export interface WebhookJob {
    id: string;
    type: 'message' | 'comment_reply' | 'notification';
    payload: Record<string, unknown>;
    status: WebhookJobStatus;
    attempts: number;
    maxAttempts: number;
    lastError?: string;
    nextRetryAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

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
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    config: RetryConfig = {},
    context?: { operationName?: string; shopId?: string }
): Promise<T> {
    const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier } = {
        ...DEFAULT_RETRY_CONFIG,
        ...config,
    };

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt === maxAttempts) {
                logger.error(`[Retry] All ${maxAttempts} attempts failed`, {
                    operation: context?.operationName,
                    error: lastError.message,
                });
                break;
            }

            const delay = calculateBackoffDelay(attempt, { initialDelayMs, maxDelayMs, backoffMultiplier });

            logger.warn(`[Retry] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`, {
                operation: context?.operationName,
                error: lastError.message,
            });

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // Capture final failure
    captureException(lastError, {
        shopId: context?.shopId,
        action: context?.operationName,
        metadata: { maxAttempts },
    });

    throw lastError;
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

/**
 * Queue a webhook job for retry (DB-based for persistence)
 */
export async function queueWebhookJob(
    type: WebhookJob['type'],
    payload: Record<string, unknown>,
    config: RetryConfig = {}
): Promise<string | null> {
    const supabase = supabaseAdmin();
    const { maxAttempts } = { ...DEFAULT_RETRY_CONFIG, ...config };

    try {
        const { data, error } = await supabase
            .from('webhook_jobs')
            .insert({
                type,
                payload,
                status: 'pending',
                attempts: 0,
                max_attempts: maxAttempts,
                next_retry_at: new Date().toISOString(),
            })
            .select('id')
            .single();

        if (error) {
            logger.error('Failed to queue webhook job:', { error: error.message });
            return null;
        }

        logger.info('Webhook job queued:', { id: data.id, type });
        return data.id;
    } catch (error) {
        logger.error('Error queueing webhook job:', { error });
        return null;
    }
}

/**
 * Process a single webhook job
 */
export async function processWebhookJob(
    job: WebhookJob,
    processor: (payload: Record<string, unknown>) => Promise<void>
): Promise<{ success: boolean; shouldRetry: boolean }> {
    const supabase = supabaseAdmin();

    try {
        // Mark as processing
        await supabase
            .from('webhook_jobs')
            .update({ status: 'processing', updated_at: new Date().toISOString() })
            .eq('id', job.id);

        // Execute the job
        await processor(job.payload);

        // Mark as completed
        await supabase
            .from('webhook_jobs')
            .update({
                status: 'completed',
                updated_at: new Date().toISOString()
            })
            .eq('id', job.id);

        logger.success('Webhook job completed:', { id: job.id });
        return { success: true, shouldRetry: false };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const newAttempts = job.attempts + 1;

        if (newAttempts >= job.maxAttempts) {
            // Mark as dead (exhausted retries)
            await supabase
                .from('webhook_jobs')
                .update({
                    status: 'dead',
                    attempts: newAttempts,
                    last_error: errorMessage,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', job.id);

            logger.error('Webhook job dead (max retries reached):', { id: job.id, error: errorMessage });

            captureException(error, {
                action: 'webhook_job_dead',
                metadata: { jobId: job.id, type: job.type, attempts: newAttempts },
            });

            return { success: false, shouldRetry: false };
        }

        // Schedule retry
        const nextRetryDelay = calculateBackoffDelay(newAttempts);
        const nextRetryAt = new Date(Date.now() + nextRetryDelay);

        await supabase
            .from('webhook_jobs')
            .update({
                status: 'pending',
                attempts: newAttempts,
                last_error: errorMessage,
                next_retry_at: nextRetryAt.toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);

        logger.warn('Webhook job scheduled for retry:', {
            id: job.id,
            attempt: newAttempts,
            nextRetry: nextRetryAt
        });

        return { success: false, shouldRetry: true };
    }
}

/**
 * Get pending webhook jobs for processing
 */
export async function getPendingJobs(limit: number = 10): Promise<WebhookJob[]> {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
        .from('webhook_jobs')
        .select('*')
        .eq('status', 'pending')
        .lte('next_retry_at', new Date().toISOString())
        .order('next_retry_at', { ascending: true })
        .limit(limit);

    if (error) {
        logger.error('Failed to fetch pending jobs:', { error: error.message });
        return [];
    }

    return (data || []).map(job => ({
        id: job.id,
        type: job.type,
        payload: job.payload,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.max_attempts,
        lastError: job.last_error,
        nextRetryAt: job.next_retry_at ? new Date(job.next_retry_at) : undefined,
        createdAt: new Date(job.created_at),
        updatedAt: new Date(job.updated_at),
    }));
}

/**
 * Clean up old completed/dead jobs
 */
export async function cleanupOldJobs(olderThanDays: number = 7): Promise<number> {
    const supabase = supabaseAdmin();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // First count, then delete (Supabase delete doesn't return count)
    const { count } = await supabase
        .from('webhook_jobs')
        .select('*', { count: 'exact', head: true })
        .in('status', ['completed', 'dead'])
        .lt('updated_at', cutoffDate.toISOString());

    const { error } = await supabase
        .from('webhook_jobs')
        .delete()
        .in('status', ['completed', 'dead'])
        .lt('updated_at', cutoffDate.toISOString());

    if (error) {
        logger.error('Failed to cleanup old jobs:', { error: error.message });
        return 0;
    }

    logger.info('Cleaned up old webhook jobs:', { count });
    return count || 0;
}
