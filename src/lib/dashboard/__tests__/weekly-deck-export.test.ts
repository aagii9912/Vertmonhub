import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { exportWeeklyDeck } from '../weekly-deck-export';
import { buildBudgetOverview, type BudgetSpendMonth } from '@/lib/marketing/budget';
import { buildMarketingPerformance } from '@/lib/marketing/performance';
import type { MarketingConnections } from '@/lib/marketing/connections';

/** Хөтчийн маркетингийн экспорт (jsdom): эх сурвалж бүтэлгүйтвэл хэсэг чимээгүй алга болохгүй, `failedSources`-д тоологдоно. */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const readBlob = (blob: Blob) => new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
});
async function slideTexts(blob: Blob) {
    const zip = await JSZip.loadAsync(await readBlob(blob));
    const names = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const xml = await Promise.all(names.map(name => zip.file(name)!.async('string')));
    const notes = await Promise.all(Object.keys(zip.files).filter(name => /notesSlide\d+\.xml$/.test(name)).map(name => zip.file(name)!.async('string')));
    return { text: xml.map(part => [...part.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(match => match[1]).join(' ')), notes: notes.join(' ') };
}

const meetingDate = '2026-10-28';
const range = { from: '2026-10-21', to: '2026-10-27' };
const previousRange = { from: '2026-10-14', to: '2026-10-20' };
/** Энэ долоо хоногт зөвхөн ханшгүй Meta зардал (USD) — ₮-ийн дүнд орохгүй. */
const marketing = () => buildMarketingPerformance({
    projects: [], targets: [], contracts: [], activities: [], leads: [],
    spend: [{ id: 'meta:1', spent_at: '2026-10-22', amount: 0, channel: 'meta_ads', source: 'meta', exclusion: 'missing_fx', native_amount: 1234.56, currency: 'USD', project_id: null, marketing_owner_name: null, marketing_campaign_id: null, note: null }],
}, range);
const spendStatus: BudgetSpendMonth[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, recorded: i < 9, pending: (i === 9 ? { USD: 1234.56 } : {}) as Record<string, number> }));
const connections: MarketingConnections = {
    page: { connected: true, name: 'Elysium Residence', sync: { lastAttemptAt: '2026-10-27T04:00:00Z', lastSuccessAt: '2026-10-27T04:00:00Z', from: '2026-09-27', to: '2026-10-26', error: null } },
    instagram: { connected: true, username: 'elysiumbymoncon', sync: null },
    ads: { accountId: 'act_1129994262383674', tokenSource: 'user', tokenDaysLeft: 9, tokenExpired: false, insights: null, spend: null, currency: 'USD', mntPerUnit: null },
};

describe('exportWeeklyDeck — marketing', () => {
    let blobs: Blob[];
    beforeEach(() => {
        blobs = [];
        vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return `blob:deck-${blobs.length}`; }), revokeObjectURL: vi.fn() }));
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    it('replaces a failed source with a short «could not load» slide, counts it and keeps the rest honest', async () => {
        const requested: string[] = [];
        vi.mocked(fetch).mockImplementation(async input => {
            const url = String(input);
            requested.push(url);
            if (url.startsWith('/api/marketing/budget')) return json({ year: 2026, available: true, overview: buildBudgetOverview(Array(12).fill(10_000_000), Array.from({ length: 12 }, (_, i) => i < 9 ? 8_000_000 : 0), Array(12).fill(0)), spendStatus });
            if (url.startsWith('/api/marketing/channel-reports')) return json({ error: 'Сувгийн тайлан уншиж чадсангүй.' }, 500);
            if (url.startsWith('/api/dashboard/marketing/social-week')) return json({ week: { page: null, range, previousRange, syncedTo: null, rangeDays: 7, metrics: [], posts: [] } });
            if (url.startsWith('/api/dashboard/marketing/connections')) return json({ connections });
            return json({ error: `unexpected ${url}` }, 500);
        });
        const result = await exportWeeklyDeck({
            kind: 'marketing', projectName: 'Elysium Residence', meetingDate, range, previousRange, discussion: [], notices: [],
            marketing: marketing(), slides: [], canReports: false, canMarketing: true,
        });
        expect(result).toEqual({ fileName: 'Elysium Residence - Маркетинг - Лхагва 2026-10-28.pptx', failedImages: 0, failedSources: 1 });
        expect(requested).toEqual(expect.arrayContaining(['/api/marketing/budget?year=2026', '/api/marketing/channel-reports?from=2026-10-21&to=2026-10-27',
            '/api/dashboard/marketing/social-week?meetingDate=2026-10-28', '/api/dashboard/marketing/connections']));
        const { text, notes } = await slideTexts(blobs[0]);
        const index = (needle: string) => text.findIndex(slide => slide.includes(needle));
        // Холболтын төлөв нүүрний дараа.
        expect(index('Холболтын төлөв')).toBe(1);
        expect(text[1]).toMatch(/Meta токен Хэрэглэгчийн \(OAuth\) 9 хоногийн дараа дуусна/);
        expect(text[1]).toMatch(/Төгрөгийн ханш Оруулаагүй/);
        // Бүтэлгүйтсэн сувгийн тайлан → хэсгийн оронд богино слайд; шалтгаан тэмдэглэлд.
        expect(text[index('Сувгийн экспорт, Meta зар')]).toContain('Сувгийн экспорт, Meta зарын мэдээллийг ачаалж чадсангүй.');
        expect(notes).toContain('Сувгийн экспорт, Meta зар: Сувгийн тайлан уншиж чадсангүй.');
        expect(notes).not.toContain('чадсангүй..');
        expect(index('META ЗАР')).toBe(-1);
        // Төсөв: 10-р сард зөвхөн ханшгүй зардал → «—», ₮ биш; он эхнээс = 9 сарын ₮ + ханшгүй (доод хязгаар).
        const budget = text[index('Төсөв ба зарцуулалт')];
        expect(budget).toMatch(/10-р сард зарцуулсан — Ханшгүй 1,234\.56 USD \(₮-д ороогүй\)/);
        expect(budget).toMatch(/Он эхнээс зарцуулсан 72 сая ₮ \+ ханшгүй 1,234\.56 USD · 72%\+ \(энэ хүртэлх сарын төсвөөс\)/);
        expect(budget).toMatch(/Энэ 7 хоногт бүртгэсэн зардал — Ханшгүй 1,234\.56 USD \(₮-д ороогүй\)/);
        expect(budget).not.toMatch(/(^|\s)0 ₮/);
    });

    /** Хуудас, Instagram нэг хүсэлтээр (`social-week`) ирнэ — сувгийн тайлан, төсөв, холболт амжилттай. */
    const mockSources = (socialWeek: () => Response) => vi.mocked(fetch).mockImplementation(async input => {
        const url = String(input);
        if (url.startsWith('/api/marketing/budget')) return json({ year: 2026, available: false });
        if (url.startsWith('/api/marketing/channel-reports')) return json({ latest: Object.fromEntries(['meta_ads', 'facebook_page', 'callpro', 'sms'].map(source => [source, { report: null, exact: false, longer: false, previous: null, comparison: null }])) });
        if (url.startsWith('/api/dashboard/marketing/social-week')) return socialWeek();
        if (url.startsWith('/api/dashboard/marketing/connections')) return json({ connections });
        return json({ error: `unexpected ${url}` }, 500);
    });
    const pageWeek = { page: null, range, previousRange, syncedTo: null, rangeDays: 7, metrics: [], posts: [] };
    const exportMarketing = () => exportWeeklyDeck({ kind: 'marketing', projectName: 'Elysium Residence', meetingDate, range, previousRange, discussion: [], notices: [], slides: [], canReports: false, canMarketing: true });

    it('takes the Instagram week from the shared social-week response', async () => {
        mockSources(() => json({ week: pageWeek, instagram: { account: { id: '17841475771440904', username: 'elysiumbymoncon' }, range, previousRange, syncedTo: '2026-10-26', rangeDays: 7, metrics: [], posts: [] }, instagramError: null }));
        const result = await exportMarketing();
        expect(result.failedSources).toBe(0);
        const { text } = await slideTexts(blobs[0]);
        expect(text.find(slide => slide.includes('@elysiumbymoncon — долоо хоногийн үзүүлэлт'))).toContain('Энэ долоо хоногийн Instagram үзүүлэлт хадгалагдаагүй байна');
        expect(text.join(' ')).not.toContain('ачаалж чадсангүй');
    });

    it('a failed Instagram part (instagramError) is its own «could not load» slide and a counted source; the Page part stays', async () => {
        mockSources(() => json({ week: pageWeek, instagram: null, instagramError: 'Instagram-ийн үзүүлэлтийг уншиж чадсангүй. Шинэчилж дахин оролдоно уу.' }));
        const result = await exportMarketing();
        expect(result.failedSources).toBe(1);
        const { text, notes } = await slideTexts(blobs[0]);
        expect(text.some(slide => slide.includes('Instagram-ийн мэдээллийг ачаалж чадсангүй.'))).toBe(true);
        expect(notes).toContain('Instagram: Instagram-ийн үзүүлэлтийг уншиж чадсангүй. Шинэчилж дахин оролдоно уу.');
        expect(text.join(' ')).not.toContain('Facebook хуудас, Instagram-ийн мэдээллийг ачаалж чадсангүй');
    });

    it('a failed social-week request names both the Page and Instagram', async () => {
        mockSources(() => json({ error: 'Facebook хуудасны үзүүлэлтийг уншиж чадсангүй' }, 500));
        const result = await exportMarketing();
        expect(result.failedSources).toBe(1);
        const { text } = await slideTexts(blobs[0]);
        expect(text.some(slide => slide.includes('Facebook хуудас, Instagram-ийн мэдээллийг ачаалж чадсангүй.'))).toBe(true);
        expect(text.some(slide => slide.includes('Instagram-ийн мэдээллийг ачаалж чадсангүй.') && !slide.includes('Facebook хуудас, Instagram'))).toBe(false);
    });

    it('counts no failed source when every marketing source loads', async () => {
        vi.mocked(fetch).mockImplementation(async input => {
            const url = String(input);
            if (url.startsWith('/api/marketing/budget')) return json({ year: 2026, available: false });
            if (url.startsWith('/api/marketing/channel-reports')) return json({ latest: Object.fromEntries(['meta_ads', 'facebook_page', 'callpro', 'sms'].map(source => [source, { report: null, exact: false, longer: false, previous: null, comparison: null }])) });
            if (url.startsWith('/api/dashboard/marketing/social-week')) return json({ week: { page: null, range, previousRange, syncedTo: null, rangeDays: 7, metrics: [], posts: [] } });
            if (url.startsWith('/api/dashboard/marketing/connections')) return json({ connections });
            return json({ error: `unexpected ${url}` }, 500);
        });
        const result = await exportWeeklyDeck({ kind: 'marketing', projectName: 'Elysium Residence', meetingDate, range, previousRange, discussion: [], notices: [], slides: [], canReports: false, canMarketing: true });
        expect(result.failedSources).toBe(0);
        const { text } = await slideTexts(blobs[0]);
        expect(text.join(' ')).not.toContain('ачаалж чадсангүй');
    });
});
