import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { dateSchema } from '@/lib/marketing/performance';
import { resolveReportViewer } from '@/lib/sales/manager-identity';
import { activityRangeError, buildPeriods, resolveActivityRange, type ActivityGroup } from '@/lib/sales/activity';
import { findActivityManager, loadManagerActivity } from '@/lib/sales/activity-load';
import { ubDateStr } from '@/lib/utils/date';

const QuerySchema = z.object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    group: z.enum(['day', 'week', 'month']).default('day'),
    manager: z.string().trim().min(1).max(120).optional(),
});

/**
 * GET /api/dashboard/reports/manager-activity?from=&to=&group=day|week|month&manager=
 * Менежерийн дуудлага, болсон уулзалт, санал хүсэлтийн шийдвэрлэлт, өдрийн зорилтын биелэлт.
 * • Менежер (хувийн горим) зөвхөн өөрийнхийг харна — `manager` параметрийг үл тооцно.
 * • Багийн харагдац: super_admin эсвэл `reports` модультай, хувийн горимгүй хэрэглэгч.
 *   Зөвхөн `dashboard` модультай байгууллагын хэрэглэгчид 403. Бүртгэлгүй `manager` нэрт 404.
 * • `to` өгөөгүй бол өнөөдөр, `from` өгөөгүй бол `to`-гийн өдөр/7 хоног/сарын эхэн (AI tool-тэй ижил).
 */
export const GET = withRoute({ module: ['reports', 'dashboard'], error: 'Менежерийн идэвхийн тайланг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = QuerySchema.safeParse(params);
    if (!parsed.success) return NextResponse.json({ error: 'Огноо эсвэл шүүлтүүр буруу байна' }, { status: 400 });
    const today = ubDateStr();
    const group: ActivityGroup = parsed.data.group;
    const { from, to } = resolveActivityRange(parsed.data.from, parsed.data.to, group, today);
    const rangeError = activityRangeError(from, to);
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });

    const [permissions, userId] = await Promise.all([resolvePermissions(), getUserId()]);
    if (!permissions) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const db = supabaseAdmin();
    const viewer = await resolveReportViewer(db, shop.id, { userId, role: permissions.role, modules: permissions.permissions.modules });

    let only: string | null = null;
    if (viewer.personal) {
        // Бүртгэлгүй менежерт хоосон (0 биш) — админ бүртгэлд нэмэх хүртэл. Зөвхөн акаунттай холбосон мөр:
        // хэрэглэгч өөрөө засдаг профайлын нэрээр дансгүй (legacy) менежерийн идэвхийг авч болохгүй.
        const entry = viewer.identity?.rosterEntry ?? null;
        const own = entry && userId && entry.user_id === userId ? entry.name : null;
        if (!own) {
            return NextResponse.json({ from, to, group, today, targetDays: 0, periods: buildPeriods(from, to, group, today), managers: [], unattributed: null,
                personal: true, onboarding: true, canEdit: false }, { headers: { 'Cache-Control': 'private, no-store' } });
        }
        only = own;
    } else if (!viewer.canViewTeam) {
        return NextResponse.json({ error: 'Багийн идэвхийг харах эрхгүй' }, { status: 403 });
    } else if (parsed.data.manager) {
        const found = await findActivityManager(db, shop.id, parsed.data.manager);
        if (!found.ok) return NextResponse.json({ error: found.error, options: found.options }, { status: 404 });
        only = found.name;
    }

    const report = await loadManagerActivity(db, { shopId: shop.id, from, to, group, only, now: new Date() });
    return NextResponse.json({ ...report, personal: viewer.personal, onboarding: false, canEdit: viewer.isAdmin }, { headers: { 'Cache-Control': 'private, no-store' } });
});
