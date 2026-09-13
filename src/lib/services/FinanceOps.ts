/**
 * Санхүү/худалдан авалт — кассын гүйлгээ, нэгтгэл, нийлүүлэгчийн нэхэмжлэх.
 * API route ба AI tool хоёулаа энд дамжина.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';
import { logFinanceAudit } from '@/lib/erp/audit';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr, ubMonthRange, ubParts } from '@/lib/utils/date';
import { summarizeCashTransactions, type OperationsTransaction } from '@/lib/dashboard/operations-report';
import { PayBillSchema } from '@/lib/validations/schemas';

export type TxnMethod = 'cash' | 'bank' | 'barter' | 'mortgage';

export async function listTransactions(db: SupabaseClient, shopId: string, o: { type?: string | null; limit?: number; from?: string; to?: string }) {
    let q = db.from('finance_transactions').select('id, txn_date, type, amount, vat_amount, method, account_id, contract_id, project_id, note, created_at')
        .eq('shop_id', shopId).order('txn_date', { ascending: false }).order('created_at', { ascending: false }).limit(Math.min(o.limit || 50, 500));
    if (o.type === 'receipt' || o.type === 'disbursement') q = q.eq('type', o.type);
    if (o.from) q = q.gte('txn_date', o.from);
    if (o.to) q = q.lte('txn_date', o.to);
    return q;
}

export async function financeSummary(db: SupabaseClient, shopId: string, now = new Date()) {
    const { year, month } = ubParts(now);
    const period = ubMonthRange(year, month - 1);
    const range = { from: ubDateStr(period.start), to: ubDateStr(new Date(period.end.getTime() - 1)) };
    type ContractTotals = { total_price: number | string | null; paid_amount: number | string | null; balance: number | string | null; vat_amount: number | string | null; contract_status: string | null };
    const [contracts, txns] = await Promise.all([
        fetchAllRows<ContractTotals>((from, to) => db.from('property_contracts')
            .select('total_price, paid_amount, balance, vat_amount, contract_status').eq('shop_id', shopId)
            .is('deleted_at', null).order('id').range(from, to)),
        fetchAllRows<OperationsTransaction>((from, to) => db.from('finance_transactions')
            .select('type, amount, txn_date, method, contract_id').eq('shop_id', shopId)
            .gte('txn_date', range.from).lte('txn_date', range.to).order('id').range(from, to)),
    ]);
    const activeRows = contracts.filter((c) => c.contract_status !== 'cancelled');
    const totalRevenue = activeRows.reduce((s, c) => s + (Number(c.total_price) || 0), 0);
    const totalCollected = activeRows.reduce((s, c) => s + (Number(c.paid_amount) || 0), 0);
    const totalReceivable = activeRows.reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const totalVat = activeRows.reduce((s, c) => s + (Number(c.vat_amount) || 0), 0);
    const cash = summarizeCashTransactions(txns, range, false);
    return {
        totalRevenue, totalCollected, totalReceivable, totalVat,
        collectionRate: totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 100) : 0,
        monthReceipts: cash.receipts, monthDisbursements: cash.disbursements, monthNetCash: cash.net, contractCount: activeRows.length,
        monthBarterReceipts: cash.barterReceipts, monthBarterDisbursements: cash.barterDisbursements,
        monthUnclassifiedReceipts: cash.unclassifiedReceipts, monthUnclassifiedDisbursements: cash.unclassifiedDisbursements,
        monthUnclassifiedCount: cash.unclassifiedCount, range,
    };
}

export async function addTransaction(db: SupabaseClient, shopId: string, d: { txn_date?: string | null; type: 'receipt' | 'disbursement'; amount: number; vat_amount?: number | null; method?: TxnMethod | null; account_id?: string | null; contract_id?: string | null; payment_schedule_id?: string | null; project_id?: string | null; note?: string | null }) {
    const { data: txn, error } = await db.from('finance_transactions').insert({
        shop_id: shopId, txn_date: d.txn_date || ubDateStr(), type: d.type, amount: d.amount, vat_amount: d.vat_amount || 0,
        method: d.method || null, account_id: d.account_id || null, contract_id: d.contract_id || null, payment_schedule_id: d.payment_schedule_id || null,
        project_id: d.project_id || null, note: d.note || null,
    }).select().single();
    if (error) return { error: error.message };
    await logFinanceAudit({ shopId, action: 'transaction.create', entity: 'finance_transaction', entityId: txn.id, amount: d.amount, meta: { type: d.type, method: d.method || null } });
    return { transaction: txn };
}

export async function listBills(db: SupabaseClient, shopId: string, status?: string | null, limit = 50) {
    let q = db.from('vendor_bills').select('*, vendors(name), projects(name)').eq('shop_id', shopId).order('bill_date', { ascending: false }).limit(limit);
    if (status) q = q.eq('status', status);
    return q;
}

export async function payBill(db: SupabaseClient, shopId: string, billId: string, d: { client_request_id?: string; amount: number; method?: TxnMethod | null; paid_date?: string | null }) {
    const parsed = PayBillSchema.safeParse(d);
    if (!parsed.success) return { error: 'Төлбөрийн дүн, огноо болон давхар бүртгэлээс хамгаалах хүсэлтийн UUID-г шалгана уу.', status: 400 };
    const { client_request_id, ...payload } = parsed.data;
    try {
        const { data, error } = await db.rpc('pay_vendor_bill_atomic', {
            p_shop_id: shopId, p_bill_id: billId, p_request_id: client_request_id, p_payload: payload,
        });
        if (error) {
            if (error.code === 'PGRST202' || error.code === '42883') return { error: 'Нэхэмжлэхийн найдвартай төлөлт хараахан идэвхжээгүй байна. Системийн админд мэдэгдэнэ үү.', status: 503 };
            if (error.code === 'P0002') return { error: 'Нэхэмжлэх олдсонгүй', status: 404 };
            if (error.code === '23505') return { error: 'Энэ хүсэлтээр өөр төлбөр өмнө нь бүртгэгдсэн байна. Жагсаалтаа шинэчилнэ үү.', status: 409 };
            if (error.code === '22023') return { error: error.message, status: 400 };
            if (error.code?.startsWith('22')) return { error: 'Төлбөрийн огноо, дүн, хэлбэрийг шалгана уу.', status: 400 };
            throw error;
        }
        if (!data?.id || !data?.transaction_id) throw new Error('Bill RPC returned no persisted payment');
        return { bill: data as { id: string; paid_amount: number; status: string; total_amount: number; transaction_id: string } };
    } catch (error) {
        logger.error('[FinanceOps] atomic bill payment failed', { error });
        return { error: 'Төлбөр хадгалсныг баталгаажуулж чадсангүй. Ижил хүсэлтээр дахин оролдох эсвэл жагсаалтаа шинэчилнэ үү.', status: 500 };
    }
}
