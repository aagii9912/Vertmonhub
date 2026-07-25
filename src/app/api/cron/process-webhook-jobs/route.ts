/**
 * Cron: Webhook Jobs боловсруулах (дахин оролдлогын дараалал)
 *
 * Хүргэлт амжилтгүй болсон webhook ажлуудыг (жишээ нь бүх оролдлого
 * унасан мессеж илгээлт) exponential backoff-оор дахин оролдоно.
 * retryService доторх getPendingJobs / processWebhookJob-г ашиглана.
 *
 * Vercel Cron: 5 минут тутамд.
 */

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { logger } from '@/lib/utils/logger';
import {
    getPendingJobs,
    processWebhookJob,
    cleanupOldJobs,
    type WebhookJob,
} from '@/lib/webhook/retryService';
import { sendTextMessage } from '@/lib/facebook/messenger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Ажлын төрлөөр нь зохих үйлдлийг гүйцэтгэнэ.
 * Алдаа шидвэл processWebhookJob дахин оролдоно (эсвэл dead болгоно).
 */
async function runJob(payload: Record<string, unknown>): Promise<void> {
    const recipientId = payload.recipientId as string | undefined;
    const message = payload.message as string | undefined;
    const pageAccessToken = payload.pageAccessToken as string | undefined;

    if (recipientId && message && pageAccessToken) {
        await sendTextMessage({ recipientId, message, pageAccessToken });
        return;
    }

    // Дэмжигдээгүй payload — дахин оролдох нь утгагүй тул чимээгүй өнгөрүүлнэ
    logger.warn('[Cron] Unknown webhook job payload, skipping', { keys: Object.keys(payload) });
}

export async function POST(request: Request) {
    // `if (CRON_SECRET && ...)` нь хувьсагч тохируулаагүй үед шалгалтыг
    // БҮРЭН алгасдаг байсан (fail-open).
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const jobs: WebhookJob[] = await getPendingJobs(25);
        let processed = 0;
        let succeeded = 0;

        for (const job of jobs) {
            const result = await processWebhookJob(job, runJob);
            processed++;
            if (result.success) succeeded++;
        }

        // Хуучин дууссан/үхсэн ажлуудыг цэвэрлэнэ (7+ хоног)
        const cleaned = await cleanupOldJobs(7);

        logger.info('[Cron] Webhook jobs processed', { processed, succeeded, cleaned });

        return NextResponse.json({
            success: true,
            processed,
            succeeded,
            cleaned,
            processed_at: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('[Cron] process-webhook-jobs error:', { error });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET for Vercel cron
export async function GET(request: Request) {
    return POST(request);
}
