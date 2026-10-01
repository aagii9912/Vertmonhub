import { NextResponse } from 'next/server';
import { requireAnyModule } from '@/lib/auth/require-permission';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { applyProjectScope, ProjectScopeError, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/** Лидийн төслийн сонгогч — менежер зөвхөн харьяалагдах төслүүдээ харна. */
export async function GET() {
    try {
        const denied = await requireAnyModule(['leads', 'viewings']);
        if (denied) return denied;
        const shop = await getUserShop();
        if (!shop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const db = supabaseAdmin();
        const scope = await resolveSalesProjectScope(db, shop.id);
        const projects = await fetchAllRows<{ id: string; name: string }>((from, to) => applyProjectScope(
            db.from('projects').select('id, name').eq('shop_id', shop.id).order('name').order('id').range(from, to),
            scope, 'id',
        ));
        return NextResponse.json({ projects }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
        return safeErrorResponse(error, 'Төслийн жагсаалт татахад алдаа гарлаа');
    }
}
