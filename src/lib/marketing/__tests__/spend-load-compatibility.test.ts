import { expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMarketingSpend } from '../spend-load';

function database(error: { code: string; message: string } | null, rowCount = 1) {
    const calls: { columns: string; filters: [string, unknown][]; start: number }[] = [];
    const rows = Array.from({ length: rowCount }, (_, i) => ({ id: String(i), account_id: 'act_123', campaign_id: String(i), campaign_name: 'Test', spent_at: '2026-09-01', native_amount: 1, currency: 'MNT', timezone: 'Asia/Ulaanbaatar', amount_mnt: 1, mnt_per_unit: 1 }));
    const db = { from: (table: string) => {
        let columns = '';
        const filters: [string, unknown][] = [];
        const q = {
            select: (value: string) => { columns = value; return q; }, order: () => q,
            eq: (key: string, value: unknown) => { filters.push([key, value]); return q; },
            gte: (key: string, value: unknown) => { filters.push([`gte:${key}`, value]); return q; },
            lte: (key: string, value: unknown) => { filters.push([`lte:${key}`, value]); return q; }, is: () => q,
            range: (start: number, end: number) => {
                if (table !== 'meta_daily_spend') return Promise.resolve({ data: [], error: null });
                calls.push({ columns, filters, start });
                const withSource = columns.includes('ingestion_source');
                return Promise.resolve(withSource && error ? { data: null, error } : {
                    data: rows.slice(start, end + 1).map(row => withSource ? { ...row, ingestion_source: 'file' } : row), error: null,
                });
            },
        };
        return q;
    } } as unknown as SupabaseClient;
    return { db, calls };
}

it.each(['42703', 'PGRST204'])('keeps existing API spend paginated and scoped before the import migration (%s)', async code => {
    const { db, calls } = database({ code, message: 'column meta_daily_spend.ingestion_source does not exist' }, 1001);
    const spend = await loadMarketingSpend(db, 'shop-a', '2026-09-01', '2026-09-30');
    expect(spend).toHaveLength(1001);
    expect(spend.every(row => row.ingestionSource === 'api')).toBe(true);
    expect(spend.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(1001);
    expect(calls.map(call => call.start)).toEqual([0, 0, 1000]);
    expect(calls.map(call => call.columns.includes('ingestion_source'))).toEqual([true, false, false]);
    for (const call of calls) expect(call.filters).toEqual([['shop_id', 'shop-a'], ['gte:spent_at', '2026-09-01'], ['lte:spent_at', '2026-09-30']]);
});
it('uses file provenance without a retry when the migration is present', async () => {
    const { db, calls } = database(null);
    expect((await loadMarketingSpend(db, 'shop-a', '2026-09-01', '2026-09-30'))[0].ingestionSource).toBe('file');
    expect(calls).toHaveLength(1);
});
it.each([
    { code: '42501', message: 'permission denied for ingestion_source' },
    { code: '42703', message: 'column amount_mnt does not exist' },
])('does not hide unrelated database errors ($code, $message)', async error => {
    const { db, calls } = database(error);
    await expect(loadMarketingSpend(db, 'shop-a', '2026-09-01', '2026-09-30')).rejects.toThrow(error.message);
    expect(calls).toHaveLength(1);
});
