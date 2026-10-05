import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserId } from '@/lib/auth/supabase-auth';
import { withRoute } from '@/lib/api/route';
import { UpdateServiceLogSchema, serviceLogInputError, updateServiceLog } from '@/lib/services/ServiceLogService';

// ============================================
// PATCH /api/dashboard/service-logs/[id]
// Төлөв, чухлал, хариуцагч, шийдвэрлэлт — хатуу allow-list; resolved_at-ийн
// шилжилтийг ServiceLogService хариуцна (шийдвэрлэсэн → хаасан үед хэвээр, дахин нээхэд цэвэрлэнэ).
// ============================================
export const PATCH = withRoute<{ id: string }>({ module: 'customer-service', access: 'write', error: 'Хүсэлт шинэчлэхэд алдаа гарлаа' }, async ({ request, shop: authShop, params }) => {
    const { id } = await params;
    const parsed = UpdateServiceLogSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: serviceLogInputError(parsed.error) }, { status: 400 });
    const result = await updateServiceLog(supabaseAdmin(), { shopId: authShop.id, id, userId: await getUserId(), patch: parsed.data });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ log: result.data, message: 'Хүсэлт шинэчлэгдлээ' });
});

// ============================================
// DELETE /api/dashboard/service-logs/[id]
// Устгах
// ============================================
export const DELETE = withRoute<{ id: string }>({ module: 'customer-service', access: 'delete', error: 'Устгахад алдаа гарлаа' }, async ({ shop: authShop, params }) => {
    const { id } = await params;
    const supabase = supabaseAdmin();

    const { error } = await supabase
        .from('service_logs')
        .delete()
        .eq('id', id)
        .eq('shop_id', authShop.id);

    if (error) throw error;

    return NextResponse.json({ message: 'Хүсэлт устгагдлаа' });
});
