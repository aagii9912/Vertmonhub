/**
 * Сарын «бусад ажлын төлөвлөгөө» (`sales_work_plan_items`) — серверийн НЭГ дүрэм: хурлын хуудасны API ба Лхагвын
 * илтгэл хоёулаа энд дамжина.
 *
 * • Migration (20261113150000) ороогүй орчинд уншилт хоосон (`available: false`), бичилт ойлгомжтой 503.
 * • Хариуцагч: энэ shop-ийн `sales_managers.id`. Шинээр зөвхөн идэвхтэй, төсөлд бүртгэлтэй менежер оноогдоно; мөрийн
 *   одоогийн (идэвхгүй болсон ч) хариуцагч хэвээр үлдэж болно. Нэрийг уншихдаа жагсаалтаас авна (нэр солигдоход хэвээр).
 * • Устгахгүй — `deleted_at`. Өөрийн нэмсэн ажлыг бичих эрхээр, бусдынхыг устгах эрхээр устгана (слайдтай нэг дүрэм).
 * • Өөрчлөлт data_audit_log-д (best-effort).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordAudit } from '@/lib/services/AuditService';
import { fetchAllRows } from '@/lib/utils/pagination';
import {
    WORK_PLAN_MONTH_LIMIT, type WorkPlanAssignee, type WorkPlanCreateInput, type WorkPlanData, type WorkPlanItem, type WorkPlanPatchInput,
} from '@/lib/sales/work-plan';

export type WorkPlanFailure = { ok: false; status: number; error: string };
export type WorkPlanResult<T> = ({ ok: true } & T) | WorkPlanFailure;
export interface WorkPlanActor { userId: string; name: string }

const failure = (status: number, error: string): WorkPlanFailure => ({ ok: false, status, error });
export const WORK_PLAN_UNAVAILABLE = 'Сарын ажлын төлөвлөгөө хараахан идэвхжээгүй байна. Админд хандаж шинэчлэлийг (migration) суулгана уу.';
const COLUMNS = 'id, plan_month, title, assignee_ids, sort_order, done_at, done_by_name, created_by, created_by_name';

type Row = {
    id: string; plan_month: string; title: string; assignee_ids: string[] | null; sort_order: number;
    done_at: string | null; done_by_name: string | null; created_by: string | null; created_by_name: string | null;
};
type ManagerRow = { id: string; name: string; is_active: boolean };

/** Хүснэгт байхгүй (migration 20261113150000 ороогүй) эсэх. */
export function isMissingWorkPlanSchema(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    return ['42P01', 'PGRST205'].includes(error.code ?? '')
        || /sales_work_plan_items.*(does not exist|could not find)|could not find.*sales_work_plan_items/i.test(error.message ?? '');
}

/** Shop-ийн бүх менежер (идэвхгүй орно) ба оноож болох жагсаалт: идэвхтэй + төсөлд бүртгэлтэй (бүртгэл огт байхгүй shop-д идэвхтэй бүгд). */
async function loadManagers(db: SupabaseClient, shopId: string): Promise<{ all: Map<string, ManagerRow>; roster: WorkPlanAssignee[] }> {
    const [managers, memberships] = await Promise.all([
        fetchAllRows<ManagerRow>((from, to) => db.from('sales_managers').select('id, name, is_active').eq('shop_id', shopId).order('name').order('id').range(from, to)),
        fetchAllRows<{ manager_name: string }>((from, to) => db.from('sales_manager_projects').select('manager_name').eq('shop_id', shopId)
            .order('manager_name').order('project_id').range(from, to)),
    ]);
    const registered = new Set(memberships.map(row => row.manager_name));
    const roster = managers.filter(manager => manager.is_active && !!manager.name && (!registered.size || registered.has(manager.name)))
        .map(manager => ({ id: manager.id, name: manager.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'mn'));
    return { all: new Map(managers.map(manager => [manager.id, manager])), roster };
}

function toItem(row: Row, managers: ReadonlyMap<string, ManagerRow>): WorkPlanItem {
    return {
        id: row.id, month: row.plan_month, title: row.title,
        // Жагсаалтаас хасагдсан (өөр shop руу шилжсэн, устсан) id-г алгасна — нэргүй хариуцагч харуулахгүй.
        assignees: (row.assignee_ids ?? []).flatMap(id => { const manager = managers.get(id); return manager ? [{ id, name: manager.name }] : []; }),
        done: !!row.done_at, done_at: row.done_at, done_by_name: row.done_by_name,
        created_by: row.created_by, created_by_name: row.created_by_name, sort_order: row.sort_order,
    };
}

async function readRows(db: SupabaseClient, shopId: string, month: string): Promise<{ rows: Row[]; available: boolean }> {
    let missing = false;
    const rows = await fetchAllRows<Row>(async (from, to) => {
        const { data, error } = await db.from('sales_work_plan_items').select(COLUMNS).eq('shop_id', shopId).eq('plan_month', month).is('deleted_at', null)
            .order('sort_order', { ascending: true }).order('id', { ascending: true }).range(from, to);
        if (error && isMissingWorkPlanSchema(error)) { missing = true; return { data: [], error: null }; }
        return { data: (data ?? []) as Row[], error };
    });
    return { rows, available: !missing };
}

/** Сарын жагсаалт (эрэмбээр) + оноож болох менежерүүд. Хүснэгт байхгүй бол `available: false`; бусад алдааг шидэнэ. */
export async function readWorkPlan(db: SupabaseClient, shopId: string, month: string): Promise<WorkPlanData> {
    const [{ rows, available }, managers] = await Promise.all([readRows(db, shopId, month), loadManagers(db, shopId)]);
    return { month, items: rows.map(row => toItem(row, managers.all)), roster: managers.roster, available };
}

/** Хариуцагчдыг шалгана: бүгд энэ shop-ийн менежер; шинээр оноох нь идэвхтэй жагсаалтаас (одоогийнх хэвээр үлдэж болно). */
function checkAssignees(ids: readonly string[], managers: { all: ReadonlyMap<string, ManagerRow>; roster: readonly WorkPlanAssignee[] }, current: readonly string[] = []): WorkPlanFailure | null {
    const assignable = new Set([...managers.roster.map(item => item.id), ...current]);
    for (const id of ids) {
        const manager = managers.all.get(id);
        if (!manager) return failure(400, 'Хариуцагч энэ төслийн менежерийн жагсаалтад алга');
        if (!assignable.has(id)) return failure(400, `«${manager.name}» идэвхгүй эсвэл энэ төсөлд бүртгэлгүй тул шинээр оноохгүй`);
    }
    return null;
}

function writeFailure(error: { code?: string; message?: string } | null): WorkPlanFailure | null {
    if (!error) return null;
    if (isMissingWorkPlanSchema(error)) return failure(503, WORK_PLAN_UNAVAILABLE);
    if (error.code === '23514') return failure(400, 'Ажлын төлөвлөгөөний мэдээлэл буруу байна');
    return null;
}

export async function createWorkPlanItem(
    db: SupabaseClient, shopId: string, input: WorkPlanCreateInput, actor: WorkPlanActor,
): Promise<WorkPlanResult<{ item: WorkPlanItem }>> {
    const [{ rows, available }, managers] = await Promise.all([readRows(db, shopId, input.month), loadManagers(db, shopId)]);
    if (!available) return failure(503, WORK_PLAN_UNAVAILABLE);
    if (rows.length >= WORK_PLAN_MONTH_LIMIT) return failure(400, `Нэг сард ${WORK_PLAN_MONTH_LIMIT}-аас олон ажил бүртгэхгүй. Хийгдсэн, хэрэггүйг нь устгана уу.`);
    const invalid = checkAssignees(input.assigneeIds, managers);
    if (invalid) return invalid;
    const { data, error } = await db.from('sales_work_plan_items').insert({
        shop_id: shopId, plan_month: input.month, title: input.title, assignee_ids: input.assigneeIds,
        sort_order: rows.reduce((max, row) => Math.max(max, row.sort_order), 0) + 10, created_by: actor.userId, created_by_name: actor.name,
    }).select(COLUMNS).single();
    const mapped = writeFailure(error);
    if (mapped) return mapped;
    if (error || !data) throw new Error(error?.message ?? 'work plan insert returned no row');
    const item = toItem(data as Row, managers.all);
    await recordAudit({ shopId, actorId: actor.userId, entity: 'work_plan_item', entityId: item.id, action: 'create',
        changes: { month: item.month, title: item.title, assignees: item.assignees.map(assignee => assignee.name) } });
    return { ok: true, item };
}

async function loadItem(db: SupabaseClient, shopId: string, id: string): Promise<WorkPlanResult<{ row: Row }>> {
    const { data, error } = await db.from('sales_work_plan_items').select(COLUMNS).eq('shop_id', shopId).eq('id', id).is('deleted_at', null).maybeSingle();
    const mapped = writeFailure(error);
    if (mapped) return mapped;
    if (error) throw new Error(error.message);
    if (!data) return failure(404, 'Ажил олдсонгүй');
    return { ok: true, row: data as Row };
}

export async function updateWorkPlanItem(
    db: SupabaseClient, shopId: string, id: string, patch: WorkPlanPatchInput, actor: WorkPlanActor,
): Promise<WorkPlanResult<{ item: WorkPlanItem }>> {
    const [loaded, managers] = await Promise.all([loadItem(db, shopId, id), loadManagers(db, shopId)]);
    if (!loaded.ok) return loaded;
    const before = loaded.row;
    const updates: Record<string, unknown> = {};
    if (patch.title !== undefined && patch.title !== before.title) updates.title = patch.title;
    if (patch.assigneeIds !== undefined) {
        const current = before.assignee_ids ?? [];
        const invalid = checkAssignees(patch.assigneeIds, managers, current);
        if (invalid) return invalid;
        if (patch.assigneeIds.length !== current.length || patch.assigneeIds.some(item => !current.includes(item))) updates.assignee_ids = patch.assigneeIds;
    }
    if (patch.done !== undefined && patch.done !== !!before.done_at) {
        updates.done_at = patch.done ? new Date().toISOString() : null;
        updates.done_by = patch.done ? actor.userId : null;
        updates.done_by_name = patch.done ? actor.name : null;
    }
    if (!Object.keys(updates).length) return { ok: true, item: toItem(before, managers.all) };
    updates.updated_at = new Date().toISOString();
    const { data, error } = await db.from('sales_work_plan_items').update(updates).eq('shop_id', shopId).eq('id', id).is('deleted_at', null)
        .select(COLUMNS).maybeSingle();
    const mapped = writeFailure(error);
    if (mapped) return mapped;
    if (error) throw new Error(error.message);
    if (!data) return failure(404, 'Ажил олдсонгүй');
    const item = toItem(data as Row, managers.all);
    const names = (ids: readonly string[] | null) => (ids ?? []).map(assignee => managers.all.get(assignee)?.name ?? assignee);
    await recordAudit({ shopId, actorId: actor.userId, entity: 'work_plan_item', entityId: id, action: 'update', changes: {
        ...('title' in updates ? { title: { from: before.title, to: item.title } } : {}),
        ...('assignee_ids' in updates ? { assignees: { from: names(before.assignee_ids), to: item.assignees.map(assignee => assignee.name) } } : {}),
        ...('done_at' in updates ? { done: { from: !!before.done_at, to: item.done } } : {}),
    } });
    return { ok: true, item };
}

/** Soft delete. `canDeleteOthers` — устгах эрхтэй (бусдын нэмсэн ажлыг устгаж болно); үгүй бол зөвхөн өөрийн нэмсэн. */
export async function deleteWorkPlanItem(
    db: SupabaseClient, shopId: string, id: string, actor: WorkPlanActor, canDeleteOthers: boolean,
): Promise<WorkPlanResult<{ id: string }>> {
    const loaded = await loadItem(db, shopId, id);
    if (!loaded.ok) return loaded;
    if (loaded.row.created_by !== actor.userId && !canDeleteOthers) return failure(403, 'Бусдын нэмсэн ажлыг устгах эрх танд алга');
    const { data, error } = await db.from('sales_work_plan_items').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('shop_id', shopId).eq('id', id).is('deleted_at', null).select('id').maybeSingle();
    const mapped = writeFailure(error);
    if (mapped) return mapped;
    if (error) throw new Error(error.message);
    if (!data) return failure(404, 'Ажил олдсонгүй');
    await recordAudit({ shopId, actorId: actor.userId, entity: 'work_plan_item', entityId: id, action: 'delete', changes: { title: loaded.row.title, month: loaded.row.plan_month } });
    return { ok: true, id };
}
