/**
 * Гэрээний жагсаалтын (ERP «HUB», 16 багана) импорт — сервер тал. Route-ийн хаалтын (contracts + erp-imports
 * бичих, хязгааргүй хэрэглэгч, shop-ийн ганц төсөл) дараа дуудагдана.
 *
 * Урьдчилан харах: файл задлах → төслийн байр, гэрээ, шилжүүлэг, төлбөртэй гэрээ, сүүлийн импортыг уншиж
 * (`fetchAllRows`) төлөвлөгөө гаргана (`planContractListImport`), hash = sha256(`{reportDate, ops}`).
 * Батлах: ижил хүсэлтийн ID хадгалагдсан бол түүнийг буцаана (хариу алдагдсан давталт); үгүй бол төлөвлөгөөг
 * дахин тооцоолж, hash зөрвөл 409 `stale_preview`; зөрчил, шалгаагүй өөрчлөлт, хуучин файл → 400; дараа нь
 * `import_contract_list` RPC нэг гүйлгээнд бичнэ (төлсөн дүн, үлдэгдэлд хүрэхгүй).
 */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readWorkbookSheets, XlsxUnsupportedFormatError } from '@/lib/utils/xlsx';
import { ERP_LIMITS } from '@/lib/erp/import';
import { fetchAllRows } from '@/lib/utils/pagination';
import { logger } from '@/lib/utils/logger';
import { loadTransferredContractIds } from '@/lib/services/ContractService';
import { isMissingContractListSchema, readLatestContractListImport, type LatestContractListImport } from '@/lib/contracts/live';
import {
    CONTRACT_LIST_CONTRACT_FIELDS, CONTRACT_LIST_UNIT_FIELDS, contractListConflictMessage, parseContractList, planContractListImport,
    type ContractListContract, type ContractListImportPlan, type ContractListParse, type ContractListUnit,
} from '@/lib/contracts/list-import';

/** RPC нэг удаад 10,000 мөр, өөрчлөлт хүлээн авна. */
const RPC_ROW_LIMIT = 10000;
const MIGRATION_MISSING = 'Гэрээний импортын шинэ migration ороогүй байна. Системийн админд мэдэгдэнэ үү.';
const STALE = 'Өгөгдөл өөрчлөгдсөн, дахин шалгана уу';

export interface ContractListImportContext {
    db: SupabaseClient;
    shopId: string;
    /** Shop-ийн ганц төсөл (`soleShopProjectId`) — шинэ гэрээнд бичигдэнэ. */
    projectId: string;
    userId: string;
    /** Түүхэнд харагдах нэр (менежерийн канон нэр эсвэл профайлын нэр). */
    userName: string | null;
}
export interface ContractListImportFile { name: string; buffer: ArrayBuffer }
export interface ContractListImportResult { status: number; body: Record<string, unknown> }
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): ContractListImportResult => ({ status, body: { error, ...extra } });

class ImportUnavailable extends Error {}

const isMissingSchema = isMissingContractListSchema;

/** Файлын төрөл, хэмжээ ERP импортын дүрмээр (`erp-imports`); .xls → тайлбартай алдаа. */
async function readSheets(file: ContractListImportFile) {
    if (!file.buffer.byteLength || file.buffer.byteLength > ERP_LIMITS.bytes || !/\.(xlsx|csv|tsv)$/i.test(file.name)) {
        if (/\.xls$/i.test(file.name)) throw new Error(new XlsxUnsupportedFormatError('.xls').message);
        throw new Error('4 MB хүртэл .xlsx, .csv эсвэл .tsv файл сонгоно уу');
    }
    let sheets: Awaited<ReturnType<typeof readWorkbookSheets>>;
    try {
        sheets = await readWorkbookSheets(file.buffer);
    } catch (error) {
        if (error instanceof XlsxUnsupportedFormatError) throw new Error(error.message);
        throw new Error('Файл уншиж чадсангүй. Excel (.xlsx) эсвэл CSV файл эсэхийг шалгана уу');
    }
    if (!sheets.length) throw new Error('Файлд толгой мөртэй мэдээлэл алга');
    if (sheets.length > ERP_LIMITS.sheets || sheets.reduce((total, sheet) => total + sheet.rows.length, 0) > ERP_LIMITS.rows) {
        throw new Error('Нэг файл 30 sheet, 20,000 мөрөөс ихгүй байна');
    }
    return sheets;
}

interface ImportState {
    units: ContractListUnit[];
    contracts: ContractListContract[];
    transferredIds: Set<string>;
    paymentContractIds: Set<string>;
    latest: LatestContractListImport | null;
}

async function loadState(db: SupabaseClient, shopId: string): Promise<ImportState> {
    const guard = async <T>(read: () => Promise<T>): Promise<T> => {
        try { return await read(); } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (isMissingSchema({ message })) throw new ImportUnavailable(message);
            throw error;
        }
    };
    const [units, contracts, transferredIds, schedules, ledger, latest] = await Promise.all([
        guard(() => fetchAllRows<ContractListUnit>((from, to) => db.from('property_units').select(CONTRACT_LIST_UNIT_FIELDS)
            .eq('shop_id', shopId).order('id').range(from, to))),
        guard(() => fetchAllRows<ContractListContract>((from, to) => db.from('property_contracts').select(CONTRACT_LIST_CONTRACT_FIELDS)
            .eq('shop_id', shopId).is('deleted_at', null).order('id').range(from, to))),
        loadTransferredContractIds(db, shopId),
        guard(() => fetchAllRows<{ contract_id: string | null }>((from, to) => db.from('payment_schedules').select('contract_id')
            .eq('shop_id', shopId).order('id').range(from, to))),
        // Кассын дэвтэр (санхүүгийн UI хасагдсан ч хүснэгт, төлөлт үлдсэн) — байхгүй орчинд алгасна.
        fetchAllRows<{ contract_id: string | null }>((from, to) => db.from('finance_transactions').select('contract_id')
            .eq('shop_id', shopId).not('contract_id', 'is', null).order('id').range(from, to))
            .catch(error => {
                const message = error instanceof Error ? error.message : String(error);
                if (isMissingSchema({ message })) return [];
                throw error;
            }),
        readLatestContractListImport(db, shopId).then(result => {
            if (!result.available) throw new ImportUnavailable('contract_list_imports');
            return result.latest;
        }),
    ]);
    const paymentContractIds = new Set([...schedules, ...ledger].map(row => row.contract_id).filter((id): id is string => !!id));
    return { units, contracts, transferredIds, paymentContractIds, latest };
}

interface BuiltPlan { parse: ContractListParse; plan: ContractListImportPlan; hash: string; latest: LatestContractListImport | null }

async function buildPlan(ctx: ContractListImportContext, file: ContractListImportFile, reportDate: string): Promise<BuiltPlan | ContractListImportResult> {
    let parse: ContractListParse;
    try {
        parse = parseContractList(await readSheets(file), { reportDate });
    } catch (error) {
        return fail(400, error instanceof Error ? error.message : 'Файл уншиж чадсангүй');
    }
    if (!parse.found) return fail(400, parse.errors[0] ?? 'HUB загварын файл биш байна');
    if (parse.errors.length) return fail(400, `Файлд ${parse.errors.length} алдаа байна — засаад дахин оруулна уу`, { errors: parse.errors });
    if (!parse.rows.length) return fail(400, 'Импортлох мөр алга', { skipped: parse.skipped });
    if (parse.rows.length > RPC_ROW_LIMIT) return fail(400, 'Нэг импорт 10,000 мөрөөс ихгүй байна');
    let state: ImportState;
    try {
        state = await loadState(ctx.db, ctx.shopId);
    } catch (error) {
        if (error instanceof ImportUnavailable) return fail(503, MIGRATION_MISSING);
        throw error;
    }
    const plan = planContractListImport({
        rows: parse.rows, units: state.units, contracts: state.contracts, transferredIds: state.transferredIds,
        paymentContractIds: state.paymentContractIds, latestImportDate: state.latest?.report_date ?? null,
        reportDate, fileName: file.name,
    });
    if (plan.errors.length) return fail(400, `Файлд ${plan.errors.length} алдаа байна — засаад дахин оруулна уу`, { errors: plan.errors });
    if (plan.ops.length > RPC_ROW_LIMIT) return fail(400, 'Нэг импорт 10,000 өөрчлөлтөөс ихгүй байна');
    return { parse, plan, hash: createHash('sha256').update(plan.canonical).digest('hex'), latest: state.latest };
}

const isResult = (value: BuiltPlan | ContractListImportResult): value is ContractListImportResult => 'status' in value;

/** Урьдчилан харах: өөрчлөлтийн жагсаалт + батлахад илгээх `planHash`. Юу ч бичихгүй. */
export async function previewContractListImport(ctx: ContractListImportContext, file: ContractListImportFile, options: { reportDate: string }): Promise<ContractListImportResult> {
    const built = await buildPlan(ctx, file, options.reportDate);
    if (isResult(built)) return built;
    const { parse, plan, hash, latest } = built;
    const { ops, canonical: _canonical, rows: _rows, summary: _summary, ...view } = plan;
    return {
        status: 200,
        body: {
            ...view,
            sheetName: parse.sheetName,
            rowCount: parse.rows.length,
            extraColumns: parse.extraColumns,
            ignoredColumns: parse.ignoredColumns,
            skipped: parse.skipped,
            latestImport: latest,
            planHash: hash,
            opsCount: ops.length,
            canCommit: ops.length > 0 && plan.blocking.length === 0,
        },
    };
}

export interface ContractListCommitOptions {
    reportDate: string;
    requestId: string;
    planHash: string;
    acceptReview: boolean;
    allowOlder: boolean;
}

/** Батлах: урьдчилан харсан төлөвлөгөөтэй яг ижил бол RPC-ээр нэг гүйлгээнд хадгална. */
export async function commitContractListImport(ctx: ContractListImportContext, file: ContractListImportFile, options: ContractListCommitOptions): Promise<ContractListImportResult> {
    // Хариу алдагдсаны дараах давталт: хадгалсан импортыг буцаана (дахин тооцоолбол «бүгд хэвээр» болж 409 өгнө).
    const stored = await ctx.db.from('contract_list_imports').select('id,plan_hash,summary')
        .eq('shop_id', ctx.shopId).eq('request_id', options.requestId).maybeSingle();
    if (stored.error) {
        if (isMissingSchema(stored.error)) return fail(503, MIGRATION_MISSING);
        throw new Error(`Гэрээний импортын түүх уншиж чадсангүй: ${stored.error.message}`);
    }
    if (stored.data) {
        if (stored.data.plan_hash !== options.planHash) return fail(409, 'Энэ хүсэлтээр өөр импорт бүртгэгдсэн байна. Файлаа дахин шалгана уу', { code: 'request_reused' });
        const summary = (stored.data.summary ?? {}) as Record<string, unknown>;
        return { status: 200, body: { ok: true, replayed: true, import_id: stored.data.id, inserted: summary.inserted ?? 0, updated: summary.updated ?? 0, summary } };
    }

    const built = await buildPlan(ctx, file, options.reportDate);
    if (isResult(built)) return built;
    const { parse, plan, hash } = built;
    if (hash !== options.planHash) return fail(409, STALE, { code: 'stale_preview' });
    if (plan.blocking.length) return fail(400, 'Зөрчилтэй мөр байгаа тул батлах боломжгүй', { code: 'blocking', blocking: plan.blocking });
    if (!plan.ops.length) return fail(400, 'Бүгд хэвээр — өөрчлөх зүйлгүй', { code: 'no_changes' });
    if (plan.review.length && !options.acceptReview) {
        return fail(400, 'Дүн, төлөв өөрчлөгдөх гэрээг шалгасан гэдгээ баталгаажуулна уу', { code: 'review_required' });
    }
    if (plan.olderThanLatest && !options.allowOlder) {
        return fail(400, `Сүүлийн импорт ${plan.olderThanLatest}-ны файлаар хийгдсэн. Хуучин файл оруулахаа баталгаажуулна уу`, { code: 'older_file', latest: plan.olderThanLatest });
    }

    const { data, error } = await ctx.db.rpc('import_contract_list', {
        p_shop_id: ctx.shopId,
        p_project_id: ctx.projectId,
        p_report_date: options.reportDate,
        p_file_name: file.name.slice(0, 255),
        p_request_id: options.requestId,
        p_plan_hash: hash,
        p_rows: plan.rows,
        p_ops: plan.ops,
        p_summary: { ...plan.summary, sheet: parse.sheetName, rowCount: parse.rows.length, skipped: parse.skipped.length,
            extraColumns: parse.extraColumns, ignoredColumns: parse.ignoredColumns },
        p_allow_older: options.allowOlder,
        p_actor: ctx.userId,
        p_actor_name: ctx.userName?.slice(0, 255) ?? null,
    });
    if (error) {
        if (error.code === '42883' || error.code === 'PGRST202') return fail(503, MIGRATION_MISSING);
        if (error.code === '23505') return fail(409, 'Энэ хүсэлтээр өөр импорт бүртгэгдсэн байна. Файлаа дахин шалгана уу', { code: 'request_reused' });
        if (error.code === '40001') return fail(409, STALE, { code: 'stale_preview' });
        if (error.code === '42501') return fail(403, 'Гэрээний импортын эрх алга');
        if (error.code?.startsWith('22')) return fail(400, error.message || 'Импортын өгөгдөл буруу байна');
        logger.error('[ContractListImport] import_contract_list failed', { code: error.code, message: error.message });
        return fail(500, 'Импортыг хадгалж чадсангүй. Ижил хүсэлтээр дахин оролдоно уу.');
    }
    const result = (data ?? {}) as Record<string, unknown>;
    if (result.ok === false) {
        if (result.code === 'older_file') {
            return fail(409, `Энэ хооронд ${String(result.latest)}-ны файлаар импорт хийгдсэн. Дахин шалгана уу`, { code: 'older_file', latest: result.latest });
        }
        const conflicts = Array.isArray(result.conflicts) ? (result.conflicts as Array<Record<string, unknown>>) : [];
        return fail(409, STALE, {
            code: 'conflicts',
            conflicts: conflicts.map(conflict => ({ ...conflict, message: contractListConflictMessage(String(conflict.code ?? '')) })),
        });
    }
    return { status: result.replayed === true ? 200 : 201, body: { ...result, reportDate: options.reportDate } };
}
