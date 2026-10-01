import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadOperationsReport } from '@/lib/dashboard/operations-report-load';
import { loadMarketingPerformance } from '@/lib/marketing/performance-load';

const project = '00000000-0000-4000-8000-000000000001';
const otherProject = '00000000-0000-4000-8000-000000000002';
const scope = { projectIds: [project], managerName: 'Манда' };

function database(): SupabaseClient {
    const leads = [
        { id: 'own', project_id: project, sales_manager_name: 'Манда' },
        { id: 'colleague', project_id: project, sales_manager_name: 'Хамтрагч' },
        { id: 'foreign', project_id: otherProject, sales_manager_name: 'Манда' },
        { id: 'legacy', project_id: null, sales_manager_name: 'Манда' },
    ].map(row => ({ ...row, shop_id: 'shop', deleted_at: null, created_at: '2026-09-02T00:00:00Z', status: 'new', source: 'phone' }));
    const tables: Record<string, Record<string, any>[]> = {
        leads,
        projects: [{ id: project, shop_id: 'shop', name: 'Mandala' }, { id: otherProject, shop_id: 'shop', name: 'Elysium' }],
        property_viewings: leads.map(lead => ({ id: lead.id, shop_id: 'shop', deleted_at: null, leads: lead, scheduled_at: '2026-09-02T00:00:00Z', status: 'completed', meeting_type: 'new_customer' })),
    };
    return { from: (table: string) => {
        const predicates: Array<(row: Record<string, any>) => boolean> = [];
        let from = 0;
        let to = Infinity;
        const valueAt = (row: Record<string, any>, key: string) => key.split('.').reduce((value, part) => value?.[part], row);
        const query = {
            select: () => query,
            eq: (key: string, value: unknown) => { predicates.push(row => valueAt(row, key) === value); return query; },
            is: (key: string, value: unknown) => { predicates.push(row => (valueAt(row, key) ?? null) === value); return query; },
            in: (key: string, values: unknown[]) => { predicates.push(row => values.includes(valueAt(row, key))); return query; },
            gte: () => query, lte: () => query, lt: () => query, order: () => query,
            range: (start: number, end: number) => { from = start; to = end; return query; },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: (tables[table] || []).filter(row => predicates.every(predicate => predicate(row))).slice(from, to + 1), error: null }).then(resolve),
        };
        return query;
    } } as unknown as SupabaseClient;
}

describe('shared report lead scope', () => {
    it('operations reports count only own project leads and their completed meetings', async () => {
        const report = await loadOperationsReport(database(), { shopId: 'shop', from: '2026-09-01', to: '2026-09-30', now: new Date('2026-10-01T00:00:00Z'), canReadFinance: false, scope });
        expect(report.leads.newCount).toBe(1);
        expect(report.meetings?.completed).toBe(1);
    });
    it('marketing reports keep colleague, foreign-project and unlinked leads out of the cohort', async () => {
        const report = await loadMarketingPerformance(database(), 'shop', { from: '2026-09-01', to: '2026-09-30' }, scope);
        expect(report.report.totals.leads).toBe(1);
        expect(report.projects.map(row => row.id)).toEqual([project]);
        const organization = await loadMarketingPerformance(database(), 'shop', { from: '2026-09-01', to: '2026-09-30' });
        expect(organization.report.totals.leads).toBe(4);
    });
    it('rejects a requested marketing project outside the allowed scope', async () => {
        await expect(loadMarketingPerformance(database(), 'shop', { from: '2026-09-01', to: '2026-09-30', project: otherProject }, scope)).rejects.toMatchObject({ status: 403 });
    });
});
