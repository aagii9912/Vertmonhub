import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { ubDateStr } from '@/lib/utils/date';
import { shiftDate } from '@/lib/sales/activity';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { formalManagerName } from '@/lib/dashboard/daily-report';
import { resolveDailyReportViewer } from '@/lib/dashboard/daily-report-load';
import {
    DAILY_MEETING_BACKDATE_DAYS, DailyMeetingRequestSchema, dailyMeetingInputError, type DailyMeetingResponse,
} from '@/lib/dashboard/daily-report-meetings';
import {
    completeDailyMeeting, reassignDailyMeeting, recordDailyMeeting, type DailyMeetingActor,
} from '@/lib/services/DailyMeetingService';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const deny = (error: string, status = 403) => NextResponse.json({ error }, { status, headers: NO_STORE });

/**
 * POST /api/dashboard/daily-report/meetings — «Өдрийн тайлан»-гийн уулзалт (эзэмшигч 2026-10-19).
 * • `record`: ээлжийн менежер хамт олныхоо болсон уулзалтыг тухайн менежерийн нэр дээр бүртгэнэ
 *   (утсаар төслийн лидийг хайж давхар лид үүсгэхгүй).
 * • `complete`: тэр өдрийн товлосон уулзалтыг «Болсон» / «Ирээгүй» (менежер өөрчлөгдөхгүй).
 * • `reassign`: зөвхөн admin/super_admin — уулзалтыг аль менежерт тооцохыг засна.
 * Төсөлдөө бүртгэлтэй менежер (хувийн горим) — зөвхөн өөрийн төслүүдэд, сүүлийн 7 хоногт; багийн
 * тайлан харах эрхтэй байгууллагын хэрэглэгч — хязгааргүй. Ирээдүйн өдөр бүртгэхгүй.
 */
export const POST = withRoute({ module: 'viewings', access: 'write', error: 'Уулзалтыг хадгалж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const parsed = DailyMeetingRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return deny(dailyMeetingInputError(parsed.error), 400);
    const data = parsed.data;
    const today = ubDateStr();
    if (data.date > today) return deny('Ирээдүйн өдрийн уулзалт бүртгэхгүй', 400);

    const [permissions, userId] = await Promise.all([resolvePermissions(), getUserId()]);
    if (!permissions || !userId) return deny('Нэвтрэх шаардлагатай', 401);
    if (data.action === 'reassign' && permissions.role !== 'admin' && permissions.role !== 'super_admin') {
        return deny('Зөвхөн админ уулзалтын менежерийг солино');
    }
    const db = supabaseAdmin();
    const viewer = await resolveDailyReportViewer(db, shop.id, { userId, role: permissions.role, modules: permissions.permissions.modules });

    let actor: DailyMeetingActor;
    if (viewer.personal) {
        const own = viewer.ownManager;
        if (!own) return deny('Таны нэр борлуулалтын менежерийн бүртгэлд холбогдоогүй байна');
        const scope = await resolveSalesProjectScope(db, shop.id, { userId, role: permissions.role });
        if (scope.projectIds === null || !scope.projectIds.length || scope.managerName !== own) return deny('Уулзалт бүртгэх эрхгүй');
        if (data.date < shiftDate(today, -DAILY_MEETING_BACKDATE_DAYS)) return deny(`Зөвхөн сүүлийн ${DAILY_MEETING_BACKDATE_DAYS} хоногийн уулзалтыг бүртгэнэ`, 400);
        actor = { userId, name: own, projectIds: scope.projectIds };
    } else if (viewer.canViewTeam) {
        const entry = viewer.identity?.rosterEntry;
        const name = (entry ? formalManagerName(entry.name) : viewer.identity?.fullName?.trim()) || 'Хэрэглэгч';
        actor = { userId, name: name.slice(0, 120), projectIds: null };
    } else {
        return deny('Өдрийн тайлангийн уулзалт бүртгэх эрхгүй');
    }

    const result = data.action === 'record' ? await recordDailyMeeting(db, shop.id, actor, data)
        : data.action === 'complete' ? await completeDailyMeeting(db, shop.id, actor, data)
        : await reassignDailyMeeting(db, shop.id, actor, data);
    if (!result.ok) return deny(result.error, result.status);
    const body: DailyMeetingResponse = { ok: true, ...result.data };
    return NextResponse.json(body, { status: data.action === 'record' ? 201 : 200, headers: NO_STORE });
});
