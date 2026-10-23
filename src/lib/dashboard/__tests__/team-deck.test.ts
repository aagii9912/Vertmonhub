// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { SaxesParser } from 'saxes';
import { buildTeamDeck, teamDeckPeriod, wholePct, type TeamDeckInput } from '../team-deck';
import { weeklyDeckFileName } from '../weekly-deck';
import { CASH_NUMBERS, negotiations, plan, range, teamInput, weeklySales } from './team-deck-fixture';

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
        const order = [
            '2026 оны 10.14-10.20 хүртэлх тайлан',
            'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ',
            'Банкны зээлийн нөхцөл',
            '10-Р САР ЗАХИАЛГЫН ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ',
            'Б1 БЛОК', 'Б2 БЛОК', 'ДУЛААН ЗОГСООЛ',
            '10-Р САРЫН ГЭРЭЭНИЙ НИЙТ ТӨЛӨВЛӨГӨӨ',
            '10-Р САРЫН ГЭРЭЭНИЙ НЭМЭЛТ ТӨЛӨВЛӨГӨӨ',
            'БОРЛУУЛАЛТЫН АЛБА-ТООН МЭДЭЭЛЭЛ',
            'НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ',
            'ДАВХРЫН ЗУРАГЛАЛ — ЭЛИЗИУМ Б1 БЛОК', 'ДАВХРЫН ЗУРАГЛАЛ — ЭЛИЗИУМ Б2 БЛОК',
            '2026 ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ',
            'Нээлттэй хаалганы өдөр',
            '10-р сарын бусад ажлын төлөвлөгөө',
            'Анхаарал хандуулсанд баярлалаа.',
        ];
        const indexes = order.map(needle => text.findIndex(slide => slide.includes(needle)));
        for (const [i, index] of indexes.entries()) expect(index, order[i]).toBeGreaterThanOrEqual(0);
        expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
        // 17 слайд (14–15 = өдөрлөг, гарчиггүй барилгын зураг) + «Яригдаж буй гэрээ» сэдвийн нэмэлт слайд.
        expect(text).toHaveLength(18);
        const photoOnly = text[indexes[14] + 1];
        expect(photoOnly.trim()).toMatch(/^\d*$/); // зөвхөн слайдын дугаар
        // Маркетингийн слайд, хуучин илтгэлийн хэсэг орохгүй.
        const all = text.join('\n');
        for (const needle of ['Маркетингийн пост', 'Энэ хурлаар шийдэх', 'Борлуулалтын тойм']) expect(all).not.toContain(needle);
        // «Энэ сард хийгдэх ажил» — мөр бүр цэг, гарчиггүй бол сарын гарчиг.
        const work = at(text, '10-р сарын бусад ажлын төлөвлөгөө');
        for (const needle of ['Showroom тохижуулах', 'Борлуулалтын оффис', 'Vertmon HUB хөгжүүлэлт']) expect(work).toContain(needle);
    });

    it('prints prod-like plan numbers in full digits with whole percentages', async () => {
        const { text } = await render(teamInput());
        const b2 = at(text, 'Б2 БЛОК');
        expect(b2).toMatch(/ТӨЛӨВЛӨГӨӨ 2,245,776,000₮ ГҮЙЦЭТГЭЛ 2,195,395,000₮ 4 гэрээ · Гараар ГҮЙЦЭТГЭЛИЙН ХУВЬ 98%/);
        expect(b2).toMatch(/ТӨЛӨВЛӨГӨӨ 673,732,800₮ ГҮЙЦЭТГЭЛ 161,844,800₮ Гараар ХУВЬ 24%/);
        expect(b2).toContain('Энэ сарын гэрээний урьдчилгаа (орсон + хүлээгдэж буй): 658,618,500₮');
        expect(wholePct(2_195_395_000, 2_245_776_000)).toBe('98%');
        const total = at(text, '10-Р САРЫН ГЭРЭЭНИЙ НИЙТ ТӨЛӨВЛӨГӨӨ');
        expect(total).toMatch(/ТӨЛӨВЛӨГӨӨ 5,352,996,000₮ ГҮЙЦЭТГЭЛ 3,410,026,000₮ 7 гэрээ · Гараар ГҮЙЦЭТГЭЛИЙН ХУВЬ 64%/);
        // Б1-ийн мөнгөн урсгал тодорхойгүй → нийт нь доод хязгаар.
        expect(total).toMatch(/ГҮЙЦЭТГЭЛ 187,824,800₮\+ Холимог ХУВЬ 12%\+/);
        const stretch = at(text, 'НЭМЭЛТ ТӨЛӨВЛӨГӨӨ');
        expect(stretch).toMatch(/НЭМЭЛТ ТӨЛӨВЛӨГӨӨ 7,152,996,000₮ ГҮЙЦЭТГЭЛ 3,410,026,000₮ ГҮЙЦЭТГЭЛИЙН ХУВЬ 48%/);
        expect(stretch).toMatch(/НЭМЭЛТ ТӨЛӨВЛӨГӨӨ 2,145,898,800₮ ГҮЙЦЭТГЭЛ 187,824,800₮\+ ХУВЬ 9%\+/);
        const year = at(text, '2026 ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ');
        expect(year).toContain('Б2 блок Тоо хэмжээ 4 4 100%');
        expect(year).toMatch(/Гэрээний дүн 2,245,776,000 2,195,395,000 98%/);
        for (const needle of ['10-р сар', '1–10 сар', '2026 он', 'Нийт төлөвлөгөө', 'Гүйцэтгэл хувиар', 'Зогсоол', 'Мөнгөн урсгал']) expect(year).toContain(needle);
    });

    it('marks the advance of the month «+» while undated contracts of that block may belong to the month', async () => {
        const { text, notes } = await render(teamInput({ plan: plan({ undated: true }) }));
        const line = (title: string) => at(text, title).match(/Энэ сарын гэрээний урьдчилгаа \(орсон \+ хүлээгдэж буй\): (\S+)/)![1];
        // Б2-ийн дүн гараар оруулсан ч урьдчилгаа системийн гэрээнээс — огноогүй Б2 гэрээ энэ сарынх байж болно.
        expect(line('Б2 БЛОК')).toBe('658,618,500₮+');
        expect(line('Б1 БЛОК')).toBe('282,007,750₮+');
        expect(line('ДУЛААН ЗОГСООЛ')).toBe('25,980,000₮');
        expect(line('НИЙТ ТӨЛӨВЛӨГӨӨ')).toBe('966,606,250₮+');
        expect(line('НЭМЭЛТ ТӨЛӨВЛӨГӨӨ')).toBe('966,606,250₮+');
        expect(notes[text.indexOf(at(text, 'Б2 БЛОК'))]).toContain('Энэ сарын урьдчилгаа доод хязгаар («+»): энэ сарынх байж болох огноогүй 1 гэрээ.');
        expect(notes[text.indexOf(at(text, 'НИЙТ ТӨЛӨВЛӨГӨӨ'))]).toContain('энэ сарынх байж болох огноогүй 2 гэрээ');
        expect(notes[text.indexOf(at(text, 'ДУЛААН ЗОГСООЛ'))]).not.toContain('доод хязгаар («+»)');
        // Огноогүй гэрээгүй бол бүрэн дүн.
        const dated = await render(teamInput());
        expect(at(dated.text, 'Б2 БЛОК')).toContain('Энэ сарын гэрээний урьдчилгаа (орсон + хүлээгдэж буй): 658,618,500₮ ');
    });

    it('shows the contract count beside the amount only when both come from the same source', async () => {
        // Дүн гараар, тоо системийн (Б2-ийн 4 гэрээ): «4 гэрээ» бичихгүй, зөвхөн эх сурвалж.
        const { text } = await render(teamInput({ plan: plan({ manualCounts: false }) }));
        expect(at(text, 'Б2 БЛОК')).toMatch(/ГҮЙЦЭТГЭЛ 2,195,395,000₮ Гараар ГҮЙЦЭТГЭЛИЙН ХУВЬ 98%/);
        expect(at(text, 'Б2 БЛОК')).not.toContain('гэрээ · ');
    });

    it('prints «—» for unknown values and never «0₮»', async () => {
        const { text } = await render(teamInput());
        const b1 = at(text, 'Б1 БЛОК');
        expect(b1).toMatch(/ТӨЛӨВЛӨГӨӨ 842,166,000₮ ГҮЙЦЭТГЭЛ — ХУВЬ —/);
        const activity = at(text, 'БОРЛУУЛАЛТЫН АЛБА-ТООН МЭДЭЭЛЭЛ');
        expect(activity).toMatch(/7786 Оператор 145 Төлөвлөгөө 367\/550 Биелэлт 40%/);
        expect(activity).toMatch(/Шинэ уулзалт 24\+ Төлөвлөгөө 73\/110 Биелэлт —/);
        expect(activity).toMatch(/Чат — Төлөвлөгөө оруулаагүй Биелэлт —/);
        for (const slide of text) expect(slide).not.toMatch(/(^|[^\d,.])0₮/);
    });

    it('names the cash source in the notes: HUB «Нийт төлсөн дүн» with its date, or the manual entry', async () => {
        const { text, notes } = await render(teamInput({ plan: plan({ hubPaid: true }) }));
        const b1 = at(text, 'Б1 БЛОК');
        expect(b1).toMatch(/ТӨЛӨВЛӨГӨӨ 842,166,000₮ ГҮЙЦЭТГЭЛ 282,007,750₮ Систем ХУВЬ 33%/);
        expect(notes[text.indexOf(b1)]).toContain('Мөнгөн урсгалын гүйцэтгэл: HUB файлын «Нийт төлсөн дүн» (2026-10-20-ний байдлаар)');
        expect(notes[text.indexOf(at(text, 'Б2 БЛОК'))]).toContain('Мөнгөн урсгалын гүйцэтгэл: удирдлагын гараар оруулсан дүн.');
        expect(notes[text.indexOf(at(text, 'НИЙТ ТӨЛӨВЛӨГӨӨ'))]).toContain('Мөнгөн урсгалын гүйцэтгэл: гараар оруулсан блок + бусад блок — HUB файлын «Нийт төлсөн дүн»');
        // Урьдчилгааны мэдээлэл мөнгөн урсгалд нэмэгдэхгүй.
        expect(at(text, 'НИЙТ ТӨЛӨВЛӨГӨӨ')).toMatch(/ГҮЙЦЭТГЭЛ 469,832,550₮ Холимог ХУВЬ 29%/);
    });

    it('shows no cash numbers anywhere when cash is hidden', async () => {
        const { zip, text } = await render(teamInput({ plan: plan({ cashHidden: true }) }));
        const parts = await Promise.all(Object.keys(zip.files).filter(name => name.endsWith('.xml')).map(name => zip.file(name)!.async('string')));
        for (const number of CASH_NUMBERS) expect(parts.join(' '), number).not.toContain(number);
        for (const title of ['Б1 БЛОК', 'Б2 БЛОК', 'ДУЛААН ЗОГСООЛ', 'НИЙТ ТӨЛӨВЛӨГӨӨ', 'НЭМЭЛТ ТӨЛӨВЛӨГӨӨ']) {
            const slide = at(text, title);
            expect(slide).toContain('Мөнгөн урсгалыг санхүүгийн эрхтэй ажилтан харна.');
            expect(slide).not.toMatch(/Мөнгөн урсгал(?!ыг)/);
        }
        // Гэрээний дүн, урьдчилгааны мэдээлэл хэвээр.
        expect(at(text, 'Б2 БЛОК')).toContain('2,195,395,000₮');
        expect(at(text, '2026 ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ')).not.toContain('Мөнгөн урсгал');
    });

    it('skips the stretch slide without a stretch plan', async () => {
        const { text } = await render(teamInput({ plan: plan({ stretch: false }) }));
        expect(text.join(' ')).not.toContain('НЭМЭЛТ ТӨЛӨВЛӨГӨӨ');
        expect(text.join(' ')).toContain('10-Р САРЫН ГЭРЭЭНИЙ НИЙТ ТӨЛӨВЛӨГӨӨ');
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

    it('adds native charts: the activity column chart and the weekly model pies', async () => {
        const { zip, xml } = await render(teamInput());
        const charts = Object.keys(zip.files).filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name));
        // 1 багана график + 3 дугуй (уулзалтгүй 7 хоногт график зурахгүй).
        expect(charts).toHaveLength(4);
        const rels = await Promise.all(Object.keys(zip.files).filter(name => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name)).map(name => zip.file(name)!.async('string')));
        for (const chart of charts) expect(rels.join(' ')).toContain(`/charts/${chart.split('/').pop()}"`);
        const bodies = await Promise.all(charts.map(name => zip.file(name)!.async('string')));
        for (const body of bodies) {
            const parser = new SaxesParser();
            expect(() => { parser.write(body); parser.close(); }).not.toThrow();
        }
        const bar = bodies.find(body => body.includes('<c:barChart>'))!;
        for (const name of ['10/01–10/06', '10/07–10/13', '10/14–10/20', '7786 Оператор', 'Менежер дугаар', 'Шинэ уулзалт', 'Чат']) expect(bar).toContain(name);
        // Мэдээлэлгүй 7 хоног (09/23–09/29, 09/30) графикт орохгүй; тодорхойгүй цэг хоосон (0 биш).
        expect(bar).not.toContain('09/23–09/29');
        expect(bar).toContain('<c:dispBlanksAs val="gap"/>');
        expect(bar).toContain('<c:barDir val="col"/>');
        expect(bar).toContain('<c:grouping val="clustered"/>');
        expect(bar).toMatch(/<c:pt idx="1"><c:v><\/c:v><\/c:pt>/);
        const pies = bodies.filter(body => body.includes('<c:pieChart>'));
        expect(pies).toHaveLength(3);
        for (const pie of pies) for (const name of ['Б1 E7 · 89.73 м² · 3 өрөө', 'Сонголтгүй']) expect(pie).toContain(name);
        const meetings = xml.find(part => part.includes('НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ'))!;
        expect(meetings).toContain('Болсон уулзалт алга');
        for (const needle of ['Ойрхон амьдардаг', 'Тодорхойгүй', 'Нийт']) expect(meetings).toContain(needle);
        expect(meetings).toMatch(/<a:t>Нийт<\/a:t>[\s\S]*?<a:t>12<\/a:t>/);
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

    it('a failed source shows «мэдээлэл ачаалж чадсангүй» on its slides and keeps the rest', async () => {
        const { text, notes } = await render(teamInput({
            plan: null, activity: null, weeklySales: null,
            failed: { plan: 'Хүсэлт амжилтгүй (500)', activity: 'Өдрийн тайлангийн хүснэгт алга', weeklySales: 'долоо хоногийн тайлан ачаалагдаагүй' },
        }));
        for (const title of ['Б1 БЛОК', 'Б2 БЛОК', 'ДУЛААН ЗОГСООЛ', 'НИЙТ ТӨЛӨВЛӨГӨӨ', 'ТООН МЭДЭЭЛЭЛ', 'ЗАХИАЛГЫН ГЭРЭЭНИЙ', 'ДАВХРЫН ЗУРАГЛАЛ', 'ОНЫ БОРЛУУЛАЛТЫН']) {
            expect(at(text, title)).toContain('Мэдээлэл ачаалж чадсангүй.');
        }
        expect(text.join(' ')).not.toContain('НЭМЭЛТ ТӨЛӨВЛӨГӨӨ');
        expect(notes[text.indexOf(at(text, 'Б1 БЛОК'))]).toContain('Төлөвлөгөөний биелэлт: Хүсэлт амжилтгүй (500).');
        expect(notes[text.indexOf(at(text, 'ТООН МЭДЭЭЛЭЛ'))]).toContain('Өдрийн тайлангийн хүснэгт алга');
        // Бусад эх сурвалж хэвээр.
        expect(at(text, 'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ')).toContain('312,498,000₮');
        expect(at(text, 'НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ')).toContain('Ойрхон амьдардаг');
    });

    it('names the file like the other decks', () => {
        expect(weeklyDeckFileName('Elysium Residence', '2026-10-21', 'sales-team')).toBe('Elysium Residence - Борлуулалт (албаны загвар) - Лхагва 2026-10-21.pptx');
    });
});
