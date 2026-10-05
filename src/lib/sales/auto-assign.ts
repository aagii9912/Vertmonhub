import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_STATUSES } from '@/lib/leads/labels';
import { fetchAllRows } from '@/lib/utils/pagination';

/**
 * Менежергүй ирсэн лидийг төслийн менежерт автоматаар хуваарилна (эзэмшигч 2026-10-05).
 *
 * Нэр дэвшигч = тухайн төсөлд бүртгэлтэй (`sales_manager_projects`), идэвхтэй, дансандаа ганц
 * холбоостой менежер — `resolveSalesProjectScope`-ийн лид харах нөхцөлтэй ижил (холбоогүй менежерт
 * оноосон лидийг хэн ч харахгүй). Нэг бол түүнд; олон бол тухайн төсөлд идэвхтэй лид нь хамгийн
 * цөөнд (тэнцвэл нэрийн дарааллаар). Нэр дэвшигчгүй бол null: лид хариуцагчгүй орж, админ хуваарилна.
 */
export async function autoAssignCandidates(db: SupabaseClient, shopId: string, projectId: string): Promise<string[]> {
    const [memberships, roster] = await Promise.all([
        fetchAllRows<{ manager_name: string }>((from, to) => db.from('sales_manager_projects').select('manager_name')
            .eq('shop_id', shopId).eq('project_id', projectId).order('manager_name').range(from, to)),
        fetchAllRows<{ name: string; user_id: string | null; is_active: boolean }>((from, to) => db.from('sales_managers')
            .select('name, user_id, is_active').eq('shop_id', shopId).order('name').range(from, to)),
    ]);
    const registered = new Set(memberships.map(row => row.manager_name));
    const links = new Map<string, number>();
    for (const row of roster) if (row.user_id) links.set(row.user_id, (links.get(row.user_id) ?? 0) + 1);
    return roster
        .filter(row => row.is_active && row.user_id && links.get(row.user_id) === 1 && registered.has(row.name))
        .map(row => row.name)
        .sort((a, b) => a.localeCompare(b, 'mn'));
}

/** Нэр дэвшигч бүрийн тухайн төсөл дэх идэвхтэй лидийн тоо. */
export async function activeLeadLoad(db: SupabaseClient, shopId: string, projectId: string, names: string[]) {
    const counts = await Promise.all(names.map(async name => {
        const { count, error } = await db.from('leads').select('id', { count: 'exact', head: true })
            .eq('shop_id', shopId).eq('project_id', projectId).eq('sales_manager_name', name)
            .in('status', ACTIVE_STATUSES).is('deleted_at', null);
        if (error) throw error;
        return [name, count ?? 0] as const;
    }));
    return new Map<string, number>(counts);
}

/** Хамгийн цөөн ачаалалтай нэр дэвшигч (тэнцвэл нэрийн дарааллаар). `load`-ийг дуудагч шинэчилж болно. */
export function leastLoaded(candidates: string[], load: Map<string, number>): string | null {
    let best: string | null = null;
    for (const name of candidates) if (best === null || (load.get(name) ?? 0) < (load.get(best) ?? 0)) best = name;
    return best;
}

export async function pickAutoAssignManager(db: SupabaseClient, shopId: string, projectId: string): Promise<string | null> {
    const candidates = await autoAssignCandidates(db, shopId, projectId);
    if (candidates.length <= 1) return candidates[0] ?? null;
    return leastLoaded(candidates, await activeLeadLoad(db, shopId, projectId, candidates));
}
