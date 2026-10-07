import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveReportViewer, type ReportViewer } from '@/lib/sales/manager-identity';
import { ubDateStr } from '@/lib/utils/date';
import {
    configMetrics, DailyReportDateSchema, formalManagerName, SaveDailyReportSchema, UNASSIGNED,
} from '@/lib/dashboard/daily-report';
import {
    DailyReportUnavailableError, loadDailyReport, loadDailyReportConfig, loadDailyRoster, saveDailyReport,
} from '@/lib/dashboard/daily-report-load';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const unavailable = (error: unknown) => error instanceof DailyReportUnavailableError
    ? NextResponse.json({ error: error.message }, { status: 503 })
    : null;

type Permissions = NonNullable<Awaited<ReturnType<typeof resolvePermissions>>>;
const canWriteDashboard = (permissions: Permissions) => permissions.role === 'super_admin'
    || (permissions.permissions.canWrite && permissions.permissions.modules.includes('dashboard'));

/**
 * Хувийн горимын менежерийн өөрийн багана: зөвхөн акаунттай холбосон бүртгэлийн мөр
 * (manager-activity-тай ижил — өөрөө засдаг профайлын нэрээр дансгүй менежерийн мөрийг авахгүй).
 */
function ownManager(viewer: ReportViewer): string | null {
    const entry = viewer.identity?.rosterEntry ?? null;
    return entry && viewer.userId && entry.user_id === viewer.userId && entry.is_active ? entry.name : null;
}

async function viewerOf(shopId: string) {
    const [permissions, userId] = await Promise.all([resolvePermissions(), getUserId()]);
    if (!permissions) return null;
    const viewer = await resolveReportViewer(supabaseAdmin(), shopId, { userId, role: permissions.role, modules: permissions.permissions.modules });
    return { permissions, userId, viewer };
}

/**
 * GET /api/dashboard/daily-report?date=YYYY-MM-DD — «Өдрийн тайлан» (анхдагч: өнөөдөр, УБ).
 * • Багийн харагдац: super_admin эсвэл `reports` модультай, хувийн горимгүй хэрэглэгч — бүх менежер,
 *   уулзалтын жагсаалт, тэмдэглэл.
 * • Менежер (хувийн горим): зөвхөн өөрийн багана, өөрийн уулзалт; бүртгэлд холбогдоогүй бол `onboarding`.
 * • Зөвхөн `dashboard` модультай байгууллагын хэрэглэгчид 403.
 */
export const GET = withRoute({ module: ['reports', 'dashboard'], error: 'Өдрийн тайланг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const today = ubDateStr();
    const rawDate = request.nextUrl.searchParams.get('date');
    const parsed = DailyReportDateSchema.safeParse(rawDate || today);
    if (!parsed.success) return NextResponse.json({ error: 'Огноо буруу байна' }, { status: 400 });
    const date = parsed.data;
    if (date > today) return NextResponse.json({ error: 'Ирээдүйн өдрийн тайлан гаргахгүй' }, { status: 400 });

    const resolved = await viewerOf(shop.id);
    if (!resolved) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const { permissions, viewer } = resolved;
    const writable = canWriteDashboard(permissions);

    let only: string | null = null;
    if (viewer.personal) {
        only = ownManager(viewer);
        if (!only) {
            return NextResponse.json({ date, today, report: null, config: null, roster: [],
                viewer: { personal: true, onboarding: true, canEditTeam: false, editable: [] } }, { headers: NO_STORE });
        }
    } else if (!viewer.canViewTeam) {
        return NextResponse.json({ error: 'Багийн өдрийн тайланг харах эрхгүй' }, { status: 403 });
    }

    try {
        const result = await loadDailyReport(supabaseAdmin(), { shopId: shop.id, shopName: shop.name || 'Төсөл', date, only });
        const rosterNames = new Set(result.roster.map(entry => entry.name));
        const editable = !writable ? [] : only ? [only]
            : result.report.managers.map(manager => manager.name).filter(name => name !== UNASSIGNED && rosterNames.has(name));
        return NextResponse.json({
            date, today,
            report: result.report,
            config: result.config,
            configSaved: result.configSaved,
            configInvalid: result.configInvalid,
            // Багийн загвар засахад (идэвхтэй менежерүүдээс сонгох) — менежерт бусдын нэрийг өгөхгүй.
            roster: only ? [] : result.roster,
            viewer: { personal: viewer.personal, onboarding: false, canEditTeam: !only && writable, editable },
        }, { headers: NO_STORE });
    } catch (error) {
        const response = unavailable(error);
        if (response) return response;
        throw error;
    }
});

/**
 * PUT /api/dashboard/daily-report — { date, cells: [{ manager, metric, value|null }], notes?, complete? }
 * • Менежер (хувийн горим) зөвхөн өөрийн нүдийг; тэмдэглэл, «Тайлан хийж гүйцэтгэсэн»-ийг багийн
 *   эрхтэй (reports) хэрэглэгч.
 * • Менежер нь тухайн төслийн бүртгэлийн нэр, үзүүлэлт нь төслийн загварт байх ёстой (null = цэвэрлэх
 *   нь загвараас хасагдсан үзүүлэлтэд ч болно). Ирээдүйн өдөр бөглөхгүй.
 */
export const PUT = withRoute({ module: 'dashboard', access: 'write', error: 'Өдрийн тайланг хадгалж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const parsed = SaveDailyReportSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Тайлангийн мэдээллийг шалгана уу' }, { status: 400 });
    const data = parsed.data;
    if (data.date > ubDateStr()) return NextResponse.json({ error: 'Ирээдүйн өдрийн тайлан бөглөхгүй' }, { status: 400 });

    const resolved = await viewerOf(shop.id);
    if (!resolved) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const { userId, viewer } = resolved;
    const db = supabaseAdmin();

    try {
        if (viewer.personal) {
            const own = ownManager(viewer);
            if (!own) return NextResponse.json({ error: 'Таны нэр борлуулалтын менежерийн бүртгэлд холбогдоогүй байна' }, { status: 403 });
            if (data.cells.some(cell => cell.manager !== own)) return NextResponse.json({ error: 'Зөвхөн өөрийн тоог оруулна' }, { status: 403 });
            if (data.notes !== undefined || data.complete !== undefined) {
                return NextResponse.json({ error: 'Тэмдэглэл, баталгаажуулалтыг багийн тайлан харах эрхтэй хэрэглэгч хийнэ' }, { status: 403 });
            }
        } else if (!viewer.canViewTeam) {
            return NextResponse.json({ error: 'Багийн өдрийн тайланг засах эрхгүй' }, { status: 403 });
        } else if (data.cells.length) {
            const roster = new Set((await loadDailyRoster(db, shop.id)).map(entry => entry.name));
            const unknown = data.cells.find(cell => !roster.has(cell.manager));
            if (unknown) return NextResponse.json({ error: `«${unknown.manager}» менежерийн бүртгэлд алга` }, { status: 400 });
        }

        if (data.cells.some(cell => cell.value !== null)) {
            const metrics = configMetrics((await loadDailyReportConfig(db, shop.id)).config);
            if (data.cells.some(cell => cell.value !== null && !metrics.has(cell.metric))) {
                return NextResponse.json({ error: 'Тайлангийн загвар өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оруулна уу.' }, { status: 409 });
            }
        }

        const userName = viewer.identity?.rosterEntry ? formalManagerName(viewer.identity.rosterEntry.name)
            : viewer.identity?.fullName || 'Хэрэглэгч';
        await saveDailyReport(db, { shopId: shop.id, userId, userName, data });
        return NextResponse.json({ ok: true }, { headers: NO_STORE });
    } catch (error) {
        const response = unavailable(error);
        if (response) return response;
        throw error;
    }
});
