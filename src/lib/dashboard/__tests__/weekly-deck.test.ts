// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { SaxesParser } from 'saxes';
import { buildWeeklyDeck, weeklyDeckFileName, type DeckImage, type WeeklyDeckInput } from '../weekly-deck';
import { buildWeeklySales } from '../weekly-sales';
import { buildOperationsReport } from '../operations-report';
import { buildBudgetOverview } from '@/lib/marketing/budget';
import { buildMarketingPerformance } from '@/lib/marketing/performance';
import type { ChannelReportMatches } from '@/lib/marketing/channel-reports-load';
import type { ErpProduct, ErpSale } from '@/lib/erp/records';
import type { WeeklySlide } from '../weekly-slides';

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
        meta_ads: { report: report('meta_ads', { spend: 300.38, currency: 'USD', reach: 270214, impressions: 483209, link_clicks: 800 }), exact: true, longer: false, previous: null,
            comparison: { spend: { current: 300.38, previous: 250, delta: 50.38, pct: 20.2, comparable: true } } },
        facebook_page: none,
        callpro: { report: report('callpro', { answered: 16, missed: 6, abandoned: 1, answer_rate: 66.7, selected: 24 }), exact: true, longer: false, previous: null, comparison: null },
        sms: none,
    } as unknown as ChannelReportMatches;
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
        projectName: 'Mandala 360&365 Tower', meetingDate, range, previousRange: { from: '2026-09-30', to: '2026-10-06' }, generatedAt: '2026.10.13 14:05',
        discussion: [{ title: 'Эзэнгүй 3 лид', detail: 'Хариуцах менежер, дараагийн алхмыг тогтоох.' }], notices: [],
        sales: operations(range.from, range.to), previousSales: operations('2026-09-30', '2026-10-06'), weeklySales: weeklySales(),
        budget: { year: 2026, month: 10, overview: buildBudgetOverview(Array(12).fill(10000000), Array.from({ length: 12 }, (_, i) => i < 10 ? 8000000 : 0), Array(12).fill(0)) },
        marketing: marketing(), channels: channels(),
        slides: [
            slide('s1', { section: 'social', title: 'Онцлох орон сууц: 201 мкв 5 өрөө', image_paths: [media(1), media(2)] }),
            slide('s2', { section: 'callpro', title: 'CallPro — алдсан дуудлага', image_paths: [media(3)], note: 'Алдсан дуудлага 12:00 болон 15:00–16:00 цагийн үед төвлөрч байна.' }),
            slide('s3', { section: 'social', title: 'Дахин идэвхжүүлсэн reel', image_paths: [media(4), media(4).replace('4.png', '5.png'), media(1)] }),
            slide('s5', { section: 'page', title: 'Пэйж хандалт', image_paths: [media(3), media(4), media(1), media(2)], note: 'Views: 676.8K, 3% өссөн — нийт хүрэлт тогтвортой, өндөр байна. Viewers: 191.1K, 1.2% өссөн. Content interactions: 278, 49.9% буурсан. Link clicks: 646, 155.3% өссөн. Дүгнэлт: контентын хүрэлт, үзсэн хугацаа болон органик үзэлт өссөн нь эерэг үзүүлэлт.' }),
            slide('s4', { part: 'sales', section: 'plan', title: 'Энэ сард хийгдэх ажлууд', note: '• Дулаан зогсоолуудыг гинжлэх\n• 1 давхрын орон сууцнуудыг сайжруулах' }),
        ],
        images,
        updates: [{ id: 'u1', user_id: user, author_name: 'Номин', meeting_date: meetingDate, achievements: 'Гурван гэрээ хийсэн.', blockers: 'Банкны зээлийн хариу удаж байна.', next_steps: 'Дахин холбогдох.', updated_at: `${range.to}T10:00:00Z` }],
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

describe('weekly meeting deck (.pptx)', () => {
    it('builds every section in meeting order with valid XML, including names with &', async () => {
        const { zip, xml, text } = await render(input());
        const parts = Object.keys(zip.files).filter(file => file.endsWith('.xml') || file.endsWith('.rels'));
        for (const [name, body] of await Promise.all(parts.map(async name => [name, await zip.file(name)!.async('string')] as const))) {
            const parser = new SaxesParser();
            expect(() => { parser.write(body); parser.close(); }, name).not.toThrow();
        }
        const layouts = await Promise.all(Object.keys(zip.files).filter(name => /slideLayout\d+\.xml$/.test(name)).map(name => zip.file(name)!.async('string')));
        expect(layouts.join(' ')).toContain('VERTMON HUB · Mandala 360&amp;365 Tower');
        expect(layouts.join(' ')).not.toContain('&amp;amp;');
        const all = text.join('\n');
        expect(text[0]).toContain('Mandala 360&amp;365 Tower');
        expect(all).toContain('Энэ хурлаар шийдэх');
        expect(all).toContain('Борлуулалтын тойм');
        expect(all).toContain('Энэ долоо хоногийн гэрээ (1/2)');
        expect(all).toContain('Энэ долоо хоногийн гэрээ (2/2)');
        expect(all).toContain('Орон сууцны үлдэгдэл — Б1 блок');
        expect(all).toContain('Орон сууцны үлдэгдэл — Б2 блок (1/2)');
        expect(all).toContain('Энэ сард хийгдэх ажлууд');
        expect(all).toContain('Маркетингийн үр дүн');
        expect(all).toContain('Сувгаар лид, гэрээлэлт, зардал');
        expect(all).toContain('Сувгийн экспорт, Meta API');
        expect(all).toContain('Экспорт оруулаагүй: Facebook хуудас, Масс SMS');
        expect(all).toContain('CallPro — алдсан дуудлага');
        expect(all).toContain('Алдсан дуудлага 12:00');
        expect(all).toContain('Анхаарал хандуулсанд баярлалаа');
        // Борлуулалтын нэмэлт слайд маркетингаас өмнө, хурлын явц төгсгөлд.
        const index = (needle: string) => text.findIndex(slideText => slideText.includes(needle));
        expect(index('Энэ сард хийгдэх ажлууд')).toBeLessThan(index('Маркетингийн үр дүн'));
        expect(index('Маркетингийн үр дүн')).toBeLessThan(index('Онцлох орон сууц'));
        expect(index('Банкны зээлийн хариу')).toBe(xml.length - 2);
        expect(Object.keys(zip.files).filter(name => name.startsWith('ppt/media/') && !name.endsWith('/')).length).toBeGreaterThanOrEqual(3);
    });

    it('never prints missing amounts as zero and keeps missing images out of the slide', async () => {
        const { text, zip } = await render(input({ slides: [slide('s1', { title: 'Зураггүй', image_paths: [media(9)] })], images: {}, budget: null, sales: undefined, previousSales: undefined }));
        const contracts = text.find(slideText => slideText.includes('Энэ долоо хоногийн гэрээ (1/2)'))!;
        expect(contracts).toContain('—');
        expect(text.join(' ')).toContain('Зураггүй');
        expect(Object.keys(zip.files).filter(name => name.startsWith('ppt/media/') && !name.endsWith('/'))).toEqual([]);
        const notes = await Promise.all(Object.keys(zip.files).filter(name => /notesSlide\d+\.xml$/.test(name)).map(name => zip.file(name)!.async('string')));
        expect(notes.join(' ')).toContain('1 зураг ачаалж чадсангүй');
    });

    it('names the file after the project and meeting date without path characters', () => {
        expect(weeklyDeckFileName('Mandala 360/365: Tower', '2026-10-14')).toBe('Mandala 360 365 Tower - Лхагва 2026-10-14.pptx');
    });
});
