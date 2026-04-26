import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { sendPushNotification } from '@/lib/notifications';

// ============================================
// POST /api/cron/overdue-check
// Өдөр бүр шалгах:
//  1. payment_schedules дээр хугацаа дууссан → overdue болгох
//  2. property_contracts дээр overdue_days шинэчлэх
//  3. Дэлгүүр бүрд push notification илгээх
// ============================================
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
        }

        const updatedCount = overduePayments?.length || 0;

        // 2. property_contracts: overdue_days шинэчлэх (bulk update)
        const { data: contracts } = await supabase
            .from('property_contracts')
            .select('id, contract_date, balance')
            .eq('contract_status', 'active')
            .gt('balance', 0);

        let contractsUpdated = 0;
        if (contracts && contracts.length > 0) {
            const updates = contracts
                .map(contract => {
                    const contractDate = new Date(contract.contract_date);
                    const diffDays = Math.floor((Date.now() - contractDate.getTime()) / (1000 * 60 * 60 * 24));
                    return diffDays > 90 ? { id: contract.id, overdue_days: diffDays - 90 } : null;
                })
                .filter(Boolean) as { id: string; overdue_days: number }[];

            const BATCH_SIZE = 10;
            for (let i = 0; i < updates.length; i += BATCH_SIZE) {
                const batch = updates.slice(i, i + BATCH_SIZE);
                await Promise.all(
                    batch.map(u => supabase
                        .from('property_contracts')
                        .update({ overdue_days: u.overdue_days })
                        .eq('id', u.id)
                    )
                );
            }
            contractsUpdated = updates.length;
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
            pushSent,
            pushFailed,
        });

        return NextResponse.json({
            success: true,
            overdue_payments_updated: updatedCount,
            contracts_updated: contractsUpdated,
            notifications_sent: pushSent,
            notifications_failed: pushFailed,
            checked_at: new Date().toISOString(),
        });
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
