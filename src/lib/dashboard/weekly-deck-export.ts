import type PptxGenJS from 'pptxgenjs';
import { dashboardFetch, dashboardJson } from '@/lib/api/dashboardFetch';
import type { BudgetOverview, BudgetSpendMonth } from '@/lib/marketing/budget';
import type { MarketingConnections } from '@/lib/marketing/connections';
import type { ChannelReportMatches } from '@/lib/marketing/channel-reports-load';
import type { SocialWeekResponse } from '@/lib/marketing/social-week';
import type { MarketingPerformance } from '@/lib/marketing/performance';
import type { OperationsReport } from './operations-report';
import type { WeeklySalesReport } from './weekly-sales';
import type { WeeklyContentPlan, WeeklyUpdate } from './weekly-review';
import { reportMediaUrl, type WeeklySlide } from './weekly-slides';
import { buildWeeklyDeck, weeklyDeckFileName, type DeckImage, type MarketingDeckSource, type WeeklyDeckKind } from './weekly-deck';
import { buildTeamDeck, type TeamDeckSource, type TeamPlanReport } from './team-deck';
import type { SalesActivityReport } from './sales-activity';
import type { MeetingDetailsReport } from './meeting-details';
import type { NegotiationsReport } from './negotiations';
import { brandingImageUrl, type ReportBranding, type ReportBrandingResponse } from './report-branding';

/**
 * Хөтөч дээр Лхагвагийн тайланг .pptx болгож татна — борлуулалт, маркетинг тусдаа файл.
 * Хуудасны ачаалсан (эрхээр шүүгдсэн) тайлангууд дээр борлуулалтад сарын төлөвлөгөө,
 * маркетингад төсөв, сувгийн экспорт, контентын зургийг нэмж уншина.
 * pptxgenjs-ийг зөвхөн товч дарахад ачаална (хуудасны bundle-д орохгүй).
 */
export interface WeeklyDeckExportInput {
    kind: WeeklyDeckKind;
    projectName: string;
    meetingDate: string;
    range: { from: string; to: string };
    previousRange: { from: string; to: string };
    discussion: { title: string; detail: string; part?: WeeklyDeckKind }[];
    notices: string[];
    sales?: OperationsReport;
    previousSales?: OperationsReport;
    weeklySales?: WeeklySalesReport;
    marketing?: MarketingPerformance;
    updates?: WeeklyUpdate[];
    contentPlan?: WeeklyContentPlan;
    slides: WeeklySlide[];
    canReports: boolean;
    canMarketing: boolean;
}

/** `spendStatus` = сар бүрийн бүртгэлтэй эсэх, ханшгүй Meta зардал эх валютаар (₮-д ороогүй). */
type BudgetResponse = { year: number; available: boolean; overview?: BudgetOverview; spendStatus?: BudgetSpendMonth[] };

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

/** Слайдын зургийг (дөрвөөр зэрэг) татаж base64 болгоно. Ачаалж чадаагүйг алгасна. `toUrl` — зургийн хувийн хаяг. */
async function loadImages(paths: string[], toUrl: (path: string) => string = reportMediaUrl): Promise<{ images: Record<string, DeckImage>; failed: number }> {
    const images: Record<string, DeckImage> = {};
    let failed = 0;
    const queue = [...new Set(paths)];
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (let path = queue.shift(); path; path = queue.shift()) {
            try {
                const response = await dashboardFetch(toUrl(path));
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

type Settled<T> = { data: T; error: null } | { data: null; error: string };
const settle = <T>(promise: Promise<T>): Promise<Settled<T>> => promise.then(
    data => ({ data, error: null }),
    (error: unknown) => ({ data: null, error: error instanceof Error && error.message ? error.message : 'тодорхойгүй алдаа' }),
);

const stamp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ulaanbaatar', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replaceAll('-', '.');

/**
 * Борлуулалт эсвэл маркетингийн илтгэл. Маркетингийн эх сурвалж (төсөв, сувгийн тайлан, Facebook хуудас, Instagram,
 * холболтын төлөв) бүтэлгүйтвэл тэр хэсгийн оронд «… ачаалж чадсангүй» слайд, `failedSources`-д тоологдоно (хуудас анхааруулна) —
 * хэсгийг чимээгүй хасахгүй (албаны загварын `exportTeamDeck`-тэй ижил).
 */
export async function exportWeeklyDeck(input: WeeklyDeckExportInput): Promise<{ fileName: string; failedImages: number; failedSources: number }> {
    const year = Number(input.range.to.slice(0, 4));
    const month = monthBounds(input.range.to);
    const marketing = input.kind === 'marketing' && input.canMarketing;
    const slides = input.slides.filter(slide => slide.part === input.kind);
    const contentImages = marketing && input.contentPlan
        ? input.contentPlan.week.items.filter(item => item.status === 'published' || item.status === 'ready').flatMap(item => item.image_paths) : [];
    const skipped = Promise.resolve<Settled<null>>({ data: null, error: null });
    const [budget, channels, social, connections, monthSales, media, { default: PptxGenJS }] = await Promise.all([
        marketing ? settle(dashboardJson<BudgetResponse>(`/api/marketing/budget?year=${year}`)) : skipped,
        marketing ? settle(dashboardJson<{ latest: ChannelReportMatches }>(`/api/marketing/channel-reports?from=${input.range.from}&to=${input.range.to}`).then(response => response.latest)) : skipped,
        marketing ? settle(dashboardJson<SocialWeekResponse>(`/api/dashboard/marketing/social-week?meetingDate=${input.meetingDate}`)) : skipped,
        marketing ? settle(dashboardJson<{ connections: MarketingConnections }>('/api/dashboard/marketing/connections').then(response => response.connections)) : skipped,
        input.kind === 'sales' && input.canReports ? dashboardJson<OperationsReport>(`/api/dashboard/reports/operations?${new URLSearchParams(month)}`).catch(() => undefined) : undefined,
        loadImages([...slides.flatMap(slide => slide.image_paths), ...contentImages]),
        import('pptxgenjs'),
    ]);
    const failed: Partial<Record<MarketingDeckSource, string>> = {};
    if (budget.error) failed.budget = budget.error;
    if (channels.error) failed.channels = channels.error;
    if (social.error) failed.social = social.error;
    // Хуудасны хариу ирсэн ч Instagram-ийн хэсгийг уншиж чадаагүй (`instagramError`) — Instagram-ийн оронд тусдаа слайд.
    else if (social.data?.instagramError) failed.instagram = social.data.instagramError;
    if (connections.error) failed.connections = connections.error;
    const pres = new PptxGenJS();
    buildWeeklyDeck(pres, {
        kind: input.kind, contentPlan: input.contentPlan, projectName: input.projectName, meetingDate: input.meetingDate, range: input.range, previousRange: input.previousRange,
        generatedAt: stamp(), discussion: input.discussion, notices: input.notices,
        sales: input.sales, previousSales: input.previousSales, monthSales, weeklySales: input.weeklySales, marketing: input.marketing,
        // Төсвийн хүснэгт суулгаагүй (`available: false`) нь алдаа биш — төсвийн мөргүй.
        budget: budget.data?.available && budget.data.overview ? { year, month: Number(input.range.to.slice(5, 7)), overview: budget.data.overview, spendStatus: budget.data.spendStatus } : null,
        channels: channels.data, social: social.data?.week ?? null, instagram: social.data?.instagram ?? null, connections: connections.data, failed,
        slides, images: media.images, updates: input.updates,
    });
    const fileName = weeklyDeckFileName(input.projectName, input.meetingDate, input.kind);
    await saveDeck(pres, fileName);
    return { fileName, failedImages: media.failed, failedSources: Object.keys(failed).length };
}

/** Үүсгэсэн илтгэлийг хөтөчөөр татуулна. */
async function saveDeck(pres: PptxGenJS, fileName: string) {
    const blob = await pres.write({ outputType: 'blob' }) as Blob;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Борлуулалтын албаны загварын илтгэлийн оролт: хуудасны долоо хоногийн тайлан (сарын гэрээ, давхрын зураглал), слайд. */
export interface TeamDeckExportInput {
    projectName: string;
    meetingDate: string;
    range: { from: string; to: string };
    weeklySales?: WeeklySalesReport;
    /** Хуудсанд долоо хоногийн тайланг ачаалж чадаагүй шалтгаан (слайдын тэмдэглэлд). */
    weeklySalesError?: string | null;
    slides: WeeklySlide[];
}


/**
 * Илтгэлийн брэнд ба нүүрний зураг, лого. 403/404, хүснэгт алга (`available: false`) эсвэл бусад алдаа — брэндгүй
 * (анхдагч загвар), илтгэлийг унагаахгүй. Зураг ачаалж чадаагүй бол тэр зураггүй.
 */
async function loadBranding(): Promise<{ branding: ReportBranding | null; cover: DeckImage | null; logo: DeckImage | null; failed: number }> {
    // Брэнд заавал биш: алдааг нүүрний тэмдэглэл («брэнд тохируулаагүй эсвэл уншиж чадаагүй») л илэрхийлнэ.
    const response = await dashboardJson<ReportBrandingResponse>('/api/dashboard/report-branding').catch(() => null);
    const branding = response?.available ? response.branding : null;
    const paths = [branding?.coverImagePath, branding?.logoPath].filter((path): path is string => !!path);
    const media = paths.length ? await loadImages(paths, path => brandingImageUrl(path) ?? '') : { images: {}, failed: 0 };
    return {
        branding,
        cover: branding?.coverImagePath ? media.images[branding.coverImagePath] ?? null : null,
        logo: branding?.logoPath ? media.images[branding.logoPath] ?? null : null,
        failed: media.failed,
    };
}

/**
 * «Борлуулалт (албаны загвар)» (W2): багийн гараар хийдэг 17 слайдын агуулга, дарааллаар (`buildTeamDeck`).
 * Эх сурвалжуудыг зэрэг уншина; аль нэг нь бүтэлгүйтвэл тэр слайд «мэдээлэл ачаалж чадсангүй», бусад нь хэвээр.
 * Мөнгөн урсгал зөвхөн санхүүгийн эрхтэйд серверээс ирнэ (`cashHidden`).
 */
export async function exportTeamDeck(input: TeamDeckExportInput): Promise<{ fileName: string; failedImages: number; failedSources: number }> {
    const year = input.range.to.slice(0, 4);
    const meeting = encodeURIComponent(input.meetingDate);
    const slides = input.slides.filter(slide => slide.part === 'sales');
    const [plan, activity, meetings, negotiations, branding, media, { default: PptxGenJS }] = await Promise.all([
        settle(dashboardJson<TeamPlanReport>(`/api/dashboard/reports/plan-performance?year=${year}&through=${input.range.to}&hubAsOf=${input.meetingDate}`)),
        settle(dashboardJson<SalesActivityReport>(`/api/dashboard/reports/sales-activity?meeting=${meeting}`)),
        settle(dashboardJson<MeetingDetailsReport>(`/api/dashboard/reports/meeting-details?meeting=${meeting}`)),
        settle(dashboardJson<NegotiationsReport>('/api/dashboard/reports/negotiations')),
        loadBranding(),
        loadImages(slides.flatMap(slide => slide.image_paths)),
        import('pptxgenjs'),
    ]);
    const failed: Partial<Record<TeamDeckSource, string>> = {};
    if (plan.error) failed.plan = plan.error;
    if (activity.error) failed.activity = activity.error;
    if (meetings.error) failed.meetings = meetings.error;
    if (negotiations.error) failed.negotiations = negotiations.error;
    if (!input.weeklySales) failed.weeklySales = input.weeklySalesError || 'долоо хоногийн борлуулалтын тайлан ачаалагдаагүй';
    const pres = new PptxGenJS();
    buildTeamDeck(pres, {
        projectName: input.projectName, meetingDate: input.meetingDate, range: input.range, generatedAt: stamp(),
        branding: branding.branding, coverImage: branding.cover, logo: branding.logo,
        plan: plan.data, activity: activity.data, meetings: meetings.data, negotiations: negotiations.data, weeklySales: input.weeklySales ?? null,
        slides, images: media.images, failed,
    });
    const fileName = weeklyDeckFileName(input.projectName, input.meetingDate, 'sales-team');
    await saveDeck(pres, fileName);
    return { fileName, failedImages: media.failed + branding.failed, failedSources: Object.keys(failed).length };
}
