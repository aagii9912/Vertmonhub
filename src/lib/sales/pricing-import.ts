import { PricingRuleSchema, pricingKey, type PricingRule } from './pricing';

/**
 * Approved price-list spreadsheets («… блокийн үнийн санал»): one row per floor range × model,
 * one м² price column per payment condition («10-30%», «30%», a 0.3 percent cell …).
 * Parsing never writes and never guesses an advance: the admin confirms each condition's first
 * advance, and the rules then go into the editor as an ordinary draft (`save_project_pricing`).
 * Client-safe (no exceljs); the server reads the grid with `readWorkbookGrids`.
 */

export interface PricingImportGrid { name: string; hidden: boolean; rows: Array<{ row: number; cells: unknown[] }> }
export interface PricingImportIssue { row: number | null; message: string }
export interface PricingImportRow { row: number; floor_min: number; floor_max: number; models: string[]; prices: Record<string, number> }
export interface ParsedPricingSheet {
    name: string; title: string | null; kind: 'residential' | 'service' | null;
    block: string | null; valid_from: string | null; valid_until: string | null;
    modelColumns: Array<{ header: string; sample: string[] }>;
    /** Column order; `base` = the «after commissioning» list price, not a percent condition. */
    conditions: Array<{ label: string; base: boolean }>;
    rows: PricingImportRow[];
    issues: PricingImportIssue[];
}
export interface PricingImportFile { file: string; sheets: ParsedPricingSheet[]; skipped: Array<{ name: string; reason: string }> }

export const BASE_PRICE_CONDITION = 'Ашиглалтад орсны дараа';
export const PRICING_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_DATA_ROWS = 1000;

const text = (value: unknown) => value === undefined || value === null ? '' : String(value).replace(/\s+/g, ' ').trim();

/** «10-30%», «30 %», a percent-formatted 0.3 → «30%». Plain numbers above 1 are not percents. */
export function conditionLabel(value: unknown): string | null {
    if (typeof value === 'number') return value > 0 && value <= 1 ? `${Math.round(value * 10_000) / 100}%` : null;
    const compact = text(value).replace(/[–—]/g, '-').replace(/\s+/g, '').replace(/,/g, '.');
    return /^\d{1,3}(?:\.\d{1,2})?(?:-\d{1,3}(?:\.\d{1,2})?)?%$/.test(compact) ? compact : null;
}

const isBaseHeader = (value: unknown) => /ашиглалт/iu.test(text(value)) && /үнэ/iu.test(text(value));

/** «3-4 давхар», «02 давхар», 5 → floors; «Зоорийн давхар» has no 1–200 floor number. */
export function parseFloorRange(value: unknown): { min: number; max: number } | 'basement' | null {
    if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 200 ? { min: value, max: value } : null;
    const raw = text(value).replace(/[–—]/g, '-');
    if (/зоор/iu.test(raw)) return 'basement';
    const match = /^(\d{1,3})(?:\s*-\s*(\d{1,3}))?(?!\d)/.exec(raw);
    if (!match) return null;
    const min = Number(match[1]), max = Number(match[2] ?? match[1]);
    return min >= 1 && max <= 200 && min <= max ? { min, max } : null;
}

/** Whole-tugrik м² price; Excel float residue is rounded, anything else is rejected. */
export function parsePrice(value: unknown): number | null | 'invalid' {
    const raw = text(value);
    if (!raw || raw === '-' || raw === '—') return null;
    const number = typeof value === 'number' ? value : Number(raw.replace(/[\s,₮]/g, ''));
    if (!Number.isFinite(number) || number <= 0) return 'invalid';
    const rounded = Math.round(number);
    return Math.abs(number - rounded) <= 0.01 && rounded <= 1_000_000_000 ? rounded : 'invalid';
}

const isoDay = (year: string, month: string, day: string) => {
    const value = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
};

/** «2026/05/11-с 2026/08/31 хүртэл хүчинтэй» → the window; a single date with «хүртэл» is the end. */
export function parseValidity(lines: readonly string[]): { valid_from: string | null; valid_until: string | null } {
    for (const line of lines) {
        if (!/хүчинтэй/iu.test(line)) continue;
        const days = [...line.matchAll(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/g)].map(m => isoDay(m[1], m[2], m[3]));
        if (days.some(day => day === null) || !days.length) continue;
        if (days.length === 1) return /хүртэл/iu.test(line) ? { valid_from: null, valid_until: days[0] } : { valid_from: days[0], valid_until: null };
        if (days[0]! <= days[1]!) return { valid_from: days[0], valid_until: days[1] };
    }
    return { valid_from: null, valid_until: null };
}

/** «B1-р блок», «B2 Блок», «Б1 блокийн» → «Б1» (Б/B match the inventory either way). */
export function parseBlock(lines: readonly string[]): string | null {
    for (const line of lines) {
        const match = /(?:^|[^\p{L}\d])[BБ]\s*-?\s*(\d{1,2})(?:\s*-?\s*р)?\s*блок/iu.exec(line);
        if (match) return `Б${Number(match[1])}`;
    }
    return null;
}

const ranges = (rows: number[]) => {
    const parts: string[] = [];
    for (let i = 0; i < rows.length; i++) {
        let j = i;
        while (j + 1 < rows.length && rows[j + 1] === rows[j] + 1) j++;
        parts.push(i === j ? String(rows[i]) : `${rows[i]}–${rows[j]}`);
        i = j;
    }
    return parts.join(', ');
};

function parseSheet(grid: PricingImportGrid): ParsedPricingSheet | string {
    const headerIndex = grid.rows.findIndex(row => row.cells.some(cell => /давхар/iu.test(text(cell))) && row.cells.some(cell => /загвар/iu.test(text(cell))));
    if (headerIndex < 0) return '«Давхар», «Загвар» баганатай толгой мөр олдсонгүй';
    const header = grid.rows[headerIndex].cells;
    const next = grid.rows[headerIndex + 1]?.cells ?? [];
    const filled = next.filter(cell => text(cell) !== '');
    const subHeader = filled.length > 0 && filled.every(cell => conditionLabel(cell) !== null) ? next : null;
    const width = Math.max(header.length, subHeader?.length ?? 0);
    const above = grid.rows.slice(0, headerIndex).flatMap(row => row.cells.map(text).filter(Boolean));

    const priceColumns: Array<{ index: number; label: string }> = [];
    const modelIndexes: number[] = [], floorIndexes: number[] = [];
    const issues: PricingImportIssue[] = [];
    for (let index = 0; index < width; index++) {
        const label = conditionLabel(subHeader?.[index]) ?? conditionLabel(header[index]) ?? (isBaseHeader(header[index]) ? BASE_PRICE_CONDITION : null);
        if (label) {
            if (priceColumns.some(column => column.label === label)) issues.push({ row: grid.rows[headerIndex].row, message: `«${label}» нөхцөл хоёр баганад байна — эхнийхийг авлаа` });
            else priceColumns.push({ index, label });
        } else if (/загвар/iu.test(text(header[index]))) modelIndexes.push(index);
        else if (/давхар/iu.test(text(header[index]))) floorIndexes.push(index);
    }
    if (!priceColumns.length) return 'Төлбөрийн нөхцөлийн (жишээ нь «30%», «10-30%») үнийн багана олдсонгүй';
    const data = grid.rows.slice(headerIndex + (subHeader ? 2 : 1));
    // Two «Давхар» columns: the floor range («3-4 давхар») wins over a floor code («03 f»).
    const floorIndex = floorIndexes.map(index => ({ index, score: data.filter(row => /давхар|зоор/iu.test(text(row.cells[index]))).length }))
        .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.index;
    if (floorIndex === undefined) return '«Давхар» багана олдсонгүй';
    if (!modelIndexes.length) return '«Загвар» багана олдсонгүй';

    const rows: PricingImportRow[] = [];
    const basement: number[] = [];
    for (const { row, cells } of data) {
        const models = modelIndexes.map(index => text(cells[index]));
        const values = priceColumns.map(column => ({ label: column.label, raw: cells[column.index], price: parsePrice(cells[column.index]) }));
        if (!models.some(Boolean) && values.every(value => value.price === null)) continue;
        if (rows.length >= MAX_DATA_ROWS) { issues.push({ row, message: `${MAX_DATA_ROWS}-аас олон мөр — үлдсэнийг уншсангүй` }); break; }
        const floors = parseFloorRange(cells[floorIndex]);
        if (floors === 'basement') { basement.push(row); continue; }
        if (!floors) { issues.push({ row, message: `давхар танигдсангүй («${text(cells[floorIndex]) || 'хоосон'}»)` }); continue; }
        if (!models.some(Boolean)) { issues.push({ row, message: 'загвар хоосон' }); continue; }
        const prices: Record<string, number> = {};
        for (const value of values) {
            if (value.price === 'invalid') issues.push({ row, message: `«${value.label}» үнэ буруу («${text(value.raw)}»)` });
            else if (value.price !== null) prices[value.label] = value.price;
        }
        if (!Object.keys(prices).length) { issues.push({ row, message: 'үнэ байхгүй' }); continue; }
        rows.push({ row, floor_min: floors.min, floor_max: floors.max, models, prices });
    }
    if (basement.length) issues.unshift({ row: null, message: `Зоорийн давхрын ${basement.length} мөр (${ranges(basement)}-р мөр) орсонгүй: үнийн мөр 1–200 давхарын дугаартай байна` });
    if (!rows.length && !issues.length) return 'Үнийн мөр олдсонгүй';

    const titleLines = [grid.name, ...above];
    return {
        name: grid.name,
        title: above.find(line => /үнийн санал|блок/iu.test(line)) ?? above[0] ?? null,
        kind: titleLines.some(line => /үйлчилгээ/iu.test(line)) ? 'service' : titleLines.some(line => /орон сууц/iu.test(line)) ? 'residential' : null,
        block: parseBlock([...above, grid.name]),
        ...parseValidity(above),
        modelColumns: modelIndexes.map(index => ({ header: text(header[index]) || 'Загвар', sample: [...new Set(rows.map(row => row.models[modelIndexes.indexOf(index)]).filter(Boolean))].slice(0, 8) })),
        conditions: priceColumns.map(column => ({ label: column.label, base: column.label === BASE_PRICE_CONDITION })),
        rows, issues,
    };
}

export function parsePricingWorkbook(file: string, grids: readonly PricingImportGrid[]): PricingImportFile {
    const result: PricingImportFile = { file, sheets: [], skipped: [] };
    for (const grid of grids) {
        if (grid.hidden) { result.skipped.push({ name: grid.name, reason: 'Нуусан лист' }); continue; }
        if (!grid.rows.length) continue;
        const parsed = parseSheet(grid);
        if (typeof parsed === 'string') result.skipped.push({ name: grid.name, reason: parsed });
        else result.sheets.push(parsed);
    }
    return result;
}

export interface PricingImportSheetChoice { sheet: ParsedPricingSheet; include: boolean; block: string; modelColumn: number }
export interface PricingImportConditionChoice { include: boolean; advance_percent: number | null }

/** Rows × chosen conditions → rules; an empty price cell means the condition is not offered there. */
export function buildImportedRules(
    sheets: readonly PricingImportSheetChoice[], conditions: Readonly<Record<string, PricingImportConditionChoice>>,
): { rules: PricingRule[]; errors: string[] } {
    const rules: PricingRule[] = [], errors: string[] = [];
    for (const choice of sheets.filter(item => item.include)) {
        const block = choice.block.trim();
        if (!block) { errors.push(`«${choice.sheet.name}»: блокийг оруулна уу`); continue; }
        for (const row of choice.sheet.rows) {
            const model = row.models[choice.modelColumn]?.trim();
            if (!model) { errors.push(`«${choice.sheet.name}» ${row.row}-р мөр: сонгосон загварын багана хоосон`); continue; }
            for (const { label } of choice.sheet.conditions) {
                const condition = conditions[label];
                const price = row.prices[label];
                if (!condition?.include || price === undefined) continue;
                const parsed = PricingRuleSchema.safeParse({ block, model, floor_min: row.floor_min, floor_max: row.floor_max, payment_condition: label, price_per_sqm: price, advance_percent: condition.advance_percent });
                if (parsed.success) rules.push(parsed.data);
                else errors.push(`«${choice.sheet.name}» ${row.row}-р мөр, «${label}»: ${parsed.error.issues[0]?.message ?? 'мөр буруу'}`);
            }
        }
    }
    for (let a = 0; a < rules.length; a++) for (let b = a + 1; b < rules.length; b++) {
        const left = rules[a], right = rules[b];
        if (pricingKey(left.block) === pricingKey(right.block) && pricingKey(left.model) === pricingKey(right.model)
            && pricingKey(left.payment_condition) === pricingKey(right.payment_condition)
            && left.floor_min <= right.floor_max && right.floor_min <= left.floor_max) {
            errors.push(`${left.block} · ${left.model} · ${left.payment_condition}: ${left.floor_min}–${left.floor_max} ба ${right.floor_min}–${right.floor_max} давхар давхардсан`);
        }
    }
    if (rules.length > 500) errors.push(`Нийт ${rules.length} үнийн мөр — нэг хувилбарт 500 хүртэл`);
    return { rules, errors: [...new Set(errors)] };
}
