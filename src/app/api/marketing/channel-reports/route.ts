import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { ubDateStr } from '@/lib/utils/date';
import {
    CHANNEL_SOURCE_LABELS, CHANNEL_SPLIT_MAX_WEEKS, ChannelMappingSchema, ChannelPeriodSchema, ChannelSourceSchema, aggregateByReviewWeeks,
    aggregateChannelReport, applyRememberedMapping, channelSplitWeeks, headerSignature, mappedField, pickDuplicateReport, splitWeekSkip,
    splitWeekSummary, suggestMapping,
    type ChannelExistingReport, type ChannelMapping, type ChannelPreviewResponse, type ChannelSource, type ChannelSplitPreview, type ChannelSplitSkip,
} from '@/lib/marketing/channel-reports';
import { CHANNEL_FILE_LIMITS, ChannelFileError, channelFileHash, readChannelFile, sampleValues } from '@/lib/marketing/channel-reports-file';
import {
    CHANNEL_MAPPINGS_TABLE, CHANNEL_REPORTS_MIGRATION_HINT, CHANNEL_REPORTS_TABLE, CHANNEL_REPORT_LEGACY_COLUMNS, CHANNEL_REPORT_SUMMARY_COLUMNS,
    ChannelReportsUnavailableError, isApiReportLockError, isMissingChannelTables, isMissingOriginColumns, legacyChannelSummary, loadChannelReports,
} from '@/lib/marketing/channel-reports-load';

/**
 * Маркетингийн сувгийн экспорт импорт (Meta Ads, Facebook хуудас, CallPro, масс SMS) — идэвхтэй shop-оор.
 *
 * GET ?from&to&source — хадгалсан тайлангууд (сүүлийнх нь эхэнд) + эх үүсвэр бүрийн хугацаанд
 *   тохирох тайлан, өмнөх тайлантай харьцуулалт.
 * POST multipart { file, source, period_from, period_to, mode=preview|save, sheet?, mapping? (JSON), note?, split?=0|1, weeks? } —
 *   файлыг серверт уншиж, толгой, санал болгосон / сануулсан холболт, нэгтгэл, анхааруулгыг буцаана;
 *   өдрөөр задалсан Meta файл олон хурлын долоо хоног (Лхагва–Мягмар) хамарвал долоо хоног бүрийн
 *   урьдчилсан дүнг (`split`) нэмж өгнө. save үед ижил хугацааны тайланг дарж хадгална (upsert);
 *   split=1 бол долоо хоног бүрт нэг мөр (хугацаа = бүтэн долоо хоног, data_from/data_to = файлын
 *   хамарсан өдрүүд). `weeks` (долоо хоногийн эхлэх өдрүүд, таслалаар) өгвөл зөвхөн тэдгээрийг, үгүй бол
 *   алгасах шалтгаангүй (`splitWeekSkip`) долоо хоногуудыг хадгалж, бусдыг `skipped`-д буцаана.
 *   Meta API-аас татсан (origin='api') тайланг файлаар дарахгүй — 409 (өгөгдлийн санд ч trigger). Холболтыг сануулна.
 * DELETE ?id — идэвхтэй shop-ийн тайланг устгана.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const MODULE = 'marketing-roi';
const noStore = { 'Cache-Control': 'private, no-store' };
const unavailable = () => NextResponse.json({ error: CHANNEL_REPORTS_MIGRATION_HINT }, { status: 503 });
const badRequest = (error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status: 400 });
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Хуваах үед хадгалах долоо хоногуудын эхлэх өдөр, таслалаар (14 хүртэл). */
const WEEK_LIST = new RegExp(`^\\d{4}-\\d{2}-\\d{2}(?:,\\d{4}-\\d{2}-\\d{2}){0,${CHANNEL_SPLIT_MAX_WEEKS - 1}}$`);

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
    split: z.enum(['0', '1']).optional(),
    weeks: z.string().regex(WEEK_LIST).optional(),
}).strict();
const periodKey = (period: { from: string; to: string }) => `${period.from}|${period.to}`;

export const GET = withRoute({ module: MODULE, error: 'Сувгийн тайлан уншиж чадсангүй.' }, async ({ request, shop }) => {
    const params = request.nextUrl.searchParams;
    const query = ListQuery.safeParse({ from: params.get('from') || undefined, to: params.get('to') || undefined, source: params.get('source') || undefined });
    if (!query.success) return badRequest(query.error.issues[0]?.message ?? 'Шүүлтүүр буруу байна.');
    const { from, to, source } = query.data;
    const range = from && to ? { from, to } : null;
    const db = supabaseAdmin();

    const list = (columns: string) => {
        let query = db.from(CHANNEL_REPORTS_TABLE).select(columns).eq('shop_id', shop.id);
        if (source) query = query.eq('source', source);
        if (range) query = query.lte('period_from', range.to).gte('period_to', range.from);
        return query.order('period_to', { ascending: false }).order('updated_at', { ascending: false }).limit(200);
    };
    const current = await list(CHANNEL_REPORT_SUMMARY_COLUMNS);
    let reports: unknown[] | null = current.data, error = current.error;
    // 20261005120000 миграци ороогүй ч жагсаалт ажиллана (эх сурвалж 'file', хамралт тодорхойгүй).
    if (error && isMissingOriginColumns(error)) {
        const legacy = await list(CHANNEL_REPORT_LEGACY_COLUMNS);
        error = legacy.error;
        reports = (legacy.data as Array<Parameters<typeof legacyChannelSummary>[0]> | null)?.map(legacyChannelSummary) ?? null;
    }
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
    const fields = UploadFields.safeParse({ source: text('source'), mode: text('mode'), period_from: text('period_from'), period_to: text('period_to'), sheet: text('sheet'), note: text('note'), split: text('split'), weeks: text('weeks') });
    if (!fields.success) return badRequest('Эх үүсвэр, хугацаа эсвэл үйлдэл буруу байна.');
    const { source, mode, sheet, note } = fields.data;
    const split = fields.data.split === '1';
    const chosenWeeks = fields.data.weeks ? [...new Set(fields.data.weeks.split(','))] : null;
    if (chosenWeeks && !split) return badRequest('Долоо хоног сонгох нь зөвхөн хурлын долоо хоногоор хуваах үед хамаарна.');
    const period = ChannelPeriodSchema.safeParse({ from: fields.data.period_from, to: fields.data.period_to });
    if (!period.success) return badRequest(period.error.issues[0]?.message ?? 'Хугацаа буруу байна.');
    const today = ubDateStr();
    if (period.data.from > today) return badRequest('Ирээдүйн хугацааны тайлан оруулах боломжгүй.');

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
    const options = { firstLine: table.firstLine };
    const result = aggregateChannelReport(table.rows, mapping, source, { ...options, period: period.data });
    // Өдрөөр задалсан Meta файл олон хурлын долоо хоног хамарвал долоо хоног бүрээр тусад нь нэгтгэнэ.
    const weeks = channelSplitWeeks(result);
    const weekResults = weeks.length && (mode === 'preview' || split) ? aggregateByReviewWeeks(table.rows, mapping, source, weeks, options) : [];
    const contentHash = channelFileHash(bytes);

    /** Ижил shop, эх үүсвэр, хугацааны хадгалсан тайлангууд (`from|to` → тайлан). */
    const findExisting = async (periods: ReadonlyArray<{ from: string; to: string }>) => {
        const { data, error } = await db.from(CHANNEL_REPORTS_TABLE).select('id,period_from,period_to,file_name,updated_at,origin,content_hash,data_from,data_to')
            .eq('shop_id', shop.id).eq('source', source).in('period_from', [...new Set(periods.map(p => p.from))]);
        if (error) throw error;
        const wanted = new Set(periods.map(periodKey));
        return new Map((data ?? []).filter(row => wanted.has(periodKey({ from: row.period_from, to: row.period_to })))
            .map(row => [periodKey({ from: row.period_from, to: row.period_to }), {
                id: row.id, file_name: row.file_name, updated_at: row.updated_at, origin: row.origin, sameFile: row.content_hash === contentHash,
                data_from: row.data_from ?? null, data_to: row.data_to ?? null,
            } satisfies ChannelExistingReport]));
    };

    if (mode === 'preview') {
        let existing: Map<string, ChannelExistingReport> = new Map();
        let duplicate = null;
        if (storageReady) {
            try {
                const [found, hash] = await Promise.all([
                    findExisting([period.data, ...weekResults.map(w => w.week)]),
                    db.from(CHANNEL_REPORTS_TABLE).select('id,source,period_from,period_to').eq('shop_id', shop.id).eq('content_hash', contentHash)
                        .order('updated_at', { ascending: false }).limit(20),
                ]);
                if (hash.error) throw hash.error;
                existing = found;
                // Огноотой файлыг өөр долоо хоногт дахин ашиглах нь давхар биш; огноогүй файлыг өөр хугацаанд оруулбал анхааруулна.
                duplicate = pickDuplicateReport(hash.data ?? [], { source, period: period.data, dated: !!result.detectedPeriod });
            } catch (error) {
                if (!isMissingChannelTables(error as { code?: string; message?: string })) throw error instanceof Error ? error : new Error((error as { message?: string }).message);
                storageReady = false;
            }
        }
        const detected = result.detectedPeriod;
        const splitPreview: ChannelSplitPreview | null = weekResults.length && detected ? {
            period: detected,
            weeks: weekResults.map(({ week, result: weekResult }) => splitWeekSummary(week, weekResult, existing.get(periodKey(week)) ?? null)),
            result: aggregateChannelReport(table.rows, mapping, source, { ...options, period: detected }),
        } : null;
        return NextResponse.json({
            mode, storageReady, file: { name: file.name, size: file.size },
            sheets: table.sheets, sheet: table.sheet, headerRow: table.headerRow, headers: table.headers,
            sample: sampleValues(table), mapping, suggested: suggestMapping(table.headers, source), mappingOrigin: origin,
            result, existing: existing.get(periodKey(period.data)) ?? null, duplicate, split: splitPreview,
        } satisfies ChannelPreviewResponse, { headers: noStore });
    }

    if (!storageReady) return unavailable();
    if (split && !weekResults.length) return badRequest('Энэ файлыг хурлын долоо хоногоор хуваах боломжгүй: өдрөөр задалсан, нэгээс олон долоо хоног хамарсан Meta экспорт шаардлагатай.');
    if (weekResults.some(({ week }) => week.from > today)) return badRequest('Ирээдүйн хугацааны тайлан оруулах боломжгүй.');
    const unknownWeeks = (chosenWeeks ?? []).filter(from => !weekResults.some(({ week }) => week.from === from));
    if (unknownWeeks.length) return badRequest(`Сонгосон долоо хоног (${unknownWeeks.join(', ')}) энэ файлд алга. Файлаа дахин шалгана уу.`);
    // Хуваах үед сонгосон хугацаа хамаарахгүй — долоо хоног бүрийн нэгтгэлийг л шалгана.
    const candidates = split ? weekResults : [{ week: period.data, result }];
    const errors = [...new Set(candidates.flatMap(t => t.result.errors))];
    if (errors.length) return badRequest(errors[0], { errors });

    let existing: Map<string, ChannelExistingReport>;
    try { existing = await findExisting(candidates.map(t => t.week)); } catch (error) {
        if (isMissingChannelTables(error as { code?: string; message?: string })) return unavailable();
        throw error instanceof Error ? error : new Error((error as { message?: string }).message);
    }
    // Хуваах үед: сонгосон долоо хоногууд, сонгоогүй бол алгасах шалтгаангүйнүүд (API-ийн тайлан, илүү бүрэн хадгалсан тайланг үлдээнэ).
    const plans = candidates.map(target => ({ ...target, skip: split ? splitWeekSkip(target.week, target.result.dataPeriod, existing.get(periodKey(target.week)) ?? null) : null }));
    const targets = plans.filter(({ week, skip }) => chosenWeeks ? chosenWeeks.includes(week.from) : !skip);
    const skipped = plans.filter(plan => !targets.includes(plan))
        .map(({ week, skip }) => ({ from: week.from, to: week.to, reason: (skip ?? 'unselected') as ChannelSplitSkip | 'unselected' }));
    // Meta API-аас автоматаар татсан тайланг файлаар дарж бичихгүй.
    const locked = targets.filter(({ week }) => existing.get(periodKey(week))?.origin === 'api');
    if (locked.length) return apiLocked(locked.map(({ week }) => week), source);
    if (!targets.length) {
        return NextResponse.json({
            error: 'Хадгалах долоо хоног алга: бүх долоо хоногийн тайлан Meta API-аас татсан эсвэл илүү олон өдөр хамарсан файлаар хадгалагдсан байна. Солих бол долоо хоногоо сонгож хадгална уу.',
            skipped,
        }, { status: 409 });
    }

    const importedBy = await getUserId();
    const rows = targets.map(({ week, result: weekResult }) => ({
        shop_id: shop.id, source, period_from: week.from, period_to: week.to,
        file_name: file.name.slice(0, 255),
        content_hash: contentHash,
        origin: 'file' as const,
        data_from: weekResult.dataPeriod?.from ?? null,
        data_to: weekResult.dataPeriod?.to ?? null,
        totals: weekResult.totals,
        breakdown: weekResult.breakdown,
        mapping,
        warnings: weekResult.warnings,
        row_count: weekResult.rowCount,
        note: note || null,
        imported_by: importedBy,
    }));
    const upsert = db.from(CHANNEL_REPORTS_TABLE).upsert(split ? rows : rows[0], { onConflict: 'shop_id,source,period_from,period_to' }).select(CHANNEL_REPORT_SUMMARY_COLUMNS);
    const { data: saved, error } = split ? await upsert : await upsert.single();
    if (error) {
        if (isMissingChannelTables(error)) return unavailable();
        // Шалгасны дараа Meta API синк ижил хугацааг бичсэн бол өгөгдлийн сангийн trigger татгалзана (юу ч хадгалагдаагүй).
        if (isApiReportLockError(error)) return apiLocked(targets.map(({ week }) => week), source, true);
        throw new Error(error.message);
    }
    // Холболтыг сануулах нь туслах үйлдэл: амжилтгүй бол тайлан хадгалагдсан хэвээр, дараа дахин сонгоно.
    const remember = await db.from(CHANNEL_MAPPINGS_TABLE)
        .upsert({ shop_id: shop.id, source, mapping, header_signature: headerSignature(table.headers) }, { onConflict: 'shop_id,source' });
    if (remember.error) logger.warn('[ChannelReports] mapping not remembered', { error: remember.error.message });
    return NextResponse.json(split ? { mode, reports: saved, skipped, mappingSaved: !remember.error } : { mode, report: saved, mappingSaved: !remember.error }, { headers: noStore });
});

/** Meta API-аас татсан тайланг файлаар дарахгүй — 409. `race` = шалгасны дараа синк бичсэн (өгөгдлийн сангийн trigger). */
function apiLocked(weeks: Array<{ from: string; to: string }>, source: ChannelSource, race = false) {
    return NextResponse.json({
        error: race
            ? `Хадгалах үед ${CHANNEL_SOURCE_LABELS[source]}-ийн тайланг Meta API-аас шинэчилсэн тул юу ч хадгалсангүй. Файлаа дахин шалгаж хадгална уу.`
            : `${weeks.map(week => `${week.from} – ${week.to}`).join(', ')} хугацааны ${CHANNEL_SOURCE_LABELS[source]} тайланг Meta API-аас автоматаар татсан тул файлаар дарж бичихгүй. Тэр хугацааг оруулалгүй (хуваахгүйгээр өөр хугацаагаар) хадгална уу.`,
        ...(race ? {} : { locked: weeks }),
    }, { status: 409 });
}

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
