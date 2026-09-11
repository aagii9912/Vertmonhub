// @vitest-environment node
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
    buildWorkbookBuffer,
    readSheetRows,
    readSheetCsv,
    XlsxSheetNotFoundError,
    XlsxUnsupportedFormatError,
} from '@/lib/utils/xlsx';
import { toDateStr } from '@/lib/admin/import/mappers';

/** Fixture-ийг exceljs-ээр шууд үүсгэнэ (формула, richText, hyperlink, алдаа, merge — helper бичдэггүй төрлүүд) */
async function rawWorkbook(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    build(wb);
    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
}

describe('xlsx helper — round trip (SheetJS семантик)', () => {
    it('rows mode: текст, тоо, огноо, хоосон нүд; толгой = түлхүүрийн нэгдэл анх таарсан дарааллаар', async () => {
        const buf = await buildWorkbookBuffer([{
            name: 'Лидүүд',
            rows: [
                { 'Нэр': 'Бат', 'Утас': 99112233, 'Огноо': new Date(2026, 0, 15), 'Тэмдэглэл': null },
                { 'Нэр': 'Дорж', 'Утас': '8800-1122', 'Огноо': new Date(2026, 5, 3, 14, 30), 'Нэмэлт': 'x' },
            ],
        }]);
        expect(buf.subarray(0, 2).toString('latin1')).toBe('PK'); // .xlsx = zip

        const rows = await readSheetRows(buf);
        expect(rows).toHaveLength(2);

        // Хоосон нүд (null) → түлхүүр орохгүй (SheetJS json_to_sheet null нүд бичдэггүй, sheet_to_json алгасдаг)
        expect(Object.keys(rows[0])).toEqual(['Нэр', 'Утас', 'Огноо']);
        expect(rows[0]['Нэр']).toBe('Бат');
        expect(rows[0]['Утас']).toBe(99112233); // тоо тоогоороо
        expect(rows[1]['Утас']).toBe('8800-1122'); // текст текстээрээ
        expect(rows[1]['Нэмэлт']).toBe('x'); // 2-р мөрөнд шинээр гарсан түлхүүр толгойн төгсгөлд

        // Огноо: Date хэвээр, ЛОКАЛ wall-clock (SheetJS cellDates шиг) — mappers.toDateStr зөв өдөр өгнө
        const d = rows[0]['Огноо'] as Date;
        expect(d).toBeInstanceOf(Date);
        expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 0, 15, 0]);
        expect(toDateStr(d)).toBe('2026-01-15');
        const dt = rows[1]['Огноо'] as Date;
        expect([dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes()]).toEqual([5, 3, 14, 30]);
    });

    it('rows mode: толгойн дараалал бүх мөрийн түлхүүрийн нэгдэл', async () => {
        const buf = await buildWorkbookBuffer([{ name: 'S', rows: [{ b: 1 }, { a: 2, b: 3 }, { c: 4 }] }]);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf as unknown as ArrayBuffer);
        const header = wb.worksheets[0].getRow(1).values as unknown[];
        expect(header.slice(1)).toEqual(['b', 'a', 'c']);
        expect(await readSheetRows(buf)).toEqual([{ b: 1 }, { a: 2, b: 3 }, { c: 4 }]);
    });

    it('aoa mode: массив байгаараа, хоосон толгой → __EMPTY / __EMPTY_1, давхардсан → _1, баганын өргөн', async () => {
        const buf = await buildWorkbookBuffer([{
            name: 'Загвар',
            aoa: [
                ['Нэр', '', 'Нэр', null],
                ['a', 1, 'b', 2],
                ['c', 3, 'd', 4, 'толгойгүй 5 дахь багана'],
            ],
            colWidths: [22, 18],
        }]);

        const rows = await readSheetRows(buf);
        expect(rows).toEqual([
            { 'Нэр': 'a', '__EMPTY': 1, 'Нэр_1': 'b', '__EMPTY_1': 2 },
            { 'Нэр': 'c', '__EMPTY': 3, 'Нэр_1': 'd', '__EMPTY_1': 4, '__EMPTY_2': 'толгойгүй 5 дахь багана' },
        ]);

        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf as unknown as ArrayBuffer);
        expect(wb.worksheets[0].name).toBe('Загвар');
        expect(wb.worksheets[0].getColumn(1).width).toBe(22);
        expect(wb.worksheets[0].getColumn(2).width).toBe(18);
    });

    it('defval: толгой бүр түлхүүртэй, хоосон нүд defval авна; бүхэлдээ хоосон мөр алгасна', async () => {
        const buf = await buildWorkbookBuffer([{
            name: 'S',
            aoa: [['Гэрээний дугаар', 'Нэр', 'Дүн'], ['A-1', null, 5], [], [null, null, null], ['A-2', 'Бат', null]],
        }]);
        expect(await readSheetRows(buf, 0, { defval: null })).toEqual([
            { 'Гэрээний дугаар': 'A-1', 'Нэр': null, 'Дүн': 5 },
            { 'Гэрээний дугаар': 'A-2', 'Нэр': 'Бат', 'Дүн': null },
        ]);
        expect(await readSheetRows(buf, 0, { defval: '' })).toEqual([
            { 'Гэрээний дугаар': 'A-1', 'Нэр': '', 'Дүн': 5 },
            { 'Гэрээний дугаар': 'A-2', 'Нэр': 'Бат', 'Дүн': '' },
        ]);
        // defval: undefined = өгөөгүй
        expect(await readSheetRows(buf, 0, { defval: undefined })).toEqual([
            { 'Гэрээний дугаар': 'A-1', 'Дүн': 5 },
            { 'Гэрээний дугаар': 'A-2', 'Нэр': 'Бат' },
        ]);
    });

    it('толгойн өмнөх хоосон мөрүүдийг алгасаж, эхний утгатай мөрийг толгой болгоно; толгойг trim хийнэ', async () => {
        const buf = await buildWorkbookBuffer([{
            name: 'S',
            aoa: [[], [null], [' Нэр ', 'Утас'], ['Бат', 1]],
        }]);
        expect(await readSheetRows(buf)).toEqual([{ 'Нэр': 'Бат', 'Утас': 1 }]);
    });

    it('формула → кэшлэгдсэн үр дүн, richText → текст, hyperlink → текст, алдаа → байхгүй, boolean хэвээр, merge → зөвхөн мастер', async () => {
        const buf = await rawWorkbook((wb) => {
            const ws = wb.addWorksheet('Raw');
            ws.addRow(['Нэр', 'Тоо', 'Формула', 'Rich', 'Link', 'Алдаа', 'Bool', 'Merged']);
            ws.addRow([
                'a', 21,
                { formula: 'B2*2', result: 42 },
                { richText: [{ text: 'Ман' }, { text: 'дал' }] },
                { text: 'Сайт', hyperlink: 'https://mandala-garden.mn' },
                { error: '#N/A' },
                true,
                'M',
            ]);
            ws.addRow(['b', 1, null, null, null, null, false, null]);
            ws.mergeCells('H2:H3');
        });

        const rows = await readSheetRows(buf);
        expect(rows[0]).toEqual({
            'Нэр': 'a', 'Тоо': 21, 'Формула': 42, 'Rich': 'Мандал', 'Link': 'Сайт', 'Bool': true, 'Merged': 'M',
        });
        // H3 нь merge-ийн туслах нүд — exceljs 'M' өгдөг ч SheetJS шиг хоосон
        expect(rows[1]).toEqual({ 'Нэр': 'b', 'Тоо': 1, 'Bool': false });
    });

    it('огноо форматтай нүд Date, энгийн тоо number хэвээр (mappers-ийн serial зам хөндөгдөхгүй)', async () => {
        const buf = await rawWorkbook((wb) => {
            const ws = wb.addWorksheet('D');
            ws.addRow(['Огноо', 'Serial', 'Нүдний формат']);
            ws.addRow([new Date(Date.UTC(2026, 1, 4)), 46057, 46057]);
            ws.getCell('C2').numFmt = 'yyyy-mm-dd';
        });
        const [row] = await readSheetRows(buf);
        expect(row['Огноо']).toBeInstanceOf(Date);
        expect(toDateStr(row['Огноо'])).toBe('2026-02-04');
        expect(row['Serial']).toBe(46057);
        expect(toDateStr(row['Serial'])).toBe('2026-02-04');
        // Тоон нүдэнд огнооны формат өгсөн бол exceljs Date болгоно (SheetJS cellDates-тэй адил)
        expect(row['Нүдний формат']).toBeInstanceOf(Date);
        expect(toDateStr(row['Нүдний формат'])).toBe('2026-02-04');
    });

    it('лист сонголт: индекс ба нэрээр; олдохгүй бол XlsxSheetNotFoundError; ArrayBuffer оролт', async () => {
        const buf = await buildWorkbookBuffer([
            { name: 'Нэг', rows: [{ a: 1 }] },
            { name: 'Хоёр', rows: [{ b: 2 }] },
        ]);
        expect(await readSheetRows(buf, 1)).toEqual([{ b: 2 }]);
        expect(await readSheetRows(buf, 'Хоёр')).toEqual([{ b: 2 }]);
        await expect(readSheetRows(buf, 5)).rejects.toBeInstanceOf(XlsxSheetNotFoundError);
        await expect(readSheetRows(buf, 'Байхгүй')).rejects.toBeInstanceOf(XlsxSheetNotFoundError);

        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        expect(await readSheetRows(ab)).toEqual([{ a: 1 }]);

        const empty = await rawWorkbook(() => {});
        await expect(readSheetRows(empty)).rejects.toBeInstanceOf(XlsxSheetNotFoundError);
    });

    it('хоосон лист → [], rows: [] ба [{}] → хоосон лист', async () => {
        const buf = await buildWorkbookBuffer([
            { name: 'A', rows: [] },
            { name: 'B', rows: [{}] },
            { name: 'C', aoa: [] },
        ]);
        expect(await readSheetRows(buf, 0)).toEqual([]);
        expect(await readSheetRows(buf, 1)).toEqual([]);
        expect(await readSheetRows(buf, 2)).toEqual([]);
    });

    it('листийн нэр: хориотой тэмдэгт → _, 31 тэмдэгтээр таслана, давхардвал дугаарлана', async () => {
        const long = 'Менежерийн гүйцэтгэлийн дэлгэрэнгүй тайлан 2026';
        const buf = await buildWorkbookBuffer([
            { name: 'A/B:C?', rows: [{ a: 1 }] },
            { name: long, rows: [{ a: 1 }] },
            { name: long, rows: [{ a: 2 }] },
            { name: '', rows: [] },
        ]);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf as unknown as ArrayBuffer);
        const names = wb.worksheets.map((ws) => ws.name);
        expect(names[0]).toBe('A_B_C_');
        expect(names[1]).toBe(long.slice(0, 31));
        expect(names[1]).toHaveLength(31);
        expect(names[2]).toHaveLength(31);
        expect(names[2].endsWith(' (2)')).toBe(true);
        expect(names[3]).toBe('Sheet1');
    });
});

describe('xlsx helper — CSV (SheetJS агуулгаар таньдаг байсан)', () => {
    it('BOM, хашилт доторх таслал, тоо → number, хоосон мөр алгасна, defval', async () => {
        const csv = Buffer.from('﻿Name,Phone,Note,Price\nБат,99112233,"a, b",\n\nДорж,,x,"380,000,000"\n', 'utf8');
        expect(await readSheetRows(csv)).toEqual([
            { Name: 'Бат', Phone: 99112233, Note: 'a, b' },
            { Name: 'Дорж', Note: 'x', Price: 380000000 },
        ]);
        expect(await readSheetRows(csv, 0, { defval: '' })).toEqual([
            { Name: 'Бат', Phone: 99112233, Note: 'a, b', Price: '' },
            { Name: 'Дорж', Phone: '', Note: 'x', Price: 380000000 },
        ]);
        // CSV = ганц "Sheet1" лист
        expect(await readSheetRows(csv, 'Sheet1')).toHaveLength(2);
        await expect(readSheetRows(csv, 1)).rejects.toBeInstanceOf(XlsxSheetNotFoundError);
    });

    it('хуваагчийг таамаглана (; ба tab), TRUE/FALSE → boolean, UTF-16LE', async () => {
        const semi = Buffer.from('a;b;c\n1;TRUE;x, y\n', 'utf8');
        expect(await readSheetRows(semi)).toEqual([{ a: 1, b: true, c: 'x, y' }]);

        const tab = Buffer.from('a\tb\n1\tFALSE\n', 'utf8');
        expect(await readSheetRows(tab)).toEqual([{ a: 1, b: false }]);

        const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Нэр,Утас\nБат,1\n', 'utf16le')]);
        expect(await readSheetRows(utf16)).toEqual([{ 'Нэр': 'Бат', 'Утас': 1 }]);

        expect(await readSheetRows(Buffer.from('', 'utf8'))).toEqual([]);
    });

    it('readSheetCsv: xlsx → CSV текст (хашилт, огноо YYYY-MM-DD, өргөнөөр тэгшилнэ)', async () => {
        const buf = await buildWorkbookBuffer([{
            name: 'S',
            rows: [
                { 'Нэр': 'Бат, Дорж', 'Огноо': new Date(2026, 0, 15), 'Тоо': 5 },
                { 'Нэр': 'x' },
            ],
        }]);
        expect(await readSheetCsv(buf)).toBe('Нэр,Огноо,Тоо\n"Бат, Дорж",2026-01-15,5\nx,,');
    });

    it('.xls (OLE2/BIFF) → XlsxUnsupportedFormatError, эвдэрсэн zip → алдаа', async () => {
        const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]);
        await expect(readSheetRows(ole)).rejects.toBeInstanceOf(XlsxUnsupportedFormatError);
        await expect(readSheetCsv(ole)).rejects.toBeInstanceOf(XlsxUnsupportedFormatError);

        const brokenZip = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(64)]);
        await expect(readSheetRows(brokenZip)).rejects.toThrow();
    });
});
