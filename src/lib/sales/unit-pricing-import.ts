import { BASE_PRICE_CONDITION, conditionLabel, parsePrice, parseValidity, type PricingImportGrid, type PricingImportIssue } from './pricing-import';
import { MAX_UNIT_PRICE_ROWS, type UnitPriceRow } from './unit-pricing';
import { pricingKey } from './pricing';

/**
 * Approved per-unit price lists («… блокийн Зогсоолын үнийн санал»): one row per unit with its code, and either
 * one «Үнэ» column or one price column per payment condition («50%», «0-100%», «Ашиглалтад орсон үнэ»).
 * Parsing never writes; the admin reviews the preview and saves it as a draft. Client-safe (no exceljs).
 */
export const UNIT_PRICE_SINGLE = 'Үнэ';

export interface ParsedUnitPriceSheet {
    name: string; title: string | null; valid_from: string | null; valid_until: string | null;
    conditions: string[];
    rows: Array<UnitPriceRow & { row: number }>;
    issues: PricingImportIssue[];
}
export interface UnitPriceImportFile { file: string; sheets: ParsedUnitPriceSheet[]; skipped: Array<{ name: string; reason: string }> }

const text = (value: unknown) => value === undefined || value === null ? '' : String(value).replace(/\s+/g, ' ').trim();
const header = (value: unknown) => text(value).toLowerCase();
/** «205», 205.00 → «205»; a text block stays as typed. */
const blockText = (value: unknown) => typeof value === 'number' && Number.isInteger(value) ? String(value) : text(value).replace(/^(\d+)\.0+$/, '$1');

function priceLabel(value: unknown): string | null {
    const condition = conditionLabel(value);
    if (condition) return condition;
    const name = header(value);
    if (/ашиглалт/u.test(name) && /үнэ/u.test(name)) return BASE_PRICE_CONDITION;
    return name === 'үнэ' ? UNIT_PRICE_SINGLE : null;
}

function parseSheet(grid: PricingImportGrid): ParsedUnitPriceSheet | string {
    const headerIndex = grid.rows.findIndex(row => row.cells.some(cell => header(cell) === 'код') && row.cells.some(cell => priceLabel(cell) !== null));
    if (headerIndex < 0) return '«Код» болон үнийн баганатай толгой мөр олдсонгүй';
    const cells = grid.rows[headerIndex].cells;
    const find = (test: (name: string) => boolean) => cells.findIndex(cell => test(header(cell)));
    const codeIndex = find(name => name === 'код');
    const blockIndex = find(name => name === 'блок');
    const modelIndex = find(name => name === 'загвар');
    const areaIndex = find(name => /талбай/u.test(name));
    const issues: PricingImportIssue[] = [];
    const prices: Array<{ index: number; label: string }> = [];
    cells.forEach((cell, index) => {
        const label = priceLabel(cell);
        if (!label) return;
        if (prices.some(column => column.label === label)) issues.push({ row: grid.rows[headerIndex].row, message: `«${label}» хоёр баганад байна — эхнийхийг авлаа` });
        else prices.push({ index, label });
    });
    const above = grid.rows.slice(0, headerIndex).flatMap(row => row.cells.map(text).filter(Boolean));
    const rows: ParsedUnitPriceSheet['rows'] = [];
    const seen = new Set<string>();
    for (const { row, cells: values } of grid.rows.slice(headerIndex + 1)) {
        const code = text(values[codeIndex]);
        const amounts = prices.map(column => ({ label: column.label, raw: values[column.index], price: parsePrice(values[column.index]) }));
        // Signature and archive-number lines under the table have no code and no price.
        if (!code && !amounts.some(amount => typeof amount.price === 'number')) continue;
        if (!code) { issues.push({ row, message: 'код хоосон' }); continue; }
        if (rows.length >= MAX_UNIT_PRICE_ROWS) { issues.push({ row, message: `${MAX_UNIT_PRICE_ROWS}-аас олон мөр — үлдсэнийг уншсангүй` }); break; }
        if (seen.has(pricingKey(code))) { issues.push({ row, message: `${code} код давхардсан` }); continue; }
        const priced: Record<string, number> = {};
        for (const amount of amounts) {
            if (amount.price === 'invalid') issues.push({ row, message: `${code}: «${amount.label}» үнэ буруу («${text(amount.raw)}»)` });
            else if (amount.price !== null) priced[amount.label] = amount.price;
        }
        if (!Object.keys(priced).length) { issues.push({ row, message: `${code}: үнэ байхгүй` }); continue; }
        const area = areaIndex < 0 ? null : Number(text(values[areaIndex]).replace(',', '.'));
        seen.add(pricingKey(code));
        rows.push({
            row, code, block: (blockIndex < 0 ? '' : blockText(values[blockIndex])) || code.replace(/-[^-]*$/, ''),
            model: modelIndex < 0 ? null : text(values[modelIndex]).slice(0, 50) || null,
            area_sqm: area !== null && Number.isFinite(area) && area > 0 ? Math.round(area * 100) / 100 : null,
            prices: priced,
        });
    }
    if (!rows.length && !issues.length) return 'Үнийн мөр олдсонгүй';
    // Only conditions that price at least one unit become columns.
    const used = new Set(rows.flatMap(row => Object.keys(row.prices)));
    return {
        name: grid.name, title: above.find(line => /үнийн санал|зогсоол|агуулах|блок/iu.test(line)) ?? above[0] ?? null,
        ...parseValidity(above), conditions: prices.map(column => column.label).filter(label => used.has(label)), rows, issues,
    };
}

export function parseUnitPriceWorkbook(file: string, grids: readonly PricingImportGrid[]): UnitPriceImportFile {
    const result: UnitPriceImportFile = { file, sheets: [], skipped: [] };
    for (const grid of grids) {
        if (grid.hidden) { result.skipped.push({ name: grid.name, reason: 'Нуусан лист' }); continue; }
        if (!grid.rows.length) continue;
        const parsed = parseSheet(grid);
        if (typeof parsed === 'string') result.skipped.push({ name: grid.name, reason: parsed });
        else result.sheets.push(parsed);
    }
    return result;
}

export interface UnitPriceRegisterUnit { code: string; block: string | null; model: string | null; area_sqm: number | null }

/**
 * Checks the file's units against the register and takes the register's block for each code: the file's «Блок»
 * is the residential block a garage belongs to (205), while the register files the space under its garage
 * (Г1474) — and the price page is organised by the register. Unknown codes are reported, never dropped silently.
 */
export function matchUnitPriceRows(rows: readonly (UnitPriceRow & { row?: number })[], register: readonly UnitPriceRegisterUnit[]): { rows: UnitPriceRow[]; unknown: string[]; moved: number } {
    const byCode = new Map(register.map(unit => [pricingKey(unit.code), unit]));
    const unknown: string[] = [];
    let moved = 0;
    const matched = rows.map(({ row: _row, ...item }): UnitPriceRow => {
        const unit = byCode.get(pricingKey(item.code));
        if (!unit) { unknown.push(item.code); return item; }
        if (unit.block && pricingKey(unit.block) !== pricingKey(item.block)) moved++;
        return { ...item, code: unit.code, block: unit.block?.trim() || item.block, model: item.model ?? unit.model, area_sqm: item.area_sqm ?? unit.area_sqm };
    });
    return { rows: matched, unknown, moved };
}
