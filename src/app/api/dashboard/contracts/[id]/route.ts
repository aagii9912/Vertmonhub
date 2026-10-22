import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { recordAudit } from '@/lib/services/AuditService';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { ubDateStr } from '@/lib/utils/date';

/** YYYY-MM-DD, хуанлийн жинхэнэ өдөр (2026-02-30 биш). */
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
/** Захиалга өгсөн огнооны доод хязгаар — төлөвлөгөөний биелэлтийн тайлангийн оны хүрээ (2000–2100)-тэй ижил:
 *  «0202-10-01» мэт алдаа гэрээг бүх тайлангаас чимээгүй хасах ба дараа нь энд солигдохгүй. */
const ORDER_DATE_MIN = '2000-01-01';

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
    // «Огноо оруулах»: захиалга өгсөн огноо хоосон үед л нэг удаа (солих, арилгахгүй); гэрээний огноо
    // хоосон бол мөн энэ өдөр болно (HUB-ийн дүрэм: захиалга өгсөн огноо = борлуулалтын огноо).
    order_date: DateString.optional(),
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
    // Хязгаарлагдсан менежер зөвхөн өөрийн нэр дээрх гэрээг засна, менежерийг солихгүй:
    // эс бөгөөс sales_manager-ийг өөр дээрээ шилжүүлээд «Гэрээ шилжүүлэх» хязгаарыг тойрч, борлуулалтыг өөртөө авна.
    const scope = await resolveSalesProjectScope(supabase, authShop.id);
    if (scope.projectIds !== null) {
        if ('sales_manager' in updateData) {
            return NextResponse.json({ error: 'Гэрээний менежерийг зөвхөн админ солино' }, { status: 403 });
        }
        if (!scope.managerName) {
            return NextResponse.json({ error: 'Зөвхөн өөрийн борлуулсан гэрээг засах боломжтой' }, { status: 403 });
        }
    }
    const ownContract = <Q extends { eq: (column: string, value: string) => Q }>(query: Q): Q =>
        scope.projectIds === null ? query : query.eq('sales_manager', scope.managerName || '');
    if (updateData.project_id) {
        const { data: project, error } = await supabase.from('projects').select('id')
            .eq('id', updateData.project_id).eq('shop_id', authShop.id).maybeSingle();
        if (error) throw error;
        if (!project) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 400 });
    }
    const settingOrderDate = updateData.order_date !== undefined;
    if (settingOrderDate && updateData.order_date! > ubDateStr()) {
        return NextResponse.json({ error: 'Захиалга өгсөн огноо өнөөдрөөс хойш байж болохгүй' }, { status: 400 });
    }
    if (settingOrderDate && updateData.order_date! < ORDER_DATE_MIN) {
        return NextResponse.json({ error: 'Захиалга өгсөн огноо 2000 оноос өмнө байж болохгүй' }, { status: 400 });
    }
    // Аудитад өмнөх утгыг хадгална (утас зэрэг холбоо барих засвар түүхгүй алга болохгүй).
    const beforeColumns = [...new Set([...Object.keys(updateData), ...(settingOrderDate ? ['contract_date'] : [])])];
    const { data: before, error: beforeError } = await ownContract(supabase
        .from('property_contracts')
        .select(beforeColumns.join(', '))
        .eq('id', id)
        .eq('shop_id', authShop.id))
        .is('deleted_at', null)
        .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
    const previous = { ...(before as unknown as Record<string, unknown>) };
    const payload: Record<string, unknown> = { ...updateData };
    if (settingOrderDate) {
        if (previous.order_date) {
            // Ижил огноог дахин илгээсэн (хариу тасарсны дараах давталт) — өөрчлөлтгүй, аудитгүй амжилт.
            if (String(previous.order_date) === updateData.order_date && Object.keys(updateData).length === 1) {
                const { data: current, error: currentError } = await ownContract(supabase
                    .from('property_contracts')
                    .select('*')
                    .eq('id', id)
                    .eq('shop_id', authShop.id))
                    .is('deleted_at', null)
                    .maybeSingle();
                if (currentError) throw currentError;
                if (current) return NextResponse.json({ contract: current, replayed: true });
            }
            return NextResponse.json({ error: 'Захиалга өгсөн огноо бүртгэгдсэн байна — энд солихгүй.' }, { status: 409 });
        }
        if (!previous.contract_date) payload.contract_date = updateData.order_date;
    }
    let update = ownContract(supabase
        .from('property_contracts')
        .update(payload)
        .eq('id', id)
        .eq('shop_id', authShop.id))
        .is('deleted_at', null);
    // Зэрэг хадгалалт: хоосон байсан огноог л бөглөнө (өөр хүн түрүүлж оруулсан бол 409).
    if (settingOrderDate) update = update.is('order_date', null);
    if ('contract_date' in payload) update = update.is('contract_date', null);
    const { data, error } = await update.select().maybeSingle();

    if (error) throw error;
    if (!data) {
        return settingOrderDate
            ? NextResponse.json({ error: 'Гэрээ өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу.' }, { status: 409 })
            : NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
    }
    const changes = Object.fromEntries(Object.entries(payload)
        .filter(([key, value]) => !sameValue(previous[key], value))
        .map(([key, value]) => [key, { from: previous[key] ?? null, to: value ?? null }]));
    if (Object.keys(changes).length) {
        await recordAudit({ shopId: authShop.id, actorId: await getUserId(), entity: 'contract', entityId: id, action: 'update', changes });
    }
    return NextResponse.json({ contract: data });
});
