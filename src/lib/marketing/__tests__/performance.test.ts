import { describe, it, expect } from 'vitest';
import { buildMarketingPerformance, previousRange, PerformanceFilterSchema, type MarketingLead, type PerformanceData } from '../performance';
import { MarketingRecordSchema } from '../performance-records';
import { exportMarketingPerformance } from '../performance-export';
import { readSheetRows } from '@/lib/utils/xlsx';

const project = '00000000-0000-4000-8000-000000000001';
const activity = '00000000-0000-4000-8000-000000000002';
const range = { from: '2026-08-01', to: '2026-08-31' };
const lead = (id: string, overrides: Partial<MarketingLead> = {}): MarketingLead => ({ id, created_at: '2026-08-01T00:00:00+08:00',
    project_id: project, source: 'facebook_ads', marketing_campaign_id: activity, marketing_owner_name: 'Номин', marketing_channel: null,
    sales_handoff_at: '2026-08-02T00:00:00+08:00', sales_manager_name: 'Борлуулагч', ...overrides });
function fixture(): PerformanceData {
    return { projects: [{ id: project, name: 'Төсөл A' }],
        activities: [{ id: activity, name: 'Open Day', project_id: project, marketing_owner_name: 'Номин', channel: 'event', activity_kind: 'campaign', status: 'completed', start_date: '2026-08-01', completed_on: '2026-08-02' }],
        leads: [lead('one'), lead('two', { sales_handoff_at: null }), lead('unknown', { project_id: null, marketing_owner_name: null, marketing_campaign_id: null, source: 'phone', sales_manager_name: null, sales_handoff_at: null }),
            lead('prev', { created_at: '2026-07-31T15:59:59Z' }), lead('late', { created_at: '2026-08-31T16:00:00Z' }),
            lead('future-transfer', { sales_handoff_at: '2026-09-01T00:00:00+08:00' })],
        contracts: [{ lead_id: 'one', contract_number: '001', total_price: 100, contract_status: 'active', contract_date: '2026-08-05' },
            { lead_id: 'one', contract_number: '002', total_price: 200, contract_status: 'active', contract_date: '2026-08-06' },
            { lead_id: 'two', contract_number: '003', total_price: 100, contract_status: 'cancelled', contract_date: '2026-08-06' },
            { lead_id: 'future-transfer', contract_number: '004', total_price: 100, contract_status: 'active', contract_date: '2026-09-01' }],
        spend: [{ id: 'spend', spent_at: '2026-08-03', amount: 120, channel: 'event', project_id: project, marketing_owner_name: 'Номин', marketing_campaign_id: activity, note: null }],
        targets: [{ id: 'target', month: '2026-08-01', project_id: project, marketing_owner_name: 'Номин', lead_target: 6, deal_target: 2, budget: 100 }] };
}
describe('marketing performance business rules', () => {
    it('uses Ulaanbaatar boundaries, unique valid deals and recorded handoffs only', () => {
        const r = buildMarketingPerformance(fixture(), range);
        expect(r.totals).toMatchObject({ leads: 4, sales: 1, deals: 1, activities: 1, spend: 120 });
        expect(r.previous.leads).toBe(1);
        expect(r.quality).toMatchObject({ noProject: 1, noOwner: 1, unknownHandoff: 1 });
        for (const key of ['leads', 'sales', 'deals'] as const) {
            expect(r.projects.reduce((sum, p) => sum + p[key], 0)).toBe(r.totals[key]);
            expect(r.channels.reduce((sum, p) => sum + p[key], 0)).toBe(r.totals[key]);
            expect(r.team.reduce((sum, p) => sum + p[key], 0)).toBe(r.totals[key]);
        }
        expect(r.team.find(t => t.name === 'Номин')).toMatchObject({ leadAttainment: 50, dealAttainment: 50, variance: 20, variancePct: 20, planPct: 100 });
    });
    it('scopes projects and preserves unavailable targets for custom periods and zero denominators', () => {
        const r = buildMarketingPerformance(fixture(), { ...range, project });
        expect(r.totals.leads).toBe(3);
        expect(r.projects).toHaveLength(1);
        expect(buildMarketingPerformance(fixture(), { from: '2026-08-02', to: '2026-08-08' }).team.every(t => t.target === null)).toBe(true);
        const data = fixture(); data.targets[0].lead_target = 0;
        expect(buildMarketingPerformance(data, range).team[0].leadAttainment).toBeNull();
    });
    it('compares full calendar months and same-length custom periods, including year boundaries', () => {
        expect(previousRange(range)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
        expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
        expect(previousRange({ from: '2026-01-01', to: '2026-01-07' })).toEqual({ from: '2025-12-25', to: '2025-12-31' });
        expect(PerformanceFilterSchema.safeParse({ from: '2026-02-30', to: '2026-03-05' }).success).toBe(false);
        expect(PerformanceFilterSchema.safeParse({ from: range.to, to: range.from }).success).toBe(false);
    });
    it('retains managers with only previous-period results so a complete decline remains visible', () => {
        const data = fixture();
        data.leads.push(lead('former-owner', { created_at: '2026-07-05', marketing_owner_name: 'Өмнөх хариуцагч' }));
        const row = buildMarketingPerformance(data, range).team.find(t => t.name === 'Өмнөх хариуцагч');
        expect(row).toMatchObject({ leads: 0, previousLeads: 1, leadChange: -100 });
    });
    it('rejects unfinished completion dates, fractional targets, negative budgets and cross-type garbage', () => {
        expect(MarketingRecordSchema.safeParse({ kind: 'target', project_id: project, marketing_owner_name: 'Номин', month: '2026-08-02', lead_target: 1, deal_target: 1, budget: 1 }).success).toBe(false);
        expect(MarketingRecordSchema.safeParse({ kind: 'activity', ...fixture().activities[0], completed_on: null }).success).toBe(false);
        expect(MarketingRecordSchema.safeParse({ kind: 'target', project_id: project, marketing_owner_name: 'Номин', month: '2026-08-01', lead_target: 1.5, deal_target: 1, budget: -1 }).success).toBe(false);
    });
    it('exports the same report numbers without leaking raw leads', async () => {
        const r = buildMarketingPerformance(fixture(), range);
        const workbook = await exportMarketingPerformance(r);
        const rows = await readSheetRows(workbook, 'Сувгаар харьцаа');
        expect(rows.reduce((sum, row) => sum + Number(row.Lead), 0)).toBe(r.totals.leads);
        const team = await readSheetRows(workbook, 'Багийн гүйцэтгэл');
        expect(team.find(t => t['Менежер'] === 'Номин')?.['Зөрүү (₮)']).toBe(20);
    });
});
