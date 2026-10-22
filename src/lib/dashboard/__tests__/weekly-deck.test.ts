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
import { buildMonthlyPerformance, buildOperationsReport } from '../operations-report';
import { buildBudgetOverview } from '@/lib/marketing/budget';
import { buildMarketingPerformance } from '@/lib/marketing/performance';
import type { ChannelReportMatches } from '@/lib/marketing/channel-reports-load';
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

// M1 (c-plan-math): 10-р сард зөвхөн Б2-ийн гүйцэтгэлийг гараар 2,000,000,000 оруулсан; Б1, зогсоол системийнх,
// огноогүй Б1, Б2, зогсоолын гэрээтэй (доод хязгаар). Хадгалсан мөрийн нийт = оруулсан блокуудын нийлбэр.
const M1_TARGET = { year: 2026, month: 10, target_amount: 5_352_996_000, manual_contract_actual_amount: 2_000_000_000, block_amounts: {
    b1: { target_amount: 2_807_220_000 }, b2: { target_amount: 2_245_776_000, manual_contract_actual_amount: 2_000_000_000 }, parking: { target_amount: 300_000_000 },
} };
const M1_CONTRACTS = [
    ...[548_848_750, 548_848_750, 548_848_750, 548_848_750].map((total_price, index) => ({ id: `b2-${index}`, contract_date: '2026-10-1' + index, product_type: 'residential', block_name: 'Б2', total_price, contract_status: 'active', prepayment_paid_cash: null })),
    { id: 'p-1', contract_date: '2026-10-15', product_type: 'parking', block_name: 'Б1', total_price: 86_600_000, contract_status: 'active', prepayment_paid_cash: null },
    ...(['residential|Б1', 'residential|Б2', 'parking|Б1', 'industry|Б1'] as const).map((kind, index) => ({ id: `u-${index}`, contract_date: null,
        product_type: kind.split('|')[0], block_name: kind.split('|')[1], total_price: 400_000_000, contract_status: 'active', prepayment_paid_cash: null })),
];

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
        meta_ads: { report: report('meta_ads', { spend: 300.38, currency: 'USD', reach: 270214, impressions: 483209, link_clicks: 800 }), exact: true, longer: false, previous: null,
            comparison: { spend: { current: 300.38, previous: 250, delta: 50.38, pct: 20.2, comparable: true } } },
        facebook_page: none,
        callpro: { report: report('callpro', { answered: 16, missed: 6, abandoned: 1, answer_rate: 66.7, selected: 24 }), exact: true, longer: false, previous: null, comparison: null },
        sms: none,
    } as unknown as ChannelReportMatches;
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
            '24 давхрын 5 өрөөний reel', 'CallPro — алдсан дуудлага', 'Сувгийн экспорт, Meta API', 'Төсөв ба зарцуулалт', 'Дараагийн 7 хоногийн контент төлөвлөгөө',
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
        expect(overview).toMatch(/Байгуулсан гэрээ — Огноогүй 77 гэрээ · «Захиалга өгсөн огноо» оруулах/);
        expect(overview).toMatch(/Гэрээний бүртгэлтэй дүн — Огноогүй гэрээ дүнд ороогүй/);
        const plan = at('сарын төлөвлөгөө ба гүйцэтгэл');
        expect(plan).toMatch(/Гэрээний гүйцэтгэл — Огноогүй 77 гэрээ/);
        expect(plan).toMatch(/Гүйцэтгэлийн хувь — /);
        expect(plan).not.toContain('0%');
        expect(at('Энэ долоо хоногийн гэрээ')).toContain('Гэрээний тоо тодорхойгүй. 77 гэрээ захиалга өгсөн огноогүй');
        const month = at('сарын гэрээ долоо хоногоор');
        expect(month).toContain('— / төлөвлөгөө 5.35 тэрбум ₮ · —');
        expect(month).toContain('Сарын гэрээний тоо тодорхойгүй');
        for (const slideText of text) expect(slideText).not.toMatch(/Байгуулсан гэрээ 0 |Тайлант долоо хоногт гэрээ бүртгэгдээгүй|Энэ сард гэрээ бүртгэгдээгүй/);
    });

    it('sales deck: the month plan slide shows contract count plan, actual and attainment before the amounts', async () => {
        const month = { from: '2026-10-01', to: '2026-10-31' };
        const monthContracts = [{ id: 'c1', contract_date: month.from, product_type: 'residential', total_price: 286000000, contract_status: 'active', prepayment_paid_cash: 80000000 }];
        const monthSales = { ...operations(month.from, month.to), monthlyPerformance: buildMonthlyPerformance([{ year: 2026, month: 10,
            target_amount: 2500000000, contract_count_target: 100, manual_contract_count_actual: 100 }], month, true, monthContracts) };
        const { text } = await render(input({ monthSales }));
        const plan = text.find(slideText => slideText.includes('сарын төлөвлөгөө ба гүйцэтгэл'))!;
        expect(plan).toMatch(/Гэрээний тооны төлөвлөгөө 100 Гэрээний тооны гүйцэтгэл 100 Удирдлагын баталгаажуулсан Гүйцэтгэлийн хувь 100%/);
        expect(plan.indexOf('Гэрээний тооны төлөвлөгөө')).toBeLessThan(plan.indexOf('Гэрээний төлөвлөгөө'));
        // Without a manual count the month's CRM contracts stand in (the plan page rule), labelled by their source.
        const recorded = await render(input({ monthSales: { ...monthSales, monthlyPerformance: buildMonthlyPerformance([{ year: 2026, month: 10,
            target_amount: null, contract_count_target: 20 }], month, true, monthContracts) } }));
        const fallback = recorded.text.find(slideText => slideText.includes('сарын төлөвлөгөө ба гүйцэтгэл'))!;
        expect(fallback).toMatch(/Гэрээний тооны төлөвлөгөө 20 Гэрээний тооны гүйцэтгэл 1 CRM-ийн гэрээ Гүйцэтгэлийн хувь 5%/);
        // No month report at all: the weekly report's recorded contracts, labelled by their source.
        const weeklyOnly = await render(input({ monthSales: undefined }));
        expect(weeklyOnly.text.find(slideText => slideText.includes('сарын төлөвлөгөө ба гүйцэтгэл'))).toMatch(/Гэрээний тооны гүйцэтгэл 14 ERP-ийн гэрээ/);
    });

    it('sales deck: a partly entered block breakdown is resolved like the plan page (manual block + system blocks), not taken as the whole month', async () => {
        const month = { from: '2026-10-01', to: '2026-10-31' };
        const monthSales = { ...operations(month.from, month.to), monthlyPerformance: buildMonthlyPerformance([M1_TARGET], month, true, M1_CONTRACTS) };
        const { text } = await render(input({ monthSales }));
        const plan = text.find(slideText => slideText.includes('сарын төлөвлөгөө ба гүйцэтгэл'))!;
        expect(plan).toMatch(/Гэрээний гүйцэтгэл 2\.09 тэрбум ₮\+ Холимог: гар \+ CRM Гүйцэтгэлийн хувь 39%\+/);
        expect(plan).not.toMatch(/Гэрээний гүйцэтгэл 2 тэрбум ₮ Удирдлагын баталгаажуулсан/);
    });

    it('sales deck: totals of unknown paid amounts are a lower bound, and ERP cash is not divided by the month cash plan', async () => {
        const month = { from: '2026-10-01', to: '2026-10-31' };
        const monthSales = { ...operations(month.from, month.to), monthlyPerformance: buildMonthlyPerformance([{ year: 2026, month: 10,
            target_amount: 2500000000, cashflow_target_amount: 750000000 }], month, true, []) };
        const { text } = await render(input({ monthSales }));
        const contracts = text.filter(slideText => slideText.includes('Энэ долоо хоногийн гэрээ')).join(' ');
        // 14 гэрээний 5-ынх нь төлсөн дүн хоосон: 9 × 60 сая = 540 сая «+», хэзээ ч 0 биш; урьдчилгаа бүгд мэдэгдэнэ.
        expect(contracts).toContain('540,000,000₮+');
        expect(contracts).toContain('1,680,000,000₮');
        const plan = text.find(slideText => slideText.includes('сарын төлөвлөгөө ба гүйцэтгэл'))!;
        // 540 сая ₮ нь хоёр snapshot-ын хоорондох ERP зөрүү — сарын 750 сая ₮-ийн төлөвлөгөөтэй хувь гаргахгүй (72% биш).
        expect(plan).toMatch(/Орсон мөнгөний төлөвлөгөө 750 сая ₮ Орсон мөнгөний гүйцэтгэл 540 сая ₮ ERP зөрүү 2026\.10\.06 → 2026\.10\.13 Гүйцэтгэлийн хувь —/);
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

    it('sales deck: a 22-floor block fits one floor-map slide with three columns (reserved folded into for sale, barter labelled)', async () => {
        const units: ErpProduct[] = [];
        for (let floor = 2; floor <= 23; floor++) for (const model of ['E3', 'E4']) units.push({
            key: `u${floor}${model}`, code: `Б1-${floor}${model}`, block: 'Б1', floor, model, kind: 'residential', rooms: 3, area: 80.91, price: null,
            status: floor === 12 && model === 'E3' ? 'sold' : floor === 5 ? 'reserved' : floor === 15 && model === 'E4' ? 'ordered' : 'available',
            statusLabel: '', barter: floor === 15 && model === 'E4', manager: floor === 12 && model === 'E3' ? 'Ариунбилэг.Нямхүү' : null,
        });
        const report = buildWeeklySales({ range, sales: null, previousSales: null, crmContracts: [], monthTarget: null,
            inventory: { info: { date: '2026-10-22', source: 'HUB гэрээ + байрны бүртгэл', kind: 'contracts' }, rows: units } });
        expect(report.inventory!.floorMaps[0].totals).toEqual({ sold: 1, available: 42, barter: 1 });
        const { text } = await render(input({ weeklySales: report }));
        const maps = text.filter(slideText => slideText.includes('Орон сууцны үлдэгдэл'));
        expect(maps).toHaveLength(1);
        expect(maps[0]).not.toContain('(1/2)');
        expect(maps[0]).not.toContain('Бусад');
        for (const needle of ['23 давхар', '2 давхар', '80.91 м² Ариунбилэг', '80.91 м² Бартер', 'НИЙТ', 'Худалдаанд (захиалсан, хадгалсан орно)']) expect(maps[0]).toContain(needle);
    });

    it('names each file after the project, part and meeting date without path characters', () => {
        expect(weeklyDeckFileName('Mandala 360/365: Tower', '2026-10-14', 'sales')).toBe('Mandala 360 365 Tower - Борлуулалт - Лхагва 2026-10-14.pptx');
        expect(weeklyDeckFileName('Elysium', '2026-10-14', 'marketing')).toBe('Elysium - Маркетинг - Лхагва 2026-10-14.pptx');
    });
});
