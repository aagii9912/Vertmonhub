import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { PricingSelectionSchema } from '@/lib/sales/pricing';
import { quoteViewingSelection } from '@/lib/sales/pricing-store';

/** Calculation only: does not create a viewing, contact, contract, or payment. */
export const POST = withRoute({ module: 'viewings', error: 'Үнийн санал тооцож чадсангүй' }, async ({ request, shop }) => {
    const parsed = PricingSelectionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Байрны сонголт буруу байна' }, { status: 400 });
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    return NextResponse.json(await quoteViewingSelection(db, shop.id, parsed.data, scope), { headers: { 'Cache-Control': 'private, no-store' } });
});
