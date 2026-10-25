import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { recordAudit } from '@/lib/services/AuditService';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { ubDateStr } from '@/lib/utils/date';
import { isMissingReferralSchema, REFERRAL_UNAVAILABLE, resolveReferralSource } from '@/lib/sales/referral-sources-store';
import { NOT_CANCELLED_CONTRACT } from '@/lib/contracts/live';
import { contractUnitKey } from '@/lib/inventory/report-inventory';

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
    // «Сэжим (хаанаас ирсэн)» — төслийн идэвхтэй жагсаалтаас (одоогийн архивласан сонголт хэвээр үлдэж болно); null = цэвэрлэх.
    referral_source_id: z.guid().nullable().optional(),
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
    // Төлөв солиход байрыг (product_type + unit_label) мөн уншина — цуцалсныг сэргээхэд доорх шалгалтад.
    const settingStatus = updateData.contract_status !== undefined;
    const beforeColumns = [...new Set([...Object.keys(updateData), ...(settingOrderDate ? ['contract_date'] : []), ...(settingStatus ? ['product_type', 'unit_label'] : [])])];
    const { data: before, error: beforeError } = await ownContract(supabase
        .from('property_contracts')
        .select(beforeColumns.join(', '))
        .eq('id', id)
        .eq('shop_id', authShop.id))
        .is('deleted_at', null)
        .maybeSingle();
    if (beforeError && 'referral_source_id' in updateData && isMissingReferralSchema(beforeError)) {
        return NextResponse.json({ error: REFERRAL_UNAVAILABLE }, { status: 503 });
    }
    if (beforeError) throw beforeError;
    if (!before) return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
    const previous = { ...(before as unknown as Record<string, unknown>) };
    if (updateData.referral_source_id !== undefined) {
        const referral = await resolveReferralSource(supabase, authShop.id, { id: updateData.referral_source_id },
            { current: (previous.referral_source_id as string | null | undefined) ?? null });
        if (!referral.ok) return NextResponse.json({ error: referral.error }, { status: referral.status });
    }
    // «Сэргээх»: цуцалсан гэрээг дахин амьд болгоход байранд өөр амьд гэрээ байх ёсгүй (HUB импортын
    // import_contract_list-ийн «unit_taken»-тэй ижил дүрэм) — эс бөгөөс нэг байр төлөвлөгөө, давхрын зураглалд хоёр удаа орно.
    // Байрыг давхрын зураглалын түлхүүрээр (contractUnitKey: төрөл + unit_label-ийн таслалаас өмнөх код) тулгана:
    // «Б1-25» ба «Б1-25, P-12» нэг байр. ilike-ээр өргөн уншаад түлхүүрээр яг шүүнэ (LIKE-ийн тусгай тэмдэгт зөвхөн өргөсгөнө,
    // `\` escape тул `_` болгоно).
    const reviving = settingStatus && updateData.contract_status !== 'cancelled' && previous.contract_status === 'cancelled';
    const unitKey = reviving ? contractUnitKey((previous.product_type as string | null) ?? null, (previous.unit_label as string | null) ?? null) : null;
    if (unitKey) {
        const code = unitKey.slice(unitKey.indexOf('|') + 1);
        const { data: sameCode, error: takenError } = await supabase
            .from('property_contracts')
            .select('id, product_type, unit_label')
            .eq('shop_id', authShop.id)
            .neq('id', id)
            .is('deleted_at', null)
            .or(NOT_CANCELLED_CONTRACT)
            .ilike('unit_label', `%${code.replace(/\\/g, '_')}%`);
        if (takenError) throw takenError;
        const taken = ((sameCode ?? []) as Array<{ product_type: string | null; unit_label: string | null }>)
            .some(row => contractUnitKey(row.product_type, row.unit_label) === unitKey);
        if (taken) {
            return NextResponse.json({ error: `«${code}» байранд өөр идэвхтэй гэрээ байна — нэг байранд хоёр идэвхтэй гэрээ үүсгэхгүй. Тэр гэрээг шалгаад дахин оролдоно уу.` }, { status: 409 });
        }
    }
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
    // Сэргээх: байрыг шалгах үеийн цуцалсан төлөв хэвээр байвал л бичнэ (хооронд өөр хүн өөрчилсөн бол 409).
    // Хоёр өөр цуцалсан гэрээг нэг байранд зэрэг сэргээхийг энэ хаахгүй — тэр нь RPC/DB индекс шаардана.
    if (reviving) update = update.eq('contract_status', 'cancelled');
    const { data, error } = await update.select().maybeSingle();

    if (error) throw error;
    if (!data) {
        return settingOrderDate || reviving
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
