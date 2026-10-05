/**
 * Лидийн ангилал (`lead_categories`) — НЭГ дүрэм. API route (Тохиргоо, лид үүсгэх/засах),
 * AI tool, экспорт, тайлан бүгд энд дамжина.
 *
 * • Ангилал нь төсөл (= shop) бүрийн тохиргоо; лид нэг ангилалтай эсвэл ангилалгүй (NULL).
 *   DB-ийн composite FK (shop_id, category_id) өөр төслийн ангилалд холбохыг хориглоно.
 * • Оноох: идэвхтэй ангилал л сонгогдоно; лидийн одоогийн (архивласан) ангиллыг хэвээр үлдээж болно.
 *   Нэрээр (AI) хайхад том/жижиг үсэг, давхар зай ялгахгүй, яг таарсныг л авна — таамаглахгүй.
 * • Ашиглагдсан ангиллыг устгахгүй — архивлана. Төсөл бүрт ≤ 30 (DB trigger мөн шалгана).
 * • Эрэмбэ нэг хүсэлтээр (`reorderLeadCategories`), мөр бүрийг PATCH-аар биш.
 * • Тохиргооны өөрчлөлт data_audit_log-д (best-effort), лидийн ангиллын өөрчлөлт lead_activities-д.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    DEFAULT_LEAD_CATEGORIES, LEAD_CATEGORY_DESCRIPTION_MAX, LEAD_CATEGORY_LIMIT, LEAD_CATEGORY_NAME_MAX, LEAD_CATEGORY_TONE_KEYS,
    UNCATEGORIZED_LABEL, categoryNameKey, isUncategorizedInput, normalizeCategoryName, type LeadCategoryTone,
} from '@/lib/leads/labels';
import { logLeadActivity } from '@/lib/leads/activities';
import { recordAudit } from '@/lib/services/AuditService';

export interface LeadCategory {
    id: string;
    name: string;
    description: string | null;
    tone: LeadCategoryTone;
    sort_order: number;
    is_active: boolean;
}

export type CategoryFailure = { ok: false; status: number; error: string };
export type CategoryResult<T> = ({ ok: true } & T) | CategoryFailure;

const COLUMNS = 'id, name, description, tone, sort_order, is_active';
const failure = (status: number, error: string): CategoryFailure => ({ ok: false, status, error });
const LOAD_ERROR = 'Лидийн ангиллыг шалгаж чадсангүй. Дахин оролдоно уу.';

/* ── Оролтын схем (Тохиргооны API) ─────────────────────────────────────── */

const NameSchema = z.string({ error: 'Ангиллын нэрийг оруулна уу' })
    .transform((value) => normalizeCategoryName(value) ?? '')
    .pipe(z.string()
        .min(1, 'Ангиллын нэрийг оруулна уу')
        .max(LEAD_CATEGORY_NAME_MAX, `Ангиллын нэр ${LEAD_CATEGORY_NAME_MAX} тэмдэгтээс ихгүй байна`)
        .refine((value) => !isUncategorizedInput(value), `«${UNCATEGORIZED_LABEL}» нэрийг ангилалд ашиглахгүй`));
const DescriptionSchema = z.preprocess(
    (value) => typeof value === 'string' ? (value.trim() || null) : value,
    z.string().max(LEAD_CATEGORY_DESCRIPTION_MAX, `Тайлбар ${LEAD_CATEGORY_DESCRIPTION_MAX} тэмдэгтээс ихгүй байна`).nullable(),
);
const ToneSchema = z.enum(LEAD_CATEGORY_TONE_KEYS, { error: 'Буруу өнгө' });
const SortOrderSchema = z.number({ error: 'Эрэмбэ 0–1000 бүхэл тоо байна' }).int('Эрэмбэ 0–1000 бүхэл тоо байна')
    .min(0, 'Эрэмбэ 0–1000 бүхэл тоо байна').max(1000, 'Эрэмбэ 0–1000 бүхэл тоо байна');

export const CreateLeadCategorySchema = z.object({
    name: NameSchema,
    description: DescriptionSchema.optional(),
    tone: ToneSchema.optional(),
    sort_order: SortOrderSchema.optional(),
}).strict();
export type CreateLeadCategoryInput = z.infer<typeof CreateLeadCategorySchema>;

export const UpdateLeadCategorySchema = z.object({
    name: NameSchema.optional(),
    description: DescriptionSchema.optional(),
    tone: ToneSchema.optional(),
    sort_order: SortOrderSchema.optional(),
    is_active: z.boolean({ error: 'Идэвхтэй эсэхийг зөв заана уу' }).optional(),
}).strict().refine((value) => Object.values(value).some((field) => field !== undefined), 'Өөрчлөх талбар алга');
export type UpdateLeadCategoryInput = z.infer<typeof UpdateLeadCategorySchema>;

/** Тохиргооны дээш/доош: төслийн БҮХ ангиллын (архивласан орно) шинэ дараалал, нэг хүсэлтээр. */
export const ReorderLeadCategoriesSchema = z.object({
    order: z.array(z.uuid({ error: 'Буруу ангилал' }), { error: 'Эрэмбийн жагсаалт буруу' })
        .min(1, 'Эрэмбийн жагсаалт хоосон байна')
        .max(LEAD_CATEGORY_LIMIT, 'Эрэмбийн жагсаалт буруу')
        .refine((ids) => new Set(ids).size === ids.length, 'Эрэмбийн жагсаалтад ангилал давхардсан байна'),
}).strict();

/** Zod-ийн алдааг хэрэглэгчид харуулах монгол мессеж болгоно. */
export function leadCategoryInputError(error: z.ZodError): string {
    const issue = error.issues[0];
    if (!issue) return 'Ангиллын мэдээлэл буруу байна';
    if (issue.code === 'unrecognized_keys') return `Зөвшөөрөгдөөгүй талбар: ${issue.keys.join(', ')}`;
    return /[А-Яа-яЁёӨөҮү]/.test(issue.message) ? issue.message : 'Ангиллын мэдээлэл буруу байна';
}

/* ── Унших ─────────────────────────────────────────────────────────────── */

/** Төслийн ангиллууд (эрэмбээр). Алдааг шидэнэ — хоосон жагсаалт болгож нуухгүй. */
export async function listLeadCategories(
    db: SupabaseClient, shopId: string, options: { includeArchived?: boolean } = {},
): Promise<LeadCategory[]> {
    let query = db.from('lead_categories').select(COLUMNS).eq('shop_id', shopId);
    if (!options.includeArchived) query = query.eq('is_active', true);
    const { data, error } = await query.order('sort_order', { ascending: true }).order('name', { ascending: true }).limit(LEAD_CATEGORY_LIMIT * 2);
    if (error) throw error;
    return (data ?? []) as LeadCategory[];
}

/** id → нэр (архивласан нь орно) — экспорт, тайлан, AI-ийн хариунд. */
export function categoryNameMap(categories: readonly Pick<LeadCategory, 'id' | 'name'>[]): Map<string, string> {
    return new Map(categories.map((category) => [category.id, category.name]));
}

/**
 * Тохиргооны жагсаалтад: ангилал бүрийн (устгаагүй) лидийн тоо + ангилалгүй лид. `referenced` —
 * ямар нэг лидэд (устгасан лид орно, FK хэвээр) холбогдсон ангиллын id: устгах товчийг идэвхгүй
 * болгоход. Идэвхтэй лидгүй ангиллыг л устгасан лидээр нэмж шалгана.
 */
export async function countLeadsByCategory(
    db: SupabaseClient, shopId: string, categoryIds: readonly string[],
): Promise<{ byCategory: Record<string, number>; uncategorized: number; referenced: string[] }> {
    const count = async (categoryId: string | null, options: { includeDeleted?: boolean } = {}) => {
        let query = db.from('leads').select('id', { count: 'exact', head: true }).eq('shop_id', shopId);
        if (!options.includeDeleted) query = query.is('deleted_at', null);
        query = categoryId ? query.eq('category_id', categoryId) : query.is('category_id', null);
        const { count: n, error } = await query;
        if (error) throw error;
        return n ?? 0;
    };
    const [uncategorized, ...counts] = await Promise.all([count(null), ...categoryIds.map((id) => count(id))]);
    const unused = categoryIds.filter((_, index) => counts[index] === 0);
    const usedByDeleted = await Promise.all(unused.map((id) => count(id, { includeDeleted: true })));
    const referenced = new Set([
        ...categoryIds.filter((_, index) => counts[index] > 0),
        ...unused.filter((_, index) => usedByDeleted[index] > 0),
    ]);
    return {
        byCategory: Object.fromEntries(categoryIds.map((id, index) => [id, counts[index]])),
        uncategorized,
        referenced: categoryIds.filter((id) => referenced.has(id)),
    };
}

/* ── Лидэд оноох ───────────────────────────────────────────────────────── */

export interface LeadCategoryInput {
    /** Сонгогчийн id (uuid), null/'' = ангилалгүй. */
    id?: unknown;
    /** AI-ийн нэр («Ангилалгүй», хоосон = цэвэрлэх). Нэр таарахгүй бол сонголтуудыг жагсааж алдаа буцаана. */
    name?: unknown;
}

function availableNames(categories: readonly LeadCategory[]): string {
    const names = categories.filter((category) => category.is_active).map((category) => category.name);
    return names.length
        ? `Боломжтой ангилал: ${names.join(', ')}.`
        : 'Энэ төсөлд идэвхтэй лидийн ангилал алга (Тохиргоо → Лидийн ангилал).';
}

/**
 * Лидийн ангиллыг шалгаж `category_id`-г буцаана (null = ангилалгүй). `current` нь лидийн одоогийн
 * ангилал: архивласан байсан ч хэвээр үлдээж болно; шинээр зөвхөн идэвхтэй ангилал оноогдоно.
 * `allowArchived` — шүүлтүүрт (оноохгүй) архивласан ангиллыг ч нэрээр нь олно.
 */
export async function resolveLeadCategory(
    db: SupabaseClient,
    shopId: string,
    input: LeadCategoryInput,
    options: { current?: string | null; allowArchived?: boolean } = {},
): Promise<CategoryResult<{ categoryId: string | null; category: LeadCategory | null }>> {
    const current = options.current ?? null;
    const usable = (category: LeadCategory) => category.is_active || category.id === current || !!options.allowArchived;
    if (input.id !== undefined) {
        if (input.id === null || input.id === '') return { ok: true, categoryId: null, category: null };
        if (typeof input.id !== 'string' || !z.uuid().safeParse(input.id).success) return failure(400, 'Буруу ангилал');
        const { data, error } = await db.from('lead_categories').select(COLUMNS)
            .eq('shop_id', shopId).eq('id', input.id).maybeSingle();
        if (error) return failure(503, LOAD_ERROR);
        const category = data as LeadCategory | null;
        if (!category) return failure(400, 'Ангилал олдсонгүй');
        if (!usable(category)) {
            return failure(400, `«${category.name}» ангилал архивлагдсан тул шинээр оноохгүй. Өөр ангилал сонгоно уу.`);
        }
        return { ok: true, categoryId: category.id, category };
    }
    if (input.name === undefined || isUncategorizedInput(input.name)) return { ok: true, categoryId: null, category: null };
    if (typeof input.name !== 'string') return failure(400, 'Буруу ангилал');

    let categories: LeadCategory[];
    try { categories = await listLeadCategories(db, shopId, { includeArchived: true }); }
    catch { return failure(503, LOAD_ERROR); }
    const key = categoryNameKey(input.name);
    const category = categories.find((item) => categoryNameKey(item.name) === key);
    if (!category) return failure(400, `Ангилал олдсонгүй: «${normalizeCategoryName(input.name)}». ${availableNames(categories)}`);
    if (!usable(category)) {
        return failure(400, `«${category.name}» ангилал архивлагдсан. ${availableNames(categories)}`);
    }
    return { ok: true, categoryId: category.id, category };
}

/** Лидийн түүхэнд бичих ангиллын өөрчлөлт (best-effort, type 'system', meta.field = 'category'). */
export async function logLeadCategoryChange(
    db: SupabaseClient,
    input: {
        shopId: string; leadId: string;
        from: { id: string | null; name: string | null };
        to: { id: string | null; name: string | null };
        userId?: string | null; userName?: string | null;
    },
) {
    return logLeadActivity(db, {
        shopId: input.shopId, leadId: input.leadId, type: 'system', createdBy: input.userId ?? null, createdByName: input.userName ?? null,
        content: `Ангилал: ${input.from.name ?? UNCATEGORIZED_LABEL} → ${input.to.name ?? UNCATEGORIZED_LABEL}`,
        meta: { field: 'category', from: input.from.id, to: input.to.id, from_name: input.from.name, to_name: input.to.name },
    });
}

/** Лидийн одоогийн ангиллын нэр (түүхэнд бичихэд). Олдохгүй/алдаа бол null. */
export async function leadCategoryName(db: SupabaseClient, shopId: string, categoryId: string | null | undefined): Promise<string | null> {
    if (!categoryId) return null;
    const { data, error } = await db.from('lead_categories').select('name').eq('shop_id', shopId).eq('id', categoryId).maybeSingle();
    return error ? null : (data?.name as string | undefined) ?? null;
}

/* ── Тохиргоо: нэмэх, засах, устгах ────────────────────────────────────── */

function writeFailure(error: { code?: string; message?: string } | null): CategoryFailure | null {
    if (!error) return null;
    if (error.code === '23505') return failure(409, 'Ийм нэртэй ангилал байна (архивласан бол сэргээнэ үү)');
    if (error.code === '23514' && error.message?.includes('lead_category_limit')) {
        return failure(400, `Төсөлд ${LEAD_CATEGORY_LIMIT}-аас олон ангилал нэмэх боломжгүй. Ашиглаагүйг устгана уу.`);
    }
    if (error.code === '23514') return failure(400, 'Ангиллын мэдээлэл буруу байна');
    return null;
}

function duplicateOf(categories: readonly LeadCategory[], name: string, exceptId?: string): LeadCategory | undefined {
    const key = categoryNameKey(name);
    return categories.find((category) => category.id !== exceptId && categoryNameKey(category.name) === key);
}

const duplicateError = (category: LeadCategory) => failure(409, category.is_active
    ? `«${category.name}» нэртэй ангилал байна`
    : `«${category.name}» ангилал архивт байна — архиваас сэргээнэ үү`);

export async function createLeadCategory(
    db: SupabaseClient, shopId: string, input: CreateLeadCategoryInput, actorId: string | null,
): Promise<CategoryResult<{ category: LeadCategory }>> {
    let existing: LeadCategory[];
    try { existing = await listLeadCategories(db, shopId, { includeArchived: true }); }
    catch { return failure(503, LOAD_ERROR); }
    const duplicate = duplicateOf(existing, input.name);
    if (duplicate) return duplicateError(duplicate);
    if (existing.length >= LEAD_CATEGORY_LIMIT) return writeFailure({ code: '23514', message: 'lead_category_limit' })!;

    const sortOrder = input.sort_order ?? Math.min(1000, existing.reduce((max, category) => Math.max(max, category.sort_order), 0) + 10);
    const { data, error } = await db.from('lead_categories').insert({
        shop_id: shopId, name: input.name, description: input.description ?? null, tone: input.tone ?? 'neutral',
        sort_order: sortOrder, created_by: actorId,
    }).select(COLUMNS).single();
    const mapped = writeFailure(error);
    if (mapped) return mapped;
    if (error || !data) throw error ?? new Error('lead category insert returned no row');
    const category = data as LeadCategory;
    await recordAudit({ shopId, actorId, entity: 'lead_category', entityId: category.id, action: 'create', changes: { name: category.name, tone: category.tone } });
    return { ok: true, category };
}

export async function updateLeadCategory(
    db: SupabaseClient, shopId: string, id: string, patch: UpdateLeadCategoryInput, actorId: string | null,
): Promise<CategoryResult<{ category: LeadCategory }>> {
    if (!z.uuid().safeParse(id).success) return failure(400, 'Буруу ангилал');
    let existing: LeadCategory[];
    try { existing = await listLeadCategories(db, shopId, { includeArchived: true }); }
    catch { return failure(503, LOAD_ERROR); }
    const before = existing.find((category) => category.id === id);
    if (!before) return failure(404, 'Ангилал олдсонгүй');
    if (patch.name !== undefined) {
        const duplicate = duplicateOf(existing, patch.name, id);
        if (duplicate) return duplicateError(duplicate);
    }

    const updates: Record<string, unknown> = {};
    for (const key of ['name', 'description', 'tone', 'sort_order', 'is_active'] as const) {
        if (patch[key] !== undefined) updates[key] = patch[key];
    }
    const { data, error } = await db.from('lead_categories').update(updates)
        .eq('shop_id', shopId).eq('id', id).select(COLUMNS).maybeSingle();
    const mapped = writeFailure(error);
    if (mapped) return mapped;
    if (error) throw error;
    if (!data) return failure(404, 'Ангилал олдсонгүй');
    const category = data as LeadCategory;
    const changes = Object.fromEntries(Object.keys(updates)
        .filter((key) => before[key as keyof LeadCategory] !== category[key as keyof LeadCategory])
        .map((key) => [key, { from: before[key as keyof LeadCategory], to: category[key as keyof LeadCategory] }]));
    if (Object.keys(changes).length) {
        await recordAudit({ shopId, actorId, entity: 'lead_category', entityId: id, action: 'update', changes });
    }
    return { ok: true, category };
}

/**
 * Ангиллын нэг шинэ дараалал: 10, 20, … эрэмбийг зөвхөн өөрчлөгдсөн мөрт бичиж, нэг audit үлдээнэ.
 * `order` нь төслийн бүх ангиллыг яг нэг удаа агуулна — өөр хэрэглэгч зэрэг нэмсэн/устгасан бол 409.
 * Хэсэгчлэн бичигдсэн ч дахин илгээхэд бүрэн засагдана (эрэмбэ нь зөвхөн байрлалаас хамаарна).
 */
export async function reorderLeadCategories(
    db: SupabaseClient, shopId: string, order: readonly string[], actorId: string | null,
): Promise<CategoryResult<{ categories: LeadCategory[] }>> {
    let existing: LeadCategory[];
    try { existing = await listLeadCategories(db, shopId, { includeArchived: true }); }
    catch { return failure(503, LOAD_ERROR); }
    const byId = new Map(existing.map((category) => [category.id, category]));
    if (order.length !== existing.length || new Set(order).size !== order.length || order.some((id) => !byId.has(id))) {
        return failure(409, 'Ангиллын жагсаалт өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу.');
    }
    const categories = order.map((id, index) => ({ ...byId.get(id)!, sort_order: Math.min(1000, (index + 1) * 10) }));
    const changes = categories.filter((category) => byId.get(category.id)!.sort_order !== category.sort_order);
    const results = await Promise.all(changes.map((category) => db.from('lead_categories')
        .update({ sort_order: category.sort_order }).eq('shop_id', shopId).eq('id', category.id)));
    const applied = changes.filter((_, index) => !results[index].error);
    if (applied.length) {
        await recordAudit({
            shopId, actorId, entity: 'lead_category', action: 'update',
            changes: { sort_order: Object.fromEntries(applied.map((category) => [category.id, { from: byId.get(category.id)!.sort_order, to: category.sort_order }])) },
        });
    }
    if (applied.length !== changes.length) return failure(503, 'Эрэмбийг бүрэн хадгалж чадсангүй. Дахин оролдоно уу.');
    return { ok: true, categories };
}

const IN_USE_ERROR = 'Лидэд (устгасан лид орно) ашиглагдсан тул устгах боломжгүй. Архивлана уу.';

/**
 * Зөвхөн ашиглагдаагүй (устгасан лидэд ч) ангиллыг устгана; бусдыг архивлана. Алдааны мессежид
 * лидийн тоо бичихгүй — хувийн хүрээтэй хэрэглэгчид байгууллагын тоо ил гарахгүй.
 */
export async function deleteLeadCategory(
    db: SupabaseClient, shopId: string, id: string, actorId: string | null,
): Promise<CategoryResult<{ id: string }>> {
    if (!z.uuid().safeParse(id).success) return failure(400, 'Буруу ангилал');
    const usage = await db.from('leads').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).eq('category_id', id);
    if (usage.error) return failure(503, LOAD_ERROR);
    if ((usage.count ?? 0) > 0) return failure(409, IN_USE_ERROR);
    const { data, error } = await db.from('lead_categories').delete().eq('shop_id', shopId).eq('id', id).select('id, name').maybeSingle();
    if (error?.code === '23503') return failure(409, IN_USE_ERROR);
    if (error) throw error;
    if (!data) return failure(404, 'Ангилал олдсонгүй');
    await recordAudit({ shopId, actorId, entity: 'lead_category', entityId: id, action: 'delete', changes: { name: data.name } });
    return { ok: true, id };
}

/**
 * Санал болгох ангиллуудыг (DEFAULT_LEAD_CATEGORIES) нэмнэ: ижил нэртэй (архивласан ч) байвал
 * алгасна, 30-ын хязгаарт багтах хэрээр л нэмнэ. Дахин дарахад юу ч нэмэгдэхгүй (idempotent).
 */
export async function addDefaultLeadCategories(
    db: SupabaseClient, shopId: string, actorId: string | null,
): Promise<CategoryResult<{ created: LeadCategory[]; skipped: number }>> {
    let existing: LeadCategory[];
    try { existing = await listLeadCategories(db, shopId, { includeArchived: true }); }
    catch { return failure(503, LOAD_ERROR); }
    const keys = new Set(existing.map((category) => categoryNameKey(category.name)));
    const missing = DEFAULT_LEAD_CATEGORIES.filter((preset) => !keys.has(categoryNameKey(preset.name)));
    const room = Math.max(0, LEAD_CATEGORY_LIMIT - existing.length);
    const rows = missing.slice(0, room).map((preset) => ({ shop_id: shopId, ...preset, created_by: actorId }));
    if (!rows.length) return { ok: true, created: [], skipped: DEFAULT_LEAD_CATEGORIES.length };

    const { data, error } = await db.from('lead_categories').insert(rows).select(COLUMNS);
    if (error?.code === '23505') return failure(409, 'Ангилал зэрэг нэмэгдсэн байна. Хуудсаа шинэчлээд дахин оролдоно уу.');
    const mapped = writeFailure(error);
    if (mapped) return mapped;
    if (error) throw error;
    const created = (data ?? []) as LeadCategory[];
    await recordAudit({ shopId, actorId, entity: 'lead_category', action: 'create', changes: { preset: 'defaults', names: created.map((category) => category.name) } });
    return { ok: true, created, skipped: DEFAULT_LEAD_CATEGORIES.length - created.length };
}
