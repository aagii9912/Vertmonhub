// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { SaxesParser } from 'saxes';
import { buildWeeklyDeck, weeklyDeckFileName, type DeckImage, type WeeklyDeckInput } from '../weekly-deck';
import { buildWeeklySales } from '../weekly-sales';
import { weeklyDiscussionItems } from '../weekly-review';
import { buildOperationsReport } from '../operations-report';
import { buildBudgetOverview } from '@/lib/marketing/budget';
import { buildMarketingPerformance } from '@/lib/marketing/performance';
import { compareReports, type ChannelReportMatch, type ChannelReportMatches, type ChannelReportRecord } from '@/lib/marketing/channel-reports-load';
import type { BreakdownRow, ChannelTotals, ChannelWarning } from '@/lib/marketing/channel-reports';
import type { ErpProduct, ErpSale } from '@/lib/erp/records';
import type { WeeklySlide } from '../weekly-slides';
import { summarizeContentPlan, type ContentItem } from '@/lib/marketing/content-plan';
import { summarizeSocialWeek, type SocialDailyRow, type SocialWeek } from '@/lib/marketing/social-week';

const range = { from: '2026-10-07', to: '2026-10-13' };
const meetingDate = '2026-10-14';
const shop = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
const media = (n: number) => `${shop}/${user}/00000000-0000-4000-8000-00000000000${n}.png`;

/** Нэг өнгөтэй PNG — постер (босоо), дэлгэцийн зураг (хэвтээ) хэмжээгээр. */
function png(width: number, height: number, [r, g, b]: [number, number, number]): string {
    const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (bytes: Buffer) => { let c = 0xffffffff; for (const byte of bytes) c = table[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type: string, data: Buffer) => {
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const out = Buffer.alloc(body.length + 8);
        out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
        return out;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
    const raw = Buffer.concat(Array.from({ length: height }, () => row));
    const file = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    return `image/png;base64,${file.toString('base64')}`;
}

const sale = (key: string, overrides: Partial<ErpSale>): ErpSale => ({
    key, contractNumber: key.split('|')[0], orderDate: range.from, manager: 'Номин.Менежер', product: key, unitCode: 'Б1-1', model: 'E1', kind: 'residential',
    block: 'Б1', channel: 'Фэйсбүүк', condition: 'Энгийн', customer: 'Б. Энхжин', advanceCondition: '30%', advanceAmount: 120000000, status: 'active',
    statusLabel: 'Гэрээ үүссэн', bankStatus: null, pricePerSqm: 5000000, area: 80, total: 400000000, paid: 120000000, refund: 0, balance: 280000000,
    overdue: 0, overdueDays: 0, penalty: 0, ...overrides,
});

function weeklySales() {
    const units: ErpProduct[] = [];
    for (const block of ['Б1', 'Б2']) for (let floor = 2; floor <= (block === 'Б1' ? 25 : 30); floor++) for (const model of ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']) {
        const index = units.length;
        units.push({ key: `u${index}`, code: `${block}-${index + 1}`, block, floor, model, kind: 'residential', rooms: 3, area: 47.91 + (index % 7) * 9.5, price: null,
            status: index % 3 === 0 ? 'sold' : index % 11 === 0 ? 'reserved' : 'available', statusLabel: '', barter: index % 37 === 0, manager: index % 3 === 0 ? 'Номин.Менежер' : null });
    }
    units.push({ key: 'p1', code: 'P-1', block: 'Б1', floor: -1, model: null, kind: 'parking', rooms: null, area: 12.5, price: null, status: 'available', statusLabel: '', barter: false, manager: null });
    const rows = Array.from({ length: 14 }, (_, index) => sale(`EL-${index + 1}|Б1-${index + 1}`, {
        kind: index % 4 === 1 ? 'parking' : 'residential', unitCode: `Б1-${index + 1}`, total: 200000000 + index * 10000000, paid: index % 3 ? 60000000 : null,
        customer: index === 2 ? 'Маш урт нэртэй захиалагч Батбаатар / Данзаншарав' : 'Б. Энхжин',
    }));
    return buildWeeklySales({
        range,
        sales: { info: { date: range.to, source: 'Elysium гэрээ' }, rows },
        previousSales: { info: { date: '2026-10-06', source: 'Elysium гэрээ' }, rows: [sale('EL-1|Б1-1', { paid: 20000000 })] },
        crmContracts: null,
        inventory: { info: { date: range.to, source: 'Elysium ERP', kind: 'erp' }, rows: units },
        monthTarget: 2500000000,
    });
}

function operations(from: string, to: string) {
    return { ...buildOperationsReport({
        range: { from, to }, now: `${to}T10:00:00Z`, transactions: null, targets: [],
        contracts: [{ id: 'c1', contract_date: from, product_type: 'residential', total_price: 286000000, contract_status: 'active', prepayment_paid_cash: 80000000 }],
        viewings: ['new_customer', 'repeat_customer', 'existing_buyer'].map(meeting_type => ({ scheduled_at: `${from}T03:00:00Z`, status: 'completed', meeting_type })),
        leads: Array.from({ length: 12 }, (_, index) => ({ created_at: `${from}T03:00:00Z`, status: 'new', source: 'facebook', sales_manager_name: index < 9 ? 'Номин' : null, last_contact_at: null, next_followup_at: null, viewing_scheduled_at: null })),
    }), shopName: 'Elysium Residence' };
}

function marketing() {
    return buildMarketingPerformance({
        projects: [], targets: [], contracts: [],
        activities: [{ id: 'a1', name: 'Open Day', activity_kind: 'campaign', status: 'completed', completed_on: range.to, start_date: range.from, channel: 'event', project_id: null, marketing_owner_name: null }],
        leads: Array.from({ length: 9 }, (_, index) => ({ id: `l${index}`, created_at: `${range.from}T03:00:00Z`, project_id: null, source: index < 6 ? 'facebook' : 'website',
            marketing_campaign_id: null, marketing_owner_name: null, marketing_channel: null, sales_handoff_at: index < 5 ? `${range.from}T05:00:00Z` : null, sales_manager_name: index < 5 ? 'Номин' : null })),
        spend: [{ id: 'sp1', spent_at: range.from, amount: 1200000, channel: 'facebook', project_id: null, marketing_owner_name: null, marketing_campaign_id: null, note: null }],
    }, range);
}

function channels(): ChannelReportMatches {
    const report = (source: string, totals: Record<string, number | string>) => ({ id: source, source, period_from: range.from, period_to: range.to, data_from: range.from, data_to: range.to, origin: 'file',
        file_name: `${source}.csv`, totals, warnings: [], row_count: 4, note: null, imported_by: user, created_at: range.to, updated_at: range.to, breakdown: [], mapping: {} });
    const none = { report: null, exact: false, longer: false, previous: null, comparison: null };
    return {
        meta_ads: { report: report('meta_ads', { spend: 300.38, currency: 'USD', reach: 270214, impressions: 483209, link_clicks: 800 }), exact: true, longer: false,
            previous: { ...report('meta_ads', { spend: 250, currency: 'USD' }), id: 'meta_prev', period_from: '2026-09-30', period_to: '2026-10-06', data_from: '2026-09-30', data_to: '2026-10-06' },
            comparison: { spend: { current: 300.38, previous: 250, delta: 50.38, pct: 20.2, comparable: true } } },
        facebook_page: none,
        callpro: { report: report('callpro', { answered: 16, missed: 6, abandoned: 1, answer_rate: 66.7, selected: 24 }), exact: true, longer: false, previous: null, comparison: null },
        sms: none,
    } as unknown as ChannelReportMatches;
}

const LONG_CAMPAIGN = 'Elysium Residence — 2 өрөө 1+1 урамшуулал, Лхагва гарагийн нээлттэй өдөрлөг, Зайсан, 2026 оны намрын дахин ажиллуулсан кампанит ажил';

/** Meta API-аас синк хийсэн хурлын долоо хоногийн `meta_ads` тайлан (`buildMetaChannelReport`-ийн хэлбэр). */
function metaApiReport(overrides: Partial<ChannelReportRecord> = {}): ChannelReportRecord {
    const campaign = (label: string, tag: string | null, values: BreakdownRow['values']): BreakdownRow => ({ kind: 'campaign', label, ...(tag ? { tag } : {}), values });
    const totals: ChannelTotals = {
        spend: 412.57, currency: 'USD', impressions: 98234, link_clicks: 1210, clicks_all: 1750, landing_page_views: 640,
        reach: 41200, frequency: 2.38, cpm: 4.2, cost_per_link_click: 0.34, ctr_link: 1.23, cost_per_landing_page_view: 0.64,
        results_calls: 58, spend_calls: 251.3, cost_per_result_calls: 4.33,
        results_post_interaction: 3120, spend_post_interaction: 101.27, cost_per_result_post_interaction: 0.0325,
        // Хүрсэн хүний кампанит ажил хоёр ad set-тэй: давхардалгүй тоо ирээгүй → тоо, өртөггүй, зардал л.
        spend_reach: 40,
    };
    // Зардлаар эрэмбэлээгүй дарааллаар (хэвлэхдээ зардлаар буурахаар эрэмбэлнэ); 13 мөр → 2 слайд.
    const breakdown = [
        campaign('Пост — 3 өрөө', 'post_interaction', { spend: 31.2, impressions: 9100, link_clicks: 40, results: 980, cost_per_result: 0.0318 }),
        campaign(LONG_CAMPAIGN, 'calls', { spend: 120.5, impressions: 15200, link_clicks: 210, results: 31, cost_per_result: 3.89 }),
        // Нэг кампанит ажил хоёр төрлийн ad set-тэй → хоёр мөр (ижил нэр).
        campaign('Пост — 3 өрөө', 'reach', { spend: 40, impressions: 30100, link_clicks: 12, results: null, cost_per_result: null }),
        campaign('Төрөлгүй тест', null, { spend: 20, impressions: 2100, link_clicks: 9, results: null, cost_per_result: null }),
        ...Array.from({ length: 9 }, (_, i) => campaign(`Дуудлага ${i + 1}`, i % 3 ? 'calls' : 'post_interaction', {
            spend: 15 - i, impressions: 4000 + i * 100, link_clicks: 50 + i, results: i % 3 ? 3 : 240, cost_per_result: i % 3 ? Number(((15 - i) / 3).toFixed(2)) : Number(((15 - i) / 240).toFixed(4)),
            ...(i === 0 ? { reach: 3100 } : {}),
        })),
    ];
    const warnings: ChannelWarning[] = [
        { code: 'non_additive', level: 'info', message: 'Хүрсэн хүн (үр дүн)-ийг тооцоогүй: reach зорилготой кампанит ажлын давхардалгүй reach Meta-гаас ирээгүй.' },
        { code: 'field_ignored', level: 'info', message: '4 мөрийн үр дүнг ad set-ийн зорилгоор (optimization goal) тооцсон — Ads Manager-ийн Results-аас бага зэрэг зөрж болно.' },
        { code: 'out_of_period', level: 'info', message: 'Meta өдрийг зарын дансны цагийн бүсээр (America/Los_Angeles) тоолдог.' },
    ];
    return {
        id: 'meta-api', source: 'meta_ads', period_from: range.from, period_to: range.to, data_from: range.from, data_to: '2026-10-12', origin: 'api', file_name: null,
        totals, breakdown, warnings, row_count: 40, note: null, imported_by: null, created_at: range.to, updated_at: range.to, mapping: {}, ...overrides,
    };
}

/** Тайлан + өмнөх (зэрэгцээ, бүтэн) долоо хоногийн тайлан → хурлын ачаалагчийн харьцуулалт. */
function metaMatch(report: ChannelReportRecord, previousTotals: ChannelTotals | null): ChannelReportMatch {
    const previous = previousTotals ? { ...report, id: 'meta-prev', period_from: '2026-09-30', period_to: '2026-10-06', data_from: '2026-09-30', data_to: '2026-10-06', totals: previousTotals } : null;
    return { report, exact: report.period_from === range.from && report.period_to === range.to, longer: false, previous, comparison: compareReports(report, previous) };
}

const withMeta = (meta: ChannelReportMatch): ChannelReportMatches => ({ ...channels(), meta_ads: meta });

async function notesOf(zip: JSZip) {
    const names = Object.keys(zip.files).filter(name => /notesSlide\d+\.xml$/.test(name));
    return (await Promise.all(names.map(name => zip.file(name)!.async('string')))).join(' ');
}

const content = (id: string, title: string, date: string, status: ContentItem['status'], overrides: Partial<ContentItem> = {}): ContentItem => ({
    id, title, type: 'reel', platform: 'facebook', scheduled_date: date, scheduled_time: null, status, description: null, assigned_to: 'Анужин', color: null,
    image_paths: [], created_by: user, updated_at: `${range.to}T10:00:00Z`, ...overrides,
});
function contentPlan() {
    const items = [
        content('c1', 'Онцлох орон сууц: 201 мкв 5 өрөө', '2026-10-08', 'published', { type: 'post', image_paths: [media(1), media(2)], description: 'Постер + carousel, 3% өссөн хүрэлт.' }),
        content('c2', '24 давхрын 5 өрөөний reel', '2026-10-09', 'published', { image_paths: [media(4)] }),
        content('c3', 'Хувь лизингийн нөхцөл', '2026-10-10', 'planned', { type: 'post' }),
        content('c4', 'Загварын байрны story', '2026-10-12', 'cancelled', { type: 'story' }),
        content('c5', 'Оршин суугчийн сэтгэгдэл', '2026-10-15', 'planned'),
    ];
    return { week: summarizeContentPlan(items, range, '2026-10-14'), next: summarizeContentPlan(items, { from: meetingDate, to: '2026-10-20' }, '2026-10-14') };
}

/** Facebook хуудасны өдрийн мөр: тайлант 7 хоног, өмнөх 7 хоног. Оролцоо 5 өдөр л, хуудас үзэлт огт алга. */
function social(): SocialWeek {
    const previousRange = { from: '2026-09-30', to: '2026-10-06' };
    const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
    const rows: SocialDailyRow[] = [
        ...days(range.from, 7).flatMap((day, i) => [{ day, metric: 'page_media_view', value: 1000 }, { day, metric: 'page_daily_follows_unique', value: 5 }, { day, metric: 'page_follows', value: 4806 + i }]),
        ...days(previousRange.from, 7).flatMap((day, i) => [{ day, metric: 'page_media_view', value: 800 }, { day, metric: 'page_daily_follows_unique', value: 4 }, { day, metric: 'page_follows', value: 4780 + i }]),
        ...days(range.from, 5).map(day => ({ day, metric: 'page_post_engagements', value: 120 })),
    ];
    return {
        page: { id: '676357242225387', name: 'Elysium Residence' }, range, previousRange, syncedTo: range.to, rangeDays: 7,
        metrics: summarizeSocialWeek(rows, range, previousRange),
        posts: [
            { id: '1_2', content: 'ОНЦЛОХ ОРОН СУУЦ | ГЭР БҮЛИЙН\nТАВ ТУХ', publishedAt: '2026-10-08T02:00:00Z', views: 70662, clicks: 327, likes: 289, comments: 7, shares: 0, asOf: '2026-10-13' },
            { id: '1_3', content: null, publishedAt: '2026-10-12T17:30:00Z', views: null, clicks: null, likes: 12, comments: null, shares: 1, asOf: null },
        ],
    };
}

const slide = (id: string, overrides: Partial<WeeklySlide>): WeeklySlide => ({
    id, meeting_date: meetingDate, part: 'marketing', section: 'social', title: '', note: '', image_paths: [], position: 0,
    author_id: user, author_name: 'Анужин', updated_at: `${range.to}T10:00:00Z`, ...overrides,
});

function input(overrides: Partial<WeeklyDeckInput> = {}): WeeklyDeckInput {
    const images: Record<string, DeckImage> = {
        [media(1)]: { data: png(1080, 1350, [40, 90, 200]), width: 1080, height: 1350 },
        [media(2)]: { data: png(1080, 1350, [230, 140, 40]), width: 1080, height: 1350 },
        [media(3)]: { data: png(1920, 1080, [30, 150, 110]), width: 1920, height: 1080 },
        [media(4)]: { data: png(464, 830, [120, 60, 160]), width: 464, height: 830 },
    };
    return {
        kind: 'sales', projectName: 'Mandala 360&365 Tower', meetingDate, range, previousRange: { from: '2026-09-30', to: '2026-10-06' }, generatedAt: '2026.10.13 14:05',
        discussion: [{ title: 'Эзэнгүй 3 лид', detail: 'Хариуцах менежер, дараагийн алхмыг тогтоох.', part: 'sales' }, { title: 'Хоцорсон 1 контент', detail: 'Шинэ огноо тогтоох.', part: 'marketing' }], notices: [],
        sales: operations(range.from, range.to), previousSales: operations('2026-09-30', '2026-10-06'), weeklySales: weeklySales(),
        budget: { year: 2026, month: 10, overview: buildBudgetOverview(Array(12).fill(10000000), Array.from({ length: 12 }, (_, i) => i < 10 ? 8000000 : 0), Array(12).fill(0)) },
        marketing: marketing(), channels: channels(), contentPlan: contentPlan(), social: social(),
        slides: [
            slide('s1', { section: 'social', title: 'Онцлох орон сууц: 201 мкв 5 өрөө', image_paths: [media(1), media(2)] }),
            slide('s2', { section: 'callpro', title: 'CallPro — алдсан дуудлага', image_paths: [media(3)], note: 'Алдсан дуудлага 12:00 болон 15:00–16:00 цагийн үед төвлөрч байна.' }),
            slide('s3', { section: 'social', title: 'Дахин идэвхжүүлсэн reel', image_paths: [media(4), media(4).replace('4.png', '5.png'), media(1)] }),
            slide('s5', { section: 'page', title: 'Пэйж хандалт', image_paths: [media(3), media(4), media(1), media(2)], note: 'Views: 676.8K, 3% өссөн — нийт хүрэлт тогтвортой, өндөр байна. Viewers: 191.1K, 1.2% өссөн. Content interactions: 278, 49.9% буурсан. Link clicks: 646, 155.3% өссөн. Дүгнэлт: контентын хүрэлт, үзсэн хугацаа болон органик үзэлт өссөн нь эерэг үзүүлэлт.' }),
            slide('s4', { part: 'sales', section: 'plan', title: 'Энэ сард хийгдэх ажлууд', note: '• Дулаан зогсоолуудыг гинжлэх\n• 1 давхрын орон сууцнуудыг сайжруулах' }),
        ],
        images,
        updates: [
            { id: 'u1', user_id: user, author_name: 'Номин', meeting_date: meetingDate, achievements: 'Гурван гэрээ хийсэн.', blockers: 'Банкны зээлийн хариу удаж байна.', next_steps: 'Дахин холбогдох.', updated_at: `${range.to}T10:00:00Z`, author_role: 'sales_manager' },
            { id: 'u2', user_id: shop, author_name: 'Анужин', meeting_date: meetingDate, achievements: 'Хоёр reel хийсэн.', blockers: '', next_steps: 'Сэтгэгдлийн видео.', updated_at: `${range.to}T10:00:00Z`, author_role: 'marketing' },
        ],
        ...overrides,
    };
}

async function render(deck: WeeklyDeckInput) {
    const pres = new PptxGenJS();
    buildWeeklyDeck(pres, deck);
    const buffer = await pres.write({ outputType: 'nodebuffer' }) as Buffer;
    if (process.env.WEEKLY_DECK_OUT) writeFileSync(process.env.WEEKLY_DECK_OUT, buffer);
    const zip = await JSZip.loadAsync(buffer);
    const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const xml = await Promise.all(slides.map(name => zip.file(name)!.async('string')));
    return { zip, xml, text: xml.map(part => [...part.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(match => match[1]).join(' ')) };
}

async function validXml(zip: JSZip) {
    const parts = Object.keys(zip.files).filter(file => file.endsWith('.xml') || file.endsWith('.rels'));
    for (const [name, body] of await Promise.all(parts.map(async name => [name, await zip.file(name)!.async('string')] as const))) {
        const parser = new SaxesParser();
        expect(() => { parser.write(body); parser.close(); }, name).not.toThrow();
    }
}

describe('weekly meeting deck (.pptx)', () => {
    it('sales deck: sales sections only, valid XML, names with &', async () => {
        const { zip, xml, text } = await render(input());
        await validXml(zip);
        const layouts = await Promise.all(Object.keys(zip.files).filter(name => /slideLayout\d+\.xml$/.test(name)).map(name => zip.file(name)!.async('string')));
        expect(layouts.join(' ')).toContain('VERTMON HUB · Mandala 360&amp;365 Tower');
        expect(layouts.join(' ')).not.toContain('&amp;amp;');
        const all = text.join('\n');
        expect(text[0]).toContain('Mandala 360&amp;365 Tower');
        expect(text[0]).toContain('Долоо хоногийн борлуулалтын тайлан');
        for (const needle of ['Эзэнгүй 3 лид', 'Борлуулалтын тойм', 'Энэ долоо хоногийн гэрээ (1/2)', 'Энэ долоо хоногийн гэрээ (2/2)', 'Орон сууцны үлдэгдэл — Б1 блок',
            'Орон сууцны үлдэгдэл — Б2 блок (1/2)', 'Лидийн эх сурвалж, хөрвөлт', 'Энэ сард хийгдэх ажлууд', 'Банкны зээлийн хариу', 'Анхаарал хандуулсанд баярлалаа']) expect(all).toContain(needle);
        // Маркетингийн контент, постер, суваг, маркетингийн гишүүний явц борлуулалтын файлд орохгүй.
        for (const needle of ['Хоцорсон 1 контент', 'Контент төлөвлөгөө', 'Онцлох орон сууц', 'CallPro — алдсан дуудлага', 'Сувгийн экспорт', 'Хоёр reel хийсэн', 'Төсөв ба зарцуулалт',
            'долоо хоногийн үзүүлэлт', 'нийтэлсэн пост']) expect(all).not.toContain(needle);
        const index = (needle: string) => text.findIndex(slideText => slideText.includes(needle));
        expect(index('Лидийн эх сурвалж')).toBeLessThan(index('Энэ сард хийгдэх ажлууд'));
        expect(index('Банкны зээлийн хариу')).toBe(xml.length - 2);
    });

    it('marketing deck: own content plan, published content with posters, channels and budget — no leads or contracts', async () => {
        const { zip, xml, text } = await render(input({ kind: 'marketing' }));
        await validXml(zip);
        const all = text.join('\n');
        expect(text[0]).toContain('МАРКЕТИНГИЙН АЛБА');
        for (const needle of ['Хоцорсон 1 контент', 'Контент төлөвлөгөө ба гүйцэтгэл', 'Энэ долоо хоногийн контент', 'Онцлох орон сууц: 201 мкв 5 өрөө', 'Постер + carousel',
            '24 давхрын 5 өрөөний reel', 'CallPro — алдсан дуудлага', 'Сувгийн экспорт', 'Meta зар — долоо хоногийн тойм', 'Төсөв ба зарцуулалт', 'Дараагийн 7 хоногийн контент төлөвлөгөө',
            'Оршин суугчийн сэтгэгдэл', 'Хоёр reel хийсэн']) expect(all).toContain(needle);
        for (const needle of ['Эзэнгүй 3 лид', 'Борлуулалтын тойм', 'Энэ долоо хоногийн гэрээ', 'Лидийн эх сурвалж', 'Гэрээтэй', 'Менежерт шилжсэн', 'Нэг лидийн өртөг', 'Банкны зээлийн хариу', 'Энэ сард хийгдэх ажлууд']) {
            expect(all, needle).not.toContain(needle);
        }
        const plan = text.slice(1).find(slideText => slideText.includes('Контент төлөвлөгөө ба гүйцэтгэл'))!;
        // Тайлант долоо хоногт 3 төлөвлөсөн (цуцалсан нь орохгүй), 2 нийтэлсэн = 67%, 1 хоцорсон.
        expect(plan).toMatch(/Төлөвлөсөн контент 3 /);
        expect(plan).toContain('Төлөвлөгөөний 67%');
        const index = (needle: string) => text.findIndex(slideText => slideText.includes(needle));
        expect(plan).toMatch(/Хоцорсон 1 /);
        expect(index('Энэ долоо хоногийн контент')).toBeLessThan(index('Постер + carousel'));
        expect(index('Сувгийн экспорт')).toBeLessThan(index('Дараагийн 7 хоногийн контент төлөвлөгөө'));
        expect(index('Хоёр reel хийсэн')).toBe(xml.length - 2);
        expect(Object.keys(zip.files).filter(name => name.startsWith('ppt/media/') && !name.endsWith('/')).length).toBeGreaterThanOrEqual(3);
    });

    it('marketing deck: Facebook Page week from stored insights, compared only when both weeks are complete', async () => {
        const { text } = await render(input({ kind: 'marketing' }));
        const index = (needle: string) => text.findIndex(slideText => slideText.includes(needle));
        const page = text[index('Elysium Residence — долоо хоногийн үзүүлэлт')];
        expect(page).toContain('Meta-гийн өдөр (Номхон далайн цаг)');
        // Үзэлт 7×1000, өмнөх 7×800 → +1,400 (+25%); шинэ дагагч 35 vs 28.
        expect(page).toMatch(/Үзэлт 7,000 Өмнөх 7 хоног 5,600 · \+1,400 \(\+25%\)/);
        expect(page).toMatch(/Шинэ дагагч 35 Өмнөх 7 хоног 28 · \+7 \(\+25%\)/);
        // Дагагч = сүүлийн өдрийн төлөв, нэмэхгүй; 7 хоногийн өмнөх өдөртэй (10.06 = 4,786) харьцуулна.
        expect(page).toMatch(/Дагагч 4,812 2026\.10\.13-ны байдлаар · 7 хоногийн өмнө 4,786 · \+26 \(\+0\.5%\)/);
        // Оролцоо 5 өдөр л, өмнөх долоо хоногийн мөн өдрүүдэд өгөгдөл алга → харьцуулахгүй; өгөгдөлгүй метрик 0 биш «—».
        expect(page).toMatch(/Нийтлэлийн оролцоо 600 5\/7 өдөр · Өмнөх 7 хоногийн мөн өдрүүд — Шинэ дагагч/);
        expect(page).toMatch(/Хуудас үзсэн — Meta өгөөгүй/);
        const posts = text[index('Энэ долоо хоногт нийтэлсэн пост')];
        expect(posts).toContain('ОНЦЛОХ ОРОН СУУЦ | ГЭР БҮЛИЙН ТАВ ТУХ');
        expect(posts).toContain('(текстгүй пост)');
        expect(posts).toMatch(/70,662 327 289 7 0/);
        // 2026-10-12T17:30Z = УБ-ын 10.13.
        expect(posts).toContain('10.13');
        expect(index('долоо хоногийн үзүүлэлт')).toBeGreaterThan(index('Постер + carousel'));
        expect(index('нийтэлсэн пост')).toBeLessThan(index('Сувгийн экспорт'));
    });

    it('marketing deck: Meta Ads like an Ads Manager summary — totals, results by type, paged campaigns, partial week not compared', async () => {
        const report = metaApiReport();
        const { zip, text } = await render(input({ kind: 'marketing', channels: withMeta(metaMatch(report, { ...report.totals, spend: 380, results_calls: 50 })) }));
        await validXml(zip);
        const index = (needle: string) => text.findIndex(slideText => slideText.includes(needle));
        const meta = text.filter(slideText => slideText.includes('META ЗАР'));
        expect(meta).toHaveLength(4);
        // Дараалал: сувгийн экспорт → Meta (тойм, төрлөөр, кампанит ажил 1/2, 2/2) → төсөв.
        expect(index('Сувгийн экспорт')).toBeLessThan(index('Meta зар — долоо хоногийн тойм'));
        expect(index('Meta зар — долоо хоногийн тойм')).toBeLessThan(index('Meta зар — үр дүн төрлөөр'));
        expect(index('Meta зар — үр дүн төрлөөр')).toBeLessThan(index('Meta зар — кампанит ажлаар (1/2)'));
        expect(index('Meta зар — кампанит ажлаар (2/2)')).toBeLessThan(index('Төсөв ба зарцуулалт'));

        const summary = text[index('Meta зар — долоо хоногийн тойм')];
        // Хамралт 6/7 өдөр, Meta API; дутуу долоо хоногийг өмнөхтэй тулгахгүй.
        expect(summary).toContain('2026.10.07 – 2026.10.13 · Meta API · 6/7 өдөр (2026.10.07 – 2026.10.12)');
        expect(summary).toMatch(/Зарцуулсан дүн 412\.57 USD Impressions \(харагдалт\) 98,234 Reach \(хүрсэн хүн\) 41,200 Frequency \(давтамж\) 2\.38 Link clicks 1,210 Link CTR 1\.23% CPM \(1000 харагдалтын өртөг\) 4\.2 USD Нэг link click-ийн өртөг 0\.34 USD/);
        expect(summary).toContain('Өдөр дутуу тул өмнөх долоо хоногтой харьцуулаагүй.');
        expect(summary).not.toMatch(/Өмнөх 7 хоног|\+32\.57/);
        expect(summary).toContain('Зардал зарын дансны валютаар (USD) — төгрөгт хөрвүүлээгүй');

        const types = text[index('Meta зар — үр дүн төрлөөр')];
        // Төрөл бүр тусдаа: тоо, зардал, нэг үр дүнгийн өртөг (хуудастай адил 2 орон, 0.01-ээс бага бол 4); хүрсэн хүн «—», өртөггүй.
        expect(types).toMatch(/Үр дүн Тоо Зардал \(USD\) Нэг үр дүнгийн өртөг \(USD\) Дуудлага \(Meta\) 58 251\.3 4\.33 Постын харилцаа 3,120 101\.27 0\.03 Хүрсэн хүн \(үр дүн\) — 40 —/);
        // Төрөлд хуваарилаагүй зардал (412.57 − 392.57) ба нийт зардал — үр дүнгийн нийлбэр мөр хэзээ ч үгүй.
        expect(types).toMatch(/Үр дүнгийн төрөлгүй зардал 20 Нийт зардал 412\.57/);
        expect(types).not.toContain('3,178');
        expect(types).toContain('«—» = хүрсэн хүнийг өдөр, кампанит ажлаар нэмэхгүй');
        expect(types).toContain('Зарим үр дүнг ad set-ийн зорилгоор ойролцоогоор тооцсон');

        const first = text[index('Meta зар — кампанит ажлаар (1/2)')];
        // «Пост — 3 өрөө» хоёр мөр: нэг кампанит ажлын хоёр төрөл үү, ижил нэртэй хоёр кампанит ажил уу — ID-гүй тул мөрөөр л тоолно.
        expect(first).toContain('13 мөр (кампанит ажил × үр дүнгийн төрөл) · зардлаар эрэмбэлсэн');
        expect(first).not.toContain('12 кампанит ажил');
        // Reach нь Meta-гийн давхардалгүй тоо ирсэн мөрт л; бусад мөр «—».
        expect(first).toMatch(/Кампанит ажил Үр дүнгийн төрөл Үр дүн Нэг үр дүнгийн өртөг \(USD\) Зардал \(USD\) Impressions Reach Link clicks/);
        // Хамгийн их зардалтай мөр эхэнд, урт нэр 2 мөрт багтахаар үгийн заагаар тайрагдана.
        expect(first).toMatch(/Link clicks Elysium Residence — 2 өрөө 1\+1 урамшуулал, Лхагва гарагийн нээлттэй… Дуудлага \(Meta\) 31 3\.89 120\.5 15,200 — 210/);
        expect(first).not.toContain('дахин ажиллуулсан');
        // «(үр дүн)» дагаварыг баганын гарчиг илэрхийлнэ.
        expect(first).toMatch(/Пост — 3 өрөө Хүрсэн хүн — — 40 30,100 — 12 Пост — 3 өрөө Постын харилцаа 980 0\.03 31\.2/);
        expect(first).toMatch(/Төрөлгүй тест Тодорхойгүй — — 20 2,100 — 9/);
        expect(first).toMatch(/Дуудлага 1 Постын харилцаа 240 0\.06 15 4,000 3,100 50/);
        const second = text[index('Meta зар — кампанит ажлаар (2/2)')];
        expect(second).toMatch(/Дуудлага 9 Дуудлага \(Meta\) 3 2\.33 7 4,800 — 58/);

        // Meta-гийн мөнгийг төгрөгөөр бичихгүй; маркетингийн файлд CRM-ийн лид, гэрээ, хөрвөлт орохгүй.
        for (const slideText of meta) expect(slideText).not.toContain('₮');
        const all = text.join('\n');
        for (const needle of ['Лидийн эх сурвалж', 'Гэрээтэй', 'Менежерт шилжсэн', 'Нэг лидийн өртөг', 'хөрвөлт']) expect(all, needle).not.toContain(needle);

        const notes = await notesOf(zip);
        expect(notes).toContain('optimization goal');
        expect(notes).toContain('America/Los_Angeles');
        expect(notes).toContain('Үр дүнгийн төрөлд хуваарилаагүй зардал: 20 USD');
        expect(notes).toContain('өдрийн reach-ийг нэмээгүй');
        expect(notes).toContain('Hub-ийн бүртгэлтэй холбож тооцоогүй');
    });

    it('marketing deck: a full Meta week is compared with the previous week, per type too, and Meta form leads keep a neutral cost label', async () => {
        // Лид маягтын кампанит ажил өмнөх долоо хоногт хүргэлттэй, энэ долоо хоногт хүргэлтгүй (0 үр дүн, 0 зардал).
        const report = metaApiReport({ data_to: range.to, totals: { ...metaApiReport().totals, results_leads: 0, spend_leads: 0 } });
        const { text } = await render(input({ kind: 'marketing', channels: withMeta(metaMatch(report, { ...report.totals, spend: 380, impressions: 90000, results_calls: 50, results_leads: 4, spend_leads: 12 })) }));
        const at = (needle: string) => text.find(slideText => slideText.includes(needle))!;
        const summary = at('Meta зар — долоо хоногийн тойм');
        expect(summary).toContain('2026.10.07 – 2026.10.13 · Meta API');
        expect(summary).not.toContain('өдөр (');
        expect(summary).toMatch(/Зарцуулсан дүн 412\.57 USD Өмнөх 7 хоног 380 USD · \+32\.57 \(\+8\.6%\)/);
        expect(summary).toMatch(/Impressions \(харагдалт\) 98,234 Өмнөх 7 хоног 90,000 · \+8,234 \(\+9\.1%\)/);
        expect(summary).not.toContain('Өдөр дутуу');
        const types = at('Meta зар — үр дүн төрлөөр');
        expect(types).toMatch(/Үр дүн Тоо Өмнөх 7 хоног Зардал \(USD\) Нэг үр дүнгийн өртөг \(USD\) Дуудлага \(Meta\) 58 50 · \+8 \(\+16%\) 251\.3 4\.33/);
        // Энэ долоо хоногт хүргэлтгүй төрөл: 0 (яг тоо), өртөг биш «хүргэлтгүй».
        expect(types).toMatch(/Лид маягт 0 4 · -4 \(-100%\) 0 хүргэлтгүй/);
        expect(text.join('\n')).not.toContain('Нэг лидийн өртөг');
    });

    it('marketing deck: an Ads Manager file with mixed currencies hides campaign money instead of mixing it', async () => {
        const report = metaApiReport({ origin: 'file', file_name: 'meta.csv', data_to: range.to });
        for (const key of Object.keys(report.totals)) if (/^(?:spend|cpm|cost_|spend_)/.test(key) || key === 'currency') delete report.totals[key];
        report.warnings = [{ code: 'mixed_currency', level: 'warning', message: 'Файлд өөр өөр валют байна (USD, MNT).' }];
        const { text, zip } = await render(input({ kind: 'marketing', channels: withMeta(metaMatch(report, null)) }));
        const at = (needle: string) => text.find(slideText => slideText.includes(needle))!;
        const summary = at('Meta зар — долоо хоногийн тойм');
        expect(summary).toContain('· Экспорт файл');
        expect(summary).toContain('Зарцуулсан дүн — Өөр валют холилдсон — тооцоогүй');
        expect(summary).toContain('Өмнөх ижил хугацааны Meta тайлан алга — харьцуулаагүй.');
        expect(summary).toContain('1 анхааруулга — слайдын тэмдэглэлд.');
        expect(at('Meta зар — үр дүн төрлөөр')).toMatch(/өөр валют холилдсон тул зардал тооцоогүй Үр дүн Тоо Зардал Нэг үр дүнгийн өртөг Дуудлага \(Meta\) 58 — —/);
        const campaigns = at('Meta зар — кампанит ажлаар (1/2)');
        expect(campaigns).toContain('Нэг үр дүнгийн өртөг Зардал Impressions');
        expect(campaigns).not.toMatch(/120\.5|USD|₮/);
        // Өөр валютын зардлыг хооронд нь харьцуулж эрэмбэлэхгүй: харагдалтаар (30,100 > 15,200 > 9,100 …).
        expect(campaigns).toContain('13 мөр (кампанит ажил × үр дүнгийн төрөл) · харагдалтаар эрэмбэлсэн');
        expect(campaigns).not.toContain('зардлаар эрэмбэлсэн');
        expect(campaigns).toMatch(/Link clicks Пост — 3 өрөө Хүрсэн хүн — — — 30,100 — 12 Elysium Residence .+ 15,200 — 210 Пост — 3 өрөө Постын харилцаа 980 — — 9,100/);
        const notes = await notesOf(zip);
        expect(notes).toContain('Анхааруулга: Файлд өөр өөр валют байна (USD, MNT).');
        expect(notes).toContain('Файлд өөр валют холилдсон тул кампанит ажлын зардал, өртгийг харуулаагүй');
    });

    it('marketing deck: a file without a spend column says so instead of blaming mixed currencies', async () => {
        const report = metaApiReport({ origin: 'file', file_name: 'meta.csv', data_to: range.to, warnings: [] });
        for (const key of Object.keys(report.totals)) if (/^(?:spend|cpm|cost_|spend_)/.test(key) || key === 'currency') delete report.totals[key];
        const { text, zip } = await render(input({ kind: 'marketing', channels: withMeta(metaMatch(report, null)) }));
        expect(text.find(slideText => slideText.includes('Meta зар — кампанит ажлаар (1/2)'))).toContain('харагдалтаар эрэмбэлсэн');
        const notes = await notesOf(zip);
        expect(notes).toContain('Тайланд зардал алга (экспортод зардлын багана сонгоогүй)');
        expect(notes).not.toContain('өөр валют холилдсон');
    });

    it('marketing deck: a longer Meta report is compared under its real length, a non-adjacent one as «Өмнөх тайлан» with dates', async () => {
        // Хурлын долоо хоногийг хамарсан 30 өдрийн экспорт ба өмнөх 30 өдрийн экспорт (зэрэгцээ).
        const report = metaApiReport({ origin: 'file', file_name: 'meta-30d.csv', period_from: '2026-09-14', period_to: '2026-10-13', data_from: '2026-09-14', data_to: '2026-10-13' });
        const previous = { ...report, id: 'meta-prev-30', period_from: '2026-08-15', period_to: '2026-09-13', data_from: '2026-08-15', data_to: '2026-09-13', totals: { ...report.totals, spend: 300, results_calls: 50 } };
        const longer: ChannelReportMatch = { report, exact: false, longer: true, previous, comparison: compareReports(report, previous) };
        const { text } = await render(input({ kind: 'marketing', channels: withMeta(longer) }));
        const at = (needle: string) => text.find(slideText => slideText.includes(needle))!;
        const summary = at('Meta зар — долоо хоногийн тойм');
        expect(summary).toContain('хурлын долоо хоногоос урт тайлан (30 өдөр)');
        expect(summary).toMatch(/Зарцуулсан дүн 412\.57 USD Өмнөх 30 хоног 300 USD · \+112\.57 \(\+37\.5%\)/);
        expect(summary).toContain('Харьцуулсан тайлан: 2026.08.15 – 2026.09.13 (30 хоног).');
        expect(summary).not.toContain('Өмнөх 7 хоног');
        const types = at('Meta зар — үр дүн төрлөөр');
        expect(types).toMatch(/Үр дүн Тоо Өмнөх 30 хоног Зардал \(USD\)/);
        expect(types).not.toContain('Өмнөх 7 хоног');

        // Өмнөх тайлан залгаа биш (долоо хоног алгассан) → «Өмнөх тайлан» ба огноо.
        const week = metaApiReport({ data_to: range.to });
        const gap = { ...week, id: 'meta-gap', period_from: '2026-09-23', period_to: '2026-09-29', data_from: '2026-09-23', data_to: '2026-09-29', totals: { ...week.totals, spend: 380 } };
        const older = await render(input({ kind: 'marketing', channels: withMeta({ report: week, exact: true, longer: false, previous: gap, comparison: compareReports(week, gap) }) }));
        const olderSummary = older.text.find(slideText => slideText.includes('Meta зар — долоо хоногийн тойм'))!;
        expect(olderSummary).toMatch(/Зарцуулсан дүн 412\.57 USD Өмнөх тайлан 380 USD · \+32\.57/);
        expect(olderSummary).toContain('Харьцуулсан тайлан: 2026.09.23 – 2026.09.29 (7 хоног).');
        expect(olderSummary).not.toContain('Өмнөх 7 хоног');
    });

    it('marketing deck: API reach results summed over campaigns are marked «≈»; a missing non-reach count gets its own reason', async () => {
        const base = metaApiReport({ data_to: range.to });
        const report = metaApiReport({
            data_to: range.to,
            // Хоёр reach кампанит ажил: 30,000 + 20,000 (дансны давхардалгүй reach 40,000) → нийлбэр; «Бусад» төрөлд Meta тоо өгөөгүй.
            totals: { ...base.totals, results_reach: 50000, spend_reach: 40, cost_per_result_reach: 0.8, spend_other: 12.5 },
            breakdown: [
                ...base.breakdown.filter(row => row.tag !== 'reach'),
                { kind: 'campaign', label: 'Хүрэлт — Зайсан', tag: 'reach', values: { spend: 24, impressions: 41000, link_clicks: 5, reach: 30000, results: 30000, cost_per_result: 0.8 } },
                { kind: 'campaign', label: 'Хүрэлт — Хан-Уул', tag: 'reach', values: { spend: 16, impressions: 26000, link_clicks: 3, reach: 20000, results: 20000, cost_per_result: 0.8 } },
                { kind: 'campaign', label: 'Брэнд awareness', tag: 'other', values: { spend: 12.5, impressions: 18000, link_clicks: 2, results: null, cost_per_result: null } },
            ],
            warnings: [
                { code: 'non_additive', level: 'info', message: 'Хүрсэн хүн (үр дүн) нь reach зорилготой 2 кампанит ажлын давхардалгүй reach-ийн нийлбэр — кампанит ажил хооронд давхцаж болно.' },
                { code: 'no_values', level: 'info', message: 'Бусад үр дүн: үр дүнгийн тоо Meta-гаас ирээгүй — зөвхөн зардлыг тооцсон.' },
            ],
        });
        const { text, zip } = await render(input({ kind: 'marketing', channels: withMeta(metaMatch(report, null)) }));
        const types = text.find(slideText => slideText.includes('Meta зар — үр дүн төрлөөр'))!;
        expect(types).toMatch(/Хүрсэн хүн \(үр дүн\) ≈ 50,000 40 ≈ 0\.8 \/ 1000 хүн Бусад үр дүн/);
        expect(types).toMatch(/Бусад үр дүн — 12\.5 —/);
        expect(types).toContain('≈ = reach зорилготой кампанит ажлуудын давхардалгүй reach-ийн нийлбэр — кампанит ажил хооронд давхцаж болох');
        expect(types).toContain('«—» = Бусад үр дүн: Meta үр дүнгийн тоо өгөөгүй (зардлыг л харуулав).');
        // Хүрсэн хүний тоо ирсэн тул reach-ийн «—» тайлбар гарахгүй.
        expect(types).not.toContain('хүрсэн хүнийг өдөр, кампанит ажлаар нэмэхгүй');
        const campaigns = text.find(slideText => slideText.includes('Meta зар — кампанит ажлаар'))!;
        expect(campaigns).toContain('15 кампанит ажил · зардлаар эрэмбэлсэн');
        const notes = await notesOf(zip);
        expect(notes).toContain('мөрүүдийн reach-ийг нэмж нийт хүрсэн хүн гаргахгүй');
        expect(notes).toContain('reach зорилготой кампанит ажлуудын reach-ийн нийлбэр — давхцаж болно');
        expect(notes).not.toContain('кампанит ажил хооронд нэмэхгүй');
    });

    it('marketing deck: long Ads Manager campaign names wrap to two lines and page by height so the table never reaches the footer', async () => {
        // Ads Manager-ийн бодит хэв маягийн нэрс (53–76 тэмдэгт), 22 кампанит ажил.
        const names = [
            '[Engagement] Орон сууцны байршлын давуу талыг хэрхэн тодорхойлох вэ? нийтлэл',
            'Elysium Residence | Messages | Зайсан | Намрын урамшуулал | Retargeting video viewers',
            '[ADV] Ухаалаг агаар сэлгэлттэй 3 өрөө байр — Лхагва гарагийн нээлттэй өдөрлөг',
            'Mandala Garden — 2 өрөө 1+1 урамшуулал, Хан-Уул дүүрэг, 2026 оны намар',
            'Mandala_Garden_Leads_Form_Autumn_2026_Lookalike_1pct_Ulaanbaatar_25-55',
            '[Reach] Elysium Residence брэнд таниулах видео, 25–55 нас, Улаанбаатар',
        ];
        const tags = ['calls', 'messages', 'thruplay', 'landing_page_views', 'leads', 'reach'];
        const base = metaApiReport({ data_to: range.to });
        const report = metaApiReport({
            data_to: range.to,
            breakdown: Array.from({ length: 22 }, (_, i) => ({ kind: 'campaign' as const, label: `${names[i % names.length]} #${i + 1}`, tag: tags[i % tags.length],
                values: { spend: 50 - i, impressions: 9000 - i * 100, link_clicks: 100 - i, results: tags[i % tags.length] === 'reach' ? null : 10 + i, cost_per_result: null } })),
            totals: base.totals,
        });
        const { text, xml } = await render(input({ kind: 'marketing', channels: withMeta(metaMatch(report, null)) }));
        const pages = xml.filter((_, index) => text[index].includes('Meta зар — кампанит ажлаар'));
        // Нэр бүр 2 мөр: толгой + ≤ 10 мөр нэг слайдад (5.15 инч), 22 мөр → 3 слайд.
        expect(pages).toHaveLength(3);
        const rows = pages.map(page => (page.match(/<a:tr /g) ?? []).length - 1);
        expect(rows.reduce((sum, n) => sum + n, 0)).toBe(22);
        for (const n of rows) expect(n).toBeLessThanOrEqual(10);
        expect(text.find(slideText => slideText.includes('Meta зар — кампанит ажлаар (1/3)'))).toContain('22 кампанит ажил');
        // Төрлийн нэр дагаваргүй: «Landing page view», «ThruPlay (видео үзэлт)».
        expect(text.join(' ')).toContain('Landing page view');
    });

    it('stat cards shrink a wide money value instead of wrapping it over the comparison line', async () => {
        const report = metaApiReport({ data_to: range.to, totals: { ...metaApiReport().totals, spend: 12345.67, cpm: 1.5 } });
        const { xml, text } = await render(input({ kind: 'marketing', channels: withMeta(metaMatch(report, { ...report.totals, spend: 11111.11 })) }));
        const summary = xml[text.findIndex(slideText => slideText.includes('Meta зар — долоо хоногийн тойм'))];
        // Утгын run-ий хэмжээ: `<a:t>утга</a:t>`-ийн өмнөх хамгийн сүүлийн sz.
        const size = (value: string) => Number([...summary.slice(0, summary.indexOf(`<a:t>${value}</a:t>`)).matchAll(/sz="(\d+)"/g)].at(-1)?.[1]);
        expect(size('12,345.67 USD')).toBeLessThan(2600);
        expect(size('12,345.67 USD')).toBeGreaterThanOrEqual(2000);
        // Нарийн утга хэвээр 26pt.
        expect(size('98,234')).toBe(2600);
    });

    it('marketing deck adds no Meta slides when the week has no Meta report', async () => {
        const none = { report: null, exact: false, longer: false, previous: null, comparison: null };
        const { text } = await render(input({ kind: 'marketing', channels: withMeta(none) }));
        expect(text.join(' ')).not.toContain('META ЗАР');
        const channelSlide = text.find(slideText => slideText.includes('Сувгийн экспорт'))!;
        expect(channelSlide).toContain('Экспорт оруулаагүй: Meta Ads Manager, Facebook хуудас, Масс SMS');
        expect(channelSlide).toContain('CallPro дуудлага');
    });

    it('marketing deck skips the Facebook slides when no Page is connected', async () => {
        const { text } = await render(input({ kind: 'marketing', social: { ...social(), page: null, metrics: [], posts: [] } }));
        expect(text.join(' ')).not.toContain('долоо хоногийн үзүүлэлт');
        expect(text.join(' ')).not.toContain('нийтэлсэн пост');
    });

    it('sales deck: undated ERP-born contracts make the week and month unknown, never zero', async () => {
        // Elysium: 77 гэрээ ERP-ийн байрны экспортоос үүссэн, гэрээ байгуулсан огноогүй; гэрээний экспорт ороогүй.
        const undatedOps = { ...buildOperationsReport({
            range, now: `${range.to}T10:00:00Z`, transactions: null, targets: [], viewings: [], leads: [],
            contracts: Array.from({ length: 77 }, (_, index) => ({ id: `e${index}`, contract_date: null, product_type: 'residential', total_price: null, contract_status: 'active', prepayment_paid_cash: null })),
        }), shopName: 'Elysium Residence' };
        const weekly = buildWeeklySales({ range, sales: null, previousSales: null, crmContracts: [], crmUndated: 77, inventory: null, monthTarget: 5350000000 });
        const { text } = await render(input({ sales: undatedOps, previousSales: undefined, weeklySales: weekly, monthSales: undefined, slides: [], updates: [], discussion: weeklyDiscussionItems({ sales: undatedOps }) }));
        const at = (needle: string) => text.find(slideText => slideText.includes(needle))!;
        expect(at('Энэ хурлаар шийдэх')).toContain('Огноогүй 77 гэрээ');
        const overview = at('Борлуулалтын тойм');
        expect(overview).toMatch(/Байгуулсан гэрээ — Огноогүй 77 гэрээ · ERP гэрээний экспорт хэрэгтэй/);
        expect(overview).toMatch(/Гэрээний бүртгэлтэй дүн — Огноогүй гэрээ дүнд ороогүй/);
        const plan = at('сарын төлөвлөгөө ба гүйцэтгэл');
        expect(plan).toMatch(/Гэрээний гүйцэтгэл — Огноогүй 77 гэрээ/);
        expect(plan).toMatch(/Гүйцэтгэлийн хувь — /);
        expect(plan).not.toContain('0%');
        expect(at('Энэ долоо хоногийн гэрээ')).toContain('Гэрээний тоо тодорхойгүй. 77 гэрээ байгуулсан огноогүй');
        const month = at('сарын гэрээ долоо хоногоор');
        expect(month).toContain('— / төлөвлөгөө 5.35 тэрбум ₮ · —');
        expect(month).toContain('Сарын гэрээний тоо тодорхойгүй');
        for (const slideText of text) expect(slideText).not.toMatch(/Байгуулсан гэрээ 0 |Тайлант долоо хоногт гэрээ бүртгэгдээгүй|Энэ сард гэрээ бүртгэгдээгүй/);
    });

    it('never prints missing amounts as zero and keeps missing images out of the slide', async () => {
        const { text, zip } = await render(input({ slides: [slide('s1', { part: 'sales', section: 'event', title: 'Зураггүй', image_paths: [media(9)] })], images: {}, budget: null, sales: undefined, previousSales: undefined }));
        const contracts = text.find(slideText => slideText.includes('Энэ долоо хоногийн гэрээ (1/2)'))!;
        expect(contracts).toContain('—');
        expect(text.join(' ')).toContain('Зураггүй');
        expect(Object.keys(zip.files).filter(name => name.startsWith('ppt/media/') && !name.endsWith('/'))).toEqual([]);
        const notes = await Promise.all(Object.keys(zip.files).filter(name => /notesSlide\d+\.xml$/.test(name)).map(name => zip.file(name)!.async('string')));
        expect(notes.join(' ')).toContain('1 зураг ачаалж чадсангүй');
    });

    it('marketing deck without a content plan says where to plan instead of inventing numbers', async () => {
        const { text } = await render(input({ kind: 'marketing', contentPlan: undefined }));
        expect(text.join(' ')).toContain('Контент календарь хэсэгт долоо хоногийн контентоо төлөвлөж');
    });

    it('names each file after the project, part and meeting date without path characters', () => {
        expect(weeklyDeckFileName('Mandala 360/365: Tower', '2026-10-14', 'sales')).toBe('Mandala 360 365 Tower - Борлуулалт - Лхагва 2026-10-14.pptx');
        expect(weeklyDeckFileName('Elysium', '2026-10-14', 'marketing')).toBe('Elysium - Маркетинг - Лхагва 2026-10-14.pptx');
    });
});
