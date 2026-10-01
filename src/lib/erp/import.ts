import { z } from 'zod';
import { dateSchema } from '@/lib/marketing/performance';
import { ubDateStr } from '@/lib/utils/date';

export const ERP_LIMITS = { bytes: 4 * 1024 * 1024, rows: 20000, sheets: 30, columns: 150 };
export type ErpRow = Record<string, string>;
export type ErpDataset = { name: string; columns: string[]; keyColumns: string[]; rows: ErpRow[] };
export type ErpChange = { dataset: string; key: string; kind: 'baseline' | 'added' | 'changed' | 'missing' | 'unchanged'; before: ErpRow | null; after: ErpRow | null; fields: string[] };
export const ErpOptionsSchema = z.object({
    source: z.string().trim().min(1).max(120), reportDate: dateSchema,
    keys: z.record(z.string(), z.array(z.string().min(1)).min(1).max(5)),
    expectedPrevious: z.string().uuid().nullable(), requestId: z.string().uuid(),
});

export function normalizeErpSheets(sheets: Array<{ name: string; columns: string[]; rows: Record<string, unknown>[] }>, keys: Record<string, string[]>): ErpDataset[] {
    if (!sheets.length || sheets.length > ERP_LIMITS.sheets) throw new Error('1–30 sheet бүхий файл сонгоно уу');
    if (sheets.reduce((n, s) => n + s.rows.length, 0) > ERP_LIMITS.rows) throw new Error('Нэг импорт 20,000 мөрөөс ихгүй байна');
    return sheets.map(sheet => {
        if (sheet.columns.length > ERP_LIMITS.columns || sheet.columns.some(c => c.startsWith('__EMPTY') || c.length > 200 || ['__proto__', 'constructor', 'prototype'].includes(c))) throw new Error(`${sheet.name}: бүх баганад зөв нэр өгнө үү (дээд тал нь 150)`);
        const keyColumns = keys[sheet.name];
        if (!keyColumns?.length || keyColumns.some(k => !sheet.columns.includes(k)) || new Set(keyColumns).size !== keyColumns.length) throw new Error(`${sheet.name}: давтагдахгүй ID багана сонгоно уу`);
        const seen = new Set<string>();
        const rows = sheet.rows.map((row, i) => {
            const value = Object.fromEntries(sheet.columns.map(column => {
                const v = row[column];
                // Excel reader returns local wall-clock dates, not UTC instants.
                const text = v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}${v.getHours() || v.getMinutes() || v.getSeconds() ? ` ${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}:${String(v.getSeconds()).padStart(2, '0')}` : ''}` : String(v ?? '').trim();
                if (text.length > 10000) throw new Error(`${sheet.name}: ${i + 2}-р мөрийн нүд хэт урт байна`);
                return [column, text];
            }));
            if (keyColumns.some(k => !value[k])) throw new Error(`${sheet.name}: ${i + 2}-р мөрийн ID хоосон байна`);
            const key = rowKey(value, keyColumns);
            if (seen.has(key)) throw new Error(`${sheet.name}: ${i + 2}-р мөрийн ID давхардсан байна. Нэмэлт ID багана сонгоно уу`);
            seen.add(key);
            return value;
        });
        return { ...sheet, keyColumns, rows };
    });
}

const rowKey = (row: ErpRow, keys: string[]) => JSON.stringify(keys.map(k => row[k]));

export function compareErp(previous: ErpDataset[] | null, current: ErpDataset[]) {
    const changes: ErpChange[] = [];
    // A missing sheet is usually an incomplete export, not deleted business records.
    for (const old of previous ?? []) {
        if (!current.some(s => s.name === old.name)) throw new Error(`Өмнөх импортын «${old.name}» sheet алга. Бүтэн экспорт оруулна уу`);
    }
    const datasets = current.map(sheet => {
        const old = previous?.find(s => s.name === sheet.name);
        if (old && JSON.stringify(old.keyColumns) !== JSON.stringify(sheet.keyColumns)) throw new Error(`${sheet.name}: өмнөх ID багануудыг ашиглана уу (${old.keyColumns.join(', ')})`);
        const before = new Map(old?.rows.map(r => [rowKey(r, sheet.keyColumns), r]));
        const counts = { name: sheet.name, total: sheet.rows.length, baseline: 0, added: 0, changed: 0, missing: 0, unchanged: 0 };
        for (const row of sheet.rows) {
            const key = rowKey(row, sheet.keyColumns);
            const prior = before.get(key) ?? null;
            const fields = [...new Set([...Object.keys(prior ?? {}), ...sheet.columns])].filter(c => (prior?.[c] ?? '') !== (row[c] ?? ''));
            const kind = !old ? 'baseline' : !prior ? 'added' : fields.length ? 'changed' : 'unchanged';
            counts[kind]++;
            changes.push({ dataset: sheet.name, key, kind, before: prior, after: row, fields });
            before.delete(key);
        }
        for (const [key, row] of before) {
            counts.missing++;
            changes.push({ dataset: sheet.name, key, kind: 'missing', before: row, after: null, fields: Object.keys(row) });
        }
        return { ...counts, addedColumns: sheet.columns.filter(c => old && !old.columns.includes(c)), missingColumns: old?.columns.filter(c => !sheet.columns.includes(c)) ?? [] };
    });
    const totals = datasets.reduce((a, s) => ({ total: a.total + s.total, baseline: a.baseline + s.baseline, added: a.added + s.added, changed: a.changed + s.changed, missing: a.missing + s.missing, unchanged: a.unchanged + s.unchanged }), { total: 0, baseline: 0, added: 0, changed: 0, missing: 0, unchanged: 0 });
    return { totals, datasets, changes };
}

export function erpWeek(date = ubDateStr()) {
    const ms = Date.parse(`${date}T00:00:00Z`);
    const monday = ms - ((new Date(ms).getUTCDay() + 6) % 7) * 86400000;
    const day = (offset: number) => new Date(monday + offset * 86400000).toISOString().slice(0, 10);
    return { from: day(0), to: day(6), due: day(1) };
}

export type ErpReport = ReturnType<typeof compareErp>;
export type ErpImport = { id: string; source: string; report_date: string; file_name: string; created_at: string; previous_id: string | null; summary: Omit<ErpReport, 'changes'>; datasets: ErpDataset[] };
