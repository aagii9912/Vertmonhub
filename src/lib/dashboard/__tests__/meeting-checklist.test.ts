import { describe, expect, it } from 'vitest';
import { checklistProgress, marketingChecklist, salesChecklist, type MeetingChecklistInput } from '../meeting-checklist';
import { buildOperationsReport } from '../operations-report';
import { buildWeeklySales } from '../weekly-sales';
import { summarizeContentPlan, type ContentItem } from '@/lib/marketing/content-plan';
import type { ChannelReportMatches } from '@/lib/marketing/channel-reports-load';
import type { SocialWeek } from '@/lib/marketing/social-week';
import type { WeeklyUpdate } from '../weekly-review';

const range = { from: '2026-10-07', to: '2026-10-13' };
const status = (steps: { id: string; status: string }[]) => Object.fromEntries(steps.map(step => [step.id, step.status]));
const update = (author_role: string): WeeklyUpdate => ({ id: author_role, user_id: author_role, author_name: author_role, meeting_date: '2026-10-14', achievements: 'x', blockers: '', next_steps: '', updated_at: '2026-10-13T10:00:00Z', author_role });

describe('sales checklist', () => {
    it('Elysium today: undated contracts need the ERP sales export; meetings and leads come from the CRM', () => {
        const sales = { ...buildOperationsReport({ range, now: '2026-10-13T10:00:00Z', transactions: null, targets: [],
            contracts: [{ id: 'e1', contract_date: null, product_type: 'residential', total_price: null, contract_status: 'active', prepayment_paid_cash: null }],
            viewings: [{ scheduled_at: '2026-10-08T03:00:00Z', status: 'completed', meeting_type: 'new_customer' }],
            leads: [{ created_at: '2026-10-08T03:00:00Z', status: 'new', source: 'website', sales_manager_name: null, last_contact_at: null, next_followup_at: null, viewing_scheduled_at: null }] }), shopName: 'Elysium' };
        const weeklySales = buildWeeklySales({ range, sales: null, previousSales: null, crmContracts: [], crmUndated: 77,
            inventory: { info: { date: '2026-09-26', source: 'Elysium ERP', kind: 'erp' }, rows: [] }, monthTarget: 5350000000 });
        const steps = salesChecklist({ range, sales, weeklySales, updates: [update('marketing')] });
        expect(status(steps)).toEqual({ 'erp-sales': 'todo', inventory: 'warn', meetings: 'done', 'daily-report': 'check', leads: 'warn', plan: 'done', updates: 'todo', extra: 'check' });
        expect(steps.find(step => step.id === 'erp-sales')!.detail).toContain('Огноогүй 77 гэрээ');
        expect(steps.find(step => step.id === 'inventory')!.detail).toContain('2026-09-26');
        expect(checklistProgress(steps)).toEqual({ done: 2, total: 7 });
    });

    it('a fresh ERP export this week, a plan and a written update are ready', () => {
        const weeklySales = buildWeeklySales({ range, sales: { info: { date: '2026-10-13', source: 'ERP' }, rows: [] }, previousSales: null, crmContracts: null,
            inventory: { info: { date: '2026-10-13', source: 'ERP', kind: 'erp' }, rows: [] }, monthTarget: 100 });
        const steps = salesChecklist({ range, weeklySales, updates: [update('sales_manager')] });
        expect(status(steps)).toMatchObject({ 'erp-sales': 'done', inventory: 'done', plan: 'done', updates: 'done' });
        // Хуудсанд ачаалаагүй өгөгдлийг «бэлэн» гэж таамаглахгүй.
        expect(status(steps)).toMatchObject({ meetings: 'warn', leads: 'check' });
    });
});

const item = (id: string, status: ContentItem['status'], date: string, image_paths: string[] = []): ContentItem => ({
    id, title: id, type: 'post', platform: 'facebook', scheduled_date: date, scheduled_time: null, status, description: null, assigned_to: null, color: null,
    image_paths, created_by: null, updated_at: '2026-10-13T10:00:00Z',
});
const plan = (items: ContentItem[]) => ({ week: summarizeContentPlan(items, range, '2026-10-14'), next: summarizeContentPlan(items, { from: '2026-10-14', to: '2026-10-20' }, '2026-10-14') });
const social = (syncedTo: string | null, page = true): SocialWeek => ({ page: page ? { id: '1', name: 'Elysium Residence' } : null, range, previousRange: range, syncedTo, rangeDays: 7, metrics: [], posts: [] });
const channels = (present: string[]) => Object.fromEntries(['meta_ads', 'facebook_page', 'callpro', 'sms'].map(source => [source, { report: present.includes(source) ? { id: source } : null }])) as unknown as ChannelReportMatches;

describe('marketing checklist (own content plan, never leads)', () => {
    it('Elysium today: Page connected and synced, nothing else entered', () => {
        const input: MeetingChecklistInput = { range, contentPlan: plan([]), social: social('2026-10-12'), channels: channels([]), slides: [], updates: [] };
        const steps = marketingChecklist(input);
        expect(status(steps)).toEqual({ 'content-plan': 'todo', 'content-status': 'todo', posters: 'todo', facebook: 'done', channels: 'todo', spend: 'check', extra: 'check', 'next-week': 'todo', updates: 'todo' });
        expect(steps.find(step => step.id === 'channels')!.detail).toContain('Meta Ads');
        expect(checklistProgress(steps)).toEqual({ done: 1, total: 8 });
    });

    it('flags overdue content, posters missing on published items, partial channel exports and a stale or missing Page', () => {
        const steps = marketingChecklist({ range, contentPlan: plan([item('a', 'published', '2026-10-08', ['p.png']), item('b', 'published', '2026-10-09'), item('c', 'planned', '2026-10-10'), item('d', 'planned', '2026-10-16')]),
            social: social('2026-10-05'), channels: channels(['meta_ads', 'callpro']), updates: [update('marketing')] });
        expect(status(steps)).toMatchObject({ 'content-plan': 'done', 'content-status': 'warn', posters: 'warn', facebook: 'warn', channels: 'warn', 'next-week': 'done', updates: 'done' });
        expect(steps.find(step => step.id === 'content-status')!.detail).toContain('Хоцорсон 1');
        expect(steps.find(step => step.id === 'posters')!.detail).toContain('1 контент зураггүй');
        expect(steps.find(step => step.id === 'channels')!.detail).toBe('Оруулаагүй: Масс SMS.');
        expect(marketingChecklist({ range, social: social(null, false) }).find(step => step.id === 'facebook')!.status).toBe('todo');
    });

    it('never mentions leads or contracts', () => {
        const text = JSON.stringify(marketingChecklist({ range, contentPlan: plan([]), social: null, channels: null }));
        expect(text).not.toMatch(/лид|гэрээ/i);
    });
});
