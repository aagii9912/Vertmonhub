/**
 * Гэрээний жагсаалтын ERP «HUB» загвар (16 багана) — нэг эх сурвалж. Жагсаалтын хүснэгт, Excel экспорт,
 * HUB файлын импорт ба AI бүгд эндээс уншина. Цэвэр, клиентэд аюулгүй (DB, Node API-гүй).
 *
 * DB ↔ файл: «Төрөл» = product_type, «Төлөв» = contract_status (HUB_STATUS_LABEL), «Давхар» нь DB-д
 * хоёр оронтой ("01"), файлд тэггүй ("1"); «Тоот» нь хуучин тоот, эс бөгөөс шинэ тоот, эс бөгөөс кодын
 * блокийн дараах хэсэг. «Захиалга өгсөн огноо» = order_date (байхгүй бол contract_date).
 */
import { HUB_STATUS_LABEL, CONTRACT_STATUS_META, type HubContractStatus } from '@/lib/contracts/labels';
import { UNIT_CATEGORY_LABEL, type InventoryCategory } from '@/lib/inventory/labels';

export { HUB_STATUS_LABEL, type HubContractStatus };

export const CONTRACT_LIST_COLUMNS = [
    'Төрөл', 'Блок', 'Тоот', 'Давхар', 'Загвар', 'Гэрээлсэн талбай', 'Урьдчилгааны нөхцөл', 'М.кв үнэ', 'Нийт дүн',
    'Урьдчилгааны дүн', 'Төлбөр хоцролт', 'Захиалга өгсөн огноо', 'Төлөв', 'Нэр', 'Овог', 'Захиалгын нөхцөл',
] as const;
export type ContractListColumn = typeof CONTRACT_LIST_COLUMNS[number];

/** product_type ↔ «Төрөл» (байрны нөөцийн ангиллын нэртэй ижил). Мэдэгдэхгүй төрөлд түлхүүр байхгүй. */
export const HUB_TYPE_LABEL: Readonly<Record<string, string>> = UNIT_CATEGORY_LABEL;

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const TYPE_BY_WORD = new Map<string, InventoryCategory>(
    (Object.entries(UNIT_CATEGORY_LABEL) as Array<[InventoryCategory, string]>)
        .flatMap(([key, label]) => [[normalize(label), key], [key, key]] as Array<[string, InventoryCategory]>),
);

/** «Төрөл» → product_type. Тэргүүлэх/дагах зай, том жижиг үсэг хамаагүй; мэдэгдэхгүй бол null. */
export function hubProductType(label: string | null | undefined): InventoryCategory | null {
    return typeof label === 'string' ? TYPE_BY_WORD.get(normalize(label)) ?? null : null;
}

// Яг таарах хүснэгт (regex биш): HUB-ийн үг, апп-ын нэр (Идэвхтэй/Хаагдсан/Цуцалсан/Тоот шилжсэн) ба түлхүүр.
const STATUS_BY_WORD = new Map<string, HubContractStatus>(
    (Object.keys(HUB_STATUS_LABEL) as HubContractStatus[]).flatMap(key => [
        [normalize(HUB_STATUS_LABEL[key]), key], [normalize(CONTRACT_STATUS_META[key].label), key], [key, key],
    ] as Array<[string, HubContractStatus]>),
);

/** «Төлөв» → contract_status. «Гэрээ баталгаажсан» зэрэг өөр үгийг таахгүй (null). */
export function hubContractStatus(label: string | null | undefined): HubContractStatus | null {
    return typeof label === 'string' ? STATUS_BY_WORD.get(normalize(label)) ?? null : null;
}

/** Файлын давхар → DB-ийн хэлбэр: "1" / 1 → "01", "22" → "22", "B1" → "B1", хоосон → null. */
export function dbFloor(value: unknown): string | null {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        return Number.isInteger(value) && value >= 0 ? String(value).padStart(2, '0') : String(value);
    }
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text) return null;
    return /^\d+$/.test(text) ? String(Number(text)).padStart(2, '0') : text;
}

/** DB-ийн давхар → файлын хэлбэр: "01" → "1", "B1" → "B1". */
export function hubFloor(value: string | null | undefined): string | null {
    const text = value?.trim();
    if (!text) return null;
    return /^\d+$/.test(text) ? String(Number(text)) : text;
}

const textOrNull = (value: unknown): string | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
};
const numberOrNull = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
};

/** Жагсаалт/экспортод хэрэгтэй гэрээний талбарууд (numeric нь PostgREST-ээс тоо эсвэл текст ирж болно). */
export interface ContractListSource {
    product_type?: string | null;
    block_name?: string | null;
    floor?: string | null;
    unit_number?: string | null;
    legacy_unit_number?: string | null;
    unit_label?: string | null;
    model?: string | null;
    contracted_area?: number | string | null;
    prepayment_condition?: string | null;
    price_per_sqm?: number | string | null;
    total_price?: number | string | null;
    prepayment_due?: number | string | null;
    overdue_amount?: number | string | null;
    order_date?: string | null;
    contract_date?: string | null;
    contract_status?: string | null;
    customer_name?: string | null;
    customer_first_name?: string | null;
    customer_last_name?: string | null;
    payment_condition?: string | null;
}

/**
 * «Тоот»: хуучин тоот ?? шинэ тоот ('0' биш) ?? кодын `${блок}-` дараах хэсэг (« (B1)» дагаваргүй).
 * «Б1-19 (B1)», блок «Б1» → "19". Код блокоор эхлээгүй бол таахгүй (null).
 */
export function contractUnitNumber(contract: Pick<ContractListSource, 'legacy_unit_number' | 'unit_number' | 'unit_label' | 'block_name'>): string | null {
    const legacy = textOrNull(contract.legacy_unit_number);
    if (legacy) return legacy;
    const unitNumber = textOrNull(contract.unit_number);
    if (unitNumber && unitNumber !== '0') return unitNumber;
    const block = textOrNull(contract.block_name);
    const code = textOrNull(contract.unit_label)?.split(',')[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!block || !code || !code.startsWith(`${block}-`)) return null;
    return code.slice(block.length + 1).trim() || null;
}

/** М.кв үнэ ERP-ийн загвараар: зогсоол/агуулахад DB-д NULL бол нэгжийн үнэ (нийт дүн) харагдана. */
export function isDerivedPricePerSqm(contract: Pick<ContractListSource, 'price_per_sqm' | 'product_type' | 'total_price'>): boolean {
    return numberOrNull(contract.price_per_sqm) === null
        && (contract.product_type === 'parking' || contract.product_type === 'industry')
        && numberOrNull(contract.total_price) !== null;
}

/**
 * «М.кв үнэ»: price_per_sqm ?? (зогсоол/агуулах бол total_price) — ERP энэ баганад нэгжийн үнийг бичдэг.
 * UI-д уламжилсан утгыг «Нэгжийн үнэ (ERP-ийн загвараар)» тайлбартай харуулна (`isDerivedPricePerSqm`).
 */
export function contractListPricePerSqm(contract: Pick<ContractListSource, 'price_per_sqm' | 'product_type' | 'total_price'>): number | null {
    const price = numberOrNull(contract.price_per_sqm);
    if (price !== null) return price;
    return isDerivedPricePerSqm(contract) ? numberOrNull(contract.total_price) : null;
}

/**
 * «Нэр» / «Овог»: салгасан нэр; хоёулаа хоосон бол customer_name-ийг «Нэр»-д (fallback = true, UI бүдэг).
 * Экспортын fallback нэр нь салгасан нэр биш — импорт түүнийг customer_first_name болгож бичихгүй.
 */
export function contractListNames(contract: Pick<ContractListSource, 'customer_first_name' | 'customer_last_name' | 'customer_name'>): {
    first: string | null; last: string | null; fallback: boolean;
} {
    const first = textOrNull(contract.customer_first_name);
    const last = textOrNull(contract.customer_last_name);
    if (first || last) return { first, last, fallback: false };
    const name = textOrNull(contract.customer_name);
    return { first: name, last: null, fallback: name !== null };
}

/**
 * Тайлангийн «О.Нэр» (Б.Мэндбаяр — борлуулалтын албаны Лхагвын илтгэлийн хэлбэр): овгийн эхний үсэг + нэр.
 * Нэр, овог хоёулаа байхгүй бол бүтэн нэр (компани г.м.). Регистрийн дугаарыг хэзээ ч оруулахгүй.
 */
export function customerShortName(contract: Pick<ContractListSource, 'customer_first_name' | 'customer_last_name' | 'customer_name'>): string | null {
    const first = textOrNull(contract.customer_first_name);
    const last = textOrNull(contract.customer_last_name);
    if (first && last) return `${Array.from(last)[0].toLocaleUpperCase('mn')}.${first}`;
    return textOrNull(contract.customer_name) ?? first ?? last;
}

/** 'YYYY-MM-DD' → тухайн өдрийн локал 00:00 (xlsx бичигч локал wall-clock огноог тэр өдрийн нүд болгоно). */
function dateCell(value: string | null | undefined): Date | null {
    const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Экспортын нэг мөр: NULL → хоосон нүд, 0 → 0; «Тоот» цифр бол тоо (тэгээр эхэлсэн «084» текстээр — эс бөгөөс
 * дахин импортлоход «Б2-84» болж байр олдохгүй); огноо Date.
 */
export function contractListRow(contract: ContractListSource): Record<ContractListColumn, string | number | Date | null> {
    const unitNumber = contractUnitNumber(contract);
    const names = contractListNames(contract);
    const type = contract.product_type ?? null;
    const status = contract.contract_status ?? null;
    return {
        'Төрөл': type && Object.hasOwn(HUB_TYPE_LABEL, type) ? HUB_TYPE_LABEL[type] : type,
        'Блок': textOrNull(contract.block_name),
        'Тоот': unitNumber && /^(?:0|[1-9]\d*)$/.test(unitNumber) ? Number(unitNumber) : unitNumber,
        'Давхар': hubFloor(contract.floor),
        'Загвар': textOrNull(contract.model),
        'Гэрээлсэн талбай': numberOrNull(contract.contracted_area),
        'Урьдчилгааны нөхцөл': textOrNull(contract.prepayment_condition),
        'М.кв үнэ': contractListPricePerSqm(contract),
        'Нийт дүн': numberOrNull(contract.total_price),
        'Урьдчилгааны дүн': numberOrNull(contract.prepayment_due),
        'Төлбөр хоцролт': numberOrNull(contract.overdue_amount),
        'Захиалга өгсөн огноо': dateCell(contract.order_date ?? contract.contract_date),
        'Төлөв': status && Object.hasOwn(HUB_STATUS_LABEL, status) ? HUB_STATUS_LABEL[status as HubContractStatus] : status,
        'Нэр': names.first,
        'Овог': names.last,
        'Захиалгын нөхцөл': textOrNull(contract.payment_condition),
    };
}

/** ERP-ийн файлын мөнгөн форматтай ижил (0 → «-»). */
export const CONTRACT_LIST_MONEY_FORMAT = '_(* #,##0_);_(* (#,##0);_(* "-"??_);_(@_)';
const NUMBER_FORMAT: Partial<Record<ContractListColumn, string>> = {
    'Гэрээлсэн талбай': '#,##0.00',
    'М.кв үнэ': CONTRACT_LIST_MONEY_FORMAT,
    'Нийт дүн': CONTRACT_LIST_MONEY_FORMAT,
    'Урьдчилгааны дүн': CONTRACT_LIST_MONEY_FORMAT,
    'Төлбөр хоцролт': CONTRACT_LIST_MONEY_FORMAT,
    'Захиалга өгсөн огноо': 'yyyy-mm-dd',
};
/** Баганын тоон формат CONTRACT_LIST_COLUMNS-ийн дарааллаар (`WorkbookSheetSpec.numFmts`). */
export const CONTRACT_LIST_NUMFMT: ReadonlyArray<string | undefined> = CONTRACT_LIST_COLUMNS.map(column => NUMBER_FORMAT[column]);
/** ERP-ийн файлын баганын өргөн (Excel-ийн тэмдэгтээр). */
export const CONTRACT_LIST_COL_WIDTHS: ReadonlyArray<number> = [13, 12, 12, 12, 12, 12, 16, 14, 14, 18, 14, 14, 14, 16, 16, 13];
