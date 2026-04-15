import { NextResponse, NextRequest } from 'next/server';
import { getClerkUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// ============================================
// GET /api/dashboard/contracts/[id]/payments
// Гэрээний төлбөрийн хуваарь татах
// ============================================
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authShop = await getClerkUserShop();
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
        const authShop = await getClerkUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { id: contractId } = await params;
        const body = await request.json();
        const supabase = supabaseAdmin();

        // Гэрээ байгаа эсэхийг шалгах
        const { data: contract } = await supabase
            .from('property_contracts')
            .select('id')
            .eq('id', contractId)
            .eq('shop_id', authShop.id)
            .single();

        if (!contract) {
            return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
        }

        const { data, error } = await supabase
            .from('payment_schedules')
            .insert({
                contract_id: contractId,
                shop_id: authShop.id,
                installment_number: body.installment_number || 1,
                label: body.label || null,
                due_date: body.due_date,
                amount: body.amount || 0,
                paid_amount: body.paid_amount || 0,
                paid_date: body.paid_date || null,
                payment_method: body.payment_method || null,
                status: body.paid_amount >= body.amount ? 'paid' : body.paid_amount > 0 ? 'partial' : 'pending',
                notes: body.notes || null,
            })
            .select()
            .single();

        if (error) throw error;

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
        const authShop = await getClerkUserShop();
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

        // Автомат status тодорхойлох
        if (updates.paid_amount !== undefined && updates.amount !== undefined) {
            if (updates.paid_amount >= updates.amount) {
                updates.status = 'paid';
            } else if (updates.paid_amount > 0) {
                updates.status = 'partial';
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
