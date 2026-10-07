// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMetaAdsReport, type MetaInsightDayRow, type MetaLedgerRow } from '@/lib/marketing/meta-ads-report';

const state = vi.hoisted(() => ({ tables: [] as string[], load: vi.fn(), postsError: null as { message: string } | null }));
const db = {
    from: (table: string) => {
        state.tables.push(table);
        const query = {
            select: () => query, eq: () => query, order: () => query,
            limit: async () => (state.postsError ? { data: null, error: state.postsError } : { data: [{ platform: 'facebook', status: 'published', likes: 3 }], error: null }),
        };
        return query;
    },
};
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));
vi.mock('@/lib/marketing/meta-ads-load', () => ({ loadMetaAdsReport: state.load }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { fetchMarketingSummary } from '../functions';
import { TOOL_CATALOG } from '@/lib/ai/tool-catalog';

const RANGE = { from: '2026-09-01', to: '2026-09-30' };
const ledger: MetaLedgerRow[] = [
    { account_id: 'act_1', campaign_id: '101', campaign_name: 'Дуудлага', spent_at: '2026-09-01', native_amount: '10', currency: 'USD', timezone: 'Asia/Ulaanbaatar', amount_mnt: '35000', mnt_per_unit: '3500' },
    { account_id: 'act_1', campaign_id: '202', campaign_name: 'Мессеж', spent_at: '2026-09-01', native_amount: '20', currency: 'USD', timezone: 'Asia/Ulaanbaatar', amount_mnt: null, mnt_per_unit: null },
];
const insights: MetaInsightDayRow[] = [
    { account_id: 'act_1', currency: 'USD', day: '2026-09-01', campaign_id: '101', campaign_name: 'Дуудлага', adset_id: '1', spend: '10', impressions: '1000', reach: '900',
        clicks: '30', inline_link_clicks: '20', landing_page_views: '0', result_type: 'calls', results: '4', result_source: 'results' },
    { account_id: 'act_1', currency: 'USD', day: '2026-09-01', campaign_id: '202', campaign_name: 'Мессеж', adset_id: '2', spend: '20', impressions: '2000', reach: '1500',
        clicks: '60', inline_link_clicks: '40', landing_page_views: '0', result_type: 'messages', results: '6', result_source: 'results' },
];

beforeEach(() => {
    state.tables.length = 0;
    state.postsError = null;
    state.load.mockReset();
});

describe('AI marketing summary', () => {
    it('summarises dated Meta spend and typed results instead of the ad_campaigns snapshot', async () => {
        state.load.mockResolvedValue({ range: RANGE, report: buildMetaAdsReport({ range: RANGE, ledger, insights }), activities: [] });
        const scope = { projectIds: null, managerName: null };
        const summary = await fetchMarketingSummary('shop-1', { from: '2026-09-01', to: '2026-09-30' }, scope) as Record<string, any>;
        expect(state.load).toHaveBeenCalledWith(expect.anything(), 'shop-1', { from: '2026-09-01', to: '2026-09-30' }, scope);
        expect(state.tables).toEqual(['social_posts']);
        expect(summary.period).toEqual(RANGE);
        // Ханшгүй 20 USD төгрөгт нэмэгдэхгүй, тусад нь.
        expect(summary.metaAds).toMatchObject({ spend: '35,000₮ + 20 USD (ханшгүй)', spendMnt: null, convertedMnt: 35000, pendingNative: { USD: 20 }, impressions: 3000, linkClicks: 60 });
        expect(summary.metaAds.results).toEqual([
            expect.objectContaining({ type: 'calls', count: 4, cost: '8,750₮' }),
            expect.objectContaining({ type: 'messages', count: 6, cost: '3.33 USD' }),
        ]);
        expect(summary.notes.join(' ')).toContain('Ханшгүй зардал 20 USD');
        expect(summary.url).toBe('/marketing/ads?from=2026-09-01&to=2026-09-30');
        expect(summary.guidance).toContain('нэг тоонд нэмэхгүй');
    });

    it('fails closed instead of reporting zeros', async () => {
        state.load.mockRejectedValue(new Error('permission denied'));
        expect(await fetchMarketingSummary('shop-1', {})).toEqual({ error: 'Meta зарын тайлан бүрэн уншигдсангүй. Тоо таамаглаж дүгнэх боломжгүй.' });
    });

    it('fails instead of summarising when the recent posts cannot be read', async () => {
        state.load.mockResolvedValue({ range: RANGE, report: buildMetaAdsReport({ range: RANGE, ledger, insights }), activities: [] });
        state.postsError = { message: 'social_posts unavailable' };
        expect(await fetchMarketingSummary('shop-1', {})).toEqual({ error: 'Сошиал постын гүйцэтгэлийг уншиж чадсангүй' });
    });

    it('runs with the sales manager project scope (catalog `scoped`)', () => {
        expect(TOOL_CATALOG.get_marketing_summary).toEqual({ kind: 'read', module: 'marketing-roi', scoped: true });
    });
});
