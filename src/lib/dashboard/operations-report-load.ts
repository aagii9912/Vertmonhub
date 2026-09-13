import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr, ubMonthRange, ubParts } from '@/lib/utils/date';
import {
    buildOperationsReport, OperationsRangeSchema,
    type OperationsContract, type OperationsLead, type OperationsTarget, type OperationsTransaction,
} from './operations-report';

/** Shared by the report page and AI. Authorization is supplied by their server-side callers. */
export async function loadOperationsReport(db: SupabaseClient, options: {
    shopId: string; shopName?: string; canReadFinance: boolean;
    from?: unknown; to?: unknown; now?: Date;
}) {
    const now = options.now ?? new Date();
    const { year, month } = ubParts(now);
    const current = ubMonthRange(year, month - 1);
    const range = OperationsRangeSchema.parse({
        from: options.from ?? ubDateStr(current.start),
        to: options.to ?? ubDateStr(new Date(current.end.getTime() - 1)),
    });
    let receiptClassificationAvailable = true;
    const receiptPage = async (from: number, to: number) => {
        const fetchPage = (withKind: boolean) => db.from('finance_transactions')
            .select(`txn_date, type, amount, method, contract_id${withKind ? ', receipt_kind' : ''}`)
            .eq('shop_id', options.shopId).gte('txn_date', range.from).lte('txn_date', range.to).order('id').range(from, to);
        let result = await fetchPage(receiptClassificationAvailable);
        // Only the optional receipt-kind migration may degrade; all other query errors fail the report.
        if (result.error && ['42703', 'PGRST204'].includes(result.error.code) && result.error.message.includes('receipt_kind')) {
            receiptClassificationAvailable = false;
            result = await fetchPage(false);
        }
        return result as unknown as { data: OperationsTransaction[] | null; error: { message: string } | null };
    };
    const [contracts, leads, targets, transactions] = await Promise.all([
        fetchAllRows<OperationsContract>((from, to) => db.from('property_contracts')
            .select('id, contract_date, contract_status, total_price, prepayment_paid_cash')
            .eq('shop_id', options.shopId).is('deleted_at', null).order('id').range(from, to)),
        fetchAllRows<OperationsLead>((from, to) => db.from('leads')
            .select('created_at, status, source, sales_manager_name, last_contact_at, next_followup_at, viewing_scheduled_at')
            .eq('shop_id', options.shopId).is('deleted_at', null).order('id').range(from, to)),
        fetchAllRows<OperationsTarget>((from, to) => db.from('team_sales_targets')
            .select('year, month, target_amount').eq('shop_id', options.shopId)
            .gte('year', Number(range.from.slice(0, 4))).lte('year', Number(range.to.slice(0, 4)))
            .order('year').order('month').range(from, to)),
        options.canReadFinance ? fetchAllRows<OperationsTransaction>(receiptPage) : Promise.resolve(null),
    ]);
    return { ...buildOperationsReport({ range, now: now.toISOString(), contracts, leads, targets, transactions, receiptClassificationAvailable }), shopName: options.shopName || 'Vertmon Hub' };
}
