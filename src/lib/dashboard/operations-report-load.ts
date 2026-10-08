import type { SupabaseClient } from '@supabase/supabase-js';
import { applyLeadScope, type SalesProjectScope } from '@/lib/sales/project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr, ubDayRange, ubMonthRange, ubParts } from '@/lib/utils/date';
import {
    buildOperationsReport, buildMonthlyPerformance, OperationsRangeSchema,
    type OperationsContract, type OperationsLead, type OperationsLeadCategory, type OperationsTarget, type OperationsTransaction, type OperationsViewing,
} from './operations-report';

/** Shared by the report page and AI. Authorization is supplied by their server-side callers. */
export async function loadOperationsReport(db: SupabaseClient, options: {
    shopId: string; shopName?: string; canReadFinance: boolean;
    from?: unknown; to?: unknown; now?: Date;
    scope?: SalesProjectScope;
}) {
    const scope = options.scope ?? { projectIds: null, managerName: null };
    const now = options.now ?? new Date();
    const { year, month } = ubParts(now);
    const current = ubMonthRange(year, month - 1);
    const range = OperationsRangeSchema.parse({
        from: options.from ?? ubDateStr(current.start),
        to: options.to ?? ubDateStr(new Date(current.end.getTime() - 1)),
    });
    const meetingStart = ubDayRange(new Date(`${range.from}T00:00:00+08:00`)).start.toISOString();
    const meetingEnd = ubDayRange(new Date(`${range.to}T00:00:00+08:00`)).end.toISOString();
    let meetingClassificationAvailable = true;
    const viewingPage = async (from: number, to: number) => {
        const fetchPage = (withType: boolean) => applyLeadScope(db.from('property_viewings')
            .select(`scheduled_at, status${withType ? ', meeting_type' : ''}${scope.projectIds === null ? '' : ',leads!inner(project_id,sales_manager_name)'}`)
            .eq('shop_id', options.shopId).is('deleted_at', null)
            .gte('scheduled_at', meetingStart).lt('scheduled_at', meetingEnd).order('id').range(from, to), scope, 'leads.project_id', 'leads.sales_manager_name');
        let result = await fetchPage(meetingClassificationAvailable);
        if (result.error && ['42703', 'PGRST204'].includes(result.error.code) && result.error.message.includes('meeting_type')) {
            meetingClassificationAvailable = false;
            result = await fetchPage(false);
        }
        return result as unknown as { data: OperationsViewing[] | null; error: { message: string } | null };
    };
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
    const [contracts, leads, targets, transactions, viewings, categories] = await Promise.all([
        fetchAllRows<OperationsContract>((from, to) => db.from('property_contracts')
            .select('id, contract_date, contract_status, total_price, prepayment_paid_cash, product_type')
            .eq('shop_id', options.shopId).is('deleted_at', null).order('id').range(from, to)),
        fetchAllRows<OperationsLead>((from, to) => applyLeadScope(db.from('leads')
            .select('created_at, status, source, sales_manager_name, last_contact_at, next_followup_at, viewing_scheduled_at, category_id')
            .eq('shop_id', options.shopId).is('deleted_at', null).order('id').range(from, to), scope)),
        fetchAllRows<OperationsTarget>((from, to) => db.from('team_sales_targets')
            .select('year, month, target_amount, cashflow_target_amount, manual_contract_actual_amount, manual_cashflow_actual_amount, revision').eq('shop_id', options.shopId)
            .gte('year', Number(range.from.slice(0, 4))).lte('year', Number(range.to.slice(0, 4)))
            .order('year').order('month').range(from, to)),
        options.canReadFinance ? fetchAllRows<OperationsTransaction>(receiptPage) : Promise.resolve(null),
        fetchAllRows<OperationsViewing>(viewingPage),
        // Лидийн ангилал — төслийн тохиргоо (лидийн өгөгдөл биш), хүрээгээр хязгаарлахгүй.
        fetchAllRows<OperationsLeadCategory>((from, to) => db.from('lead_categories')
            .select('id, name, is_active').eq('shop_id', options.shopId).order('sort_order').order('id').range(from, to)),
    ]);
    return { ...buildOperationsReport({ range, now: now.toISOString(), contracts, leads, targets, transactions, viewings, receiptClassificationAvailable, meetingClassificationAvailable, categories }),
        monthlyPerformance: scope.projectIds === null ? buildMonthlyPerformance(targets, range, options.canReadFinance) : null,
        shopName: options.shopName || 'Vertmon Hub' };
}
