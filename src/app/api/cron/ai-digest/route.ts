import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase';
import { sendPushNotification } from '@/lib/notifications';

/**
 * AI өдрийн тойм (proactive digest). Push бүхий төсөл бүрт өнөөдрийн шинэ лийд,
 * хугацаа хэтэрсэн гэрээ, удахгүйх үзлэгийн товч мэдээллийг push-аар илгээнэ.
 * Өдөрт нэг удаа (vercel.json cron). CRON_SECRET-ээр хамгаалагдсан.
 */
async function run(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = supabaseAdmin();
    const { data: subs } = await db.from('push_subscriptions').select('shop_id');
    const shopIds = [...new Set((subs || []).map((s) => s.shop_id).filter(Boolean))] as string[];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const nowIso = new Date().toISOString();
    const tag = `ai-digest-${todayStart.toISOString().slice(0, 10)}`;

    let sent = 0;
    for (const shopId of shopIds) {
        try {
            const [leadsRes, overdueRes, viewingsRes] = await Promise.all([
                db.from('leads').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).gte('created_at', todayStart.toISOString()),
                db.from('property_contracts').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).gt('overdue_days', 0),
                db.from('property_viewings').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).gte('scheduled_at', nowIso),
            ]);
            const newLeads = leadsRes.count || 0;
            const overdue = overdueRes.count || 0;
            const upcoming = viewingsRes.count || 0;
            if (newLeads === 0 && overdue === 0 && upcoming === 0) continue;

            await sendPushNotification(shopId, {
                title: '📊 Өдрийн тойм',
                body: `Шинэ лийд: ${newLeads} · Хугацаа хэтэрсэн гэрээ: ${overdue} · Удахгүйх үзлэг: ${upcoming}`,
                url: '/dashboard',
                tag,
            });
            sent++;
        } catch {
            // нэг төслийн алдаа бусдыг зогсоохгүй
        }
    }

    return NextResponse.json({ success: true, shops: shopIds.length, sent });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
