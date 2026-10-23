/**
 * «Сэжим (хаанаас ирсэн)» (`sales_referral_sources`) — серверийн НЭГ дүрэм: Тохиргооны API, уулзалт
 * (ViewingService, DailyMeetingService), гэрээний PATCH, гэрээний жагсаалт, AI tool бүгд энд дамжина.
 *
 * • Migration (20261023151000) ороогүй орчинд уншилт хоосон/тодорхойгүй болно (`available: false`), бичилт
 *   ойлгомжтой 503 буцаана — уулзалт бүртгэхийг хаахгүй.
 * • Оноох: идэвхтэй сонголт л шинээр сонгогдоно; мөрийн одоогийн (архивласан) сонголтыг хэвээр үлдээж болно.
 *   Нэрээр (AI) хайхад том/жижиг үсэг, давхар зай ялгахгүй, яг таарсныг л авна — таамаглахгүй.
 * • Устгахгүй — архивлана. Эрэмбэ нэг хүсэлтээр. Тохиргооны өөрчлөлт data_audit_log-д (best-effort).
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordAudit } from '@/lib/services/AuditService';
import {
    DEFAULT_REFERRAL_SOURCES, REFERRAL_FIELD_LABEL, REFERRAL_REQUIRED_ERROR, REFERRAL_SOURCE_ACTIVE_LIMIT, REFERRAL_SOURCE_NAME_MAX, REFERRAL_SOURCE_READ_LIMIT,
    availableReferralText, isActiveReferral, missingDefaultReferralSources, normalizeReferralName, referralNameKey, referralNameMap,
    type ReferralSource,
} from '@/lib/sales/referral-sources';

export type ReferralFailure = { ok: false; status: number; error: string };
export type ReferralResult<T> = ({ ok: true } & T) | ReferralFailure;

const COLUMNS = 'id, name, sort_order, archived_at';
const failure = (status: number, error: string): ReferralFailure => ({ ok: false, status, error });
const LOAD_ERROR = `«${REFERRAL_FIELD_LABEL}»-ийн жагсаалтыг шалгаж чадсангүй. Дахин оролдоно уу.`;
export const REFERRAL_UNAVAILABLE = `«${REFERRAL_FIELD_LABEL}»-ийн жагсаалт хараахан идэвхжээгүй байна. Админд хандаж шинэчлэлийг (migration) суулгана уу.`;

/** Хүснэгт эсвэл referral_source_id багана байхгүй (migration 20261023151000 ороогүй) эсэх. */
export function isMissingReferralSchema(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    return ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error.code ?? '')
        || /(sales_referral_sources|referral_source_id).*(does not exist|could not find)|could not find.*(sales_referral_sources|referral_source_id)/i.test(error.message ?? '');
}

/* ── Унших ─────────────────────────────────────────────────────────────── */

/**
 * Төслийн сонголтууд (эрэмбээр). Хүснэгт байхгүй бол `available: false` ба хоосон жагсаалт;
 * бусад алдааг шидэнэ — хоосон жагсаалт болгож нуухгүй.
 */
export async function readReferralSources(
    db: SupabaseClient, shopId: string, options: { includeArchived?: boolean } = {},
): Promise<{ sources: ReferralSource[]; available: boolean }> {
    let query = db.from('sales_referral_sources').select(COLUMNS).eq('shop_id', shopId);
    if (!options.includeArchived) query = query.is('archived_at', null);
    const { data, error } = await query.order('sort_order', { ascending: true }).order('name', { ascending: true }).limit(REFERRAL_SOURCE_READ_LIMIT);
    if (error) {
        if (isMissingReferralSchema(error)) return { sources: [], available: false };
        throw new Error(error.message);
    }
    return { sources: (data ?? []) as ReferralSource[], available: true };
}

/** Нийтлэг уншигч (S1/S5 илтгэл, гэрээний жагсаалт): хүснэгт байхгүй бол хоосон жагсаалт. */
export async function listReferralSources(
    db: SupabaseClient, shopId: string, options: { includeArchived?: boolean } = {},
): Promise<ReferralSource[]> {
    return (await readReferralSources(db, shopId, options)).sources;
}

/** id → нэр (архивласан орно). Хүснэгт байхгүй эсвэл id өгөөгүй бол хоосон map. */
export async function loadReferralNames(db: SupabaseClient, shopId: string, ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
    if (!ids.some(Boolean)) return new Map();
    return referralNameMap(await listReferralSources(db, shopId, { includeArchived: true }));
}

/* ── Мөрд оноох (уулзалт, гэрээ) ───────────────────────────────────────── */

export interface ReferralInput {
    /** Сонгогчийн id (uuid); null/'' = цэвэрлэх; undefined = өгөөгүй. */
    id?: unknown;
    /** AI-ийн нэр; хоосон = өгөөгүй. Таарахгүй бол сонголтуудыг жагсааж алдаа буцаана. */
    name?: unknown;
}

/**
 * «Сэжим»-ийг шалгаж `referralSourceId`-г буцаана (null = бүртгээгүй). `current` — мөрийн одоогийн сонголт
 * (архивласан ч хэвээр үлдэнэ). `required` — шинэ харилцагчийн шинэ уулзалт: төсөлд идэвхтэй сонголт байвал
 * заавал. Хүснэгт байхгүй үед утга өгөөгүй бол null (хаахгүй), өгсөн бол 503.
 */
export async function resolveReferralSource(
    db: SupabaseClient,
    shopId: string,
    input: ReferralInput,
    options: { current?: string | null; required?: boolean } = {},
): Promise<ReferralResult<{ referralSourceId: string | null; source: ReferralSource | null; available: boolean }>> {
    const name = normalizeReferralName(input.name);
    const given = (input.id !== undefined && input.id !== null && input.id !== '') || !!name;
    if (input.id !== undefined && input.id !== null && input.id !== '' && (typeof input.id !== 'string' || !z.guid().safeParse(input.id).success)) {
        return failure(400, `«${REFERRAL_FIELD_LABEL}» буруу байна`);
    }
    if (input.name !== undefined && input.name !== null && typeof input.name !== 'string') return failure(400, `«${REFERRAL_FIELD_LABEL}» буруу байна`);

    let read: { sources: ReferralSource[]; available: boolean };
    try { read = await readReferralSources(db, shopId, { includeArchived: true }); }
    catch { return failure(503, LOAD_ERROR); }
    if (!read.available) return given ? failure(503, REFERRAL_UNAVAILABLE) : { ok: true, referralSourceId: null, source: null, available: false };

    const current = options.current ?? null;
    const usable = (source: ReferralSource) => isActiveReferral(source) || source.id === current;
    let source: ReferralSource | null = null;
    if (typeof input.id === 'string' && input.id) {
        source = read.sources.find((item) => item.id === input.id) ?? null;
        if (!source) return failure(400, `«${REFERRAL_FIELD_LABEL}» олдсонгүй. ${availableReferralText(read.sources)}`);
    } else if (input.id === undefined && name) {
        const key = referralNameKey(name);
        // Ижил нэртэй идэвхтэй сонголтыг архивласнаас түрүүлж авна.
        source = read.sources.find((item) => referralNameKey(item.name) === key && isActiveReferral(item))
            ?? read.sources.find((item) => referralNameKey(item.name) === key) ?? null;
        if (!source) return failure(400, `«${REFERRAL_FIELD_LABEL}» олдсонгүй: «${name}». ${availableReferralText(read.sources)}`);
    }
    if (source && !usable(source)) {
        return failure(400, `«${source.name}» архивлагдсан тул шинээр сонгохгүй. ${availableReferralText(read.sources)}`);
    }
    if (!source && options.required && read.sources.some(isActiveReferral)) {
        return failure(400, `${REFERRAL_REQUIRED_ERROR}. ${availableReferralText(read.sources)}`);
    }
    return { ok: true, referralSourceId: source?.id ?? null, source, available: true };
}

/* ── Тохиргоо: нэмэх, засах, эрэмбэлэх ─────────────────────────────────── */

const NameSchema = z.string({ error: 'Нэрийг оруулна уу' })
    .transform((value) => normalizeReferralName(value) ?? '')
    .pipe(z.string().min(1, 'Нэрийг оруулна уу').max(REFERRAL_SOURCE_NAME_MAX, `Нэр ${REFERRAL_SOURCE_NAME_MAX} тэмдэгтээс ихгүй байна`));

export const CreateReferralSourceSchema = z.object({ name: NameSchema }).strict();
export type CreateReferralSourceInput = z.infer<typeof CreateReferralSourceSchema>;

/** Нэр солих, архивлах (`archived: true`) эсвэл сэргээх (`archived: false`). */
export const UpdateReferralSourceSchema = z.object({
    name: NameSchema.optional(),
    archived: z.boolean({ error: 'Архивын төлөвийг зөв заана уу' }).optional(),
}).strict().refine((value) => value.name !== undefined || value.archived !== undefined, 'Өөрчлөх талбар алга');
export type UpdateReferralSourceInput = z.infer<typeof UpdateReferralSourceSchema>;

/** Дээш/доош: төслийн БҮХ сонголтын (архивласан орно) шинэ дараалал, нэг хүсэлтээр. */
export const ReorderReferralSourcesSchema = z.object({
    order: z.array(z.guid({ error: 'Буруу сонголт' }), { error: 'Эрэмбийн жагсаалт буруу' })
        .min(1, 'Эрэмбийн жагсаалт хоосон байна')
        .max(REFERRAL_SOURCE_READ_LIMIT, 'Эрэмбийн жагсаалт буруу')
        .refine((ids) => new Set(ids).size === ids.length, 'Эрэмбийн жагсаалтад сонголт давхардсан байна'),
}).strict();

export const ReferralPresetSchema = z.object({ preset: z.literal('defaults') }).strict();

/** Zod-ийн алдааг хэрэглэгчид харуулах монгол мессеж болгоно. */
export function referralInputError(error: z.ZodError): string {
    const issue = error.issues[0];
    if (!issue) return `«${REFERRAL_FIELD_LABEL}»-ийн мэдээлэл буруу байна`;
    if (issue.code === 'unrecognized_keys') return `Зөвшөөрөгдөөгүй талбар: ${issue.keys.join(', ')}`;
    return /[А-Яа-яЁёӨөҮү]/.test(issue.message) ? issue.message : `«${REFERRAL_FIELD_LABEL}»-ийн мэдээлэл буруу байна`;
}

const LIMIT_ERROR = `Төсөлд ${REFERRAL_SOURCE_ACTIVE_LIMIT}-аас олон идэвхтэй сонголт байж болохгүй. Хэрэглэхгүйг нь архивлана уу.`;

function writeFailure(error: { code?: string; message?: string } | null): ReferralFailure | null {
    if (!error) return null;
    if (error.code === '23505') return failure(409, 'Ийм нэртэй идэвхтэй сонголт байна');
    if (error.code === '23514') return failure(400, `«${REFERRAL_FIELD_LABEL}»-ийн мэдээлэл буруу байна`);
    if (isMissingReferralSchema(error)) return failure(503, REFERRAL_UNAVAILABLE);
    return null;
}

/** Тохиргооны бичилтийн өмнө: бүх сонголт (архивласан орно). Хүснэгт байхгүй бол 503. */
async function loadForWrite(db: SupabaseClient, shopId: string): Promise<ReferralResult<{ sources: ReferralSource[] }>> {
    try {
        const read = await readReferralSources(db, shopId, { includeArchived: true });
        return read.available ? { ok: true, sources: read.sources } : failure(503, REFERRAL_UNAVAILABLE);
    } catch { return failure(503, LOAD_ERROR); }
}

const activeDuplicate = (sources: readonly ReferralSource[], name: string, exceptId?: string) => {
    const key = referralNameKey(name);
    return sources.find((source) => source.id !== exceptId && isActiveReferral(source) && referralNameKey(source.name) === key);
};
const nextSortOrder = (sources: readonly ReferralSource[]) => Math.min(1000, sources.reduce((max, source) => Math.max(max, source.sort_order), 0) + 10);

export async function createReferralSource(
    db: SupabaseClient, shopId: string, input: CreateReferralSourceInput, actorId: string | null,
): Promise<ReferralResult<{ source: ReferralSource }>> {
    const loaded = await loadForWrite(db, shopId);
    if (!loaded.ok) return loaded;
    const duplicate = activeDuplicate(loaded.sources, input.name);
    if (duplicate) return failure(409, `«${duplicate.name}» нэртэй сонголт байна`);
    if (loaded.sources.filter(isActiveReferral).length >= REFERRAL_SOURCE_ACTIVE_LIMIT) return failure(400, LIMIT_ERROR);
    const { data, error } = await db.from('sales_referral_sources').insert({
        shop_id: shopId, name: input.name, sort_order: nextSortOrder(loaded.sources), created_by: actorId,
    }).select(COLUMNS).single();
    const mapped = writeFailure(error);
    if (mapped) return mapped;
    if (error || !data) throw new Error(error?.message ?? 'referral source insert returned no row');
    const source = data as ReferralSource;
    await recordAudit({ shopId, actorId, entity: 'referral_source', entityId: source.id, action: 'create', changes: { name: source.name } });
    return { ok: true, source };
}

export async function updateReferralSource(
    db: SupabaseClient, shopId: string, id: string, patch: UpdateReferralSourceInput, actorId: string | null,
): Promise<ReferralResult<{ source: ReferralSource }>> {
    if (!z.guid().safeParse(id).success) return failure(400, `«${REFERRAL_FIELD_LABEL}» буруу байна`);
    const loaded = await loadForWrite(db, shopId);
    if (!loaded.ok) return loaded;
    const before = loaded.sources.find((source) => source.id === id);
    if (!before) return failure(404, `«${REFERRAL_FIELD_LABEL}» олдсонгүй`);
    const nextName = patch.name ?? before.name;
    const willBeActive = patch.archived === undefined ? isActiveReferral(before) : !patch.archived;
    if (willBeActive) {
        const duplicate = activeDuplicate(loaded.sources, nextName, id);
        if (duplicate) return failure(409, `«${duplicate.name}» нэртэй идэвхтэй сонголт байна`);
        if (!isActiveReferral(before) && loaded.sources.filter(isActiveReferral).length >= REFERRAL_SOURCE_ACTIVE_LIMIT) return failure(400, LIMIT_ERROR);
    }
    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined && patch.name !== before.name) updates.name = patch.name;
    if (patch.archived !== undefined && patch.archived === isActiveReferral(before)) {
        updates.archived_at = patch.archived ? new Date().toISOString() : null;
    }
    if (!Object.keys(updates).length) return { ok: true, source: before };
    const { data, error } = await db.from('sales_referral_sources').update(updates)
        .eq('shop_id', shopId).eq('id', id).select(COLUMNS).maybeSingle();
    const mapped = writeFailure(error);
    if (mapped) return mapped;
    if (error) throw new Error(error.message);
    if (!data) return failure(404, `«${REFERRAL_FIELD_LABEL}» олдсонгүй`);
    const source = data as ReferralSource;
    await recordAudit({
        shopId, actorId, entity: 'referral_source', entityId: id, action: 'update', changes: {
            ...('name' in updates ? { name: { from: before.name, to: source.name } } : {}),
            ...('archived_at' in updates ? { archived: { from: !isActiveReferral(before), to: !isActiveReferral(source) } } : {}),
        },
    });
    return { ok: true, source };
}

/**
 * Нэг шинэ дараалал: 10, 20, … эрэмбийг зөвхөн өөрчлөгдсөн мөрт бичиж, нэг audit үлдээнэ. `order` нь төслийн
 * бүх сонголтыг яг нэг удаа агуулна — өөр хэрэглэгч зэрэг нэмсэн бол 409.
 */
export async function reorderReferralSources(
    db: SupabaseClient, shopId: string, order: readonly string[], actorId: string | null,
): Promise<ReferralResult<{ sources: ReferralSource[] }>> {
    const loaded = await loadForWrite(db, shopId);
    if (!loaded.ok) return loaded;
    const byId = new Map(loaded.sources.map((source) => [source.id, source]));
    if (order.length !== loaded.sources.length || new Set(order).size !== order.length || order.some((id) => !byId.has(id))) {
        return failure(409, 'Жагсаалт өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу.');
    }
    const sources = order.map((id, index) => ({ ...byId.get(id)!, sort_order: Math.min(1000, (index + 1) * 10) }));
    const changes = sources.filter((source) => byId.get(source.id)!.sort_order !== source.sort_order);
    const results = await Promise.all(changes.map((source) => db.from('sales_referral_sources')
        .update({ sort_order: source.sort_order }).eq('shop_id', shopId).eq('id', source.id)));
    const applied = changes.filter((_, index) => !results[index].error);
    if (applied.length) {
        await recordAudit({
            shopId, actorId, entity: 'referral_source', action: 'update',
            changes: { sort_order: Object.fromEntries(applied.map((source) => [source.id, { from: byId.get(source.id)!.sort_order, to: source.sort_order }])) },
        });
    }
    if (applied.length !== changes.length) return failure(503, 'Эрэмбийг бүрэн хадгалж чадсангүй. Дахин оролдоно уу.');
    return { ok: true, sources };
}

/**
 * Санал болгосон жагсаалтаас (W12) байхгүйг нь нэмнэ: ижил нэртэй (архивласан ч) байвал алгасна, идэвхтэй
 * сонголтын хязгаарт багтах хэрээр. Дахин дарахад юу ч нэмэгдэхгүй (idempotent).
 */
export async function addDefaultReferralSources(
    db: SupabaseClient, shopId: string, actorId: string | null,
): Promise<ReferralResult<{ created: ReferralSource[]; skipped: number }>> {
    const loaded = await loadForWrite(db, shopId);
    if (!loaded.ok) return loaded;
    const missing = missingDefaultReferralSources(loaded.sources);
    const room = Math.max(0, REFERRAL_SOURCE_ACTIVE_LIMIT - loaded.sources.filter(isActiveReferral).length);
    const start = nextSortOrder(loaded.sources);
    const rows = missing.slice(0, room).map((name, index) => ({
        shop_id: shopId, name, sort_order: Math.min(1000, start + index * 10), created_by: actorId,
    }));
    if (!rows.length) return { ok: true, created: [], skipped: DEFAULT_REFERRAL_SOURCES.length };
    const { data, error } = await db.from('sales_referral_sources').insert(rows).select(COLUMNS);
    if (error?.code === '23505') return failure(409, 'Сонголт зэрэг нэмэгдсэн байна. Хуудсаа шинэчлээд дахин оролдоно уу.');
    const mapped = writeFailure(error);
    if (mapped) return mapped;
    if (error) throw new Error(error.message);
    const created = ((data ?? []) as ReferralSource[]).sort((a, b) => a.sort_order - b.sort_order);
    await recordAudit({ shopId, actorId, entity: 'referral_source', action: 'create', changes: { preset: 'defaults', names: created.map((source) => source.name) } });
    return { ok: true, created, skipped: DEFAULT_REFERRAL_SOURCES.length - created.length };
}
