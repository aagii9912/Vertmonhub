import { dashboardFetch, dashboardJson } from '@/lib/api/dashboardFetch';
import type { BudgetOverview } from '@/lib/marketing/budget';
import type { ChannelReportMatches } from '@/lib/marketing/channel-reports-load';
import type { MarketingPerformance } from '@/lib/marketing/performance';
import type { OperationsReport } from './operations-report';
import type { WeeklySalesReport } from './weekly-sales';
import type { WeeklyUpdate } from './weekly-review';
import { reportMediaUrl, type WeeklySlide } from './weekly-slides';
import { buildWeeklyDeck, weeklyDeckFileName, type DeckImage } from './weekly-deck';

/**
 * Хөтөч дээр Лхагвагийн тайланг .pptx болгож татна. Хуудасны ачаалсан (эрхээр шүүгдсэн)
 * тайлангууд дээр сарын төлөвлөгөө, маркетингийн төсөв, сувгийн экспорт, слайдын зургийг нэмж уншина.
 * pptxgenjs-ийг зөвхөн товч дарахад ачаална (хуудасны bundle-д орохгүй).
 */
export interface WeeklyDeckExportInput {
    projectName: string;
    meetingDate: string;
    range: { from: string; to: string };
    previousRange: { from: string; to: string };
    discussion: { title: string; detail: string }[];
    notices: string[];
    sales?: OperationsReport;
    previousSales?: OperationsReport;
    weeklySales?: WeeklySalesReport;
    marketing?: MarketingPerformance;
    updates?: WeeklyUpdate[];
    slides: WeeklySlide[];
    canReports: boolean;
    canMarketing: boolean;
}

type BudgetResponse = { year: number; available: boolean; overview?: BudgetOverview };

function monthBounds(day: string) {
    const [year, month] = day.split('-').map(Number);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}` };
}

function readDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('Зургийг уншиж чадсангүй'));
        reader.readAsDataURL(blob);
    });
}

async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return size;
    }
    const url = URL.createObjectURL(blob);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Слайдын зургийг (дөрвөөр зэрэг) татаж base64 болгоно. Ачаалж чадаагүйг алгасна. */
async function loadImages(paths: string[]): Promise<{ images: Record<string, DeckImage>; failed: number }> {
    const images: Record<string, DeckImage> = {};
    let failed = 0;
    const queue = [...new Set(paths)];
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (let path = queue.shift(); path; path = queue.shift()) {
            try {
                const response = await dashboardFetch(reportMediaUrl(path));
                if (!response.ok) throw new Error(String(response.status));
                const blob = await response.blob();
                const [dataUrl, size] = await Promise.all([readDataUrl(blob), imageSize(blob)]);
                images[path] = { data: dataUrl.replace(/^data:/, ''), ...size };
            } catch {
                failed++;
            }
        }
    }));
    return { images, failed };
}

const stamp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ulaanbaatar', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replaceAll('-', '.');

export async function exportWeeklyDeck(input: WeeklyDeckExportInput): Promise<{ fileName: string; failedImages: number }> {
    const year = Number(input.range.to.slice(0, 4));
    const month = monthBounds(input.range.to);
    const [budget, channels, monthSales, media, { default: PptxGenJS }] = await Promise.all([
        input.canMarketing ? dashboardJson<BudgetResponse>(`/api/marketing/budget?year=${year}`).catch(() => null) : null,
        input.canMarketing ? dashboardJson<{ latest: ChannelReportMatches }>(`/api/marketing/channel-reports?from=${input.range.from}&to=${input.range.to}`).then(response => response.latest).catch(() => null) : null,
        input.canReports ? dashboardJson<OperationsReport>(`/api/dashboard/reports/operations?${new URLSearchParams(month)}`).catch(() => undefined) : undefined,
        loadImages(input.slides.flatMap(slide => slide.image_paths)),
        import('pptxgenjs'),
    ]);
    const pres = new PptxGenJS();
    buildWeeklyDeck(pres, {
        projectName: input.projectName, meetingDate: input.meetingDate, range: input.range, previousRange: input.previousRange,
        generatedAt: stamp(), discussion: input.discussion, notices: input.notices,
        sales: input.sales, previousSales: input.previousSales, monthSales, weeklySales: input.weeklySales, marketing: input.marketing,
        budget: budget?.available && budget.overview ? { year, month: Number(input.range.to.slice(5, 7)), overview: budget.overview } : null,
        channels, slides: input.slides, images: media.images, updates: input.updates,
    });
    const blob = await pres.write({ outputType: 'blob' }) as Blob;
    const fileName = weeklyDeckFileName(input.projectName, input.meetingDate);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { fileName, failedImages: media.failed };
}
