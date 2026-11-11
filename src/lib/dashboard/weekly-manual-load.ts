import type { SupabaseClient } from '@supabase/supabase-js';
import { erpNumber, PRODUCT_KIND_LABEL } from '@/lib/erp/records';
import { customerShortName } from '@/lib/contracts/list-format';
import { fetchAllRows } from '@/lib/utils/pagination';
import { weeklyReviewRange } from './weekly-review';
import { crmKind } from './weekly-sales-load';
import { WEEKLY_MANUAL_LIST_LIMIT, type WeeklyManual } from './weekly-manual';

type ContractRow = {
    id: string; contract_number: string | null; contract_date: string | null; contract_status: string | null; product_type: string | null;
    block_name: string | null; unit_label: string | null; unit_number: string | null; total_price: number | string | null;
    sales_manager: string | null; customer_name: string | null; customer_first_name: string | null; customer_last_name: string | null;
};
type TargetRow = Record<'target_amount' | 'cashflow_target_amount' | 'contract_count_target' | 'manual_contract_actual_amount'
    | 'manual_cashflow_actual_amount' | 'manual_contract_count_actual', number | string | null>;

const CONTRACT_FIELDS = 'id, contract_number, contract_date, contract_status, product_type, block_name, unit_label, unit_number, total_price, sales_manager, customer_name, customer_first_name, customer_last_name';
const TARGET_FIELDS = 'target_amount, cashflow_target_amount, contract_count_target, manual_contract_actual_amount, manual_cashflow_actual_amount, manual_contract_count_actual';
const entered = (value: unknown) => value !== null && value !== undefined && value !== '';
/**
 * «Гараар нөхөх» алхмын өгөгдөл (нэг shop = нэг төсөл): менежергүй ба огноогүй амьд гэрээ, тайлант сарын төлөвлөгөө,
 * гараар оруулсан гүйцэтгэл байгаа эсэх. Уншилтын алдаа шидэгдэнэ — «нөхөх зүйлгүй» гэж харуулахгүй.
 */
export async function loadWeeklyManual(db: SupabaseClient, options: { shopId: string; meetingDate: string; canSeeCustomers: boolean; canSeeCash: boolean }): Promise<WeeklyManual> {
    const { shopId, meetingDate } = options;
    const range = weeklyReviewRange(meetingDate);
    const month = range.to.slice(0, 7);

    const [managerlessRows, undatedRows, target] = await Promise.all([
        // Менежергүй: NULL эсвэл хоосон мөр (нэг `.or()`); цуцалсныг доор шүүнэ.
        fetchAllRows<ContractRow>((from, to) => db.from('property_contracts').select(CONTRACT_FIELDS)
            .eq('shop_id', shopId).is('deleted_at', null).or('sales_manager.is.null,sales_manager.eq.""')
            .order('contract_date', { ascending: false, nullsFirst: false }).order('id').range(from, to)),
        fetchAllRows<{ id: string; contract_status: string | null }>((from, to) => db.from('property_contracts').select('id, contract_status')
            .eq('shop_id', shopId).is('deleted_at', null).is('contract_date', null).order('id').range(from, to)),
        db.from('team_sales_targets').select(TARGET_FIELDS).eq('shop_id', shopId).eq('year', Number(month.slice(0, 4))).eq('month', Number(month.slice(5, 7))).maybeSingle(),
    ]);
    if (target.error) throw target.error;
    const row = (target.data ?? null) as TargetRow | null;
    const live = <T extends { contract_status: string | null }>(rows: T[]) => rows.filter(contract => contract.contract_status !== 'cancelled');
    const managerless = live(managerlessRows).filter(contract => !contract.sales_manager?.trim());

    return {
        month,
        managerless: {
            count: managerless.length,
            contracts: managerless.slice(0, WEEKLY_MANUAL_LIST_LIMIT).map(contract => ({
                id: contract.id, number: contract.contract_number, date: contract.contract_date, block: contract.block_name,
                unit: contract.unit_label ?? contract.unit_number, kindLabel: PRODUCT_KIND_LABEL[crmKind(contract.product_type)],
                customer: options.canSeeCustomers ? customerShortName(contract) : null,
                total: contract.total_price === null || contract.total_price === '' ? null : erpNumber(String(contract.total_price)),
                inWeek: !!contract.contract_date && contract.contract_date >= range.from && contract.contract_date <= range.to,
            })),
        },
        undated: live(undatedRows).length,
        plan: {
            contractAmount: entered(row?.target_amount), contractCount: entered(row?.contract_count_target),
            cashflow: options.canSeeCash ? entered(row?.cashflow_target_amount) : null,
        },
        manualActuals: {
            contractAmount: entered(row?.manual_contract_actual_amount), contractCount: entered(row?.manual_contract_count_actual),
            cashflow: options.canSeeCash ? entered(row?.manual_cashflow_actual_amount) : null,
        },
    };
}
