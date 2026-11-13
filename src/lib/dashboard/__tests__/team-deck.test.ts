// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { SaxesParser } from 'saxes';
import { buildTeamDeck, teamDeckPeriod, wholePct, type TeamDeckInput } from '../team-deck';
import { BOTTOM, weeklyDeckFileName } from '../weekly-deck';
import { EMPTY_REPORT_BRANDING, hasReportBranding } from '../report-branding';
import { buildSalesActivity } from '../sales-activity';
import { DEFAULT_DAILY_REPORT_CONFIG } from '../daily-report';
import { activity, CASH_NUMBERS, elysiumFloorMaps, negotiations, plan, range, teamInput, weeklySales, workPlan } from './team-deck-fixture';
import { lineOverflows, slideTables, wordOverflows } from './table-layout';

async function render(deck: TeamDeckInput) {
    const pres = new PptxGenJS();
    buildTeamDeck(pres, deck);
    const buffer = await pres.write({ outputType: 'nodebuffer' }) as Buffer;
    if (process.env.TEAM_DECK_OUT) writeFileSync(process.env.TEAM_DECK_OUT, buffer);
    const zip = await JSZip.loadAsync(buffer);
    const byNumber = (pattern: RegExp) => Object.keys(zip.files).filter(name => pattern.test(name))
        .sort((a, b) => Number(a.match(/(\d+)\.xml/)![1]) - Number(b.match(/(\d+)\.xml/)![1]));
    const read = (names: string[]) => Promise.all(names.map(name => zip.file(name)!.async('string')));
    const xml = await read(byNumber(/^ppt\/slides\/slide\d+\.xml$/));
    const notes = await read(byNumber(/^ppt\/notesSlides\/notesSlide\d+\.xml$/));
    const texts = (part: string) => [...part.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(match => match[1]);
    return { zip, xml, notes: notes.map(part => texts(part).join(' ')), text: xml.map(part => texts(part).join(' ')) };
}

async function validXml(zip: JSZip) {
    const parts = Object.keys(zip.files).filter(file => file.endsWith('.xml') || file.endsWith('.rels'));
    for (const [name, body] of await Promise.all(parts.map(async name => [name, await zip.file(name)!.async('string')] as const))) {
        const parser = new SaxesParser();
        expect(() => { parser.write(body); parser.close(); }, name).not.toThrow();
    }
}

const at = (text: string[], needle: string) => {
    const found = text.find(slide => slide.includes(needle));
    expect(found, needle).toBeDefined();
    return found!;
};

describe('team-format Wednesday deck (.pptx)', () => {
    it('renders the team deck in order with well-formed XML', async () => {
        const { zip, text } = await render(teamInput());
        await validXml(zip);
        // Борлуулалтын албаны загварын (tailan jishee) 12 слайдын дараалал + хурлын хуудсанд гараар нэмсэн слайдууд.
        const order = [
            '2026 оны 10.14-10.20 хүртэлх тайлан',
            '10-Р САР ЗАХИАЛГЫН ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ',
            'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ',
            'Банкны зээлийн нөхцөл',
            '10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ',
            '2026 ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ',
            'БОРЛУУЛАЛТЫН АЛБА-ТООН МЭДЭЭЛЭЛ',
            'НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ',
            'ДАВХРЫН ЗУРАГЛАЛ — ЭЛИЗИУМ Б1 БЛОК', 'ДАВХРЫН ЗУРАГЛАЛ — ЭЛИЗИУМ Б2 БЛОК',
            'Нээлттэй хаалганы өдөр',
            '10-р сарын бусад ажлын төлөвлөгөө',
            'Анхаарал хандуулсанд баярлалаа.',
        ];
        const indexes = order.map(needle => text.findIndex(slide => slide.includes(needle)));
        for (const [i, index] of indexes.entries()) expect(index, order[i]).toBeGreaterThanOrEqual(0);
        expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
        // Загварын 12 слайд (тоон мэдээлэл 2, давхрын зураглал 2) + гараар нэмсэн 3: «Яригдаж буй гэрээ»-ний тайлбар, өдөрлөг,
        // гарчиггүй барилгын зураг. Блок тус бүрийн карт, «нэмэлт төлөвлөгөө» слайд байхгүй.
        expect(text).toHaveLength(15);
        const photoOnly = text[indexes[10] + 1];
        expect(photoOnly.trim()).toMatch(/^\d*$/); // зөвхөн слайдын дугаар
        // («Б1 БЛОК» давхрын зураглалын гарчигт хэвээр байгаа тул картын бусад гарчгаар шалгана.)
        for (const needle of ['ДУЛААН ЗОГСООЛ', 'НИЙТ ТӨЛӨВЛӨГӨӨ', 'НЭМЭЛТ ТӨЛӨВЛӨГӨӨ']) expect(text.join(' ')).not.toContain(needle);
        // Маркетингийн слайд, хуучин илтгэлийн хэсэг орохгүй.
        const all = text.join('\n');
        for (const needle of ['Маркетингийн пост', 'Энэ хурлаар шийдэх', 'Борлуулалтын тойм']) expect(all).not.toContain(needle);
        // «Энэ сард хийгдэх ажил» — мөр бүр цэг, гарчиггүй бол сарын гарчиг.
        const work = at(text, '10-р сарын бусад ажлын төлөвлөгөө');
        for (const needle of ['Showroom тохижуулах', 'Борлуулалтын оффис', 'Vertmon HUB хөгжүүлэлт']) expect(work).toContain(needle);
    });

    it('month plan: one table of blocks × metrics with full digits, whole percentages, the advance line and the stretch plan', async () => {
        const { text, xml } = await render(teamInput());
        const month = at(text, '10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ');
        expect(month).toContain('Блок Үзүүлэлт Нийт төлөвлөгөө Нийт гүйцэтгэл Гүйцэтгэл хувиар');
        expect(month).toContain('Б2 блок Тоо хэмжээ 4 4 100% Гэрээний дүн 2,245,776,000 2,195,395,000 98% Мөнгөн урсгал 673,732,800 161,844,800 24%');
        expect(wholePct(2_195_395_000, 2_245_776_000)).toBe('98%');
        // Б1-ийн мөнгөн урсгал тодорхойгүй → нийт нь доод хязгаар.
        expect(month).toContain('Нийт Тоо хэмжээ 14 7 50% Гэрээний дүн 5,352,996,000 3,410,026,000 64% Мөнгөн урсгал 1,605,898,800 187,824,800+ 12%+');
        expect(month).toContain('Энэ сарын гэрээний урьдчилгаа (орсон + хүлээгдэж буй): 966,606,250₮ (Б1 блок 282,007,750₮, Б2 блок 658,618,500₮, Зогсоол 25,980,000₮)');
        expect(month).toContain('Нэмэлт төлөвлөгөө: гэрээ 7,152,996,000₮ — биелэлт 48%; мөнгөн урсгал 2,145,898,800₮ — биелэлт 9%+');
        // Хувь мэдэгдэх нүд бүрт өнгөн дүүргэлт («—» нүдэнд байхгүй): 12 мөрөөс Б1-ийн мөнгөн урсгал тодорхойгүй.
        expect(bars(xml[text.indexOf(month)])).toHaveLength(11);
        const year = at(text, '2026 ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ');
        expect(year).toContain('Б2 блок Тоо хэмжээ 4 4 100%');
        expect(year).toMatch(/Гэрээний дүн 2,245,776,000 2,195,395,000 98%/);
        for (const needle of ['10-р сар', '1–10 сар', '2026 он', 'Нийт төлөвлөгөө', 'Гүйцэтгэл хувиар', 'Зогсоол', 'Мөнгөн урсгал']) expect(year).toContain(needle);
    });

    it('labels the year-to-date column by the plan\'s own range when exported before the reporting week ends in a new month', async () => {
        // Хурал 11-04 (7 хоног 10-28 – 11-03), 10-30-нд татсан: тайлангийн хүрээ 10-р сар хүртэл.
        const novRange = { from: '2026-10-28', to: '2026-11-03' };
        const report = plan();
        const { text } = await render(teamInput({ meetingDate: '2026-11-04', range: novRange, plan: { ...report, throughMonth: 10 } }));
        const year = at(text, '2026 ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ');
        expect(year).toContain('11-р сар');
        expect(year).toContain('1–10 сар');
        expect(year).not.toContain('1–11 сар');
    });

    it('marks the advance of the month «+» while undated contracts of that block may belong to the month', async () => {
        const { text, notes } = await render(teamInput({ plan: plan({ undated: true }) }));
        const month = at(text, '10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ');
        // Б2-ийн дүн гараар оруулсан ч урьдчилгаа системийн гэрээнээс — огноогүй Б2 гэрээ энэ сарынх байж болно.
        expect(month).toContain('Энэ сарын гэрээний урьдчилгаа (орсон + хүлээгдэж буй): 966,606,250₮+ (Б1 блок 282,007,750₮+, Б2 блок 658,618,500₮+, Зогсоол 25,980,000₮)');
        const note = notes[text.indexOf(month)];
        expect(note).toMatch(/Б2 блок: (?:(?!Зогсоол:).)*Энэ сарын урьдчилгаа доод хязгаар \(«\+»\): энэ сарынх байж болох огноогүй 1 гэрээ\./);
        expect(note).toContain('энэ сарынх байж болох огноогүй 2 гэрээ');
        expect(note.slice(note.indexOf('Зогсоол:'))).not.toContain('доод хязгаар («+»)');
        // Огноогүй гэрээгүй бол бүрэн дүн.
        const dated = await render(teamInput());
        expect(at(dated.text, '10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ')).toContain('(орсон + хүлээгдэж буй): 966,606,250₮ (Б1 блок 282,007,750₮, Б2 блок 658,618,500₮,');
    });

    it('month plan: the count row keeps the system count when only the amount was entered by hand', async () => {
        // Дүн гараар, тоо системийн (Б2-ийн 4 гэрээ): тоо, дүн тус тусын мөрөнд — нэгийг нөгөөгөөр орлуулахгүй.
        const { text } = await render(teamInput({ plan: plan({ manualCounts: false }) }));
        expect(at(text, '10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ')).toMatch(/Б2 блок Тоо хэмжээ \S+ 4 \S+ Гэрээний дүн 2,245,776,000 2,195,395,000 98%/);
    });

    it('prints «—» for unknown values and never «0₮»', async () => {
        const { text, notes } = await render(teamInput());
        const month = at(text, '10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ');
        expect(month).toContain('Б1 блок Тоо хэмжээ 5 2 40% Гэрээний дүн 2,807,220,000 1,128,031,000 40% Мөнгөн урсгал 842,166,000 — —');
        const activity = text.filter(slide => slide.includes('БОРЛУУЛАЛТЫН АЛБА-ТООН МЭДЭЭЛЭЛ')).join(' ');
        expect(activity).toMatch(/7786 Оператор Сарын төлөвлөгөө –\s+550 10\/20 хүртэл –\s+367 Гүйцэтгэл –\s+145 Гүйцэтгэл хувь –\s+40%/);
        expect(activity).toMatch(/Шинэ уулзалт Сарын төлөвлөгөө –\s+110 10\/20 хүртэл –\s+73 Гүйцэтгэл –\s+24\+ Гүйцэтгэл хувь –\s+—/);
        // Чат багийн загварт слайдгүй — тоо нь дуудлагын слайдын тэмдэглэлд, тодорхойгүй бол «—».
        expect(activity).not.toContain('Чат');
        expect(notes.join(' ')).toContain('Чат (Пэйж FB, Хувь чат) — слайдад гарахгүй: сарын эхнээс —, төлөвлөгөө оруулаагүй.');
        for (const slide of text) expect(slide).not.toMatch(/(^|[^\d,.])0₮/);
    });

    it('names the cash source in the notes: HUB «Нийт төлсөн дүн» with its date, or the manual entry', async () => {
        const { text, notes } = await render(teamInput({ plan: plan({ hubPaid: true }) }));
        const month = at(text, '10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ');
        expect(month).toContain('Б1 блок Тоо хэмжээ 5 2 40% Гэрээний дүн 2,807,220,000 1,128,031,000 40% Мөнгөн урсгал 842,166,000 282,007,750 33%');
        const note = notes[text.indexOf(month)];
        expect(note).toMatch(/Б1 блок: (?:(?!Б2 блок:).)*Мөнгөн урсгалын гүйцэтгэл: HUB файлын «Нийт төлсөн дүн» \(2026-10-20-ний байдлаар\)/);
        expect(note).toMatch(/Б2 блок: (?:(?!Зогсоол:).)*Мөнгөн урсгалын гүйцэтгэл: удирдлагын гараар оруулсан дүн\./);
        expect(note).toContain('Мөнгөн урсгалын гүйцэтгэл: гараар оруулсан блок + бусад блок — HUB файлын «Нийт төлсөн дүн»');
        // Урьдчилгааны мэдээлэл мөнгөн урсгалд нэмэгдэхгүй.
        expect(month).toMatch(/Нийт Тоо хэмжээ 14 7 50% Гэрээний дүн [\d,]+ [\d,]+ 64% Мөнгөн урсгал 1,605,898,800 469,832,550 29%/);
    });

    it('shows no cash numbers anywhere when cash is hidden', async () => {
        const { zip, text } = await render(teamInput({ plan: plan({ cashHidden: true }) }));
        const parts = await Promise.all(Object.keys(zip.files).filter(name => name.endsWith('.xml')).map(name => zip.file(name)!.async('string')));
        for (const number of CASH_NUMBERS) expect(parts.join(' '), number).not.toContain(number);
        const month = at(text, '10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ');
        expect(month).toContain('Мөнгөн урсгалыг санхүүгийн эрхтэй ажилтан харна.');
        expect(month).not.toMatch(/Мөнгөн урсгал(?!ыг)/i);
        // Гэрээний тоо, дүн, урьдчилгааны мэдээлэл, нэмэлт төлөвлөгөөний гэрээний хэсэг хэвээр.
        expect(month).toContain('Б2 блок Тоо хэмжээ 4 4 100% Гэрээний дүн 2,245,776,000 2,195,395,000 98% Зогсоол');
        expect(month).toContain('Энэ сарын гэрээний урьдчилгаа (орсон + хүлээгдэж буй): 966,606,250₮');
        expect(month).toMatch(/Нэмэлт төлөвлөгөө: гэрээ 7,152,996,000₮ — биелэлт 48% Мөнгөн урсгалыг/);
        expect(at(text, '2026 ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ')).not.toContain('Мөнгөн урсгал');
    });

    it('month plan: no stretch line without a stretch plan, and only the contract part without a stretch cash plan', async () => {
        const none = await render(teamInput({ plan: plan({ stretch: false }) }));
        expect(none.text.join(' ')).not.toContain('Нэмэлт төлөвлөгөө:');
        expect(none.notes.join(' ')).not.toContain('Нэмэлт төлөвлөгөө —');
        expect(none.text.join(' ')).toContain('10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ');
        const report = plan();
        const months = [...report.months];
        months[9] = { ...months[9], stretch: { ...months[9].stretch, cashflow: null } };
        const contractOnly = at((await render(teamInput({ plan: { ...report, months } }))).text, '10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ');
        expect(contractOnly).toMatch(/Нэмэлт төлөвлөгөө: гэрээ 7,152,996,000₮ — биелэлт 48% \d+$/);
    });

    it('negotiations: empty state, and a «Нийт» row with lower bounds when prices are missing', async () => {
        const empty = await render(teamInput({ negotiations: negotiations(true) }));
        expect(at(empty.text, 'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ')).toContain('Ярилцаж буй гэрээ алга.');
        const { text, notes } = await render(teamInput());
        const slide = at(text, 'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ');
        for (const head of ['Д/д', 'Блок', 'Өрөөний тоо', 'Давхар', 'м.кв', 'Урьдчилгаа хувь', 'Мкв үнэ', 'Нийт үнэ', 'Урьдчилгаа', 'Урьдчилгаа нөхцөл', 'Сэжим']) expect(slide).toContain(head);
        expect(slide).toMatch(/1 Б2 2 12 57\.87 10-30% 5,400,000₮ 312,498,000₮ 93,749,400₮ — Инстаграм/);
        expect(slide).toMatch(/2 Б1 3 7 89\.73 10-30% — — — — —/);
        expect(slide).toMatch(/Нийт \(2\) 147\.6 312,498,000₮\+ 93,749,400₮\+/);
        const note = notes[text.indexOf(slide)];
        expect(note).toContain('өнөөдрийн үнээр');
        expect(note).toContain('«Урьдчилгаа нөхцөл» тодорхойлогдоогүй');
    });

    it('month contracts: parking and residential tables with «Нийт», other kinds in the notes', async () => {
        const { text, notes } = await render(teamInput());
        const slide = at(text, '10-Р САР ЗАХИАЛГЫН ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ');
        expect(slide.indexOf('Дулаан зогсоол')).toBeLessThan(slide.indexOf('Орон сууц'));
        expect(slide).toMatch(/Д\/д Менежер Тоот Талбай Нэр Урьдчилгаа хувь Нийт үнэ Урьдчилгаа Хүлээгдэж буй 1 Хонгорзул А1-013 12\.5 Б\.Мэндбаяр 30% 86,600,000₮ 25,980,000₮ — Нийт 12\.5 86,600,000₮ 25,980,000₮ —/);
        expect(slide).toMatch(/Д\/д Менежер Өрөө Блок Давхар Талбай Нэр Урьдчилгаа хувь Мкв үнэ Нийт үнэ Урьдчилгаа Сэжим/);
        expect(slide).toMatch(/1 Хонгорзул 2 өрөө Б2 12 57\.87 Б\.Мэндбаяр 30% 5,400,000₮ 312,498,000₮ 93,749,400₮ Инстаграм/);
        // Захиалагчийн нэргүй мөр «—», урьдчилгаагүй мөрийн нийлбэр доод хязгаар.
        expect(slide).toMatch(/3 өрөө Б2 14 89\.73 — 10-30%/);
        expect(slide).toMatch(/Нийт 205\.47 1,109,538,000₮ 239,112,000₮\+/);
        expect(slide).not.toContain('Агуулах');
        const note = notes[text.indexOf(slide)];
        expect(note).toContain('Нөхцлөөр төлөх урьдчилгаа — орсон мөнгө биш');
        expect(note).toContain('Хүснэгтэд ороогүй: Агуулах 1 гэрээ (10,700,000₮)');
    });

    // Эзэмшигчийн шийдвэр 2026-11-13: «Урьдчилгаа» = ERP-ийн «Нийт төлсөн дүн» (санхүүгийн эрхтэйд, HUB файлаас).
    it('month contracts: «Урьдчилгаа» shows the ERP paid amount per contract — a real 0 stays 0, unknown is «—», the total is a lower bound', async () => {
        const paid = { asOf: '2026-10-20', byContract: { 'А1-013': 25_980_000, 'Б2-1201': 0, 'Б2-1402': null } as Record<string, number | null> };
        const { text, notes } = await render(teamInput({ plan: { ...plan(), contractPaid: paid } }));
        const slide = at(text, '10-Р САР ЗАХИАЛГЫН ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ');
        expect(slide).toMatch(/1 Хонгорзул А1-013 12\.5 Б\.Мэндбаяр 30% 86,600,000₮ 25,980,000₮ — Нийт 12\.5 86,600,000₮ 25,980,000₮/);
        // Б2-1201: файлд 0 төлсөн (мэдэгдэж буй) — нөхцлөөр төлөх 93,749,400₮ биш.
        expect(slide).toMatch(/1 Хонгорзул 2 өрөө Б2 12 57\.87 Б\.Мэндбаяр 30% 5,400,000₮ 312,498,000₮ 0₮ Инстаграм/);
        expect(slide).not.toContain('93,749,400₮');
        // Б2-1402 файлын мөрөнд дүн хоосон, Б1-0703 файлд тулгагдаагүй — «—»; нийлбэр доод хязгаар.
        expect(slide).toMatch(/3 өрөө Б2 14 89\.73 — 10-30% [\d,]+₮ 484,542,000₮ — Ойрхон амьдардаг/);
        expect(slide).toMatch(/Нийт 205\.47 1,109,538,000₮ 0₮\+/);
        const note = notes[text.indexOf(slide)];
        expect(note).toContain('«Урьдчилгаа» — ERP-ийн «Нийт төлсөн дүн» (HUB гэрээний жагсаалт, 2026-10-20-ний файлаар)');
        expect(note).not.toContain('орсон мөнгө биш');
    });

    it('month contracts: without finance access or a paid file the column stays the advance due and the note says so', async () => {
        const noFinance = await render(teamInput({ plan: { ...plan({ cashHidden: true }), contractPaid: { asOf: '2026-10-20', byContract: { 'А1-013': 1 } } } }));
        const hidden = at(noFinance.text, '10-Р САР ЗАХИАЛГЫН ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ');
        expect(hidden).toContain('86,600,000₮ 25,980,000₮ —');
        expect(hidden).toContain('93,749,400₮');
        expect(noFinance.notes[noFinance.text.indexOf(hidden)]).toContain('Нөхцлөөр төлөх урьдчилгаа — орсон мөнгө биш (W7). Орсон мөнгийг (ERP-ийн «Нийт төлсөн дүн») санхүүгийн эрхтэй хэрэглэгчийн татсан илтгэл харуулна.');
        const noFile = await render(teamInput());
        expect(noFile.notes[noFile.text.indexOf(at(noFile.text, '10-Р САР ЗАХИАЛГЫН ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ'))]).toContain('ERP-ийн «Нийт төлсөн дүн»-тэй HUB файл оруулбал орсон мөнгө гарна.');
    });

    it('month contracts: a long month splits each table over pages with «Нийт» on the last page', async () => {
        const report = weeklySales();
        const residential = report.month.lines.find(line => line.kind === 'residential')!;
        const lines = Array.from({ length: 14 }, (_, index) => ({ ...residential, key: `Б2-${index}`, unit: `Б2-${index}` }));
        const { text, notes } = await render(teamInput({ weeklySales: { ...report, month: { ...report.month, lines } } }));
        const pages = text.filter(slide => slide.includes('ЗАХИАЛГЫН ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ'));
        expect(pages).toHaveLength(2);
        expect(pages[0]).toContain('10-Р САР ЗАХИАЛГЫН ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ (1/2)');
        expect(pages[0]).toContain('Орон сууц · 2026.10.01 – 2026.10.20 · 14 гэрээ');
        expect(pages[0]).not.toMatch(/Нийт \d/);
        expect(pages[1]).toMatch(/Нийт 810\.18 4,374,972,000₮ 1,312,491,600₮/);
        expect(notes[text.indexOf(pages[1])]).toContain('Дулаан зогсоол: Энэ сард гэрээ бүртгэгдээгүй.');
    });

    // Борлуулалтын багийн загвар (2026-11-12): график биш хүснэгт; хувийн нүдийг өнгөөр дүүргэнэ (Excel-ийн data bar).
    const bars = (part: string) => [...part.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map(match => match[0])
        .filter(shape => shape.includes('<a:srgbClr val="BBD0FB"/>')).map(shape => Number(shape.match(/<a:ext cx="(\d+)"/)![1]));

    it('activity: two table slides (calls, meetings) with month lines, weekly plan = month ÷ 4 and a bar per known percentage', async () => {
        const { zip, xml, text } = await render(teamInput());
        expect(Object.keys(zip.files).filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name))).toEqual([]);
        const slides = text.filter(slide => slide.includes('БОРЛУУЛАЛТЫН АЛБА-ТООН МЭДЭЭЛЭЛ'));
        expect(slides).toHaveLength(2);
        const [calls, meetings] = slides;
        expect(calls).toContain('Дуудлага · сарын эхнээс 2026.10.01 – 2026.10.20');
        expect(meetings).toContain('Уулзалт · сарын эхнээс 2026.10.01 – 2026.10.20');
        expect(calls).toMatch(/7786 Оператор Сарын төлөвлөгөө –\s+550 10\/20 хүртэл –\s+367 Гүйцэтгэл –\s+145 Гүйцэтгэл хувь –\s+40%/);
        expect(calls).toContain('7 хоног Төлөвлөгөө Гүйцэтгэл Хувь');
        // 550 ÷ 4 = 138; 53 / 138 = 38%. Менежерийн шугам 300 ÷ 4 = 75; 65 / 75 = 87%.
        expect(calls).toContain('10/07–10/13 138 40 29% 10/14–10/20 138 53 38%');
        expect(calls).toContain('10/14–10/20 75 65 87%');
        // Тоо оруулаагүй 7 хоног «—» (0 биш). Чат багийн загварт алга — слайдад гарахгүй.
        expect(calls).toContain('09/23–09/29 138 — —');
        expect(calls).not.toContain('Чат');
        expect(meetings).toMatch(/Давтан уулзалт Сарын төлөвлөгөө –\s+30 10\/20 хүртэл –\s+20 Гүйцэтгэл –\s+4 Гүйцэтгэл хувь –\s+20%/);
        expect(meetings).toContain('10/07–10/13 8 1 13% 10/14–10/20 8 3 38%');

        // Дүүргэлт: хувь мэдэгдэх мөр бүрт нэг, урт нь хувьтай пропорциональ (29% : 38% : 87%).
        const callBars = bars(xml[text.indexOf(calls)]);
        expect(callBars).toHaveLength(3);
        expect(callBars[0] / callBars[1]).toBeCloseTo(29 / 38, 2);
        expect(callBars[1] / callBars[2]).toBeCloseTo(38 / 87, 2);
        expect(bars(xml[text.indexOf(meetings)])).toHaveLength(5);
    });

    it('activity: a real 0 stays 0, a lower bound is «N+» with «%+», and a bar never exceeds its cell', async () => {
        const report = activity();
        // 10/14–10/20-ны менежерийн шугам 0 (оруулсан); 7786-ийн 10/14–10/20 төлөвлөгөөнөөс давсан.
        report.buckets = report.buckets.map(bucket => bucket.label === '10/14–10/20' ? { ...bucket, values: { ...bucket.values, managerLine: 0, hotline: 400 } } : bucket);
        const { xml, text } = await render(teamInput({ activity: report }));
        const [calls, meetings] = text.filter(slide => slide.includes('ТООН МЭДЭЭЛЭЛ'));
        expect(calls).toContain('10/14–10/20 75 0 0%');
        expect(calls).toContain('10/14–10/20 138 400 290%');
        // 10/01–10/06-ны шинэ уулзалт (бүртгэл 10/05-нд эхэлсэн) доод хязгаар.
        expect(meetings).toContain('10/01–10/06 28 2+ 7%+');
        // 0%-д дүүргэлтгүй; 290% нь 100%-ийн өргөнөөр (29%-ийн мөртэй харьцуулахад 100 : 29).
        const callBars = bars(xml[text.indexOf(calls)]);
        expect(callBars).toHaveLength(2);
        expect(callBars[1] / callBars[0]).toBeCloseTo(100 / 29, 1);
    });

    it('activity «N+» notes name the source that started mid-period: daily-report counts, not meeting records (prod 10-28 deck)', async () => {
        // Өдрийн тайлангийн тоо 10-08-нд эхэлсэн, уулзалтын бүртгэл 09-01-ээс бүрэн: «N+» нь зөвхөн дуудлага, чат.
        const cell = (report_date: string, metric: string, value: number) => ({ report_date, manager_name: 'Хонгорзул', metric, value });
        const report = buildSalesActivity({
            meetingDate: '2026-10-21', config: DEFAULT_DAILY_REPORT_CONFIG, configSaved: true, configInvalid: false,
            counts: [
                cell('2026-10-08', 'call.l1.total', 12), cell('2026-10-09', 'call.personal.total', 7), cell('2026-10-09', 'chat.page', 4),
                cell('2026-10-15', 'call.l1.total', 20), cell('2026-10-15', 'chat.page', 6),
            ],
            confirmedDates: [], meetings: [{ day: '2026-10-02', type: 'new_customer' }, { day: '2026-10-09', type: 'new_customer' }, { day: '2026-10-16', type: 'repeat_customer' }],
            meetingsSince: '2026-09-01', countsSince: '2026-10-08', targets: null, targetsAvailable: true,
        });
        const { text, notes } = await render(teamInput({ activity: report }));
        const [calls, meetings] = text.filter(slide => slide.includes('ТООН МЭДЭЭЛЭЛ'));
        expect(calls).toContain('10/07–10/13 — 12+ —');
        const note = notes[text.indexOf(calls)];
        expect(note).toContain('«N+» — өдрийн тайлангийн тоо хугацааны дунд эхэлсэн тул доод хязгаар (Төслийн утас, Менежерийн дуудлага)');
        expect(note).not.toContain('уулзалтын бүртгэл хугацааны дунд');
        // Эхэлсэн өдрийг тайлангийн өөрийн тэмдэглэл нэрлэнэ.
        expect(note).toContain('Өдрийн тайлангийн тоо 2026-10-08-нээс эхэлсэн');
        expect(notes[text.indexOf(meetings)]).not.toContain('«N+» —');

        // Хоёулаа дунд нь эхэлсэн бол слайд тус бүр өөрийн эх сурвалжийг нэрлэнэ.
        const both = activity();
        both.buckets = both.buckets.map(bucket => bucket.label === '10/07–10/13' ? { ...bucket, partial: { ...bucket.partial, hotline: true } } : bucket);
        const mixed = await render(teamInput({ activity: both }));
        const [mixedCalls, mixedMeetings] = mixed.text.filter(slide => slide.includes('ТООН МЭДЭЭЛЭЛ'));
        expect(mixedCalls).toContain('10/07–10/13 138 40+ 29%+');
        expect(mixed.notes[mixed.text.indexOf(mixedCalls)]).toContain('«N+» — өдрийн тайлангийн тоо хугацааны дунд эхэлсэн тул доод хязгаар (7786 Оператор)');
        expect(mixed.notes[mixed.text.indexOf(mixedMeetings)]).toContain('«N+» — уулзалтын бүртгэл хугацааны дунд эхэлсэн тул доод хязгаар (Шинэ уулзалт)');
    });

    it('meetings: interest by area band per week, the referral and both payment-term tables', async () => {
        const { text, notes } = await render(teamInput());
        const meetings = at(text, 'НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ');
        expect(meetings).toContain('Уулзалт Үйлчилгээ 51–64 м² 80 м² 81/85 м² 89 м² 102/138 м² Сонголтгүй Нийт');
        // Бүртгэл эхлэхээс өмнөх 7 хоног тодорхойгүй (9-р слайдтай нэг дүрэм) — мөр бүхэлдээ «—», 0 биш.
        expect(meetings).toContain('09/23–09/29 — — — — — — — —');
        // Тоогүй бүлэг хоосон нүд: 51–64 = 2, 89 = 6, сонголтгүй 1, нийт 9.
        expect(meetings).toContain('10/14–10/20 2 6 1 9');
        expect(meetings).toContain('Сэжим (хаанаас ирсэн) — шинэ уулзалт Сэжим Уулзалт Ойрхон амьдардаг 5 Сошиал медиа 3 Мандала Гарден ОС 2 Тодорхойгүй 2 Нийт 12');
        expect(meetings).toContain('Урьдчилгаа төлбөрийн нөхцөл Нөхцөл Уулзалт Бэлэн 5 Бартер 1 Урьдчилгаа хуваах 1 Тодорхойгүй 2 Нийт 9');
        expect(meetings).toContain('Үлдэгдэл төлбөрийн нөхцөл Нөхцөл Уулзалт Ипотек 1 Энгийн зээл 5 Хувь лизинг 1 Бэлэн 0 Тодорхойгүй 2 Нийт 9');
        const note = notes[text.indexOf(meetings)];
        expect(note).toContain('блок хамаарахгүй');
        expect(note).toContain('Сонирхол — мөнгө биш');
    });

    it('meetings: a fully recorded empty week shows 0, a straddling week is a lower bound «N+», extra bands appear only with data', async () => {
        const base = teamInput();
        const weeks = base.meetings!.weeks.map((week, index) => index === 0 ? { ...week, coverage: 'full' as const }
            : index === 1 ? { ...week, coverage: 'partial' as const, byBand: { ...week.byBand, 'cat:parking': 1 } } : week);
        const bands = [...base.meetings!.bands, { key: 'cat:parking', label: 'Зогсоол' }];
        const { text } = await render(teamInput({ meetings: { ...base.meetings!, weeks, bands } }));
        const meetings = at(text, 'НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ');
        expect(meetings).toContain('102/138 м² Зогсоол Сонголтгүй Нийт');
        // Бүрэн бүртгэлтэй, уулзалтгүй 7 хоног: нүд хоосон, нийт 0.
        expect(meetings).toContain('09/23–09/29 0 09/30–10/06');
        expect(meetings).toContain(`${weeks[1].label} 2 4 1 1 ${weeks[1].total}+`);
    });

    it('year plan table: a bar behind every known percentage, none behind «—»', async () => {
        const { xml, text } = await render(teamInput());
        const year = xml[text.indexOf(at(text, 'ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ'))];
        const known = (at(text, 'ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ').match(/\d+%\+?/g) ?? []).filter(value => !/^0%/.test(value)).length;
        expect(known).toBeGreaterThan(0);
        expect(bars(year)).toHaveLength(known);
    });

    // Сарын ажлын төлөвлөгөө (борлуулалтын багийн хүсэлт 2026-11-12): Hub-ийн жагсаалт — хариуцагчийн нэрийн эхний үсэг, хийгдсэн ✓.
    it('work plan: lists the Hub items with a ✓ and assignee initials, then the text slides of the plan section', async () => {
        const { text, notes } = await render(teamInput({ workPlan: workPlan() }));
        const slides = text.filter(slide => slide.includes('10-р сарын бусад ажлын төлөвлөгөө'));
        // Жагсаалтын слайд + «Энэ сард хийгдэх ажил» сэдвийн нэмэлт слайд.
        expect(slides).toHaveLength(2);
        expect(slides[0]).toContain('Хийгдсэн 1/3 · хариуцагч — нэрийн эхний үсгээр');
        expect(slides[0]).toContain('Ажил Хариуцагч ✓ Showroom тохижуулах Ч, Х Төлөвлөлтийн санал өгөх А, Х, Ч Хаалганд tag байршуулах —');
        expect(notes[text.indexOf(slides[0])]).toContain('Хариуцагч: А = Ариунбилэг.Бат, Х = Хонгорзул.Мөнхгэрэл, Ч = Чанцалдулам.Раднаа.');
        expect(slides[1]).toContain('Vertmon HUB хөгжүүлэлт');
    });

    it('work plan: without Hub items the text slides stand alone, and with neither it says where to add them', async () => {
        const fallback = await render(teamInput({ workPlan: { ...workPlan(), items: [] } }));
        expect(fallback.text.filter(slide => slide.includes('10-р сарын бусад ажлын төлөвлөгөө'))).toHaveLength(1);
        const empty = await render(teamInput({ workPlan: { ...workPlan(), items: [] }, slides: [] }));
        expect(at(empty.text, '10-р сарын бусад ажлын төлөвлөгөө')).toContain('Хурлын хуудасны «Сарын ажлын төлөвлөгөө» хэсэгт ажлаа нэмж, хариуцагчийг нь сонгоно.');
        // Жагсаалтыг ачаалж чадаагүй бол шалтгаан тэмдэглэлд.
        const failed = await render(teamInput({ workPlan: null, slides: [], failed: { workPlan: 'Түр боломжгүй' } }));
        expect(failed.notes[failed.text.indexOf(at(failed.text, '10-р сарын бусад ажлын төлөвлөгөө'))]).toContain('Сарын ажлын төлөвлөгөө: Түр боломжгүй.');
    });

    it('work plan: a long list continues on a second slide', async () => {
        const base = workPlan();
        const items = Array.from({ length: 15 }, (_, index) => ({ ...base.items[1], id: `item-${index}`, title: `Ажил ${index + 1}` }));
        const { text } = await render(teamInput({ workPlan: { ...base, items }, slides: [] }));
        const slides = text.filter(slide => slide.includes('10-р сарын бусад ажлын төлөвлөгөө'));
        expect(slides).toHaveLength(2);
        expect(slides[0]).toContain('(1/2)');
        expect(slides[1]).toContain('Ажил 15');
    });

    it('negotiations exported after the meeting say on the slide that the list and prices are as of the export day', async () => {
        const fresh = await render(teamInput());
        expect(at(fresh.text, 'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ')).toContain('2 лид · үнэ 2026.10.21-ний байдлаар');
        const late = await render(teamInput({ negotiations: { ...negotiations(), asOf: '2026-10-23' } }));
        const slide = at(late.text, 'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ');
        expect(slide).toContain('2 лид · 2026.10.23-ний төлөв, үнээр — хурлын (2026.10.21) дараа татсан');
        expect(late.notes[late.text.indexOf(slide)]).toContain('Ярилцаж буй гэрээний жагсаалт түүхгүй: хурлын өдрийн (2026.10.21) биш, татсан өдрийн (2026.10.23) төлөв, үнээр');
        const empty = await render(teamInput({ negotiations: { ...negotiations(true), asOf: '2026-10-23' } }));
        expect(at(empty.text, 'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ')).toContain('хурлын (2026.10.21) дараа татсан');
    });

    it('uses the branding footer, cover image and logo; falls back to the project name and «ВЕРТМОН ПРОПЕРТИС»', async () => {
        const branded = await render(teamInput());
        const layouts = await Promise.all(Object.keys(branded.zip.files).filter(name => /slideLayout\d+\.xml$/.test(name)).map(name => branded.zip.file(name)!.async('string')));
        expect(layouts.join(' ')).toContain('ВЕРТМОН ПРОПЕРТИС ХХК');
        expect(branded.text[0]).toContain(teamDeckPeriod(range));
        expect(branded.text[0]).toBe('2026 оны 10.14-10.20 хүртэлх тайлан');
        // Нүүрний зураг (тайрч багтаасан) + лого; төгсгөлд лого.
        expect(branded.xml[0].match(/<p:pic>/g)).toHaveLength(2);
        // 4:3 зургийг 16:9 нүүрэнд дүүргэхдээ дээд, доод талаас тайрна.
        const crop = branded.xml[0].match(/<a:srcRect l="(\d+)" r="(\d+)" t="(\d+)" b="(\d+)"\/>/)!;
        expect(crop.slice(1).map(Number)).toEqual([0, 0, 12499, 12499]);
        expect(branded.xml.at(-1)!.match(/<p:pic>/g)).toHaveLength(1);
        expect(branded.text.at(-1)).toContain('ЭЛИЗИУМ · 2026 оны 10.14-10.20 хүртэлх тайлан');

        const plain = await render(teamInput({ branding: null, coverImage: null, logo: null }));
        const plainLayouts = await Promise.all(Object.keys(plain.zip.files).filter(name => /slideLayout\d+\.xml$/.test(name)).map(name => plain.zip.file(name)!.async('string')));
        expect(plainLayouts.join(' ')).toContain('ВЕРТМОН ПРОПЕРТИС');
        expect(plainLayouts.join(' ')).not.toContain('ХХК');
        expect(plain.text[0]).toBe('Elysium Residence 2026 оны 10.14-10.20 хүртэлх тайлан');
        expect(plain.xml[0]).not.toContain('<p:pic>');
        expect(at(plain.text, 'ДАВХРЫН ЗУРАГЛАЛ — ELYSIUM RESIDENCE Б1 БЛОК')).toBeTruthy();
    });

    it('the cover note says the branding is not configured for an unsaved project (all-null branding row), not only for a failed read', async () => {
        const UNSET = 'Илтгэлийн брэнд (нүүрний зураг, лого, хөл бичвэр) тохируулаагүй эсвэл уншиж чадаагүй — анхдагч загвар.';
        // Хадгалаагүй төсөлд GET `available: true` + бүх талбар null ирдэг (`readReportBranding`).
        const unsaved = await render(teamInput({ branding: { ...EMPTY_REPORT_BRANDING }, coverImage: null, logo: null }));
        expect(unsaved.notes[0]).toContain(UNSET);
        expect(unsaved.text[0]).toBe('Elysium Residence 2026 оны 10.14-10.20 хүртэлх тайлан');
        const blank = await render(teamInput({ branding: { ...EMPTY_REPORT_BRANDING, displayName: '  ', footerText: '', updatedAt: '2026-10-20T10:00:00Z' }, coverImage: null, logo: null }));
        expect(blank.notes[0]).toContain(UNSET);
        expect((await render(teamInput({ branding: null, coverImage: null, logo: null }))).notes[0]).toContain(UNSET);
        // Аль нэг талбар (зөвхөн хөл бичвэр ч) тохируулсан бол тэмдэглэлгүй.
        expect((await render(teamInput())).notes[0]).not.toContain('тохируулаагүй');
        const footerOnly = await render(teamInput({ branding: { ...EMPTY_REPORT_BRANDING, footerText: 'ВЕРТМОН ПРОПЕРТИС ХХК' }, coverImage: null, logo: null }));
        expect(footerOnly.notes[0]).not.toContain('тохируулаагүй');
        expect(hasReportBranding(null)).toBe(false);
        expect(hasReportBranding({ ...EMPTY_REPORT_BRANDING, logoPath: 'branding/x/y.png' })).toBe(true);
    });

    it('a failed source shows «мэдээлэл ачаалж чадсангүй» on its slides and keeps the rest', async () => {
        const { text, notes } = await render(teamInput({
            plan: null, activity: null, weeklySales: null,
            failed: { plan: 'Хүсэлт амжилтгүй (500)', activity: 'Өдрийн тайлангийн хүснэгт алга', weeklySales: 'долоо хоногийн тайлан ачаалагдаагүй' },
        }));
        for (const title of ['САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ', 'ТООН МЭДЭЭЛЭЛ', 'ЗАХИАЛГЫН ГЭРЭЭНИЙ', 'ДАВХРЫН ЗУРАГЛАЛ', 'ОНЫ БОРЛУУЛАЛТЫН']) {
            expect(at(text, title)).toContain('Мэдээлэл ачаалж чадсангүй.');
        }
        expect(text.join(' ')).not.toContain('Нэмэлт төлөвлөгөө:');
        expect(notes[text.indexOf(at(text, 'САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ'))]).toContain('Төлөвлөгөөний биелэлт: Хүсэлт амжилтгүй (500).');
        expect(notes[text.indexOf(at(text, 'ТООН МЭДЭЭЛЭЛ'))]).toContain('Өдрийн тайлангийн хүснэгт алга');
        // Бусад эх сурвалж хэвээр.
        expect(at(text, 'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ')).toContain('312,498,000₮');
        expect(at(text, 'НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ')).toContain('Ойрхон амьдардаг');
    });

    it('fits every table word in its column (PowerPoint breaks a longer word mid-word)', async () => {
        // Он эхнээс прод-ын хэмжээний дүн (TARGET-DECK: 19,717,922,500+ / 39,635,304,000).
        const year = plan();
        const ytd = year.ytd.total.metrics;
        year.ytd.total.metrics = {
            ...ytd,
            contract: { ...ytd.contract!, plan: 31_055_088_000, actual: 19_717_922_500, lowerBound: true, yearPlan: 39_635_304_000 },
            cashflow: { ...ytd.cashflow!, plan: 9_316_526_400, actual: 5_959_387_658, lowerBound: true, yearPlan: 11_890_591_200 },
        };
        const report = weeklySales();
        const residential = report.month.lines.find(line => line.kind === 'residential')!;
        const long = { ...report, month: { ...report.month, lines: Array.from({ length: 14 }, (_, index) => ({ ...residential, key: `Б2-${index}`, unit: `Б2-${index}`, referral: 'Мандала Гарден ОС' })) } };
        const talks = negotiations();
        talks.rows = talks.rows.map(row => ({ ...row, referral: 'Мандала Гарден ОС' }));
        for (const deck of [teamInput({ plan: year, negotiations: talks }), teamInput({ plan: year, weeklySales: long })]) {
            const { xml, text } = await render(deck);
            for (const [index, part] of xml.entries()) for (const table of slideTables(part)) expect(wordOverflows(table), text[index].slice(0, 60)).toEqual([]);
        }
        const { xml, text } = await render(teamInput({ plan: year, negotiations: talks }));
        const yearSlide = xml[text.indexOf(at(text, 'ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ'))];
        expect(yearSlide).toContain('19,717,922,500+');
        // Дүн нэг мөрөнд (хувийн багана «Гүйцэтгэл»-ийг тасалдаггүй өргөнтэй).
        const [yearTable] = slideTables(yearSlide);
        expect(lineOverflows(yearTable, col => col >= 2 && (col - 2) % 3 !== 2).filter(line => /^"[^"]*\d/.test(line))).toEqual([]);
        // «Сэжим»-ийн түгээмэл утга нэг мөрөнд.
        const [talksTable] = slideTables(xml[text.indexOf(at(text, 'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ'))]);
        expect(lineOverflows(talksTable, col => col === 10)).toEqual([]);
    });

    it('keeps a 22-floor Elysium block on one slide: names shortened to one line, rows sized for stacked units', async () => {
        const { xml, text, notes } = await render(teamInput({ weeklySales: elysiumFloorMaps() }));
        for (const block of ['Б1', 'Б2']) {
            const index = text.indexOf(at(text, `ДАВХРЫН ЗУРАГЛАЛ — ЭЛИЗИУМ ${block} БЛОК`));
            expect(text[index]).not.toContain('(1/2)');
            const [table] = slideTables(xml[index]);
            // Нүд бүрийн мөр нэг мөрөнд багтана (урт нэр «…»-ээр товчилсон).
            expect(lineOverflows(table)).toEqual([]);
            for (const cell of table.cells) {
                for (const line of cell.lines) expect(line.pt).toBeGreaterThanOrEqual(8);
                // Хоёр байртай нүдний мөр өндөр нь хоёр мөрийн бичвэрт хүрнэ.
                const needed = cell.lines.length * Math.max(0, ...cell.lines.map(line => line.pt)) * 1.2 / 72 + 0.02;
                expect(table.rowH[cell.row] + 1e-6, `мөр ${cell.row}`).toBeGreaterThanOrEqual(needed);
            }
            // Хүснэгт хөл, слайдын дугаараас (7.02") дээш дуусна.
            expect(table.y + table.rowH.reduce((sum, h) => sum + h, 0)).toBeLessThanOrEqual(BOTTOM + 1e-6);
            expect(notes[index]).toContain('«…»-ээр товчилсон');
            // HUB горим: ногоон = Hub-ийн бүх амьд гэрээ (огноогүй хуучин гэрээ ч), зөвхөн HUB жагсаалтынх гэж бичихгүй.
            expect(notes[index]).toContain('Ногоон = Hub-ийн бүх амьд (цуцлаагүй) гэрээтэй байр — зөвхөн HUB гэрээний жагсаалтаас импортолсон гэрээ биш');
            expect(notes[index]).not.toContain('(HUB гэрээний жагсаалт)');
            // Огноо нь HUB импортынх; гэрээ, байр одоогийн төлөвөөр (тэр өдрийн байдлаар биш).
            expect(notes[index]).toContain('Эх сурвалж: HUB гэрээ + байрны бүртгэл — гэрээ, байр экспортолсон үеийн төлөвөөр (хурлын дараах импорт, засвар ч орно); 2026-10-20 нь хурлын өдөр хүртэлх HUB гэрээний жагсаалтын сүүлийн импортын огноо.');
            expect(notes[index]).not.toContain('Эх сурвалж: HUB гэрээ + байрны бүртгэл (2026-10-20).');
            expect(text[index]).toContain('Амьд гэрээтэй (цуцлаагүй)');
        }
        const b2 = xml[text.indexOf(at(text, 'ДАВХРЫН ЗУРАГЛАЛ — ЭЛИЗИУМ Б2 БЛОК'))];
        expect(b2).toMatch(/<a:t>57\.87 м² Чанцал[^<]*…<\/a:t>/);
        expect(slideTables(b2)[0].cells.some(cell => cell.lines.length === 2)).toBe(true);
    });

    it('explains a cash «+» by the blocks and months without a cash actual, not by undated contracts', async () => {
        // Fixture: 10-р сард Б2, зогсоолд гараар мөнгөн урсгал, Б1 хоосон; 1–9 сард мөнгөн урсгал огт алга.
        const { notes, text } = await render(teamInput({ plan: plan({ undated: true }) }));
        const total = notes[text.findIndex(slide => slide.includes('10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ'))];
        expect(total).toContain('Мөнгөн урсгалын «+» — доод хязгаар: гүйцэтгэл оруулаагүй, системд ч дүнгүй блок — Б1 блок.');
        // Гэрээний гүйцэтгэл гараар (доод хязгааргүй) — мөнгөн урсгалын «+»-ийг огноогүй гэрээнд тохохгүй.
        expect(total).not.toContain('огноогүй 2 гэрээ байна');
        expect(total).not.toContain('дүн нь тодорхойгүй гэрээ');
        // Б2 гараар оруулсан — блокийн мөрөнд мөнгөн урсгалын «+» тайлбар байхгүй.
        const b2 = total.slice(total.indexOf('Б2 блок:'), total.indexOf('Зогсоол:'));
        expect(b2).toContain('Мөнгөн урсгалын гүйцэтгэл: удирдлагын гараар оруулсан дүн.');
        expect(b2).not.toContain('Мөнгөн урсгалын «+»');
        const year = notes[text.findIndex(slide => slide.includes('ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ'))];
        expect(year).toContain('Гэрээний тоо, дүнгийн «+» — огноогүй 2 гэрээтэй тул доод хязгаар.');
        expect(year).toContain('Мөнгөн урсгалын «1–10 сар», «он»-ы «+»/«—» — 1–10-р сарын зарим блокийн гүйцэтгэл оруулаагүй');
    });

    it('adds no cash «+» note where the cell shows «—» (no cash anywhere, prod 10-28 state)', async () => {
        const report = plan();
        const unknown = (cells: typeof report.months[number]['total']) => ({ ...cells, metrics: { ...cells.metrics, cashflow: { ...cells.metrics.cashflow!, actual: null, lowerBound: true, source: null } } });
        const months = report.months.map(row => ({ ...row, total: unknown(row.total), blocks: { b1: unknown(row.blocks.b1), b2: unknown(row.blocks.b2), parking: unknown(row.blocks.parking) } }));
        const { notes } = await render(teamInput({ plan: { ...report, months } }));
        expect(notes.join(' ')).not.toContain('Мөнгөн урсгалын «+»');
        // Жилийн хүснэгт «—»-ийн шалтгааныг сараар хэлнэ.
        expect(notes.join(' ')).toContain('Мөнгөн урсгалын «1–10 сар», «он»-ы «+»/«—» — 1–10-р сарын');
    });

    it('in HUB paid mode names undated contracts as the cash «+» cause, never «unknown paid» while every paid amount is known', async () => {
        // HUB файлд бүх гэрээний төлсөн дүн бий (availability 'full'); Б1 гараар оруулаагүй, огноогүй Б1 гэрээ 1.
        const report = plan({ hubPaid: 'all', undated: true });
        expect(report.cash).toMatchObject({ source: 'hub_paid', availability: 'full' });
        const { notes, text } = await render(teamInput({ plan: report }));
        const noteOf = (title: string) => notes[text.findIndex(slide => slide.includes(title))];
        const month = noteOf('10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ');
        // Нийт хүрээний мөр ба Б1 блокийн мөр хоёулаа шалтгааныг нэрлэнэ.
        expect(month.match(/Мөнгөн урсгалын «\+» — доод хязгаар: огноогүй 1 гэрээний HUB-ийн төлсөн дүн аль сард орохыг мэдэхгүй\./g)).toHaveLength(2);
        expect(month.slice(month.indexOf('Б1 блок:'), month.indexOf('Б2 блок:'))).toContain('огноогүй 1 гэрээний HUB-ийн төлсөн дүн аль сард орохыг мэдэхгүй.');
        expect(month).not.toContain('зарим гэрээний төлсөн дүн тодорхойгүй');
        expect(noteOf('ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ')).toContain('Мөнгөн урсгалын «1–10 сар», «он»-ы «+» — огноогүй 2 гэрээний HUB-ийн төлсөн дүн аль сард орохыг мэдэхгүй.');
    });

    it('names both an empty block and a block that is itself a lower bound', async () => {
        const report = plan();
        const row = report.months[9];
        const cash = (cells: typeof row.total, value: { actual: number | null; lowerBound: boolean; source: 'auto' | 'manual' | 'mixed' | null }) =>
            ({ ...cells, metrics: { ...cells.metrics, cashflow: { ...cells.metrics.cashflow!, ...value } } });
        const months = [...report.months];
        months[9] = {
            ...row,
            total: cash(row.total, { actual: 50_000_000, lowerBound: true, source: 'mixed' }),
            blocks: { b1: cash(row.blocks.b1, { actual: null, lowerBound: true, source: 'auto' }), b2: cash(row.blocks.b2, { actual: 50_000_000, lowerBound: true, source: 'auto' }), parking: cash(row.blocks.parking, { actual: 0, lowerBound: false, source: 'manual' }) },
        };
        const { notes, text } = await render(teamInput({ plan: { ...report, months, cash: { ...report.cash!, availability: 'partial' } } }));
        expect(notes[text.findIndex(slide => slide.includes('10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ'))])
            .toContain('Мөнгөн урсгалын «+» — доод хязгаар: гүйцэтгэл оруулаагүй, системд ч дүнгүй блок — Б1 блок; зарим гэрээний төлсөн дүн тодорхойгүй. Мөнгө ороогүй блокт /admin/sales-targets-д 0 гэж оруулна.');
    });

    it('keeps the cash «+» note with the month table even when the stretch plan has no cash part', async () => {
        const report = plan();
        const months = [...report.months];
        months[9] = { ...months[9], stretch: { ...months[9].stretch, cashflow: null } };
        const { notes, text } = await render(teamInput({ plan: { ...report, months } }));
        expect(notes[text.findIndex(slide => slide.includes('10-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ'))]).toContain('Мөнгөн урсгалын «+»');
    });

    it('lists no missing cash months while the report covers none (plan year not started)', async () => {
        const { notes } = await render(teamInput({ plan: { ...plan(), throughMonth: null } }));
        expect(notes.join(' ')).not.toContain('зарим блокийн гүйцэтгэл оруулаагүй');
    });

    it('adds no cash «+» note once every block of every month has a cash actual', async () => {
        const report = plan();
        const filled = (cells: typeof report.months[number]['total']) => ({ ...cells, metrics: { ...cells.metrics, cashflow: { ...cells.metrics.cashflow!, actual: 1, lowerBound: false } } });
        const months = report.months.map(row => ({ ...row, total: filled(row.total), blocks: { b1: filled(row.blocks.b1), b2: filled(row.blocks.b2), parking: filled(row.blocks.parking) } }));
        const { notes } = await render(teamInput({ plan: { ...report, months } }));
        expect(notes.join(' ')).not.toContain('Мөнгөн урсгалын «+»');
        expect(notes.join(' ')).not.toContain('Мөнгөн урсгалын «1–');
    });

    it('names the file like the other decks', () => {
        expect(weeklyDeckFileName('Elysium Residence', '2026-10-21', 'sales-team')).toBe('Elysium Residence - Борлуулалт (албаны загвар) - Лхагва 2026-10-21.pptx');
    });
});
