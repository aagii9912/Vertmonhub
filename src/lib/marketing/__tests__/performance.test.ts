import { describe, it, expect } from 'vitest';
import { buildMarketingPerformance, previousRange, PerformanceFilterSchema, type MarketingLead, type PerformanceData } from '../performance';
import { MarketingRecordSchema } from '../performance-records';
import { exportMarketingPerformance } from '../performance-export';
import { readSheetCsv, readSheetRows } from '@/lib/utils/xlsx';

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
    it('separates completed campaigns and content by completion period, project and owner', () => {
        const data = fixture();
        const otherProject = '00000000-0000-4000-8000-000000000003';
        data.projects.push({ id: otherProject, name: 'Төсөл B' });
        const campaign = data.activities[0];
        data.activities.push(
            { ...campaign, id: 'content', activity_kind: 'content', start_date: '2026-07-15', completed_on: range.from },
            { ...campaign, id: 'other-content', activity_kind: 'content', project_id: otherProject, marketing_owner_name: 'Болор', completed_on: range.to },
            { ...campaign, id: 'prior-content', activity_kind: 'content', start_date: '2026-07-01', completed_on: '2026-07-31', marketing_owner_name: 'Өмнөх хариуцагч' },
            { ...campaign, id: 'unfinished', status: 'active', completed_on: '2026-08-10' },
            { ...campaign, id: 'undated', completed_on: null },
            { ...campaign, id: 'future', activity_kind: 'content', completed_on: '2026-09-01' },
        );
        const r = buildMarketingPerformance(data, range);
        expect(r.totals).toMatchObject({ activities: 3, campaigns: 1, content: 2 });
        expect(r.previous).toMatchObject({ activities: 1, campaigns: 0, content: 1 });
        expect(r.projects.find(p => p.id === project)).toMatchObject({ activities: 2, campaigns: 1, content: 1 });
        expect(r.team.find(t => t.name === 'Болор')).toMatchObject({ activities: 1, campaigns: 0, content: 1 });
        expect(r.team.find(t => t.name === 'Өмнөх хариуцагч')).toMatchObject({ activities: 0, campaigns: 0, content: 0 });
        expect(r.quality.undatedCompletedActivities).toBe(1);
        for (const key of ['activities', 'campaigns', 'content'] as const) {
            expect(r.projects.reduce((sum, p) => sum + p[key], 0)).toBe(r.totals[key]);
            expect(r.team.reduce((sum, t) => sum + t[key], 0)).toBe(r.totals[key]);
        }
        expect(buildMarketingPerformance(data, { ...range, project }).totals).toMatchObject({ activities: 2, campaigns: 1, content: 1 });
        data.activities = [];
        expect(buildMarketingPerformance(data, range).totals).toMatchObject({ activities: 0, campaigns: 0, content: 0 });
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
    it('keeps prior-only decline rows without invalidating fully configured current targets', () => {
        const data = fixture();
        data.leads = [lead('one'), lead('former-owner', { created_at: '2026-07-05', marketing_owner_name: 'Өмнөх хариуцагч' })];
        const r = buildMarketingPerformance(data, range);
        expect(r.team.find(t => t.name === 'Өмнөх хариуцагч')).toMatchObject({ target: null, leads: 0, leadChange: -100 });
        expect(r.teamTotal).toMatchObject({ targetsComplete: true, leadTarget: 6, dealTarget: 2, budget: 100, variance: 20 });
        data.leads.push(lead('untargeted', { marketing_owner_name: 'Зорилтгүй' }));
        expect(buildMarketingPerformance(data, range).teamTotal).toMatchObject({ targetsComplete: false, leadTarget: null, dealTarget: null, budget: null });
    });
    it('calculates cost per cohort lead, recorded handoff and unique valid deal by scope', () => {
        const r = buildMarketingPerformance(fixture(), range);
        expect(r.totals).toMatchObject({ spend: 120, spendComplete: true, hasSpend: true, costPerLead: 30, costPerSale: 120, costPerDeal: 120 });
        expect(r.projects.find(p => p.id === project)).toMatchObject({ costPerLead: 40, costPerSale: 120, costPerDeal: 120 });
        expect(r.team.find(t => t.name === 'Номин')).toMatchObject({ costPerLead: 40 });
        expect(r.channels.find(c => c.id === 'event')).toMatchObject({ leads: 0, spend: 120, hasSpend: true, costPerLead: null });
        expect(r.channels.find(c => c.id === 'meta_ads')).toMatchObject({ leads: 3, spend: 0, hasSpend: false, costPerLead: null });
        expect(r.previous).toMatchObject({ spend: 0, hasSpend: false, costPerLead: null });
    });
    it('distinguishes absent spending from an explicitly recorded zero and excludes overlaps', () => {
        const data = fixture();
        data.spend[0].exclusion = 'manual_overlap';
        expect(buildMarketingPerformance(data, range).totals).toMatchObject({ spend: 0, hasSpend: false, costPerLead: null, costPerSale: null, costPerDeal: null });
        data.spend[0].exclusion = null;
        data.spend[0].amount = 0;
        expect(buildMarketingPerformance(data, range).totals).toMatchObject({ spend: 0, hasSpend: true, costPerLead: 0, costPerSale: 0, costPerDeal: 0 });
        data.spend = [];
        expect(buildMarketingPerformance(data, range).totals).toMatchObject({ spend: 0, hasSpend: false, costPerLead: null });
    });
    it('withholds costs, budget variance and spend comparison when matching FX is missing', () => {
        const data = fixture();
        data.leads = [lead('one')];
        data.spend.push({ ...data.spend[0], id: 'prior', spent_at: '2026-07-03', amount: 60 });
        data.spend.push({ ...data.spend[0], id: 'missing', amount: 0, channel: 'meta_ads', source: 'meta', exclusion: 'missing_fx', native_amount: 10, currency: 'USD' });
        const r = buildMarketingPerformance(data, range);
        expect(r.totals).toMatchObject({ spend: 120, hasSpend: true, spendComplete: false, costPerLead: null, costPerSale: null, costPerDeal: null });
        expect(r.team[0]).toMatchObject({ previousSpend: 60, spendChange: null, variance: null, variancePct: null });
        expect(r.teamTotal).toMatchObject({ targetsComplete: true, budget: 100, variance: null, variancePct: null });
        expect(r.channels.find(c => c.id === 'event')).toMatchObject({ spendComplete: true });
        expect(r.channels.find(c => c.id === 'meta_ads')).toMatchObject({ spendComplete: false, hasSpend: false });
        data.spend[2].spent_at = '2026-07-04';
        const priorMissing = buildMarketingPerformance(data, range);
        expect(priorMissing.totals).toMatchObject({ spendComplete: true, costPerLead: 120 });
        expect(priorMissing.team[0]).toMatchObject({ variance: 20, spendChange: null });
        expect(priorMissing.previous).toMatchObject({ spendComplete: false, costPerLead: null });
    });
    it('requires recorded spending for savings and comparisons while preserving explicit zero', async () => {
        const data = fixture();
        data.leads = [lead('one'), lead('former-owner', { created_at: '2026-07-05', marketing_owner_name: 'Өмнөх хариуцагч' })];
        const currentSpend = data.spend[0];
        data.spend = [{ ...currentSpend, id: 'prior', spent_at: '2026-07-03', amount: 60 },
            { ...currentSpend, id: 'prior-only', spent_at: '2026-07-03', amount: 40, marketing_owner_name: 'Өмнөх хариуцагч' }];
        const noSpend = buildMarketingPerformance(data, range);
        expect(noSpend.team.find(t => t.name === 'Номин')).toMatchObject({ hasSpend: false, budget: 100, variance: null, variancePct: null, spendChange: null });
        expect(noSpend.team.find(t => t.name === 'Өмнөх хариуцагч')).toMatchObject({ leadChange: -100, previousSpend: 40, spendChange: null });
        expect(noSpend.teamTotal).toMatchObject({ budget: 100, variance: null, variancePct: null });
        const absentRows = await readSheetRows(await exportMarketingPerformance(noSpend), 'Багийн гүйцэтгэл', { defval: null });
        expect(absentRows.find(t => t['Менежер'] === 'Нийт')).toMatchObject({ 'Зарцуулсан (₮)': null, 'Зөрүү (₮)': null, 'Зардлын өөрчлөлт %': null });
        data.spend.push({ ...currentSpend, amount: 0 });
        const zero = buildMarketingPerformance(data, range);
        expect(zero.team.find(t => t.name === 'Номин')).toMatchObject({ hasSpend: true, variance: -100, variancePct: -100, spendChange: -100 });
        expect(zero.teamTotal).toMatchObject({ variance: -100, variancePct: -100 });
        const zeroRows = await readSheetRows(await exportMarketingPerformance(zero), 'Багийн гүйцэтгэл', { defval: null });
        expect(zeroRows.find(t => t['Менежер'] === 'Нийт')).toMatchObject({ 'Зарцуулсан (₮)': 0, 'Зөрүү (₮)': -100, 'Зардлын өөрчлөлт %': -100 });
        data.spend = data.spend.filter(s => s.id !== 'prior');
        expect(buildMarketingPerformance(data, range).team.find(t => t.name === 'Номин')).toMatchObject({ previousSpend: null, spendChange: null });
    });
    it('normalizes spending channels and keeps missing FX scoped to its project and owner', () => {
        const data = fixture();
        data.spend[0].channel = 'facebook_ads';
        data.spend.push({ ...data.spend[0], id: 'unmapped', project_id: null, marketing_owner_name: null, amount: 0, source: 'meta', exclusion: 'missing_fx', native_amount: 10, currency: 'USD' });
        const selected = buildMarketingPerformance(data, { ...range, project });
        expect(selected.totals).toMatchObject({ spendComplete: true, costPerLead: 40 });
        expect(selected.channels.find(c => c.id === 'meta_ads')).toMatchObject({ spend: 120, spendComplete: true, costPerLead: 40 });
        const all = buildMarketingPerformance(data, range);
        expect(all.totals.spendComplete).toBe(false);
        expect(all.projects.find(p => p.id === project)?.spendComplete).toBe(true);
        expect(all.team.find(t => t.name === 'Хариуцагч холбоогүй')?.spendComplete).toBe(false);
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
        expect(rows.find(t => t['Суваг'] === 'Event / Open Day')).toMatchObject({ Lead: 0, 'Зарцуулалт (₮)': 120, 'Зардлын төлөв': 'Бүртгэсэн зардал' });
        const team = await readSheetRows(workbook, 'Багийн гүйцэтгэл');
        expect(team.find(t => t['Менежер'] === 'Номин')).toMatchObject({ 'Зөрүү (₮)': 20, 'Нэг лидийн зардал (₮)': 40, 'Нэг шилжүүлэлтийн зардал (₮)': 120, 'Нэг гэрээтэй лидийн зардал (₮)': 120 });
        const projects = await readSheetRows(workbook, 'Төсөл бүрийн гүйцэтгэл');
        expect(projects.find(t => t['Төсөл'] === 'Төсөл A')).toMatchObject({ 'Зарцуулалт (₮)': 120, 'Нэг лидийн зардал (₮)': 40 });
        const summary = await readSheetRows(workbook, 'Хураангуй');
        expect(summary.find(t => t['Хугацаа'] === 'Нэг лидийн зардал (₮)')?.[range.from]).toBe(30);
    });
    it('exports completed work by recorded activity kind with current and previous counts', async () => {
        const data = fixture();
        data.activities.push(
            { ...data.activities[0], id: 'content', name: 'Дахин идэвхжүүлсэн poster', activity_kind: 'content' },
            { ...data.activities[0], id: 'prior-content', activity_kind: 'content', start_date: '2026-07-01', completed_on: '2026-07-31' },
        );
        const r = buildMarketingPerformance(data, range);
        const workbook = await exportMarketingPerformance(r);
        expect(await readSheetCsv(workbook, 'Тооцооны тайлбар')).toContain('Менежерт шилжүүлэлт нь Qualified Lead-ийн шалгуур хангасан баталгаа биш');
        const summary = await readSheetRows(workbook, 'Хураангуй', { defval: null });
        expect(summary.find(t => t['Хугацаа'] === 'Дууссан контент')).toMatchObject({ [range.from]: 1, [range.to]: 1, '__EMPTY': 0 });
        expect(summary.find(t => t['Хугацаа'] === 'Дууссан кампанит ажил')).toMatchObject({ [range.from]: 1, [range.to]: 0, '__EMPTY': null });
        const counts = { 'Дууссан ажил (нийт)': 2, 'Дууссан кампанит ажил': 1, 'Дууссан контент': 1 };
        const projects = await readSheetRows(workbook, 'Төсөл бүрийн гүйцэтгэл');
        expect(projects.find(t => t['Төсөл'] === 'Төсөл A')).toMatchObject(counts);
        const team = await readSheetRows(workbook, 'Багийн гүйцэтгэл');
        expect(team.find(t => t['Менежер'] === 'Номин')).toMatchObject(counts);
        expect(team.find(t => t['Менежер'] === 'Нийт')).toMatchObject(counts);
        const recent = await readSheetRows(workbook, 'Сүүлийн акцууд');
        expect(recent.find(t => t['Ажил'] === 'Open Day')?.['Ажлын төрөл']).toBe('Кампанит ажил');
        expect(recent.find(t => t['Ажил'] === 'Дахин идэвхжүүлсэн poster')?.['Ажлын төрөл']).toBe('Контент');
    });
    it('exports missing-cost blanks and FX warnings, preserves recorded zero, and explains current targets', async () => {
        const data = fixture();
        data.leads = [lead('one'), lead('former-owner', { created_at: '2026-07-05', marketing_owner_name: 'Өмнөх хариуцагч' })];
        data.spend.push({ ...data.spend[0], id: 'prior', spent_at: '2026-07-03', amount: 60 });
        data.spend.push({ ...data.spend[0], id: 'missing', channel: 'meta_ads', amount: 0, source: 'meta', exclusion: 'missing_fx', native_amount: 10, currency: 'USD' });
        const workbook = await exportMarketingPerformance(buildMarketingPerformance(data, range));
        const team = await readSheetRows(workbook, 'Багийн гүйцэтгэл', { defval: null });
        expect(team.find(t => t['Менежер'] === 'Номин')).toMatchObject({ 'Зөрүү (₮)': null, 'Нэг лидийн зардал (₮)': null, 'Зардлын төлөв': 'Ханш дутуу · зардал бүрэн биш' });
        expect(team.find(t => t['Менежер'] === 'Нийт')).toMatchObject({ 'Lead зорилт': 6, 'Зардлын өөрчлөлт %': null, 'Нэг лидийн зардал (₮)': null });
        expect(team.find(t => t['Менежер'] === 'Өмнөх хариуцагч')).toMatchObject({ 'Lead зорилт': null, 'Lead өөрчлөлт %': -100 });
        const channels = await readSheetRows(workbook, 'Сувгаар харьцаа', { defval: null });
        expect(channels.find(t => t['Суваг'] === 'Meta Ads')).toMatchObject({ 'Нэг лидийн зардал (₮)': null, 'Зардлын төлөв': 'Ханш дутуу · зардал бүрэн биш' });
        const notes = await readSheetCsv(workbook, 'Тооцооны тайлбар');
        expect(notes).toContain('Одоогийн бүх мөрийн зорилт бүрэн');
        expect(notes).toContain('Зөвхөн өмнөх хугацаанд үр дүнтэй мөр');
        data.spend.pop();
        data.spend[0].amount = 0;
        const zeroWorkbook = await exportMarketingPerformance(buildMarketingPerformance(data, range));
        const zeroSummary = await readSheetRows(zeroWorkbook, 'Хураангуй', { defval: null });
        expect(zeroSummary.find(t => t['Хугацаа'] === 'Нэг лидийн зардал (₮)')?.[range.from]).toBe(0);
    });
});
