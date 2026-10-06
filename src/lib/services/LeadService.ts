/**
 * Лид үүсгэх нэг дүрэм. Ажилтны оруулсан лид (dashboard, AI, нийтийн формын ажилтны
 * горим) `resolveStaffLead`-ээр төсөл, хариуцагч менежер, төлөв, эх үүсвэр, ангиллаа тодорхойлно.
 * Харилцагчийн нэр/холбоо барих мэдээллийг `resolveLeadIdentity` нэг дүрмээр шийднэ
 * (dashboard, AI, уулзалтын хуудас): нэргүй лид = `customer_name` null, ажилтан
 * `anonymous: true`-г илт сонгоно, утас эсвэл и-мэйл заавал. Гадны суваг нэрийг
 * `normalizeLeadName`-ээр л цэвэрлэнэ.
 * Бүх суваг (ажилтан, Elysium, Facebook Lead Ads, нийтийн форм) `insertLeadOnce`-оор
 * бичиж, `client_request_id` давтагдвал аль хэдийн хадгалсан лидийг буцаана. Менежергүй шинэ лидийг
 * төслийн менежерт автоматаар хуваарилна (`lib/sales/auto-assign.ts`).
 * `sales_handoff_at`-ийг DB trigger тавина; энд тавихгүй.
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
    ACTIVE_STATUSES, ANONYMOUS_LEAD_CONTACT, LEAD_NAME_OR_ANONYMOUS, LEAD_STATUSES, hasAnonymousLeadContact, leadDisplayName,
    normalizeLeadName, statusLabel, toLeadSource,
} from '@/lib/leads/labels';
import { PROPERTY_TYPES } from '@/lib/inventory/labels';
import { hasRealContractFields } from '@/lib/leads/contracts';
import { resolveActiveManagerName, resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { applyLeadScope, assertProjectManager, canAccessProject, ProjectScopeError, type SalesProjectScope } from '@/lib/sales/project-scope';
import { soleShopProjectId } from '@/lib/projects/shop-project';
import { leadCategoryName, logLeadCategoryChange, resolveLeadCategory, type LeadCategoryInput } from '@/lib/services/LeadCategoryService';
import { pickAutoAssignManager } from '@/lib/sales/auto-assign';
import { logLeadActivity } from '@/lib/leads/activities';
import { logger } from '@/lib/utils/logger';
import type { LeadSource, LeadStatus } from '@/types/property';

export interface StaffLeadActor {
    userId: string;
    role: string;
    scope: SalesProjectScope;
}

export interface StaffLeadRequest {
    /** Өгөөгүй бол shop-ийн ганц төсөл (shop = төсөл). */
    projectId?: unknown;
    status?: unknown;
    source?: unknown;
    /** Админ өөр идэвхтэй менежерт шууд оноох нэр (бусдад үл хэрэгсэнэ). */
    assignManager?: string | null;
    /** Лидийн ангилал (заавал биш): сонгогчийн id эсвэл AI-ийн яг нэр. Зөвхөн энэ төслийн идэвхтэй ангилал. */
    category?: LeadCategoryInput;
}

export interface ResolvedStaffLead {
    project_id: string;
    status: LeadStatus;
    source: LeadSource;
    sales_manager_name: string | null;
    category_id: string | null;
    /** Preview-д (AI) харуулах ангиллын нэр; ангилалгүй бол null. */
    category_name: string | null;
}

export type Failure = { ok: false; status: number; error: string };

export interface LeadIdentityInput {
    customer_name?: unknown;
    customer_phone?: unknown;
    customer_email?: unknown;
    /** Ажилтан «Нэр тодорхойгүй»-г сонгосон (нэр өгсөн ч үл хэрэгсэнэ). */
    anonymous?: boolean | null;
}

export interface LeadIdentity {
    customer_name: string | null;
    customer_phone: string | null;
    customer_email: string | null;
}

/**
 * Ажилтны оруулсан лидийн нэр/холбоо барих дүрэм (DB-гүй цэвэр функц). Нэрийг
 * `normalizeLeadName`-ээр цэвэрлэнэ (шошго, «-» зэрэг орлуулагч → null). Нэргүй хадгалахад
 * `anonymous: true` заавал — мартсан нэрийг ингэж барина; нэргүй лидэд 8+ оронтой утас
 * эсвэл зөв и-мэйл заавал. Нэртэй лидэд утас өмнөх шигээ заавал биш.
 */
export function resolveLeadIdentity(input: LeadIdentityInput): ({ ok: true } & LeadIdentity) | Failure {
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() || null : null);
    const customer_phone = text(input.customer_phone);
    const customer_email = text(input.customer_email);
    const customer_name = input.anonymous ? null : normalizeLeadName(input.customer_name);
    if (!customer_name) {
        if (!input.anonymous) return { ok: false, status: 400, error: LEAD_NAME_OR_ANONYMOUS };
        if (!hasAnonymousLeadContact(customer_phone, customer_email)) return { ok: false, status: 400, error: ANONYMOUS_LEAD_CONTACT };
    }
    return { ok: true, customer_name, customer_phone, customer_email };
}

/**
 * Төслийг (shop + хэрэглэгчийн хүрээ), идэвхтэй төлвийг, эх үүсвэрийг, хариуцагч менежерийг
 * шалгаж тодорхойлно. Менежер нь үүсгэгчийн roster нэр; админ `assignManager`-аар өөр менежер онооно.
 */
export async function resolveStaffLead(
    db: SupabaseClient,
    shopId: string,
    request: StaffLeadRequest,
    actor: StaffLeadActor,
): Promise<({ ok: true } & ResolvedStaffLead) | Failure> {
    // Shop = төсөл: төсөл заагаагүй бол тухайн shop-ийн ганц төслийг авна.
    const requested = typeof request.projectId === 'string' && request.projectId ? request.projectId : null;
    let projectId = requested ?? '';
    if (!requested) {
        try { projectId = await soleShopProjectId(db, shopId) ?? ''; }
        catch { return { ok: false, status: 503, error: 'Төслийг шалгаж чадсангүй' }; }
    }
    if (!z.uuid().safeParse(projectId).success) return { ok: false, status: 400, error: 'Лидийн төслийг сонгоно уу' };
    if (!canAccessProject(actor.scope, projectId)) return { ok: false, status: 403, error: 'Энэ төсөлд лид үүсгэх эрхгүй' };
    const { data: project, error: projectError } = await db.from('projects').select('id')
        .eq('id', projectId).eq('shop_id', shopId).maybeSingle();
    if (projectError) return { ok: false, status: 503, error: 'Төслийг шалгаж чадсангүй' };
    if (!project) return { ok: false, status: 400, error: 'Төсөл олдсонгүй' };

    if (request.status === 'closed_won' || request.status === 'closed_lost') {
        return { ok: false, status: 400, error: 'Шинэ лидийг идэвхтэй төлөвөөр бүртгэнэ. Гэрээ эсвэл алдсан шалтгаанаа дараа нь бүртгэнэ үү.' };
    }
    const status = (ACTIVE_STATUSES as string[]).includes(request.status as string) ? request.status as LeadStatus : 'new';

    const category = request.category ? await resolveLeadCategory(db, shopId, request.category) : null;
    if (category && !category.ok) return category;

    const identity = await resolveManagerIdentity(db, shopId, actor.userId);
    let managerName = identity.isManager ? identity.managerName : null;
    if ((actor.role === 'admin' || actor.role === 'super_admin') && request.assignManager) {
        const manager = await resolveActiveManagerName(db, shopId, request.assignManager);
        if (!manager.ok) return { ok: false, status: manager.status, error: manager.error };
        managerName = manager.managerName;
    }
    if (managerName) {
        try { await assertProjectManager(db, shopId, projectId, managerName); }
        catch (error) {
            if (error instanceof ProjectScopeError) return { ok: false, status: error.status, error: error.message };
            throw error;
        }
    }
    return {
        ok: true,
        project_id: projectId,
        status,
        source: toLeadSource(typeof request.source === 'string' ? request.source : null),
        sales_manager_name: managerName,
        category_id: category?.categoryId ?? null,
        category_name: category?.category?.name ?? null,
    };
}

type LeadRow = Record<string, unknown> & { shop_id: string; project_id?: string | null; client_request_id?: string | null };

export type InsertLeadResult =
    | { ok: true; lead: Record<string, unknown>; duplicate: boolean; /** Автоматаар оноосон менежер (шинэ лидэд). */ autoAssigned?: string | null }
    | { ok: false; conflict: true }
    | { ok: false; conflict: false; error: PostgrestError };

/**
 * Лидийг нэг удаа бичнэ. `client_request_id` өмнө ашиглагдсан бол ижил төслийн лидийг буцааж
 * (`duplicate`), өөр төсөлд ашиглагдсан бол `conflict`. `scope` өгвөл давтан уншилт хүрээндээ үлдэнэ.
 * Бүх сувгийн нэрийг `normalizeLeadName`-ээр цэвэрлэнэ: хоосон, «-», «Facebook lead»,
 * «Нэргүй харилцагч» шошго → null (нэргүй лид). Шошго DB-д хэзээ ч бичигдэхгүй.
 */
export async function insertLeadOnce(
    db: SupabaseClient,
    input: LeadRow,
    options: { scope?: SalesProjectScope; select?: string } = {},
): Promise<InsertLeadResult> {
    const row: LeadRow = 'customer_name' in input ? { ...input, customer_name: normalizeLeadName(input.customer_name) } : input;
    const select = options.select ?? '*';
    const requestId = row.client_request_id;
    const existing = async () => {
        let query = db.from('leads').select(select).eq('shop_id', row.shop_id).eq('client_request_id', requestId as string);
        if (options.scope) query = applyLeadScope(query, options.scope);
        return query.maybeSingle<Record<string, unknown>>();
    };
    const replay = (lead: Record<string, unknown> | null): InsertLeadResult | null => {
        if (!lead) return null;
        return (lead.project_id ?? null) === (row.project_id ?? null) ? { ok: true, lead, duplicate: true } : { ok: false, conflict: true };
    };

    if (requestId) {
        const prior = await existing();
        if (prior.error) return { ok: false, conflict: false, error: prior.error };
        const replayed = replay(prior.data);
        if (replayed) return replayed;
    }
    // Хуваарилалт амжилтгүй бол лидийг алдахгүй: хариуцагчгүй хадгалж, админ хуваарилна.
    const autoManager = row.project_id && !String(row.sales_manager_name ?? '').trim()
        ? await pickAutoAssignManager(db, row.shop_id, row.project_id).catch(error => {
            logger.warn('[LeadService] auto-assign skipped', { error });
            return null;
        })
        : null;
    const { data, error } = await db.from('leads').insert(autoManager ? { ...row, sales_manager_name: autoManager } : row)
        .select(select).single<Record<string, unknown>>();
    if (!error && data) {
        if (autoManager && typeof data.id === 'string') {
            await logLeadActivity(db, {
                shopId: row.shop_id, leadId: data.id, type: 'manager',
                content: `${autoManager} автоматаар хуваарилагдав`, meta: { action: 'auto_assign', to: autoManager },
            });
        }
        return { ok: true, lead: data, duplicate: false, autoAssigned: autoManager };
    }
    if (error?.code === '23505' && requestId) {
        const raced = await existing();
        return (!raced.error && replay(raced.data)) || { ok: false, conflict: true };
    }
    return { ok: false, conflict: false, error: error as PostgrestError };
}

/** Ажилтны лидийн засварын талбарууд (PATCH /api/dashboard/leads/[id], AI `update_lead`). Бусад түлхүүрийг үл хэрэгсэнэ. */
export interface StaffLeadPatch {
    project_id?: unknown;
    status?: unknown;
    notes?: unknown;
    next_followup_at?: unknown;
    last_contact_at?: unknown;
    lost_reason?: unknown;
    sales_manager_name?: unknown;
    preferred_rooms?: unknown;
    preferred_type?: unknown;
    budget_max?: unknown;
    customer_name?: unknown;
    category_id?: unknown;
}

/** PATCH-ийн өмнөх утга (түүх, хүрээний шалгалтад); `category_id` зөвхөн ангилал өөрчлөхөд уншигдана. */
const PATCH_LEAD_COLUMNS = 'id, project_id, status, sales_manager_name, lost_reason, customer_name';
type PatchLeadRow = {
    id: string; project_id: string | null; status: string; sales_manager_name: string | null;
    lost_reason: string | null; customer_name: string | null; category_id?: string | null;
};
const LeadNameSchema = z.string().trim().min(1).max(200);

const leadFailure = (status: number, error: string): Failure => ({ ok: false, status, error });

/** Засварын талбаруудыг шалгаж DB-ийн шинэчлэл болгоно (AI урьдчилан харахад мөн ашиглана). */
export function parseStaffLeadPatch(body: StaffLeadPatch): { ok: true; updates: Record<string, unknown> } | Failure {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.project_id !== undefined) {
        if (body.project_id !== null && !z.string().uuid().safeParse(body.project_id).success) return leadFailure(400, 'Буруу төсөл');
        updates.project_id = body.project_id;
    }
    if (body.status !== undefined) {
        if (!(LEAD_STATUSES as string[]).includes(body.status as string)) return leadFailure(400, 'Буруу төлөв');
        updates.status = body.status;
        // closed_lost-аас өөр шат руу шилжвэл алдсан шалтгааныг цэвэрлэнэ.
        if (body.status !== 'closed_lost' && body.lost_reason === undefined) updates.lost_reason = null;
    }
    // Харилцагчийн нэр нэмэх/засах (нэргүй лидийг дараа нь нэрлэнэ). Нэрийг хоосолж болохгүй.
    if (body.customer_name !== undefined) {
        const parsedName = LeadNameSchema.safeParse(body.customer_name);
        const name = parsedName.success ? normalizeLeadName(parsedName.data) : null;
        if (!name) return leadFailure(400, 'Харилцагчийн нэрийг оруулна уу. Нэрийг хоосолж болохгүй.');
        updates.customer_name = name;
    }
    if (typeof body.notes === 'string') updates.notes = body.notes;
    // «Өнөөдөр» дэлгэц: дараагийн холбоо барих цагийг хойшлуулах / дуусгах (null).
    if (body.next_followup_at !== undefined) {
        if (body.next_followup_at === null) updates.next_followup_at = null;
        else if (typeof body.next_followup_at === 'string' && !Number.isNaN(Date.parse(body.next_followup_at))) {
            updates.next_followup_at = new Date(body.next_followup_at).toISOString();
        } else {
            return leadFailure(400, 'Буруу огноо');
        }
    }
    if (typeof body.last_contact_at === 'string' && !Number.isNaN(Date.parse(body.last_contact_at))) {
        updates.last_contact_at = new Date(body.last_contact_at).toISOString();
    }
    if (typeof body.lost_reason === 'string') updates.lost_reason = body.lost_reason.slice(0, 300) || null;
    // Хариуцагч менежер хуваарилах/чөлөөлөх (null = хуваарилаагүй)
    if (body.sales_manager_name !== undefined) {
        const name = body.sales_manager_name;
        if (name !== null && typeof name !== 'string') return leadFailure(400, 'Буруу менежерийн нэр');
        const trimmed = typeof name === 'string' ? name.trim().slice(0, 120) : null;
        updates.sales_manager_name = trimmed || null;
    }
    // Сонирхол (inline засвар)
    if (body.preferred_rooms !== undefined) {
        const n = body.preferred_rooms === null ? null : Number(body.preferred_rooms);
        if (n !== null && (!Number.isInteger(n) || n < 1 || n > 20)) return leadFailure(400, 'Буруу өрөөний тоо');
        updates.preferred_rooms = n;
    }
    if (body.preferred_type !== undefined) {
        // `property_type` enum — дурын string 500 өгдөг байсан.
        if (body.preferred_type !== null && !(PROPERTY_TYPES as string[]).includes(body.preferred_type as string)) return leadFailure(400, 'Буруу байрны төрөл');
        updates.preferred_type = body.preferred_type;
    }
    if (body.budget_max !== undefined) {
        const n = body.budget_max === null ? null : Number(body.budget_max);
        if (n !== null && (!Number.isFinite(n) || n < 0)) return leadFailure(400, 'Буруу төсөв');
        updates.budget_max = n;
    }
    // Лидийн ангилал (null = ангилалгүй) — энэ төслийн ангилал эсэхийг лидийг уншсаны дараа шалгана.
    if (body.category_id !== undefined) {
        if (body.category_id !== null && !z.string().uuid().safeParse(body.category_id).success) return leadFailure(400, 'Буруу ангилал');
        updates.category_id = body.category_id;
    }

    return { ok: true, updates };
}

/**
 * Лидийн засварын нэг дүрэм: талбарын шалгалт, төсөл/менежерийн хүрээ, «Амжилттай»-д бодит гэрээ,
 * «Алдсан»-д шалтгаан, уншсанаас хойш төсөл өөрчлөгдсөн бол 409. Статус, менежер, нэр, ангиллын
 * өөрчлөлтийг lead_activities-д бичнэ. `actor.scope`-ийг сервер тооцоолно (хүсэлтээс авахгүй).
 */
export async function updateStaffLead(
    db: SupabaseClient,
    shopId: string,
    leadId: string,
    body: StaffLeadPatch,
    actor: { userId: string | null; scope: SalesProjectScope },
): Promise<{ ok: true } | Failure> {
    const fail = leadFailure;
    const parsed = parseStaffLeadPatch(body);
    if (!parsed.ok) return parsed;
    const { updates } = parsed;

    const { scope } = actor;
    if (updates.project_id !== undefined) {
        if (!canAccessProject(scope, updates.project_id as string | null)) return fail(403, 'Энэ төсөлд лид шилжүүлэх эрхгүй');
        if (updates.project_id) {
            const { data: project, error } = await db.from('projects').select('id')
                .eq('id', updates.project_id).eq('shop_id', shopId).maybeSingle();
            if (error) throw error;
            if (!project) return fail(400, 'Төсөл олдсонгүй');
        }
    }
    if (typeof updates.sales_manager_name === 'string') {
        const manager = await resolveActiveManagerName(db, shopId, updates.sales_manager_name);
        if (!manager.ok) return fail(manager.status, manager.error);
        updates.sales_manager_name = manager.managerName;
    }
    // Лид энэ shop-д, хэрэглэгчийн хүрээнд байгааг шалгана (өмнөх утгыг түүхэнд бичихэд ашиглана).
    // category_id-г зөвхөн ангилал өөрчлөх үед уншина: ангиллын багана нэмэгдээгүй (migration
    // 20261004161000-аас өмнөх) DB дээр бусад засвар (төлөв, менежер, тэмдэглэл) ажилласаар байна.
    const categoryInput = updates.category_id as string | null | undefined;
    const leadColumns: string = categoryInput !== undefined ? `${PATCH_LEAD_COLUMNS}, category_id` : PATCH_LEAD_COLUMNS;
    const { data: leadRow, error: readError } = await applyLeadScope(db
        .from('leads')
        .select(leadColumns)
        .eq('id', leadId)
        .eq('shop_id', shopId)
        .is('deleted_at', null), scope)
        .single();
    if (readError && readError.code !== 'PGRST116') throw readError;
    const lead = leadRow as unknown as PatchLeadRow | null;
    if (!lead) return fail(404, 'Лийд олдсонгүй');
    if (scope.projectIds !== null) {
        if (updates.sales_manager_name !== undefined && updates.sales_manager_name !== lead.sales_manager_name) {
            return fail(403, 'Лидийг өөр менежерт хуваарилах эрхгүй');
        }
        if (updates.project_id !== undefined && updates.project_id !== lead.project_id) return fail(403, 'Лидийн төслийг өөрчлөх эрхгүй');
    }
    // Шинээр зөвхөн идэвхтэй ангилал; одоогийн (архивласан) ангиллыг хэвээр үлдээж болно.
    const category = categoryInput !== undefined
        ? await resolveLeadCategory(db, shopId, { id: categoryInput }, { current: lead.category_id ?? null })
        : null;
    if (category && !category.ok) return fail(category.status, category.error);
    if (category) updates.category_id = category.categoryId;
    const projectId = updates.project_id !== undefined ? updates.project_id as string | null : lead.project_id;
    const managerName = updates.sales_manager_name !== undefined ? updates.sales_manager_name : lead.sales_manager_name;
    if (typeof managerName === 'string' && (updates.sales_manager_name !== undefined || updates.project_id !== undefined)) {
        try { await assertProjectManager(db, shopId, projectId, managerName); }
        catch (error) {
            if (error instanceof ProjectScopeError) return fail(error.status, error.message);
            throw error;
        }
    }

    // «Амжилттай» — зөвхөн бодит гэрээтэй лид. DB trigger (create_contract_on_lead_won)
    // гэрээгүй closed_won-д үнэгүй stub гэрээ үүсгэж статистикийг өсгөдөг байв (review H5).
    if (updates.status === 'closed_won' && lead.status !== 'closed_won') {
        const { data: contracts, error: contractError } = await db
            .from('property_contracts')
            .select('contract_number, total_price, contract_status')
            .eq('lead_id', leadId)
            .eq('shop_id', shopId)
            .is('deleted_at', null);
        if (contractError) return fail(500, 'Гэрээ шалгахад алдаа гарлаа');
        if (!contracts?.some(hasRealContractFields)) {
            return fail(400, 'Гэрээгүй лидийг «Амжилттай» болгох боломжгүй. Эхлээд «Гэрээ үүсгэх»-ээр гэрээ бүртгэнэ үү.');
        }
    }
    // «Алдсан» — шалтгаан заавал.
    if (updates.status === 'closed_lost' && lead.status !== 'closed_lost' && !updates.lost_reason && !lead.lost_reason) {
        return fail(400, 'Алдсан шалтгаанаа (lost_reason) заана уу');
    }

    // Түүхэнд бичих өөрчлөлтийг бичилтээс өмнөх утгаар тодорхойлно.
    const changedStatus = updates.status !== undefined && updates.status !== lead.status;
    const changedManager = updates.sales_manager_name !== undefined && updates.sales_manager_name !== lead.sales_manager_name;
    const previousName: string | null = lead.customer_name ?? null;
    const changedName = updates.customer_name !== undefined && updates.customer_name !== previousName;
    const previousCategory: string | null = lead.category_id ?? null;
    const changedCategory = updates.category_id !== undefined && updates.category_id !== previousCategory;

    let write = applyLeadScope(db.from('leads').update(updates).eq('id', leadId).eq('shop_id', shopId).is('deleted_at', null), scope);
    write = lead.project_id ? write.eq('project_id', lead.project_id) : write.is('project_id', null);
    const { data: updated, error } = await write.select('id').maybeSingle();
    if (error) return fail(500, 'Шинэчлэхэд алдаа гарлаа');
    if (!updated) return fail(409, 'Лидийн төсөл өөрчлөгдсөн байна. Дахин уншаад оролдоно уу.');

    // Түүх: статус / менежер / нэр / ангиллын өөрчлөлт (best-effort)
    if (changedStatus || changedManager || changedName || changedCategory) {
        const identity = actor.userId ? await resolveManagerIdentity(db, shopId, actor.userId) : null;
        const by = identity?.managerName ?? null;
        if (changedStatus) {
            await logLeadActivity(db, {
                shopId, leadId, type: 'status', createdBy: actor.userId, createdByName: by,
                content: `${statusLabel(lead.status)} → ${statusLabel(updates.status as string)}${updates.lost_reason ? ` · ${updates.lost_reason}` : ''}`,
                meta: { from: lead.status, to: updates.status, lost_reason: updates.lost_reason ?? null },
            });
        }
        if (changedManager) {
            await logLeadActivity(db, {
                shopId, leadId, type: 'manager', createdBy: actor.userId, createdByName: by,
                content: `${lead.sales_manager_name || '—'} → ${(updates.sales_manager_name as string | null) || '—'}`,
                meta: { from: lead.sales_manager_name, to: updates.sales_manager_name },
            });
        }
        if (changedName) {
            await logLeadActivity(db, {
                shopId, leadId, type: 'system', createdBy: actor.userId, createdByName: by,
                content: `Нэр: ${leadDisplayName(previousName)} → ${updates.customer_name as string}`,
                meta: { field: 'customer_name', from: previousName, to: updates.customer_name },
            });
        }
        if (changedCategory && category?.ok) {
            await logLeadCategoryChange(db, {
                shopId, leadId, userId: actor.userId, userName: by,
                from: { id: previousCategory, name: await leadCategoryName(db, shopId, previousCategory) },
                to: { id: category.categoryId, name: category.category?.name ?? null },
            });
        }
    }
    return { ok: true };
}
