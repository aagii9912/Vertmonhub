import type { SupabaseClient } from '@supabase/supabase-js';
import { CASH_RECEIPT_METHODS, summarizeCashTransactions, type OperationsTransaction } from '@/lib/dashboard/operations-report';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr, ubParts } from '@/lib/utils/date';
import { SalesYearSchema } from './monthly';
import { getTeamMonthlySales } from './targets';
import { buildPlanPerformance, type PlanContract, type PlanPerformance, type PlanReceipt } from './plan-performance';
import { isMissingContractListSchema, readLatestContractListImport } from '@/lib/contracts/live';
import { hasHubPaidTotals, hubPaidByContract, storedHubPaidRows } from '@/lib/contracts/list-import';

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
 * `through` (YYYY-MM-DD, Улаанбаатар): тайлант өдрөөр огтолно — түүнээс хойш огноотой гэрээ, төлбөр орохгүй, сарын
 * явц тэр өдрөөр (Лхагвын илтгэлийн «10-р сарын гүйцэтгэл» тайлант долоо хоногийн эцэс хүртэл). Ирээдүйн өдрийг өнөөдрөөр
 * хязгаарлана — болоогүй сарыг өнгөрсөн гэж 0 харуулахгүй.
 * Орсон мөнгө (санхүүгийн эрхтэй үед): тайлант өдөр хүртэлх сүүлийн HUB импортын мөрүүдэд «Нийт төлсөн дүн» байвал
 * гэрээгээр тулгаж cohort-оор (W5/W6, `hubPaid`); үгүй бол өмнөх шигээ дэвтрээр. Импортын хүснэгт байхгүй бол дэвтэр.
 */
export async function loadPlanPerformance(db: SupabaseClient, options: {
    shopId: string; year?: number; canReadFinance: boolean; now?: Date; through?: string;
}): Promise<PlanPerformance> {
    const today = ubDateStr(options.now ?? new Date());
    const through = options.through ? (options.through > today ? today : options.through) : null;
    // Тайлант өдрийн Улаанбаатарын (UTC+8) үд дунд — сарын хил серверийн UTC-д шилжихгүй.
    const now = options.now ?? (through ? new Date(`${through}T12:00:00+08:00`) : new Date());
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
    // Тайлант өдөр (эс бөгөөс өнөөдөр) хүртэлх файлын огноотой сүүлийн импортын мөрүүд — «Нийт төлсөн дүн»-д.
    const hubImport = async (): Promise<{ asOf: string; rows: unknown } | null> => {
        const { data, error } = await db.from('contract_list_imports').select('report_date, rows')
            .eq('shop_id', options.shopId).lte('report_date', through ?? today)
            .order('report_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (error) {
            if (isMissingContractListSchema(error)) return null;
            throw new Error(error.message);
        }
        const row = data as { report_date: string | null; rows: unknown } | null;
        return row?.report_date ? { asOf: String(row.report_date).slice(0, 10), rows: row.rows } : null;
    };
    const [months, planRows, contracts, latestImportDate, transactions, ledgerSince, hubFile] = await Promise.all([
        getTeamMonthlySales(db, options.shopId, year),
        fetchAllRows<{ year: number }>((from, to) => db.from('team_sales_targets').select('year')
            .eq('shop_id', options.shopId).order('year').order('month').range(from, to)),
        fetchAllRows<PlanContract>(contractPage),
        latestImport(),
        options.canReadFinance ? fetchAllRows<OperationsTransaction>((from, to) => db.from('finance_transactions')
            .select('txn_date, type, amount, method, contract_id')
            .eq('shop_id', options.shopId).gte('txn_date', `${year}-01-01`).lte('txn_date', through && through < `${year}-12-31` ? through : `${year}-12-31`)
            .order('id').range(from, to)) : Promise.resolve(null),
        options.canReadFinance ? ledgerStart() : Promise.resolve(null),
        options.canReadFinance ? hubImport() : Promise.resolve(null),
    ]);
    const hubRows = hubFile ? storedHubPaidRows(hubFile.rows) : [];
    const hubPaid = hubFile && hasHubPaidTotals(hubRows) ? { asOf: hubFile.asOf, paid: hubPaidByContract(hubRows, contracts) } : null;
    // Тайлант өдрөөс хойш эхэлсэн дэвтэр тэр өдөр байгаагүй — «бүртгэлгүй» (0 биш).
    const ledgerSinceAt = through && ledgerSince && ledgerSince > through ? null : ledgerSince;
    return buildPlanPerformance({
        year, now, months, planYears: [...new Set(planRows.map(row => Number(row.year)))],
        // Тайлант өдрөөс хойш огноотой гэрээ тэр үед байгаагүй; огноогүй гэрээ хэвээр (доод хязгаар «+»).
        contracts: through ? contracts.filter(contract => !contract.contract_date || contract.contract_date.slice(0, 10) <= through) : contracts,
        receipts: transactions === null ? null : ledgerReceipts(transactions, year),
        ...(transactions === null ? {} : { ledgerSince: ledgerSinceAt }),
        latestImportDate, overdueAvailable, hubPaid,
    });
}
