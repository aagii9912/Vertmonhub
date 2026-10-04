// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    ChannelReportsUnavailableError, loadChannelReports, pickBestReport, pickPreviousReport, type ChannelReportSummary,
} from '../channel-reports-load';
import type { ChannelSource } from '../channel-reports';

const report = (id: string, source: ChannelSource, from: string, to: string, totals: Record<string, number | string> = {}, updated = '2026-10-01T00:00:00Z'): ChannelReportSummary =>
    ({ id, source, period_from: from, period_to: to, file_name: `${id}.csv`, totals, warnings: [], row_count: 1, note: null, imported_by: null, created_at: updated, updated_at: updated });
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

    it('compares only with an earlier report of the same length', () => {
        expect(pickPreviousReport(reports, reports[2])?.id).toBe('prev');
        expect(pickPreviousReport(reports, reports[0])).toBeNull();
        expect(pickPreviousReport(reports.filter(r => r.id !== 'prev'), reports[2])?.id).toBe('older');
    });
});

function fakeDb(summaries: ChannelReportSummary[], details: Array<{ id: string; breakdown: unknown[]; mapping: object }>, error?: { code: string; message: string }) {
    const calls: Array<Array<[string, unknown[]]>> = [];
    const db = {
        from: () => {
            const ops: Array<[string, unknown[]]> = [];
            calls.push(ops);
            const builder: Record<string, unknown> = new Proxy({}, {
                get(_t, prop: string) {
                    if (prop === 'then') {
                        const byId = ops.some(([op, args]) => op === 'in' && args[0] === 'id');
                        const result = error ? { data: null, error } : { data: byId ? details : summaries, error: null };
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
        expect(result.sms).toEqual({ report: null, exact: false, previous: null, comparison: null });
        const [list, detail] = calls;
        expect(list).toEqual(expect.arrayContaining([['eq', ['shop_id', 'shop-1']], ['gte', ['period_to', '2025-08-19']], ['lte', ['period_from', '2026-09-29']]]));
        expect(detail).toEqual(expect.arrayContaining([['eq', ['shop_id', 'shop-1']], ['in', ['id', ['m2', 'c1']]]]));
    });

    it('surfaces a missing migration instead of returning empty reports', async () => {
        const { db } = fakeDb([], [], { code: 'PGRST205', message: "Could not find the table 'public.marketing_channel_reports' in the schema cache" });
        await expect(loadChannelReports(db, 'shop-1', week)).rejects.toBeInstanceOf(ChannelReportsUnavailableError);
        const { db: broken } = fakeDb([], [], { code: '57014', message: 'canceling statement due to statement timeout' });
        await expect(loadChannelReports(broken, 'shop-1', null, { today: '2026-10-04' })).rejects.toThrow(/statement timeout/);
    });
});
