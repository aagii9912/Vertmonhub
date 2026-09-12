/**
 * Гэрээний төлбөрийн хуваарь (payment_schedules) + кассын орлого (finance_transactions).
 * API route ба AI tool хоёулаа энд дамжина.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';

export interface NewPayment {
    installment_number?: number;
    label?: string | null;
    due_date: string;
    amount: number;
    paid_amount?: number;
    paid_date?: string | null;
    payment_method?: string | null;
    notes?: string | null;
}

export function paymentStatus(paid: number, amount: number): 'paid' | 'partial' | 'pending' {
    return paid >= amount && amount > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
}

/**
 * Хуваарийн төлбөр өөрчлөгдөхөд гэрээний толгойн `paid_amount` / `balance`-ийг delta-аар
 * шинэчилнэ (импортоор орсон төлсөн дүнг дарж бичихгүй). 2026-09 review M15.
 */
export async function applyContractPaymentDelta(db: SupabaseClient, shopId: string, contractId: string, delta: number) {
    if (!Number.isFinite(delta) || delta === 0) return;
    const { data: c } = await db.from('property_contracts').select('total_price, paid_amount').eq('id', contractId).eq('shop_id', shopId).maybeSingle();
    if (!c) return;
    const paid = Math.max(0, (Number(c.paid_amount) || 0) + delta);
    const total = Number(c.total_price) || 0;
    const { error } = await db.from('property_contracts').update({ paid_amount: paid, balance: Math.max(0, total - paid), updated_at: new Date().toISOString() }).eq('id', contractId).eq('shop_id', shopId);
    if (error) logger.warn('[PaymentService] contract totals update failed', { error: error.message });
}

export async function listPayments(db: SupabaseClient, shopId: string, contractId: string) {
    return db.from('payment_schedules').select('*').eq('contract_id', contractId).eq('shop_id', shopId).order('installment_number', { ascending: true });
}

export async function addPayment(db: SupabaseClient, shopId: string, contractId: string, d: NewPayment) {
    const { data: contract } = await db.from('property_contracts').select('id').eq('id', contractId).eq('shop_id', shopId).single();
    if (!contract) return { error: 'Гэрээ олдсонгүй', status: 404 as const };
    const paid = d.paid_amount || 0;
    const { data, error } = await db.from('payment_schedules').insert({
        contract_id: contractId, shop_id: shopId,
        installment_number: d.installment_number || 1, label: d.label || null, due_date: d.due_date,
        amount: d.amount, paid_amount: paid, paid_date: d.paid_date || null, payment_method: d.payment_method || null,
        status: paymentStatus(paid, d.amount), notes: d.notes || null,
    }).select().single();
    if (error) return { error: `Төлбөр бүртгэхэд алдаа: ${error.message}`, status: 500 as const };
    if (paid > 0) {
        await recordReceipt(db, shopId, contractId, data.id, paid, d.paid_date, d.payment_method, d.label);
        await applyContractPaymentDelta(db, shopId, contractId, paid);
    }
    return { payment: data };
}

async function recordReceipt(db: SupabaseClient, shopId: string, contractId: string, scheduleId: string, amount: number, date?: string | null, method?: string | null, label?: string | null) {
    const { error } = await db.from('finance_transactions').insert({
        shop_id: shopId, txn_date: date || new Date().toISOString().slice(0, 10), type: 'receipt', amount,
        method: method || null, contract_id: contractId, payment_schedule_id: scheduleId, note: label || 'Гэрээний төлбөр',
    });
    if (error) logger.warn('[PaymentService] finance_transactions insert failed', { error });
}

/**
 * Хуваарийн мөрийг шинэчилнэ (allow-list-ээр шүүсэн updates өгнө). paid_amount өөрчлөгдвөл гэрээний
 * толгойг delta-аар шинэчилж, `recordReceiptDelta` бол шинээр төлсөн дүнг кассад бичнэ.
 */
export async function updatePayment(db: SupabaseClient, shopId: string, paymentId: string, updates: Record<string, unknown>, opts?: { recordReceiptDelta?: boolean; contractId?: string }) {
    let q = db.from('payment_schedules').select('paid_amount, amount, contract_id, label').eq('id', paymentId).eq('shop_id', shopId);
    if (opts?.contractId) q = q.eq('contract_id', opts.contractId);
    const { data: prev } = await q.maybeSingle();
    if (!prev) return { error: 'Төлбөрийн мөр олдсонгүй', status: 404 as const };
    if (updates.paid_amount !== undefined && updates.amount === undefined) updates.amount = prev.amount;
    if (updates.paid_amount !== undefined && updates.amount !== undefined) {
        const paid = Number(updates.paid_amount); const total = Number(updates.amount);
        if (Number.isFinite(paid) && Number.isFinite(total)) updates.status = paymentStatus(paid, total);
    }
    const { data, error } = await db.from('payment_schedules').update(updates).eq('id', paymentId).eq('shop_id', shopId).select().maybeSingle();
    if (error) return { error: `Төлбөр шинэчлэхэд алдаа: ${error.message}`, status: 500 as const };
    if (!data) return { error: 'Төлбөрийн мөр олдсонгүй', status: 404 as const };
    if (updates.paid_amount !== undefined) {
        const delta = (Number(data.paid_amount) || 0) - (Number(prev.paid_amount) || 0);
        await applyContractPaymentDelta(db, shopId, prev.contract_id, delta);
        if (opts?.recordReceiptDelta && delta > 0) await recordReceipt(db, shopId, prev.contract_id, paymentId, delta, updates.paid_date as string | undefined, updates.payment_method as string | undefined, prev.label);
    }
    return { payment: data };
}
