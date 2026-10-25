/**
 * Илтгэлийн (.pptx) хүснэгтийн байршлыг PowerPoint-гүйгээр шалгах тестийн туслах: слайдын XML-ээс хүснэгт бүрийн
 * баганын өргөн, мөрийн өндөр, нүдний бичвэр (үсгийн хэмжээ, тод эсэх), захын зайг уншиж, Arial-ийн тэмдэгтийн өргөнөөр
 * (`arialWidth`) үг нүдэнд багтах эсэхийг тооцно. PowerPoint үгийг нүдний өргөнөөс урт бол дундаас нь тасална.
 */
import { arialWidth } from '../arial-metrics';

const EMU = 914_400;
const decode = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

export interface CellLine { text: string; pt: number; bold: boolean }
export interface CellLayout { row: number; col: number; width: number; usable: number; lines: CellLine[] }
export interface TableLayout { y: number; colW: number[]; rowH: number[]; cells: CellLayout[] }

/** Слайдын бүх хүснэгт (инчээр). Нэгтгэсэн нүдний орлуулагч (`hMerge`/`vMerge`) алгасна (өргөн нь `gridSpan`-д). */
export function slideTables(xml: string): TableLayout[] {
    return xml.split('<p:graphicFrame>').slice(1).filter(frame => frame.includes('<a:tbl>')).map(frame => {
        const y = Number(frame.match(/<a:off x="\d+" y="(\d+)"\/>/)![1]) / EMU;
        const colW = [...frame.matchAll(/<a:gridCol w="(\d+)"\/>/g)].map(match => Number(match[1]) / EMU);
        const rows = [...frame.matchAll(/<a:tr h="(\d+)">([\s\S]*?)<\/a:tr>/g)];
        const cells: CellLayout[] = [];
        rows.forEach(([, , body], row) => {
            let col = 0;
            for (const [, attrs, inner] of body.matchAll(/<a:tc(?=[\s>])([^>]*)>([\s\S]*?)<\/a:tc>/g)) {
                const span = Number(attr(attrs, 'gridSpan') ?? 1);
                const merged = attr(attrs, 'hMerge') || attr(attrs, 'vMerge');
                const tcPr = inner.match(/<a:tcPr([^>]*)>/)?.[1] ?? '';
                const width = colW.slice(col, col + span).reduce((sum, value) => sum + value, 0);
                const margin = (Number(attr(tcPr, 'marL') ?? 91_440) + Number(attr(tcPr, 'marR') ?? 91_440)) / EMU;
                const lines: CellLine[] = [];
                for (const [, paragraph] of inner.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
                    for (const part of paragraph.split(/<a:br\b[^>]*\/>/)) {
                        const runs = [...part.matchAll(/<a:rPr([^>]*)>[\s\S]*?<a:t>([^<]*)<\/a:t>/g)];
                        if (!runs.length) continue;
                        lines.push({ text: runs.map(run => decode(run[2])).join(''), pt: Number(attr(runs[0][1], 'sz') ?? 1800) / 100, bold: attr(runs[0][1], 'b') === '1' });
                    }
                }
                if (!merged) cells.push({ row, col, width, usable: width - margin, lines });
                // `gridSpan`-ийн араас `hMerge` орлуулагч нүднүүд ирдэг тул нүд бүр нэг багана эзэлнэ.
                col += 1;
            }
        });
        return { y, colW, rowH: rows.map(([, h]) => Number(h) / EMU), cells };
    });
}

const fmt = (value: number) => `${value.toFixed(3)}in`;

/** Нүдний өргөнөөс урт үг (PowerPoint дундаас нь тасална): «"Гүйцэтгэл" 0.694in > 0.580in (мөр 1, багана 4)». */
export function wordOverflows(table: TableLayout): string[] {
    return table.cells.flatMap(cell => cell.lines.flatMap(line => line.text.split(/\s+/).filter(Boolean)
        .map(word => ({ word, width: arialWidth(word, line.pt, line.bold) }))
        .filter(item => item.width > cell.usable)
        .map(item => `"${item.word}" ${fmt(item.width)} > ${fmt(cell.usable)} (мөр ${cell.row}, багана ${cell.col})`)));
}

/** Нэг мөрөнд багтахгүй мөр (үгээр таслагдаж 2+ мөр болно). */
export function lineOverflows(table: TableLayout, cols?: (col: number) => boolean): string[] {
    return table.cells.filter(cell => !cols || cols(cell.col)).flatMap(cell => cell.lines
        .map(line => ({ line, width: arialWidth(line.text, line.pt, line.bold) }))
        .filter(item => item.width > cell.usable)
        .map(item => `"${item.line.text}" ${fmt(item.width)} > ${fmt(cell.usable)} (мөр ${cell.row}, багана ${cell.col})`));
}
