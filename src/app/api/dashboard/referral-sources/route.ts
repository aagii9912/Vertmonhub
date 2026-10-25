import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import {
    CreateReferralSourceSchema, ReferralPresetSchema, ReorderReferralSourcesSchema, addDefaultReferralSources, createReferralSource,
    readReferralSources, referralInputError, reorderReferralSources, type ReferralFailure,
} from '@/lib/sales/referral-sources-store';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const fail = (result: ReferralFailure) => NextResponse.json({ error: result.error }, { status: result.status });

/**
 * GET /api/dashboard/referral-sources — тухайн төслийн (shop) «Сэжим (хаанаас ирсэн)»-ийн сонголтууд.
 * Уулзалт, гэрээ, тайлан, тохиргоо уншигч бүрт (лидийн өгөгдөл биш, төслийн тохиргоо).
 *   ?include=archived — архивласныг нэмнэ (засвар, тайлан, тохиргоо).
 * `available: false` = migration ороогүй (жагсаалт хоосон, уулзалт бүртгэхийг хаахгүй).
 */
export const GET = withRoute({ module: ['viewings', 'contracts', 'reports', 'settings'], error: '«Сэжим»-ийн жагсаалт татахад алдаа гарлаа' }, async ({ request, shop }) => {
    const includeArchived = new URL(request.url).searchParams.get('include') === 'archived';
    const { sources, available } = await readReferralSources(supabaseAdmin(), shop.id, { includeArchived });
    return NextResponse.json({ sources, available }, { headers: NO_STORE });
});

/**
 * POST /api/dashboard/referral-sources — сонголт нэмэх (Тохиргоо бичих эрх).
 *   { name } → 201 { source }
 *   { preset: 'defaults' } → санал болгосон жагсаалтаас байхгүйг нь нэмнэ → { created, skipped }
 */
export const POST = withRoute({ module: 'settings', access: 'write', error: '«Сэжим» нэмэхэд алдаа гарлаа' }, async ({ request, shop }) => {
    const body = await request.json().catch(() => null);
    const db = supabaseAdmin();
    const actorId = await getUserId();
    if (body && typeof body === 'object' && 'preset' in body) {
        if (!ReferralPresetSchema.safeParse(body).success) return NextResponse.json({ error: 'Буруу загвар' }, { status: 400 });
        const result = await addDefaultReferralSources(db, shop.id, actorId);
        if (!result.ok) return fail(result);
        return NextResponse.json({ created: result.created, skipped: result.skipped });
    }
    const parsed = CreateReferralSourceSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: referralInputError(parsed.error) }, { status: 400 });
    const result = await createReferralSource(db, shop.id, parsed.data, actorId);
    if (!result.ok) return fail(result);
    return NextResponse.json({ source: result.source }, { status: 201 });
});

/**
 * PATCH /api/dashboard/referral-sources — эрэмбэ (Тохиргоо бичих эрх): { order: uuid[] } нь төслийн бүх
 * сонголтын (архивласан орно) шинэ дараалал → { sources }.
 */
export const PATCH = withRoute({ module: 'settings', access: 'write', error: '«Сэжим»-ийн эрэмбэ хадгалахад алдаа гарлаа' }, async ({ request, shop }) => {
    const parsed = ReorderReferralSourcesSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: referralInputError(parsed.error) }, { status: 400 });
    const result = await reorderReferralSources(supabaseAdmin(), shop.id, parsed.data.order, await getUserId());
    if (!result.ok) return fail(result);
    return NextResponse.json({ sources: result.sources });
});
