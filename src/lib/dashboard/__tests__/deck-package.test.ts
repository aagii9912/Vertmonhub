// @vitest-environment node
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { SaxesParser } from 'saxes';
import { buildTeamDeck } from '../team-deck';
import { fillEmptyHeaders, finalizeDeck, PPTX_MIME, repairTableRef } from '../deck-package';
import { teamInput } from './team-deck-fixture';

/** pptxgenjs-ийн бичсэн жинхэнэ илтгэл (баганан, бялуун график — суулгасан Excel-тэй). */
async function rawDeck(): Promise<ArrayBuffer> {
    const pres = new PptxGenJS();
    buildTeamDeck(pres, teamInput());
    return await pres.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
}

const embedded = (zip: JSZip) => Object.keys(zip.files).filter(name => /^ppt\/embeddings\/.+\.xlsx$/.test(name)).sort();

async function expectWellFormed(zip: JSZip, part: string) {
    const body = await zip.file(part)!.async('string');
    const parser = new SaxesParser();
    expect(() => { parser.write(body); parser.close(); }, part).not.toThrow();
}

describe('finalizeDeck — the downloaded pptx', () => {
    it('cleans the chart workbook table range and names the empty header cell, so «Edit Data» opens without a repair', async () => {
        // pptxgenjs суулгасан Excel-ийг бүх илтгэлд нийтлэг тоологчоор дугаарладаг — нэг файлыг харьцуулна.
        const rawBuffer = await rawDeck();
        const raw = await JSZip.loadAsync(rawBuffer);
        const workbooks = embedded(raw);
        expect(workbooks.length).toBeGreaterThan(0);
        // pptxgenjs 4.0.1-ийн алдаа (засахаас өмнө): муж «A1:D5'», толгойн A1 хоосон.
        const before = await JSZip.loadAsync(await raw.file(workbooks[0])!.async('arraybuffer'));
        expect(await before.file('xl/tables/table1.xml')!.async('string')).toMatch(/ref="[A-Z]+\d+:[A-Z]+\d+'"/);

        const blob = await finalizeDeck(rawBuffer);
        expect(blob.type).toBe(PPTX_MIME);
        const fixed = await JSZip.loadAsync(await blob.arrayBuffer());
        expect(embedded(fixed)).toEqual(workbooks);
        for (const path of workbooks) {
            const book = await JSZip.loadAsync(await fixed.file(path)!.async('arraybuffer'));
            const table = await book.file('xl/tables/table1.xml')!.async('string');
            const ref = /<table\b[^>]*\sref="([^"]*)"/.exec(table)![1];
            expect(ref, path).toMatch(/^[A-Z]+\d+:[A-Z]+\d+$/);
            const names = [...table.matchAll(/<tableColumn\b[^>]*\sname="([^"]*)"/g)].map(match => match[1]);
            const shared = [...(await book.file('xl/sharedStrings.xml')!.async('string')).matchAll(/<si><t[^>]*>([^<]*)<\/t><\/si>/g)].map(match => match[1]);
            const sheet = await book.file('xl/worksheets/sheet1.xml')!.async('string');
            const header = [...sheet.matchAll(/<c r="([A-Z]+)1" t="s"><v>(\d+)<\/v><\/c>/g)].map(match => shared[Number(match[2])]);
            expect(header, path).toEqual(names);
            for (const part of ['xl/tables/table1.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml']) await expectWellFormed(book, part);
        }
    });

    it('keeps every slide, chart and note identical and compresses the file', async () => {
        const rawBuffer = await rawDeck();
        const raw = await JSZip.loadAsync(rawBuffer);
        const blob = await finalizeDeck(rawBuffer);
        const fixed = await JSZip.loadAsync(await blob.arrayBuffer());
        const parts = Object.keys(raw.files).filter(name => !raw.files[name].dir && !name.startsWith('ppt/embeddings/'));
        expect(Object.keys(fixed.files).filter(name => !fixed.files[name].dir && !name.startsWith('ppt/embeddings/'))).toEqual(parts);
        for (const name of parts) expect(await fixed.file(name)!.async('string'), name).toBe(await raw.file(name)!.async('string'));
        for (const name of parts.filter(part => part.endsWith('.xml') || part.endsWith('.rels'))) await expectWellFormed(fixed, name);
        // pptxgenjs шахалтгүй (STORE) бичдэг — DEFLATE-ээр хэд дахин багасна.
        expect(blob.size).toBeLessThan(rawBuffer.byteLength / 3);
    });

    it('leaves a deck without charts intact', async () => {
        const pres = new PptxGenJS();
        pres.addSlide().addText('Тест', { x: 1, y: 1, w: 3, h: 1 });
        const raw = await pres.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
        const fixed = await JSZip.loadAsync(await (await finalizeDeck(raw)).arrayBuffer());
        expect(await fixed.file('ppt/slides/slide1.xml')!.async('string')).toContain('<a:t>Тест</a:t>');
    });
});

describe('workbook repair helpers', () => {
    it('strips anything but cell addresses from the table range', () => {
        expect(repairTableRef(`<table id="1" name="Table1" displayName="Table1" ref="A1:D5'" totalsRowShown="0">`)).toBe('<table id="1" name="Table1" displayName="Table1" ref="A1:D5" totalsRowShown="0">');
        expect(repairTableRef('<table ref="A1:B3">')).toBe('<table ref="A1:B3">');
    });

    it('fills only empty header cells with the column name and keeps other strings and counts consistent', () => {
        const sheet = '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>0</v></c></row></sheetData>';
        const shared = '<sst count="2" uniqueCount="2"><si><t xml:space="preserve"></t></si><si><t>10/07–10/13</t></si></sst>';
        const result = fillEmptyHeaders(sheet, shared, ['Column1', '10/07–10/13'])!;
        expect(result.sheet).toContain('<c r="A1" t="s"><v>2</v></c>');
        expect(result.sheet).toContain('<c r="A2" t="s"><v>0</v></c>');
        expect(result.shared).toBe('<sst count="3" uniqueCount="3"><si><t xml:space="preserve"></t></si><si><t>10/07–10/13</t></si><si><t>Column1</t></si></sst>');
        expect(fillEmptyHeaders(result.sheet, result.shared, ['Column1', '10/07–10/13'])).toBeNull();
    });
});
