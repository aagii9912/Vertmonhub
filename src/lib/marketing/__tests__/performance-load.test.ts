import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMarketingPerformance } from '../performance-load';

function database(failure?: string) {
    const calls: { table: string; filters: [string, unknown][]; start: number }[] = [];
    const rows = Array.from({ length: 1005 }, (_, i) => ({ id: String(i), created_at: '2026-08-10', project_id: null, source: 'phone', marketing_campaign_id: null, marketing_owner_name: null, marketing_channel: null, sales_handoff_at: null, sales_manager_name: null }));
    const from = vi.fn((table: string) => {
        const filters: [string, unknown][] = [];
        const q = {
            select: () => q, order: () => q,
            eq: (key: string, value: unknown) => { filters.push([key, value]); return q; },
            is: (key: string, value: unknown) => { filters.push([key, value]); return q; },
            gte: () => q, lte: () => q,
            range: (start: number, end: number) => {
                calls.push({ table, filters, start });
                return Promise.resolve({ data: table === 'leads' ? rows.slice(start, end + 1) : [], error: table === failure ? { message: 'read failed' } : null });
            },
        }; return q;
    });
    return { db: { from } as unknown as SupabaseClient, calls, from };
}
it('reads more than 1000 leads, scopes every query and excludes soft deletes', async () => {
    const { db, calls } = database();
    const { report } = await loadMarketingPerformance(db, 'shop-a', { from: '2026-08-01', to: '2026-08-31' });
    expect(report.totals.leads).toBe(1005);
    expect(calls.filter(c => c.table === 'leads').map(c => c.start)).toEqual([0, 1000]);
    for (const call of calls) expect(call.filters).toContainEqual(['shop_id', 'shop-a']);
    for (const call of calls.filter(c => ['leads', 'property_contracts', 'marketing_spend_entries'].includes(c.table))) expect(call.filters).toContainEqual(['deleted_at', null]);
});
it.each(['projects', 'marketing_campaigns', 'leads', 'property_contracts', 'marketing_spend_entries', 'marketing_targets', 'meta_daily_spend', 'meta_spend_coverage'])('does not display misleading zeros when %s fails', async table => {
    await expect(loadMarketingPerformance(database(table).db, 'shop-a', { from: '2026-08-01', to: '2026-08-31' })).rejects.toThrow('read failed');
});
