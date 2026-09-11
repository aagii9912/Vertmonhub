/**
 * Cron: Data Cleanup
 * - Archive chat_history > 90 days
 * - Purge archived chat_history > 180 days
 * - Clean expired AI memory > 365 days
 * 
 * Vercel Cron: runs daily at midnight (0 0 * * *)
 */

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
    // Verify cron secret
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = supabaseAdmin();
        const results: Record<string, any> = {};

        // 1. Archive old chat history (> 90 days)
        try {
            const { data: archiveResult } = await supabase.rpc('archive_old_chat_history', { days_old: 90 });
            results.chat_archived = archiveResult || 0;
        } catch (e) {
            logger.warn('[Cron] archive_old_chat_history RPC not available:', { error: e });
            results.chat_archived = 'skipped';
        }

        // 2. Purge very old archived messages (> 180 days)
        try {
            const { data: purgeResult } = await supabase.rpc('purge_archived_chat_history', { days_old: 180 });
            results.chat_purged = purgeResult || 0;
        } catch (e) {
            logger.warn('[Cron] purge_archived_chat_history RPC not available:', { error: e });
            results.chat_purged = 'skipped';
        }

        // 3. Rate limiter-ийн хуучирсан мөрүүд (> 1 цаг). pg_cron `cleanup_rate_limits`
        //    prod-д ажиллаагүй тул хүснэгт 40k+ мөр болтлоо өссөн байсан (2026-09 review M10).
        //    (Өмнөх `cleanup_expired_ai_memory` RPC нь байхгүй `ai_memory` хүснэгт рүү заадаг байсан тул хасав.)
        try {
            const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const { error: rlError } = await supabase
                .from('rate_limits')
                .delete()
                .lt('reset_at', cutoff);
            results.rate_limits_cleaned = rlError ? 'skipped' : 'ok';
            if (rlError) logger.warn('[Cron] rate_limits cleanup failed:', { error: rlError.message });
        } catch (e) {
            logger.warn('[Cron] rate_limits cleanup failed:', { error: e });
            results.rate_limits_cleaned = 'skipped';
        }

        // 4. Webhook idempotency бүртгэлийг цэвэрлэх (> 7 хоног)
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 7);
            const { error: dedupError } = await supabase
                .from('webhook_dedup')
                .delete()
                .lt('created_at', cutoff.toISOString());
            results.webhook_dedup_cleaned = dedupError ? 'skipped' : 'ok';
        } catch (e) {
            logger.warn('[Cron] webhook_dedup cleanup failed:', { error: e });
            results.webhook_dedup_cleaned = 'skipped';
        }

        logger.info('[Cron] Data cleanup completed', results);

        return NextResponse.json({
            success: true,
            ...results,
            cleaned_at: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('[Cron] data-cleanup error:', { error });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET for Vercel cron
export async function GET(request: Request) {
    return POST(request);
}
