import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchMetaAccount, fetchMetaDailySpend } from '@/lib/facebook/daily-spend';
import { mergeMarketingSpend } from '../spend-load';
import { buildMarketingPerformance, type MarketingSpend } from '../performance';
import { syncMetaSpend, MetaSyncInput } from '../meta-spend';
vi.mock('@/lib/facebook/messenger', () => ({ appsecretProof: () => 'proof' }));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: (value: string) => value }));
const account = { id: 'act_123', currency: 'USD', timezone_name: 'Asia/Ulaanbaatar' };
const insight = { account_id: '123', account_currency: 'USD', campaign_id: '456', campaign_name: 'Campaign', date_start: '2026-09-10', date_stop: '2026-09-10', spend: '12.50' };
const http = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', http); });
afterEach(() => vi.unstubAllGlobals());
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
it('requests daily campaign data and paginates using only the trusted host and bearer header', async () => {
    http.mockResolvedValueOnce(reply({ data: [insight], paging: { next: 'https://evil.test/?access_token=leaked', cursors: { after: 'cursor1' } } }))
        .mockResolvedValueOnce(reply({ data: [{ ...insight, date_start: '2026-09-11', date_stop: '2026-09-11' }] }));
    expect(await fetchMetaDailySpend(account, 'secret-token', '2026-09-01', '2026-09-30')).toHaveLength(2);
    for (const [url, init] of http.mock.calls) {
        expect(url.origin).toBe('https://graph.facebook.com'); expect(url.searchParams.get('time_increment')).toBe('1');
        expect(url.searchParams.get('level')).toBe('campaign'); expect(url.toString()).not.toContain('secret-token');
        expect(init.headers.Authorization).toBe('Bearer secret-token');
    }
    expect(http.mock.calls[1][0].searchParams.get('after')).toBe('cursor1');
});
it.each([
    { ...insight, account_currency: 'MNT' }, { ...insight, account_id: '999' }, { ...insight, spend: '-2' },
    { ...insight, date_stop: '2026-09-11' }, { ...insight, date_start: '2026-08-31', date_stop: '2026-08-31' },
])('rejects unsafe daily rows instead of importing a partial result: %j', async row => {
    http.mockResolvedValue(reply({ data: [row] }));
    await expect(fetchMetaDailySpend(account, 'secret', '2026-09-01', '2026-09-30')).rejects.toThrow();
});
it('rejects duplicate rows and nonadvancing pagination', async () => {
    http.mockResolvedValueOnce(reply({ data: [insight, insight] }));
    await expect(fetchMetaDailySpend(account, 'secret', '2026-09-01', '2026-09-30')).rejects.toThrow();
    http.mockResolvedValue(reply({ data: [], paging: { next: 'more', cursors: { after: 'same' } } }));
    await expect(fetchMetaDailySpend(account, 'secret', '2026-09-01', '2026-09-30')).rejects.toThrow();
});
it('does not expose token-bearing upstream errors and rejects missing account metadata', async () => {
    http.mockResolvedValueOnce(reply({ error: { code: 190, message: 'secret-token' } }, 400));
    await expect(fetchMetaAccount('act_123', 'secret-token')).rejects.toThrow(/эрх дууссан/);
    http.mockResolvedValueOnce(reply({ id: 'act_123', currency: 'USD' }));
    await expect(fetchMetaAccount('act_123', 'secret-token')).rejects.toThrow();
});
function database(saveFails = false) {
    const filters: [string, unknown][] = [];
    const db = { from: vi.fn((table: string) => {
        const q = { select: () => q, eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
            single: async () => ({ data: { facebook_ad_account_id: '123', facebook_user_access_token: 'secret' }, error: null }),
            maybeSingle: async () => ({ data: table === 'meta_spend_sync' ? { currency: 'USD', mnt_per_unit: 3500 } : null, error: null }) };
        return q;
    }), rpc: vi.fn(async (name: string) => ({ data: 1, error: saveFails && name === 'save_meta_daily_spend' ? { message: 'DB failed' } : null })) };
    return { db: db as unknown as SupabaseClient, rpc: db.rpc, filters };
}
it('only commits after every page succeeds; partial response preserves the previous ledger', async () => {
    const { db, rpc } = database();
    http.mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply({ data: [insight], paging: { next: 'more', cursors: { after: 'next' } } })).mockResolvedValueOnce(reply({ error: { code: 2 } }, 500));
    await expect(syncMetaSpend(db, 'shop1', { from: '2026-09-01', to: '2026-09-15' })).rejects.toThrow();
    expect(rpc.mock.calls.map(c => c[0])).toEqual(['record_meta_spend_failure']);
});
it('persists rate and original currency with server-selected account; DB failure is not success', async () => {
    const { db, rpc, filters } = database();
    http.mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply({ data: [insight] }));
    expect(await syncMetaSpend(db, 'shop1', { from: '2026-09-01', to: '2026-09-15' })).toMatchObject({ rows: 1, mntPerUnit: 3500 });
    expect(rpc).toHaveBeenCalledWith('save_meta_daily_spend', expect.objectContaining({ p_shop: 'shop1', p_account: 'act_123', p_rate: 3500, p_replace_rate: false }));
    expect(filters).toContainEqual(['id', 'shop1']); expect(filters).toContainEqual(['shop_id', 'shop1']);
    http.mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply({ data: [insight] }));
    await expect(syncMetaSpend(database(true).db, 'shop1', { from: '2026-09-01', to: '2026-09-15' })).rejects.toThrow(/хадгалж/);
});
it('rejects wrong currency, invalid ranges and oversized backfills', async () => {
    http.mockResolvedValueOnce(reply(account));
    const { db, rpc } = database();
    await expect(syncMetaSpend(db, 'shop1', { currency: 'EUR', mntPerUnit: 3800 })).rejects.toThrow(/валют/);
    expect(rpc.mock.calls.map(c => c[0])).toEqual(['record_meta_spend_failure']);
    for (const args of [{ from: '2026-02-30', to: '2026-03-01' }, { from: '2026-01-01', to: '2026-09-01' }, { from: '2026-09-01' }, { mntPerUnit: 0, currency: 'USD' }]) expect(MetaSyncInput.safeParse(args).success).toBe(false);
});
it('reconciles manual overlap, zero-activity covered days, missing FX and exact campaign attribution in the report', () => {
    const manual: MarketingSpend = { id: 'manual', spent_at: '2026-09-10', amount: 999, channel: 'facebook_ads', project_id: null, marketing_owner_name: null, marketing_campaign_id: null, note: null };
    const daily = { id: 'auto', account_id: 'act_123', campaign_id: '456', campaign_name: 'Campaign', spent_at: '2026-09-10', native_amount: '12.50', currency: 'USD', timezone: 'Asia/Ulaanbaatar', amount_mnt: 43750, mnt_per_unit: 3500 };
    const rows = mergeMarketingSpend([manual, { ...manual, id: 'service', channel: 'content' }, { ...manual, id: 'zero', spent_at: '2026-09-11' }, { ...manual, id: 'old', spent_at: '2026-09-01' }],
        [daily, { ...daily, id: 'fx', campaign_id: '789', amount_mnt: null, mnt_per_unit: null }], [{ spent_at: '2026-09-10' }, { spent_at: '2026-09-11' }], [{ id: 'campaign', external_campaign_id: '456', project_id: 'project', marketing_owner_name: 'Owner' }]);
    expect(rows.find(r => r.id === 'meta:auto')).toMatchObject({ marketing_campaign_id: 'campaign', project_id: 'project', amount: 43750 });
    const report = buildMarketingPerformance({ spend: rows, activities: [], leads: [], projects: [], contracts: [], targets: [] }, { from: '2026-09-01', to: '2026-09-30' });
    expect(report.totals.spend).toBe(43750 + 999 + 999);
    expect(report.spendQuality.current).toEqual({ missingFx: 1, excludedManual: 2, unmappedMeta: 1, pendingCurrencies: { USD: 12.5 } });
});
