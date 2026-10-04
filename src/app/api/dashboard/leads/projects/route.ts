import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { applyProjectScope, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import { withRoute } from '@/lib/api/route';

/** Лидийн төслийн сонгогч — менежер зөвхөн харьяалагдах төслүүдээ харна. */
export const GET = withRoute({ module: ['leads', 'viewings'], error: 'Төслийн жагсаалт татахад алдаа гарлаа' }, async ({ shop }) => {
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    const projects = await fetchAllRows<{ id: string; name: string }>((from, to) => applyProjectScope(
        db.from('projects').select('id, name').eq('shop_id', shop.id).order('name').order('id').range(from, to),
        scope, 'id',
    ));
    return NextResponse.json({ projects }, { headers: { 'Cache-Control': 'private, no-store' } });
});
