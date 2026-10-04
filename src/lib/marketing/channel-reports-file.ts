/**
 * Сувгийн экспорт файлыг (xlsx / csv / tsv) серверт уншина — `lib/utils/xlsx.ts`-ээр.
 * Тайлангийн гарчиг, хугацааны мөр зэргийг алгасаж, alias хамгийн олон таарсан мөрийг толгой гэж үзнэ.
 * Зөвхөн сервер талд (Node runtime).
 */
import { createHash } from 'node:crypto';
import { readWorkbookSheets, XlsxUnsupportedFormatError, type BinaryInput } from '@/lib/utils/xlsx';
import { buildTable, cellText, detectHeaderRow, type ChannelSource } from './channel-reports';

/** Vercel-ийн 4.5 MB хүсэлтийн хязгаарт multipart-ийн толгойтой багтана. */
export const CHANNEL_FILE_LIMITS = { bytes: 4 * 1024 * 1024, rows: 50_000 } as const;

export class ChannelFileError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChannelFileError';
    }
}

export function channelFileHash(input: BinaryInput): string {
    return createHash('sha256').update(input instanceof Uint8Array ? input : new Uint8Array(input)).digest('hex');
}

export interface ChannelFileTable {
    sheets: string[];
    sheet: string;
    /** Толгойн мөрийн дугаар (1-ээс). */
    headerRow: number;
    headers: string[];
    rows: Record<string, unknown>[];
    /** Эхний өгөгдлийн мөрийн дугаар (анхааруулгад). */
    firstLine: number;
}

export async function readChannelFile(input: BinaryInput, source: ChannelSource, sheet?: string | null): Promise<ChannelFileTable> {
    let sheets: Awaited<ReturnType<typeof readWorkbookSheets>>;
    try {
        sheets = await readWorkbookSheets(input);
    } catch (error) {
        if (error instanceof XlsxUnsupportedFormatError) throw new ChannelFileError('.xls (Excel 97-2003) формат дэмжигдэхгүй. Файлаа .xlsx эсвэл .csv болгон хадгална уу.');
        throw new ChannelFileError('Файлыг уншиж чадсангүй. .xlsx, .csv эсвэл .tsv файл сонгоно уу.');
    }
    if (!sheets.length) throw new ChannelFileError('Файл хоосон байна.');
    const chosen = sheet ? sheets.find(s => s.name === sheet) : sheets[0];
    if (!chosen) throw new ChannelFileError(`«${sheet}» нэртэй sheet олдсонгүй.`);
    if (chosen.rows.length > CHANNEL_FILE_LIMITS.rows) throw new ChannelFileError(`Нэг sheet-д ${CHANNEL_FILE_LIMITS.rows.toLocaleString('en-US')} хүртэл мөр оруулна уу.`);
    // readWorkbookSheets эхний мөрийг толгой болгодог; гарчигтай тайланд жинхэнэ толгойг дахин хайна.
    const matrix: unknown[][] = [
        chosen.columns.map(column => /^__EMPTY(?:_\d+)?$/.test(column) ? '' : column),
        ...chosen.rows.map(row => chosen.columns.map(column => row[column])),
    ];
    const headerIndex = detectHeaderRow(matrix, source);
    const table = buildTable(matrix, headerIndex);
    if (!table.headers.length || !table.rows.length) throw new ChannelFileError('Толгойн доор өгөгдөлтэй мөр алга.');
    return { sheets: sheets.map(s => s.name), sheet: chosen.name, headerRow: headerIndex + 1, ...table };
}

/** Холболтын хүснэгтэд харуулах жишээ утга (эхний хэдэн өгөгдөлтэй мөр). */
export function sampleValues(table: Pick<ChannelFileTable, 'headers' | 'rows'>, count = 3): Record<string, string[]> {
    const rows = table.rows.filter(row => Object.values(row).some(value => cellText(value) !== '')).slice(0, count);
    return Object.fromEntries(table.headers.map(header => [header, rows.map(row => cellText(row[header]).slice(0, 60))]));
}
