import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase';
import { sendPushNotification } from '@/lib/notifications';
import { sendWeeklyReportEmail } from '@/lib/email/email';
import { logger } from '@/lib/utils/logger';

/**
 * Долоо хоногийн автомат тайлан. Даваа гараг бүр (vercel.json cron) төсөл бүрийн
 * өнгөрсөн 7 хоногийн лийд, уулзалт, гэрээний нэгтгэлийг push-аар мэдэгдэж,
 * DIGEST_EMAIL тохируулсан бол Resend имэйлээр илгээнэ. CRON_SECRET-ээр хамгаалагдсан.
 */

const SOURCE_LABELS: Record<string, string> = {
    messenger: 'Messenger',
    facebook: 'Facebook',
    instagram: 'Instagram',
    website: 'Вэбсайт',
    referral: 'Зөвлөмж',
    phone: 'Утас',
    facebook_ads: 'Facebook Ads',
    google_ads: 'Google Ads',
    tv: 'ТВ',
    meeting: 'Уулзалт',
    event: 'Өдөрлөг',
    board: 'Самбар',
    other: 'Бусад',
};

async function run(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const db = supabaseAdmin();
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const sinceISO = weekAgo.toISOString();
        const recipient = process.env.DIGEST_EMAIL || '';
        const tag = `weekly-report-${now.toISOString().slice(0, 10)}`;

        const { data: shops } = await db.from('shops').select('id, name');
        const results: Array<Record<string, unknown>> = [];

        for (const shop of shops || []) {
            try {
                const [leadsRes, meetingsRes, contractsRes] = await Promise.all([
                    db.from('leads')
                        .select('source, status')
                        .eq('shop_id', shop.id)
                        .is('deleted_at', null)
                        .gte('created_at', sinceISO),
                    db.from('property_viewings')
                        .select('id', { count: 'exact', head: true })
                        .eq('shop_id', shop.id)
                        .gte('scheduled_at', sinceISO),
                    db.from('property_contracts')
                        .select('id', { count: 'exact', head: true })
                        .eq('shop_id', shop.id)
                        .gte('created_at', sinceISO),
                ]);

                const leadRows = leadsRes.data || [];
                const newLeads = leadRows.length;
                const wonLeads = leadRows.filter((l) => l.status === 'closed_won').length;
                const meetings = meetingsRes.count || 0;
                const newContracts = contractsRes.count || 0;
                if (newLeads === 0 && meetings === 0 && newContracts === 0) {
                    results.push({ shop: shop.name, skipped: true });
                    continue;
                }

                const bySource = new Map<string, number>();
                for (const l of leadRows) {
                    const src = l.source || 'other';
                    bySource.set(src, (bySource.get(src) || 0) + 1);
                }
                const topSources = Array.from(bySource.entries())
                    .map(([source, count]) => ({ source: SOURCE_LABELS[source] || source, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5);

                await sendPushNotification(shop.id, {
                    title: '🗓 Долоо хоногийн тайлан',
                    body: `Шинэ лийд: ${newLeads} · Уулзалт: ${meetings} · Хожсон: ${wonLeads} · Шинэ гэрээ: ${newContracts}`,
                    url: '/dashboard/reports/leads',
                    tag,
                });

                let emailed = false;
                if (recipient) {
                    emailed = await sendWeeklyReportEmail(recipient, {
                        shopName: shop.name || 'Vertmon',
                        weekStart: sinceISO.slice(0, 10),
                        weekEnd: now.toISOString().slice(0, 10),
                        newLeads,
                        meetings,
                        wonLeads,
                        newContracts,
                        topSources,
                    });
                }

                results.push({ shop: shop.name, newLeads, meetings, wonLeads, newContracts, emailed });
            } catch {
                // нэг төслийн алдаа бусдыг зогсоохгүй
            }
        }

        return NextResponse.json({ success: true, recipientConfigured: !!recipient, results });
    } catch (error) {
        logger.error('[WeeklyReport] error:', { error });
        return NextResponse.json({ error: 'Тайлан үүсгэхэд алдаа гарлаа' }, { status: 500 });
    }
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
