/**
 * Хадгалсан сувгийн тайлангуудаас тухайн хугацаанд хамгийн тохирохыг (эх үүсвэр бүрт) олж,
 * ижил урттай өмнөх тайлантай харьцуулна. Долоо хоногийн хурлын тайлан болон API ашиглана.
 * Алдааг хоосон өгөгдөл болгож нуухгүй — хүснэгт үүсээгүй бол `ChannelReportsUnavailableError`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr } from '@/lib/utils/date';
import {
    CHANNEL_SOURCES, compareWithPrevious, periodDays,
    type BreakdownRow, type ChannelMapping, type ChannelSource, type ChannelTotals, type ChannelWarning, type MetricDelta,
} from './channel-reports';

export const CHANNEL_REPORTS_TABLE = 'marketing_channel_reports';
export const CHANNEL_MAPPINGS_TABLE = 'marketing_channel_mappings';
export const CHANNEL_REPORT_SUMMARY_COLUMNS = 'id,source,period_from,period_to,file_name,totals,warnings,row_count,note,imported_by,created_at,updated_at';
export const CHANNEL_REPORTS_MIGRATION_HINT = 'Сувгийн тайлангийн хүснэгт үүсээгүй байна — 20261004140000_marketing_channel_reports.sql миграци шаардлагатай.';
/** Өмнөх тайланг хайх хугацаа (өдөр). */
const LOOKBACK_DAYS = 400;

export interface ChannelReportSummary {
    id: string;
    source: ChannelSource;
    period_from: string;
    period_to: string;
    file_name: string | null;
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
    /** Ижил урттай, өмнө дууссан хамгийн сүүлийн тайлан. */
    previous: ChannelReportSummary | null;
    comparison: Record<string, MetricDelta> | null;
}
export type ChannelReportMatches = Record<ChannelSource, ChannelReportMatch>;

export class ChannelReportsUnavailableError extends Error {
    constructor() {
        super(CHANNEL_REPORTS_MIGRATION_HINT);
        this.name = 'ChannelReportsUnavailableError';
    }
}

export function isMissingChannelTables(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    return /marketing_channel_(?:reports|mappings)/i.test(error.message || '')
        && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find .*table/i.test(error.message || ''));
}

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const newest = (a: ChannelReportSummary, b: ChannelReportSummary) => b.period_to.localeCompare(a.period_to) || b.updated_at.localeCompare(a.updated_at);

/**
 * Хугацаанд хамгийн тохирох тайлан: яг таарсан → зөрүү (хамраагүй + илүү өдөр) хамгийн бага →
 * давхцал их → сүүлд шинэчилсэн. Хугацаа өгөөгүй бол хамгийн сүүлийн тайлан.
 */
export function pickBestReport<T extends ChannelReportSummary>(reports: readonly T[], range: { from: string; to: string } | null): T | null {
    if (!range) return [...reports].sort(newest)[0] ?? null;
    const scored = reports
        .filter(r => r.period_from <= range.to && r.period_to >= range.from)
        .map(r => {
            const overlap = days(r.period_from > range.from ? r.period_from : range.from, r.period_to < range.to ? r.period_to : range.to);
            const mismatch = periodDays(range) - overlap + periodDays({ from: r.period_from, to: r.period_to }) - overlap;
            return { r, exact: r.period_from === range.from && r.period_to === range.to, overlap, mismatch };
        })
        .sort((a, b) => Number(b.exact) - Number(a.exact) || a.mismatch - b.mismatch || b.overlap - a.overlap || newest(a.r, b.r));
    return scored[0]?.r ?? null;
}

/** Ижил урттай, тухайн тайлан эхлэхээс өмнө дууссан хамгийн сүүлийн тайлан. */
export function pickPreviousReport<T extends ChannelReportSummary>(reports: readonly T[], report: ChannelReportSummary): T | null {
    const length = periodDays({ from: report.period_from, to: report.period_to });
    return reports
        .filter(r => r.source === report.source && r.id !== report.id && r.period_to < report.period_from && periodDays({ from: r.period_from, to: r.period_to }) === length)
        .sort(newest)[0] ?? null;
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
    let summaries: ChannelReportSummary[];
    try {
        summaries = await fetchAllRows<ChannelReportSummary>((from, to) => {
            let query = db.from(CHANNEL_REPORTS_TABLE).select(CHANNEL_REPORT_SUMMARY_COLUMNS)
                .eq('shop_id', shopId).in('source', [...sources]).gte('period_to', since);
            if (range) query = query.lte('period_from', range.to);
            return query.order('period_to', { ascending: false }).order('id').range(from, to);
        });
    } catch (error) {
        if (isMissingChannelTables(error as Error)) throw new ChannelReportsUnavailableError();
        throw error;
    }

    const picks = new Map<ChannelSource, { best: ChannelReportSummary | null; previous: ChannelReportSummary | null }>();
    for (const source of sources) {
        const own = summaries.filter(r => r.source === source);
        const best = pickBestReport(own, range);
        picks.set(source, { best, previous: best ? pickPreviousReport(own, best) : null });
    }
    const ids = [...picks.values()].map(p => p.best?.id).filter((id): id is string => !!id);
    const details = new Map<string, { breakdown: BreakdownRow[]; mapping: ChannelMapping }>();
    if (ids.length) {
        const { data, error } = await db.from(CHANNEL_REPORTS_TABLE).select('id,breakdown,mapping').eq('shop_id', shopId).in('id', ids);
        if (error) throw isMissingChannelTables(error) ? new ChannelReportsUnavailableError() : new Error(error.message);
        for (const row of (data ?? []) as Array<{ id: string; breakdown: BreakdownRow[]; mapping: ChannelMapping }>) details.set(row.id, { breakdown: row.breakdown ?? [], mapping: row.mapping ?? {} });
    }

    const result = {} as ChannelReportMatches;
    for (const source of CHANNEL_SOURCES) {
        const pick = picks.get(source);
        const best = pick?.best ?? null;
        const report = best ? { ...best, ...(details.get(best.id) ?? { breakdown: [], mapping: {} }) } : null;
        result[source] = {
            report,
            exact: !!report && !!range && report.period_from === range.from && report.period_to === range.to,
            previous: pick?.previous ?? null,
            comparison: report ? compareWithPrevious(report.totals, pick?.previous?.totals ?? null, source) : null,
        };
    }
    return result;
}
