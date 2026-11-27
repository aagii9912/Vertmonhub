import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { UnitPriceRetireSchema, UnitPriceSaveSchema } from '@/lib/sales/unit-pricing';
import { loadUnitPriceOverview, retireUnitPriceList, saveUnitPriceList } from '@/lib/sales/unit-pricing-store';

/** Per-unit price lists (parking, storage, service space): the editor's lists with their latest and active versions. */
export const GET = withRoute({ module: 'settings', error: 'Тоотын үнийн тохиргоо уншиж чадсангүй' }, async ({ shop }) => {
    if (!await getAdminUser()) return NextResponse.json({ error: 'Удирдлагын эрх шаардлагатай' }, { status: 403 });
    return NextResponse.json(await loadUnitPriceOverview(supabaseAdmin(), shop.id), { headers: { 'Cache-Control': 'private, no-store' } });
});

export const PUT = withRoute({ module: 'settings', access: 'write', error: 'Тоотын үнэ хадгалагдсангүй' }, async ({ request, shop }) => {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: 'Удирдлагын эрх шаардлагатай' }, { status: 403 });
    const parsed = UnitPriceSaveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Үнийн тохиргоо буруу байна' }, { status: 400 });
    return NextResponse.json({ list: await saveUnitPriceList(supabaseAdmin(), shop.id, admin.id, parsed.data) });
});

/** «Идэвхгүй болгох»: withdraws one list's active price; the version stays archived. */
export const DELETE = withRoute({ module: 'settings', access: 'write', error: 'Үнийг идэвхгүй болгож чадсангүй' }, async ({ request, shop }) => {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: 'Удирдлагын эрх шаардлагатай' }, { status: 403 });
    const parsed = UnitPriceRetireSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Үнийн жагсаалт буруу байна' }, { status: 400 });
    return NextResponse.json({ list: await retireUnitPriceList(supabaseAdmin(), shop.id, admin.id, parsed.data) });
});
