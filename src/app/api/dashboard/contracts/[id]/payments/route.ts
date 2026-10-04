import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { CreatePaymentScheduleSchema, UpdatePaymentScheduleSchema, validateBody } from '@/lib/validations/schemas';
import { withRoute } from '@/lib/api/route';
import { listPayments, addPayment, updatePayment } from '@/lib/services/PaymentService';

// ============================================
// GET /api/dashboard/contracts/[id]/payments
// Гэрээний төлбөрийн хуваарь татах
// ============================================
export const GET = withRoute<{ id: string }>({ module: 'contracts', error: 'Төлбөрийн хуваарь татахад алдаа гарлаа' }, async ({ shop: authShop, params }) => {
    const { id: contractId } = await params;
    const { data: payments, error } = await listPayments(supabaseAdmin(), authShop.id, contractId);
    if (error) throw error;

    return NextResponse.json({ payments: payments || [] });
});

// ============================================
// POST /api/dashboard/contracts/[id]/payments
// Шинэ төлбөр бүртгэх
// ============================================
export const POST = withRoute<{ id: string }>({ module: 'contracts', access: 'write', error: 'Төлбөр бүртгэхэд алдаа гарлаа' }, async ({ request, shop: authShop, params }) => {
    const { id: contractId } = await params;
    const rawBody = await request.json();
    const validation = validateBody(CreatePaymentScheduleSchema, rawBody);
    if (!validation.success) return validation.response;
    const r = await addPayment(supabaseAdmin(), authShop.id, contractId, validation.data);
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
    const data = r.payment;

    return NextResponse.json({ payment: data, message: 'Төлбөр амжилттай бүртгэлээ' }, { status: 201 });
});

// ============================================
// PATCH /api/dashboard/contracts/[id]/payments
// Төлбөрийн мэдээлэл шинэчлэх (body-д payment id шаардлагатай)
// ============================================
export const PATCH = withRoute<{ id: string }>({ module: 'contracts', access: 'write', error: 'Төлбөр шинэчлэхэд алдаа гарлаа' }, async ({ request, shop: authShop, params }) => {
    const { id: contractId } = await params;
    const rawBody = await request.json().catch(() => ({}));
    // Allow-list schema — body-г шууд update-д өгөхгүй (shop_id/contract_id дарж бичихээс сэргийлнэ)
    const validation = validateBody(UpdatePaymentScheduleSchema, rawBody);
    if (!validation.success) return validation.response;
    const { payment_id, ...updates } = validation.data as typeof validation.data & Record<string, unknown>;

    const r = await updatePayment(supabaseAdmin(), authShop.id, payment_id, updates, { contractId });
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
    const data = r.payment;

    return NextResponse.json({ payment: data, message: 'Төлбөр шинэчлэгдлээ' });
});
