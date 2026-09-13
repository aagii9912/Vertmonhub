/** Гэрээний төлбөр, кассын орлого, гэрээний үлдэгдэл нэг DB transaction-аар хадгалагдана. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CreatePaymentScheduleSchema, UpdatePaymentScheduleSchema } from '@/lib/validations/schemas';
import { logger } from '@/lib/utils/logger';

export interface NewPayment {
    client_request_id?: string;
    installment_number?: number;
    label?: string | null;
    due_date: string;
    amount: number;
    paid_amount?: number;
    paid_date?: string | null;
    payment_method?: string | null;
    receipt_kind?: 'advance' | 'installment' | 'other' | null;
    notes?: string | null;
}

export function paymentStatus(paid: number, amount: number): 'paid' | 'partial' | 'pending' {
    return paid >= amount && amount > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
}

export async function listPayments(db: SupabaseClient, shopId: string, contractId: string) {
    return db.from('payment_schedules').select('*').eq('contract_id', contractId).eq('shop_id', shopId).order('installment_number', { ascending: true });
}

async function mutatePayment(db: SupabaseClient, args: {
    p_shop_id: string; p_contract_id: string | null; p_payment_id: string | null;
    p_payload: Record<string, unknown>; p_request_id?: string;
}) {
    try {
        const { data, error } = await db.rpc('mutate_contract_payment', args);
        if (error) {
            if (error.code === 'PGRST202' || error.code === '42883') {
                return { error: 'Төлбөрийн найдвартай хадгалалт хараахан идэвхжээгүй байна. Системийн админд мэдэгдэнэ үү.', status: 503 };
            }
            if (error.code === 'P0002') return { error: 'Гэрээ эсвэл төлбөрийн мөр олдсонгүй', status: 404 };
            if (error.code === '23505') return { error: 'Энэ хүсэлтээр төлбөр өмнө нь бүртгэгдсэн байна. Жагсаалтаа шинэчилнэ үү.', status: 409 };
            if (error.code === '22023') return { error: error.message, status: 400 };
            if (error.code?.startsWith('22')) return { error: 'Төлбөрийн огноо, дүн, талбаруудаа шалгана уу', status: 400 };
            throw error;
        }
        if (!data?.id) throw new Error('Payment RPC returned no persisted payment');
        return { payment: data };
    } catch (error) {
        logger.error('[PaymentService] atomic payment failed', { error });
        return { error: 'Төлбөр хадгалсныг баталгаажуулж чадсангүй. Жагсаалтаа шинэчлээд ижил хүсэлтээр дахин оролдоно уу.', status: 500 };
    }
}

export async function addPayment(db: SupabaseClient, shopId: string, contractId: string, d: NewPayment) {
    const parsed = CreatePaymentScheduleSchema.safeParse(d);
    if (!parsed.success) return { error: 'Төлбөрийн өгөгдөл буруу байна', status: 400 };
    const { client_request_id, ...payload } = parsed.data;
    if (!client_request_id) return { error: 'Давхар төлбөрөөс хамгаалах хүсэлтийн UUID шаардлагатай. Дахин нээгээд оролдоно уу.', status: 400 };
    return mutatePayment(db, {
        p_shop_id: shopId, p_contract_id: contractId, p_payment_id: null,
        p_payload: payload, p_request_id: client_request_id,
    });
}

/** Positive deltas ALWAYS create receipts; same paid amount is safe to retry. */
export async function updatePayment(db: SupabaseClient, shopId: string, paymentId: string, updates: Record<string, unknown>, opts?: { recordReceiptDelta?: boolean; contractId?: string }) {
    const parsed = UpdatePaymentScheduleSchema.safeParse({ ...updates, payment_id: paymentId });
    if (!parsed.success) return { error: 'Төлбөрийн өгөгдөл буруу байна', status: 400 };
    const { payment_id, ...payload } = parsed.data;
    return mutatePayment(db, {
        p_shop_id: shopId, p_contract_id: opts?.contractId || null, p_payment_id: payment_id, p_payload: payload,
    });
}
