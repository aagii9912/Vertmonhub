/**
 * Санхүү/худалдан авалт — кассын гүйлгээ, нэгтгэл, нийлүүлэгчийн нэхэмжлэх.
 * API route ба AI tool хоёулаа энд дамжина.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';
import { logFinanceAudit } from '@/lib/erp/audit';

export type TxnMethod = 'cash' | 'bank' | 'barter' | 'mortgage';

export async function listTransactions(db: SupabaseClient, shopId: string, o: { type?: string | null; limit?: number; from?: string; to?: string }) {
    let q = db.from('finance_transactions').select('id, txn_date, type, amount, vat_amount, method, account_id, contract_id, project_id, note, created_at')
        .eq('shop_id', shopId).order('txn_date', { ascending: false }).order('created_at', { ascending: false }).limit(Math.min(o.limit || 50, 500));
    if (o.type === 'receipt' || o.type === 'disbursement') q = q.eq('type', o.type);
    if (o.from) q = q.gte('txn_date', o.from);
    if (o.to) q = q.lte('txn_date', o.to);
    return q;
}

export async function financeSummary(db: SupabaseClient, shopId: string) {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [{ data: contracts }, { data: txns }] = await Promise.all([
        db.from('property_contracts').select('total_price, paid_amount, balance, vat_amount, contract_status').eq('shop_id', shopId),
        db.from('finance_transactions').select('type, amount, txn_date').eq('shop_id', shopId).gte('txn_date', monthStart.toISOString().slice(0, 10)),
    ]);
    const activeRows = (contracts || []).filter((c) => c.contract_status !== 'cancelled');
    const totalRevenue = activeRows.reduce((s, c) => s + (Number(c.total_price) || 0), 0);
    const totalCollected = activeRows.reduce((s, c) => s + (Number(c.paid_amount) || 0), 0);
    const totalReceivable = activeRows.reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const totalVat = activeRows.reduce((s, c) => s + (Number(c.vat_amount) || 0), 0);
    const monthReceipts = (txns || []).filter((t) => t.type === 'receipt').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const monthDisbursements = (txns || []).filter((t) => t.type === 'disbursement').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return {
        totalRevenue, totalCollected, totalReceivable, totalVat,
        collectionRate: totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 100) : 0,
        monthReceipts, monthDisbursements, monthNetCash: monthReceipts - monthDisbursements, contractCount: activeRows.length,
    };
}

export async function addTransaction(db: SupabaseClient, shopId: string, d: { txn_date?: string | null; type: 'receipt' | 'disbursement'; amount: number; vat_amount?: number | null; method?: TxnMethod | null; account_id?: string | null; contract_id?: string | null; payment_schedule_id?: string | null; project_id?: string | null; note?: string | null }) {
    const { data: txn, error } = await db.from('finance_transactions').insert({
        shop_id: shopId, txn_date: d.txn_date || new Date().toISOString().slice(0, 10), type: d.type, amount: d.amount, vat_amount: d.vat_amount || 0,
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

export async function payBill(db: SupabaseClient, shopId: string, billId: string, d: { amount: number; method?: TxnMethod | null; paid_date?: string | null }) {
    const { data: bill } = await db.from('vendor_bills').select('id, bill_number, total_amount, paid_amount, project_id, status').eq('id', billId).eq('shop_id', shopId).single();
    if (!bill) return { error: 'Нэхэмжлэх олдсонгүй', status: 404 as const };
    const newPaid = (Number(bill.paid_amount) || 0) + d.amount;
    const newStatus = newPaid >= Number(bill.total_amount) ? 'paid' : 'partial';
    const { error: updateError } = await db.from('vendor_bills').update({ paid_amount: newPaid, status: newStatus }).eq('id', billId);
    if (updateError) return { error: updateError.message, status: 500 as const };
    const { error: txnError } = await db.from('finance_transactions').insert({
        shop_id: shopId, txn_date: d.paid_date || new Date().toISOString().slice(0, 10), type: 'disbursement', amount: d.amount,
        method: d.method || null, project_id: bill.project_id || null, note: 'Нийлүүлэгчийн нэхэмжлэх төлбөр',
    });
    if (txnError) logger.warn('[FinanceOps] bill pay txn insert failed', { error: txnError });
    await logFinanceAudit({ shopId, action: 'bill.pay', entity: 'vendor_bill', entityId: billId, amount: d.amount, meta: { method: d.method || null, newStatus } });
    return { bill: { id: bill.id, paid_amount: newPaid, status: newStatus, total_amount: bill.total_amount } };
}
