import type { SupabaseClient } from '@supabase/supabase-js';
import { CASH_RECEIPT_METHODS, summarizeCashTransactions, type OperationsTransaction } from '@/lib/dashboard/operations-report';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubParts } from '@/lib/utils/date';
import { SalesYearSchema } from './monthly';
import { getTeamMonthlySales } from './targets';
import { buildPlanPerformance, type PlanContract, type PlanPerformance, type PlanReceipt } from './plan-performance';
import { readLatestContractListImport } from '@/lib/contracts/live';

const CONTRACT_COLUMNS = 'id, contract_date, contract_status, product_type, block_name, unit_label, total_price, prepayment_due, paid_amount';
const OVERDUE_COLUMNS = ', overdue_amount, overdue_as_of';
type DbError = { code?: string; message: string } | null;
const missingColumn = (error: DbError, column: string) => !!error && ['42703', 'PGRST204'].includes(error.code ?? '') && error.message.includes(column);

/**
 * Бүртгэсэн төлбөрийг сар × гэрээгээр — үйл ажиллагааны тайлангийн мөнгөн урсгалын дүрмээр (`summarizeCashTransactions`:
 * бэлэн, банк, шилжүүлэг, ипотекийн орлого; бартер, хэлбэр тодорхойгүйг оруулахгүй).
 */
export function ledgerReceipts(transactions: OperationsTransaction[], year: number): PlanReceipt[] {
    const groups = new Map<string, OperationsTransaction[]>();
    for (const transaction of transactions) {
        const month = transaction.txn_date?.slice(0, 7);
        if (!month?.startsWith(`${year}-`)) continue;
        const key = `${month}|${transaction.contract_id ?? ''}`;
        const rows = groups.get(key);
        if (rows) rows.push(transaction);
        else groups.set(key, [transaction]);
    }
    return [...groups].flatMap(([key, rows]) => {
        const [month, contractId] = key.split('|');
        // txn_date нь DATE мөр — сарын хилийг мөрөөр харьцуулна.
        const receipts = summarizeCashTransactions(rows, { from: `${month}-01`, to: `${month}-31` }).receipts;
        return receipts ? [{ month, contractId: contractId || null, amount: receipts }] : [];
    });
}

/**
 * Төлөвлөгөөний биелэлтийн ачаалагч — тайлангийн хуудас, захирлын самбар, админы «CRM-ээр тооцсон» нэг эх сурвалж.
 * Эрх (reports, төслийн хүрээ, санхүү)-ийг дуудагч сервер шалгана. Уншилтын алдаа тайланг бүхэлд нь унагаана
 * (хоосон өгөгдлийг 0 гэж харуулахгүй); зөвхөн шинэ migration-ы хоцролтын багана/импортын хүснэгт дутвал хоцролтыг «—».
 */
export async function loadPlanPerformance(db: SupabaseClient, options: {
    shopId: string; year?: number; canReadFinance: boolean; now?: Date;
}): Promise<PlanPerformance> {
    const now = options.now ?? new Date();
    const year = SalesYearSchema.parse(options.year ?? ubParts(now).year);
    let overdueAvailable = true;
    const contractPage = async (from: number, to: number) => {
        const fetchPage = (withOverdue: boolean) => db.from('property_contracts')
            .select(`${CONTRACT_COLUMNS}${withOverdue ? OVERDUE_COLUMNS : ''}`)
            .eq('shop_id', options.shopId).is('deleted_at', null).order('id').range(from, to);
        let result = await fetchPage(overdueAvailable);
        if (missingColumn(result.error, 'overdue_')) {
            overdueAvailable = false;
            result = await fetchPage(false);
        }
        return result as unknown as { data: PlanContract[] | null; error: { message: string } | null };
    };
    // Хүснэгт байхгүй (migration ороогүй) бол импортгүй гэж үзнэ; бусад алдаа дамжина.
    const latestImport = () => readLatestContractListImport(db, options.shopId).then(result => result.latest?.report_date ?? null);
    // Дэвтрийн анхны мөнгөн орлого (бүх он): түүнээс өмнөх сар, эсвэл огт бүртгэлгүй бол орсон мөнгө тодорхойгүй.
    const ledgerStart = async (): Promise<string | null> => {
        const { data, error } = await db.from('finance_transactions').select('txn_date')
            .eq('shop_id', options.shopId).eq('type', 'receipt').in('method', [...CASH_RECEIPT_METHODS])
            .order('txn_date', { ascending: true }).limit(1);
        if (error) throw error;
        return (data as Array<{ txn_date: string | null }> | null)?.[0]?.txn_date?.slice(0, 10) ?? null;
    };
    const [months, planRows, contracts, latestImportDate, transactions, ledgerSince] = await Promise.all([
        getTeamMonthlySales(db, options.shopId, year),
        fetchAllRows<{ year: number }>((from, to) => db.from('team_sales_targets').select('year')
            .eq('shop_id', options.shopId).order('year').order('month').range(from, to)),
        fetchAllRows<PlanContract>(contractPage),
        latestImport(),
        options.canReadFinance ? fetchAllRows<OperationsTransaction>((from, to) => db.from('finance_transactions')
            .select('txn_date, type, amount, method, contract_id')
            .eq('shop_id', options.shopId).gte('txn_date', `${year}-01-01`).lte('txn_date', `${year}-12-31`)
            .order('id').range(from, to)) : Promise.resolve(null),
        options.canReadFinance ? ledgerStart() : Promise.resolve(null),
    ]);
    return buildPlanPerformance({
        year, now, months, planYears: [...new Set(planRows.map(row => Number(row.year)))],
        contracts, receipts: transactions === null ? null : ledgerReceipts(transactions, year),
        ...(transactions === null ? {} : { ledgerSince }),
        latestImportDate, overdueAvailable,
    });
}
