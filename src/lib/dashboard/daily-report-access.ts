import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { formalManagerName, type DailyRosterEntry } from './daily-report';
import { loadDailyColleagues, loadDailyRoster, resolveDailyReportViewer, type DailyReportViewer } from './daily-report-load';

/**
 * «Өдрийн тайлан»-гийн route-уудын эрхийн НЭГ дүрэм (GET/PUT, түүх, сэргээх):
 * • Төсөлдөө бүртгэлтэй менежер (хувийн горим, `ownManager`) — төслийн ИДЭВХТЭЙ, бүртгэлтэй бүх
 *   менежерийн (хамт олны) тоог оруулж/засаж/цэвэрлэнэ (ээлжийн менежер, 2026-10-19).
 * • Багийн харагдацтай хэрэглэгч — бүртгэлийн аль ч менежерийн тоог.
 * • Бичихэд dashboard-ийн бичих эрх шаардлагатай.
 */
type Permissions = NonNullable<Awaited<ReturnType<typeof resolvePermissions>>>;

export const canWriteDailyReport = (permissions: Permissions) => permissions.role === 'super_admin'
    || (permissions.permissions.canWrite && permissions.permissions.modules.includes('dashboard'));

/** Нэвтэрсэн хэрэглэгчийн эрх, харагдац; нэвтрээгүй бол null. */
export async function resolveDailyReportRequest(shopId: string) {
    const [permissions, userId] = await Promise.all([resolvePermissions(), getUserId()]);
    if (!permissions) return null;
    const viewer = await resolveDailyReportViewer(supabaseAdmin(), shopId, { userId, role: permissions.role, modules: permissions.permissions.modules });
    return { permissions, userId, viewer, writable: canWriteDailyReport(permissions) };
}

/** Тоо, түүх, «Тайлан хийж гүйцэтгэсэн»-д бичих нэр: бүртгэлийн албан нэр → профайлын нэр. */
export function dailyReportActorName(viewer: DailyReportViewer): string {
    return viewer.identity?.rosterEntry ? formalManagerName(viewer.identity.rosterEntry.name) : viewer.identity?.fullName || 'Хэрэглэгч';
}

/** Тоог нь засаж болох менежерүүд (бичих эрхийг дуудагч шалгана). `roster` өгвөл дахин уншихгүй. */
export async function loadDailyEditableManagers(
    db: SupabaseClient,
    shopId: string,
    viewer: DailyReportViewer,
    roster?: readonly DailyRosterEntry[],
): Promise<Set<string>> {
    if (viewer.personal) return viewer.ownManager ? new Set(await loadDailyColleagues(db, shopId)) : new Set();
    if (!viewer.canViewTeam) return new Set();
    return new Set((roster ?? await loadDailyRoster(db, shopId)).map(entry => entry.name));
}

/** PUT ба сэргээхийн шалгалт: эдгээр менежерийн тоог засаж болох эсэх (алдаа бол { status, error }). */
export async function checkDailyCellAccess(
    db: SupabaseClient,
    shopId: string,
    viewer: DailyReportViewer,
    managers: readonly string[],
): Promise<{ status: 400 | 403; error: string } | null> {
    if (viewer.personal) {
        if (!viewer.ownManager) return { status: 403, error: 'Таны нэр борлуулалтын менежерийн бүртгэлд холбогдоогүй байна' };
    } else if (!viewer.canViewTeam) {
        return { status: 403, error: 'Багийн өдрийн тайланг засах эрхгүй' };
    }
    if (!managers.length) return null;
    const allowed = await loadDailyEditableManagers(db, shopId, viewer);
    const unknown = managers.find(name => !allowed.has(name));
    if (!unknown) return null;
    return viewer.personal
        ? { status: 403, error: 'Зөвхөн энэ төслийн идэвхтэй менежерийн тоог оруулна' }
        : { status: 400, error: `«${unknown}» менежерийн бүртгэлд алга` };
}
