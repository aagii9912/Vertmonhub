import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { recordAudit } from '@/lib/services/AuditService';

// Эзэмшигчийн нэрийг (customer_name) энд солихгүй — зөвхөн «Гэрээ шилжүүлэх» урсгалаар
// (POST [id]/transfer → transfer_contract RPC) түүх, аудиттай солигдоно.
const ContractPatchSchema = z.object({
    contract_status: z.enum(['active', 'closed', 'cancelled']).optional(),
    sales_manager: z.string().max(255).nullable().optional(),
    sales_channel: z.string().max(255).nullable().optional(),
    penalty_amount: z.coerce.number().nonnegative().max(1e15).nullable().optional(),
    overdue_days: z.coerce.number().int().nonnegative().nullable().optional(),
    customer_phone: z.string().max(100).nullable().optional(),
    remaining_payment_condition: z.string().max(2000).nullable().optional(),
    balance_payment_method: z.string().max(255).nullable().optional(),
    project_id: z.string().uuid().nullable().optional(),
}).strict();

/** numeric багана string/number аль аль хэлбэрээр ирж болно — аудитад жинхэнэ өөрчлөлтийг л бичнэ. */
const sameValue = (a: unknown, b: unknown) => (a ?? null) === null ? (b ?? null) === null : (b ?? null) !== null && String(a) === String(b);

const RECEIPT_DERIVED_FIELDS = ['paid_amount', 'paid_percent', 'balance', 'prepayment_paid', 'prepayment_paid_cash', 'prepayment_paid_barter'];

export const GET = withRoute<{ id: string }>({ module: 'contracts', error: 'Алдаа гарлаа' }, async ({ shop: authShop, params }) => {
    const { id } = await params;
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
        .from('property_contracts')
        .select('*')
        .eq('id', id)
        .eq('shop_id', authShop.id)
        .is('deleted_at', null)
        .maybeSingle();

    if (error || !data) {
        return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
    }

    return NextResponse.json({ contract: data });
});

export const DELETE = withRoute<{ id: string }>({ module: 'contracts', access: 'delete', error: 'Устгахад алдаа гарлаа' }, async ({ shop: authShop, params }) => {
    const { id } = await params;
    // Soft delete — AI туслахын delete_contract-тай нэг зан төлөв (сэргээх боломжтой,
    // manager_monthly_sales/статистик deleted_at-аар шүүдэг). Өмнө нь hard delete байв.
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
        .from('property_contracts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('shop_id', authShop.id)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
    return NextResponse.json({ success: true });
});

export const PATCH = withRoute<{ id: string }>({ module: 'contracts', access: 'write', error: 'Шинэчлэхэд алдаа гарлаа' }, async ({ request, shop: authShop, params }) => {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    // Imported opening balances remain unchanged. New paid amounts must create dated receipts.
    if (body && typeof body === 'object' && RECEIPT_DERIVED_FIELDS.some(key => key in body)) {
        return NextResponse.json({ error: 'Төлсөн дүн, үлдэгдлийг эндээс шууд өөрчлөхгүй. Гэрээний төлбөрийн графикаар орлого бүртгэнэ үү.' }, { status: 400 });
    }
    if (body && typeof body === 'object' && 'customer_name' in body) {
        return NextResponse.json({ error: 'Эзэмшигчийн нэрийг «Гэрээ шилжүүлэх» үйлдлээр солино уу (түүх, аудит хадгалагдана).' }, { status: 400 });
    }
    const parsed = ContractPatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Гэрээний өгөгдөл буруу байна' }, { status: 400 });
    const updateData = parsed.data;
    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'Шинэчлэх талбар алга' }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    if (updateData.project_id) {
        const { data: project, error } = await supabase.from('projects').select('id')
            .eq('id', updateData.project_id).eq('shop_id', authShop.id).maybeSingle();
        if (error) throw error;
        if (!project) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 400 });
    }
    // Аудитад өмнөх утгыг хадгална (утас зэрэг холбоо барих засвар түүхгүй алга болохгүй).
    const { data: before, error: beforeError } = await supabase
        .from('property_contracts')
        .select(Object.keys(updateData).join(', '))
        .eq('id', id)
        .eq('shop_id', authShop.id)
        .is('deleted_at', null)
        .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
    const { data, error } = await supabase
        .from('property_contracts')
        .update(updateData)
        .eq('id', id)
        .eq('shop_id', authShop.id)
        .is('deleted_at', null)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
    const previous = before as unknown as Record<string, unknown>;
    const changes = Object.fromEntries(Object.entries(updateData)
        .filter(([key, value]) => !sameValue(previous[key], value))
        .map(([key, value]) => [key, { from: previous[key] ?? null, to: value ?? null }]));
    if (Object.keys(changes).length) {
        await recordAudit({ shopId: authShop.id, actorId: await getUserId(), entity: 'contract', entityId: id, action: 'update', changes });
    }
    return NextResponse.json({ contract: data });
});
