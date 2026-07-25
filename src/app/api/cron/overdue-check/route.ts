import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { sendPushNotification } from '@/lib/notifications';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { fetchAllRows } from '@/lib/utils/pagination';

// ============================================
// POST /api/cron/overdue-check
// Өдөр бүр шалгах:
//  1. payment_schedules дээр хугацаа дууссан → overdue болгох
//  2. property_contracts дээр overdue_days шинэчлэх
//  3. Төсөл бүрд push notification илгээх
// ============================================
export async function POST(request: Request) {
    // Cron-ийн бодит алдааг дараагийн ажлыг зогсоолгүйгээр цуглуулна —
    // эцэст нь тоог хариунд гаргаж, ямар нэг алдаа гарсан бол 500 буцаана.
    const errors: string[] = [];

    try {
        // Өмнө нь `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` гэж
        // шалгадаг байсан: CRON_SECRET тохируулаагүй үед энэ нь шууд
        // "Bearer undefined" болох тул тэр мөрийг илгээсэн хэн ч нэвтэрдэг байв.
        if (!isAuthorizedCron(request)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();
        const today = new Date().toISOString().split('T')[0];

        // 1. payment_schedules: pending → overdue (хугацаа өнгөрсөн)
        const { data: overduePayments, error: overdueErr } = await supabase
            .from('payment_schedules')
            .update({ status: 'overdue' })
            .lt('due_date', today)
            .in('status', ['pending', 'partial'])
            .select('id, shop_id, contract_id, amount, paid_amount, due_date');

        if (overdueErr) {
            logger.error('[Cron] overdue update error:', { error: overdueErr });
            errors.push(`payment_schedules: ${overdueErr.message}`);
        }

        const updatedCount = overduePayments?.length || 0;

        // 2. property_contracts: overdue_days шинэчлэх.
        //    Идэвхтэй гэрээг БҮГДИЙГ хуудаслаж татна (Supabase нэг хүсэлтэд
        //    ~1000 мөрөөр таслах тул олон гэрээтэй төсөлд дутуу боловсруулагдана).
        //    Үлдэгдэлгүй болсон гэрээг ч татна — эс бөгөөс overdue_days нь
        //    хэзээ ч 0 болж буцахгүй, төлбөрөө барагдуулсан гэрээ мөнхөд
        //    «хугацаа хэтэрсэн» хэвээр үлдэнэ (тайлан, push бүгд буруу гарна).
        let contracts: { id: string; contract_date: string; balance: number; overdue_days: number | null }[] = [];
        try {
            contracts = await fetchAllRows((from, to) =>
                supabase
                    .from('property_contracts')
                    .select('id, contract_date, balance, overdue_days')
                    .eq('contract_status', 'active')
                    .is('deleted_at', null)
                    .range(from, to),
            );
        } catch (e) {
            logger.error('[Cron] contracts fetch error:', { error: e });
            errors.push(`property_contracts fetch: ${String(e)}`);
        }

        let contractsUpdated = 0;
        let contractsCleared = 0;
        if (contracts.length > 0) {
            const updates = contracts
                .map(contract => {
                    const balance = Number(contract.balance || 0);
                    const current = Number(contract.overdue_days || 0);

                    // Үлдэгдэл барагдсан → хугацаа хэтрэлтийг цэвэрлэнэ
                    if (balance <= 0) {
                        return current > 0 ? { id: contract.id, overdue_days: 0, cleared: true } : null;
                    }

                    const contractDate = new Date(contract.contract_date);
                    if (Number.isNaN(contractDate.getTime())) return null;
                    const diffDays = Math.floor((Date.now() - contractDate.getTime()) / (1000 * 60 * 60 * 24));
                    const next = diffDays > 90 ? diffDays - 90 : 0;

                    // Утга өөрчлөгдөөгүй бол дэмий бичилт хийхгүй
                    if (next === current) return null;
                    return { id: contract.id, overdue_days: next, cleared: next === 0 };
                })
                .filter(Boolean) as { id: string; overdue_days: number; cleared: boolean }[];

            const BATCH_SIZE = 10;
            for (let i = 0; i < updates.length; i += BATCH_SIZE) {
                const batch = updates.slice(i, i + BATCH_SIZE);
                const results = await Promise.all(
                    batch.map(u => supabase
                        .from('property_contracts')
                        .update({ overdue_days: u.overdue_days })
                        .eq('id', u.id)
                    )
                );
                // Өмнө нь эдгээр бичилтийн алдааг ОГТ шалгадаггүй байсан
                results.forEach((r, idx) => {
                    if (r.error) errors.push(`contract ${batch[idx].id}: ${r.error.message}`);
                });
            }
            contractsUpdated = updates.filter(u => !u.cleared).length;
            contractsCleared = updates.filter(u => u.cleared).length;
        }

        // 3. Push notifications — group newly-overdue payments by shop and notify each shop's subscribers.
        let pushSent = 0;
        let pushFailed = 0;
        if (overduePayments && overduePayments.length > 0) {
            const byShop = new Map<string, { count: number; totalAmount: number }>();
            for (const p of overduePayments) {
                if (!p.shop_id) continue;
                const remaining = Math.max(0, Number(p.amount || 0) - Number(p.paid_amount || 0));
                const entry = byShop.get(p.shop_id) || { count: 0, totalAmount: 0 };
                entry.count += 1;
                entry.totalAmount += remaining;
                byShop.set(p.shop_id, entry);
            }

            const results = await Promise.all(
                Array.from(byShop.entries()).map(([shopId, { count, totalAmount }]) =>
                    sendPushNotification(shopId, {
                        title: '⚠️ Хугацаа хэтэрсэн төлбөр',
                        body: `${count} төлбөрийн хугацаа хэтэрсэн (нийт ${totalAmount.toLocaleString()}₮). Гэрээнүүдээ шалгана уу.`,
                        url: '/dashboard/contracts?filter=overdue',
                        tag: `overdue-${today}`,
                    })
                )
            );
            for (const r of results) {
                pushSent += r.success;
                pushFailed += r.failed;
            }
        }

        logger.info('[Cron] Overdue check completed', {
            overduePayments: updatedCount,
            contractsUpdated,
            contractsCleared,
            pushSent,
            pushFailed,
            errors: errors.length,
        });

        const body = {
            success: errors.length === 0,
            overdue_payments_updated: updatedCount,
            contracts_updated: contractsUpdated,
            contracts_cleared: contractsCleared,
            notifications_sent: pushSent,
            notifications_failed: pushFailed,
            errors,
            checked_at: new Date().toISOString(),
        };

        // Өмнө нь алдаа гарсан ч ҮРГЭЛЖ `success: true` буцаадаг байсан тул
        // cron хэдэн ч өдөр унасныг хэн ч мэдэхгүй байв. Одоо алдаатай бол
        // 500 буцаана — Vercel cron түүнийг амжилтгүй гэж тэмдэглэнэ.
        return NextResponse.json(body, { status: errors.length > 0 ? 500 : 200 });
    } catch (error) {
        logger.error('[Cron] overdue-check error:', { error });
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function GET(request: Request) {
    return POST(request);
}
