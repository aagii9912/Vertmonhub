import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { syncElysiumLeads } from '@/lib/services/ElysiumLeadSync';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET/POST /api/cron/elysium-leads-sync (15 минут тутам)
 * Elysium.mn-ийн `event_leads`-ийг CRM-тэй тулгаж, шууд дамжуулалтаар ирээгүй хүсэлтийг
 * лид болгоно. Тохиргоо дутуу эсвэл админ «Холболтууд»-аас идэвхжүүлээгүй бол алгасна.
 * Хариунд зөвхөн тоо (хувийн мэдээлэлгүй).
 */
export async function POST(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    try {
        const result = await syncElysiumLeads(supabaseAdmin(), { trigger: 'cron' });
        if (result.status === 'skipped') return NextResponse.json({ success: true, skipped: result.skipped });
        const success = result.status === 'ok';
        return NextResponse.json({
            success,
            read: result.read, imported: result.imported, keyed: result.keyed, matched: result.matched,
            invalid: result.invalid, failed: result.failed, remaining: result.remaining,
        }, { status: success ? 200 : 500 });
    } catch (error) {
        logger.error('[Elysium sync cron] failed', { message: error instanceof Error ? error.message : 'unknown' });
        return NextResponse.json({ success: false, error: 'Elysium лид татахад алдаа гарлаа' }, { status: 500 });
    }
}

export const GET = POST;
