import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// ============================================
// POST /api/cron/overdue-check
// Өдөр бүр шалгах:
//  1. payment_schedules дээр хугацаа дууссан → overdue болгох
//  2. property_contracts дээр overdue_days шинэчлэх
//  3. Push notification илгээх (TODO)
// ============================================
export async function POST(request: Request) {
    try {
        // Cron secret шалгах (Vercel cron header)
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
            .select('id, contract_id, amount, paid_amount');

        if (overdueErr) {
            logger.error('[Cron] overdue update error:', { error: overdueErr });
        }

        const updatedCount = overduePayments?.length || 0;

        // 2. property_contracts: overdue_days шинэчлэх (bulk update)
        // Бүх идэвхтэй гэрээнд overdue_days тооцоолох
        const { data: contracts } = await supabase
            .from('property_contracts')
            .select('id, contract_date, balance')
            .eq('contract_status', 'active')
            .gt('balance', 0);

        let contractsUpdated = 0;
        if (contracts && contracts.length > 0) {
            // Filter contracts that need update and batch process
            const updates = contracts
                .map(contract => {
                    const contractDate = new Date(contract.contract_date);
                    const diffDays = Math.floor((Date.now() - contractDate.getTime()) / (1000 * 60 * 60 * 24));
                    return diffDays > 90 ? { id: contract.id, overdue_days: diffDays - 90 } : null;
                })
                .filter(Boolean) as { id: string; overdue_days: number }[];

            // Batch update in parallel (max 10 concurrent)
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

        logger.info('[Cron] Overdue check completed', {
            overduePayments: updatedCount,
            contractsUpdated,
        });

        return NextResponse.json({
            success: true,
            overdue_payments_updated: updatedCount,
            contracts_updated: contractsUpdated,
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

// GET for Vercel cron
export async function GET(request: Request) {
    return POST(request);
}
