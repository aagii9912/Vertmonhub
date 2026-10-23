import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { loadNegotiations } from '@/lib/dashboard/negotiations-load';

/**
 * GET /api/dashboard/reports/negotiations — «Ярилцаж буй гэрээ» (W13): «Хэлэлцэж байна» / «Санал тавьсан»
 * төлөвтэй, амьд гэрээгүй лид бүрийн сүүлийн сонирхол, өнөөдрийн баталсан үнээр (`buildNegotiations`).
 * Захиалагчийн нэр, утас гаргахгүй. `reports` модуль (super_admin нэвтэрнэ); төслийн хүрээгээр хязгаарлагдсан
 * менежерт 403; лидийг `applyLeadScope`-оор уншина. Үнийн тохиргоо уншиж чадаагүй бол 503.
 */
export const GET = withRoute({ module: 'reports', error: 'Ярилцаж буй гэрээг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ shop }) => {
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    if (scope.projectIds !== null) return NextResponse.json({ error: 'Багийн ярилцаж буй гэрээ удирдлагад харагдана' }, { status: 403 });
    const report = await loadNegotiations(db, { shopId: shop.id, scope });
    return NextResponse.json({ ...report, projectName: shop.name }, { headers: { 'Cache-Control': 'private, no-store' } });
});
