import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { PricingRetireSchema, PricingSaveSchema } from '@/lib/sales/pricing';
import { loadPricingOverview, retirePriceList, savePricingConfig } from '@/lib/sales/pricing-store';
import { loadModelAreas } from '@/lib/sales/model-area-load';

export const GET = withRoute({ module: 'settings', error: 'Үнийн тохиргоо уншиж чадсангүй' }, async ({ shop }) => {
    if (!await getAdminUser()) return NextResponse.json({ error: 'Удирдлагын эрх шаардлагатай' }, { status: 403 });
    const db = supabaseAdmin();
    // `model_areas`: register areas per block and model, for a project that names a model with its area (else empty).
    const [overview, model_areas] = await Promise.all([loadPricingOverview(db, shop.id), loadModelAreas(db, shop.id)]);
    return NextResponse.json({ ...overview, model_areas }, { headers: { 'Cache-Control': 'private, no-store' } });
});

export const PUT = withRoute({ module: 'settings', access: 'write', error: 'Үнийн тохиргоо хадгалагдсангүй' }, async ({ request, shop }) => {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: 'Удирдлагын эрх шаардлагатай' }, { status: 403 });
    const parsed = PricingSaveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Үнийн тохиргоо буруу байна' }, { status: 400 });
    return NextResponse.json({ config: await savePricingConfig(supabaseAdmin(), shop.id, admin.id, parsed.data) });
});

/** «Идэвхгүй болгох»: withdraws one list's active price without a replacement; the version stays in the archive. */
export const DELETE = withRoute({ module: 'settings', access: 'write', error: 'Үнийг идэвхгүй болгож чадсангүй' }, async ({ request, shop }) => {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: 'Удирдлагын эрх шаардлагатай' }, { status: 403 });
    const parsed = PricingRetireSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Үнийн жагсаалт буруу байна' }, { status: 400 });
    return NextResponse.json({ config: await retirePriceList(supabaseAdmin(), shop.id, admin.id, parsed.data) });
});
