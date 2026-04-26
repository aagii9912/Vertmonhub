/**
 * Cron: Data Cleanup
 * - Archive chat_history > 90 days
 * - Purge archived chat_history > 180 days
 * - Clean expired AI memory > 365 days
 * 
 * Vercel Cron: runs daily at midnight (0 0 * * *)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

        // 3. Clean expired AI memory (> 365 days)
        try {
            const { data: memoryResult } = await supabase.rpc('cleanup_expired_ai_memory', { days_old: 365 });
            results.memory_cleaned = memoryResult || 0;
        } catch (e) {
            logger.warn('[Cron] cleanup_expired_ai_memory RPC not available:', { error: e });
            results.memory_cleaned = 'skipped';
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
