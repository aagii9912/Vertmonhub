import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { PriceListKeySchema } from '@/lib/sales/pricing';
import { assertPricingProjectAccess, loadPricingSheet } from '@/lib/sales/pricing-store';

const VersionSchema = z.coerce.number().int().positive().max(1_000_000);

/** «Үнэ, нөхцөл»: the project's price lists — each one's active approved price and archive. Read only; drafts are never shown. */
export const GET = withRoute({ module: 'properties', error: 'Үнийн мэдээлэл уншиж чадсангүй' }, async ({ request, shop }) => {
    const raw = request.nextUrl.searchParams.get('version');
    const version = raw === null ? null : VersionSchema.safeParse(raw);
    if (version && !version.success) return NextResponse.json({ error: 'Үнийн хувилбар буруу байна' }, { status: 400 });
    const rawList = request.nextUrl.searchParams.get('list');
    const list = rawList === null ? null : PriceListKeySchema.safeParse(rawList);
    if (list && !list.success) return NextResponse.json({ error: 'Үнийн жагсаалт буруу байна' }, { status: 400 });
    const db = supabaseAdmin();
    await assertPricingProjectAccess(db, shop.id, await resolveSalesProjectScope(db, shop.id));
    const sheet = await loadPricingSheet(db, shop.id, { list: list?.data ?? null, version: version?.data ?? null });
    return NextResponse.json(sheet, { headers: { 'Cache-Control': 'private, no-store' } });
});
