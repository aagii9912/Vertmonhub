// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    ChannelReportsUnavailableError, isApiReportLockError, isLongerReport, isMissingChannelTables, isMissingOriginColumns, loadChannelReports, pickBestReport,
    pickPreviousReport, reportCoverage, type ChannelReportSummary,
} from '../channel-reports-load';
import type { ChannelSource } from '../channel-reports';

const report = (id: string, source: ChannelSource, from: string, to: string, totals: Record<string, number | string> = {}, updated = '2026-10-01T00:00:00Z', data: { from: string; to: string } | null = null): ChannelReportSummary =>
    ({ id, source, period_from: from, period_to: to, file_name: `${id}.csv`, origin: 'file', data_from: data?.from ?? null, data_to: data?.to ?? null, totals, warnings: [], row_count: 1, note: null, imported_by: null, created_at: updated, updated_at: updated });
const week = { from: '2026-09-23', to: '2026-09-29' };

describe('report matching', () => {
    const reports = [
        report('month', 'sms', '2026-09-01', '2026-09-30'),
        report('partial', 'sms', '2026-09-20', '2026-09-26'),
        report('exact', 'sms', '2026-09-23', '2026-09-29'),
        report('prev', 'sms', '2026-09-16', '2026-09-22'),
        report('older', 'sms', '2026-09-09', '2026-09-15'),
    ];

    it('prefers the exact period, then the smallest mismatch of missing and extra days', () => {
        expect(pickBestReport(reports, week)?.id).toBe('exact');
        expect(pickBestReport(reports.filter(r => r.id !== 'exact'), week)?.id).toBe('partial');
        expect(pickBestReport(reports.filter(r => !['exact', 'partial'].includes(r.id)), week)?.id).toBe('month');
        expect(pickBestReport(reports, { from: '2026-10-01', to: '2026-10-07' })).toBeNull();
        expect(pickBestReport(reports, null)?.id).toBe('month');
    });

    it('flags a report longer than the meeting week instead of passing it off as the week', () => {
        const month = reports[0];
        expect(pickBestReport([month], week)?.id).toBe('month');
        expect(isLongerReport(month, week)).toBe(true);
        expect(isLongerReport(reports[2], week)).toBe(false);
        // Ижил зөрүүтэй бол хугацаанаас уртгүй тайланг сонгоно.
        const eightDays = report('eight', 'sms', '2026-09-22', '2026-09-29');
        const sixDays = report('six', 'sms', '2026-09-24', '2026-09-29');
        expect(pickBestReport([eightDays, sixDays], week)?.id).toBe('six');
    });

    it('measures day coverage from data_from/data_to and never assumes a full week when unknown', () => {
        expect(reportCoverage(report('a', 'meta_ads', '2026-09-23', '2026-09-29', {}, undefined, { from: '2026-09-23', to: '2026-09-28' }))).toEqual({ days: 7, covered: 6, partial: true });
        expect(reportCoverage(report('b', 'meta_ads', '2026-09-23', '2026-09-29', {}, undefined, { from: '2026-09-23', to: '2026-09-29' }))).toEqual({ days: 7, covered: 7, partial: false });
        expect(reportCoverage(report('c', 'meta_ads', '2026-09-23', '2026-09-29'))).toBeNull();
    });

    it('compares only with an earlier report of the same length', () => {
        expect(pickPreviousReport(reports, reports[2])?.id).toBe('prev');
        expect(pickPreviousReport(reports, reports[0])).toBeNull();
        expect(pickPreviousReport(reports.filter(r => r.id !== 'prev'), reports[2])?.id).toBe('older');
    });
});

function fakeDb(summaries: ChannelReportSummary[], details: Array<{ id: string; breakdown: unknown[]; mapping: object }>, error?: { code: string; message: string }, columnError?: (columns: string) => { code: string; message: string } | null) {
    const calls: Array<Array<[string, unknown[]]>> = [];
    const db = {
        from: () => {
            const ops: Array<[string, unknown[]]> = [];
            calls.push(ops);
            const builder: Record<string, unknown> = new Proxy({}, {
                get(_t, prop: string) {
                    if (prop === 'then') {
                        const byId = ops.some(([op, args]) => op === 'in' && args[0] === 'id');
                        const failed = error ?? columnError?.(String(ops.find(([op]) => op === 'select')?.[1][0] ?? '')) ?? null;
                        const result = failed ? { data: null, error: failed } : { data: byId ? details : summaries, error: null };
                        return (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
                    }
                    return (...args: unknown[]) => { ops.push([prop, args]); return builder; };
                },
            });
            return builder;
        },
    };
    return { db: db as unknown as SupabaseClient, calls };
}

describe('loadChannelReports', () => {
    it('returns the best report per source with breakdown, previous report and comparison', async () => {
        const { db, calls } = fakeDb([
            report('m2', 'meta_ads', '2026-09-23', '2026-09-29', { spend: 70, currency: 'USD', reach: 1500 }),
            report('m1', 'meta_ads', '2026-09-16', '2026-09-22', { spend: 50, currency: 'USD', reach: 1000 }),
            report('c1', 'callpro', '2026-09-01', '2026-09-30', { answered: 400 }),
        ], [{ id: 'm2', breakdown: [{ kind: 'campaign', label: 'A', values: { spend: 70 } }], mapping: { Spend: 'spend' } }, { id: 'c1', breakdown: [], mapping: {} }]);
        const result = await loadChannelReports(db, 'shop-1', week);
        expect(result.meta_ads).toMatchObject({ exact: true, report: { id: 'm2', breakdown: [{ label: 'A' }], mapping: { Spend: 'spend' } }, previous: { id: 'm1' } });
        expect(result.meta_ads.comparison).toMatchObject({ spend: { delta: 20, pct: 40 }, reach: { delta: 500, pct: 50 } });
        expect(result.callpro).toMatchObject({ exact: false, report: { id: 'c1' }, previous: null });
        expect(result.callpro.comparison?.answered).toEqual({ current: 400, previous: null, delta: null, pct: null, comparable: true });
        expect(result.sms).toEqual({ report: null, exact: false, longer: false, previous: null, comparison: null });
        expect(result.callpro.longer).toBe(true);
        expect(result.meta_ads.longer).toBe(false);
        const [list, detail] = calls;
        expect(list).toEqual(expect.arrayContaining([['eq', ['shop_id', 'shop-1']], ['gte', ['period_to', '2025-08-19']], ['lte', ['period_from', '2026-09-29']]]));
        expect(detail).toEqual(expect.arrayContaining([['eq', ['shop_id', 'shop-1']], ['in', ['id', ['m2', 'c1']]]]));
    });

    it('marks the comparison not comparable when either week is partially covered and compares per-type results', async () => {
        const totals = (calls: number, spend: number) => ({ spend, currency: 'USD', results_calls: calls, spend_calls: spend, cost_per_result_calls: spend / calls });
        const partial = report('m2', 'meta_ads', '2026-09-23', '2026-09-29', totals(76, 141.09), undefined, { from: '2026-09-23', to: '2026-09-28' });
        const full = report('m1', 'meta_ads', '2026-09-16', '2026-09-22', totals(59, 106.38), undefined, { from: '2026-09-16', to: '2026-09-22' });
        const { db } = fakeDb([partial, full], []);
        const result = await loadChannelReports(db, 'shop-1', week, { sources: ['meta_ads'] });
        expect(result.meta_ads.comparison?.results_calls).toEqual({ current: 76, previous: 59, delta: null, pct: null, comparable: false, reason: 'coverage' });
        const { db: complete } = fakeDb([{ ...partial, data_to: '2026-09-29' }, full], []);
        const compared = await loadChannelReports(complete, 'shop-1', week, { sources: ['meta_ads'] });
        expect(compared.meta_ads.comparison?.results_calls).toEqual({ current: 76, previous: 59, delta: 17, pct: 28.8, comparable: true });
        expect(compared.meta_ads.comparison?.spend_calls).toMatchObject({ delta: 34.71, comparable: true });
    });

    it('treats the missing origin/coverage columns as a missing migration', () => {
        expect(isMissingChannelTables({ code: '42703', message: 'column marketing_channel_reports.origin does not exist' })).toBe(true);
        expect(isMissingChannelTables({ code: 'PGRST204', message: "Could not find the 'data_from' column of 'marketing_channel_reports' in the schema cache" })).toBe(true);
        expect(isMissingChannelTables({ code: '42703', message: 'column leads.origin_x does not exist' })).toBe(false);
        expect(isMissingChannelTables({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    });

    it('reads with the old columns until the origin/coverage migration is applied', async () => {
        const { origin: _origin, data_from: _from, data_to: _to, ...legacy } = report('m2', 'meta_ads', '2026-09-23', '2026-09-29', { spend: 70, currency: 'USD' });
        const { db, calls } = fakeDb([legacy as ChannelReportSummary], [{ id: 'm2', breakdown: [], mapping: {} }], undefined,
            columns => /origin/.test(columns) ? { code: '42703', message: 'column marketing_channel_reports.origin does not exist' } : null);
        const result = await loadChannelReports(db, 'shop-1', week, { sources: ['meta_ads'] });
        expect(result.meta_ads).toMatchObject({ exact: true, report: { id: 'm2', origin: 'file', data_from: null, data_to: null } });
        expect(calls.map(ops => ops.find(([op]) => op === 'select')?.[1][0])).toEqual([
            expect.stringContaining('origin,data_from,data_to'), expect.not.stringContaining('origin'), 'id,breakdown,mapping',
        ]);
        expect(isMissingOriginColumns({ code: 'PGRST204', message: "Could not find the 'data_to' column of 'marketing_channel_reports' in the schema cache" })).toBe(true);
        expect(isMissingOriginColumns({ code: '42P01', message: 'relation "public.marketing_channel_reports" does not exist' })).toBe(false);
        expect(isApiReportLockError({ code: '23514', message: 'channel_report_api_locked: meta_ads 2026-09-23 – 2026-09-29' })).toBe(true);
        expect(isApiReportLockError({ code: '23514', message: 'new row violates check constraint "marketing_channel_reports_data_range_check"' })).toBe(false);
    });

    it('surfaces a missing migration instead of returning empty reports', async () => {
        const { db } = fakeDb([], [], { code: 'PGRST205', message: "Could not find the table 'public.marketing_channel_reports' in the schema cache" });
        await expect(loadChannelReports(db, 'shop-1', week)).rejects.toBeInstanceOf(ChannelReportsUnavailableError);
        const { db: broken } = fakeDb([], [], { code: '57014', message: 'canceling statement due to statement timeout' });
        await expect(loadChannelReports(broken, 'shop-1', null, { today: '2026-10-04' })).rejects.toThrow(/statement timeout/);
    });
});
