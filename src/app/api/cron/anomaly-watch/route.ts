import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { sendPushNotification } from '@/lib/notifications';
import { computeAnomalies, summarizeAnomalies, type ActivityRow, type LeadRow, type ManagerRow } from '@/lib/dashboard/oversight';
import { logger } from '@/lib/utils/logger';

/**
 * GET/POST /api/cron/anomaly-watch — өдөр тутмын ажлын явцын хяналт.
 *
 * ЯАГААД: удирдлага өмнө нь зөвхөн сарын эцсийн ҮР ДҮНГ хардаг байсан тул
 * асуудал (идэвхгүй менежер, хугацаа хэтэрсэн дагалт, хүйтэн лийд) сар
 * дуустал үл мэдэгдэж үлддэг байв. Энэ cron өдөр бүр шалгаж, шинэ асуудлыг
 * `work_anomalies`-д бүртгээд удирдлагад push илгээнэ.
 *
 * Идэмхий (idempotent): нэг өдөрт нэг менежерийн нэг төрлийн аномали НЭГ л
 * удаа бүртгэгдэнэ (uq_work_anomalies_daily unique index).
 */
async function handler(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const db = supabaseAdmin();
        const now = new Date();
        const inactiveDays = 2;
        const staleDays = 5;

        const since = new Date(now);
        since.setDate(since.getDate() - inactiveDays);
        since.setHours(0, 0, 0, 0);

        const { data: shops } = await db.from('shops').select('id, name');
        const results: Array<Record<string, unknown>> = [];

        for (const shop of shops || []) {
            const [rosterRes, activityRes, leadsRes] = await Promise.all([
                db.from('sales_managers').select('name, is_active').eq('shop_id', shop.id),
                db.from('activity_log')
                    .select('actor_name, occurred_at')
                    .eq('shop_id', shop.id)
                    .gte('occurred_at', since.toISOString())
                    .is('deleted_at', null)
                    .limit(2000),
                db.from('leads')
                    .select('id, customer_name, sales_manager_name, status, updated_at, next_followup_at')
                    .eq('shop_id', shop.id)
                    .not('status', 'in', '("closed_won","closed_lost")')
                    .is('deleted_at', null)
                    .limit(2000),
            ]);

            // activity_log байхгүй (миграци ороогүй) бол идэвхгүйн шалгалт
            // худал ажиллахгүй — computeAnomalies хоосон массивт шалгалт хийхгүй.
            const anomalies = computeAnomalies({
                managers: (rosterRes.data || []) as ManagerRow[],
                activities: (activityRes.data || []) as ActivityRow[],
                leads: (leadsRes.data || []) as LeadRow[],
                staleDays,
                inactiveDays,
                now,
            });

            if (anomalies.length === 0) {
                results.push({ shop: shop.name, anomalies: 0 });
                continue;
            }

            // Бүртгэх — давхардлыг unique index зогсооно
            const rows = anomalies
                .filter((a) => a.kind === 'no_activity' || a.severity === 'critical')
                .map((a) => ({
                    shop_id: shop.id,
                    // '' = менежерт хамаарахгүй. NULL бол SQL-д давхардал
                    // зогсоохгүй (NULL-ууд хоорондоо ялгаатай) тул unique index
                    // ажиллахгүй болно.
                    manager_name: a.manager ?? '',
                    kind: a.kind,
                    severity: a.severity,
                    detail: { message: a.message, ...a.detail },
                    detected_on: now.toISOString().slice(0, 10),
                }));

            let stored = 0;
            if (rows.length > 0) {
                const { error, count } = await db
                    .from('work_anomalies')
                    .upsert(rows, {
                        onConflict: 'shop_id,manager_name,kind,detected_on',
                        ignoreDuplicates: true,
                        count: 'exact',
                    });
                if (error) {
                    logger.warn('[anomaly-watch] бүртгэх алдаа', { error: error.message, shop: shop.name });
                } else {
                    stored = count || 0;
                }
            }

            // Удирдлагад мэдэгдэнэ (зөвхөн ноцтой зүйл байвал — өдөр бүр
            // «бүх зүйл хэвийн» гэж түгших нь мэдэгдлийн ядаргаа үүсгэнэ).
            const summary = summarizeAnomalies(anomalies);
            // Зөвхөн ЯАРАЛТАЙ зүйл эсвэл шинээр бүртгэгдсэн асуудал байвал
            // мэдэгдэнэ. Өдөр бүр давтагдах «анхаарах» төлөвт түгшүүлбэл
            // мэдэгдлийн ядаргаа үүсч, хүмүүс бүгдийг нь үл тоомсорлоно.
            if (summary.critical > 0 || stored > 0) {
                const top = summary.byManager.slice(0, 3)
                    .map((m) => `${m.manager} (${m.count})`)
                    .join(', ');
                await sendPushNotification(shop.id, {
                    title: 'Ажлын явцын анхааруулга',
                    body:
                        `${summary.critical} яаралтай, ${summary.warn} анхаарах асуудал` +
                        (top ? ` — ${top}` : ''),
                    // Одоогоор менежерийн гүйцэтгэлийн хуудас руу — идэвхийн
                    // тусдаа хуудас хараахан байхгүй (API нь /api/dashboard/activity).
                    url: '/dashboard/reports/manager-performance',
                    tag: 'anomaly-watch',
                });
            }

            results.push({
                shop: shop.name,
                anomalies: anomalies.length,
                stored,
                critical: summary.critical,
                warn: summary.warn,
            });
        }

        return NextResponse.json({ success: true, checkedAt: now.toISOString(), results });
    } catch (error) {
        logger.error('[anomaly-watch] алдаа', {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ error: 'Хяналтын шалгалт амжилтгүй' }, { status: 500 });
    }
}

export const GET = handler;
export const POST = handler;
