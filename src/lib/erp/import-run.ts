import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readWorkbookSheets } from '@/lib/utils/xlsx';
import { ubDateStr } from '@/lib/utils/date';
import { compareErp, normalizeErpSheets, ErpOptionsSchema, ERP_LIMITS, type ErpImport } from './import';

export type ErpImportAction = 'inspect' | 'preview' | 'commit';
export type ErpImportRun = { ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string };

const unavailable: ErpImportRun = { ok: false, status: 503, error: 'ERP мэдээлэл уншиж чадсангүй. ERP migration болон холболтыг шалгана уу.' };

/**
 * ERP экспортыг шалгах (inspect), өмнөхтэй харьцуулах (preview), өөрчлөгдөхгүй snapshot болгон
 * хадгалах (commit) нэг дүрэм — POST /api/dashboard/erp-imports ба AI `import_erp_file`.
 * `options` нь form-ын JSON текст эсвэл объект. Давтан commit (ижил requestId) анхны импортыг буцаана.
 */
export async function runErpImport(db: SupabaseClient, input: {
    shopId: string; userId: string; fileName: string; buffer: ArrayBuffer; source: unknown; action: unknown; options?: unknown;
}): Promise<ErpImportRun> {
    try {
        if (!input.buffer.byteLength || input.buffer.byteLength > ERP_LIMITS.bytes || !/\.(xlsx|csv|tsv)$/i.test(input.fileName)) {
            throw new Error('4 MB хүртэл .xlsx, .csv эсвэл .tsv файл сонгоно уу');
        }
        const source = z.string().trim().min(1).max(120).parse(input.source);
        const latest = await db.from('erp_imports').select('*').eq('shop_id', input.shopId).eq('source', source)
            .order('sequence', { ascending: false }).limit(1).maybeSingle();
        if (latest.error) return unavailable;
        const previous = latest.data as ErpImport | null;
        const sheets = await readWorkbookSheets(input.buffer);
        if (sheets.length > ERP_LIMITS.sheets || sheets.reduce((n, s) => n + s.rows.length, 0) > ERP_LIMITS.rows) throw new Error('Нэг импорт 30 sheet, 20,000 мөрөөс ихгүй байна');
        if (!sheets.length) throw new Error('Файлд толгой мөртэй мэдээлэл алга');
        if (input.action === 'inspect') {
            return { ok: true, body: { previousId: previous?.id ?? null, previousDate: previous?.report_date ?? null,
                sheets: sheets.map(s => ({ name: s.name, columns: s.columns, count: s.rows.length, sample: s.rows.slice(0, 2), keyColumns: previous?.datasets.find(d => d.name === s.name)?.keyColumns ?? [] })) } };
        }
        const raw = typeof input.options === 'string' || input.options === undefined ? JSON.parse(String(input.options)) : input.options;
        const options = ErpOptionsSchema.parse({ source, ...(raw && typeof raw === 'object' ? raw : {}) });
        if (options.source !== source) throw new Error('Импортын эх үүсвэр өөрчлөгдсөн байна');
        const datasets = normalizeErpSheets(sheets, options.keys);
        const content = JSON.stringify(datasets);
        if (Buffer.byteLength(content) > 16 * 1024 * 1024) throw new Error('Задалсан мэдээлэл 16 MB-аас их байна. Эх үүсвэрээр нь салгана уу');
        const hash = createHash('sha256').update(content).digest('hex');
        // Retry after a lost response returns the original immutable import.
        if (input.action === 'commit') {
            const existing = await db.from('erp_imports').select('id,content_hash,report_date,source').eq('shop_id', input.shopId).eq('id', options.requestId).maybeSingle();
            if (existing.error) return unavailable;
            if (existing.data) {
                if (existing.data.content_hash !== hash || existing.data.report_date !== options.reportDate || existing.data.source !== source) throw new Error('Хүсэлтийн ID өөр файлтай давхардлаа');
                return { ok: true, body: { id: existing.data.id } };
            }
        }
        if (options.reportDate > ubDateStr() || (previous && options.reportDate < previous.report_date)) throw new Error('Огноо сүүлийн импортоос хойш, өнөөдрөөс хэтрээгүй байна');
        if (options.expectedPrevious !== (previous?.id ?? null)) return { ok: false, status: 409, error: 'Өөр импорт нэмэгдсэн байна. Файлыг дахин шалгана уу' };
        const report = compareErp(previous?.datasets ?? null, datasets);
        const { changes, ...summary } = report;
        if (input.action === 'preview') {
            return { ok: true, body: { ...summary, changes: changes.filter(c => c.kind !== 'unchanged').slice(0, 30), previousDate: previous?.report_date ?? null } };
        }
        if (input.action !== 'commit') throw new Error('Үйлдэл буруу');
        const { data, error } = await db.rpc('commit_erp_import', { p_id: options.requestId, p_shop: input.shopId, p_source: source, p_date: options.reportDate, p_file: input.fileName.slice(0, 255), p_hash: hash, p_user: input.userId, p_previous: options.expectedPrevious, p_datasets: datasets, p_summary: summary });
        if (error?.code === '40001') return { ok: false, status: 409, error: 'Өөр импорт нэмэгдсэн байна. Дахин шалгана уу' };
        if (error) return unavailable;
        return { ok: true, body: { id: data } };
    } catch (error) {
        return { ok: false, status: 400, error: error instanceof z.ZodError ? 'Импортын тохиргоо буруу байна' : error instanceof Error ? error.message : 'Файл уншиж чадсангүй' };
    }
}
