// @vitest-environment node
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { buildWeeklyDeck, imageGridRows, type DeckImage, type WeeklyDeckInput } from '../weekly-deck';
import type { WeeklySlide } from '../weekly-slides';

/** W17: 9 хүртэл зураг, гарчиггүй коллаж, «Энэ сард хийгдэх ажил» цэгтэй жагсаалт. */
const shop = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
const media = (n: number) => `${shop}/${user}/00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}.png`;
const PNG = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const EMU = 914_400;
const M = 0.6;
const W = 13.333;

const portrait = (n: number): Record<string, DeckImage> => Object.fromEntries(Array.from({ length: n }, (_, index) => [media(index + 1), { data: PNG, width: 1536, height: 2048 }]));
const landscape = (n: number): Record<string, DeckImage> => Object.fromEntries(Array.from({ length: n }, (_, index) => [media(index + 1), { data: PNG, width: 1920, height: 1080 }]));
const slide = (over: Partial<WeeklySlide>): WeeklySlide => ({
    id: '00000000-0000-4000-8000-000000000101', meeting_date: '2026-10-21', part: 'sales', section: 'construction', title: '', note: '', image_paths: [],
    position: 0, author_id: user, author_name: 'Номин', updated_at: '2026-10-20T10:00:00Z', ...over,
});

function input(slides: WeeklySlide[], images: Record<string, DeckImage>): WeeklyDeckInput {
    return {
        kind: 'sales', projectName: 'Elysium Residence', meetingDate: '2026-10-21', range: { from: '2026-10-14', to: '2026-10-20' },
        previousRange: { from: '2026-10-07', to: '2026-10-13' }, generatedAt: '2026.10.20 14:05', discussion: [], notices: [], slides, images,
    };
}

async function render(deck: WeeklyDeckInput) {
    const pres = new PptxGenJS();
    buildWeeklyDeck(pres, deck);
    const zip = await JSZip.loadAsync(await pres.write({ outputType: 'nodebuffer' }) as Buffer);
    const names = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    return Promise.all(names.map(name => zip.file(name)!.async('string')));
}

const pictures = (xml: string) => [...xml.matchAll(/<p:pic>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>[\s\S]*?<\/p:pic>/g)]
    .map(match => ({ x: Number(match[1]) / EMU, y: Number(match[2]) / EMU, w: Number(match[3]) / EMU, h: Number(match[4]) / EMU }));
const texts = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(match => match[1]);
const rowsOf = (pics: ReturnType<typeof pictures>) => {
    const tops = new Map<number, number>();
    for (const pic of pics) {
        const key = Math.round((pic.y + pic.h / 2) * 100);
        tops.set(key, (tops.get(key) ?? 0) + 1);
    }
    return [...tops.entries()].sort((a, b) => a[0] - b[0]).map(([, count]) => count);
};

describe('meeting photo slides (W17)', () => {
    it('lays out rows: ≤ 6 keep the uniform grid, 7–9 portrait in two rows (4 + 5), otherwise three rows', () => {
        const p = (n: number) => Array.from({ length: n }, () => ({ width: 3, height: 4 }));
        const l = (n: number) => Array.from({ length: n }, () => ({ width: 16, height: 9 }));
        expect(imageGridRows(p(4))).toEqual({ rows: [4], uniformCols: 4 });
        expect(imageGridRows(l(4))).toEqual({ rows: [2, 2], uniformCols: 2 });
        expect(imageGridRows(l(5))).toEqual({ rows: [3, 2], uniformCols: 3 });
        expect(imageGridRows(p(9))).toEqual({ rows: [4, 5], uniformCols: null });
        expect(imageGridRows(p(7))).toEqual({ rows: [3, 4], uniformCols: null });
        expect(imageGridRows(p(8))).toEqual({ rows: [4, 4], uniformCols: null });
        expect(imageGridRows(l(7))).toEqual({ rows: [2, 2, 3], uniformCols: null });
        expect(imageGridRows([...p(8), ...l(1)])).toEqual({ rows: [3, 3, 3], uniformCols: null });
    });

    it('renders an untitled photo slide without a header, 9 photos full width inside the margins', async () => {
        const images = portrait(9);
        const xml = await render(input([slide({ image_paths: Object.keys(images) })], images));
        const photo = xml.find(part => pictures(part).length === 9)!;
        expect(photo).toBeDefined();
        expect(texts(photo).join(' ')).not.toMatch(/Барилгын явц|Борлуулалт/);
        const pics = pictures(photo);
        expect(rowsOf(pics)).toEqual([4, 5]);
        for (const pic of pics) {
            expect(pic.x).toBeGreaterThanOrEqual(M - 0.01);
            expect(pic.x + pic.w).toBeLessThanOrEqual(W - M + 0.01);
            expect(pic.y).toBeGreaterThanOrEqual(0.44);
            expect(pic.y + pic.h).toBeLessThanOrEqual(6.86);
        }
        // Дээд мөрийн 4 зураг доод мөрийн 5-аас том.
        expect(Math.max(...pics.slice(0, 4).map(pic => pic.h))).toBeGreaterThan(Math.max(...pics.slice(4).map(pic => pic.h)));
    });

    it('keeps the header when the slide has a title, and lays 8 landscape photos in three rows', async () => {
        const images = landscape(8);
        const xml = await render(input([slide({ title: 'Фасадын дулаалга', image_paths: Object.keys(images) })], images));
        const photo = xml.find(part => pictures(part).length === 8)!;
        expect(texts(photo)).toEqual(expect.arrayContaining(['БОРЛУУЛАЛТ · БАРИЛГЫН ЯВЦ', 'Фасадын дулаалга']));
        expect(rowsOf(pictures(photo))).toEqual([2, 3, 3]);
    });

    it('renders the month plan note as one bullet per line', async () => {
        const note = '• Showroom тохижуулах\nБорлуулалтын оффис\n\n- Light box оффист авчрах';
        const xml = await render(input([slide({ section: 'plan', title: '10-р сарын бусад ажлын төлөвлөгөө', note })], {}));
        const plan = xml.find(part => part.includes('Showroom'))!;
        expect(texts(plan)).toEqual(expect.arrayContaining(['Showroom тохижуулах', 'Борлуулалтын оффис', 'Light box оффист авчрах']));
        expect(texts(plan).join(' ')).not.toMatch(/•|- Light/);
        expect(plan.match(/<a:buChar/g)).toHaveLength(3);
        // Бусад сэдвийн тайлбар цэггүй хэвээр.
        const other = await render(input([slide({ section: 'event', title: 'Өдөрлөг', note: 'Нэг\nХоёр' })], {}));
        expect(other.find(part => part.includes('Өдөрлөг'))!.match(/<a:buChar/g)).toBeNull();
    });
});
