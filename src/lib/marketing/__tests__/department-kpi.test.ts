import { describe, expect, it } from 'vitest';
import { buildDepartmentKpis, formatDepartmentKpisText } from '../department-kpi';
import { buildMarketingPerformance, type PerformanceData, type MarketingPerformance } from '../performance';
import { exportMarketingPerformance } from '../performance-export';
import { readSheetRows } from '@/lib/utils/xlsx';

const range = { from: '2026-09-01', to: '2026-09-30' };
const project = '00000000-0000-4000-8000-000000000001';
function fixture(): PerformanceData {
    return {
        projects: [{ id: project, name: 'Төсөл' }],
        activities: ['campaign', 'content'].map(kind => ({ id: kind, name: kind, project_id: project, marketing_owner_name: 'Номин', channel: 'event',
            activity_kind: kind as 'campaign' | 'content', status: 'completed', start_date: '2026-09-23', completed_on: '2026-09-24' })),
        leads: [{ id: 'lead', created_at: '2026-09-23', project_id: project, source: 'event', marketing_campaign_id: 'campaign',
            marketing_owner_name: 'Номин', marketing_channel: 'event', sales_handoff_at: '2026-09-24', sales_manager_name: 'Борлуулагч' }],
        contracts: [{ lead_id: 'lead', contract_date: '2026-09-25', contract_number: '001', total_price: 1000, contract_status: 'active' }],
        spend: [{ id: 'spend', spent_at: '2026-09-23', amount: 120, channel: 'event', project_id: project, marketing_owner_name: 'Номин', marketing_campaign_id: 'campaign', note: null }],
        targets: [{ id: 'target', month: '2026-09-01', project_id: project, marketing_owner_name: 'Номин', lead_target: 2, deal_target: 1, budget: 100 }],
    };
}
const category = (report: MarketingPerformance, id: string) => buildDepartmentKpis(report).categories.find(c => c.id === id)!;
const value = (report: MarketingPerformance, categoryId: string, key: string) => category(report, categoryId).evidence.find(e => e.key === key)?.value;

describe('department KPI source and real evidence', () => {
    it('uses the six source weights and preserves dated policy context across text and export', async () => {
        const report = buildMarketingPerformance(fixture(), range);
        const department = buildDepartmentKpis(report);
        expect(department.categories.map(c => c.weight)).toEqual([40, 25, 15, 10, 5, 5]);
        expect(department.categories.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
        expect(department.source).toMatchObject({ version: '2026-07-20', file: 'marketing org structure 20260720.pptx' });
        const text = formatDepartmentKpisText(report);
        expect(text).toContain('Бизнесийн үр дүн · жин 40%');
        expect(text).toContain('Нэг лидийн зардал: 120₮');
        expect(text).toContain('дэд жин эх материалд жишээ');
        const rows = await readSheetRows(await exportMarketingPerformance(report), 'Албаны KPI', { defval: null });
        expect(rows.find(r => r['Үзүүлэлт'] === 'Нэг лидийн зардал')).toMatchObject({ 'Жин %': 40, 'Бодит': 120, 'Нэгж': '₮' });
        expect(rows.find(r => r['Үзүүлэлт'] === 'Контентын чанарын үнэлгээ')?.['Бодит']).toBeNull();
    });

    it('maps completed campaigns/content and cohort evidence without inferring qualification or site visits', () => {
        const report = buildMarketingPerformance(fixture(), range);
        expect(value(report, 'business', 'leads')).toBe(1);
        expect(value(report, 'business', 'handoffs')).toBe(1);
        expect(value(report, 'business', 'deals')).toBe(1);
        expect(value(report, 'campaign', 'campaigns')).toBe(1);
        expect(value(report, 'campaign', 'leads')).toBe(1);
        expect(value(report, 'campaign', 'deals')).toBe(1);
        expect(value(report, 'content', 'content')).toBe(1);
        expect(value(report, 'content', 'quality')).toBeNull();
        expect(value(report, 'project', 'planPct')).toBe(100);
        expect(value(report, 'project', 'onTimePct')).toBeNull();
        expect(value(report, 'teamwork', 'assessment')).toBeNull();
        expect(category(report, 'business').gaps.join(' ')).toContain('Qualified Lead');
        expect(category(report, 'business').gaps.join(' ')).toContain('Site Visit');
        expect(category(report, 'business').gaps.join(' ')).toContain('Marketing ROI');
    });

    it('keeps budget comparison unknown for weekly, unconfigured, missing-spend and missing-FX reports', () => {
        const full = buildMarketingPerformance(fixture(), range);
        expect(value(full, 'budget', 'budget')).toBe(100);
        expect(value(full, 'budget', 'variance')).toBe(20);
        const week = buildMarketingPerformance(fixture(), { from: '2026-09-23', to: '2026-09-29' });
        expect(value(week, 'budget', 'budget')).toBeNull();
        expect(value(week, 'budget', 'variance')).toBeNull();
        expect(value(week, 'budget', 'spend')).toBe(120);
        const data = fixture();
        data.targets = [];
        expect(value(buildMarketingPerformance(data, range), 'budget', 'budget')).toBeNull();
        data.targets = fixture().targets;
        data.spend = [];
        const missing = buildMarketingPerformance(data, range);
        expect(value(missing, 'budget', 'budget')).toBe(100);
        expect(value(missing, 'budget', 'variance')).toBeNull();
        expect(value(missing, 'budget', 'spend')).toBeNull();
        data.spend = [{ ...fixture().spend[0], amount: 0 }];
        const zero = buildMarketingPerformance(data, range);
        expect(value(zero, 'budget', 'budget')).toBe(100);
        expect(value(zero, 'budget', 'spend')).toBe(0);
        expect(value(zero, 'budget', 'variance')).toBe(-100);
        data.spend.push({ ...fixture().spend[0], id: 'missing-fx', amount: 0, exclusion: 'missing_fx', currency: 'USD', native_amount: 5 });
        const missingFx = buildMarketingPerformance(data, range);
        expect(value(missingFx, 'budget', 'budget')).toBe(100);
        expect(value(missingFx, 'budget', 'variance')).toBeNull();
        expect(value(missingFx, 'budget', 'spend')).toBeNull();
    });
});
