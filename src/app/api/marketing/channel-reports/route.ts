import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { ubDateStr } from '@/lib/utils/date';
import {
    ChannelMappingSchema, ChannelPeriodSchema, ChannelSourceSchema, aggregateChannelReport, applyRememberedMapping,
    headerSignature, mappedField, suggestMapping, type ChannelMapping,
} from '@/lib/marketing/channel-reports';
import { CHANNEL_FILE_LIMITS, ChannelFileError, channelFileHash, readChannelFile, sampleValues } from '@/lib/marketing/channel-reports-file';
import {
    CHANNEL_MAPPINGS_TABLE, CHANNEL_REPORTS_MIGRATION_HINT, CHANNEL_REPORTS_TABLE, CHANNEL_REPORT_SUMMARY_COLUMNS,
    ChannelReportsUnavailableError, isMissingChannelTables, loadChannelReports,
} from '@/lib/marketing/channel-reports-load';

/**
 * Маркетингийн сувгийн экспорт импорт (Meta Ads, Facebook хуудас, CallPro, масс SMS) — идэвхтэй shop-оор.
 *
 * GET ?from&to&source — хадгалсан тайлангууд (сүүлийнх нь эхэнд) + эх үүсвэр бүрийн хугацаанд
 *   тохирох тайлан, өмнөх тайлантай харьцуулалт.
 * POST multipart { file, source, period_from, period_to, mode=preview|save, sheet?, mapping? (JSON), note? } —
 *   файлыг серверт уншиж, толгой, санал болгосон / сануулсан холболт, нэгтгэл, анхааруулгыг буцаана;
 *   save үед ижил хугацааны тайланг дарж хадгалж (upsert), холболтыг сануулна.
 * DELETE ?id — идэвхтэй shop-ийн тайланг устгана.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const MODULE = 'marketing-roi';
const noStore = { 'Cache-Control': 'private, no-store' };
const unavailable = () => NextResponse.json({ error: CHANNEL_REPORTS_MIGRATION_HINT }, { status: 503 });
const badRequest = (error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status: 400 });
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const ListQuery = z.object({
    from: dayString.optional(),
    to: dayString.optional(),
    source: ChannelSourceSchema.optional(),
}).refine(q => !!q.from === !!q.to, 'Эхлэх, дуусах өдрийг хоёуланг нь өгнө үү.')
    .refine(q => !q.from || !q.to || (q.from <= q.to && (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000 <= 366), '367 хүртэл өдрийн зөв хугацаа сонгоно уу.');

const UploadFields = z.object({
    source: ChannelSourceSchema,
    mode: z.enum(['preview', 'save']),
    period_from: z.string(),
    period_to: z.string(),
    sheet: z.string().trim().max(100).optional(),
    note: z.string().trim().max(2000).optional(),
});

export const GET = withRoute({ module: MODULE, error: 'Сувгийн тайлан уншиж чадсангүй.' }, async ({ request, shop }) => {
    const params = request.nextUrl.searchParams;
    const query = ListQuery.safeParse({ from: params.get('from') || undefined, to: params.get('to') || undefined, source: params.get('source') || undefined });
    if (!query.success) return badRequest(query.error.issues[0]?.message ?? 'Шүүлтүүр буруу байна.');
    const { from, to, source } = query.data;
    const range = from && to ? { from, to } : null;
    const db = supabaseAdmin();

    let list = db.from(CHANNEL_REPORTS_TABLE).select(CHANNEL_REPORT_SUMMARY_COLUMNS).eq('shop_id', shop.id);
    if (source) list = list.eq('source', source);
    if (range) list = list.lte('period_from', range.to).gte('period_to', range.from);
    const { data: reports, error } = await list.order('period_to', { ascending: false }).order('updated_at', { ascending: false }).limit(200);
    if (error) {
        if (isMissingChannelTables(error)) return unavailable();
        throw new Error(error.message);
    }
    try {
        const latest = await loadChannelReports(db, shop.id, range, { sources: source ? [source] : undefined });
        return NextResponse.json({ reports: reports ?? [], latest }, { headers: noStore });
    } catch (loadError) {
        if (loadError instanceof ChannelReportsUnavailableError) return unavailable();
        throw loadError;
    }
});

export const POST = withRoute({ module: MODULE, access: 'write', error: 'Файлыг боловсруулж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    if (Number(request.headers.get('content-length')) > CHANNEL_FILE_LIMITS.bytes + 65_536)
        return NextResponse.json({ error: '4 MB хүртэл файл оруулна уу.' }, { status: 413 });
    let form: FormData;
    try { form = await request.formData(); } catch { return badRequest('Файл илгээх хүсэлт буруу байна.'); }

    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return badRequest('Экспорт файлаа сонгоно уу.');
    if (/\.xls$/i.test(file.name)) return badRequest('.xls (Excel 97-2003) формат дэмжигдэхгүй. Файлаа .xlsx эсвэл .csv болгон хадгална уу.');
    if (!/\.(xlsx|csv|tsv)$/i.test(file.name)) return badRequest('Зөвхөн .xlsx, .csv, .tsv файл оруулна.');
    if (file.size > CHANNEL_FILE_LIMITS.bytes) return NextResponse.json({ error: '4 MB хүртэл файл оруулна уу.' }, { status: 413 });

    const text = (key: string) => { const value = form.get(key); return typeof value === 'string' && value.trim() ? value : undefined; };
    const fields = UploadFields.safeParse({ source: text('source'), mode: text('mode'), period_from: text('period_from'), period_to: text('period_to'), sheet: text('sheet'), note: text('note') });
    if (!fields.success) return badRequest('Эх үүсвэр, хугацаа эсвэл үйлдэл буруу байна.');
    const { source, mode, sheet, note } = fields.data;
    const period = ChannelPeriodSchema.safeParse({ from: fields.data.period_from, to: fields.data.period_to });
    if (!period.success) return badRequest(period.error.issues[0]?.message ?? 'Хугацаа буруу байна.');
    if (period.data.from > ubDateStr()) return badRequest('Ирээдүйн хугацааны тайлан оруулах боломжгүй.');

    let clientMapping: ChannelMapping | null = null;
    const rawMapping = text('mapping');
    if (rawMapping) {
        let parsed: unknown;
        try { parsed = JSON.parse(rawMapping); } catch { return badRequest('Баганын холболт буруу байна.'); }
        const mapping = ChannelMappingSchema.safeParse(parsed);
        if (!mapping.success) return badRequest('Баганын холболт буруу байна.');
        clientMapping = mapping.data;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let table: Awaited<ReturnType<typeof readChannelFile>>;
    try { table = await readChannelFile(bytes, source, sheet); } catch (error) {
        if (error instanceof ChannelFileError) return badRequest(error.message);
        throw error;
    }

    const db = supabaseAdmin();
    let storageReady = true;
    let remembered: ChannelMapping | null = null;
    const memory = await db.from(CHANNEL_MAPPINGS_TABLE).select('mapping').eq('shop_id', shop.id).eq('source', source).maybeSingle();
    if (memory.error) {
        if (!isMissingChannelTables(memory.error)) throw new Error(memory.error.message);
        storageReady = false;
    } else remembered = (memory.data?.mapping as ChannelMapping | undefined) ?? null;

    const { mapping, origin } = clientMapping
        ? { mapping: Object.fromEntries(table.headers.map(header => [header, mappedField(clientMapping, header)])), origin: 'client' as const }
        : applyRememberedMapping(table.headers, source, remembered);
    const result = aggregateChannelReport(table.rows, mapping, source, { period: period.data, firstLine: table.firstLine });
    const contentHash = channelFileHash(bytes);
    const periodKey = { shop_id: shop.id, source, period_from: period.data.from, period_to: period.data.to };

    if (mode === 'preview') {
        let existing = null, duplicate = null;
        if (storageReady) {
            const [same, hash] = await Promise.all([
                db.from(CHANNEL_REPORTS_TABLE).select('id,file_name,updated_at').match(periodKey).maybeSingle(),
                db.from(CHANNEL_REPORTS_TABLE).select('id,source,period_from,period_to').eq('shop_id', shop.id).eq('content_hash', contentHash).limit(5),
            ]);
            if (same.error || hash.error) throw new Error((same.error ?? hash.error)!.message);
            existing = same.data;
            duplicate = (hash.data ?? []).find(r => r.id !== same.data?.id) ?? null;
        }
        return NextResponse.json({
            mode, storageReady, file: { name: file.name, size: file.size },
            sheets: table.sheets, sheet: table.sheet, headerRow: table.headerRow, headers: table.headers,
            sample: sampleValues(table), mapping, suggested: suggestMapping(table.headers, source), mappingOrigin: origin,
            result, existing, duplicate,
        }, { headers: noStore });
    }

    if (!storageReady) return unavailable();
    if (result.errors.length) return badRequest(result.errors[0], { errors: result.errors });
    const { data: report, error } = await db.from(CHANNEL_REPORTS_TABLE).upsert({
        ...periodKey,
        file_name: file.name.slice(0, 255),
        content_hash: contentHash,
        totals: result.totals,
        breakdown: result.breakdown,
        mapping,
        warnings: result.warnings,
        row_count: result.rowCount,
        note: note || null,
        imported_by: await getUserId(),
    }, { onConflict: 'shop_id,source,period_from,period_to' }).select(CHANNEL_REPORT_SUMMARY_COLUMNS).single();
    if (error) {
        if (isMissingChannelTables(error)) return unavailable();
        throw new Error(error.message);
    }
    // Холболтыг сануулах нь туслах үйлдэл: амжилтгүй бол тайлан хадгалагдсан хэвээр, дараа дахин сонгоно.
    const remember = await db.from(CHANNEL_MAPPINGS_TABLE)
        .upsert({ shop_id: shop.id, source, mapping, header_signature: headerSignature(table.headers) }, { onConflict: 'shop_id,source' });
    if (remember.error) logger.warn('[ChannelReports] mapping not remembered', { error: remember.error.message });
    return NextResponse.json({ mode, report, mappingSaved: !remember.error }, { headers: noStore });
});

export const DELETE = withRoute({ module: MODULE, access: 'delete', error: 'Тайланг устгаж чадсангүй.' }, async ({ request, shop }) => {
    const id = request.nextUrl.searchParams.get('id');
    if (!z.uuid().safeParse(id).success) return badRequest('Тайлангийн ID буруу байна.');
    const { data, error } = await supabaseAdmin().from(CHANNEL_REPORTS_TABLE).delete().eq('id', id).eq('shop_id', shop.id).select('id').maybeSingle();
    if (error) {
        if (isMissingChannelTables(error)) return unavailable();
        throw new Error(error.message);
    }
    if (!data) return NextResponse.json({ error: 'Тайлан олдсонгүй.' }, { status: 404 });
    return NextResponse.json({ success: true }, { headers: noStore });
});
