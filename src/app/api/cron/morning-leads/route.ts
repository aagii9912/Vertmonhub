import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase';
import { sendPushNotification } from '@/lib/notifications';

/**
 * Өглөөний лийд сануулга. Push бүхий төсөл бүрт өнөөдөр холбогдох ёстой
 * лийдүүдийг (шинэ + follow-up хугацаа болсон) тоолж менежерүүдэд push илгээнэ.
 * Өглөө бүр (vercel.json cron, 00:30 UTC = 08:30 УБ). CRON_SECRET-ээр хамгаалагдсан.
 */
async function run(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = supabaseAdmin();
    const { data: subs } = await db.from('push_subscriptions').select('shop_id');
    const shopIds = [...new Set((subs || []).map((s) => s.shop_id).filter(Boolean))] as string[];

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const tag = `morning-leads-${new Date().toISOString().slice(0, 10)}`;

    let sent = 0;
    for (const shopId of shopIds) {
        try {
            const [newRes, followupRes] = await Promise.all([
                // Хараахан холбогдоогүй шинэ лийдүүд
                db.from('leads')
                    .select('id', { count: 'exact', head: true })
                    .eq('shop_id', shopId)
                    .is('deleted_at', null)
                    .eq('status', 'new'),
                // Follow-up хугацаа нь өнөөдөр дуусах буюу хэтэрсэн идэвхтэй лийдүүд
                db.from('leads')
                    .select('id', { count: 'exact', head: true })
                    .eq('shop_id', shopId)
                    .is('deleted_at', null)
                    .not('status', 'in', '(closed_won,closed_lost)')
                    .lte('next_followup_at', todayEnd.toISOString()),
            ]);
            const newLeads = newRes.count || 0;
            const followups = followupRes.count || 0;
            if (newLeads === 0 && followups === 0) continue;

            await sendPushNotification(shopId, {
                title: '📞 Өнөөдөр холбогдох лийдүүд',
                body: `Шинэ лийд: ${newLeads} · Дагаж холбогдох: ${followups}`,
                url: '/dashboard/leads',
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
