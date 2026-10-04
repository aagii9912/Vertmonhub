import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getAdminUser } from '@/lib/admin/auth';
import { readSheetRows, readWorkbookSheets, XlsxUnsupportedFormatError } from '@/lib/utils/xlsx';
import { mapInventoryRows } from '@/lib/admin/import/units';
import { importInventoryUnits, type InventoryImportPreview } from '@/lib/admin/import/units-import';
import { z } from 'zod';
import { fetchAllRows } from '@/lib/utils/pagination';
import { normalizePhone } from '@/lib/utils/phone';
import { soleShopProjectId } from '@/lib/projects/shop-project';
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
    slugifyKey,
    findStaleKnowledgeKeys,
} from '@/lib/admin/import/mappers';

// ============================================
// TYPES
// ============================================

type ImportType =
    | 'units'
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
    'units', 'properties', 'faq', 'company', 'project', 'payment_policy',
    'loan_info', 'amenities', 'ai_extra', 'leads', 'contracts',
];

interface ImportResult {
    success: boolean;
    imported?: number;
    updated?: number;
    skipped?: number;
    errors?: string[];
    message: string;
    preview?: InventoryImportPreview;
}

interface ImportContext {
    shopId: string;
    projectId: string | null;
    projectName: string;
}

const MAX_ROWS = 5000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// ============================================
// POST /api/admin/import
// CSV/Excel файлаас бөөнөөр импортлох.
//
// Өгөгдлийн зам (архитектурын гол шийдвэр):
//   - units → property_units (блокийн нөөц); properties → зурагтай зарын жагсаалт
//   - leads / contracts → тухайн CRM хүснэгтүүд рүү (жинхэнэ багануудаар)
//   - FAQ → shop_faqs (WebhookService.getAIFeatures → DM AI уншдаг)
//   - Мэдлэгийн категориуд → shops.custom_knowledge JSONB (PromptService.buildDynamicKnowledge
//     → DM AI-ийн prompt-д ордог) + ai_knowledge_base (бүтэцлэгдсэн архив, query хийхэд)
//   - projectId → properties/leads/contracts дээр тамгална; scope багана байхгүй бол импорт зогсоно,
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

        // Импорт зөвхөн super_admin-д нээлттэй.
        const admin = await getAdminUser();
        if (!admin) {
            return NextResponse.json({ error: 'Админ эрх шаардлагатай' }, { status: 403 });
        }

        if (admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Import хийх эрх байхгүй. Super Admin-д хандана уу.' }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get('file');
        const shopIdRaw = formData.get('shopId');
        const shopId = typeof shopIdRaw === 'string' ? shopIdRaw.toLowerCase() : shopIdRaw;
        const importType = formData.get('type') as ImportType;
        const projectIdRaw = formData.get('projectId');

        if (!(file instanceof File) || typeof shopId !== 'string' || !z.guid().safeParse(shopId).success) {
            return NextResponse.json({ error: 'Файл болон shopId шаардлагатай' }, { status: 400 });
        }
        if (file.size === 0 || file.size > MAX_FILE_BYTES || !/\.(csv|xlsx)$/i.test(file.name))
            return NextResponse.json({ error: '10 MB-аас бага .csv эсвэл .xlsx файл сонгоно уу' }, { status: 400 });

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
        let projectName = '';
        if (projectIdRaw) {
            if (!z.uuid().safeParse(projectIdRaw).success)
                return NextResponse.json({ error: 'Төслийн ID буруу байна' }, { status: 400 });
            const { data: project, error: projectError } = await supabase
                    .from('projects')
                    .select('id, name, shop_id')
                    .eq('id', projectIdRaw)
                    .maybeSingle();
            if (projectError) return safeErrorResponse(projectError, 'Төсөл шалгахад алдаа гарлаа');
            if (!project) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 400 });
            if (project.shop_id !== shopId) {
                return NextResponse.json({ error: 'Сонгосон төсөл өөр shop-д харьяалагдаж байна' }, { status: 400 });
            }
            projectId = project.id;
            projectName = project.name;
        }

        if (importType === 'units' && !projectId) {
            return NextResponse.json({ error: 'Блокийн байр импортлоход төсөл заавал сонгоно уу' }, { status: 400 });
        }

        const inventoryOptions = z.object({
            preview: z.enum(['true', 'false']).default('false'),
            block: z.string().trim().max(50).default(''),
        }).safeParse({
            preview: formData.get('preview') ?? undefined,
            block: formData.get('block') ?? undefined,
        });
        if (importType === 'units' && !inventoryOptions.success) {
            return NextResponse.json({ error: 'Блок эсвэл урьдчилан шалгах сонголт буруу байна' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        // Inventory IDs such as 00123 must retain their leading zeros in CSV.
        const rows = importType === 'units'
            ? (await readWorkbookSheets(buffer))[0]?.rows ?? []
            : await parseExcel(buffer);

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
            case 'units': {
                const mapped = mapInventoryRows(rows, {
                    shopId, projectId: projectId!, projectName, sourceFile: file.name,
                    block: inventoryOptions.success ? inventoryOptions.data.block || undefined : undefined,
                });
                if (mapped.errors.length) {
                    result = { success: false, imported: 0, message: 'Файлын алдааг засаж дахин шалгана уу. Байр хадгалаагүй.', errors: mapped.errors };
                } else {
                    result = await importInventoryUnits(supabase, mapped.rows, inventoryOptions.success && inventoryOptions.data.preview === 'true');
                }
                break;
            }
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
        if (error instanceof XlsxUnsupportedFormatError) {
            // .xls (Excel 97-2003) — exceljs уншдаггүй; ойлгомжтой 400 (өмнө нь SheetJS уншдаг байсан)
            return NextResponse.json(
                { success: false, message: error.message } satisfies ImportResult,
                { status: 400 }
            );
        }
        return safeErrorResponse(error, 'Import алдаа');
    }
}

// ============================================
// PARSE / DB ТУСЛАХУУД
// ============================================

function parseExcel(buffer: Buffer): Promise<ImportRow[]> {
    // Эхний лист; огнооны нүд serial тоо биш Date болж ирнэ (mappers.toDateStr боловсруулна)
    return readSheetRows(buffer, 0);
}

function errMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : String((error as { message?: string })?.message ?? error);
}

/**
 * Batch insert — migration хараахан хийгдээгүй орчинд optional багана
 * (notes г.м.) байхгүй бол тухайн баганыг хасаад дахин оролдоно. project_id-г хасахгүй.
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
    if (!error) return true;
    if (error.code === '42703' || error.code === 'PGRST204') return false;
    throw new Error(errMessage(error));
}

interface ExistingImportRecord {
    id: string;
    project_id: string | null;
    [key: string]: unknown;
}

/** CRM imports require the project and soft-delete migrations; never broaden a failed scope query. */
async function loadImportRecords(
    supabase: ReturnType<typeof supabaseAdmin>,
    table: string,
    key: string,
    shopId: string,
): Promise<Map<string, ExistingImportRecord[]>> {
    const records = await fetchAllRows((from, to) => supabase.from(table).select(`id, ${key}, project_id`)
        .eq('shop_id', shopId).is('deleted_at', null).order('id').range(from, to)) as unknown as ExistingImportRecord[];
    const byKey = new Map<string, ExistingImportRecord[]>();
    for (const record of records) {
        const value = String(record[key] ?? '').trim();
        if (value) byKey.set(value, [...(byKey.get(value) || []), record]);
    }
    return byKey;
}

function matchImportRecord(
    records: ExistingImportRecord[],
    projectId: string | null,
): { record?: ExistingImportRecord; error?: string } {
    const matches = records.filter((record) => (record.project_id ?? null) === projectId);
    if (matches.length > 1) return { error: 'Ижил түлхүүртэй олон мөр байна. Давхардлыг эхлээд шийдвэрлэнэ үү' };
    if (projectId && records.some((record) => !record.project_id))
        return { error: 'Төсөлд холбогдоогүй хуучин мөр байна. Харьяаллыг эхлээд шийдвэрлэнэ үү' };
    if (!projectId && records.some((record) => record.project_id))
        return { error: 'Энэ түлхүүр төсөлд харьяалагдаж байна. Төслөө сонгоно уу' };
    return { record: matches[0] };
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
        success: imported + updated + skipped > 0,
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
    const toUpdate: Array<{ id: string; name: string; fields: Record<string, unknown> }> = [];
    const existingByName = await loadImportRecords(supabase, 'properties', 'name', ctx.shopId);

    for (let i = 0; i < rows.length; i++) {
        const { data, error, provided } = mapPropertyRow(rows[i], i + 2);
        if (error) { errors.push(error); continue; }
        if (!data) continue;

        if (seen.has(data.name)) {
            errors.push(`Мөр ${i + 2}: "${data.name}" файл дотор давхардсан — эхний мөрийг ашиглав`);
            continue;
        }
        seen.add(data.name);

        const match = matchImportRecord(existingByName.get(data.name) || [], ctx.projectId);
        if (match.error) { errors.push(`Мөр ${i + 2}: "${data.name}": ${match.error}`); continue; }
        if (match.record) {
            // Update = зөвхөн файлд байсан баганууд. Бусад талбарыг default-оор
            // дарж устгахгүй (ж: Нэр+Үнэ бүхий үнийн файл зөвхөн үнэ шинэчилнэ).
            const fields = pickFields(data as unknown as Record<string, unknown>, provided, ['name']);
            toUpdate.push({ id: match.record.id, name: data.name, fields });
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
        const { count, error } = await insertWithOptionalColumns(supabase, 'properties', fresh, []);
        if (error) return { success: false, message: error, errors };
        imported = count;
    }

    // Баталгаажуулсан active мөрийн ID + project scope-оор үнэ/статус шинэчилнэ.
    let updated = 0;
    await runChunked(toUpdate, 20, async ({ id, name, fields }) => {
        let query = supabase
            .from('properties')
            .update(fields)
            .eq('id', id)
            .eq('shop_id', ctx.shopId)
            .eq('name', name)
            .is('deleted_at', null);
        query = ctx.projectId ? query.eq('project_id', ctx.projectId) : query.is('project_id', null);
        const { data, error } = await query.select('id');
        if (error) {
            errors.push(`"${name}": шинэчлэхэд алдаа — ${errMessage(error)}`);
        } else if (data?.length !== 1) {
            errors.push(`"${name}": мөр эсвэл төслийн харьяалал өөрчлөгдсөн. Дахин импортлоно уу`);
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
    let existingFaqs: Array<{ id: string; question: string }>;
    try {
        existingFaqs = await fetchAllRows((from, to) => supabase
            .from('shop_faqs').select('id, question').eq('shop_id', ctx.shopId).order('id').range(from, to));
    } catch (error) {
        return { success: false, message: errMessage(error), errors };
    }
    const byQuestion = new Map(existingFaqs.map((f) => [String(f.question).trim(), f.id]));

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

            // Shop = төсөл: өөр нэртэй мөр ирвэл дэд төсөл үүсгэхгүй, ажлын орчны ганц төслийг шинэчилнэ (нэрийг нь хадгална).
            const sole = existing ? null : await soleShopProjectId(supabase, ctx.shopId);
            if (existing || sole) {
                // Файлд байгаа талбарыг л шинэчилнэ — хоосон баганаар одоогийн мэдээллийг арчихгүй.
                const fields = Object.fromEntries(Object.entries(data.projectFields)
                    .filter(([key, value]) => value !== null && value !== undefined && (existing || key !== 'name')));
                const { error: upErr } = await supabase
                    .from('projects')
                    .update(fields)
                    .eq('id', existing?.id ?? sole!);
                if (!upErr) projectRowsUpserted++;
                else errors.push(`Мөр ${i + 2}: төслийн мэдээлэл шинэчлэгдсэнгүй`);
                if (!existing && !upErr) errors.push(`Мөр ${i + 2}: «${data.name}» нэрийг шинэ төсөл болгоогүй — энэ ажлын орчны төслийн мэдээллийг шинэчлэв`);
            } else {
                const { error: insErr } = await supabase
                    .from('projects')
                    .insert({ shop_id: ctx.shopId, ...data.projectFields });
                if (!insErr) projectRowsUpserted++;
                else errors.push(`Мөр ${i + 2}: «${data.name}» төслийг бүртгэж чадсангүй`);
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

    // +976 / зай / зураастай хадгалсан дугаар ч ижил түлхүүрт буулгана.
    const existingLeads = await fetchAllRows<{ customer_phone: string | null }>((from, to) => supabase
        .from('leads').select('customer_phone').eq('shop_id', ctx.shopId).is('deleted_at', null).order('id').range(from, to));
    const existingPhones = new Set(existingLeads.map((lead) => normalizePhone(lead.customer_phone)));

    for (let i = 0; i < rows.length; i++) {
        const { data, error } = mapLeadRow(rows[i], i + 2);
        if (error) { errors.push(error); continue; }
        if (!data) continue;

        const phoneKey = normalizePhone(data.customer_phone);

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

    const { count, error } = await insertWithOptionalColumns(supabase, 'leads', fresh, []);
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
    const toUpdate: Array<{ id: string; contract_number: string; fields: Record<string, unknown>; paidAmount?: number | null }> = [];
    const seen = new Set<string>();

    const [existingByNumber, hasNotes] = await Promise.all([
        loadImportRecords(supabase, 'property_contracts', 'contract_number', ctx.shopId),
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

        const existing = existingByNumber.get(data.contract_number) || [];
        const match = matchImportRecord(existing, ctx.projectId);
        if (match.error) { errors.push(`Мөр ${i + 2}: "${data.contract_number}": ${match.error}`); continue; }
        if (match.record) {
            // Existing receipts and imported advance snapshots are never rewritten by a spreadsheet.
            const fields = pickFields(data as unknown as Record<string, unknown>, provided,
                ['contract_number', 'prepayment_paid', 'paid_amount', 'balance']);
            if (!hasNotes) delete fields.notes;
            toUpdate.push({ id: match.record.id, contract_number: data.contract_number, fields });
        } else {
            // Active contract numbers are unique across a shop, including other projects.
            if (existing.length) {
                errors.push(`Мөр ${i + 2}: "${data.contract_number}" өөр төсөлд бүртгэлтэй байна`);
                continue;
            }
            const record: Record<string, unknown> = { shop_id: ctx.shopId, ...data };
            if (ctx.projectId) record.project_id = ctx.projectId;
            fresh.push(record);
        }
    }

    if (fresh.length === 0 && toUpdate.length === 0) {
        return { success: false, message: 'Гэрээ олдсонгүй', errors };
    }

    // Resolve every paid total before any insert/write; failed reads cannot become a zero balance input.
    if (toUpdate.length > 0) {
        const paidById = new Map<string, number | null>();
        for (let i = 0; i < toUpdate.length; i += 200) {
            const ids = toUpdate.slice(i, i + 200).map(u => u.id);
            let query = supabase
                .from('property_contracts')
                .select('id, paid_amount')
                .eq('shop_id', ctx.shopId)
                .is('deleted_at', null)
                .in('id', ids);
            query = ctx.projectId ? query.eq('project_id', ctx.projectId) : query.is('project_id', null);
            const { data, error } = await query;
            if (error) throw new Error(`Төлсөн дүн уншихад алдаа: ${errMessage(error)}`);
            for (const r of data || []) {
                if (r.paid_amount !== null && (!Number.isFinite(Number(r.paid_amount)) || Number(r.paid_amount) < 0))
                    return { success: false, message: 'Гэрээний төлсөн дүн буруу байна', errors };
                paidById.set(r.id, r.paid_amount === null ? null : Number(r.paid_amount));
            }
        }
        for (const u of toUpdate) {
            if (!paidById.has(u.id)) return { success: false, message: 'Гэрээ эсвэл төслийн харьяалал өөрчлөгдсөн. Дахин импортлоно уу', errors };
            u.paidAmount = paidById.get(u.id)!;
            u.fields.balance = Math.max(0, (u.fields.total_price as number) - (u.paidAmount ?? 0));
        }
    }

    let imported = 0;
    if (fresh.length > 0) {
        const { count, error } = await insertWithOptionalColumns(supabase, 'property_contracts', fresh, ['notes']);
        if (error) return { success: false, message: error, errors };
        imported = count;
    }

    let updated = 0;
    await runChunked(toUpdate, 20, async ({ id, contract_number, fields, paidAmount }) => {
        let query = supabase
            .from('property_contracts')
            .update(fields)
            .eq('id', id)
            .eq('shop_id', ctx.shopId)
            .eq('contract_number', contract_number)
            .is('deleted_at', null);
        query = ctx.projectId ? query.eq('project_id', ctx.projectId) : query.is('project_id', null);
        // A concurrent receipt must win; retry rather than overwrite its freshly computed balance.
        query = paidAmount === null ? query.is('paid_amount', null) : query.eq('paid_amount', paidAmount);
        const { data, error } = await query.select('id');
        if (error) {
            errors.push(`"${contract_number}": шинэчлэхэд алдаа — ${errMessage(error)}`);
        } else if (data?.length !== 1) {
            errors.push(`"${contract_number}": гэрээ эсвэл төлбөр өөрчлөгдсөн. Дахин импортлоно уу`);
        } else {
            updated++;
        }
    });

    return summarize('Гэрээ', imported, updated, 0, errors);
}
