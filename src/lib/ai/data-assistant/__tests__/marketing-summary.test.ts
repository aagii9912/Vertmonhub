// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketingSummary } from '../functions';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));

type Row = Record<string, string | number | null>;
let tables: Record<string, Row[]>;
let failing: string | null;
const pages: Array<{ table: string; from: number }> = [];

const metaCampaign = (id: string, values: Row = {}): Row => ({
    id, shop_id: 'shop-1', name: `Meta ${id}`, platform: 'facebook', external_id: `1202${id}`, status: 'active',
    budget: 50, spend: 0, impressions: 0, clicks: 0, conversions: 0, reach: 0, last_synced_at: '2026-10-04T02:00:00Z', ...values,
});
const plannedAd = (id: string, values: Row = {}): Row => ({
    id, shop_id: 'shop-1', name: `Төлөвлөгөө ${id}`, platform: 'facebook', external_id: null, status: 'draft',
    budget: 500_000, spend: 999, impressions: 5000, clicks: 400, conversions: 9, reach: 0, last_synced_at: null, ...values,
});

beforeEach(() => {
    vi.clearAllMocks();
    pages.length = 0;
    failing = null;
    tables = {
        shops: [{ id: 'shop-1', facebook_ad_account_id: '111' }],
        meta_spend_sync: [
            { shop_id: 'shop-1', account_id: 'act_111', currency: 'USD' },
            { shop_id: 'shop-1', account_id: 'act_222', currency: 'EUR' },
        ],
        ad_campaigns: [],
        social_posts: [{ shop_id: 'shop-1', platform: 'facebook', status: 'published', likes: 3, comments: 1, shares: 0, reach: 120, engagement_rate: 2.5, published_at: '2026-10-03T02:00:00Z' }],
    };
    mocks.from.mockImplementation((table: string) => {
        if (!(table in tables)) throw new Error(`Unexpected source: ${table}`);
        let rows = tables[table];
        let from = 0;
        let to = 999;
        const result = () => (failing === table
            ? { data: null, error: { message: `${table} unavailable` } }
            : { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });
        const chain = {
            select: () => chain,
            eq: (field: string, value: unknown) => { rows = rows.filter(r => r[field] === value); return chain; },
            order: () => chain,
            limit: () => chain,
            range: (start: number, end: number) => { from = start; to = end; pages.push({ table, from }); return chain; },
            maybeSingle: async () => { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return chain;
    });
});

describe('AI marketing summary (get_marketing_summary)', () => {
    it('reports Meta spend and CPA in the ad-account currency over every synced campaign, never mixing planned rows', async () => {
        tables.ad_campaigns = [
            ...Array.from({ length: 1000 }, (_, i) => metaCampaign(`${i}`, { spend: 1, impressions: 10, clicks: 1 })),
            metaCampaign('top', { spend: 300.38, impressions: 10_000, clicks: 700, conversions: 3, last_synced_at: '2026-10-05T01:00:00Z' }),
            plannedAd('p1'),
            plannedAd('p2', { budget: null, platform: 'google' }),
        ];
        const result = await fetchMarketingSummary('shop-1');

        expect(pages.filter(p => p.table === 'ad_campaigns').map(p => p.from)).toEqual([0, 1000]);
        expect(result.currency).toBe('USD');
        expect(result.campaignCount).toBe(1001);
        expect(result.activeCampaigns).toBe(1001);
        expect(result.totals).toEqual({
            spend: '$1,300.38', impressions: 20_000, clicks: 1700, conversions: 3, ctr: '8.50%', cpa: '$433.46',
        });
        expect(result.campaigns[0]).toMatchObject({ name: 'Meta top', spend: '$300.38', conversions: 3 });
        expect(result.campaigns).toHaveLength(10);
        // Төлөвлөгөөт мөр тусдаа, төсөв нь ₮ (бүртгэх форм).
        expect(result.plannedCampaigns).toEqual([
            { name: 'Төлөвлөгөө p1', platform: 'facebook', status: 'draft', budget: '500,000₮' },
            { name: 'Төлөвлөгөө p2', platform: 'google', status: 'draft', budget: '—' },
        ]);
        expect(result.basis).toContain('Meta зарын дансны валютаар (USD)');
        expect(result.basis).toContain('2 төлөвлөгөөт зар нийлбэрт ороогүй');
        expect(result.lastSyncedAt).toBe('2026-10-05');
        expect(JSON.stringify({ totals: result.totals, campaigns: result.campaigns })).not.toContain('₮');
        expect(result.recentPosts).toEqual([{ platform: 'facebook', status: 'published', likes: 3, comments: 1, reach: 120, engagement_rate: 2.5 }]);
    });

    it('takes the currency of the currently selected ad account only', async () => {
        tables.shops = [{ id: 'shop-1', facebook_ad_account_id: 'act_222' }];
        tables.ad_campaigns = [metaCampaign('1', { spend: 12.5 })];
        const result = await fetchMarketingSummary('shop-1');
        expect(result.currency).toBe('EUR');
        expect(result.totals.spend).toBe('€12.50');
    });

    it('labels the currency unknown instead of assuming tugrik when spend was never synced', async () => {
        tables.meta_spend_sync = [];
        tables.ad_campaigns = [metaCampaign('1', { spend: 300.38, conversions: 2 })];
        const result = await fetchMarketingSummary('shop-1');
        expect(result.currency).toBe('валют тодорхойгүй');
        expect(result.totals.spend).toBe('300.38');
        expect(result.totals.cpa).toBe('150.19');
        expect(result.basis).toContain('валют тодорхойгүй');
        expect(JSON.stringify(result.totals)).not.toMatch(/[₮$]/);
    });

    it('does not read the spend sync without a selected ad account and shows no totals without Meta campaigns', async () => {
        tables.shops = [{ id: 'shop-1', facebook_ad_account_id: null }];
        tables.ad_campaigns = [plannedAd('p1')];
        const result = await fetchMarketingSummary('shop-1');
        expect(mocks.from.mock.calls.map(([table]) => table)).not.toContain('meta_spend_sync');
        expect(result.currency).toBe('валют тодорхойгүй');
        expect(result.campaignCount).toBe(0);
        expect(result.totals).toEqual({ spend: '-', impressions: 0, clicks: 0, conversions: 0, ctr: '-', cpa: '-' });
        expect(result.plannedCampaigns).toHaveLength(1);
    });

    it.each(['ad_campaigns', 'meta_spend_sync', 'shops', 'social_posts'])('fails instead of summarising when %s cannot be read', async (table) => {
        tables.ad_campaigns = [metaCampaign('1', { spend: 10 })];
        failing = table;
        await expect(fetchMarketingSummary('shop-1')).rejects.toThrow();
    });
});
