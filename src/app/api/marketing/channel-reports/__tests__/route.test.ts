// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
// Хиймэл өдрийн Meta экспорт: 2026-09-12 – 09-24 (3 хурлын долоо хоног).
import { META_ADS_DAILY_CSV as META_DAILY } from '../../../../../../e2e/fixtures/meta-ads-daily';

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

    it('uses an explicit client mapping and reports the existing period and the same file saved under another source', async () => {
        mocks.resolve.mockImplementation((table, ops) => {
            if (table === 'marketing_channel_mappings') return { data: null, error: null };
            if (ops.some(([op, args]) => op === 'in' && args[0] === 'period_from')) return { data: [
                { id: 'same', period_from: '2026-09-23', period_to: '2026-09-29', file_name: 'old.csv', updated_at: '2026-10-01', origin: 'file', content_hash: 'f'.repeat(64) },
                { id: 'longer', period_from: '2026-09-23', period_to: '2026-10-22', file_name: 'month.csv', updated_at: '2026-10-01', origin: 'file', content_hash: null },
            ], error: null };
            if (ops.some(([op, args]) => op === 'eq' && args[0] === 'content_hash')) return { data: [{ id: 'other', source: 'callpro', period_from: '2026-09-23', period_to: '2026-09-29' }], error: null };
            return { data: [], error: null };
        });
        const body = await (await POST(upload({ mapping: JSON.stringify({ Reach: 'reach', Impressions: 'impressions', Unknown: 'spend' }) }))).json();
        expect(body.mappingOrigin).toBe('client');
        expect(body.mapping).toEqual({ 'Campaign name': '', 'Reporting starts': '', 'Reporting ends': '', Reach: 'reach', Impressions: 'impressions', 'Link clicks': '', 'Amount spent (USD)': '' });
        expect(body.existing).toEqual({ id: 'same', file_name: 'old.csv', updated_at: '2026-10-01', origin: 'file', sameFile: false, data_from: null, data_to: null });
        expect(body.duplicate).toMatchObject({ source: 'callpro', period_from: '2026-09-23' });
        const hash = mocks.calls.find(c => c.ops.some(([op, args]) => op === 'eq' && args[0] === 'content_hash'))!;
        expect(has(hash, 'eq', 'shop_id', SHOP)).toBe(true);
        expect(body.split).toBeNull();
    });

    it('warns when a date-less file was saved for another period, but not when a dated file is reused for another week', async () => {
        const saved = (source: string, from: string, to: string) => ({ id: `${source}:${from}`, source, period_from: from, period_to: to });
        mocks.resolve.mockImplementation((table, ops) => {
            if (table === 'marketing_channel_mappings') return { data: null, error: null };
            if (ops.some(([op, args]) => op === 'eq' && args[0] === 'content_hash')) return { data: [saved('callpro', '2026-09-16', '2026-09-22'), saved('meta_ads', '2026-09-16', '2026-09-22')], error: null };
            return { data: [], error: null };
        });
        // CallPro-ийн бүлгийн тайланд огноо байхгүй: өнгөрсөн долоо хоногийн файлыг андуурч дахин оруулсан байж болно.
        const group = 'Бүлэг,Бүлгийг сонгосон,Хариулсан\nБорлуулалт,40,30';
        const callpro = await (await POST(upload({ source: 'callpro' }, { contents: group, name: 'group.csv' }))).json();
        expect(callpro.duplicate).toMatchObject({ source: 'callpro', period_from: '2026-09-16' });
        // Огноотой Meta файлыг өөр долоо хоногт ашиглах нь хэвийн (мөрүүд хугацаагаар шүүгдэнэ).
        const meta = await (await POST(upload())).json();
        expect(meta.duplicate).toBeNull();
    });

    it('offers a meeting-week split for a daily Meta export with per-week totals, coverage and saved state', async () => {
        mocks.resolve.mockImplementation((table, ops) => {
            if (table === 'marketing_channel_mappings') return { data: null, error: null };
            if (ops.some(([op, args]) => op === 'in' && args[0] === 'period_from')) return { data: [
                { id: 'api-week', period_from: '2026-09-16', period_to: '2026-09-22', file_name: null, updated_at: '2026-10-01', origin: 'api', content_hash: null },
            ], error: null };
            return { data: [], error: null };
        });
        const response = await POST(upload({}, { contents: META_DAILY, name: 'Meta-Campaigns-daily.csv' }));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.result).toMatchObject({ rowCount: 5, zeroRows: 13, dataPeriod: { from: '2026-09-23', to: '2026-09-24' }, dailyRows: true });
        expect(body.split.period).toEqual({ from: '2026-09-12', to: '2026-09-24' });
        expect(body.split.result.totals).toMatchObject({ spend: 183.9, results_calls: 28 });
        expect(body.split.weeks.map((w: { from: string; dataPeriod: unknown; totals: Record<string, number>; existing: { origin: string } | null }) => [w.from, w.dataPeriod, w.totals.spend, w.totals.results_calls, w.existing?.origin ?? null])).toEqual([
            ['2026-09-09', { from: '2026-09-12', to: '2026-09-15' }, 34.8, 6, null],
            ['2026-09-16', { from: '2026-09-16', to: '2026-09-22' }, 120.1, 18, 'api'],
            ['2026-09-23', { from: '2026-09-23', to: '2026-09-24' }, 29, 4, null],
        ]);
        const lookup = mocks.calls.find(c => c.ops.some(([op, args]) => op === 'in' && args[0] === 'period_from'))!;
        expect(has(lookup, 'eq', 'shop_id', SHOP) && has(lookup, 'eq', 'source', 'meta_ads')).toBe(true);
        expect(writes()).toEqual([]);
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
            origin: 'file', data_from: '2026-09-23', data_to: '2026-09-29',
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

    it('saves a daily Meta export as one report per meeting week with the covered days', async () => {
        // Хадгалсан тайлангүй үед бүх долоо хоног хадгалагдана.
        mocks.resolve.mockImplementation((table, ops) => {
            if (ops.some(([op]) => op === 'upsert')) return { data: table === 'marketing_channel_reports' ? [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }] : null, error: null };
            if (ops.some(([op]) => op === 'maybeSingle')) return { data: null, error: null };
            return { data: [], error: null };
        });
        const response = await POST(upload({ mode: 'save', split: '1' }, { contents: META_DAILY, name: 'Meta-Campaigns-daily.csv' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ mode: 'save', reports: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }], skipped: [], mappingSaved: true });
        const [report] = writes();
        const [rows, options] = report.ops.find(([op]) => op === 'upsert')![1] as [Array<Record<string, unknown> & { totals: Record<string, number>; breakdown: Array<{ label: string }> }>, unknown];
        expect(options).toEqual({ onConflict: 'shop_id,source,period_from,period_to' });
        expect(report.ops.some(([op]) => op === 'single')).toBe(false);
        expect(rows.map(r => [r.period_from, r.period_to, r.data_from, r.data_to, r.origin, r.totals.spend, r.totals.results_calls, r.row_count])).toEqual([
            ['2026-09-09', '2026-09-15', '2026-09-12', '2026-09-15', 'file', 34.8, 6, 8],
            ['2026-09-16', '2026-09-22', '2026-09-16', '2026-09-22', 'file', 120.1, 18, 23],
            ['2026-09-23', '2026-09-29', '2026-09-23', '2026-09-24', 'file', 29, 4, 5],
        ]);
        expect(rows.every(r => r.shop_id === SHOP && r.source === 'meta_ads' && r.file_name === 'Meta-Campaigns-daily.csv' && /^[0-9a-f]{64}$/.test(String(r.content_hash)))).toBe(true);
        expect(rows[2].breakdown.map(b => b.label)).toEqual(['Дуудлагын кампанит ажил', 'Постын урамшуулал', 'Давхар нэр']);
        expect((rows[0].warnings as Array<{ code: string }>).map(w => w.code)).toContain('partial_coverage');
        // Файлд байгаа боловч тухайн долоо хоногт хүргэлтгүй төрөл 0.
        expect(rows[0].totals).toMatchObject({ results_thruplay: 0, spend_thruplay: 0 });
        expect((rows[1].warnings as Array<{ code: string }>).map(w => w.code)).not.toContain('partial_coverage');
        // Хуваах үед сонгосон хугацаа (файлын гадна байсан ч) хадгалалтыг хаахгүй.
        const elsewhere = await POST(upload({ mode: 'save', split: '1', period_from: '2026-08-01', period_to: '2026-08-07' }, { contents: META_DAILY, name: 'Meta-Campaigns-daily.csv' }));
        expect(elsewhere.status).toBe(200);
        expect(await POST(upload({ mode: 'save', period_from: '2026-08-01', period_to: '2026-08-07' }, { contents: META_DAILY, name: 'Meta-Campaigns-daily.csv' })).then(r => r.status)).toBe(400);
    });

    const savedRow = (from: string, to: string, origin: 'file' | 'api', data: [string, string] | null = [from, to]) =>
        ({ id: `${origin}:${from}`, period_from: from, period_to: to, file_name: origin === 'api' ? null : 'old.csv', updated_at: '2026-10-01', origin, content_hash: null, data_from: data?.[0] ?? null, data_to: data?.[1] ?? null });
    const withExisting = (existing: ReturnType<typeof savedRow>[], upsertError: unknown = null) => mocks.resolve.mockImplementation((table, ops) => {
        if (ops.some(([op]) => op === 'upsert')) {
            if (table !== 'marketing_channel_reports') return { data: null, error: null };
            return upsertError ? { data: null, error: upsertError } : { data: (ops.find(([op]) => op === 'upsert')![1][0] as Array<{ period_from: string }>).map(r => ({ id: r.period_from })), error: null };
        }
        if (ops.some(([op, args]) => op === 'in' && args[0] === 'period_from')) return { data: existing, error: null };
        if (ops.some(([op]) => op === 'maybeSingle')) return { data: null, error: null };
        return { data: [], error: null };
    });
    const upserted = () => (writes().find(c => c.table === 'marketing_channel_reports')?.ops.find(([op]) => op === 'upsert')?.[1][0] ?? []) as Array<{ period_from: string; data_from: string }>;

    it('refuses to overwrite a report synced from the Meta API and leaves such weeks out of a split', async () => {
        withExisting([savedRow('2026-09-23', '2026-09-29', 'api')]);
        const single = await POST(upload({ mode: 'save' }));
        expect(single.status).toBe(409);
        expect((await single.json()).error).toMatch(/2026-09-23 – 2026-09-29 хугацааны Meta Ads Manager тайланг Meta API-аас автоматаар татсан/);
        expect(writes()).toEqual([]);
        // Хуваахад API-ийн долоо хоногийг алгасаад бусдыг нь хадгална.
        const split = await POST(upload({ mode: 'save', split: '1' }, { contents: META_DAILY, name: 'daily.csv' }));
        expect(split.status).toBe(200);
        expect((await split.json()).skipped).toEqual([{ from: '2026-09-23', to: '2026-09-29', reason: 'api' }]);
        expect(upserted().map(r => r.period_from)).toEqual(['2026-09-09', '2026-09-16']);
        // API-ийн долоо хоногийг тусгайлан сонговол 409.
        mocks.calls.length = 0;
        const chosen = await POST(upload({ mode: 'save', split: '1', weeks: '2026-09-16,2026-09-23' }, { contents: META_DAILY, name: 'daily.csv' }));
        expect(chosen.status).toBe(409);
        expect((await chosen.json()).locked).toEqual([{ from: '2026-09-23', to: '2026-09-29' }]);
        expect(writes()).toEqual([]);
    });

    it('answers 409 when the database trigger refuses an API week synced after the check', async () => {
        withExisting([], { code: '23514', message: 'channel_report_api_locked: meta_ads 2026-09-23 – 2026-09-29 тайланг Meta API-аас татсан тул файлаар дарж бичихгүй' });
        const response = await POST(upload({ mode: 'save', split: '1' }, { contents: META_DAILY, name: 'daily.csv' }));
        expect(response.status).toBe(409);
        expect((await response.json()).error).toMatch(/Meta API-аас шинэчилсэн тул юу ч хадгалсангүй/);
        // Холболтыг ч сануулаагүй (хадгалалт амжилтгүй).
        expect(writes().map(c => c.table)).toEqual(['marketing_channel_reports']);
    });

    it('keeps a fuller saved week instead of replacing it with a partial week of a rolling export', async () => {
        // 09-09 долоо хоногийг өмнө нь 7/7-оор хадгалсан; шинэ файл 09-12-ноос (4/7). 09-23-ыг ижил хамралттай, 09-16-г хамралт тодорхойгүй хадгалсан.
        withExisting([savedRow('2026-09-09', '2026-09-15', 'file'), savedRow('2026-09-16', '2026-09-22', 'file', null), savedRow('2026-09-23', '2026-09-29', 'file', ['2026-09-23', '2026-09-24'])]);
        const preview = await (await POST(upload({}, { contents: META_DAILY, name: 'daily.csv' }))).json();
        expect(preview.split.weeks.map((w: { from: string; skip: string | null; existing: { data_from: string | null } }) => [w.from, w.skip, w.existing.data_from]))
            .toEqual([['2026-09-09', 'fuller', '2026-09-09'], ['2026-09-16', null, null], ['2026-09-23', null, '2026-09-23']]);
        const response = await POST(upload({ mode: 'save', split: '1' }, { contents: META_DAILY, name: 'daily.csv' }));
        expect(response.status).toBe(200);
        expect((await response.json()).skipped).toEqual([{ from: '2026-09-09', to: '2026-09-15', reason: 'fuller' }]);
        expect(upserted().map(r => r.period_from)).toEqual(['2026-09-16', '2026-09-23']);
        // Хэрэглэгч долоо хоногийг тусгайлан сонговол солино; сонгоогүйг алгасна.
        mocks.calls.length = 0;
        const replace = await POST(upload({ mode: 'save', split: '1', weeks: '2026-09-09' }, { contents: META_DAILY, name: 'daily.csv' }));
        expect(await replace.json()).toMatchObject({ skipped: [{ from: '2026-09-16', reason: 'unselected' }, { from: '2026-09-23', reason: 'unselected' }] });
        expect(upserted().map(r => [r.period_from, r.data_from])).toEqual([['2026-09-09', '2026-09-12']]);
        // Бүх долоо хоног алгасагдвал юу ч бичихгүй.
        mocks.calls.length = 0;
        withExisting([savedRow('2026-09-09', '2026-09-15', 'api'), savedRow('2026-09-16', '2026-09-22', 'api'), savedRow('2026-09-23', '2026-09-29', 'file', ['2026-09-23', '2026-09-29'])]);
        const nothing = await POST(upload({ mode: 'save', split: '1' }, { contents: META_DAILY, name: 'daily.csv' }));
        expect(nothing.status).toBe(409);
        expect((await nothing.json()).skipped.map((w: { reason: string }) => w.reason)).toEqual(['api', 'api', 'fuller']);
        expect(writes()).toEqual([]);
    });

    it('validates the chosen weeks', async () => {
        for (const [fields, message] of [
            [{ split: '1', weeks: '2026-09-02' }, /файлд алга/],
            [{ weeks: '2026-09-16' }, /зөвхөн хурлын долоо хоногоор хуваах/],
            [{ split: '1', weeks: '2026-09-16;2026-09-23' }, /буруу/],
            [{ split: '1', weeks: Array.from({ length: 15 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`).join(',') }, /буруу/],
        ] as Array<[Record<string, string>, RegExp]>) {
            const response = await POST(upload({ mode: 'save', ...fields }, { contents: META_DAILY, name: 'daily.csv' }));
            expect(response.status).toBe(400);
            expect((await response.json()).error).toMatch(message);
        }
        expect(writes()).toEqual([]);
    });

    it('refuses to split a file that is not a multi-week daily export', async () => {
        const response = await POST(upload({ mode: 'save', split: '1' }));
        expect(response.status).toBe(400);
        expect((await response.json()).error).toMatch(/долоо хоногоор хуваах боломжгүй/);
        expect((await POST(upload({ split: 'yes' }))).status).toBe(400);
        expect(writes()).toEqual([]);
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
    const summary = (id: string, from: string, to: string, totals: Record<string, number | string>) => ({ id, source: 'callpro', period_from: from, period_to: to, file_name: 'x.xlsx', origin: 'file', data_from: null, data_to: null, totals, warnings: [], row_count: 1, note: null, imported_by: null, created_at: '2026-10-01', updated_at: '2026-10-01' });

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
        expect(body.latest.meta_ads).toEqual({ report: null, exact: false, longer: false, previous: null, comparison: null });
        for (const call of mocks.calls) expect(has(call, 'eq', 'shop_id', SHOP)).toBe(true);
    });

    it('keeps listing reports before the origin/coverage migration is applied', async () => {
        const legacy = { id: 'r1', source: 'meta_ads', period_from: '2026-09-23', period_to: '2026-09-29', file_name: 'x.csv', totals: { spend: 5 }, warnings: [], row_count: 1, note: null, imported_by: null, created_at: '2026-10-01', updated_at: '2026-10-01' };
        mocks.resolve.mockImplementation((_table, ops) => {
            const columns = String(ops.find(([op]) => op === 'select')?.[1][0] ?? '');
            if (columns.includes('origin')) return { data: null, error: { code: '42703', message: 'column marketing_channel_reports.origin does not exist' } };
            if (ops.some(([op, args]) => op === 'in' && args[0] === 'id')) return { data: [{ id: 'r1', breakdown: [], mapping: {} }], error: null };
            return { data: [legacy], error: null };
        });
        const response = await GET(new Request(`${URL_BASE}?from=2026-09-23&to=2026-09-29&source=meta_ads`));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.reports).toEqual([{ ...legacy, origin: 'file', data_from: null, data_to: null }]);
        expect(body.latest.meta_ads).toMatchObject({ exact: true, report: { id: 'r1', origin: 'file', data_from: null } });
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
