import { describe, expect, it } from 'vitest';
import { buildOperationsReport, formatOperationsReportText, type OperationsLead } from '../operations-report';

const range = { from: '2026-09-01', to: '2026-09-30' };
const lead = (over: Partial<OperationsLead> = {}): OperationsLead => ({
    created_at: '2026-09-02T00:00:00Z', status: 'new', source: 'facebook', sales_manager_name: null,
    last_contact_at: null, next_followup_at: null, viewing_scheduled_at: null, category_id: null, ...over,
});
const base = { range, now: '2026-09-13T04:00:00.000Z', contracts: [], transactions: [], targets: [] };
const categories = [
    { id: 'investor', name: 'Хөрөнгө оруулагч', is_active: true },
    { id: 'barter', name: 'Бартер', is_active: false },
    { id: 'tenant', name: 'Түрээслэгч', is_active: true },
];

describe('operations report lead categories', () => {
    it('breaks new leads down by category in settings order, then uncategorized', () => {
        const report = buildOperationsReport({ ...base, categories, leads: [
            lead({ category_id: 'barter' }), lead({ category_id: 'investor' }), lead({ category_id: 'investor' }),
            lead(), lead({ category_id: 'deleted-category' }),
            lead({ category_id: 'investor', created_at: '2026-08-01T00:00:00Z' }), // хугацаанаас гадуур
            lead({ category_id: 'investor', deleted_at: '2026-09-03T00:00:00Z' }),
        ] });
        expect(report.leads.byCategory).toEqual([
            { categoryId: 'investor', name: 'Хөрөнгө оруулагч', count: 2 },
            { categoryId: 'barter', name: 'Бартер (архив)', count: 1 },
            { categoryId: null, name: 'Ангилалгүй', count: 2 },
        ]);
        expect(report.leads.byCategory.reduce((sum, row) => sum + row.count, 0)).toBe(report.leads.newCount);
        expect(formatOperationsReportText({ ...report, shopName: 'Тест' }))
            .toContain('Ангиллаар: Хөрөнгө оруулагч 2 · Бартер (архив) 1 · Ангилалгүй 2');
    });

    it('omits the breakdown for a project without categories', () => {
        const report = buildOperationsReport({ ...base, leads: [lead()] });
        expect(report.leads.byCategory).toEqual([]);
        expect(formatOperationsReportText({ ...report, shopName: 'Тест' })).not.toContain('Ангиллаар');
    });
});
