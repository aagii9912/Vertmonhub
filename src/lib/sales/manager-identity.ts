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
    /** Roster огт бөглөгдөөгүй эсэх (my-target-ийн "бүгдэд харуулах" fallback-д). */
    rosterEmpty: boolean;
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
    const byUserId = roster.find((r) => !!r.user_id && r.user_id === userId);
    if (byUserId) return byUserId;
    if (fullName) {
        const byName = roster.find((r) => r.name === fullName);
        if (byName) return byName;
    }
    return null;
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

    return {
        managerName: rosterEntry?.name || fullName || null,
        isManager: !!rosterEntry?.is_active,
        rosterEntry,
        fullName,
        roster,
        rosterEmpty: roster.length === 0,
    };
}
