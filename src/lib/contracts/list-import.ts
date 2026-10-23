/**
 * ERP-ийн «HUB» гэрээний жагсаалтын (16 багана) импорт — файл задлах, байр олох, DB-тэй тулгаж өөрчлөлтийн
 * төлөвлөгөө гаргах. Цэвэр (DB, Node API-гүй), клиентэд аюулгүй: ERP импортын хуудас HUB файлыг танихад
 * (`isContractListSheet`), сервер (`ContractListImportService`) урьдчилан харах ба батлахад нэг дүрмээр.
 *
 * Эзэмшигчийн шийдвэр (2026-10-22):
 *  • «Захиалга өгсөн огноо» нь order_date БА contract_date хоёуланд.
 *  • Төлсөн дүн, үлдэгдэл, урьдчилгааны төлөлтийг ХЭЗЭЭ Ч бичихгүй; шинэ гэрээ paid_amount/balance = NULL.
 *  • Эзэмшигч солихгүй («Гэрээ шилжүүлэх»); Нэр/Овог зөвхөн хоосон, «Нэр.Овог» = customer_name, Hub-д
 *    шилжүүлээгүй гэрээнд бөглөгдөнө.
 *  • Байрны төлөв (property_units) өөрчлөгдөхгүй — зөрүүг жагсаана. Файлд байхгүй гэрээ хэвээр, жагсаана.
 *
 * Тулгалт байраар (`${product_type}|${unit_label}`): идэвхтэй/хаасан мөр ↔ амьд гэрээ (ижил огноо эхэлж,
 * дараа нь шинэ ↔ шинэ); цуцалсан мөр ↔ цуцалсан гэрээ огноогоор; цуцалсан мөртэй ижил огноотой амьд гэрээ
 * цуцлагдана (шалгах; байр дахин зарагдсан бол шинэ мөр шинэ гэрээ болно); байранд амьд мөр байхгүй бол үлдсэн
 * цуцалсан мөр амьд гэрээг цуцална (шалгах). Нэг байранд хоёр амьд гэрээ үүсгэхгүй.
 */
import { CONTRACT_LIST_COLUMNS, HUB_STATUS_LABEL, HUB_TYPE_LABEL, dbFloor, hubContractStatus, hubProductType } from '@/lib/contracts/list-format';
import { contractUnitColumns, pricePerSqmOrNull, roundMoney } from '@/lib/erp/product-contracts';
import { erpNumber } from '@/lib/erp/records';
import { toDateStr } from '@/lib/admin/import/mappers';
import { unitStatusLabel, type InventoryCategory } from '@/lib/inventory/labels';
import { ubDateStr } from '@/lib/utils/date';

// ---------------------------------------------------------------- Файл задлах

/** Нэмэлтээр танигдах багана (гэрээнд төлсөн дүн ХЭЗЭЭ Ч бичигдэхгүй — зөвхөн мөрийн түүхэнд). */
export const CONTRACT_LIST_EXTRA_COLUMNS = ['Гэрээний дугаар', 'Борлуулалтын менежер', 'Нийт төлсөн дүн'] as const;
const ERROR_LIMIT = 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ContractListStatus = 'active' | 'closed' | 'cancelled';

/** Файлын нэг мөр (нормчилсон). Мөнгө центээр, талбай 2 оронтой, давхар DB-ийн хэлбэрээр ("01"). */
export interface HubRow {
    /** Sheet-ийн мөрийн дугаар (толгой = 1). */
    row: number;
    productType: InventoryCategory;
    block: string;
    /** «Тоот» текстээр (тоо → бүхэл тоо). */
    unitNumber: string;
    floor: string | null;
    model: string | null;
    area: number | null;
    prepaymentCondition: string | null;
    /** Файлын «М.кв үнэ» (зогсоол/агуулахад нэгжийн үнэ байж болно — 1%-ийн дүрмээр шүүнэ). */
    pricePerSqm: number | null;
    total: number;
    prepaymentDue: number | null;
    overdue: number | null;
    orderDate: string;
    status: ContractListStatus;
    firstName: string | null;
    lastName: string | null;
    paymentCondition: string | null;
    contractNumber: string | null;
    salesManager: string | null;
    /** «Нийт төлсөн дүн» — ирээдүйн мөнгөн урсгалын зөрүүнд хадгална, гэрээнд бичихгүй. */
    paidTotal: number | null;
}

export interface ContractListSheet { name: string; columns: string[]; rows: Record<string, unknown>[] }

export interface ContractListParse {
    /** HUB-ийн 16 баганатай sheet олдсон эсэх. */
    found: boolean;
    sheetName: string | null;
    rows: HubRow[];
    errors: string[];
    /** Таньсан нэмэлт багана (Гэрээний дугаар, Борлуулалтын менежер, Нийт төлсөн дүн). */
    extraColumns: string[];
    /** Импортлохгүй багана. */
    ignoredColumns: string[];
    /** Импортлоогүй мөр («Тоот шилжсэн», байрны мэдээлэлгүй мөр). */
    skipped: Array<{ row: number; reason: string }>;
}

const cleanHeader = (value: string) => value.trim().replace(/\s+/g, ' ');

/** HUB-ийн 16 багана бүгд байгаа эсэх (толгойн зай хамаагүй). ERP импортын хуудас үүгээр таньж чиглүүлнэ. */
export function isContractListSheet(columns: readonly string[]): boolean {
    const present = new Set(columns.map(cleanHeader));
    return CONTRACT_LIST_COLUMNS.every(column => present.has(column));
}

function cellText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
    if (value instanceof Date) return null;
    const text = String(value).trim().replace(/\s+/g, ' ');
    return text || null;
}

type NumberCell = { value: number | null } | { invalid: true };
/** Excel-ийн тоог шууд (−1.49e-8 зэрэг); текстийг `erpNumber`-ээр («452,400,000»). «-» (0-ийн нягтлан формат) = 0. */
function cellNumber(value: unknown): NumberCell {
    if (value === null || value === undefined || value === '') return { value: null };
    if (typeof value === 'number') return Number.isFinite(value) ? { value } : { invalid: true };
    if (typeof value !== 'string') return { invalid: true };
    const text = value.trim();
    if (!text) return { value: null };
    if (/^-+$/.test(text)) return { value: 0 };
    const parsed = erpNumber(text);
    return parsed === null ? { invalid: true } : { value: parsed };
}

/** Мөнгө: хөвөгч таслалын үлдэгдэл (|v| < 0.005) → 0; бусад сөрөг → алдаа; центээр бөөрөнхийлнө. */
function nonNegativeMoney(value: number | null): number | null | 'negative' {
    if (value === null) return null;
    if (Math.abs(value) < 0.005) return 0;
    if (value < 0) return 'negative';
    return roundMoney(value);
}

/**
 * HUB файлыг задлана. 16 баганатай эхний sheet-ийг сонгоно; мөрийн алдаа нэг ч байвал файл бүхэлдээ
 * амжилтгүй (бүх алдааг мөрийн дугаартай буцаана). `reportDate` өгвөл захиалгын огноо түүнээс хойш биш.
 */
export function parseContractList(sheets: readonly ContractListSheet[], options: { reportDate?: string } = {}): ContractListParse {
    const sheet = sheets.find(s => isContractListSheet(s.columns));
    if (!sheet) {
        const best = [...sheets].sort((a, b) => matchCount(b.columns) - matchCount(a.columns))[0];
        const present = new Set((best?.columns ?? []).map(cleanHeader));
        const missing = CONTRACT_LIST_COLUMNS.filter(column => !present.has(column));
        return {
            found: false, sheetName: null, rows: [], extraColumns: [], ignoredColumns: [], skipped: [],
            errors: [`Файлд HUB загварын 16 баганатай sheet олдсонгүй. Дутуу багана: ${missing.join(', ')}`],
        };
    }
    const keyOf = new Map<string, string>();
    for (const column of sheet.columns) {
        const clean = cleanHeader(column);
        if (!keyOf.has(clean)) keyOf.set(clean, column);
    }
    const known = new Set<string>([...CONTRACT_LIST_COLUMNS, ...CONTRACT_LIST_EXTRA_COLUMNS]);
    const extraColumns = CONTRACT_LIST_EXTRA_COLUMNS.filter(column => keyOf.has(column));
    const ignoredColumns = [...keyOf.keys()].filter(column => !known.has(column) && !column.startsWith('__EMPTY'));
    const get = (row: Record<string, unknown>, column: string) => {
        const key = keyOf.get(column);
        return key === undefined ? undefined : row[key];
    };

    const errors: string[] = [];
    const rows: HubRow[] = [];
    const skipped: ContractListParse['skipped'] = [];
    sheet.rows.forEach((source, index) => {
        const rowNumber = index + 2;
        const rowErrors: string[] = [];
        const fail = (message: string) => rowErrors.push(`Мөр ${rowNumber}: ${message}`);
        const typeText = cellText(get(source, 'Төрөл'));
        const block = cellText(get(source, 'Блок'));
        const toothRaw = get(source, 'Тоот');
        const tooth = typeof toothRaw === 'number' && Number.isInteger(toothRaw) ? String(toothRaw) : cellText(toothRaw);
        if (!typeText && !block && !tooth) {
            skipped.push({ row: rowNumber, reason: 'Байрны мэдээлэлгүй мөр (нийлбэр эсвэл хоосон) — алгассан' });
            return;
        }
        const statusText = cellText(get(source, 'Төлөв'));
        const status = hubContractStatus(statusText);
        if (status === 'transferred') {
            skipped.push({ row: rowNumber, reason: 'Тоот шилжсэн — импортлохгүй' });
            return;
        }
        // Огноогүй мөр (ж: огноогүй гэрээний экспорт) — гэрээг хөндөхгүй, «Файлд байхгүй»-д үлдэнэ.
        const dateRaw = get(source, 'Захиалга өгсөн огноо');
        if (!(dateRaw instanceof Date) && !cellText(dateRaw)) {
            skipped.push({ row: rowNumber, reason: 'Захиалга өгсөн огноо хоосон — импортлохгүй (гэрээ хэвээр)' });
            return;
        }
        if (!statusText) fail('«Төлөв» хоосон');
        else if (!status) fail(`«${statusText}» төлөв танигдсангүй (Гэрээ үүссэн / Гэрээ хаасан / Цуцлагдсан)`);
        const productType = hubProductType(typeText);
        if (!typeText) fail('«Төрөл» хоосон');
        else if (!productType) fail(`«${typeText}» төрөл танигдсангүй`);
        if (!block) fail('«Блок» хоосон');
        if (!tooth) fail('«Тоот» хоосон');

        const number = (column: string): number | null => {
            const parsed = cellNumber(get(source, column));
            if ('invalid' in parsed) { fail(`«${column}» тоо биш байна`); return null; }
            return parsed.value;
        };
        const money = (column: string): number | null => {
            const value = nonNegativeMoney(number(column));
            if (value === 'negative') { fail(`«${column}» сөрөг байж болохгүй`); return null; }
            return value;
        };
        const areaRaw = number('Гэрээлсэн талбай');
        if (areaRaw !== null && areaRaw < 0) fail('«Гэрээлсэн талбай» сөрөг байж болохгүй');
        const pricePerSqm = money('М.кв үнэ');
        const total = money('Нийт дүн');
        if (total === null || total <= 0) fail('«Нийт дүн» хоосон эсвэл 0');
        const prepaymentDue = money('Урьдчилгааны дүн');
        const overdue = money('Төлбөр хоцролт');
        const paidTotal = extraColumns.includes('Нийт төлсөн дүн') ? money('Нийт төлсөн дүн') : null;

        const orderDate = toDateStr(typeof dateRaw === 'string' ? dateRaw.trim() : dateRaw);
        if (!orderDate) fail(`«Захиалга өгсөн огноо» буруу (${cellText(dateRaw) ?? 'огноо'})`);
        else if (options.reportDate && orderDate > options.reportDate) fail(`захиалгын огноо ${orderDate} файлын огнооноос (${options.reportDate}) хойш байна`);

        if (rowErrors.length) { errors.push(...rowErrors); return; }
        rows.push({
            row: rowNumber,
            productType: productType!,
            block: block!,
            unitNumber: tooth!,
            floor: dbFloor(get(source, 'Давхар')),
            model: cellText(get(source, 'Загвар')),
            area: areaRaw === null ? null : Math.round(areaRaw * 100) / 100,
            prepaymentCondition: cellText(get(source, 'Урьдчилгааны нөхцөл')),
            pricePerSqm,
            total: total!,
            prepaymentDue,
            overdue,
            orderDate: orderDate!,
            status: status as ContractListStatus,
            firstName: cellText(get(source, 'Нэр')),
            lastName: cellText(get(source, 'Овог')),
            paymentCondition: cellText(get(source, 'Захиалгын нөхцөл')),
            contractNumber: cellText(get(source, 'Гэрээний дугаар')),
            salesManager: cellText(get(source, 'Борлуулалтын менежер')),
            paidTotal,
        });
    });
    return { found: true, sheetName: sheet.name, rows: errors.length ? [] : rows, errors: capErrors(errors), extraColumns, ignoredColumns, skipped };
}

function matchCount(columns: readonly string[]): number {
    const present = new Set(columns.map(cleanHeader));
    return CONTRACT_LIST_COLUMNS.filter(column => present.has(column)).length;
}

function capErrors(errors: string[]): string[] {
    return errors.length > ERROR_LIMIT ? [...errors.slice(0, ERROR_LIMIT), `… бас ${errors.length - ERROR_LIMIT} алдаа`] : errors;
}

// ---------------------------------------------------------------- Байр олох

/** `property_units`-ийн тулгалтад хэрэгтэй баганууд. */
export interface ContractListUnit {
    code: string;
    category: string;
    block: string | null;
    floor: string | null;
    model: string | null;
    unit_number: string | null;
    legacy_unit_number: string | null;
    status?: string | null;
}
export const CONTRACT_LIST_UNIT_FIELDS = 'code,category,block,floor,model,unit_number,legacy_unit_number,status';

export type ContractListUnitIndex = Map<string, ContractListUnit[]>;

/** «Б1-19 (B1)» → «Б1-19». */
const baseCode = (code: string) => code.replace(/\s*\([^)]*\)\s*$/, '').trim();
const sameText = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
const typeLabel = (type: string | null | undefined) => (type && Object.hasOwn(HUB_TYPE_LABEL, type) ? HUB_TYPE_LABEL[type] : type) || '';

/** Нэгжийг `${ангилал}|${дагаваргүй код}`-оор бүлэглэнэ. */
export function indexContractListUnits(units: readonly ContractListUnit[]): ContractListUnitIndex {
    const index: ContractListUnitIndex = new Map();
    for (const unit of units) {
        if (!unit.code) continue;
        const key = `${unit.category}|${baseCode(unit.code)}`;
        const list = index.get(key);
        if (list) list.push(unit); else index.set(key, [unit]);
    }
    return index;
}

/**
 * Мөрийн байр: ангилал = «Төрөл», код = `${Блок}-${Тоот}` эсвэл `${Блок}-${Тоот} (…)`. Олон таарвал давхраар,
 * дараа нь загвараар шүүнэ. Яг нэг → байр; үгүй бол мөрийн алдаа.
 */
export function resolveContractUnit(
    row: Pick<HubRow, 'row' | 'productType' | 'block' | 'unitNumber' | 'floor' | 'model'>,
    units: readonly ContractListUnit[] | ContractListUnitIndex,
): { unit: ContractListUnit } | { error: string } {
    const index = units instanceof Map ? units : indexContractListUnits(units);
    const code = `${row.block}-${row.unitNumber}`;
    const name = `${typeLabel(row.productType)} ${code}`;
    let candidates = (index.get(`${row.productType}|${code}`) ?? []).filter(unit => unit.code === code || unit.code.startsWith(`${code} (`));
    if (candidates.length > 1) candidates = candidates.filter(unit => dbFloor(unit.floor) === row.floor);
    if (candidates.length > 1) candidates = candidates.filter(unit => sameText(unit.model, row.model));
    if (candidates.length === 1) return { unit: candidates[0] };
    const all = index.get(`${row.productType}|${code}`) ?? [];
    if (all.length > 1) return { error: `Мөр ${row.row}: ${name} — давхар/загвараар нэг байр тодорхойгүй (${all.map(unit => unit.code).join(', ')})` };
    return { error: `Мөр ${row.row}: ${name} байр олдсонгүй` };
}

// ---------------------------------------------------------------- Төлөвлөгөө

/** Төлөвлөгөөнд хэрэгтэй гэрээний баганууд (numeric нь PostgREST-ээс тоо эсвэл текст). */
export interface ContractListContract {
    id: string;
    product_type: string | null;
    unit_label: string | null;
    block_name: string | null;
    unit_number: string | null;
    legacy_unit_number: string | null;
    contract_status: string | null;
    order_date: string | null;
    contract_date: string | null;
    total_price: number | string | null;
    price_per_sqm: number | string | null;
    contracted_area: number | string | null;
    prepayment_condition: string | null;
    prepayment_due: number | string | null;
    payment_condition: string | null;
    overdue_amount: number | string | null;
    overdue_as_of: string | null;
    customer_name: string | null;
    customer_first_name: string | null;
    customer_last_name: string | null;
    contract_number: string | null;
    sales_manager: string | null;
    paid_amount: number | string | null;
}
// Нэг литерал мөр (supabase-js select-ийн төрлийг задлахад).
export const CONTRACT_LIST_CONTRACT_FIELDS = 'id,product_type,unit_label,block_name,unit_number,legacy_unit_number,contract_status,order_date,contract_date,total_price,price_per_sqm,contracted_area,prepayment_condition,prepayment_due,payment_condition,overdue_amount,overdue_as_of,customer_name,customer_first_name,customer_last_name,contract_number,sales_manager,paid_amount';

/** RPC `import_contract_list`-ийн update-ийн зөвшөөрөгдсөн талбар (SQL-ийн allow-list-тэй ижил). */
export type ContractListField = 'order_date' | 'contract_date' | 'payment_condition' | 'prepayment_condition' | 'prepayment_due'
    | 'total_price' | 'price_per_sqm' | 'contracted_area' | 'overdue_amount' | 'overdue_as_of' | 'contract_status'
    | 'customer_first_name' | 'customer_last_name' | 'contract_number' | 'sales_manager';

export const CONTRACT_LIST_FIELD_LABEL: Record<ContractListField, string> = {
    order_date: 'Захиалга өгсөн огноо',
    contract_date: 'Гэрээний огноо',
    payment_condition: 'Захиалгын нөхцөл',
    prepayment_condition: 'Урьдчилгааны нөхцөл',
    prepayment_due: 'Урьдчилгааны дүн',
    total_price: 'Нийт дүн',
    price_per_sqm: 'М.кв үнэ',
    contracted_area: 'Гэрээлсэн талбай',
    overdue_amount: 'Төлбөр хоцролт',
    overdue_as_of: 'Хоцролтын огноо',
    contract_status: 'Төлөв',
    customer_first_name: 'Нэр',
    customer_last_name: 'Овог',
    contract_number: 'Гэрээний дугаар',
    sales_manager: 'Борлуулалтын менежер',
};
/** «Шинэчлэгдэх» бүлгийн дараалал (UI). */
const FIELD_ORDER = Object.keys(CONTRACT_LIST_FIELD_LABEL) as ContractListField[];
const MONEY_FIELDS = new Set<ContractListField>(['total_price', 'price_per_sqm', 'prepayment_due', 'prepayment_condition']);

type Value = string | number | null;
export type ContractListOp =
    | { op: 'update'; id: string; set: Partial<Record<ContractListField, Value>>; expect: Partial<Record<ContractListField | 'customer_name', Value>>; label: string; review: boolean }
    | { op: 'insert'; fields: Record<string, Value>; label: string; review: boolean };

export interface ContractListChange { field: ContractListField; label: string; from: Value; to: Value }
export interface ContractListReviewItem { contractId: string; label: string; row: number; changes: ContractListChange[] }
export interface ContractListUpdateGroup { field: ContractListField; label: string; count: number; items: Array<{ contractId: string; label: string; from: Value; to: Value }> }
export interface ContractListInsertItem { label: string; row: number; status: ContractListStatus; orderDate: string; total: number; name: string | null }
export interface ContractListMissingItem { contractId: string; label: string; status: string | null; orderDate: string | null; total: number | null; undated: boolean }
export interface ContractListUnitMismatch { label: string; unitStatus: string | null; unitStatusLabel: string; kind: 'live_on_free' | 'cancelled_on_sold' }
export type ContractListInfoCode = 'holder_differs' | 'holder_transferred' | 'erp_transferred';
export interface ContractListInfoItem { code: ContractListInfoCode; label: string; row: number; message: string; fileName?: string | null; currentName?: string | null; contractId?: string }
export type ContractListBlockingCode = 'paid_known' | 'has_payments' | 'unlinked' | 'unit_taken' | 'duplicate_contract_number';
export interface ContractListBlockingItem { code: ContractListBlockingCode; label: string; row: number | null; message: string; contractId?: string }
export interface ContractListFileTotal { status: ContractListStatus; label: string; rows: number; total: number; prepaymentDue: number; overdue: number }
export interface ContractListCounts { insert: number; insertCancelled: number; update: number; unchanged: number; review: number; blocking: number; missing: number }
/** contract_list_imports.rows-д хадгалах нормчилсон мөр (нэмэлт багана орно). */
export type ContractListStoredRow = HubRow & { unitLabel: string | null };

export interface ContractListImportPlan {
    reportDate: string;
    fileName: string | null;
    /** Файл/байр/огнооны алдаа — байвал батлахгүй. */
    errors: string[];
    ops: ContractListOp[];
    /** sha256-ийн оролт: `{reportDate, ops}`-ийн түлхүүр эрэмбэлсэн JSON (hash-ийг сервер тооцно). */
    canonical: string;
    counts: ContractListCounts;
    fileTotals: ContractListFileTotal[];
    units: { distinct: number; resold: number };
    review: ContractListReviewItem[];
    updates: ContractListUpdateGroup[];
    inserts: ContractListInsertItem[];
    missing: ContractListMissingItem[];
    /** Импортын дараа огноогүй үлдэх амьд гэрээ (файлд байхгүй). */
    stillUndated: number;
    unitStatusMismatches: ContractListUnitMismatch[];
    info: ContractListInfoItem[];
    blocking: ContractListBlockingItem[];
    /** Сүүлийн импортоос хуучин файл бол тэр импортын огноо (батлахад allowOlder шаардлагатай). */
    olderThanLatest: string | null;
    rows: ContractListStoredRow[];
    /** RPC-ийн p_summary (нэргүй): тоо, файлын нийлбэр. */
    summary: Record<string, unknown>;
}

export interface ContractListPlanInput {
    rows: readonly HubRow[];
    units: readonly ContractListUnit[];
    /** Төслийн устгаагүй бүх гэрээ (fetchAllRows). */
    contracts: readonly ContractListContract[];
    /** «Гэрээ шилжүүлэх»-ээр эзэмшигч солигдсон гэрээ (contract_transfers). */
    transferredIds: ReadonlySet<string>;
    /** Төлбөрийн хуваарь эсвэл кассын гүйлгээтэй гэрээ — цуцлахгүй. */
    paymentContractIds: ReadonlySet<string>;
    latestImportDate: string | null;
    reportDate: string;
    fileName?: string | null;
    /** Өнөөдөр (UB) — тестэд. */
    today?: string;
}

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const moneyOf = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    return roundMoney(typeof value === 'number' ? value : Number(value));
};
const areaOf = (value: unknown): number | null => {
    const n = moneyOf(value);
    return n === null ? null : Math.round(n * 100) / 100;
};
const dateOf = (value: unknown): string | null => {
    const match = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null;
    return match ? match[1] : null;
};
const isLive = (status: string | null | undefined) => status !== 'cancelled';
const effectiveDate = (contract: { order_date?: string | null; contract_date?: string | null }) => dateOf(contract.order_date) ?? dateOf(contract.contract_date);
/** Нэрийг харьцуулах: зай, цэгийн орчмын зай, том жижиг үсэг хамаагүй. */
const nameKey = (value: string | null | undefined) => (value ?? '').trim().replace(/\s*\.\s*/g, '.').replace(/\s+/g, ' ').toLowerCase();
const joinName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join('.') || null;
const unitKeyOf = (type: string | null | undefined, label: string | null | undefined) => {
    const code = label?.split(',')[0].trim();
    return type && code ? `${type}|${code}` : null;
};
const displayLabel = (type: string | null | undefined, code: string) => (type === 'residential' ? code : `${typeLabel(type)} ${code}`.trim());
function contractLabel(contract: ContractListContract): string {
    const code = contract.unit_label?.split(',')[0].trim()
        || [contract.block_name, contract.legacy_unit_number ?? contract.unit_number].filter(Boolean).join('-')
        || contract.id.slice(0, 8);
    return displayLabel(contract.product_type, code);
}
const byDateDesc = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? 1 : -1);

/** Тулгалтад хэрэгтэй файлын мөр, гэрээний хэсэг (импорт ба «Нийт төлсөн дүн» хоёулаа). */
interface PairRow { row: number; orderDate: string; status: ContractListStatus }
interface PairContract { id: string; contract_status?: string | null; order_date?: string | null; contract_date?: string | null }

/**
 * Нэг байрны файлын мөр ↔ гэрээний тулгалтын нийтлэг алхмууд. Импорт (`planContractListImport`) ба HUB-ийн «Нийт
 * төлсөн дүн» (`hubPaidByContract`) энэ нэг дүрмийг хэрэглэнэ — хуулбар дүрэм зөрдөг. Огноо = order_date ?? contract_date.
 *  1. амьд мөр ↔ амьд гэрээ, цуцалсан мөр ↔ цуцалсан гэрээ ижил огноогоор;
 *  2. үлдсэн цуцалсан мөр ↔ ижил огноотой амьд гэрээ («Тоот шилжсэн» биш) = тэр гэрээ цуцлагдаж байр дахин зарагдсан
 *     (шинэ мөрийг түүнд оноохгүй — оновол хуучин эзэмшигчийн гэрээ шинэ худалдааны огноо, дүнг авна);
 *  3. үлдсэн амьд мөр ↔ үлдсэн амьд гэрээ: шинэ ↔ шинэ.
 * Үлдсэн мөрийг (`liveExtra`, `cancelledUnmatched`) импорт цааш шийднэ (шинэ гэрээ, буцаан идэвхжүүлэх, огноогүй гэрээ).
 */
function pairUnitRows<R extends PairRow, C extends PairContract>(unitRows: readonly R[], db: readonly C[]) {
    const rows = [...unitRows].sort((a, b) => byDateDesc(a.orderDate, b.orderDate) || a.row - b.row);
    const byEffectiveDate = (a: C, b: C) => byDateDesc(effectiveDate(a), effectiveDate(b)) || a.id.localeCompare(b.id);
    const liveRows = rows.filter(row => row.status !== 'cancelled');
    const cancelledRows = rows.filter(row => row.status === 'cancelled');
    const liveDb = db.filter(contract => isLive(contract.contract_status)).sort(byEffectiveDate);
    const cancelledDb = db.filter(contract => !isLive(contract.contract_status)).sort(byEffectiveDate);
    const pairs: Array<{ row: R; contract: C }> = [];
    const pairedIds = new Set<string>();
    const take = (row: R, contract: C) => { pairs.push({ row, contract }); pairedIds.add(contract.id); };
    const free = (list: readonly C[]) => list.filter(contract => !pairedIds.has(contract.id));

    const liveLeft: R[] = [];
    for (const row of liveRows) {
        const match = free(liveDb).find(contract => effectiveDate(contract) === row.orderDate);
        if (match) take(row, match); else liveLeft.push(row);
    }
    const cancelledLeft: R[] = [];
    for (const row of cancelledRows) {
        const match = free(cancelledDb).find(contract => effectiveDate(contract) === row.orderDate);
        if (match) take(row, match); else cancelledLeft.push(row);
    }
    const cancelledUnmatched: R[] = [];
    for (const row of cancelledLeft) {
        const match = free(liveDb).find(contract => contract.contract_status !== 'transferred' && effectiveDate(contract) === row.orderDate);
        if (match) take(row, match); else cancelledUnmatched.push(row);
    }
    const liveExtra: R[] = [];
    for (const row of liveLeft) {
        const next = free(liveDb)[0];
        if (next) take(row, next); else liveExtra.push(row);
    }
    return { pairs, take, free, liveRows, liveDb, cancelledDb, liveExtra, cancelledUnmatched };
}

/** Түлхүүрийг эрэмбэлсэн JSON — ижил төлөвлөгөө ижил hash. */
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).filter(key => record[key] !== undefined).sort()
            .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

/** RPC-ийн зөрчлийн код → монгол тайлбар (урьдчилан харсны дараа өгөгдөл өөрчлөгдсөн үед). */
export function contractListConflictMessage(code: string): string {
    switch (code) {
        case 'missing': return 'Гэрээ устгагдсан эсвэл олдсонгүй';
        case 'changed': return 'Урьдчилан харсны дараа гэрээ өөрчлөгдсөн';
        case 'paid_known': return 'Төлсөн дүн бүртгэлтэй — дүн, нөхцлийг импорт өөрчлөхгүй';
        case 'name_filled': return 'Нэр, овог аль хэдийн бөглөгдсөн';
        case 'holder_transferred': return 'Эзэмшигч «Гэрээ шилжүүлэх»-ээр солигдсон — нэр хэвээр';
        case 'already_set': return 'Гэрээний дугаар/менежер аль хэдийн бүртгэгдсэн';
        case 'transferred': return '«Тоот шилжсэн» гэрээний төлвийг импорт өөрчлөхгүй';
        case 'has_payments': return 'Төлбөртэй (хуваарь, төлөлттэй) гэрээг импортоор цуцлахгүй';
        case 'unit_taken': return 'Байранд өөр идэвхтэй гэрээ байна';
        default: return 'Импортын зөрчил';
    }
}

interface Pair { row: HubRow; contract: ContractListContract }

/**
 * Файлын мөрүүдийг төслийн байр, гэрээтэй тулгаж RPC-ийн өөрчлөлт (ops) ба урьдчилан харах жагсаалтуудыг гаргана.
 * Мөнгөн дүн, огноог өөрчлөх (DB-д утгатай) нь «Шалгах шаардлагатай»; хоосон талбар бөглөх, хоцролт, нөхцөл,
 * хаасан төлөв автоматаар. Төлсөн дүн мэдэгдэж буй гэрээний дүн, төлбөртэй гэрээг цуцлах, холбоогүй гэрээ,
 * нэг байранд хоёр амьд гэрээ — батлахыг хаана.
 */
export function planContractListImport(input: ContractListPlanInput): ContractListImportPlan {
    const { reportDate, transferredIds, paymentContractIds } = input;
    const today = input.today ?? ubDateStr();
    const errors: string[] = [];
    if (!DATE.test(reportDate)) errors.push('Файлын огноо буруу байна');
    else if (reportDate > today) errors.push(`Файлын огноо (${reportDate}) өнөөдрөөс хойш байж болохгүй`);
    const latestOrder = input.rows.reduce<string | null>((max, row) => (!max || row.orderDate > max ? row.orderDate : max), null);
    if (latestOrder && DATE.test(reportDate) && reportDate < latestOrder) {
        errors.push(`Файлын огноо (${reportDate}) файлын хамгийн сүүлийн захиалгын огнооноос (${latestOrder}) өмнө байна`);
    }

    // 1. Байр олох.
    const unitIndex = indexContractListUnits(input.units);
    const knownUnits = new Set(input.units.map(unit => `${unit.category}|${unit.code}`));
    const unitOf = new Map<string, ContractListUnit>();
    const fileByUnit = new Map<string, HubRow[]>();
    const unitLabelOfRow = new Map<number, string>();
    for (const row of input.rows) {
        const resolved = resolveContractUnit(row, unitIndex);
        if ('error' in resolved) { errors.push(resolved.error); continue; }
        const key = `${resolved.unit.category}|${resolved.unit.code}`;
        unitOf.set(key, resolved.unit);
        unitLabelOfRow.set(row.row, resolved.unit.code);
        const list = fileByUnit.get(key);
        if (list) list.push(row); else fileByUnit.set(key, [row]);
    }

    // 2. DB-ийн гэрээг байраар; байртай холбоогүй (код хоосон/танихгүй) амьд гэрээ тусдаа.
    const contractsByUnit = new Map<string, ContractListContract[]>();
    const unlinked: ContractListContract[] = [];
    for (const contract of input.contracts) {
        const key = unitKeyOf(contract.product_type, contract.unit_label);
        if (key && knownUnits.has(key)) {
            const list = contractsByUnit.get(key);
            if (list) list.push(contract); else contractsByUnit.set(key, [contract]);
        } else if (isLive(contract.contract_status)) {
            unlinked.push(contract);
        }
    }

    const ops: ContractListOp[] = [];
    const review: ContractListReviewItem[] = [];
    const autoChanges: Array<ContractListChange & { contractId: string; unitLabel: string }> = [];
    const inserts: ContractListInsertItem[] = [];
    const info: ContractListInfoItem[] = [];
    const blocking: ContractListBlockingItem[] = [];
    // Тулгагдсан эсвэл хаагдсан (холбоогүй) гэрээ — «Файлд байхгүй»-д орохгүй.
    const accounted = new Set<string>();
    const finalLive = new Map<string, boolean>();
    // Импорт бичих гэрээний дугаар (хоосныг бөглөх, шинэ гэрээ) — давхардлыг доор шалгана.
    const numberWrites: Array<{ number: string; row: number; label: string; contractId?: string }> = [];
    let unchanged = 0;
    const notes = `Гэрээний жагсаалт «${input.fileName?.trim() || 'HUB'}» (${reportDate})-аас импортолсон.`;

    const unitKeys = [...fileByUnit.keys()].sort();
    for (const key of unitKeys) {
        const unit = unitOf.get(key)!;
        const rows = [...fileByUnit.get(key)!].sort((a, b) => byDateDesc(a.orderDate, b.orderDate) || a.row - b.row);
        const label = displayLabel(unit.category, unit.code);
        const db = contractsByUnit.get(key) ?? [];

        // Байртай холбоогүй гэрээ энэ байрных байж магадгүй — давхар гэрээ үүсгэхгүйн тулд хаана.
        const sample = rows[0];
        const orphans = unlinked.filter(contract => (!contract.product_type || contract.product_type === unit.category)
            && ((sameText(contract.block_name, sample.block)
                && sameText(textOrNull(contract.legacy_unit_number) ?? (contract.unit_number !== '0' ? textOrNull(contract.unit_number) : null), sample.unitNumber))
                || (!!contract.unit_label && baseCode(contract.unit_label.split(',')[0]) === `${sample.block}-${sample.unitNumber}`)));
        if (orphans.length) {
            for (const contract of [...orphans, ...db]) accounted.add(contract.id);
            for (const contract of orphans) {
                blocking.push({ code: 'unlinked', label, row: sample.row, contractId: contract.id,
                    message: `Байртай холбоогүй гэрээ (${contractLabel(contract)}) — гэрээний байрыг «${unit.code}» болгож засаад дахин оруулна уу` });
            }
            continue;
        }

        // Ижил огноо, дахин зарагдсан байр, шинэ ↔ шинэ (`pairUnitRows`, «Нийт төлсөн дүн»-тэй нэг дүрэм).
        const { pairs, take, free, liveRows, liveDb, cancelledDb, liveExtra, cancelledUnmatched } = pairUnitRows<HubRow, ContractListContract>(rows, db);
        // Байранд тулгагдсан амьд мөр бий эсэх.
        let liveOnUnit = liveRows.length > liveExtra.length;
        const insertRows: HubRow[] = [];
        for (const row of liveExtra) {
            if (liveOnUnit) {
                blocking.push({ code: 'unit_taken', label, row: row.row,
                    message: `Мөр ${row.row}: байранд өөр идэвхтэй гэрээ байна — нэг байранд хоёр идэвхтэй гэрээ үүсгэхгүй` });
                continue;
            }
            // Ижил огноотой цуцалсан гэрээ = буцаан идэвхжүүлэх (шалгах); эс бөгөөс шинэ гэрээ.
            const revived = free(cancelledDb).find(contract => effectiveDate(contract) === row.orderDate);
            if (revived) take(row, revived); else insertRows.push(row);
            liveOnUnit = true;
        }

        // Үлдсэн цуцалсан мөр ↔ огноогүй цуцалсан гэрээ дарааллаар.
        const cancelledExtra: HubRow[] = [];
        for (const row of cancelledUnmatched) {
            const undated = free(cancelledDb).find(contract => effectiveDate(contract) === null);
            if (undated) take(row, undated); else cancelledExtra.push(row);
        }
        // Байранд амьд мөр алга: үлдсэн цуцалсан мөр огноогүй амьд гэрээг цуцална (ERP «Тоот шилжсэн» гэрээг биш).
        // Өөр огноотой амьд гэрээ өөр худалдаа — цуцлахгүй, «Файлд байхгүй»-д үлдэнэ (ижил огноотойг дээр тулгасан).
        for (const row of cancelledExtra) {
            const target = liveRows.length ? undefined
                : free(liveDb).find(contract => contract.contract_status !== 'transferred' && effectiveDate(contract) === null);
            if (target) take(row, target); else insertRows.push(row);
        }

        // Харьцуулалт.
        for (const pair of pairs) {
            accounted.add(pair.contract.id);
            const diff = diffPair(pair, { label, reportDate, transferred: transferredIds.has(pair.contract.id),
                hasPayments: paymentContractIds.has(pair.contract.id) });
            info.push(...diff.info);
            blocking.push(...diff.blocking);
            const fields = Object.keys(diff.set) as ContractListField[];
            if (!fields.length) { unchanged++; continue; }
            ops.push({ op: 'update', id: pair.contract.id, set: diff.set, expect: diff.expect, label, review: diff.review.length > 0 });
            if (typeof diff.set.contract_number === 'string') numberWrites.push({ number: diff.set.contract_number, row: pair.row.row, label, contractId: pair.contract.id });
            if (diff.review.length) review.push({ contractId: pair.contract.id, label, row: pair.row.row, changes: diff.review });
            for (const change of diff.auto) autoChanges.push({ ...change, contractId: pair.contract.id, unitLabel: label });
        }
        for (const row of insertRows) {
            const fields = insertFields(row, unit, reportDate, notes);
            ops.push({ op: 'insert', fields, label, review: false });
            if (typeof fields.contract_number === 'string') numberWrites.push({ number: fields.contract_number, row: row.row, label });
            inserts.push({ label, row: row.row, status: row.status, orderDate: row.orderDate, total: row.total, name: fields.customer_name as string | null });
        }
        // Импортын дараах байдал (байрны төлвийн зөрүүнд): амьд мөр, эсвэл файлд байхгүй хэвээр үлдэх амьд гэрээ.
        finalLive.set(key, liveOnUnit || free(liveDb).length > 0);
    }

    // Гэрээний дугаар төсөлд давтагдахгүй (uq_contracts_shop_number, цуцалсан гэрээ ч тооцогдоно): бичих дугаар өөр гэрээнд
    // эсвэл файлын өөр мөрөнд байвал батлахыг хаана (эс бөгөөс RPC unique зөрчлөөр унана).
    const numberOwner = new Map<string, ContractListContract>();
    for (const contract of input.contracts) {
        const number = contract.contract_number?.trim();
        if (number && !numberOwner.has(number)) numberOwner.set(number, contract);
    }
    const firstWrite = new Map<string, number>();
    for (const write of [...numberWrites].sort((a, b) => a.row - b.row)) {
        const number = write.number.trim();
        const owner = numberOwner.get(number);
        const earlierRow = firstWrite.get(number);
        const where = owner && owner.id !== write.contractId ? `гэрээ ${contractLabel(owner)}` : earlierRow !== undefined ? `мөр ${earlierRow}` : null;
        if (where) {
            blocking.push({ code: 'duplicate_contract_number', label: write.label, row: write.row, ...(write.contractId ? { contractId: write.contractId } : {}),
                message: `Мөр ${write.row}: гэрээний дугаар «${number}» давхардсан (${where})` });
        } else {
            firstWrite.set(number, write.row);
        }
    }

    // Файлд байхгүй амьд гэрээ — өөрчлөхгүй, жагсаана.
    const missing: ContractListMissingItem[] = input.contracts
        .filter(contract => isLive(contract.contract_status) && !accounted.has(contract.id))
        .map(contract => ({
            contractId: contract.id, label: contractLabel(contract), status: contract.contract_status,
            orderDate: effectiveDate(contract), total: moneyOf(contract.total_price), undated: effectiveDate(contract) === null,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

    // Байрны төлөв (импорт өөрчлөхгүй) — зөрүүг жагсаана.
    const unitStatusMismatches: ContractListUnitMismatch[] = [];
    for (const [key, live] of finalLive) {
        const unit = unitOf.get(key)!;
        const status = unit.status ?? null;
        const kind = live && ['available', 'reserved', 'ordered'].includes(status ?? '') ? 'live_on_free'
            : !live && ['sold', 'handed_over'].includes(status ?? '') ? 'cancelled_on_sold' : null;
        if (kind) unitStatusMismatches.push({ label: displayLabel(unit.category, unit.code), unitStatus: status, unitStatusLabel: unitStatusLabel(status), kind });
    }

    const updates = groupUpdates(autoChanges);
    const counts: ContractListCounts = {
        insert: inserts.filter(item => item.status !== 'cancelled').length,
        insertCancelled: inserts.filter(item => item.status === 'cancelled').length,
        update: ops.filter(op => op.op === 'update').length,
        unchanged,
        review: review.length,
        blocking: blocking.length,
        missing: missing.length,
    };
    const fileTotals = summarizeFileTotals(input.rows);
    const units = {
        distinct: fileByUnit.size,
        resold: [...fileByUnit.values()].filter(list => list.some(row => row.status === 'cancelled') && list.some(row => row.status !== 'cancelled')).length,
    };
    const stillUndated = missing.filter(item => item.undated).length;
    const olderThanLatest = input.latestImportDate && DATE.test(reportDate) && reportDate < input.latestImportDate ? input.latestImportDate : null;
    const finalOps = errors.length ? [] : ops;
    return {
        reportDate,
        fileName: input.fileName?.trim() || null,
        errors: capErrors(errors),
        ops: finalOps,
        canonical: canonicalJson({ reportDate, ops: finalOps }),
        counts,
        fileTotals,
        units,
        review,
        updates,
        inserts,
        missing,
        stillUndated,
        unitStatusMismatches,
        info,
        blocking,
        olderThanLatest,
        rows: input.rows.map(row => ({ ...row, unitLabel: unitLabelOfRow.get(row.row) ?? null })),
        summary: {
            counts, fileTotals, units, stillUndated,
            unitStatusMismatches: unitStatusMismatches.length,
            review: review.map(item => item.label),
            blocking: blocking.length,
            olderThanLatest,
        },
    };
}

interface PairDiff {
    set: Partial<Record<ContractListField, Value>>;
    expect: Partial<Record<ContractListField | 'customer_name', Value>>;
    auto: ContractListChange[];
    review: ContractListChange[];
    info: ContractListInfoItem[];
    blocking: ContractListBlockingItem[];
}

const sameCondition = (a: string | null, b: string | null) => (a ?? '').replace(/\s+/g, ' ').trim() === (b ?? '').replace(/\s+/g, ' ').trim();

/** Нэг хос (файлын мөр ↔ гэрээ): автомат, шалгах өөрчлөлт, мэдээлэл, хаалт. expect = DB-ийн одоогийн түүхий утга. */
function diffPair({ row, contract }: Pair, ctx: { label: string; reportDate: string; transferred: boolean; hasPayments: boolean }): PairDiff {
    const diff: PairDiff = { set: {}, expect: {}, auto: [], review: [], info: [], blocking: [] };
    const paidKnown = contract.paid_amount !== null && contract.paid_amount !== undefined;
    const blockedMoney: string[] = [];
    const raw = (field: ContractListField): Value => {
        const value = contract[field];
        return value === undefined ? null : value;
    };
    const change = (field: ContractListField, from: Value, to: Value, kind: 'auto' | 'review') => {
        if (MONEY_FIELDS.has(field) && paidKnown) { blockedMoney.push(CONTRACT_LIST_FIELD_LABEL[field]); return; }
        diff.set[field] = to;
        diff.expect[field] = raw(field);
        diff[kind].push({ field, label: CONTRACT_LIST_FIELD_LABEL[field], from, to });
    };
    // Хоосон талбар бөглөх = автомат; утгатайг өөрчлөх = шалгах. Файлд хоосон бол DB-г арилгахгүй.
    const fillOrReview = (field: ContractListField, next: Value, current: Value) => {
        if (next === null || next === current) return;
        change(field, current, next, current === null ? 'auto' : 'review');
    };

    fillOrReview('order_date', row.orderDate, dateOf(contract.order_date));
    fillOrReview('contract_date', row.orderDate, dateOf(contract.contract_date));
    if (row.paymentCondition && !sameCondition(row.paymentCondition, textOrNull(contract.payment_condition))) {
        change('payment_condition', textOrNull(contract.payment_condition), row.paymentCondition, 'auto');
    }
    const condition = textOrNull(contract.prepayment_condition);
    if (row.prepaymentCondition && !sameCondition(row.prepaymentCondition, condition)) {
        change('prepayment_condition', condition, row.prepaymentCondition, condition === null ? 'auto' : 'review');
    }
    fillOrReview('total_price', row.total, moneyOf(contract.total_price));
    fillOrReview('prepayment_due', row.prepaymentDue, moneyOf(contract.prepayment_due));
    // Зогсоол/агуулахын «М.кв үнэ» нь нэгжийн үнэ — 1%-ийн дүрмээр л хадгална.
    fillOrReview('price_per_sqm', pricePerSqmOrNull(row.area, row.pricePerSqm, row.total), moneyOf(contract.price_per_sqm));
    fillOrReview('contracted_area', row.area, areaOf(contract.contracted_area));
    // Хоцролт файлын огноогоор: файлд хоосон бол «мэдэгдэхгүй» (хуучин дүнг одоогийнх мэт үлдээхгүй).
    const overdue = moneyOf(contract.overdue_amount);
    if (row.overdue !== overdue) change('overdue_amount', overdue, row.overdue, 'auto');
    const overdueAsOf = dateOf(contract.overdue_as_of);
    if (overdueAsOf !== ctx.reportDate) change('overdue_as_of', overdueAsOf, ctx.reportDate, 'auto');

    const current = contract.contract_status;
    if (current === 'transferred') {
        diff.info.push({ code: 'erp_transferred', label: ctx.label, row: row.row, contractId: contract.id,
            message: 'ERP-д «Тоот шилжсэн» төлөвтэй гэрээ — төлөв хэвээр' });
    } else if (current !== row.status) {
        if (row.status === 'cancelled') {
            if ((moneyOf(contract.paid_amount) ?? 0) > 0 || ctx.hasPayments) {
                diff.blocking.push({ code: 'has_payments', label: ctx.label, row: row.row, contractId: contract.id,
                    message: 'Файлд «Цуцлагдсан» боловч гэрээнд төлбөр (хуваарь, төлөлт) бүртгэлтэй — импортоор цуцлахгүй, гэрээний хуудсаас шалгана' });
            } else {
                change('contract_status', current, 'cancelled', 'review');
            }
        } else {
            change('contract_status', current, row.status, (current === 'active' && row.status === 'closed') || !current ? 'auto' : 'review');
        }
    }

    const fileName = joinName(row.firstName, row.lastName);
    const sameHolder = fileName !== null && nameKey(fileName) === nameKey(contract.customer_name);
    // RPC нэрийг зөвхөн NULL үед бөглөнө ('' ч бөглөгдсөнд тооцогдоно).
    const namesMissing = contract.customer_first_name == null || contract.customer_last_name == null;
    if (fileName && !sameHolder) {
        diff.info.push(ctx.transferred
            ? { code: 'holder_transferred', label: ctx.label, row: row.row, contractId: contract.id, fileName, currentName: contract.customer_name,
                message: 'Hub-д «Гэрээ шилжүүлэх»-ээр эзэмшигч солигдсон — нэр хэвээр' }
            : { code: 'holder_differs', label: ctx.label, row: row.row, contractId: contract.id, fileName, currentName: contract.customer_name,
                message: 'Эзэмшигч зөрүүтэй — импорт өөрчлөхгүй; «Гэрээ шилжүүлэх» → нэр засах' });
    } else if (sameHolder && row.firstName && row.lastName && namesMissing) {
        // Экспортын «Нэр» = customer_name (Овог хоосон) нь салгасан нэр биш — хоёр хэсэг хоёулаа байвал л бөглөнө.
        if (ctx.transferred) {
            diff.info.push({ code: 'holder_transferred', label: ctx.label, row: row.row, contractId: contract.id, fileName, currentName: contract.customer_name,
                message: 'Hub-д «Гэрээ шилжүүлэх»-ээр эзэмшигч солигдсон — нэр хэвээр' });
        } else {
            if (contract.customer_first_name == null) change('customer_first_name', null, row.firstName, 'auto');
            if (contract.customer_last_name == null) change('customer_last_name', null, row.lastName, 'auto');
            diff.expect.customer_name = contract.customer_name;
        }
    }
    if (row.contractNumber && contract.contract_number == null) change('contract_number', null, row.contractNumber, 'auto');
    if (row.salesManager && contract.sales_manager == null) change('sales_manager', null, row.salesManager, 'auto');

    if (blockedMoney.length) {
        diff.blocking.push({ code: 'paid_known', label: ctx.label, row: row.row, contractId: contract.id,
            message: `Төлсөн дүн бүртгэлтэй гэрээ — ${blockedMoney.join(', ')} импортоор өөрчлөгдөхгүй, гэрээний хуудсаас засна` });
    }
    return diff;
}

/** Шинэ гэрээний талбар: файл + нэгжийн баганууд (бүтээгдэхүүний импортын дүрмээр). NULL утгыг илгээхгүй. */
function insertFields(row: HubRow, unit: ContractListUnit, reportDate: string, notes: string): Record<string, Value> {
    const fields: Record<string, Value> = {
        product_type: unit.category,
        ...contractUnitColumns({ ...unit, block: unit.block ?? row.block }),
        contracted_area: row.area,
        price_per_sqm: pricePerSqmOrNull(row.area, row.pricePerSqm, row.total),
        total_price: row.total,
        prepayment_condition: row.prepaymentCondition,
        prepayment_due: row.prepaymentDue,
        payment_condition: row.paymentCondition,
        order_date: row.orderDate,
        contract_date: row.orderDate,
        contract_status: row.status,
        customer_name: joinName(row.firstName, row.lastName),
        customer_first_name: row.firstName,
        customer_last_name: row.lastName,
        overdue_amount: row.overdue,
        overdue_as_of: reportDate,
        contract_number: row.contractNumber,
        sales_manager: row.salesManager,
        notes,
    };
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined));
}

function groupUpdates(changes: Array<ContractListChange & { contractId: string; unitLabel: string }>): ContractListUpdateGroup[] {
    return FIELD_ORDER.flatMap(field => {
        const items = changes.filter(change => change.field === field)
            .map(change => ({ contractId: change.contractId, label: change.unitLabel, from: change.from, to: change.to }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return items.length ? [{ field, label: CONTRACT_LIST_FIELD_LABEL[field], count: items.length, items }] : [];
    });
}

/** «Файлын нийлбэр» төлөв бүрээр — эзэмшигч Excel-ийнхээ SUM-тай тулгана (центээр бүхэл тоогоор нэмнэ). */
export function summarizeFileTotals(rows: readonly HubRow[]): ContractListFileTotal[] {
    const cents = (value: number | null) => Math.round((value ?? 0) * 100);
    return (['active', 'closed', 'cancelled'] as const).flatMap(status => {
        const list = rows.filter(row => row.status === status);
        if (!list.length) return [];
        const sum = (pick: (row: HubRow) => number | null) => list.reduce((total, row) => total + cents(pick(row)), 0) / 100;
        return [{ status, label: HUB_STATUS_LABEL[status], rows: list.length, total: sum(row => row.total),
            prepaymentDue: sum(row => row.prepaymentDue), overdue: sum(row => row.overdue) }];
    });
}

// ---------------------------------------------------------------- Орсон мөнгө (W5/W6)

/** Хадгалсан мөрийн (contract_list_imports.rows) «Нийт төлсөн дүн»-д хэрэгтэй хэсэг. row = файлын мөрийн дугаар (ижил огнооны дараалал). */
export interface HubPaidRow { row: number; productType: string; unitLabel: string; orderDate: string; status: ContractListStatus; paidTotal: number | null }

/** Хадгалсан мөрүүдийг (JSON) шалгаж уншина; байр тулгагдаагүй, хэлбэр буруу мөрийг алгасна. Сөрөг дүн = хоосон. */
export function storedHubPaidRows(rows: unknown): HubPaidRow[] {
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((value): HubPaidRow[] => {
        if (!value || typeof value !== 'object') return [];
        const row = value as Record<string, unknown>;
        const productType = textOrNull(row.productType);
        const unitLabel = textOrNull(row.unitLabel);
        const orderDate = dateOf(row.orderDate);
        const status = row.status === 'active' || row.status === 'closed' || row.status === 'cancelled' ? row.status : null;
        if (!productType || !unitLabel || !orderDate || !status) return [];
        const paid = typeof row.paidTotal === 'number' && Number.isFinite(row.paidTotal) && row.paidTotal >= 0 ? roundMoney(row.paidTotal) : null;
        const rowNumber = typeof row.row === 'number' && Number.isInteger(row.row) ? row.row : 0;
        return [{ row: rowNumber, productType, unitLabel, orderDate, status, paidTotal: paid }];
    });
}

/** Файлд «Нийт төлсөн дүн» тоогоор бөглөгдсөн мөр байгаа эсэх (багана байхгүй бол бүгд null). */
export const hasHubPaidTotals = (rows: readonly HubPaidRow[]) => rows.some(row => row.paidTotal !== null);

/** Тулгалтад хэрэгтэй гэрээний баганууд (огноо = order_date ?? contract_date — импортынхтой ижил). */
export interface HubPaidContract {
    id: string; product_type?: string | null; unit_label?: string | null; contract_status?: string | null; contract_date?: string | null; order_date?: string | null;
}

/**
 * Файлын мөрийг гэрээтэй импортын түлхүүр (`${product_type}|${unit_label}`), импортын тулгалт (`pairUnitRows`)-аар
 * тулгаж «Нийт төлсөн дүн»-г гэрээгээр буцаана. `asOf` = файлын огноо: түүнээс хойш огноотой гэрээ (цуцалж дахин
 * зарсан гэх мэт) файлд байх боломжгүй тул тулгалтад оролцохгүй — хуучин худалдааны дүнг шинэ гэрээнд өгөхгүй.
 * Map-д байхгүй гэрээ = файлд тулгагдаагүй (тодорхойгүй, «+»); null = мөр байгаа ч дүн хоосон. Дүн зөвхөн амьд мөр ↔
 * амьд гэрээний хосод; файлд цуцлагдсан (цуцалсан мөртэй тулгагдсан) амьд гэрээ тодорхойгүй хэвээр.
 */
export function hubPaidByContract(rows: readonly HubPaidRow[], contracts: readonly HubPaidContract[], asOf: string): Map<string, number | null> {
    const rowsByUnit = new Map<string, HubPaidRow[]>();
    for (const row of rows) {
        const key = unitKeyOf(row.productType, row.unitLabel);
        if (!key) continue;
        const list = rowsByUnit.get(key);
        if (list) list.push(row); else rowsByUnit.set(key, [row]);
    }
    const contractsByUnit = new Map<string, HubPaidContract[]>();
    for (const contract of contracts) {
        const date = effectiveDate(contract);
        if (date !== null && date > asOf) continue;
        const key = unitKeyOf(contract.product_type, contract.unit_label);
        if (!key || !rowsByUnit.has(key)) continue;
        const list = contractsByUnit.get(key);
        if (list) list.push(contract); else contractsByUnit.set(key, [contract]);
    }
    const paid = new Map<string, number | null>();
    for (const [key, unitRows] of rowsByUnit) {
        const { pairs } = pairUnitRows(unitRows, contractsByUnit.get(key) ?? []);
        for (const { row, contract } of pairs) {
            if (row.status !== 'cancelled' && isLive(contract.contract_status)) paid.set(contract.id, row.paidTotal);
        }
    }
    return paid;
}
