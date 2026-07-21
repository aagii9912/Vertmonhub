import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase';
import { sendPushNotificationToUser } from '@/lib/notifications';
import { logger } from '@/lib/utils/logger';

/**
 * Хувийн ажлын сануулга (user_tasks.remind_at). 5 минут тутам (vercel.json cron)
 * хугацаа нь болсон сануулгуудыг хэрэглэгч бүрээр нэгтгэж push илгээнэ.
 * CRON_SECRET-ээр хамгаалагдсан.
 *
 * • Хэрэглэгч бүрт НЭГ push (олон ажлыг нэг мессежид багцална).
 * • 24 цагаас хуучирсан сануулгыг илгээхгүйгээр sent гэж тэмдэглэнэ —
 *   удаан зогссоны дараа хуучин сануулгаар бөмбөгдөхгүй.
 * • Push илгээгдсэн эсэхээс үл хамааран reminder_sent_at тамгална
 *   (бүртгэлгүй хэрэглэгч рүү мөнхийн retry үүсгэхгүй).
 */
async function run(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = supabaseAdmin();
    const now = new Date();
    const nowIso = now.toISOString();
    const staleBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { data: due, error } = await db
        .from('user_tasks')
        .select('id, user_id, shop_id, title, remind_at')
        .eq('status', 'pending')
        .is('deleted_at', null)
        .is('reminder_sent_at', null)
        .lte('remind_at', nowIso)
        .limit(200);

    if (error) {
        // user_tasks миграци ороогүй орчинд чимээгүй амжилттай гарна
        logger.warn('[TaskReminders] query skipped', { error: error.message });
        return NextResponse.json({ success: true, sent: 0, skipped: 'no-table' });
    }
    if (!due || due.length === 0) {
        return NextResponse.json({ success: true, sent: 0 });
    }

    // Хэрэглэгч (+shop) бүрээр багцална
    const fresh = due.filter((t) => t.remind_at && t.remind_at >= staleBefore);
    const stale = due.filter((t) => !t.remind_at || t.remind_at < staleBefore);
    const byUser = new Map<string, { userId: string; shopId: string; titles: string[]; ids: string[] }>();
    for (const task of fresh) {
        if (!task.user_id || !task.shop_id) continue;
        const key = `${task.shop_id}:${task.user_id}`;
        let group = byUser.get(key);
        if (!group) {
            group = { userId: task.user_id, shopId: task.shop_id, titles: [], ids: [] };
            byUser.set(key, group);
        }
        group.titles.push(task.title);
        group.ids.push(task.id);
    }

    let sent = 0;
    for (const group of byUser.values()) {
        try {
            const head = group.titles.slice(0, 3).join(' · ');
            const extra = group.titles.length > 3 ? ` (+${group.titles.length - 3} өөр ажил)` : '';
            const result = await sendPushNotificationToUser(group.shopId, group.userId, {
                title: '⏰ Ажлын сануулга',
                body: `${head}${extra}`,
                url: '/dashboard/tasks',
                tag: `task-reminder-${group.userId}`,
            });
            if (result.success > 0) sent++;
        } catch {
            // нэг хэрэглэгчийн алдаа бусдыг зогсоохгүй
        }
    }

    // Илгээсэн (болон хуучирсан) бүх сануулгыг тэмдэглэнэ
    const allIds = [...fresh, ...stale].map((t) => t.id);
    if (allIds.length > 0) {
        await db.from('user_tasks').update({ reminder_sent_at: nowIso }).in('id', allIds);
    }

    return NextResponse.json({
        success: true,
        due: due.length,
        users: byUser.size,
        sent,
        staleSkipped: stale.length,
    });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
