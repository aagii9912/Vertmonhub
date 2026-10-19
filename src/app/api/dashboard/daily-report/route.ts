import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { ubDateStr } from '@/lib/utils/date';
import { configMetrics, DailyReportDateSchema, SaveDailyReportSchema, UNASSIGNED } from '@/lib/dashboard/daily-report';
import {
    checkDailyCellAccess, dailyReportActorName, loadDailyEditableManagers, resolveDailyReportRequest,
} from '@/lib/dashboard/daily-report-access';
import { DailyReportUnavailableError, loadDailyReport, loadDailyReportConfig, saveDailyReport } from '@/lib/dashboard/daily-report-load';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const unavailable = (error: unknown) => error instanceof DailyReportUnavailableError
    ? NextResponse.json({ error: error.message }, { status: 503 })
    : null;

/**
 * GET /api/dashboard/daily-report?date=YYYY-MM-DD — «Өдрийн тайлан» (анхдагч: өнөөдөр, УБ).
 * • Багийн харагдац: super_admin эсвэл `reports` модультай, хувийн горимгүй хэрэглэгч — бүх менежер,
 *   уулзалтын жагсаалт, тэмдэглэл; бүртгэлийн аль ч менежерийн тоог засна.
 * • Төсөлдөө бүртгэлтэй менежер: багийн бүх багана, уулзалт, тэмдэглэл; ээлжийн менежер тул төслийн
 *   идэвхтэй, бүртгэлтэй бүх менежерийн (`editable`) тоог засна. `viewer.own` = өөрийн багана.
 *   Бүртгэлд холбогдоогүй бол `onboarding`.
 * • Нүд бүр хэн оруулсныг `authors` (нэр, цаг, өөр хүн эсэх) харуулна; акаунтын id гаргахгүй.
 * • `viewer.canReassign` — уулзалтын менежерийг солих эрх (meetings route-ийн `reassign`-тэй ижил дүрэм:
 *   admin/super_admin, уулзалтын бичих эрх, хувийн горимгүй, багийн тайлан харах эрхтэй).
 * • Зөвхөн `dashboard` модультай байгууллагын хэрэглэгчид 403.
 */
export const GET = withRoute({ module: ['reports', 'dashboard'], error: 'Өдрийн тайланг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const today = ubDateStr();
    const rawDate = request.nextUrl.searchParams.get('date');
    const parsed = DailyReportDateSchema.safeParse(rawDate || today);
    if (!parsed.success) return NextResponse.json({ error: 'Огноо буруу байна' }, { status: 400 });
    const date = parsed.data;
    if (date > today) return NextResponse.json({ error: 'Ирээдүйн өдрийн тайлан гаргахгүй' }, { status: 400 });

    const resolved = await resolveDailyReportRequest(shop.id);
    if (!resolved) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const { permissions, viewer, writable } = resolved;

    if (viewer.personal && !viewer.ownManager) {
        return NextResponse.json({ date, today, report: null, config: null, roster: [],
            viewer: { personal: true, onboarding: true, canEditTeam: false, editable: [], own: null, canReassign: false } }, { headers: NO_STORE });
    }
    if (!viewer.canViewTeam) {
        return NextResponse.json({ error: 'Багийн өдрийн тайланг харах эрхгүй' }, { status: 403 });
    }
    // POST /meetings `reassign`-ийн дүрэм: viewings бичих эрх (withRoute), admin/super_admin, байгууллагын харагдац.
    const isAdmin = permissions.role === 'admin' || permissions.role === 'super_admin';
    const canWriteViewings = permissions.role === 'super_admin'
        || (permissions.permissions.canWrite && permissions.permissions.modules.includes('viewings'));
    const canReassign = isAdmin && canWriteViewings && !viewer.personal && viewer.canViewTeam;

    try {
        const db = supabaseAdmin();
        const result = await loadDailyReport(db, { shopId: shop.id, shopName: shop.name || 'Төсөл', date, only: null });
        const allowed = writable ? await loadDailyEditableManagers(db, shop.id, viewer, result.roster) : new Set<string>();
        const editable = result.report.managers.map(manager => manager.name).filter(name => name !== UNASSIGNED && allowed.has(name));
        return NextResponse.json({
            date, today,
            report: result.report,
            config: result.config,
            configSaved: result.configSaved,
            configInvalid: result.configInvalid,
            // Бүртгэлийн жагсаалт зөвхөн загвар засахад; багийн нэрс тайланд өөрт нь бий.
            roster: viewer.personal ? [] : result.roster,
            viewer: { personal: viewer.personal, onboarding: false, canEditTeam: writable, editable, own: viewer.ownManager, canReassign },
        }, { headers: NO_STORE });
    } catch (error) {
        const response = unavailable(error);
        if (response) return response;
        throw error;
    }
});

/**
 * PUT /api/dashboard/daily-report — { date, cells: [{ manager, metric, value|null, expected? }], notes?, notesExpected?, complete? }
 * • Төсөлдөө бүртгэлтэй менежер (ээлжийн менежер) төслийн идэвхтэй, бүртгэлтэй бүх менежерийн тоог
 *   оруулж/цэвэрлэнэ; багийн тэмдэглэл, «Тайлан хийж гүйцэтгэсэн»-ийг мөн хадгална. Багийн харагдацтай
 *   хэрэглэгч бүртгэлийн аль ч менежерийн тоог засна.
 * • `expected` (клиентийн харсан утга) зөрвөл юу ч бичихгүй 409 `{ conflicts }`. Тэмдэглэлийн зөвхөн
 *   илгээсэн түлхүүр өөрчлөгдөнө. Өөрчлөлт бүр түүхэнд (хэн, хэзээ, хуучин → шинэ) хадгалагдана.
 * • Үзүүлэлт нь төслийн загварт байх ёстой (null = цэвэрлэх нь загвараас хасагдсан үзүүлэлтэд ч болно).
 *   Ирээдүйн өдөр бөглөхгүй.
 */
export const PUT = withRoute({ module: 'dashboard', access: 'write', error: 'Өдрийн тайланг хадгалж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const parsed = SaveDailyReportSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Тайлангийн мэдээллийг шалгана уу' }, { status: 400 });
    const data = parsed.data;
    if (data.date > ubDateStr()) return NextResponse.json({ error: 'Ирээдүйн өдрийн тайлан бөглөхгүй' }, { status: 400 });

    const resolved = await resolveDailyReportRequest(shop.id);
    if (!resolved) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const { userId, viewer } = resolved;
    const db = supabaseAdmin();

    try {
        const denied = await checkDailyCellAccess(db, shop.id, viewer, [...new Set(data.cells.map(cell => cell.manager))]);
        if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

        if (data.cells.some(cell => cell.value !== null)) {
            const metrics = configMetrics((await loadDailyReportConfig(db, shop.id, shop.name || '')).config);
            if (data.cells.some(cell => cell.value !== null && !metrics.has(cell.metric))) {
                return NextResponse.json({ error: 'Тайлангийн загвар өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оруулна уу.' }, { status: 409 });
            }
        }

        const saved = await saveDailyReport(db, { shopId: shop.id, userId, userName: dailyReportActorName(viewer), data });
        if (!saved.ok) {
            return NextResponse.json({ error: 'Энэ хооронд өөр хүн өөрчилсөн байна. Хуудсаа шинэчлээд дахин оруулна уу.', conflicts: saved.conflicts }, { status: 409, headers: NO_STORE });
        }
        return NextResponse.json({ ok: true }, { headers: NO_STORE });
    } catch (error) {
        const response = unavailable(error);
        if (response) return response;
        throw error;
    }
});
