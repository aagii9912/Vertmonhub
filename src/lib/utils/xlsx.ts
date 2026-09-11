/**
 * Excel (.xlsx) + CSV унших/бичих нэг цэг — exceljs дээр. SheetJS (`xlsx`) устгасан:
 * prototype pollution + ReDoS (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9), засваргүй.
 * Зөвхөн сервер талд (Node runtime) ашиглана — клиент хуудаснаас импортлохгүй.
 *
 * SheetJS-ийн `sheet_to_json` / `json_to_sheet` / `aoa_to_sheet` семантикийг хадгална:
 *  - Эхний (хоосон биш) мөр = толгой. Хоосон толгой → `__EMPTY`, `__EMPTY_1`, …; давхардсан → `Нэр_1`.
 *  - Хоосон нүд → түлхүүр орохгүй (`defval` өгвөл тэр утга); бүхэлдээ хоосон мөр алгасна.
 *  - Огноо: SheetJS `cellDates: true`-тэй адил ПРОЦЕССЫН ЛОКАЛ цагийн бүсийн wall-clock Date
 *    (нүдэнд 2026-01-15 → `new Date(2026, 0, 15)`); бичихдээ буцааж хөрвүүлнэ. exceljs өөрөө
 *    UTC-ээр задалдаг тул хөрвүүлэхгүй бол `mappers.formatLocalDate` (локал бүрэлдэхүүн уншдаг)
 *    сөрөг offset-той серверт өдрөө нэгээр гулсуулна.
 *  - Формула → кэшлэгдсэн үр дүн, richText → нийлсэн текст, hyperlink → текст, алдаа (#N/A) → хоосон.
 *  - Нэгтгэсэн (merged) мужид зөвхөн эхний нүд утгатай (exceljs туслах нүдэнд мастерын утгыг
 *    өгдөг, SheetJS өгдөггүй байсан — хуучин семантикийг хадгална).
 *  - Форматыг агуулгаар танина: `PK` → xlsx; OLE2 (.xls, Excel 97-2003 BIFF) → XlsxUnsupportedFormatError
 *    (exceljs уншдаггүй); бусад → CSV/TSV (csv-parse; хуваагчийг SheetJS шиг таамаглана,
 *    тоо мэт текст → number, TRUE/FALSE → boolean).
 */
import ExcelJS from 'exceljs';
import type { Cell, CellValue, Worksheet } from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';

export type SheetRow = Record<string, unknown>;
/** Node Buffer нь Uint8Array тул `ArrayBuffer | Buffer`-ийг бүрэн хамарна. */
export type BinaryInput = ArrayBuffer | Uint8Array;

export interface ReadSheetOptions {
    /**
     * SheetJS `defval`: өгвөл толгой бүр түлхүүртэй болж, хоосон нүд энэ утгыг авна
     * (`undefined` = өгөөгүйтэй адил — SheetJS-тэй ижил).
     */
    defval?: unknown;
}

export type WorkbookSheetSpec =
    /** `json_to_sheet`: толгой = бүх мөрийн түлхүүрийн нэгдэл, анх таарсан дарааллаар */
    | { name: string; rows: SheetRow[]; colWidths?: number[] }
    /** `aoa_to_sheet`: массивуудыг байгаагаар нь */
    | { name: string; aoa: unknown[][]; colWidths?: number[] };

export class XlsxSheetNotFoundError extends Error {
    constructor(sheet: number | string) {
        super(
            typeof sheet === 'number'
                ? `Excel файлд ${sheet + 1}-р лист олдсонгүй`
                : `Excel файлд "${sheet}" лист олдсонгүй`
        );
        this.name = 'XlsxSheetNotFoundError';
    }
}

export class XlsxUnsupportedFormatError extends Error {
    constructor(format: string) {
        super(`${format} формат дэмжигдэхгүй — файлыг .xlsx эсвэл .csv болгож хадгална уу`);
        this.name = 'XlsxUnsupportedFormatError';
    }
}

// ============================================
// УНШИХ
// ============================================

/**
 * Листийн мөрүүдийг толгойгоор түлхүүрлэсэн объект болгож уншина (SheetJS `sheet_to_json`).
 * @param sheet листийн индекс (0 = эхний, дарааллаар) эсвэл нэр
 */
export async function readSheetRows(
    input: BinaryInput,
    sheet: number | string = 0,
    options: ReadSheetOptions = {}
): Promise<SheetRow[]> {
    const matrix = await loadMatrix(input, sheet);
    if (matrix.length === 0) return [];

    const [headerRow, ...dataRows] = matrix;
    const width = matrix.reduce((w, r) => Math.max(w, r.length), 0);
    const headers = buildHeaders(headerRow, width);
    const hasDefval = options.defval !== undefined;

    return dataRows.map((values) => {
        const row: SheetRow = {};
        for (let c = 0; c < headers.length; c++) {
            const v = values[c];
            if (v === undefined) {
                if (hasDefval) row[headers[c]] = options.defval;
                continue;
            }
            row[headers[c]] = v;
        }
        return row;
    });
}

/**
 * Листийг CSV текст болгоно (SheetJS `sheet_to_csv`) — LLM-д өгөх агуулгад.
 * Хоосон мөр алгасна, мөр бүрийг листийн өргөнөөр тэгшилнэ, огноо `YYYY-MM-DD[ HH:mm]`.
 */
export async function readSheetCsv(input: BinaryInput, sheet: number | string = 0): Promise<string> {
    const matrix = await loadMatrix(input, sheet);
    const width = matrix.reduce((w, r) => Math.max(w, r.length), 0);
    return matrix
        .map((row) => {
            const cells: string[] = [];
            for (let c = 0; c < width; c++) cells.push(csvEscape(cellText(row[c])));
            return cells.join(',');
        })
        .join('\n');
}

/** Нэг листийн хоосон биш мөрүүд; нүд бүр normalise хийгдсэн, `undefined` = хоосон нүд. */
type Matrix = unknown[][];

async function loadMatrix(input: BinaryInput, sheet: number | string): Promise<Matrix> {
    const buf = toBuffer(input);
    const format = detectFormat(buf);
    if (format === 'xls') throw new XlsxUnsupportedFormatError('.xls (Excel 97-2003)');
    if (format === 'text') return csvToMatrix(buf, sheet);

    const workbook = new ExcelJS.Workbook();
    // exceljs-ийн index.d.ts өөрийн `Buffer extends ArrayBuffer` төрөл зарладаг тул Node Buffer-ийг
    // cast хийнэ — runtime дээр `load()` Node Buffer-ийг шууд хүлээж авдаг.
    await workbook.xlsx.load(buf as unknown as ArrayBuffer);

    const ws = typeof sheet === 'number' ? workbook.worksheets[sheet] : workbook.getWorksheet(sheet);
    if (!ws) throw new XlsxSheetNotFoundError(sheet);
    return worksheetToMatrix(ws);
}

function worksheetToMatrix(ws: Worksheet): Matrix {
    const matrix: Matrix = [];
    // includeEmpty өгөөгүй → зөвхөн утгатай мөр (SheetJS blankrows=false)
    ws.eachRow((row) => {
        const values: unknown[] = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => {
            const v = normalizeCell(cell);
            if (v !== undefined) values[col - 1] = v;
        });
        const trimmed = trimRow(values);
        if (trimmed.length > 0) matrix.push(trimmed);
    });
    return matrix;
}

function normalizeCell(cell: Cell): unknown {
    // Нэгтгэсэн мужийн туслах нүд: exceljs мастерын утгыг буцаадаг, SheetJS хоосон үлдээдэг байсан.
    if (cell.master !== cell) return undefined;
    return normalizeValue(cell.value);
}

function normalizeValue(v: CellValue): unknown {
    if (v === null || v === undefined) return undefined;
    if (v instanceof Date) return utcToLocalWallClock(v);
    if (typeof v !== 'object') return v; // number | string | boolean
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    // hyperlink-ийн `text` d.ts-д string боловч runtime дээр richText байж болно
    if ('hyperlink' in v) return normalizeValue(v.text as CellValue);
    if ('formula' in v || 'sharedFormula' in v) return normalizeValue(v.result ?? null);
    if ('error' in v) return undefined; // #N/A, #REF! … — SheetJS түлхүүр оруулдаггүй
    return String(v);
}

/** SheetJS толгой: format_cell текст, хоосон → `__EMPTY`, давхардсан → `_1`, `_2` … */
function buildHeaders(headerRow: unknown[], width: number): string[] {
    const headers: string[] = [];
    for (let c = 0; c < width; c++) {
        const base = headerText(headerRow[c]);
        let name = base;
        let n = 0;
        while (headers.includes(name)) name = `${base}_${++n}`;
        headers.push(name);
    }
    return headers;
}

function headerText(v: unknown): string {
    const s = cellText(v).trim();
    return s === '' ? '__EMPTY' : s;
}

function cellText(v: unknown): string {
    if (v === undefined || v === null) return '';
    if (v instanceof Date) return formatDateText(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
}

function trimRow(values: unknown[]): unknown[] {
    let last = values.length - 1;
    while (last >= 0 && values[last] === undefined) last--;
    return values.slice(0, last + 1);
}

// ---------- CSV ----------

function csvToMatrix(buf: Buffer, sheet: number | string): Matrix {
    // SheetJS CSV-г "Sheet1" нэртэй ганц лист болгодог
    if (sheet !== 0 && sheet !== 'Sheet1') throw new XlsxSheetNotFoundError(sheet);
    const text = decodeText(buf);
    if (text.trim() === '') return [];

    const records = parseCsv(text, {
        delimiter: guessDelimiter(text.slice(0, 1024)),
        relax_column_count: true,
        relax_quotes: true,
        skip_empty_lines: true,
        trim: false,
    }) as string[][];

    const matrix: Matrix = [];
    for (const record of records) {
        const trimmed = trimRow(record.map(csvCellValue));
        if (trimmed.length > 0) matrix.push(trimmed);
    }
    return matrix;
}

/** SheetJS CSV нүд: хоосон → байхгүй, тоо мэт ("380,000,000" ч) → number, TRUE/FALSE → boolean, бусад → текст */
function csvCellValue(s: string): unknown {
    if (s === '') return undefined;
    if (s.trim() !== '') {
        const n = Number(s);
        if (Number.isFinite(n)) return n;
        const n2 = Number(s.replace(/(\d),(\d)/g, '$1$2'));
        if (Number.isFinite(n2)) return n2;
    }
    if (s === 'TRUE') return true;
    if (s === 'FALSE') return false;
    return s;
}

function decodeText(buf: Buffer): string {
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
    return buf.toString('utf8');
}

/** SheetJS `guess_sep`: хашилтын гадна `,` `\t` `;` `|`-ийг тоолж, хамгийн олныг (тэнцвэл энэ дарааллаар) авна */
function guessDelimiter(sample: string): string {
    const candidates = [',', '\t', ';', '|'];
    const counts = new Map<string, number>(candidates.map((c) => [c, 0]));
    let inQuotes = false;
    for (const ch of sample) {
        if (ch === '"') inQuotes = !inQuotes;
        else if (!inQuotes && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    let best = ',';
    let bestCount = -1;
    for (const c of candidates) {
        const n = counts.get(c) ?? 0;
        if (n > bestCount) {
            best = c;
            bestCount = n;
        }
    }
    return best;
}

function csvEscape(s: string): string {
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ============================================
// БИЧИХ
// ============================================

/**
 * Листүүдээс .xlsx буфер үүсгэнэ (SheetJS `book_new` + `json_to_sheet` / `aoa_to_sheet` + `write`).
 * Листийн нэрийг Excel-ийн дүрмээр цэвэрлэж (`\ / ? * [ ] :` → `_`), 31 тэмдэгтээр тасалж, давхардвал дугаарлана.
 */
export async function buildWorkbookBuffer(sheets: WorkbookSheetSpec[]): Promise<Buffer<ArrayBuffer>> {
    const workbook = new ExcelJS.Workbook();
    const usedNames = new Set<string>();

    for (const spec of sheets) {
        const ws = workbook.addWorksheet(uniqueSheetName(spec.name, usedNames));
        const matrix = 'aoa' in spec ? spec.aoa : rowsToAoa(spec.rows);
        for (const row of matrix) ws.addRow(row.map(toCellValue));
        spec.colWidths?.forEach((width, i) => {
            if (width > 0) ws.getColumn(i + 1).width = width;
        });
    }

    const out = await workbook.xlsx.writeBuffer();
    // exceljs Node Buffer буцаадаг (ArrayBuffer дээр суурилсан, SharedArrayBuffer биш). TS 5.7+ үүнийг
    // `Buffer<ArrayBufferLike>` гэж хардаг тул `new NextResponse(buffer)`-ийн BodyInit
    // (`ArrayBufferView<ArrayBuffer>`)-д тааруулж хуулахгүйгээр нарийсгана.
    return (Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer)) as Buffer<ArrayBuffer>;
}

/** `json_to_sheet`: толгой = түлхүүрүүдийн нэгдэл, анх таарсан дарааллаар; мөр бүрийг толгойгоор тэгшилнэ */
function rowsToAoa(rows: SheetRow[]): unknown[][] {
    const headers: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (!seen.has(key)) {
                seen.add(key);
                headers.push(key);
            }
        }
    }
    if (headers.length === 0) return [];
    return [headers, ...rows.map((row) => headers.map((h) => row[h]))];
}

function toCellValue(v: unknown): CellValue {
    if (v === undefined || v === null) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : localWallClockToUtc(v);
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' || typeof v === 'boolean') return v;
    return String(v); // SheetJS json_to_sheet объект/массивыг String() болгодог
}

const INVALID_SHEET_NAME_CHARS = /[\\/?*[\]:]/g;

function uniqueSheetName(name: string, used: Set<string>): string {
    const base =
        String(name ?? '')
            .replace(INVALID_SHEET_NAME_CHARS, '_')
            .replace(/^'+|'+$/g, '')
            .trim()
            .slice(0, 31) || 'Sheet1';
    let candidate = base;
    let n = 1;
    while (used.has(candidate.toLowerCase())) {
        const suffix = ` (${++n})`;
        candidate = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
}

// ============================================
// ОГНОО / БУФЕР
// ============================================

/** exceljs 2026-01-15 → 2026-01-15T00:00Z өгдөг; SheetJS cellDates локал 2026-01-15 00:00 өгдөг байсан */
function utcToLocalWallClock(d: Date): Date {
    if (isNaN(d.getTime())) return d;
    return new Date(
        d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
        d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()
    );
}

/** Бичихэд урвуу: локал wall-clock → UTC (exceljs serial-ыг UTC-ээр тооцдог) */
function localWallClockToUtc(d: Date): Date {
    return new Date(Date.UTC(
        d.getFullYear(), d.getMonth(), d.getDate(),
        d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()
    ));
}

function formatDateText(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
    return hasTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

function toBuffer(input: BinaryInput): Buffer {
    if (Buffer.isBuffer(input)) return input;
    if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    return Buffer.from(input);
}

function detectFormat(buf: Buffer): 'xlsx' | 'xls' | 'text' {
    // "PK" — zip (OOXML)
    if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return 'xlsx';
    // OLE2 compound file — Excel 97-2003 (.xls, BIFF)
    if (buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return 'xls';
    return 'text';
}
