/**
 * Хадгалсан сувгийн тайлангуудаас тухайн хугацаанд хамгийн тохирохыг (эх үүсвэр бүрт) олж,
 * ижил урттай өмнөх тайлантай харьцуулна. Долоо хоногийн хурлын тайлан болон API ашиглана.
 * Алдааг хоосон өгөгдөл болгож нуухгүй — хүснэгт үүсээгүй бол `ChannelReportsUnavailableError`.
 * Зөвхөн 20261005120000-ийн багана (origin, data_from, data_to) дутуу бол хуучин багануудаар уншина
 * (код миграциас өмнө байршсан ч хурлын тайлан ажиллана; хадгалах нь миграци шаардана).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';
import {
    CHANNEL_SOURCES, compareWithPrevious, periodDays,
    type BreakdownRow, type ChannelMapping, type ChannelReportOrigin, type ChannelSource, type ChannelTotals, type ChannelWarning, type MetricDelta,
} from './channel-reports';
import { META_INSIGHTS_TABLE, META_INSIGHT_COLUMNS, compareMetaSameDays, metaSameDaysTotals } from './meta-channel-report';
import { presentMetaResultTypes } from './meta-results';
import type { MetaInsightRow } from './meta-result-groups';

export const CHANNEL_REPORTS_TABLE = 'marketing_channel_reports';
export const CHANNEL_MAPPINGS_TABLE = 'marketing_channel_mappings';
export const CHANNEL_REPORT_SUMMARY_COLUMNS = 'id,source,period_from,period_to,file_name,origin,data_from,data_to,totals,warnings,row_count,note,imported_by,created_at,updated_at';
/** 20261005120000-аас өмнөх хураангуй баганууд (origin, data_from, data_to-гүй). */
export const CHANNEL_REPORT_LEGACY_COLUMNS = 'id,source,period_from,period_to,file_name,totals,warnings,row_count,note,imported_by,created_at,updated_at';
export const CHANNEL_REPORTS_MIGRATION_HINT = 'Сувгийн тайлангийн хүснэгт эсвэл багана үүсээгүй байна — 20261004140000_marketing_channel_reports.sql, 20261005120000_channel_reports_origin.sql миграци шаардлагатай.';
/** Өмнөх тайланг хайх хугацаа (өдөр). */
const LOOKBACK_DAYS = 400;

export interface ChannelReportSummary {
    id: string;
    source: ChannelSource;
    period_from: string;
    period_to: string;
    file_name: string | null;
    /** 'file' = экспорт файл, 'api' = Meta Marketing API синк. */
    origin: ChannelReportOrigin;
    /** Тайлангийн хугацаанд өгөгдөлтэй өдрүүд; null = тодорхойгүй (бүтэн гэж таамаглахгүй). */
    data_from: string | null;
    data_to: string | null;
    totals: ChannelTotals;
    warnings: ChannelWarning[];
    row_count: number;
    note: string | null;
    imported_by: string | null;
    created_at: string;
    updated_at: string;
}
export interface ChannelReportRecord extends ChannelReportSummary { breakdown: BreakdownRow[]; mapping: ChannelMapping }
export interface ChannelReportMatch {
    report: ChannelReportRecord | null;
    /** Тайлангийн хугацаа сонгосон хугацаатай яг таарч байгаа эсэх. */
    exact: boolean;
    /** Тайлан сонгосон хугацаанаас урт (жишээ нь 30 хоногийн файл) — хурлын долоо хоногийн тоо биш. */
    longer: boolean;
    /** Ижил урттай, өмнө дууссан хамгийн сүүлийн тайлан. */
    previous: ChannelReportSummary | null;
    comparison: Record<string, MetricDelta> | null;
    /**
     * Meta API-ийн дуусаагүй долоо хоногийг (хурлын өглөө сүүлийн өдөр дутуу) өмнөх долоо хоногийн мөн өдрүүдтэй
     * харьцуулсан бол тэр өдрүүд (`comparison` нь reach, frequency-гүй). Байхгүй бол `comparison` = өмнөх тайлантай.
     */
    sameDays?: { from: string; to: string };
}
export type ChannelReportMatches = Record<ChannelSource, ChannelReportMatch>;

export class ChannelReportsUnavailableError extends Error {
    constructor() {
        super(CHANNEL_REPORTS_MIGRATION_HINT);
        this.name = 'ChannelReportsUnavailableError';
    }
}

/** Хүснэгт эсвэл 20261005120000-ийн багана (origin, data_from, data_to) байхгүй алдаа. */
export function isMissingChannelTables(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    const message = error.message || '';
    if (/marketing_channel_(?:reports|mappings)/i.test(message)
        && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find .*table/i.test(message))) return true;
    return isMissingOriginColumns(error);
}

/** Зөвхөн 20261005120000-ийн багана (origin, data_from, data_to) байхгүй алдаа — хүснэгт өөрөө байгаа. */
export function isMissingOriginColumns(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    const message = error.message || '';
    return (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(message))
        && /\b(?:origin|data_from|data_to)\b/.test(message);
}

/** Хуучин багануудаар уншсан мөр: эх сурвалж 'file', өдрийн хамралт тодорхойгүй. */
export function legacyChannelSummary(row: Omit<ChannelReportSummary, 'origin' | 'data_from' | 'data_to'>): ChannelReportSummary {
    return { ...row, origin: 'file', data_from: null, data_to: null };
}

/** 20261005140000-ийн trigger: Meta API-аас татсан тайланг файлаар дарахыг өгөгдлийн сан татгалзсан. */
export function isApiReportLockError(error: { code?: string; message?: string } | null | undefined): boolean {
    return /channel_report_api_locked/.test(error?.message ?? '');
}

/**
 * Тайлангийн өдрийн хамралт: `data_from`/`data_to` тайлангийн хугацааг бүрэн хамраагүй бол
 * `partial` (жишээ нь 7 хоногоос 6 өдөр). Хамрах өдөр тодорхойгүй (хуучин мөр) бол null.
 */
export function reportCoverage(report: Pick<ChannelReportSummary, 'period_from' | 'period_to' | 'data_from' | 'data_to'>): { days: number; covered: number; partial: boolean } | null {
    if (!report.data_from || !report.data_to) return null;
    const days = periodDays({ from: report.period_from, to: report.period_to });
    const covered = periodDays({ from: report.data_from, to: report.data_to });
    return { days, covered, partial: covered < days };
}

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const newest = (a: ChannelReportSummary, b: ChannelReportSummary) => b.period_to.localeCompare(a.period_to) || b.updated_at.localeCompare(a.updated_at);

/**
 * Хугацаанд хамгийн тохирох тайлан: яг таарсан → зөрүү (хамраагүй + илүү өдөр) хамгийн бага →
 * хугацаанаас уртгүй → давхцал их → сүүлд шинэчилсэн. Хугацаа өгөөгүй бол хамгийн сүүлийн тайлан.
 * Хугацаанаас урт тайлан ч буцаж болно — `isLongerReport`-оор «өөр хугацааны тайлан» гэж тэмдэглэнэ.
 */
export function pickBestReport<T extends ChannelReportSummary>(reports: readonly T[], range: { from: string; to: string } | null): T | null {
    if (!range) return [...reports].sort(newest)[0] ?? null;
    const scored = reports
        .filter(r => r.period_from <= range.to && r.period_to >= range.from)
        .map(r => {
            const overlap = days(r.period_from > range.from ? r.period_from : range.from, r.period_to < range.to ? r.period_to : range.to);
            const mismatch = periodDays(range) - overlap + periodDays({ from: r.period_from, to: r.period_to }) - overlap;
            return { r, exact: r.period_from === range.from && r.period_to === range.to, longer: isLongerReport(r, range), overlap, mismatch };
        })
        .sort((a, b) => Number(b.exact) - Number(a.exact) || a.mismatch - b.mismatch || Number(a.longer) - Number(b.longer) || b.overlap - a.overlap || newest(a.r, b.r));
    return scored[0]?.r ?? null;
}

/** Тайлан сонгосон хугацаанаас олон өдөртэй эсэх (сарын файлыг долоо хоногийн тоо гэж харуулахгүй). */
export function isLongerReport(report: Pick<ChannelReportSummary, 'period_from' | 'period_to'>, range: { from: string; to: string }): boolean {
    return periodDays({ from: report.period_from, to: report.period_to }) > periodDays(range);
}

/** Ижил урттай, тухайн тайлан эхлэхээс өмнө дууссан хамгийн сүүлийн тайлан. */
export function pickPreviousReport<T extends ChannelReportSummary>(reports: readonly T[], report: ChannelReportSummary): T | null {
    const length = periodDays({ from: report.period_from, to: report.period_to });
    return reports
        .filter(r => r.source === report.source && r.id !== report.id && r.period_to < report.period_from && periodDays({ from: r.period_from, to: r.period_to }) === length)
        .sort(newest)[0] ?? null;
}

/** Хоёр тайлангийн аль нэг нь өдрийн хамралт дутуу бол харьцуулахгүй. */
export function compareReports(report: ChannelReportSummary, previous: ChannelReportSummary | null): Record<string, MetricDelta> {
    const partialCoverage = !!reportCoverage(report)?.partial || (!!previous && !!reportCoverage(previous)?.partial);
    return compareWithPrevious(report.totals, previous?.totals ?? null, report.source, { partialCoverage });
}

/**
 * Meta API-ийн дуусаагүй долоо хоногийн мөн өдрүүдийн суурь: өмнөх хурлын долоо хоногийн API тайлан (файл биш —
 * эх сурвалж холихгүй) мөн өдрүүдийг хамарсан бол тэр тайлан ба өдрүүд; үгүй бол null (харьцуулахгүй хэвээр).
 */
export function metaSameDaysPlan(report: ChannelReportSummary, own: readonly ChannelReportSummary[]): { previous: ChannelReportSummary & { data_from: string; data_to: string }; days: { from: string; to: string } } | null {
    if (report.source !== 'meta_ads' || report.origin !== 'api' || !report.data_from || !report.data_to || !reportCoverage(report)?.partial) return null;
    const days = { from: shift(report.data_from, -7), to: shift(report.data_to, -7) };
    const previous = own.find(r => r.source === 'meta_ads' && r.origin === 'api' && r.id !== report.id
        && r.period_from === shift(report.period_from, -7) && r.period_to === shift(report.period_to, -7)
        && !!r.data_from && !!r.data_to && r.data_from <= days.from && r.data_to >= days.to);
    return previous ? { previous: previous as ChannelReportSummary & { data_from: string; data_to: string }, days } : null;
}

/**
 * Өмнөх долоо хоногийн мөн өдрүүдийн харьцуулалт: одоогийн зарын дансны хадгалсан ad set × өдрийн мөрөөс
 * (`metaSameDaysTotals`). Данс сонгоогүй, мөр тайлантай таарахгүй эсвэл уншиж чадаагүй бол null — тайлан
 * «өдөр дутуу тул харьцуулаагүй» хэвээр (уншилтын алдааг серверийн логт).
 */
async function loadMetaSameDays(db: SupabaseClient, shopId: string, report: ChannelReportSummary, plan: NonNullable<ReturnType<typeof metaSameDaysPlan>>): Promise<Record<string, MetricDelta> | null> {
    try {
        const { data: shop, error } = await db.from('shops').select('facebook_ad_account_id').eq('id', shopId).single();
        if (error) throw new Error(error.message);
        const account = shop?.facebook_ad_account_id ? `act_${String(shop.facebook_ad_account_id).replace(/^act_/, '')}` : null;
        if (!account) return null;
        const rows = await fetchAllRows<MetaInsightRow>((from, to) => db.from(META_INSIGHTS_TABLE).select(META_INSIGHT_COLUMNS)
            .eq('shop_id', shopId).eq('account_id', account).gte('day', plan.previous.data_from).lte('day', plan.previous.data_to)
            .order('day').order('adset_id').range(from, to));
        const knownTypes = new Set([...presentMetaResultTypes(report.totals), ...presentMetaResultTypes(plan.previous.totals)]);
        const totals = metaSameDaysTotals({ rows, previous: plan.previous, days: plan.days, knownTypes });
        return totals ? compareMetaSameDays(report.totals, totals) : null;
    } catch (error) {
        logger.warn('[channel-reports] Meta-гийн мөн өдрүүдийн харьцуулалтыг уншиж чадсангүй', { shopId, message: error instanceof Error ? error.message : 'unknown' });
        return null;
    }
}

/**
 * Эх үүсвэр бүрийн хувьд хугацаанд тохирох тайлан, өмнөх тайлан, харьцуулалт.
 * `range` null бол эх үүсвэр бүрийн хамгийн сүүлийн тайлан.
 */
export async function loadChannelReports(
    db: SupabaseClient,
    shopId: string,
    range: { from: string; to: string } | null,
    options: { sources?: readonly ChannelSource[]; today?: string } = {},
): Promise<ChannelReportMatches> {
    const sources = options.sources?.length ? options.sources : CHANNEL_SOURCES;
    const since = shift(range?.from ?? options.today ?? ubDateStr(), -LOOKBACK_DAYS);
    const page = (columns: string) => (from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> => {
        let query = db.from(CHANNEL_REPORTS_TABLE).select(columns)
            .eq('shop_id', shopId).in('source', [...sources]).gte('period_to', since);
        if (range) query = query.lte('period_from', range.to);
        return query.order('period_to', { ascending: false }).order('id').range(from, to);
    };
    let summaries: ChannelReportSummary[];
    try {
        try {
            summaries = await fetchAllRows(page(CHANNEL_REPORT_SUMMARY_COLUMNS)) as ChannelReportSummary[];
        } catch (error) {
            if (!isMissingOriginColumns(error as Error)) throw error;
            const legacy = await fetchAllRows(page(CHANNEL_REPORT_LEGACY_COLUMNS)) as Array<Omit<ChannelReportSummary, 'origin' | 'data_from' | 'data_to'>>;
            summaries = legacy.map(legacyChannelSummary);
        }
    } catch (error) {
        if (isMissingChannelTables(error as Error)) throw new ChannelReportsUnavailableError();
        throw error;
    }

    const picks = new Map<ChannelSource, { best: ChannelReportSummary | null; previous: ChannelReportSummary | null; sameDays: ReturnType<typeof metaSameDaysPlan> }>();
    for (const source of sources) {
        const own = summaries.filter(r => r.source === source);
        const best = pickBestReport(own, range);
        picks.set(source, { best, previous: best ? pickPreviousReport(own, best) : null, sameDays: best ? metaSameDaysPlan(best, own) : null });
    }
    const ids = [...picks.values()].map(p => p.best?.id).filter((id): id is string => !!id);
    const details = new Map<string, { breakdown: BreakdownRow[]; mapping: ChannelMapping }>();
    if (ids.length) {
        const { data, error } = await db.from(CHANNEL_REPORTS_TABLE).select('id,breakdown,mapping').eq('shop_id', shopId).in('id', ids);
        if (error) throw isMissingChannelTables(error) ? new ChannelReportsUnavailableError() : new Error(error.message);
        for (const row of (data ?? []) as Array<{ id: string; breakdown: BreakdownRow[]; mapping: ChannelMapping }>) details.set(row.id, { breakdown: row.breakdown ?? [], mapping: row.mapping ?? {} });
    }

    // Дуусаагүй Meta API долоо хоног: өмнөх долоо хоногийн мөн өдрүүдтэй (боломжтой бол).
    const metaPick = picks.get('meta_ads');
    const sameDays = metaPick?.best && metaPick.sameDays ? await loadMetaSameDays(db, shopId, metaPick.best, metaPick.sameDays) : null;

    const result = {} as ChannelReportMatches;
    for (const source of CHANNEL_SOURCES) {
        const pick = picks.get(source);
        const best = pick?.best ?? null;
        const report = best ? { ...best, ...(details.get(best.id) ?? { breakdown: [], mapping: {} }) } : null;
        const same = source === 'meta_ads' && sameDays && pick?.sameDays ? pick.sameDays : null;
        result[source] = {
            report,
            exact: !!report && !!range && report.period_from === range.from && report.period_to === range.to,
            longer: !!report && !!range && isLongerReport(report, range),
            // Мөн өдрүүдтэй харьцуулбал «өмнөх» нь тэр өдрүүдийг хамарсан өмнөх долоо хоногийн API тайлан.
            previous: same ? same.previous : pick?.previous ?? null,
            comparison: same ? sameDays : report ? compareReports(report, pick?.previous ?? null) : null,
            ...(same ? { sameDays: same.days } : {}),
        };
    }
    return result;
}
