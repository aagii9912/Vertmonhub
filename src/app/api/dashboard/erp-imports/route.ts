import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId, getUserShop, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { buildWorkbookBuffer } from '@/lib/utils/xlsx';
import { compareErp, ERP_LIMITS, erpWeek, type ErpImport } from '@/lib/erp/import';
import { runErpImport } from '@/lib/erp/import-run';
import { fetchAllRows } from '@/lib/utils/pagination';

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
    if (q.get('sources') === '1') {
        try {
            const rows = await fetchAllRows<{ source: string }>((from, to) => db.from('erp_imports')
                .select('source').eq('shop_id', shop.id).order('sequence', { ascending: false }).range(from, to));
            return NextResponse.json({ sources: [...new Set(rows.map(row => row.source))] }, { headers: noCache });
        } catch {
            return failure();
        }
    }
    if (!id) {
        let source = q.get('source')?.trim();
        if (!source) {
            const latest = await db.from('erp_imports').select('source').eq('shop_id', shop.id)
                .order('sequence', { ascending: false }).limit(1).maybeSingle();
            if (latest.error) return failure();
            source = latest.data?.source ?? 'ERP';
        }
        const page = Math.max(0, Math.min(10000, Number(q.get('page')) || 0));
        const { data, error, count } = await db.from('erp_imports').select(metadata, { count: 'exact' }).eq('shop_id', shop.id).eq('source', source).order('sequence', { ascending: false }).range(page * 50, page * 50 + 49);
        if (error) return failure();
        return NextResponse.json({ imports: data, total: count, source, week: erpWeek() }, { headers: noCache });
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
        if (!(file instanceof File)) throw new Error('4 MB хүртэл .xlsx, .csv эсвэл .tsv файл сонгоно уу');
        // Дүрэм нь AI `import_erp_file`-тэй нэг (`runErpImport`).
        const result = await runErpImport(supabaseAdmin(), {
            shopId: shop.id, userId, fileName: file.name, buffer: await file.arrayBuffer(),
            source: form.get('source'), action: form.get('action'), options: form.get('options'),
        });
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json(result.body, { headers: noCache });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Файл уншиж чадсангүй' }, { status: 400 });
    }
}
