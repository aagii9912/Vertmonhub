import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { loadPlanPerformance } from '@/lib/sales/plan-performance-load';
import { ubParts } from '@/lib/utils/date';

const yearSchema = z.coerce.number().int().min(2000).max(2100);

/**
 * GET /api/dashboard/reports/plan-performance?year= — төслийн сар × блокийн төлөвлөгөөний биелэлт.
 * Багийн төлөвлөгөө удирдлагад: `reports` модуль (super_admin нэвтэрнэ), төслийн хүрээгээр хязгаарлагдсан менежерт 403.
 * Орсон мөнгөний төлөвлөгөө, гүйцэтгэл зөвхөн super_admin эсвэл `finance` эрхтэй (үйл ажиллагааны тайлангийн дүрэм);
 * бусдад хэсэг нь огт ирэхгүй (`cashHidden: true`).
 */
export const GET = withRoute({ module: 'reports', error: 'Төлөвлөгөөний биелэлтийг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const raw = request.nextUrl.searchParams.get('year');
    const year = yearSchema.safeParse(raw ?? ubParts().year);
    if (!year.success) return NextResponse.json({ error: 'Он буруу байна' }, { status: 400 });
    const db = supabaseAdmin();
    const [permissions, scope] = await Promise.all([resolvePermissions(), resolveSalesProjectScope(db, shop.id)]);
    if (!permissions) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    if (scope.projectIds !== null) return NextResponse.json({ error: 'Багийн төлөвлөгөө удирдлагад харагдана' }, { status: 403 });
    const canReadFinance = permissions.role === 'super_admin' || permissions.permissions.modules.includes('finance');
    const report = await loadPlanPerformance(db, { shopId: shop.id, year: year.data, canReadFinance });
    return NextResponse.json({ ...report, shopName: shop.name, ...(canReadFinance ? {} : { cashHidden: true }) }, {
        headers: { 'Cache-Control': 'private, no-store' },
    });
});
