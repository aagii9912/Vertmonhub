/**
 * Лхагвын илтгэлийн .pptx-ийг татахаас өмнө засна (клиентэд; JSZip-ийг товч дарсан үед л ачаална):
 *  • pptxgenjs 4.0.1 графикийн суулгасан Excel-ийн хүснэгтийг (ppt/embeddings/*.xlsx → xl/tables/table*.xml)
 *    `ref="A1:D5'"` гэж илүү тэмдэгттэй мужаар бичдэг, толгойн A1 нүд хоосон байхад баганыг «Column1» гэж нэрлэдэг —
 *    PowerPoint-ийн «Edit Data» Excel-ийг файл засахыг асуулгана. Мужийг цэвэрлэж, хоосон толгойн нүдэнд баганын
 *    нэрийг бичнэ (графикийн цуврал, ангиллын мужид толгойн A1 ордоггүй).
 *  • `pres.write({ outputType })` шахалтгүй (STORE) бичдэг — илтгэл ба суулгасан Excel-ийг DEFLATE-ээр шахна.
 */
import type JSZip from 'jszip';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescapeXml = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Хүснэгтийн муж: зөвхөн нүдний хаяг үлдээнэ (`A1:D5'` → `A1:D5`). */
export function repairTableRef(tableXml: string): string {
    return tableXml.replace(/(<table\b[^>]*?\sref=")([^"]*)(")/, (_match, open: string, ref: string, close: string) =>
        `${open}${ref.replace(/[^A-Z0-9:]/gi, '')}${close}`);
}

/** «A», «B», … «AA» — 0-ээс эхэлсэн баганын үсэг. */
function columnLetters(index: number): string {
    let letters = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    return letters;
}

/**
 * Толгойн мөрийн хоосон shared string нүдэнд баганын нэрийг шинэ мөр болгон нэмнэ (бусад нүдний мөрийг хөндөхгүй).
 * Буцаах: засагдсан sheet, sharedStrings; засах юмгүй бол null.
 */
export function fillEmptyHeaders(sheetXml: string, sharedXml: string, columnNames: readonly string[], headerRow = 1): { sheet: string; shared: string } | null {
    const strings = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => unescapeXml([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
    let sheet = sheetXml;
    const added: string[] = [];
    columnNames.forEach((name, index) => {
        if (!name) return;
        const ref = `${columnLetters(index)}${headerRow}`;
        const cell = new RegExp(`<c r="${ref}"([^>]*)t="s"([^>]*)><v>(\\d+)</v></c>`);
        const match = cell.exec(sheet);
        if (!match || strings[Number(match[3])] !== '') return;
        const next = strings.length + added.length;
        added.push(name);
        sheet = sheet.replace(match[0], `<c r="${ref}"${match[1]}t="s"${match[2]}><v>${next}</v></c>`);
    });
    if (!added.length) return null;
    const total = strings.length + added.length;
    const shared = sharedXml
        .replace(/<\/sst>\s*$/, `${added.map(name => `<si><t>${escapeXml(name)}</t></si>`).join('')}</sst>`)
        .replace(/(<sst\b[^>]*?\scount=")\d+(")/, `$1${total}$2`)
        .replace(/(<sst\b[^>]*?\suniqueCount=")\d+(")/, `$1${total}$2`);
    return { sheet, shared };
}

/** Нэг суулгасан Excel (графикийн өгөгдөл): хүснэгт бүрийн муж, толгойн нэр. Өөрчлөлтгүй бол ч DEFLATE-ээр дахин шахна. */
async function repairWorkbook(Zip: typeof JSZip, data: ArrayBuffer): Promise<ArrayBuffer> {
    const workbook = await Zip.loadAsync(data);
    const sharedPath = 'xl/sharedStrings.xml';
    for (const sheetPath of Object.keys(workbook.files).filter(path => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))) {
        const rels = await workbook.file(sheetPath.replace('worksheets/', 'worksheets/_rels/') + '.rels')?.async('string');
        const tables = [...(rels ?? '').matchAll(/Target="\.\.\/tables\/(table\d+\.xml)"/g)].map(match => `xl/tables/${match[1]}`);
        for (const tablePath of tables) {
            const tableXml = await workbook.file(tablePath)?.async('string');
            if (!tableXml) continue;
            const repaired = repairTableRef(tableXml);
            if (repaired !== tableXml) workbook.file(tablePath, repaired);
            const names = [...repaired.matchAll(/<tableColumn\b[^>]*\sname="([^"]*)"/g)].map(match => unescapeXml(match[1]));
            const [sheetXml, sharedXml] = await Promise.all([workbook.file(sheetPath)?.async('string'), workbook.file(sharedPath)?.async('string')]);
            if (!sheetXml || !sharedXml) continue;
            const filled = fillEmptyHeaders(sheetXml, sharedXml, names);
            if (filled) {
                workbook.file(sheetPath, filled.sheet);
                workbook.file(sharedPath, filled.shared);
            }
        }
    }
    return workbook.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

/** pptxgenjs-ийн бичсэн илтгэл → татах файл: графикийн Excel засагдсан, бүхэлдээ DEFLATE-ээр шахагдсан. */
export async function finalizeDeck(data: ArrayBuffer): Promise<Blob> {
    const { default: Zip } = await import('jszip');
    const deck = await Zip.loadAsync(data);
    for (const path of Object.keys(deck.files).filter(name => /^ppt\/embeddings\/[^/]+\.xlsx$/.test(name))) {
        deck.file(path, await repairWorkbook(Zip, await deck.file(path)!.async('arraybuffer')));
    }
    return deck.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: PPTX_MIME });
}
