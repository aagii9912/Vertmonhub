import type { ImportRow } from '@/lib/admin/import/mappers';
import type { InventoryCategory, InventoryStatus } from '@/lib/inventory/labels';

/** The caller validates that projectId belongs to shopId before any write. */
export interface InventoryImportContext {
    shopId: string;
    projectId: string;
    projectName: string;
    sourceFile: string;
    /** Explicit block for exports whose entire file has no block column. */
    block?: string;
}

export interface InventoryUnitInsert {
    shop_id: string;
    project_id: string;
    phase: string;
    block: string;
    building_number: string | null;
    floor: string | null;
    code: string;
    unit_number: string | null;
    legacy_unit_number: string | null;
    category: InventoryCategory;
    unit_type: string | null;
    model: string | null;
    window_view: string | null;
    rooms: number | null;
    sale_area: number | null;
    updated_sale_area: number | null;
    contracted_area: number | null;
    status: InventoryStatus;
    raw_status: string;
    sales_channel: string | null;
    sales_manager: string | null;
    source_file: string;
}

const columns = {
    code: ['Код', 'Нэгжийн код', 'Байрны код', 'Бүтээгдэхүүний код', 'code'],
    phase: ['Ээлж', 'Үе шат', 'Төслийн ээлж', 'phase'],
    block: ['Блок', 'Блокийн нэр', 'block', 'block_name'],
    building_number: ['Барилгын дугаар', 'building_number'],
    floor: ['Давхар', 'floor'],
    unit_number: ['Шинэ тоот', 'Тоот', 'unit_number'],
    legacy_unit_number: ['Хуучин Тоот', 'legacy_unit_number'],
    category: ['Бүтээгдэхүүний төрөл', 'Ангилал', 'category', 'product_type'],
    unit_type: ['Айлын төрөл', 'unit_type'],
    model: ['Загвар', 'model', 'layout'],
    window_view: ['Цонхны харагдац', 'Чиглэл', 'window_view'],
    rooms: ['Өрөөний тоо', 'Өрөө', 'rooms'],
    sale_area: ['Борлуулах талбай', 'Талбай', 'Талбай (м²)', 'sale_area'],
    updated_sale_area: ['Шинэчилсэн борлуулах талбай', 'updated_sale_area'],
    contracted_area: ['Гэрээлсэн талбай', 'contracted_area'],
    status: ['Бүтээгдэхүүний төлөв', 'Төлөв', 'Статус', 'status', 'raw_status'],
    sales_channel: ['Борлуулалтын суваг', 'sales_channel'],
    sales_manager: ['Борлуулалтын менежер', 'sales_manager'],
} as const;

const categories: Record<string, InventoryCategory> = {
    'орон сууц': 'residential', residential: 'residential', apartment: 'residential',
    'зогсоол': 'parking', parking: 'parking',
    'агуулах': 'industry', industry: 'industry', storage: 'industry',
    'үйлчилгээ': 'commercial', commercial: 'commercial',
};
const statuses: Record<string, InventoryStatus> = {
    'худалдаанд': 'available', available: 'available',
    'хадгалсан': 'reserved', reserved: 'reserved',
    'захиалга үүссэн': 'ordered', 'гэрээ баталгаажаагүй': 'ordered', ordered: 'ordered',
    'гэрээ баталгаажсан': 'sold', 'зарагдсан': 'sold', sold: 'sold',
    'хүлээлгэсэн': 'handed_over', handed_over: 'handed_over',
};

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const characterCount = (value: string) => Array.from(value).length;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasColumn(row: ImportRow, aliases: readonly string[]) {
    return Object.keys(row).some(key => aliases.some(alias => normalize(alias) === normalize(key)));
}

function value(row: ImportRow, aliases: readonly string[]) {
    for (const alias of aliases) {
        const key = Object.keys(row).find(candidate => normalize(candidate) === normalize(alias));
        if (key === undefined) continue;
        const raw = row[key];
        if (raw !== null && raw !== undefined && !(typeof raw === 'string' && !raw.trim())) return raw;
    }
    return null;
}

function text(raw: unknown, label: string, max: number, required = false): string | null {
    if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) {
        if (required) throw new Error(`${label} хоосон байна`);
        return null;
    }
    if (typeof raw !== 'string' && !(typeof raw === 'number' && Number.isSafeInteger(raw))) {
        throw new Error(`${label} нь зөв текст эсвэл бүхэл тоо байна`);
    }
    const result = String(raw).trim();
    if (characterCount(result) > max) throw new Error(`${label} ${max} тэмдэгтээс урт байна`);
    if (result.includes('\0')) throw new Error(`${label} буруу тэмдэгттэй байна`);
    return result;
}

/** Full-value parsing: malformed grouping, numeric prefixes and rounding are rejected. */
function number(raw: unknown, label: string, integer = false): number | null {
    if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) return null;
    if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error(`${label} буруу тоо байна`);
    const input = String(raw).trim();
    const decimal = /^\d+(?:\.\d+)?$/;
    const commaGrouped = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
    const spaceGrouped = /^\d{1,3}(?:[ \u00a0]\d{3})+(?:\.\d+)?$/;
    if (!decimal.test(input) && !commaGrouped.test(input) && !spaceGrouped.test(input)) {
        throw new Error(`${label} буруу тоо байна`);
    }
    const clean = input.replace(/[, \u00a0]/g, '');
    const result = Number(clean);
    if (!Number.isFinite(result)) throw new Error(`${label} буруу тоо байна`);
    if (integer) {
        if (!Number.isInteger(result) || result > 2147483647) throw new Error(`${label} зөв бүхэл тоо байна`);
    } else if (result > 99999999.99 || (clean.split('.')[1]?.length ?? 0) > 2) {
        throw new Error(`${label} нь 99,999,999.99-аас ихгүй, хоёр орны нарийвчлалтай байна`);
    }
    return result;
}

/**
 * Maps every source row without guessing sale state or project ownership.
 * A caller must reject the entire import whenever errors.length is nonzero.
 */
export function mapInventoryRows(sourceRows: ImportRow[], context: InventoryImportContext) {
    const rows: InventoryUnitInsert[] = [];
    const errors: string[] = [];
    const summary = {
        total: sourceRows.length,
        valid: 0,
        byCategory: Object.create(null) as Record<string, number>,
        byStatus: Object.create(null) as Record<string, number>,
        byPhase: Object.create(null) as Record<string, number>,
        byBlock: Object.create(null) as Record<string, number>,
    };
    const result = { rows, errors, summary };
    try {
        if (!uuid.test(context.shopId) || !uuid.test(context.projectId)) {
            throw new Error('Байгууллага болон төслийн UUID холбоос шаардлагатай');
        }
        text(context.projectName, 'Төслийн нэр', 255, true);
        text(context.sourceFile, 'Эх файл', 255, true);
        if (context.block !== undefined) text(context.block, 'Блок', 50, true);
    } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Импортын тохиргоо буруу');
        return result;
    }
    if (!sourceRows.length) {
        errors.push('Файлд нэгжийн мөр алга');
        return result;
    }

    const hasPhase = sourceRows.some(row => hasColumn(row, columns.phase));
    const hasBlock = sourceRows.some(row => hasColumn(row, columns.block));
    const seen = new Map<string, number>();
    sourceRows.forEach((source, index) => {
        const rowNumber = index + 2;
        try {
            const code = text(value(source, columns.code), 'Код', 50, true)!;
            const phase = text(hasPhase ? value(source, columns.phase) : context.projectName, 'Ээлж', 50, true)!;
            const block = text(hasBlock ? value(source, columns.block) : context.block, 'Блок', 50, true)!;
            const rawCategory = text(value(source, columns.category), 'Бүтээгдэхүүний төрөл', 50, true)!;
            const categoryKey = normalize(rawCategory);
            const category = Object.hasOwn(categories, categoryKey) ? categories[categoryKey] : undefined;
            if (!category) throw new Error(`Тодорхойгүй бүтээгдэхүүний төрөл: ${rawCategory}`);
            const rawStatus = text(value(source, columns.status), 'Бүтээгдэхүүний төлөв', 50, true)!;
            const statusKey = normalize(rawStatus);
            const status = Object.hasOwn(statuses, statusKey) ? statuses[statusKey] : undefined;
            if (!status) throw new Error(`Тодорхойгүй бүтээгдэхүүний төлөв: ${rawStatus}`);
            const mapped: InventoryUnitInsert = {
                shop_id: context.shopId.toLowerCase(),
                project_id: context.projectId.toLowerCase(),
                phase, block, code, category, status,
                building_number: text(value(source, columns.building_number), 'Барилгын дугаар', 50),
                floor: text(value(source, columns.floor), 'Давхар', 20),
                unit_number: text(value(source, columns.unit_number), 'Шинэ тоот', 50),
                legacy_unit_number: text(value(source, columns.legacy_unit_number), 'Хуучин тоот', 50),
                unit_type: text(value(source, columns.unit_type), 'Айлын төрөл', 30),
                model: text(value(source, columns.model), 'Загвар', 50),
                window_view: text(value(source, columns.window_view), 'Цонхны харагдац', 50),
                rooms: number(value(source, columns.rooms), 'Өрөөний тоо', true),
                sale_area: number(value(source, columns.sale_area), 'Борлуулах талбай'),
                updated_sale_area: number(value(source, columns.updated_sale_area), 'Шинэчилсэн борлуулах талбай'),
                contracted_area: number(value(source, columns.contracted_area), 'Гэрээлсэн талбай'),
                raw_status: rawStatus,
                sales_channel: text(value(source, columns.sales_channel), 'Борлуулалтын суваг', 50),
                sales_manager: text(value(source, columns.sales_manager), 'Борлуулалтын менежер', 255),
                source_file: context.sourceFile.trim(),
            };
            const key = JSON.stringify([phase, category, code]);
            const previous = seen.get(key);
            if (previous !== undefined) throw new Error(`Код давхардсан (${code}); ${previous}-р мөртэй ижил ээлж/ангилал`);
            seen.set(key, rowNumber);
            rows.push(mapped);
            for (const [counts, key] of [[summary.byCategory, category], [summary.byStatus, status], [summary.byPhase, phase], [summary.byBlock, block]] as const) {
                counts[key] = (counts[key] ?? 0) + 1;
            }
        } catch (error) {
            errors.push(`Мөр ${rowNumber}: ${error instanceof Error ? error.message : 'Мөр буруу'}`);
        }
    });
    summary.valid = rows.length;
    return result;
}
