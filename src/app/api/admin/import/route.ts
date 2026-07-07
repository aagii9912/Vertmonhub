import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getAdminUser } from '@/lib/admin/auth';
import * as XLSX from 'xlsx';
import {
    ImportRow,
    mapPropertyRow,
    mapLeadRow,
    mapContractRow,
    mapFaqRow,
    buildCompanyKnowledge,
    buildProjectKnowledge,
    buildPaymentPolicyKnowledge,
    buildLoanKnowledge,
    buildAmenitiesKnowledge,
    buildAiExtraEntries,
    knowledgeKey,
    normalizePhoneKey,
    slugifyKey,
    findStaleKnowledgeKeys,
} from '@/lib/admin/import/mappers';

// ============================================
// TYPES
// ============================================

type ImportType =
    | 'properties'
    | 'faq'
    | 'company'
    | 'project'
    | 'payment_policy'
    | 'loan_info'
    | 'amenities'
    | 'ai_extra'
    | 'leads'
    | 'contracts';

const IMPORT_TYPES: ImportType[] = [
    'properties', 'faq', 'company', 'project', 'payment_policy',
    'loan_info', 'amenities', 'ai_extra', 'leads', 'contracts',
];

interface ImportResult {
    success: boolean;
    imported?: number;
    updated?: number;
    skipped?: number;
    errors?: string[];
    message: string;
}

interface ImportContext {
    shopId: string;
    projectId: string | null;
    projectName: string;
}

const MAX_ROWS = 5000;

// ============================================
// POST /api/admin/import
// CSV/Excel файлаас бөөнөөр импортлох.
//
// Өгөгдлийн зам (архитектурын гол шийдвэр):
//   - properties / leads / contracts → тухайн CRM хүснэгтүүд рүү (жинхэнэ багануудаар)
//   - FAQ → shop_faqs (WebhookService.getAIFeatures → DM AI уншдаг)
//   - Мэдлэгийн категориуд → shops.custom_knowledge JSONB (PromptService.buildDynamicKnowledge
//     → DM AI-ийн prompt-д ордог) + ai_knowledge_base (бүтэцлэгдсэн архив, query хийхэд)
//   - projectId → properties/leads/contracts дээр best-effort тамгална,
//     мэдлэгийн түлхүүрүүдийг төслийн нэрээр угтварлана (нэг shop дотор
//     олон төслийн мэдээлэл холилдохгүй)
// ============================================
export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const supabase = supabaseAdmin();

        // super_admin (admins хүснэгт эсвэл RBAC) → зөвшөөрнө; бусад бол admins.permissions.can_import_data шалгана.
        const admin = await getAdminUser();
        if (!admin) {
            return NextResponse.json({ error: 'Админ эрх шаардлагатай' }, { status: 403 });
        }

        let allowed = admin.role === 'super_admin';
        if (!allowed) {
            const { data: permRow } = await supabase
                .from('admins')
                .select('permissions')
                .eq('user_id', userId)
                .eq('is_active', true)
                .maybeSingle();
            allowed = permRow?.permissions?.can_import_data === true;
        }

        if (!allowed) {
            return NextResponse.json({ error: 'Import хийх эрх байхгүй. Super Admin-д хандана уу.' }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;
        const shopId = formData.get('shopId') as string;
        const importType = formData.get('type') as ImportType;
        const projectIdRaw = (formData.get('projectId') as string) || '';
        const projectNameRaw = (formData.get('projectName') as string) || '';

        if (!file || !shopId) {
            return NextResponse.json({ error: 'Файл болон shopId шаардлагатай' }, { status: 400 });
        }

        if (!importType || !IMPORT_TYPES.includes(importType)) {
            return NextResponse.json({ error: 'Буруу import төрөл' }, { status: 400 });
        }

        // shop бодитой эсэхийг шалгана (projects/shops зөрөх, устсан shop руу бичихээс сэргийлнэ)
        const { data: shop, error: shopErr } = await supabase
            .from('shops')
            .select('id')
            .eq('id', shopId)
            .maybeSingle();
        if (shopErr || !shop) {
            return NextResponse.json({ error: 'Shop олдсонгүй' }, { status: 400 });
        }

        // Төслийг сервер талд баталгаажуулна — нэр нь клиентээс биш projects хүснэгтээс.
        let projectId: string | null = null;
        let projectName = projectNameRaw.trim();
        if (projectIdRaw) {
            try {
                const { data: project } = await supabase
                    .from('projects')
                    .select('id, name, shop_id')
                    .eq('id', projectIdRaw)
                    .maybeSingle();
                if (project) {
                    if (project.shop_id !== shopId) {
                        return NextResponse.json(
                            { error: 'Сонгосон төсөл өөр shop-д харьяалагдаж байна' },
                            { status: 400 }
                        );
                    }
                    projectId = project.id;
                    projectName = project.name;
                }
            } catch {
                // projects хүснэгт байхгүй орчинд импортыг унагахгүй — клиентийн нэрээр үргэлжилнэ
            }
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const rows = parseExcel(buffer);

        if (rows.length === 0) {
            return NextResponse.json(
                { success: false, message: 'Файл хоосон байна. Формат шалгана уу.' } satisfies ImportResult,
                { status: 400 }
            );
        }
        if (rows.length > MAX_ROWS) {
            return NextResponse.json(
                { success: false, message: `Хэт олон мөр (${rows.length}). Нэг файлд дээд тал нь ${MAX_ROWS} мөр.` } satisfies ImportResult,
                { status: 400 }
            );
        }

        const ctx: ImportContext = { shopId, projectId, projectName };

        let result: ImportResult;
        switch (importType) {
            case 'properties':
                result = await importProperties(supabase, rows, ctx);
                break;
            case 'faq':
                result = await importFAQ(supabase, rows, ctx);
                break;
            case 'company':
                result = await importCompany(supabase, rows, ctx);
                break;
            case 'project':
                result = await importProject(supabase, rows, ctx);
                break;
            case 'payment_policy':
                result = await importPaymentPolicy(supabase, rows, ctx);
                break;
            case 'loan_info':
                result = await importLoanInfo(supabase, rows, ctx);
                break;
            case 'amenities':
                result = await importAmenities(supabase, rows, ctx);
                break;
            case 'ai_extra':
                result = await importAIExtra(supabase, rows, ctx);
                break;
            case 'leads':
                result = await importLeads(supabase, rows, ctx);
                break;
            case 'contracts':
                result = await importContracts(supabase, rows, ctx);
                break;
        }

        return NextResponse.json(result, { status: result.success ? 200 : 400 });
    } catch (error) {
        return safeErrorResponse(error, 'Import алдаа');
    }
}

// ============================================
// PARSE / DB ТУСЛАХУУД
// ============================================

function parseExcel(buffer: Buffer): ImportRow[] {
    // cellDates: огнооны нүдийг serial тоо биш Date болгож уншина (mappers.toDateStr боловсруулна)
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<ImportRow>(sheet);
}

function errMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : String((error as { message?: string })?.message ?? error);
}

/**
 * Batch insert — migration хараахан хийгдээгүй орчинд optional багана
 * (project_id, notes г.м.) байхгүй бол тухайн баганыг хасаад дахин оролдоно.
 * PostgREST-ийн алдааны мэдэгдэлд байхгүй баганын нэр ордог тул түүгээр таньдаг.
 */
async function insertWithOptionalColumns(
    supabase: ReturnType<typeof supabaseAdmin>,
    table: string,
    rows: Record<string, unknown>[],
    optionalColumns: string[]
): Promise<{ count: number; error?: string }> {
    let currentRows = rows;
    let remaining = [...optionalColumns];

    for (let attempt = 0; attempt <= optionalColumns.length; attempt++) {
        const { data, error } = await supabase.from(table).insert(currentRows).select('id');
        if (!error) return { count: data?.length ?? currentRows.length };

        const msg = errMessage(error);
        const missing = remaining.find(col => msg.includes(`'${col}'`) || msg.includes(`"${col}"`));
        if (!missing) return { count: 0, error: msg };

        remaining = remaining.filter(c => c !== missing);
        currentRows = currentRows.map(r => {
            const { [missing]: _omit, ...rest } = r;
            return rest;
        });
    }

    return { count: 0, error: 'Insert бүтсэнгүй' };
}

/**
 * Давхардал шалгахад одоо байгаа утгуудыг татна. Soft-delete багана
 * байгаа орчинд устгагдсан мөрийг хасна; байхгүй бол энгийнээр татна.
 * PostgREST default 1000 мөрөөр хязгаарладаг тул page-лэн бүрэн татна —
 * эс бөгөөс 1000+ бичлэгтэй shop дээр давхардлын шалгалт дутуу болно.
 */
async function fetchExistingValues(
    supabase: ReturnType<typeof supabaseAdmin>,
    table: string,
    column: string,
    shopId: string
): Promise<Set<string>> {
    const PAGE = 1000;

    async function fetchAll(withSoftDelete: boolean): Promise<string[] | null> {
        const values: string[] = [];
        for (let from = 0; ; from += PAGE) {
            let query = supabase
                .from(table)
                .select(column)
                .eq('shop_id', shopId);
            if (withSoftDelete) query = query.is('deleted_at', null);

            const { data, error } = await query.range(from, from + PAGE - 1);
            if (error) {
                if (withSoftDelete) return null; // deleted_at байхгүй хүснэгт — fallback
                throw new Error(errMessage(error));
            }
            const rows = (data || []) as unknown as Record<string, unknown>[];
            for (const row of rows) {
                const v = row[column];
                if (v !== null && v !== undefined && String(v).trim() !== '') {
                    values.push(String(v).trim());
                }
            }
            if (rows.length < PAGE) break;
        }
        return values;
    }

    const withSoft = await fetchAll(true);
    const all = withSoft ?? await fetchAll(false);
    return new Set(all ?? []);
}

/** Update-уудыг хязгаарлагдсан зэрэгцээгээр гүйцэтгэнэ (Vercel timeout-оос сэргийлнэ) */
async function runChunked<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
    for (let i = 0; i < items.length; i += size) {
        await Promise.all(items.slice(i, i + size).map(fn));
    }
}

/** Migration хийгдсэн эсэхийг нэг probe-оор шалгана (update замд баганыг оруулах эсэхийг шийднэ) */
async function columnExists(
    supabase: ReturnType<typeof supabaseAdmin>,
    table: string,
    column: string
): Promise<boolean> {
    const { error } = await supabase.from(table).select(column).limit(1);
    return !error;
}

/** data-гаас зөвхөн заасан түлхүүрүүдийг түүнэ (update = файлд байсан баганууд л) */
function pickFields(
    data: Record<string, unknown>,
    keys: string[] | undefined,
    exclude: string[]
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of keys || Object.keys(data)) {
        if (exclude.includes(key)) continue;
        if (key in data) out[key] = data[key];
    }
    return out;
}

/**
 * shops.custom_knowledge (JSONB) дээр түлхүүрүүдийг merge хийнэ.
 * Энэ бол DM AI-ийн prompt-д ордог ЖИНХЭНЭ мэдлэгийн сан
 * (PromptService.buildDynamicKnowledge). Хуучин string хэлбэрийг хадгална.
 *
 * reconcile: нэг сэдвийн (ижил suffix) хуучин түлхүүрүүдийг илрүүлж устгана —
 * логик, хамгаалалтууд нь findStaleKnowledgeKeys (mappers.ts)-д.
 */
async function mergeShopCustomKnowledge(
    supabase: ReturnType<typeof supabaseAdmin>,
    shopId: string,
    patch: Record<string, string>,
    reconcile: Array<{ key: string; suffix: string }> = [],
    protectedPrefixes: Set<string> = new Set()
): Promise<string[]> {
    if (Object.keys(patch).length === 0) return [];

    const { data, error } = await supabase
        .from('shops')
        .select('custom_knowledge')
        .eq('id', shopId)
        .maybeSingle();
    if (error) throw new Error(errMessage(error));

    let existing: Record<string, unknown> = {};
    const raw = data?.custom_knowledge;
    if (raw) {
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                existing = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                    ? parsed
                    : { knowledge_legacy: raw };
            } catch {
                existing = { knowledge_legacy: raw };
            }
        } else if (typeof raw === 'object' && !Array.isArray(raw)) {
            existing = raw as Record<string, unknown>;
        }
    }

    const merged: Record<string, unknown> = { ...existing, ...patch };

    const replaced = findStaleKnowledgeKeys(Object.keys(existing), patch, reconcile, protectedPrefixes);
    for (const staleKey of replaced) delete merged[staleKey];

    const { error: upErr } = await supabase
        .from('shops')
        .update({ custom_knowledge: merged })
        .eq('id', shopId);
    if (upErr) throw new Error(errMessage(upErr));

    return replaced;
}

/**
 * ai_knowledge_base руу бүтэцлэгдсэн хуулбар upsert хийнэ (архив/қuery зориулалт).
 * UNIQUE(shop_id, category, key) constraint дээр тулгуурлана.
 */
async function batchUpsertKnowledge(
    supabase: ReturnType<typeof supabaseAdmin>,
    entries: Array<{ shop_id: string; category: string; key: string; value: string; description?: string }>,
    shopId: string,
    category: string
): Promise<{ imported: number; updated: number }> {
    if (entries.length === 0) return { imported: 0, updated: 0 };

    const { data: existingRecords } = await supabase
        .from('ai_knowledge_base')
        .select('key')
        .eq('shop_id', shopId)
        .eq('category', category);

    const existingKeys = new Set<string>((existingRecords || []).map((r: { key: string }) => r.key));
    const updated = entries.filter(e => existingKeys.has(e.key)).length;
    const imported = entries.length - updated;

    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
        const { error } = await supabase
            .from('ai_knowledge_base')
            .upsert(entries.slice(i, i + CHUNK), { onConflict: 'shop_id,category,key' });
        if (error) throw new Error(errMessage(error));
    }

    return { imported, updated };
}

/** Мэдлэгийг хоёр сан руу зэрэг бичнэ: custom_knowledge (AI уншдаг) + ai_knowledge_base (архив) */
async function saveKnowledge(
    supabase: ReturnType<typeof supabaseAdmin>,
    ctx: ImportContext,
    category: string,
    rawItems: Array<{ key: string; text: string; description: string; suffix?: string }>
): Promise<{ imported: number; updated: number; replaced: string[] }> {
    // Нэг batch дотор давхар key байвал upsert "cannot affect row a second time"
    // алдаа өгдөг тул key-ээр dedupe хийнэ (сүүлийн мөр ялна).
    const byKey = new Map<string, { key: string; text: string; description: string; suffix?: string }>();
    for (const item of rawItems) byKey.set(item.key, item);
    const items = [...byKey.values()];

    const patch: Record<string, string> = {};
    for (const item of items) patch[item.key] = item.text;

    const reconcile = items
        .filter(item => item.suffix)
        .map(item => ({ key: item.key, suffix: item.suffix as string }));

    // Жинхэнэ төслүүдийн slug-ууд — тэдгээрийн түлхүүрийг stale гэж андуурч устгахгүй
    let protectedPrefixes = new Set<string>();
    if (reconcile.length > 0) {
        try {
            const { data: projects } = await supabase
                .from('projects')
                .select('name')
                .eq('shop_id', ctx.shopId);
            protectedPrefixes = new Set((projects || []).map(p => slugifyKey(String(p.name))));
        } catch {
            // projects хүснэгтгүй орчинд хамгаалалтгүйгээр (хуучин зан) үргэлжилнэ
        }
    }

    const replaced = await mergeShopCustomKnowledge(supabase, ctx.shopId, patch, reconcile, protectedPrefixes);

    const { imported, updated } = await batchUpsertKnowledge(
        supabase,
        items.map(item => ({
            shop_id: ctx.shopId,
            category,
            key: item.key,
            value: JSON.stringify(item.text),
            description: item.description,
        })),
        ctx.shopId,
        category
    );

    return { imported, updated, replaced };
}

/** Хуучирсан давхар түлхүүр устгасныг мессежид хавсаргана */
function withReplaced(message: string, replaced: string[]): string {
    if (replaced.length === 0) return message;
    return `${message} — хуучирсан давхар түлхүүр устгав: ${replaced.join(', ')}`;
}

function summarize(
    label: string,
    imported: number,
    updated: number,
    skipped: number,
    errors: string[]
): ImportResult {
    const parts = [`${imported} шинэ`];
    if (updated > 0) parts.push(`${updated} шинэчлэгдсэн`);
    if (skipped > 0) parts.push(`${skipped} давхардсан (алгассан)`);
    if (errors.length > 0) parts.push(`${errors.length} алдаа`);
    return {
        success: true,
        imported,
        updated,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
        message: `${label}: ${parts.join(', ')}`,
    };
}

// ============================================
// 1. PROPERTIES — insert + нэрээр дахин импортод update
// ============================================

async function importProperties(
    supabase: ReturnType<typeof supabaseAdmin>,
    rows: ImportRow[],
    ctx: ImportContext
): Promise<ImportResult> {
    const errors: string[] = [];
    const seen = new Set<string>();
    const fresh: Array<Record<string, unknown>> = [];
    const toUpdate: Array<{ name: string; fields: Record<string, unknown> }> = [];

    const [existingNames, hasProjectId, hasDeletedAt] = await Promise.all([
        fetchExistingValues(supabase, 'properties', 'name', ctx.shopId),
        ctx.projectId ? columnExists(supabase, 'properties', 'project_id') : Promise.resolve(false),
        columnExists(supabase, 'properties', 'deleted_at'),
    ]);

    for (let i = 0; i < rows.length; i++) {
        const { data, error, provided } = mapPropertyRow(rows[i], i + 2);
        if (error) { errors.push(error); continue; }
        if (!data) continue;

        if (seen.has(data.name)) {
            errors.push(`Мөр ${i + 2}: "${data.name}" файл дотор давхардсан — эхний мөрийг ашиглав`);
            continue;
        }
        seen.add(data.name);

        if (existingNames.has(data.name)) {
            // Update = зөвхөн файлд байсан баганууд. Бусад талбарыг default-оор
            // дарж устгахгүй (ж: Нэр+Үнэ бүхий үнийн файл зөвхөн үнэ шинэчилнэ).
            const fields = pickFields(data as unknown as Record<string, unknown>, provided, ['name']);
            if (hasProjectId) fields.project_id = ctx.projectId;
            toUpdate.push({ name: data.name, fields });
        } else {
            const record: Record<string, unknown> = { shop_id: ctx.shopId, ...data };
            if (ctx.projectId) record.project_id = ctx.projectId;
            fresh.push(record);
        }
    }

    if (fresh.length === 0 && toUpdate.length === 0) {
        return { success: false, message: 'Оруулах өгөгдөл олдсонгүй', errors };
    }

    let imported = 0;
    if (fresh.length > 0) {
        const { count, error } = await insertWithOptionalColumns(supabase, 'properties', fresh, ['project_id']);
        if (error) return { success: false, message: error, errors };
        imported = count;
    }

    // Дахин импорт = үнэ/статус шинэчлэлт (нэрээр тааруулж update — идемпотент)
    let updated = 0;
    await runChunked(toUpdate, 20, async ({ name, fields }) => {
        let query = supabase
            .from('properties')
            .update(fields)
            .eq('shop_id', ctx.shopId)
            .eq('name', name);
        if (hasDeletedAt) query = query.is('deleted_at', null);
        const { error } = await query;
        if (error) {
            errors.push(`"${name}": шинэчлэхэд алдаа — ${errMessage(error)}`);
        } else {
            updated++;
        }
    });

    return summarize('Үл хөдлөх', imported, updated, 0, errors);
}

// ============================================
// 2. FAQ — shop_faqs руу (DM AI-ийн уншдаг жинхэнэ FAQ сан)
// ============================================

async function importFAQ(
    supabase: ReturnType<typeof supabaseAdmin>,
    rows: ImportRow[],
    ctx: ImportContext
): Promise<ImportResult> {
    const errors: string[] = [];
    const parsed: Array<{ question: string; answer: string }> = [];
    const seen = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
        const { data, error } = mapFaqRow(rows[i], i + 2);
        if (error) { errors.push(error); continue; }
        if (!data) continue;
        if (seen.has(data.question)) continue;
        seen.add(data.question);
        parsed.push(data);
    }

    if (parsed.length === 0) return { success: false, message: 'FAQ олдсонгүй', errors };

    // Одоо байгаа асуултуудтай тааруулж update, шинийг insert (давхар FAQ үүсгэхгүй).
    // PostgREST 1000 мөрөөр хязгаарладаг тул page-лэн бүрэн татна.
    const byQuestion = new Map<string, string>();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
        const { data: existingFaqs, error: exErr } = await supabase
            .from('shop_faqs')
            .select('id, question')
            .eq('shop_id', ctx.shopId)
            .range(from, from + PAGE - 1);
        if (exErr) return { success: false, message: errMessage(exErr), errors };
        for (const f of existingFaqs || []) byQuestion.set(String(f.question).trim(), f.id);
        if (!existingFaqs || existingFaqs.length < PAGE) break;
    }

    const fresh = parsed.filter(p => !byQuestion.has(p.question));
    const toUpdate = parsed.filter(p => byQuestion.has(p.question));

    let imported = 0;
    if (fresh.length > 0) {
        const { data, error } = await supabase
            .from('shop_faqs')
            .insert(fresh.map(p => ({
                shop_id: ctx.shopId,
                question: p.question,
                answer: p.answer,
                is_active: true,
            })))
            .select('id');
        if (error) return { success: false, message: errMessage(error), errors };
        imported = data?.length ?? 0;
    }

    let updated = 0;
    await runChunked(toUpdate, 20, async (p) => {
        const { error } = await supabase
            .from('shop_faqs')
            .update({ answer: p.answer, is_active: true })
            .eq('id', byQuestion.get(p.question)!);
        if (error) {
            errors.push(`"${p.question}": шинэчлэхэд алдаа — ${errMessage(error)}`);
        } else {
            updated++;
        }
    });

    return summarize('FAQ', imported, updated, 0, errors);
}

// ============================================
// 3. КОМПАНИ — custom_knowledge (+ архив)
// ============================================

async function importCompany(
    supabase: ReturnType<typeof supabaseAdmin>,
    rows: ImportRow[],
    ctx: ImportContext
): Promise<ImportResult> {
    const text = buildCompanyKnowledge(rows[0]);
    if (!text) return { success: false, message: 'Компанийн мэдээлэл олдсонгүй' };

    const { imported, updated, replaced } = await saveKnowledge(supabase, ctx, 'company', [{
        key: knowledgeKey(ctx.projectName, 'company_info'),
        text,
        description: 'Компанийн ерөнхий мэдээлэл',
        suffix: 'company_info',
    }]);

    return {
        success: true,
        imported,
        updated,
        message: withReplaced(`Компанийн мэдээлэл AI мэдлэгийн санд орлоо (${imported} шинэ, ${updated} шинэчлэгдсэн)`, replaced),
    };
}

// ============================================
// 4. ТӨСӨЛ — projects хүснэгт (dropdown) + custom_knowledge (+ архив)
// ============================================

async function importProject(
    supabase: ReturnType<typeof supabaseAdmin>,
    rows: ImportRow[],
    ctx: ImportContext
): Promise<ImportResult> {
    const errors: string[] = [];
    const items: Array<{ key: string; text: string; description: string; suffix?: string }> = [];
    let projectRowsUpserted = 0;

    for (let i = 0; i < rows.length; i++) {
        const { data, error } = buildProjectKnowledge(rows[i], i + 2);
        if (error) { errors.push(error); continue; }
        if (!data) continue;

        items.push({
            key: knowledgeKey(data.name, 'overview'),
            text: data.text,
            description: `Төсөл: ${data.name}`,
            suffix: 'overview',
        });

        // projects хүснэгтэд upsert — импортолсон төсөл сонголтын жагсаалтад шууд гарна
        try {
            const { data: existing } = await supabase
                .from('projects')
                .select('id')
                .eq('shop_id', ctx.shopId)
                .eq('name', data.name)
                .maybeSingle();

            if (existing) {
                const { error: upErr } = await supabase
                    .from('projects')
                    .update(data.projectFields)
                    .eq('id', existing.id);
                if (!upErr) projectRowsUpserted++;
            } else {
                const { error: insErr } = await supabase
                    .from('projects')
                    .insert({ shop_id: ctx.shopId, ...data.projectFields });
                if (!insErr) projectRowsUpserted++;
            }
        } catch {
            // projects хүснэгтгүй орчинд мэдлэгийн импортыг унагахгүй
        }
    }

    if (items.length === 0) return { success: false, message: 'Төслийн мэдээлэл олдсонгүй', errors };

    const { imported, updated, replaced } = await saveKnowledge(supabase, ctx, 'projects', items);

    return {
        success: true,
        imported,
        updated,
        errors: errors.length > 0 ? errors : undefined,
        message: withReplaced(`Төслийн мэдээлэл: ${imported} шинэ, ${updated} шинэчлэгдсэн (${projectRowsUpserted} төсөл бүртгэлд орсон)`, replaced),
    };
}

// ============================================
// 5. ТӨЛБӨРИЙН БОДЛОГО — custom_knowledge (+ архив)
// ============================================

async function importPaymentPolicy(
    supabase: ReturnType<typeof supabaseAdmin>,
    rows: ImportRow[],
    ctx: ImportContext
): Promise<ImportResult> {
    const items: Array<{ key: string; text: string; description: string; suffix?: string }> = [];

    for (const row of rows) {
        const { project, text } = buildPaymentPolicyKnowledge(row);
        if (!text) continue;
        const name = project || ctx.projectName;
        items.push({
            key: knowledgeKey(name, 'payment'),
            text,
            description: `Төлбөрийн бодлого${name ? `: ${name}` : ''}`,
            suffix: 'payment',
        });
    }

    if (items.length === 0) return { success: false, message: 'Төлбөрийн мэдээлэл олдсонгүй' };

    const { imported, updated, replaced } = await saveKnowledge(supabase, ctx, 'payment', items);

    return {
        success: true,
        imported,
        updated,
        message: withReplaced(`Төлбөрийн бодлого AI мэдлэгийн санд орлоо (${imported} шинэ, ${updated} шинэчлэгдсэн)`, replaced),
    };
}

// ============================================
// 6. ЗЭЭЛИЙН МЭДЭЭЛЭЛ — custom_knowledge (+ архив)
// ============================================

async function importLoanInfo(
    supabase: ReturnType<typeof supabaseAdmin>,
    rows: ImportRow[],
    ctx: ImportContext
): Promise<ImportResult> {
    const text = buildLoanKnowledge(rows[0]);
    if (!text) return { success: false, message: 'Зээлийн мэдээлэл олдсонгүй' };

    const { imported, updated, replaced } = await saveKnowledge(supabase, ctx, 'loan', [{
        key: knowledgeKey(ctx.projectName, 'loan'),
        text,
        description: 'Зээлийн мэдээлэл',
        suffix: 'loan',
    }]);

    return {
        success: true,
        imported,
        updated,
        message: withReplaced(`Зээлийн мэдээлэл AI мэдлэгийн санд орлоо (${imported} шинэ, ${updated} шинэчлэгдсэн)`, replaced),
    };
}

// ============================================
// 7. ТОХИЛОГ/ОНЦЛОГ — custom_knowledge (+ архив)
// ============================================

async function importAmenities(
    supabase: ReturnType<typeof supabaseAdmin>,
    rows: ImportRow[],
    ctx: ImportContext
): Promise<ImportResult> {
    const byProject = buildAmenitiesKnowledge(rows);
    if (byProject.size === 0) return { success: false, message: 'Тохилог мэдээлэл олдсонгүй' };

    const items: Array<{ key: string; text: string; description: string; suffix?: string }> = [];
    for (const [project, amenities] of byProject) {
        const name = project || ctx.projectName;
        items.push({
            key: knowledgeKey(name, 'amenities'),
            text: amenities.map(a => `- ${a}`).join('\n'),
            description: `Тохилог/Онцлог${name ? `: ${name}` : ''}`,
            suffix: 'amenities',
        });
    }

    const { imported, updated, replaced } = await saveKnowledge(supabase, ctx, 'projects', items);

    return {
        success: true,
        imported,
        updated,
        message: withReplaced(`Тохилог мэдээлэл AI мэдлэгийн санд орлоо (${imported} шинэ, ${updated} шинэчлэгдсэн)`, replaced),
    };
}

// ============================================
// 8. AI НЭМЭЛТ — custom_knowledge (+ архив)
// ============================================

async function importAIExtra(
    supabase: ReturnType<typeof supabaseAdmin>,
    rows: ImportRow[],
    ctx: ImportContext
): Promise<ImportResult> {
    const { entries, errors } = buildAiExtraEntries(rows);
    if (entries.length === 0) return { success: false, message: 'AI мэдээлэл олдсонгүй', errors };

    const { imported, updated, replaced } = await saveKnowledge(
        supabase,
        ctx,
        'ai_extra',
        entries.map(e => ({
            key: knowledgeKey(ctx.projectName, e.key),
            text: e.value,
            description: e.label,
            suffix: e.key,
        }))
    );

    return {
        success: true,
        imported,
        updated,
        errors: errors.length > 0 ? errors : undefined,
        message: withReplaced(`AI мэдээлэл мэдлэгийн санд орлоо (${imported} шинэ, ${updated} шинэчлэгдсэн)`, replaced),
    };
}

// ============================================
// 9. LEADS — leads хүснэгтийн жинхэнэ баганууд, утсаар давхардал шалгана
// ============================================

async function importLeads(
    supabase: ReturnType<typeof supabaseAdmin>,
    rows: ImportRow[],
    ctx: ImportContext
): Promise<ImportResult> {
    const errors: string[] = [];
    const fresh: Array<Record<string, unknown>> = [];
    const seenPhones = new Set<string>();
    let skipped = 0;

    const existingPhonesRaw = await fetchExistingValues(supabase, 'leads', 'customer_phone', ctx.shopId);
    const existingPhones = new Set([...existingPhonesRaw].map(normalizePhoneKey));

    for (let i = 0; i < rows.length; i++) {
        const { data, error } = mapLeadRow(rows[i], i + 2);
        if (error) { errors.push(error); continue; }
        if (!data) continue;

        const phoneKey = normalizePhoneKey(data.customer_phone);

        // CRM-д аль хэдийн байгаа лидийг дарж бичихгүй — pipeline статус нь үнэ цэнтэй.
        // Цифргүй "утас" (хоосон түлхүүр) давхардлын шалгалтад орохгүй — шууд оруулна.
        if (phoneKey) {
            if (existingPhones.has(phoneKey)) { skipped++; continue; }
            if (seenPhones.has(phoneKey)) { skipped++; continue; }
            seenPhones.add(phoneKey);
        }

        const record: Record<string, unknown> = { shop_id: ctx.shopId, ...data };
        if (ctx.projectId) record.project_id = ctx.projectId;
        fresh.push(record);
    }

    if (fresh.length === 0) {
        if (skipped > 0) {
            return summarize('Lead', 0, 0, skipped, errors);
        }
        return { success: false, message: 'Lead олдсонгүй', errors };
    }

    const { count, error } = await insertWithOptionalColumns(supabase, 'leads', fresh, ['project_id']);
    if (error) return { success: false, message: error, errors };

    return summarize('Lead', count, 0, skipped, errors);
}

// ============================================
// 10. CONTRACTS — property_contracts-ийн жинхэнэ баганууд,
//     гэрээний дугаараар давхардал шалгаж, дахин импортод update
// ============================================

async function importContracts(
    supabase: ReturnType<typeof supabaseAdmin>,
    rows: ImportRow[],
    ctx: ImportContext
): Promise<ImportResult> {
    const errors: string[] = [];
    const fresh: Array<Record<string, unknown>> = [];
    const toUpdate: Array<{ contract_number: string; fields: Record<string, unknown> }> = [];
    const seen = new Set<string>();

    const [existingNumbers, hasProjectId, hasNotes] = await Promise.all([
        fetchExistingValues(supabase, 'property_contracts', 'contract_number', ctx.shopId),
        ctx.projectId ? columnExists(supabase, 'property_contracts', 'project_id') : Promise.resolve(false),
        columnExists(supabase, 'property_contracts', 'notes'),
    ]);

    for (let i = 0; i < rows.length; i++) {
        const { data, error, provided } = mapContractRow(rows[i], i + 2);
        if (error) { errors.push(error); continue; }
        if (!data) continue;

        if (seen.has(data.contract_number)) {
            errors.push(`Мөр ${i + 2}: Гэрээний дугаар "${data.contract_number}" файл дотор давхардсан`);
            continue;
        }
        seen.add(data.contract_number);

        if (existingNumbers.has(data.contract_number)) {
            // Update = зөвхөн файлд байсан баганууд — Урьдчилгаа багана байхгүй
            // файл одоо байгаа гэрээний төлбөрийн явцыг 0 болгож дарахгүй.
            const fields = pickFields(data as unknown as Record<string, unknown>, provided, ['contract_number']);
            if (!hasNotes) delete fields.notes;
            if (hasProjectId) fields.project_id = ctx.projectId;
            toUpdate.push({ contract_number: data.contract_number, fields });
        } else {
            const record: Record<string, unknown> = { shop_id: ctx.shopId, ...data };
            if (ctx.projectId) record.project_id = ctx.projectId;
            fresh.push(record);
        }
    }

    if (fresh.length === 0 && toUpdate.length === 0) {
        return { success: false, message: 'Гэрээ олдсонгүй', errors };
    }

    let imported = 0;
    if (fresh.length > 0) {
        const { count, error } = await insertWithOptionalColumns(
            supabase, 'property_contracts', fresh, ['project_id', 'notes']
        );
        if (error) return { success: false, message: error, errors };
        imported = count;
    }

    // Урьдчилгаа баганагүй файл үнэ өөрчилбөл balance хуучин үнээр үлдэхгүй —
    // одоогийн paid_amount-аас дахин тооцно (үнэ ба үлдэгдэл зөрөхөөс сэргийлнэ).
    const needBalance = toUpdate.filter(
        u => u.fields.total_price !== undefined && u.fields.balance === undefined
    );
    if (needBalance.length > 0) {
        const paidByNumber = new Map<string, number>();
        for (let i = 0; i < needBalance.length; i += 200) {
            const nums = needBalance.slice(i, i + 200).map(u => u.contract_number);
            const { data } = await supabase
                .from('property_contracts')
                .select('contract_number, paid_amount')
                .eq('shop_id', ctx.shopId)
                .in('contract_number', nums);
            for (const r of data || []) {
                paidByNumber.set(String(r.contract_number), Number(r.paid_amount) || 0);
            }
        }
        for (const u of needBalance) {
            const paid = paidByNumber.get(u.contract_number) ?? 0;
            u.fields.balance = (u.fields.total_price as number) - paid;
        }
    }

    // Дахин импорт = төлбөрийн явц шинэчлэлт (дугаараар тааруулж update)
    let updated = 0;
    await runChunked(toUpdate, 20, async ({ contract_number, fields }) => {
        const { error } = await supabase
            .from('property_contracts')
            .update(fields)
            .eq('shop_id', ctx.shopId)
            .eq('contract_number', contract_number);
        if (error) {
            errors.push(`"${contract_number}": шинэчлэхэд алдаа — ${errMessage(error)}`);
        } else {
            updated++;
        }
    });

    return summarize('Гэрээ', imported, updated, 0, errors);
}
