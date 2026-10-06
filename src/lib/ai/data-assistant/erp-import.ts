/**
 * AI tool — чатад хавсаргасан ERP экспортыг (xlsx/csv/tsv) «ERP импорт» хуудастай ижил дүрмээр
 * (`runErpImport`) өөрчлөгдөхгүй snapshot болгоно: эхлээд харьцуулсан урьдчилсан карт, батлагдсаны
 * дараа commit. Хавсралтыг хувийн bucket-аас эрхийг нь дахин шалгаж уншина.
 */

import { randomUUID } from 'node:crypto';
import { supabaseAdmin as adminClient } from '@/lib/supabase';
import { canReadPrivateAttachment, parsePrivateAttachmentUrl, PRIVATE_ATTACHMENT_BUCKET } from '@/lib/ai/private-attachments';
import { runErpImport } from '@/lib/erp/import-run';
import { suggestErpKeyColumns } from '@/lib/erp/records';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr } from '@/lib/utils/date';
import type { AssistantPerms } from './index';

type Args = Record<string, any>;
type SheetInfo = { name: string; columns: string[]; count: number; keyColumns: string[] };
type DatasetSummary = { name: string; total: number; baseline: number; added: number; changed: number; missing: number };

async function readAttachment(shopId: string, userId: string, perms: AssistantPerms, url: string) {
    const parsed = parsePrivateAttachmentUrl(url);
    const ext = parsed?.path.toLowerCase().match(/\.(xlsx|csv|tsv)$/)?.[1];
    if (!parsed || parsed.shopId !== shopId || !ext) return { error: 'Энэ төслийн чатад хавсаргасан .xlsx/.csv/.tsv файлын URL-ийг яг өгнө үү' };
    const db = adminClient();
    if (!await canReadPrivateAttachment(db, url, { shopId, userId, perms }).catch(() => false)) return { error: 'Хавсралтыг унших эрх алга' };
    const { data, error } = await db.storage.from(PRIVATE_ATTACHMENT_BUCKET).download(parsed.path);
    if (error || !data) return { error: 'Хавсралтыг татаж чадсангүй. Файлаа дахин хавсаргана уу.' };
    return { buffer: await data.arrayBuffer(), storedName: parsed.path.split('/').pop()!, ext };
}

/** Хэрэглэгчид харагдах нэр: хавсаргасан нэр нь ижил өргөтгөлтэй бол түүнийг, эс бөгөөс хадгалсан нэр. */
const displayName = (requested: unknown, storedName: string, ext: string) =>
    typeof requested === 'string' && requested.trim().toLowerCase().endsWith(`.${ext}`) ? requested.trim().slice(0, 255) : storedName;

export async function importErpFileTool(shopId: string, args: Args, confirm: boolean, userId: string, perms: AssistantPerms) {
    const url = String(args.file_url || '');
    const file = await readAttachment(shopId, userId, perms, url);
    if ('error' in file) return file;
    const db = adminClient();
    const fileName = displayName(args.file_name, file.storedName, file.ext);

    let source = typeof args.source === 'string' ? args.source.trim() : '';
    if (!source) {
        let sources: string[];
        try {
            const rows = await fetchAllRows<{ source: string }>((from, to) => db.from('erp_imports').select('source')
                .eq('shop_id', shopId).order('sequence', { ascending: false }).range(from, to));
            sources = [...new Set(rows.map((row) => row.source))];
        } catch {
            return { error: 'ERP импортын түүхийг уншиж чадсангүй.' };
        }
        if (sources.length !== 1) {
            return { error: sources.length ? `Аль ERP эх үүсвэрт оруулах вэ: ${sources.join(', ')}` : 'Энэ төслийн анхны ERP импорт — эх үүсвэрийн нэрийг асууна уу (жишээ: «Elysium ERP»)', options: sources };
        }
        source = sources[0];
    }
    const base = { shopId, userId, fileName, buffer: file.buffer, source };

    if (confirm) {
        const committed = await runErpImport(db, { ...base, action: 'commit', options: {
            reportDate: args.report_date, keys: args.keys, expectedPrevious: args.expected_previous ?? null, requestId: args.request_id,
        } });
        if (!committed.ok) return { error: committed.error };
        return { success: true, message: `ERP «${source}»-ийн ${args.report_date}-ны экспортыг импортлолоо.`, importId: committed.body.id, url: '/dashboard/reports/erp' };
    }

    const inspected = await runErpImport(db, { ...base, action: 'inspect' });
    if (!inspected.ok) return { error: inspected.error };
    const sheets = inspected.body.sheets as SheetInfo[];
    const keys: Record<string, string[]> = {};
    const unknown: string[] = [];
    for (const sheet of sheets) {
        const columns = sheet.keyColumns.length ? sheet.keyColumns : suggestErpKeyColumns(sheet.columns);
        if (columns.length) keys[sheet.name] = columns;
        else unknown.push(sheet.name);
    }
    if (unknown.length) return { error: `ID багана тодорхойгүй sheet: ${unknown.join(', ')}. «ERP импорт» хуудсаар ID баганаа сонгож оруулна уу.` };

    const reportDate = typeof args.report_date === 'string' && args.report_date ? args.report_date : ubDateStr();
    const expectedPrevious = (inspected.body.previousId as string | null) ?? null;
    const requestId = randomUUID();
    const previewed = await runErpImport(db, { ...base, action: 'preview', options: { reportDate, keys, expectedPrevious, requestId } });
    if (!previewed.ok) return { error: previewed.error };
    const preview: Record<string, unknown> = {
        Файл: fileName, 'Эх үүсвэр': source, Огноо: reportDate,
        'Өмнөх импорт': (previewed.body.previousDate as string | null) ?? 'Анхны суурь',
    };
    for (const dataset of previewed.body.datasets as DatasetSummary[]) {
        preview[dataset.name] = dataset.baseline
            ? `${dataset.total} мөр (анхны суурь)`
            : `${dataset.total} мөр · шинэ ${dataset.added} · өөрчлөгдсөн ${dataset.changed} · файлд байхгүй ${dataset.missing}`;
    }
    return {
        requiresConfirmation: true,
        action: { tool: 'import_erp_file', args: { file_url: url, file_name: fileName, source, report_date: reportDate, keys, expected_previous: expectedPrevious, request_id: requestId } },
        label: `ERP импорт: ${source} (${reportDate})`,
        preview,
    };
}
