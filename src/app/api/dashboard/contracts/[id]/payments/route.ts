import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { CreatePaymentScheduleSchema, UpdatePaymentScheduleSchema, validateBody } from '@/lib/validations/schemas';
import { listPayments, addPayment, updatePayment } from '@/lib/services/PaymentService';

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
        const { data: payments, error } = await listPayments(supabaseAdmin(), authShop.id, contractId);
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
        const r = await addPayment(supabaseAdmin(), authShop.id, contractId, validation.data);
        if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
        const data = r.payment;

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
    } catch (error) {
        logger.error('[Payments API] PATCH error:', { error });
        return NextResponse.json(
            { error: 'Төлбөр шинэчлэхэд алдаа гарлаа' },
            { status: 500 }
        );
    }
}
