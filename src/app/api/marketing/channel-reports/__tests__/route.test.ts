// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type Op = [string, unknown[]];
type Call = { table: string; ops: Op[] };
const mocks = vi.hoisted(() => ({
    read: vi.fn(), write: vi.fn(), remove: vi.fn(), shop: vi.fn(), user: vi.fn(),
    calls: [] as Call[],
    resolve: vi.fn<(table: string, ops: Op[]) => { data: unknown; error: unknown }>(),
}));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: mocks.read, requireModuleWrite: mocks.write, requireModuleDelete: mocks.remove, requireAnyModule: mocks.read,
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop, getUserId: mocks.user }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from(table: string) {
            const call: Call = { table, ops: [] };
            mocks.calls.push(call);
            const builder: Record<string, unknown> = new Proxy({}, {
                get(_target, prop: string) {
                    if (prop === 'then') return (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve(mocks.resolve(table, call.ops)).then(ok, fail);
                    return (...args: unknown[]) => { call.ops.push([prop, args]); return builder; };
                },
            });
            return builder;
        },
    }),
}));

import { DELETE, GET, POST } from '../route';

const SHOP = 'allowed-shop';
const URL_BASE = 'http://localhost/api/marketing/channel-reports';
const META_CSV = [
    'Campaign name,Reporting starts,Reporting ends,Reach,Impressions,Link clicks,Amount spent (USD)',
    'Mandala lead,2026-09-23,2026-09-29,1000,3000,120,50.25',
    'Elysium,2026-09-23,2026-09-29,800,1600,30,20',
].join('\n');
const has = (call: Call, op: string, ...args: unknown[]) => call.ops.some(([name, values]) => name === op && args.every((arg, i) => JSON.stringify(values[i]) === JSON.stringify(arg)));
const writes = () => mocks.calls.filter(c => c.ops.some(([op]) => op === 'upsert' || op === 'delete'));

function upload(fields: Record<string, string> = {}, { contents = META_CSV as string | Uint8Array, name = 'meta.csv' } = {}) {
    const form = new FormData();
    form.set('file', new File([contents as BlobPart], name));
    form.set('shopId', 'foreign-shop');
    const values = { source: 'meta_ads', mode: 'preview', period_from: '2026-09-23', period_to: '2026-09-29', ...fields };
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    return new NextRequest(`${URL_BASE}?shopId=foreign-shop`, { method: 'POST', body: form });
}
const denied = () => NextResponse.json({ error: 'Хандах эрх алга' }, { status: 403 });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue(null); mocks.remove.mockResolvedValue(null);
    mocks.shop.mockResolvedValue({ id: SHOP }); mocks.user.mockResolvedValue('user-1');
    mocks.resolve.mockImplementation((_table, ops) => {
        if (ops.some(([op]) => op === 'upsert')) return { data: { id: 'report-1' }, error: null };
        if (ops.some(([op]) => op === 'maybeSingle')) return { data: null, error: null };
        return { data: [], error: null };
    });
});

describe('access', () => {
    it('checks read, write and delete permission for marketing-roi before touching the database', async () => {
        mocks.read.mockResolvedValue(denied()); mocks.write.mockResolvedValue(denied()); mocks.remove.mockResolvedValue(denied());
        expect((await GET(new Request(URL_BASE))).status).toBe(403);
        expect((await POST(upload())).status).toBe(403);
        expect((await DELETE(new Request(`${URL_BASE}?id=00000000-0000-4000-8000-000000000001`))).status).toBe(403);
        expect(mocks.read).toHaveBeenCalledWith('marketing-roi');
        expect(mocks.write).toHaveBeenCalledWith('marketing-roi');
        expect(mocks.remove).toHaveBeenCalledWith('marketing-roi');
        expect(mocks.calls).toEqual([]);
    });

    it('rejects users without an accessible shop', async () => {
        mocks.shop.mockResolvedValue(null);
        expect((await POST(upload())).status).toBe(403);
        expect(mocks.calls).toEqual([]);
    });
});

describe('POST preview', () => {
    it('parses the file server-side, suggests a mapping and previews totals without writing', async () => {
        const response = await POST(upload());
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        const body = await response.json();
        expect(body).toMatchObject({
            mode: 'preview', storageReady: true, headers: ['Campaign name', 'Reporting starts', 'Reporting ends', 'Reach', 'Impressions', 'Link clicks', 'Amount spent (USD)'],
            mappingOrigin: 'suggested', existing: null, duplicate: null,
            result: { totals: { impressions: 4600, link_clicks: 150, spend: 70.25, currency: 'USD' }, missing: expect.arrayContaining(['reach']) },
        });
        expect(body.mapping['Amount spent (USD)']).toBe('spend');
        expect(body.sample.Reach).toEqual(['1000', '800']);
        expect(writes()).toEqual([]);
        for (const call of mocks.calls) expect(has(call, 'eq', 'shop_id', SHOP) || has(call, 'match', { shop_id: SHOP, source: 'meta_ads', period_from: '2026-09-23', period_to: '2026-09-29' })).toBe(true);
    });

    it('applies the remembered mapping for this shop and source', async () => {
        mocks.resolve.mockImplementation((table, ops) => {
            if (table === 'marketing_channel_mappings') return { data: { mapping: { Reach: '', 'Link clicks': 'post_engagements' } }, error: null };
            return ops.some(([op]) => op === 'maybeSingle') ? { data: null, error: null } : { data: [], error: null };
        });
        const body = await (await POST(upload())).json();
        expect(body.mappingOrigin).toBe('mixed');
        expect(body.mapping).toMatchObject({ Reach: '', 'Link clicks': 'post_engagements', Impressions: 'impressions' });
        expect(body.result.totals.post_engagements).toBe(150);
        const memory = mocks.calls.find(c => c.table === 'marketing_channel_mappings')!;
        expect(has(memory, 'eq', 'shop_id', SHOP) && has(memory, 'eq', 'source', 'meta_ads')).toBe(true);
    });

    it('uses an explicit client mapping and reports existing period and duplicate file', async () => {
        mocks.resolve.mockImplementation((table, ops) => {
            if (table === 'marketing_channel_mappings') return { data: null, error: null };
            if (ops.some(([op]) => op === 'match')) return { data: { id: 'same', file_name: 'old.csv', updated_at: '2026-10-01' }, error: null };
            if (ops.some(([op, args]) => op === 'eq' && args[0] === 'content_hash')) return { data: [{ id: 'other', source: 'meta_ads', period_from: '2026-09-16', period_to: '2026-09-22' }], error: null };
            return { data: [], error: null };
        });
        const body = await (await POST(upload({ mapping: JSON.stringify({ Reach: 'reach', Impressions: 'impressions', Unknown: 'spend' }) }))).json();
        expect(body.mappingOrigin).toBe('client');
        expect(body.mapping).toEqual({ 'Campaign name': '', 'Reporting starts': '', 'Reporting ends': '', Reach: 'reach', Impressions: 'impressions', 'Link clicks': '', 'Amount spent (USD)': '' });
        expect(body.existing).toMatchObject({ id: 'same' });
        expect(body.duplicate).toMatchObject({ period_from: '2026-09-16' });
    });

    it.each([
        [{}, { name: 'old.xls' }, /\.xls/],
        [{}, { name: 'report.xlsx', contents: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) }, /\.xls/],
        [{}, { name: 'report.pdf' }, /xlsx, \.csv/],
        [{ period_from: '2026-09-29', period_to: '2026-09-23' }, {}, /Хугацаа буруу/],
        [{ period_from: '2026-06-01', period_to: '2026-09-02' }, {}, /93 хүртэл/],
        [{ period_from: '2099-01-01', period_to: '2099-01-07' }, {}, /Ирээдүйн/],
        [{ source: 'tiktok' }, {}, /Эх үүсвэр/],
        [{ mode: 'commit' }, {}, /үйлдэл/],
        [{ mapping: '{bad json' }, {}, /холболт буруу/],
        [{ mapping: JSON.stringify({ Reach: 5 }) }, {}, /холболт буруу/],
    ])('rejects invalid input %#', async (fields, file, message) => {
        const response = await POST(upload(fields as Record<string, string>, file as { name?: string; contents?: string | Uint8Array }));
        expect(response.status).toBe(400);
        expect((await response.json()).error).toMatch(message);
        expect(writes()).toEqual([]);
    });

    it('still previews when the migration is missing, but refuses to save', async () => {
        const missing = { code: 'PGRST205', message: "Could not find the table 'public.marketing_channel_mappings' in the schema cache" };
        mocks.resolve.mockImplementation(() => ({ data: null, error: missing }));
        const preview = await POST(upload());
        expect(preview.status).toBe(200);
        expect((await preview.json()).storageReady).toBe(false);
        const save = await POST(upload({ mode: 'save' }));
        expect(save.status).toBe(503);
        expect(writes()).toEqual([]);
    });
});

describe('POST save', () => {
    it('upserts one report per shop, source and period from the session shop and remembers the mapping', async () => {
        const response = await POST(upload({ mode: 'save', note: ' Хурлын тайлан ' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ mode: 'save', report: { id: 'report-1' }, mappingSaved: true });
        const [report, memory] = writes();
        expect(report.table).toBe('marketing_channel_reports');
        const [row, options] = report.ops.find(([op]) => op === 'upsert')![1] as [Record<string, unknown>, Record<string, unknown>];
        expect(options).toEqual({ onConflict: 'shop_id,source,period_from,period_to' });
        expect(row).toMatchObject({
            shop_id: SHOP, source: 'meta_ads', period_from: '2026-09-23', period_to: '2026-09-29', file_name: 'meta.csv',
            totals: { impressions: 4600, link_clicks: 150, spend: 70.25, currency: 'USD', cpm: 15.27, cost_per_link_click: 0.47, ctr_link: 3.26 },
            row_count: 2, note: 'Хурлын тайлан', imported_by: 'user-1',
        });
        expect(row.content_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(row.breakdown).toHaveLength(2);
        expect(row.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'non_additive', field: 'reach' })]));
        expect(memory.table).toBe('marketing_channel_mappings');
        const [saved, memoryOptions] = memory.ops.find(([op]) => op === 'upsert')![1] as [Record<string, unknown>, Record<string, unknown>];
        expect(saved).toMatchObject({ shop_id: SHOP, source: 'meta_ads', mapping: { 'Amount spent (USD)': 'spend', Reach: 'reach' } });
        expect(saved.header_signature).toMatch(/^7:[0-9a-f]{8}$/);
        expect(memoryOptions).toEqual({ onConflict: 'shop_id,source' });
    });

    it('does not save while the mapping has blocking errors', async () => {
        const duplicate = await POST(upload({ mode: 'save', mapping: JSON.stringify({ Reach: 'impressions', Impressions: 'impressions' }) }));
        expect(duplicate.status).toBe(400);
        expect((await duplicate.json()).errors[0]).toMatch(/2 багана сонгосон/);
        const empty = await POST(upload({ mode: 'save', mapping: JSON.stringify({ 'Campaign name': 'campaign' }) }));
        expect(empty.status).toBe(400);
        const outside = await POST(upload({ mode: 'save', period_from: '2026-08-01', period_to: '2026-08-07' }));
        expect((await outside.json()).error).toMatch(/хамаарах өгөгдөлтэй мөр алга/);
        expect(writes()).toEqual([]);
    });

    it('keeps the saved report when remembering the mapping fails', async () => {
        mocks.resolve.mockImplementation((table, ops) => {
            if (table === 'marketing_channel_mappings' && ops.some(([op]) => op === 'upsert')) return { data: null, error: { message: 'boom' } };
            if (ops.some(([op]) => op === 'upsert')) return { data: { id: 'report-1' }, error: null };
            return ops.some(([op]) => op === 'maybeSingle') ? { data: null, error: null } : { data: [], error: null };
        });
        const body = await (await POST(upload({ mode: 'save' }))).json();
        expect(body).toMatchObject({ report: { id: 'report-1' }, mappingSaved: false });
    });

    it('aggregates a CallPro call list with a UB missed-call histogram', async () => {
        const csv = 'Огноо,Дугаар,Төлөв\n2026-09-23 09:05,99112233,Хариулсан\n2026-09-23 09:30,88112233,Алдсан\n2026-09-24 14:00,88112233,Тасалсан';
        await POST(upload({ mode: 'save', source: 'callpro' }, { contents: csv, name: 'callpro.csv' }));
        const [row] = (writes()[0].ops.find(([op]) => op === 'upsert')![1]) as [{ totals: Record<string, number>; breakdown: Array<{ kind: string; label: string; values: Record<string, number> }> }];
        expect(row.totals).toMatchObject({ calls_total: 3, answered: 1, missed: 1, abandoned: 1, unique_callers: 2, unique_missed_callers: 1 });
        expect(row.breakdown.find(r => r.label === '09:00')!.values).toEqual({ calls_total: 2, answered: 1, missed: 1, abandoned: 0 });
        expect(JSON.stringify(row)).not.toContain('88112233');
    });
});

describe('GET and DELETE', () => {
    const summary = (id: string, from: string, to: string, totals: Record<string, number | string>) => ({ id, source: 'callpro', period_from: from, period_to: to, file_name: 'x.xlsx', totals, warnings: [], row_count: 1, note: null, imported_by: null, created_at: '2026-10-01', updated_at: '2026-10-01' });

    it('lists the shop reports and compares the best match with the previous week', async () => {
        const current = summary('r2', '2026-09-23', '2026-09-29', { answered: 120, missed: 10 });
        const previous = summary('r1', '2026-09-16', '2026-09-22', { answered: 100, missed: 20 });
        mocks.resolve.mockImplementation((_table, ops) => {
            if (ops.some(([op, args]) => op === 'in' && args[0] === 'id')) return { data: [{ id: 'r2', breakdown: [{ kind: 'group', label: 'Борлуулалт', values: { answered: 120 } }], mapping: { 'Хариулсан': 'answered' } }], error: null };
            if (ops.some(([op]) => op === 'limit')) return { data: [current], error: null };
            return { data: [current, previous], error: null };
        });
        const response = await GET(new Request(`${URL_BASE}?from=2026-09-23&to=2026-09-29&source=callpro`));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.reports).toEqual([current]);
        expect(body.latest.callpro).toMatchObject({ exact: true, report: { id: 'r2', breakdown: [{ label: 'Борлуулалт' }] }, previous: { id: 'r1' } });
        expect(body.latest.callpro.comparison.answered).toEqual({ current: 120, previous: 100, delta: 20, pct: 20, comparable: true });
        expect(body.latest.callpro.comparison.missed.pct).toBe(-50);
        expect(body.latest.meta_ads).toEqual({ report: null, exact: false, previous: null, comparison: null });
        for (const call of mocks.calls) expect(has(call, 'eq', 'shop_id', SHOP)).toBe(true);
    });

    it('validates the list filter and reports a missing migration', async () => {
        expect((await GET(new Request(`${URL_BASE}?from=2026-09-23`))).status).toBe(400);
        expect((await GET(new Request(`${URL_BASE}?from=2026-09-29&to=2026-09-23`))).status).toBe(400);
        expect((await GET(new Request(`${URL_BASE}?source=tiktok`))).status).toBe(400);
        mocks.resolve.mockImplementation(() => ({ data: null, error: { code: '42P01', message: 'relation "public.marketing_channel_reports" does not exist' } }));
        expect((await GET(new Request(URL_BASE))).status).toBe(503);
    });

    it('deletes only a report of the active shop', async () => {
        expect((await DELETE(new Request(`${URL_BASE}?id=not-a-uuid`))).status).toBe(400);
        const id = '00000000-0000-4000-8000-000000000001';
        mocks.resolve.mockReturnValue({ data: null, error: null });
        expect((await DELETE(new Request(`${URL_BASE}?id=${id}`))).status).toBe(404);
        mocks.resolve.mockReturnValue({ data: { id }, error: null });
        expect((await DELETE(new Request(`${URL_BASE}?id=${id}`))).status).toBe(200);
        const call = mocks.calls.at(-1)!;
        expect(call.table).toBe('marketing_channel_reports');
        expect(has(call, 'eq', 'id', id) && has(call, 'eq', 'shop_id', SHOP) && has(call, 'delete')).toBe(true);
    });
});
