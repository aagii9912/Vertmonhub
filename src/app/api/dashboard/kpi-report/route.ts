import { NextRequest, NextResponse } from 'next/server';
import { ubParts } from '@/lib/utils/date';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier } from '@/lib/utils/rate-limiter';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { computeKpiReport } from '@/lib/dashboard/kpi-report-build';

/**
 * GET /api/dashboard/kpi-report?year=&month=&manager=<нэр>
 *
 * Сарын KPI тайлан — менежерийн тухайн сарын бүх ажлыг НЭГ дуудалтаар нэгтгэнэ:
 * шинэ лид, уулзалт, байгуулсан гэрээ, борлуулалт (manager_monthly_sales),
 * дуусгасан хувийн ажлууд (user_tasks) + өмнөх сарын харьцуулалт.
 * Сар бүр гараар «хийсэн ажлаа санаж бичих» ажлыг систем орлоно.
 *
 * • Эрхийн загвар my-stats-тай ИЖИЛ: ?manager= зөвхөн админ/reports-эрхтэй
 *   (өөрөө personal биш) хэрэглэгчид ажиллана — бусдад чимээгүй өөрийг нь буцаана.
 * • Миграци ороогүй орчинд хэсэг бүр хоосон буцна — 500 өгөхгүй.
 */

export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();

        const identifier = authShop?.id || getClientIdentifier(request) || 'anonymous';
        const rateLimitResult = await checkRateLimit(`kpi-report:${identifier}`, {
            windowMs: 60000,
            maxRequests: 30,
        });
        if (!rateLimitResult.allowed) {
            return createRateLimitResponse(rateLimitResult.resetAt);
        }

        const uid = await getUserId();
        if (!authShop || !uid) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const now = new Date();
        const year = Math.min(2100, Math.max(2020, parseInt(searchParams.get('year') || '', 10) || ubParts(now).year));
        const month = Math.min(12, Math.max(1, parseInt(searchParams.get('month') || '', 10) || ubParts(now).month));
        const managerParam = searchParams.get('manager');

        const db = supabaseAdmin();
        const [perms, identity] = await Promise.all([
            resolvePermissions(),
            resolveManagerIdentity(db, authShop.id, uid),
        ]);

        const role = perms?.role || 'viewer';
        const modules = perms?.permissions.modules || [];
        const isAdmin = role === 'admin' || role === 'super_admin';
        const isPersonalUser = !isAdmin && (role === 'sales_manager' || identity.isManager);
        const canViewOthers = !isPersonalUser && (isAdmin || modules.includes('reports'));

        const targetName = managerParam && canViewOthers ? managerParam : identity.managerName;
        if (!targetName) {
            return NextResponse.json({
                manager: { name: null, isSelf: true },
                shopName: authShop.name || null,
                year,
                month,
                onboarding: true,
            });
        }
        const report = await computeKpiReport(db, { shopId: authShop.id, shopName: authShop.name || null, identity, targetName, uid, year, month });
        return NextResponse.json(report);
    } catch (error) {
        return safeErrorResponse(error, 'KPI тайлан унших алдаа');
    }
}
