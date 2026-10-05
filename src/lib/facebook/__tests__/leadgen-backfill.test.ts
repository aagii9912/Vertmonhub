// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_ID, PROJECT, SHOP, graphLead, seededDb, type Row } from './lead-ads-db';

vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: (value: string | null | undefined) => value || null }));
vi.mock('@/lib/marketing/attribution-events', () => ({ logAttributionEvent: vi.fn(async () => undefined) }));

import { backfillPageLeads } from '../leadgen-backfill';
import { leadgenRequestId } from '../leadgen';

const NOW = Date.parse('2026-10-05T00:00:00Z');
const requests: URL[] = [];
let pages: Record<string, Array<Row | { status: number; body: Row }>> = {};
const page = (data: Row[], after?: string) => ({ data, ...(after ? { paging: { cursors: { after }, next: `https://graph.facebook.com/v26.0/next?access_token=leak&after=${after}` } } : {}) });
const shop = { id: SHOP, pageId: PAGE_ID, token: 'page-token' };

beforeEach(() => {
    requests.length = 0;
    vi.stubEnv('FACEBOOK_APP_SECRET', 'app-secret');
    pages = {
        [`${PAGE_ID}/leadgen_forms`]: [page([{ id: '8880001' }], 'f1'), page([{ id: '8880002' }, { id: 'bad' }])],
        '8880001/leads': [page([graphLead('9101'), graphLead('9102')], 'l1'), page([graphLead('9103', { campaign_id: undefined })])],
        '8880002/leads': [page([graphLead('9104')])],
    };
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
        const url = new URL(input);
        requests.push(url);
        const key = url.pathname.replace('/v26.0/', '');
        const reply = pages[key]?.shift() ?? page([]);
        if ('status' in reply && 'body' in reply) return new Response(JSON.stringify(reply.body), { status: reply.status as number });
        return new Response(JSON.stringify(reply), { status: 200 });
    }));
});

describe('Lead Ads 90-day backfill', () => {
    it('walks every form and page by cursor, filters by creation time and stores new leads once', async () => {
        const db = seededDb({ leads: [{ id: 'old', shop_id: SHOP, client_request_id: leadgenRequestId('9102') }] });
        const summary = await backfillPageLeads(db.client, shop, { deadline: Date.now() + 30_000, now: NOW });

        expect(summary).toMatchObject({ forms: 2, received: 4, ingested: 3, duplicate: 1, skipped: 0, failed: 0, complete: true });
        expect(db.tables.leads.map(l => l.client_request_id)).toEqual(['9102', '9101', '9103', '9104'].map(leadgenRequestId));
        expect(db.tables.leads.every(l => l.project_id === PROJECT || l.id === 'old')).toBe(true);
        expect(db.tables.meta_leadgen_events.map(e => [e.leadgen_id, e.origin, e.status])).toEqual([
            ['9101', 'backfill', 'saved'], ['9103', 'backfill', 'saved'], ['9104', 'backfill', 'saved'],
        ]);

        const leadReads = requests.filter(u => u.pathname.endsWith('/leads'));
        expect(leadReads[1].searchParams.get('after')).toBe('l1');
        expect(leadReads.every(u => u.searchParams.get('access_token') === null && u.searchParams.get('appsecret_proof'))).toBe(true);
        const since = Math.floor((NOW - 90 * 86_400_000) / 1000);
        expect(JSON.parse(leadReads[0].searchParams.get('filtering')!)).toEqual([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]);
        expect(requests.filter(u => u.pathname.endsWith('/leadgen_forms'))[1].searchParams.get('after')).toBe('f1');
    });

    it('is idempotent when run again', async () => {
        const db = seededDb();
        await backfillPageLeads(db.client, shop, { deadline: Date.now() + 30_000, now: NOW });
        pages['8880001/leads'] = [page([graphLead('9101'), graphLead('9102'), graphLead('9103')])];
        pages['8880002/leads'] = [page([graphLead('9104')])];
        pages[`${PAGE_ID}/leadgen_forms`] = [page([{ id: '8880001' }, { id: '8880002' }])];
        const again = await backfillPageLeads(db.client, shop, { deadline: Date.now() + 30_000, now: NOW });
        expect(again).toMatchObject({ received: 4, ingested: 0, duplicate: 4, complete: true });
        expect(db.tables.leads).toHaveLength(4);
    });

    it('clamps the window to Meta\'s 90-day retention', async () => {
        await backfillPageLeads(seededDb().client, shop, { days: 400, deadline: Date.now() + 30_000, now: NOW });
        const filter = JSON.parse(requests.find(u => u.pathname.endsWith('/leads'))!.searchParams.get('filtering')!);
        expect(filter[0].value).toBe(Math.floor((NOW - 90 * 86_400_000) / 1000));
    });

    it('stops with the Graph reason or the time budget and reports an incomplete run', async () => {
        pages[`${PAGE_ID}/leadgen_forms`] = [{ status: 403, body: { error: { code: 200, message: 'Requires pages_manage_ads' } } }];
        expect(await backfillPageLeads(seededDb().client, shop, { deadline: Date.now() + 30_000, now: NOW }))
            .toMatchObject({ complete: false, error: 'permission_missing', received: 0 });

        expect(await backfillPageLeads(seededDb().client, shop, { deadline: Date.now() - 1, now: NOW }))
            .toMatchObject({ complete: false, error: 'time_budget' });
    });
});
