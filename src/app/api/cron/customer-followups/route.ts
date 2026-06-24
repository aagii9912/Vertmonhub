import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { sendPushNotification } from '@/lib/notifications';
import { recomputeShopScores } from '@/lib/services/CustomerScoringService';
import {
    FOLLOWUP_MIN_SCORE,
    FOLLOWUP_QUIET_DAYS,
    FOLLOWUP_SNOOZE_DAYS,
} from '@/lib/config/scoring';
import { isAuthorizedCron } from '@/lib/auth/cron';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/customer-followups
 * Чанартай (өндөр оноотой) боловч чимээгүй болсон харилцагчдыг илрүүлж,
 * борлуулалтын менежерт дагаж холбогдохыг сануулна. Cron-оор ажиллахад зориулсан.
 * CRON_SECRET тохируулсан бол `x-cron-secret` header шаардана.
 */
export async function POST(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const supabase = supabaseAdmin();

        const { data: shops } = await supabase
            .from('shops')
            .select('id, name')
            .eq('is_active', true);

        const quietCutoff = new Date(Date.now() - FOLLOWUP_QUIET_DAYS * 86400000).toISOString();
        const nowIso = new Date().toISOString();
        const snoozeIso = new Date(Date.now() + FOLLOWUP_SNOOZE_DAYS * 86400000).toISOString();

        const results: Array<{ shopId: string; flagged: number }> = [];

        for (const shop of shops || []) {
            // Оноог шинэчилнэ (lifecycle/score шинэ байх)
            await recomputeShopScores(shop.id);

            // Чанартай + чимээгүй + одоо дагалт хүлээгдээгүй харилцагчид
            const { data: candidates } = await supabase
                .from('customers')
                .select('id, name, last_contact_at, next_followup_at, quality_score, lifecycle_stage')
                .eq('shop_id', shop.id)
                .gte('quality_score', FOLLOWUP_MIN_SCORE)
                .not('lifecycle_stage', 'in', '("won","lost")')
                .or(`last_contact_at.is.null,last_contact_at.lte.${quietCutoff}`);

            const due = (candidates || []).filter(c =>
                !c.next_followup_at || c.next_followup_at <= nowIso
            );

            if (due.length === 0) {
                results.push({ shopId: shop.id, flagged: 0 });
                continue;
            }

            // Дараагийн дагалтыг хойшлуулж тэмдэглэнэ (давтан мэдэгдэхээс сэргийлнэ)
            await supabase
                .from('customers')
                .update({ next_followup_at: snoozeIso })
                .in('id', due.map(c => c.id));

            // Менежерт нэг товч мэдэгдэл (digest)
            await sendPushNotification(shop.id, {
                title: '⭐ Дагаж холбогдох харилцагчид',
                body: `${due.length} чанартай харилцагч удаан хугацаанд чимээгүй байна. Дагаж холбогдоорой.`,
                url: '/dashboard/customers?tier=A',
                tag: 'customer-followups',
            });

            results.push({ shopId: shop.id, flagged: due.length });
        }

        const totalFlagged = results.reduce((s, r) => s + r.flagged, 0);
        logger.info('[Cron Followups] done', { shops: results.length, totalFlagged });

        return NextResponse.json({ success: true, shops: results.length, totalFlagged, results });
    } catch (error) {
        logger.error('[Cron Followups] error', { error });
        return NextResponse.json({ error: 'Followup cron failed' }, { status: 500 });
    }
}

export const GET = POST;
