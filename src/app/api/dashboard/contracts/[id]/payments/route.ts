import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { CreatePaymentScheduleSchema, UpdatePaymentScheduleSchema, validateBody } from '@/lib/validations/schemas';
import { recordAudit } from '@/lib/services/AuditService';
import { resolveApiUser } from '@/lib/auth/resolve-user';

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

        await recordAudit({
            shopId: authShop.id,
            actorId: (await resolveApiUser())?.id ?? null,
            entity: 'contract',
            entityId: contractId,
            action: 'update',
            changes: { payment_created: { id: data.id, amount: d.amount, paid_amount: d.paid_amount } },
        });

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
        const rawBody = await request.json();
        const validation = validateBody(UpdatePaymentScheduleSchema, rawBody);
        if (!validation.success) return validation.response;
        const { payment_id, ...updates } = validation.data;

        const supabase = supabaseAdmin();

        // Өмнөх төлөвийг аудитад үлдээх + status-ыг зөв бодоход хэрэглэнэ.
        // Мөн тухайн төлбөр ЭНЭ гэрээнийх мөн эсэхийг баталгаажуулна —
        // өмнө нь зөвхөн shop_id-аар шүүдэг байсан тул нэг дэлгүүрийн
        // өөр гэрээний төлбөрийг засах боломжтой байв.
        const { data: before } = await supabase
            .from('payment_schedules')
            .select('*')
            .eq('id', payment_id)
            .eq('contract_id', contractId)
            .eq('shop_id', authShop.id)
            .maybeSingle();

        if (!before) {
            return NextResponse.json({ error: 'Төлбөр олдсонгүй' }, { status: 404 });
        }

        // Автомат status — шинэчлэлд ирээгүй талбарыг өмнөх утгаас нөхнө
        const patch: Record<string, unknown> = { ...updates };
        const paid = Number(patch.paid_amount ?? before.paid_amount);
        const total = Number(patch.amount ?? before.amount);
        if (Number.isFinite(paid) && Number.isFinite(total)) {
            patch.status = paid >= total ? 'paid' : paid > 0 ? 'partial' : 'pending';
        }

        const { data, error } = await supabase
            .from('payment_schedules')
            .update(patch)
            .eq('id', payment_id)
            .eq('contract_id', contractId)
            .eq('shop_id', authShop.id)
            .select()
            .single();

        if (error) throw error;

        // Гэрээний нийлбэрийг DB trigger (trg_sync_contract_paid_amount)
        // атомаар тэнцүүлнэ — энд гараар тооцохгүй.

        await recordAudit({
            shopId: authShop.id,
            actorId: (await resolveApiUser())?.id ?? null,
            entity: 'contract',
            entityId: contractId,
            action: 'update',
            changes: {
                payment_id,
                before: { amount: before.amount, paid_amount: before.paid_amount, status: before.status },
                after: { amount: data.amount, paid_amount: data.paid_amount, status: data.status },
            },
        });

        return NextResponse.json({ payment: data, message: 'Төлбөр шинэчлэгдлээ' });
    } catch (error) {
        logger.error('[Payments API] PATCH error:', { error });
        return NextResponse.json(
            { error: 'Төлбөр шинэчлэхэд алдаа гарлаа' },
            { status: 500 }
        );
    }
}
