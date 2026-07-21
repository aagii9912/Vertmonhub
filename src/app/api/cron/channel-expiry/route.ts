import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase';
import { sendPushNotification } from '@/lib/notifications';
import { daysUntil, CONTRACT_REMINDER_DAYS } from '@/lib/marketing/budget';
import { logger } from '@/lib/utils/logger';

/**
 * Маркетингийн сувгийн гэрээний хугацааны сануулга (channel_contracts).
 * Өдөр бүр (vercel.json cron): идэвхтэй гэрээ дуусахад 7/3/1/0 хоног үлдэхэд
 * тухайн shop-ийн бүх төхөөрөмж рүү push илгээнэ — билборд, радио зэрэг
 * төлбөртэй сувгийн хугацааг мартахгүй. CRON_SECRET-ээр хамгаалагдсан.
 * Өдөрт нэг л удаа ажилладаг тул тухайн өдрийн boundary дээр яг нэг push очно.
 */
async function run(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = supabaseAdmin();
    const now = new Date();
    const horizon = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    const tag = `channel-expiry-${today}`;

    const { data: contracts, error } = await db
        .from('channel_contracts')
        .select('id, shop_id, channel_id, end_date, budget, marketing_channels(name)')
        .eq('status', 'active')
        .not('end_date', 'is', null)
        .gte('end_date', today)
        .lte('end_date', horizon)
        .limit(200);

    if (error) {
        logger.warn('[ChannelExpiry] query skipped', { error: error.message });
        return NextResponse.json({ success: true, sent: 0, skipped: 'query-error' });
    }

    // Shop бүрээр: зөвхөн сануулгын boundary (7/3/1/0 хоног) дээрх гэрээнүүд
    const byShop = new Map<string, string[]>();
    for (const contract of contracts || []) {
        const days = daysUntil(contract.end_date, now);
        if (days === null || !(CONTRACT_REMINDER_DAYS as readonly number[]).includes(days)) continue;
        const channel = contract.marketing_channels as { name?: string } | null;
        const name = channel?.name || 'Суваг';
        const label = days === 0 ? `«${name}» — ӨНӨӨДӨР дуусна` : `«${name}» — ${days} хоногийн дараа дуусна`;
        if (!contract.shop_id) continue;
        const list = byShop.get(contract.shop_id) || [];
        list.push(label);
        byShop.set(contract.shop_id, list);
    }

    let sent = 0;
    for (const [shopId, labels] of byShop) {
        try {
            await sendPushNotification(shopId, {
                title: '📢 Сувгийн гэрээний сануулга',
                body: labels.slice(0, 3).join(' · ') + (labels.length > 3 ? ` (+${labels.length - 3})` : ''),
                url: '/marketing/sources',
                tag,
            });
            sent++;
        } catch {
            // нэг shop-ийн алдаа бусдыг зогсоохгүй
        }
    }

    return NextResponse.json({
        success: true,
        checked: (contracts || []).length,
        shopsNotified: byShop.size,
        sent,
    });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
