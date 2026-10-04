/**
 * ERP (Odoo) экспортын мөрийг тайланд ашиглах бүтэцтэй бичлэг болгоно.
 *
 * Хоёр экспорт дэмжинэ:
 *  - Гэрээ (`property.sale`): «Гэрээний дугаар», «Бүтээгдэхүүн», «Нийт дүн», «Нийт төлсөн дүн» …
 *    Нэг гэрээний дугаар хэд хэдэн бүтээгдэхүүнтэй байж болно (зогсоол + агуулах), тиймээс
 *    мөрийн түлхүүр = гэрээний дугаар + бүтээгдэхүүн.
 *  - Бүтээгдэхүүн: «Код», «Давхар», «Загвар», «Бүтээгдэхүүний төрөл», «Бүтээгдэхүүний төлөв» …
 *
 * ERP-ийн төлөвийн нэрийг дахин тайлбарлахгүй: бүлэглэхдээ эх нэрийг хадгална.
 * Хоосон эсвэл тоо биш нүдийг 0 гэж тооцохгүй — `null` буцаана.
 */
import type { ErpDataset, ErpRow } from './import';
import { inventoryStatusOf } from '@/lib/admin/import/units';
import type { InventoryStatus } from '@/lib/inventory/labels';

export type ProductKind = 'residential' | 'parking' | 'industry' | 'commercial' | 'other';

export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = {
    residential: 'Орон сууц', parking: 'Зогсоол', industry: 'Агуулах', commercial: 'Үйлчилгээ', other: 'Бусад',
};

const KIND_PATTERNS: Array<[RegExp, ProductKind]> = [
    [/орон\s*сууц|residential/i, 'residential'],
    [/зогсоол|гараж|parking/i, 'parking'],
    [/агуулах|storage|industry/i, 'industry'],
    [/үйлчилгээ|худалдааны\s*талбай|commercial/i, 'commercial'],
];

export function productKind(label: string | null | undefined): ProductKind {
    const text = (label ?? '').trim();
    for (const [pattern, kind] of KIND_PATTERNS) if (pattern.test(text)) return kind;
    return 'other';
}

/** '54,800,000', '12.5', '79.69999999999999' → тоо; хоосон/буруу → null. */
export function erpNumber(value: string | null | undefined): number | null {
    const text = (value ?? '').replace(/[\s,₮]/g, '');
    if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
}

/** 'YYYY-MM-DD[ HH:mm:ss]' → 'YYYY-MM-DD'. ERP огноо Улаанбаатарын өдрөөр ирнэ. */
export function erpDate(value: string | null | undefined): string | null {
    const match = (value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

const text = (row: ErpRow, column: string) => (row[column] ?? '').trim() || null;
/** Регистрийн дугаар (2 үсэг + 8 цифр) тайланд гаргахгүй. */
const withoutRegistration = (value: string | null) =>
    value?.replace(/\s*[А-ЯӨҮЁA-Z]{2}\d{8}\b/gu, '').replace(/\s{2,}/g, ' ').trim() || null;

/** «Б1-110» → «Б1»; «202-87» → «202». */
export function blockOfCode(code: string | null | undefined): string | null {
    const match = (code ?? '').trim().match(/^([^-\s]+)-/);
    return match ? match[1] : null;
}

// ---------------------------------------------------------------- Гэрээ (property.sale)

export type SaleStatus = 'active' | 'closed' | 'cancelled' | 'transferred' | 'other';
const SALE_STATUS: Array<[RegExp, SaleStatus]> = [
    [/цуцлагдсан|цуцалсан/i, 'cancelled'],
    [/хаасан|дууссан/i, 'closed'],
    [/шилжсэн/i, 'transferred'],
    [/үүссэн|идэвхтэй|батлагдсан|баталгаажсан/i, 'active'],
];

export interface ErpSale {
    key: string;
    contractNumber: string;
    orderDate: string | null;
    manager: string | null;
    product: string;
    unitCode: string | null;
    model: string | null;
    kind: ProductKind;
    block: string | null;
    channel: string | null;
    condition: string | null;
    customer: string | null;
    advanceCondition: string | null;
    advanceAmount: number | null;
    status: SaleStatus;
    statusLabel: string;
    bankStatus: string | null;
    pricePerSqm: number | null;
    area: number | null;
    total: number | null;
    paid: number | null;
    refund: number | null;
    balance: number | null;
    overdue: number | null;
    overdueDays: number | null;
    penalty: number | null;
}

export const SALE_COLUMNS = ['Гэрээний дугаар', 'Бүтээгдэхүүн', 'Нийт дүн', 'Нийт төлсөн дүн'];
export const isSalesDataset = (dataset: Pick<ErpDataset, 'columns'>) => SALE_COLUMNS.every(column => dataset.columns.includes(column));

/** «Б1-110, A-1, Зогсоол, ЭЛИЗИУМ-МИ» → код, загвар, төрөл. */
export function parseProductLabel(label: string) {
    const parts = label.split(',').map(part => part.trim()).filter(Boolean);
    const code = parts[0] && /^[^\s,]+-[^\s,]+$/.test(parts[0]) ? parts[0] : null;
    const kindPart = parts.find(part => productKind(part) !== 'other');
    return { code, model: code && parts[1] && !kindPart?.includes(parts[1]) ? parts[1] : null, kind: productKind(kindPart ?? label) };
}

export function parseErpSale(row: ErpRow): ErpSale | null {
    const contractNumber = text(row, 'Гэрээний дугаар');
    const product = text(row, 'Бүтээгдэхүүн');
    if (!contractNumber || !product) return null;
    const parsed = parseProductLabel(product);
    const statusLabel = text(row, 'Төлөв') ?? '';
    const status = SALE_STATUS.find(([pattern]) => pattern.test(statusLabel))?.[1] ?? 'other';
    const blockLabel = text(row, 'Блокын дугаар');
    return {
        key: `${contractNumber}|${product}`,
        contractNumber,
        orderDate: erpDate(row['Захиалга өгсөн огноо']),
        manager: text(row, 'Борлуулалтын менежер'),
        product,
        unitCode: parsed.code,
        model: parsed.model,
        kind: parsed.kind,
        block: blockOfCode(parsed.code) ?? blockLabel,
        channel: text(row, 'Борлуулалтын суваг'),
        condition: text(row, 'Захиалгын нөхцөл'),
        customer: withoutRegistration(text(row, 'Үндсэн захиалагч')),
        advanceCondition: text(row, 'Урьдчилгааны нөхцөл'),
        advanceAmount: erpNumber(row['Урьдчилгааны дүн']),
        status,
        statusLabel,
        bankStatus: text(row, 'Банкны төлөв'),
        pricePerSqm: erpNumber(row['М.кв үнэ']),
        area: erpNumber(row['Гэрээлсэн талбай']),
        total: erpNumber(row['Нийт дүн']),
        paid: erpNumber(row['Нийт төлсөн дүн']),
        refund: erpNumber(row['Төлбөрийн буцаалтын дүн']),
        balance: erpNumber(row['Нийт үлдэгдэл']),
        overdue: erpNumber(row['Төлбөр хоцролт']),
        overdueDays: erpNumber(row['Нийт хоцорсон хоног']),
        penalty: erpNumber(row['Нийт тооцсон алданги']),
    };
}

// ---------------------------------------------------------------- Бүтээгдэхүүн (байр, зогсоол, агуулах)

/**
 * Бүтээгдэхүүний төлөв нь units import, блокийн хуудастай ижил толь (`InventoryStatus`):
 * Худалдаанд → available, Захиалга үүссэн → ordered, Хадгалсан → reserved,
 * Гэрээ баталгаажсан → sold, Хүлээлгэсэн → handed_over. Мэдэгдэхгүй төлөв → null (эх нэр хадгалагдана).
 */
export interface ErpProduct {
    key: string;
    code: string;
    block: string | null;
    floor: number | null;
    model: string | null;
    kind: ProductKind;
    rooms: number | null;
    area: number | null;
    price: number | null;
    status: InventoryStatus | null;
    statusLabel: string;
    barter: boolean;
    manager: string | null;
}

export const PRODUCT_COLUMNS = ['Код', 'Бүтээгдэхүүний төрөл', 'Бүтээгдэхүүний төлөв'];
export const isProductsDataset = (dataset: Pick<ErpDataset, 'columns'>) => PRODUCT_COLUMNS.every(column => dataset.columns.includes(column));

export function parseErpProduct(row: ErpRow): ErpProduct | null {
    const code = text(row, 'Код');
    if (!code) return null;
    const statusLabel = text(row, 'Бүтээгдэхүүний төлөв') ?? '';
    const kind = productKind(text(row, 'Бүтээгдэхүүний төрөл'));
    const model = text(row, 'Загвар');
    return {
        key: `${kind}|${model ?? ''}|${code}`,
        code,
        block: blockOfCode(code),
        floor: erpNumber(row['Давхар']),
        model,
        kind,
        rooms: erpNumber(row['Өрөөний тоо']),
        area: erpNumber(row['Шинэчилсэн борлуулах талбай']) || erpNumber(row['Борлуулах талбай']),
        price: erpNumber(row['Нийт борлуулах үнэ']),
        status: inventoryStatusOf(statusLabel),
        statusLabel,
        barter: /бартер/i.test(text(row, 'Борлуулалтын суваг') ?? ''),
        manager: text(row, 'Борлуулалтын менежер'),
    };
}

/** Snapshot-ийн бүх sheet-ээс тухайн төрлийн мөрүүдийг уншина. */
export function readErpRecords<T>(datasets: ErpDataset[], detect: (dataset: ErpDataset) => boolean, parse: (row: ErpRow) => T | null): T[] {
    return datasets.filter(detect).flatMap(dataset => dataset.rows.map(parse).filter((row): row is T => row !== null));
}
