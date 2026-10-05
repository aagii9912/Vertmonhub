// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { fakeDb, type FakeDb } from '@/lib/facebook/__tests__/lead-ads-db';

const mocks = vi.hoisted(() => ({
    read: vi.fn(), write: vi.fn(), shop: vi.fn(),
    backfill: vi.fn(), subscribe: vi.fn(),
    db: null as unknown as FakeDb,
}));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: mocks.read, requireModuleWrite: mocks.write, requireModuleDelete: vi.fn(), requireAnyModule: mocks.read,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: (value: string | null | undefined) => value || null }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => mocks.db.client }));
vi.mock('@/lib/facebook/leadgen-backfill', () => ({ LEADGEN_RETENTION_DAYS: 90, backfillPageLeads: mocks.backfill }));
vi.mock('@/lib/facebook/marketing-api', () => ({ subscribePageToApp: mocks.subscribe }));

import { GET, POST } from '../route';

const SHOP = 'shop-1';
const URL_BASE = 'http://localhost/api/marketing/facebook/lead-ads';
const denied = () => NextResponse.json({ error: 'Хандах эрх алга' }, { status: 403 });
const recent = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const post = (body: unknown) => POST(new NextRequest(URL_BASE, { method: 'POST', body: JSON.stringify(body) }));
let subscribedApps: unknown;

beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(null);
    mocks.write.mockResolvedValue(null);
    mocks.shop.mockResolvedValue({ id: SHOP });
    mocks.backfill.mockResolvedValue({ forms: 1, received: 2, ingested: 2, duplicate: 0, skipped: 0, failed: 0, reasons: {}, complete: true });
    mocks.subscribe.mockResolvedValue({ success: true, leadgen: true });
    mocks.db = fakeDb({
        shops: [{ id: SHOP, facebook_page_id: '1111', facebook_page_name: 'Mandala', facebook_page_access_token: 'page-token' }],
        meta_leadgen_events: [
            { leadgen_id: '1', shop_id: SHOP, status: 'saved', reason: null, origin: 'webhook', updated_at: recent(5) },
            { leadgen_id: '2', shop_id: SHOP, status: 'skipped', reason: 'permission_missing', origin: 'webhook', updated_at: recent(10) },
            { leadgen_id: '3', shop_id: 'other-shop', status: 'failed', reason: 'db_error', origin: 'webhook', updated_at: recent(1) },
        ],
    });
    vi.stubEnv('FACEBOOK_APP_ID', '424242');
    vi.stubEnv('FACEBOOK_APP_SECRET', 'app-secret');
    subscribedApps = { data: [{ id: '999', subscribed_fields: ['leadgen'] }, { id: '424242', subscribed_fields: ['messages', 'leadgen'] }] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(subscribedApps), { status: 200 })));
});

describe('GET /api/marketing/facebook/lead-ads', () => {
    it('reports subscription, 90-day outcomes and problems for the active shop only', async () => {
        const res = await GET(new NextRequest(URL_BASE));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            connected: true, pageName: 'Mandala', subscribed: true, eventsAvailable: true,
            counts: { saved: 1, skipped: 1, failed: 0 },
            lastSavedAt: expect.any(String),
            problems: [expect.objectContaining({ leadgen_id: '2', reason: 'permission_missing' })],
        });
        const url = new URL(vi.mocked(fetch).mock.calls[0][0] as URL);
        expect(url.pathname).toBe('/v26.0/1111/subscribed_apps');
    });

    it('shows a missing leadgen subscription and tolerates the events table not existing yet', async () => {
        subscribedApps = { data: [{ id: '424242', subscribed_fields: ['messages'] }] };
        mocks.db.fail['meta_leadgen_events:select'] = { code: 'PGRST205', message: 'missing' };
        const body = await (await GET(new NextRequest(URL_BASE))).json();
        expect(body).toMatchObject({ subscribed: false, eventsAvailable: false, counts: { saved: 0, skipped: 0, failed: 0 }, problems: [] });
    });

    it('returns connected:false without a page and respects the read gate', async () => {
        mocks.db.tables.shops[0].facebook_page_access_token = null;
        expect(await (await GET(new NextRequest(URL_BASE))).json()).toEqual({ connected: false });
        mocks.read.mockResolvedValue(denied());
        expect((await GET(new NextRequest(URL_BASE))).status).toBe(403);
    });
});

describe('POST /api/marketing/facebook/lead-ads', () => {
    it('backfills the active shop\'s page with its token', async () => {
        const res = await post({ action: 'backfill', days: 30 });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ ingested: 2, complete: true });
        expect(mocks.backfill).toHaveBeenCalledWith(mocks.db.client, { id: SHOP, pageId: '1111', token: 'page-token' },
            { days: 30, deadline: expect.any(Number) });
    });

    it('re-subscribes the page and reports a leadgen failure as 502 only when DMs failed too', async () => {
        expect((await post({ action: 'subscribe' })).status).toBe(200);
        expect(mocks.subscribe).toHaveBeenCalledWith('1111', 'page-token');
        mocks.subscribe.mockResolvedValue({ success: false, error: 'x', leadgen: false });
        expect((await post({ action: 'subscribe' })).status).toBe(502);
    });

    it('rejects writers without permission, bad bodies, missing secret and unconnected pages', async () => {
        mocks.write.mockResolvedValueOnce(denied());
        expect((await post({ action: 'backfill' })).status).toBe(403);
        expect((await post({ action: 'backfill', days: 91 })).status).toBe(400);
        expect((await post({ action: 'delete' })).status).toBe(400);
        vi.stubEnv('FACEBOOK_APP_SECRET', ' ');
        expect((await post({ action: 'backfill' })).status).toBe(503);
        vi.stubEnv('FACEBOOK_APP_SECRET', 'app-secret');
        mocks.db.tables.shops[0].facebook_page_id = null;
        expect((await post({ action: 'backfill' })).status).toBe(400);
        expect(mocks.backfill).not.toHaveBeenCalled();
        expect(mocks.subscribe).not.toHaveBeenCalled();
    });
});
