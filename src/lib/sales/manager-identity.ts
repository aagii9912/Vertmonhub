import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Нэвтэрсэн хэрэглэгч ↔ борлуулалтын менежерийн харгалзааг НЭГ дүрмээр тодорхойлох модуль.
 *
 * • Канон нэр: sales_managers бүртгэлийн name (property_contracts.sales_manager,
 *   leads/property_viewings.sales_manager_name-тэй нэрээрээ холбогддог).
 * • Таарц: эхлээд sales_managers.user_id (данс линк), дараа нь
 *   user_profiles.full_name (нэрийн таарц). user_id линк давамгайлна —
 *   нэр өөрчлөгдсөн ч холбоос хадгалагдана.
 * • Нэрийг ЗААВАЛ серверээс (user_profiles) уншина — client user_metadata-тай
 *   зөрөх эрсдэлээс сэргийлнэ.
 */

export interface RosterEntry {
    name: string;
    user_id: string | null;
    is_active: boolean;
}

export interface ManagerIdentity {
    /** Канон менежерийн нэр (roster name → full_name fallback). Таарц олдоогүй бол null. */
    managerName: string | null;
    /** Идэвхтэй roster гишүүн мөн эсэх (roster хоосон үед false — permissive fallback ЭНД байхгүй). */
    isManager: boolean;
    /** Таарсан бүртгэлийн мөр (байхгүй бол null). */
    rosterEntry: RosterEntry | null;
    /** user_profiles.full_name (байхгүй бол null). */
    fullName: string | null;
    /** Тухайн shop-ийн бүх roster (давхар query-гээс сэргийлж дамжуулна). */
    roster: RosterEntry[];
    /** Roster огт бөглөгдөөгүй эсэх (багийн зорилтын "бүгдэд харуулах" fallback-д: my-stats, kpi-report). */
    rosterEmpty: boolean;
}

/** Бичилт хийхэд зөвхөн тухайн shop-ийн идэвхтэй бүртгэлийн канон нэрийг зөвшөөрнө. */
export async function resolveActiveManagerName(
    db: SupabaseClient,
    shopId: string,
    name: unknown,
): Promise<{ ok: true; managerName: string } | { ok: false; error: string; status: number }> {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
        return { ok: false, error: 'Борлуулалтын менежерийн нэрийг зөв оруулна уу', status: 400 };
    }
    const { data, error } = await db.from('sales_managers').select('name')
        .eq('shop_id', shopId).eq('is_active', true).eq('name', name.trim()).maybeSingle();
    if (error) return { ok: false, error: 'Менежерийн бүртгэл шалгахад алдаа гарлаа', status: 500 };
    if (!data) return { ok: false, error: 'Тухайн байгууллагын идэвхтэй борлуулалтын менежерийг сонгоно уу', status: 400 };
    return { ok: true, managerName: data.name };
}

/**
 * PURE: roster-оос хэрэглэгчид таарах бүртгэлийг олно.
 * user_id таарц нэрийн таарцаас давамгайлна.
 */
export function matchRosterEntry(
    roster: RosterEntry[],
    userId: string,
    fullName: string | null,
): RosterEntry | null {
    const byUserId = roster.filter((r) => !!r.user_id && r.user_id === userId);
    if (byUserId.length) return byUserId.length === 1 ? byUserId[0] : null;
    if (fullName) {
        // Нэрийн legacy таарц өөр акаунтад холбосон менежерийг орлож болохгүй.
        const byName = roster.find((r) => r.name === fullName && !r.user_id);
        if (byName) return byName;
    }
    return null;
}

/**
 * PURE: тайлан харах эрхийн НЭГ дүрэм (dashboard/mode-тэй ижил).
 * • personal — админ биш, sales_manager role-той ЭСВЭЛ идэвхтэй бүртгэлд таарсан → зөвхөн өөрийн өгөгдөл.
 * • canViewTeam — personal биш бөгөөд super_admin эсвэл `reports` модультай → бусад менежерийг харна.
 * Админ модулийн эрхийг тойрохгүй (admin нь `reports`-гүй бол багийн тайлан харахгүй).
 */
export function reportViewerRule(input: { role: string | null | undefined; modules?: readonly string[] | null; isManager: boolean }) {
    const role = input.role || 'viewer';
    const isAdmin = role === 'admin' || role === 'super_admin';
    const personal = !isAdmin && (role === 'sales_manager' || input.isManager);
    const canViewTeam = !personal && (role === 'super_admin' || (input.modules ?? []).includes('reports'));
    return { role, isAdmin, personal, canViewTeam };
}

export interface ReportViewer extends ReturnType<typeof reportViewerRule> {
    userId: string | null;
    /** Канон нэр (бүртгэлийн нэр → профайлын нэр). Хувийн тайланд бүртгэлийн мөр (identity.rosterEntry)-ийг шалгана. */
    managerName: string | null;
    identity: ManagerIdentity | null;
}

/**
 * Тайлангийн route/AI tool-д хэрэглэгч хэний өгөгдлийг харахыг тодорхойлно
 * (sales-kpi, manager-activity, get_manager_activity). Эрх (role, modules)-ийг дуудагч серверээс өгнө.
 */
export async function resolveReportViewer(
    db: SupabaseClient,
    shopId: string,
    input: { userId: string | null; role: string | null | undefined; modules?: readonly string[] | null },
): Promise<ReportViewer> {
    const identity = input.userId ? await resolveManagerIdentity(db, shopId, input.userId) : null;
    return {
        ...reportViewerRule({ role: input.role, modules: input.modules, isManager: !!identity?.isManager }),
        userId: input.userId,
        managerName: identity?.managerName ?? null,
        identity,
    };
}

/**
 * Нэвтэрсэн хэрэглэгчийн менежерийн identity-г тодорхойлно
 * (user_profiles.full_name + sales_managers roster).
 * sales_managers хүснэгт байхгүй (миграци ороогүй) орчинд ч алдаа өгөхгүй.
 */
export async function resolveManagerIdentity(
    supabase: SupabaseClient,
    shopId: string,
    userId: string,
): Promise<ManagerIdentity> {
    const [profileRes, rosterRes] = await Promise.all([
        supabase.from('user_profiles').select('full_name').eq('id', userId).maybeSingle(),
        supabase
            .from('sales_managers')
            .select('name, user_id, is_active')
            .eq('shop_id', shopId),
    ]);

    const fullName: string | null = profileRes.data?.full_name || null;
    const roster: RosterEntry[] = (rosterRes.error ? [] : rosterRes.data || []).map((r) => ({
        name: r.name,
        user_id: r.user_id ?? null,
        is_active: !!r.is_active,
    }));

    const rosterEntry = matchRosterEntry(roster, userId, fullName);
    const ambiguousAccount = roster.filter((r) => r.user_id === userId).length > 1;

    return {
        managerName: rosterRes.error || ambiguousAccount ? null : rosterEntry?.name
            || (roster.some((r) => r.name === fullName) ? null : fullName),
        isManager: !!rosterEntry?.is_active,
        rosterEntry,
        fullName,
        roster,
        rosterEmpty: roster.length === 0,
    };
}
