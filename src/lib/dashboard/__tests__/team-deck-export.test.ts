import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { exportTeamDeck } from '../weekly-deck-export';
import { meetingDate, meetings, negotiations, plan, range, slides, weeklySales } from './team-deck-fixture';

/** Хөтөчийн экспорт (jsdom): эх сурвалж бүтэлгүйтсэн ч илтгэл татагдаж, тэр слайд нь «ачаалж чадсангүй». */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** jsdom-ийн Blob-д arrayBuffer() алга — FileReader-ээр уншина. */
const readBlob = (blob: Blob) => new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
});

async function slideTexts(blob: Blob) {
    const zip = await JSZip.loadAsync(await readBlob(blob));
    const names = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const xml = await Promise.all(names.map(name => zip.file(name)!.async('string')));
    const layouts = await Promise.all(Object.keys(zip.files).filter(name => /slideLayout\d+\.xml$/.test(name)).map(name => zip.file(name)!.async('string')));
    return { text: xml.map(part => [...part.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(match => match[1]).join(' ')), layouts: layouts.join(' ') };
}

describe('exportTeamDeck (browser export)', () => {
    let blobs: Blob[];
    let downloads: string[];
    beforeEach(() => {
        blobs = [];
        downloads = [];
        vi.stubGlobal('URL', Object.assign(URL, {
            createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return `blob:deck-${blobs.length}`; }),
            revokeObjectURL: vi.fn(),
        }));
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('still downloads the deck when one source fails and branding is missing', async () => {
        const requested: string[] = [];
        vi.mocked(fetch).mockImplementation(async input => {
            const url = String(input);
            requested.push(url);
            if (url.startsWith('/api/dashboard/reports/plan-performance')) return json(plan());
            if (url.startsWith('/api/dashboard/reports/sales-activity')) return json({ error: 'Өдрийн тайлангийн хүснэгт алга' }, 503);
            if (url.startsWith('/api/dashboard/reports/meeting-details')) return json(meetings());
            if (url.startsWith('/api/dashboard/reports/negotiations')) return json(negotiations());
            if (url.startsWith('/api/dashboard/report-branding')) return json({ error: 'Хандах эрхгүй' }, 403);
            return json({ error: `unexpected ${url}` }, 500);
        });
        const result = await exportTeamDeck({
            projectName: 'Elysium Residence', meetingDate, range, weeklySales: weeklySales(),
            slides: slides().filter(slide => !slide.image_paths.length),
        });
        expect(result).toEqual({ fileName: 'Elysium Residence - Борлуулалт (албаны загвар) - Лхагва 2026-10-21.pptx', failedImages: 0, failedSources: 1 });
        expect(downloads).toEqual([result.fileName]);
        expect(requested).toEqual(expect.arrayContaining([
            '/api/dashboard/reports/plan-performance?year=2026&through=2026-10-20&hubAsOf=2026-10-21',
            '/api/dashboard/reports/sales-activity?meeting=2026-10-21',
            '/api/dashboard/reports/meeting-details?meeting=2026-10-21',
            '/api/dashboard/reports/negotiations',
            '/api/dashboard/report-branding',
        ]));
        const { text, layouts } = await slideTexts(blobs[0]);
        expect(text.find(slide => slide.includes('БОРЛУУЛАЛТЫН АЛБА-ТООН МЭДЭЭЛЭЛ'))).toContain('Мэдээлэл ачаалж чадсангүй.');
        expect(text.find(slide => slide.includes('Б2 БЛОК'))).toContain('2,195,395,000₮');
        // Брэндгүй: төслийн нэр, анхдагч хөл бичвэр.
        expect(text[0]).toBe('Elysium Residence 2026 оны 10.14-10.20 хүртэлх тайлан');
        expect(layouts).toContain('ВЕРТМОН ПРОПЕРТИС');
    });

    it('marks the month contracts and floor maps unavailable when the page could not load the weekly report', async () => {
        vi.mocked(fetch).mockImplementation(async input => {
            const url = String(input);
            if (url.startsWith('/api/dashboard/report-branding')) return json({ branding: { displayName: null, footerText: null, coverImagePath: null, logoPath: null, updatedAt: null }, available: false });
            return json({ error: 'Түр боломжгүй' }, 503);
        });
        const result = await exportTeamDeck({ projectName: 'Elysium Residence', meetingDate, range, weeklySalesError: 'Гэрээ, үлдэгдлийн тайлан ачаалж чадсангүй', slides: [] });
        expect(result.failedSources).toBe(5);
        const { text } = await slideTexts(blobs[0]);
        for (const title of ['ЗАХИАЛГЫН ГЭРЭЭНИЙ', 'ДАВХРЫН ЗУРАГЛАЛ', 'Б1 БЛОК', 'ЯРИГДАЖ БУЙ']) {
            expect(text.find(slide => slide.includes(title)), title).toContain('Мэдээлэл ачаалж чадсангүй.');
        }
        expect(text.at(-1)).toContain('Анхаарал хандуулсанд баярлалаа.');
    });
});
