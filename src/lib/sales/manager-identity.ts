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
 * PURE: нэрийг харьцуулахад тохирсон хэлбэрт оруулна.
 * • урд/хойд зай, давхар зайг цэгцэлнэ
 * • жижиг үсэг рүү (Кирилл ч мөн адил)
 * Цэг, таслалыг ЭНД хасахгүй — эхний үеийн товчлолыг (Б.) тусад нь боловсруулна.
 */
export function normalizeName(value: string | null | undefined): string {
    if (!value) return '';
    return value
        .replace(/\s+/g, ' ')
        .trim()
        // Цэгийн ДАРААХ зайг хасна: «Б. Батбаяр» ба «Б.Батбаяр» нь нэг хүн.
        // Үүнгүйгээр эдгээр нь яг таарцаар таарахгүй бөгөөд хоёулаа
        // товчлолтой тул сул таарц ч ажиллахгүй (санаатайгаар — өөр эхний
        // үсэгтэй хүмүүсийг нэгтгэхээс сэргийлдэг).
        .replace(/\.\s+/g, '.')
        .toLowerCase();
}

/**
 * PURE: «Б.Батбаяр», «Б. Батбаяр» гэх мэт эхний үеийн товчлолыг хасна.
 * Товчлол олдоогүй бол хоосон мөр буцаана (давхар таарцаас сэргийлж).
 */
export function stripInitials(value: string | null | undefined): string {
    const norm = normalizeName(value);
    const m = norm.match(/^[^\s.]{1,2}\.\s*(.+)$/);
    return m ? m[1].trim() : '';
}

/**
 * PURE: roster-оос хэрэглэгчид таарах бүртгэлийг олно.
 *
 * Дараалал (эхний олдсоноор зогсоно):
 *   1. sales_managers.user_id — данс линк (нэр солигдсон ч хадгалагдана)
 *   2. Нормчилсон яг таарц — зай/том-жижиг үсгийн зөрүүг тэсвэрлэнэ
 *   3. Эхний үеийн товчлолыг хассан таарц — ЗӨВХӨН ГАНЦ нэр олдвол
 *      («Б.Батбаяр» ба «Д.Батбаяр» хоёул «батбаяр» болвол аль нь ч сонгогдохгүй)
 *
 * Өмнө нь энэ нь `r.name === fullName` гэсэн яг тэмдэгтийн харьцуулалт байсан тул
 * «Б.Батбаяр» ≠ «Батбаяр» болж, менежерийн самбар чимээгүйхэн хоосон буцдаг байв.
 */
export function matchRosterEntry(
    roster: RosterEntry[],
    userId: string,
    fullName: string | null,
): RosterEntry | null {
    const byUserId = roster.find((r) => !!r.user_id && r.user_id === userId);
    if (byUserId) return byUserId;

    if (!fullName) return null;

    const target = normalizeName(fullName);
    if (!target) return null;

    // ӨӨР дансанд аль хэдийн холбогдсон бүртгэлүүдийг нэрээр таарахаас ХАСНА.
    // Эс бөгөөс «Батбаяр» гэсэн нэртэй хоёр хүний нэг нь нөгөөгийнхөө
    // бүртгэл (мөн гүйцэтгэл, зорилт) рүү холбогдоно.
    const candidates = roster.filter((r) => !r.user_id || r.user_id === userId);
    if (candidates.length === 0) return null;

    const exact = candidates.filter((r) => normalizeName(r.name) === target);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) {
        // Ижил нэртэй хэд хэдэн бүртгэл — идэвхтэйг нь эрхэмлэнэ
        return exact.find((r) => r.is_active) || exact[0];
    }

    // Товчлолын таарц — ЗӨВХӨН НЭГ ТАЛД товчлол байх үед.
    // Хоёр тал хоёулаа товчлолтой бол («Б.Батбаяр» vs «Д.Батбаяр») товчлолыг
    // хасах нь ӨӨР ХҮНИЙГ нэг болгож харуулна — тэр тохиолдолд зөвхөн яг
    // таарц (дээр аль хэдийн шалгагдсан) хүчинтэй.
    const targetBare = stripInitials(fullName);
    const loose = candidates.filter((r) => {
        const rosterBare = stripInitials(r.name);
        if (targetBare && rosterBare) return false;      // хоёулаа товчлолтой → үгүй
        if (!targetBare && !rosterBare) return false;    // аль нь ч биш → яг таарц л
        return (targetBare || target) === (rosterBare || normalizeName(r.name));
    });
    if (loose.length === 1) return loose[0];

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
