import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { CreatePaymentScheduleSchema, validateBody } from '@/lib/validations/schemas';

// ============================================
// GET /api/dashboard/contracts/[id]/payments
// Гэрээний төлбөрийн хуваарь татах
// ============================================
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const denied = await requireModule('contracts');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { id: contractId } = await params;
        const supabase = supabaseAdmin();

        const { data: payments, error } = await supabase
            .from('payment_schedules')
            .select('*')
            .eq('contract_id', contractId)
            .eq('shop_id', authShop.id)
            .order('installment_number', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ payments: payments || [] });
    } catch (error) {
        logger.error('[Payments API] GET error:', { error });
        return NextResponse.json(
            { error: 'Төлбөрийн хуваарь татахад алдаа гарлаа' },
            { status: 500 }
        );
    }
}

// ============================================
// POST /api/dashboard/contracts/[id]/payments
// Шинэ төлбөр бүртгэх
// ============================================
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const denied = await requireModuleWrite('contracts');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { id: contractId } = await params;
        const rawBody = await request.json();
        const validation = validateBody(CreatePaymentScheduleSchema, rawBody);
        if (!validation.success) return validation.response;
        const d = validation.data;
        const supabase = supabaseAdmin();

        // Гэрээ байгаа эсэхийг шалгах
        const { data: contract } = await supabase
            .from('property_contracts')
            .select('id')
            .eq('id', contractId)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .single();

        if (!contract) {
            return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
        }

        const { data, error } = await supabase
            .from('payment_schedules')
            .insert({
                contract_id: contractId,
                shop_id: authShop.id,
                installment_number: d.installment_number,
                label: d.label || null,
                due_date: d.due_date,
                amount: d.amount,
                paid_amount: d.paid_amount,
                paid_date: d.paid_date || null,
                payment_method: d.payment_method || null,
                status: d.paid_amount >= d.amount ? 'paid' : d.paid_amount > 0 ? 'partial' : 'pending',
                notes: d.notes || null,
            })
            .select()
            .single();

        if (error) throw error;

        // ERP: бодит төлбөр төлөгдсөн бол кассын дэвтэрт орлого (receipt) бичнэ
        if (d.paid_amount > 0) {
            const { error: txnError } = await supabase
                .from('finance_transactions')
                .insert({
                    shop_id: authShop.id,
                    txn_date: d.paid_date || new Date().toISOString().slice(0, 10),
                    type: 'receipt',
                    amount: d.paid_amount,
                    method: d.payment_method || null,
                    contract_id: contractId,
                    payment_schedule_id: data.id,
                    note: d.label || 'Гэрээний төлбөр',
                });
            if (txnError) {
                logger.warn('[Payments API] finance_transactions insert failed', { error: txnError });
            }
        }

        return NextResponse.json({ payment: data, message: 'Төлбөр амжилттай бүртгэлээ' }, { status: 201 });
    } catch (error) {
        logger.error('[Payments API] POST error:', { error });
        return NextResponse.json(
            { error: 'Төлбөр бүртгэхэд алдаа гарлаа' },
            { status: 500 }
        );
    }
}

// ============================================
// PATCH /api/dashboard/contracts/[id]/payments
// Төлбөрийн мэдээлэл шинэчлэх (body-д payment id шаардлагатай)
// ============================================
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const denied = await requireModuleWrite('contracts');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        await params; // contractId validation
        const body = await request.json();
        const { payment_id, ...updates } = body;

        if (!payment_id) {
            return NextResponse.json({ error: 'payment_id шаардлагатай' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Автомат status тодорхойлох (тоон утгаар найдвартай харьцуулна)
        if (updates.paid_amount !== undefined && updates.amount !== undefined) {
            const paid = Number(updates.paid_amount);
            const total = Number(updates.amount);
            if (Number.isFinite(paid) && Number.isFinite(total)) {
                if (paid >= total) {
                    updates.status = 'paid';
                } else if (paid > 0) {
                    updates.status = 'partial';
                }
            }
        }

        const { data, error } = await supabase
            .from('payment_schedules')
            .update(updates)
            .eq('id', payment_id)
            .eq('shop_id', authShop.id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ payment: data, message: 'Төлбөр шинэчлэгдлээ' });
    } catch (error) {
        logger.error('[Payments API] PATCH error:', { error });
        return NextResponse.json(
            { error: 'Төлбөр шинэчлэхэд алдаа гарлаа' },
            { status: 500 }
        );
    }
}
