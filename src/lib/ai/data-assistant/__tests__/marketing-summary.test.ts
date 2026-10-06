import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketingSummary } from '../functions';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));

type Row = Record<string, string | number | null>;
let tables: Record<string, Row[]>;

beforeEach(() => {
    tables = {
        ad_campaigns: [
            { shop_id: 'shop-1', name: 'Elysium', platform: 'facebook', status: 'active', spend: 200.25, impressions: 10000, clicks: 250, conversions: 4 },
            { shop_id: 'shop-1', name: 'Mandala', platform: 'facebook', status: 'paused', spend: 100.13, impressions: 5000, clicks: 50, conversions: 0 },
        ],
        social_posts: [],
        shops: [{ id: 'shop-1', facebook_ad_account_id: '1234567890' }],
        meta_spend_sync: [{ shop_id: 'shop-1', account_id: 'act_1234567890', currency: 'USD' }],
    };
    mocks.from.mockImplementation((table: string) => {
        let rows = tables[table] ?? [];
        const chain = {
            select: () => chain,
            eq: (field: string, value: unknown) => { rows = rows.filter((r) => r[field] === value); return chain; },
            order: () => chain,
            limit: () => chain,
            maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
        };
        return chain;
    });
});

describe('AI marketing summary spend', () => {
    it('reports ad spend in the ad account currency, never as ₮', async () => {
        const summary = await fetchMarketingSummary('shop-1', {});
        expect(summary.spendCurrency).toBe('USD');
        expect(summary.totals).toMatchObject({ spend: '$300.38', cpa: '$75.10', clicks: 300 });
        expect(JSON.stringify(summary.totals)).not.toContain('₮');
    });

    it('labels the currency unknown when no spend sync has recorded it', async () => {
        tables.meta_spend_sync = [];
        const summary = await fetchMarketingSummary('shop-1', {});
        expect(summary.spendCurrency).toBe('валют тодорхойгүй');
        expect(summary.totals.spend).toBe('300.38');
        expect(summary.spendBasis).toContain('төгрөгт хөрвүүлээгүй');
    });

    it('uses ₮ only when the ad account itself is in MNT', async () => {
        tables.meta_spend_sync = [{ shop_id: 'shop-1', account_id: 'act_1234567890', currency: 'MNT' }];
        const summary = await fetchMarketingSummary('shop-1', {});
        expect(summary.totals.spend).toContain('₮');
    });
});
