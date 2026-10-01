import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId, getUserShop, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { readWorkbookSheets, buildWorkbookBuffer } from '@/lib/utils/xlsx';
import { compareErp, normalizeErpSheets, ErpOptionsSchema, ERP_LIMITS, erpWeek, type ErpImport } from '@/lib/erp/import';
import { ubDateStr } from '@/lib/utils/date';

export const runtime = 'nodejs';
export const maxDuration = 60;
const metadata = 'id,source,report_date,file_name,created_at,previous_id,summary';
const noCache = { 'Cache-Control': 'no-store' };
const failure = () => NextResponse.json({ error: 'ERP мэдээлэл уншиж чадсангүй. ERP migration болон холболтыг шалгана уу.' }, { status: 503 });

export async function GET(req: NextRequest) {
    const denied = await requireModule('erp-imports'); if (denied) return denied;
    const shop = await getUserShop(); if (!shop) return NextResponse.json({ error: 'Төсөлд хандах эрх алга' }, { status: 403 });
    const db = supabaseAdmin();
    const q = req.nextUrl.searchParams;
    const id = q.get('id');
    if (!id) {
        const source = q.get('source')?.trim() || 'ERP';
        const page = Math.max(0, Math.min(10000, Number(q.get('page')) || 0));
        const { data, error, count } = await db.from('erp_imports').select(metadata, { count: 'exact' }).eq('shop_id', shop.id).eq('source', source).order('sequence', { ascending: false }).range(page * 50, page * 50 + 49);
        if (error) return failure();
        return NextResponse.json({ imports: data, total: count, week: erpWeek() }, { headers: noCache });
    }
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Импортын ID буруу' }, { status: 400 });
    const { data, error } = await db.from('erp_imports').select('*').eq('shop_id', shop.id).eq('id', id).maybeSingle();
    if (error) return failure();
    if (!data) return NextResponse.json({ error: 'Импорт олдсонгүй' }, { status: 404 });
    const current = data as ErpImport;
    let previous: ErpImport | null = null;
    if (current.previous_id) {
        const result = await db.from('erp_imports').select('*').eq('shop_id', shop.id).eq('id', current.previous_id).single();
        if (result.error) return failure();
        previous = result.data as ErpImport;
    }
    const report = compareErp(previous?.datasets ?? null, current.datasets);
    const changes = report.changes.filter(c => (q.get('changesOnly') !== '1' || ['added', 'changed', 'missing'].includes(c.kind)) && (!q.get('dataset') || c.dataset === q.get('dataset')));
    if (q.get('export') === '1') {
        const labels = { baseline: 'Анхны суурь', added: 'Шинэ', changed: 'Өөрчлөгдсөн', missing: 'Файлд байхгүй', unchanged: 'Хэвээр' };
        const buffer = await buildWorkbookBuffer([
            { name: 'Нэгтгэл', rows: report.datasets.map(s => ({ Sheet: s.name, Огноо: current.report_date, Өмнөх: previous?.report_date ?? 'Суурь байхгүй', Нийт: s.total, Суурь: s.baseline, Шинэ: s.added, Өөрчлөгдсөн: s.changed, Байхгүй: s.missing, Хэвээр: s.unchanged })) },
            ...current.datasets.filter(s => !q.get('dataset') || s.name === q.get('dataset')).map(sheet => {
                const columns = [...new Set([...sheet.columns, ...(previous?.datasets.find(s => s.name === sheet.name)?.columns ?? [])])];
                return { name: sheet.name, aoa: [
                    ['ID', 'Төлөв', ...columns.flatMap(f => [`Өмнөх · ${f}`, `Шинэ · ${f}`])],
                    ...changes.filter(c => c.dataset === sheet.name).map(c => [c.key, labels[c.kind], ...columns.flatMap(f => [c.before?.[f] ?? '', c.after?.[f] ?? ''])]),
                ] };
            }),
        ]);
        return new NextResponse(buffer, { headers: { ...noCache, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="ERP-${current.report_date}.xlsx"` } });
    }
    const page = Math.max(0, Math.min(10000, Number(q.get('page')) || 0));
    return NextResponse.json({ import: { ...current, datasets: undefined }, previousDate: previous?.report_date ?? null, ...report, changes: changes.slice(page * 50, page * 50 + 50), totalChanges: changes.length }, { headers: noCache });
}

export async function POST(req: NextRequest) {
    const denied = await requireModuleWrite('erp-imports'); if (denied) return denied;
    const shop = await getUserShop(); const userId = await getUserId();
    if (!shop || !userId) return NextResponse.json({ error: 'Төсөлд хандах эрх алга' }, { status: 403 });
    if (Number(req.headers.get('content-length')) > ERP_LIMITS.bytes + 65536) return NextResponse.json({ error: 'Файл 4 MB-аас ихгүй байна' }, { status: 413 });
    try {
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File) || !file.size || file.size > ERP_LIMITS.bytes || !/\.(xlsx|csv|tsv)$/i.test(file.name)) throw new Error('4 MB хүртэл .xlsx, .csv эсвэл .tsv файл сонгоно уу');
        const source = z.string().trim().min(1).max(120).parse(form.get('source'));
        const db = supabaseAdmin();
        const latest = await db.from('erp_imports').select('*').eq('shop_id', shop.id).eq('source', source).order('sequence', { ascending: false }).limit(1).maybeSingle();
        if (latest.error) return failure();
        const previous = latest.data as ErpImport | null;
        const sheets = await readWorkbookSheets(await file.arrayBuffer());
        if (sheets.length > ERP_LIMITS.sheets || sheets.reduce((n, s) => n + s.rows.length, 0) > ERP_LIMITS.rows) throw new Error('Нэг импорт 30 sheet, 20,000 мөрөөс ихгүй байна');
        if (!sheets.length) throw new Error('Файлд толгой мөртэй мэдээлэл алга');
        if (form.get('action') === 'inspect') return NextResponse.json({ previousId: previous?.id ?? null, previousDate: previous?.report_date ?? null,
            sheets: sheets.map(s => ({ name: s.name, columns: s.columns, count: s.rows.length, sample: s.rows.slice(0, 2), keyColumns: previous?.datasets.find(d => d.name === s.name)?.keyColumns ?? [] })) }, { headers: noCache });
        const options = ErpOptionsSchema.parse({ source, ...JSON.parse(String(form.get('options'))) });
        if (options.source !== source) throw new Error('Импортын эх үүсвэр өөрчлөгдсөн байна');
        const datasets = normalizeErpSheets(sheets, options.keys);
        const content = JSON.stringify(datasets);
        if (Buffer.byteLength(content) > 16 * 1024 * 1024) throw new Error('Задалсан мэдээлэл 16 MB-аас их байна. Эх үүсвэрээр нь салгана уу');
        const hash = createHash('sha256').update(content).digest('hex');
        // Retry after a lost response returns the original immutable import.
        if (form.get('action') === 'commit') {
            const existing = await db.from('erp_imports').select('id,content_hash,report_date,source').eq('shop_id', shop.id).eq('id', options.requestId).maybeSingle();
            if (existing.error) return failure();
            if (existing.data) {
                if (existing.data.content_hash !== hash || existing.data.report_date !== options.reportDate || existing.data.source !== source) throw new Error('Хүсэлтийн ID өөр файлтай давхардлаа');
                return NextResponse.json({ id: existing.data.id });
            }
        }
        if (options.reportDate > ubDateStr() || (previous && options.reportDate < previous.report_date)) throw new Error('Огноо сүүлийн импортоос хойш, өнөөдрөөс хэтрээгүй байна');
        if (options.expectedPrevious !== (previous?.id ?? null)) return NextResponse.json({ error: 'Өөр импорт нэмэгдсэн байна. Файлыг дахин шалгана уу' }, { status: 409 });
        const report = compareErp(previous?.datasets ?? null, datasets);
        const { changes, ...summary } = report;
        if (form.get('action') === 'preview') return NextResponse.json({ ...summary, changes: changes.filter(c => c.kind !== 'unchanged').slice(0, 30), previousDate: previous?.report_date ?? null }, { headers: noCache });
        if (form.get('action') !== 'commit') throw new Error('Үйлдэл буруу');
        const { data, error } = await db.rpc('commit_erp_import', { p_id: options.requestId, p_shop: shop.id, p_source: source, p_date: options.reportDate, p_file: file.name.slice(0, 255), p_hash: hash, p_user: userId, p_previous: options.expectedPrevious, p_datasets: datasets, p_summary: summary });
        if (error?.code === '40001') return NextResponse.json({ error: 'Өөр импорт нэмэгдсэн байна. Дахин шалгана уу' }, { status: 409 });
        if (error) return failure();
        return NextResponse.json({ id: data });
    } catch (error) {
        return NextResponse.json({ error: error instanceof z.ZodError ? 'Импортын тохиргоо буруу байна' : error instanceof Error ? error.message : 'Файл уншиж чадсангүй' }, { status: 400 });
    }
}
