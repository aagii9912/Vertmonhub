import { z } from 'zod';
import { meetingDateSchema } from './weekly-review';

/**
 * Лхагвагийн хурлын нэмэлт слайд (client-safe): өгөгдлийн сангаас гардаггүй постер, контент,
 * Page/Ads/CallPro-гийн дэлгэцийн зураг, өдөрлөгийн зураг, тайлбар. «Слайд (.pptx)» экспорт
 * тус бүрийг нэг слайд болгоно. Хэсэг бүр өөрийн модулийн эрхтэй (борлуулалт = reports,
 * маркетинг = marketing-roi).
 */
export const WEEKLY_SLIDE_PARTS = ['sales', 'marketing'] as const;
export type WeeklySlidePart = typeof WEEKLY_SLIDE_PARTS[number];
export const WEEKLY_SLIDE_PART_MODULE: Record<WeeklySlidePart, string> = { sales: 'reports', marketing: 'marketing-roi' };
export const WEEKLY_SLIDE_PART_LABEL: Record<WeeklySlidePart, string> = { sales: 'Борлуулалт', marketing: 'Маркетинг' };

export const WEEKLY_SLIDE_SECTIONS = [
    'social', 'page', 'ads', 'callpro', 'sms', 'survey', 'website', 'chat',
    'event', 'handover', 'negotiation', 'plan', 'other',
] as const;
export type WeeklySlideSection = typeof WEEKLY_SLIDE_SECTIONS[number];
export const WEEKLY_SLIDE_SECTION_LABEL: Record<WeeklySlideSection, string> = {
    social: 'Сошиал медиа',
    page: 'Пэйж хандалт',
    ads: 'Boost / Meta Ads',
    callpro: 'CallPro',
    sms: 'Масс SMS',
    survey: 'Сэжим хуудас',
    website: 'Вэб сайт',
    chat: 'Чат, ManyChat',
    event: 'Өдөрлөг, арга хэмжээ',
    handover: 'Хүлээлцсэн байдал',
    negotiation: 'Яригдаж буй гэрээ',
    plan: 'Энэ сард хийгдэх ажил',
    other: 'Бусад',
};
/** Хэсэг бүрт сонгох сэдвүүд (маркетингийн тайлангийн слайдын дарааллаар). */
export const WEEKLY_SLIDE_PART_SECTIONS: Record<WeeklySlidePart, readonly WeeklySlideSection[]> = {
    marketing: ['social', 'page', 'ads', 'callpro', 'sms', 'survey', 'website', 'chat', 'event', 'other'],
    sales: ['event', 'handover', 'negotiation', 'plan', 'other'],
};

export const WEEKLY_SLIDE_LIMITS = { images: 6, title: 200, note: 2000, slides: 60, imageBytes: 4 * 1024 * 1024 } as const;
export const REPORT_MEDIA_BUCKET = 'report-media';
export const REPORT_MEDIA_ENDPOINT = '/api/dashboard/weekly-slides/media';
/** PowerPoint-д найдвартай орох төрлүүд л. Бусдыг (WEBP, HEIC, GIF) хөтөч JPEG болгож илгээнэ. */
export const REPORT_MEDIA_TYPES: Record<string, 'jpg' | 'png'> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

const uuid = z.uuid();
const PATH_PATTERN = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png)$/;

/** `<shop_id>/<user_id>/<uuid>.<jpg|png>` — бусад хэлбэрийг (давхар өргөтгөл, `..`, том үсэг) татгалзана. */
export function parseReportMediaPath(value: unknown): { path: string; shopId: string; userId: string; ext: 'jpg' | 'png' } | null {
    if (typeof value !== 'string' || value.length > 200) return null;
    const match = PATH_PATTERN.exec(value);
    if (!match || ![match[1], match[2], match[3]].every(id => uuid.safeParse(id).success)) return null;
    return { path: value, shopId: match[1], userId: match[2], ext: match[4] as 'jpg' | 'png' };
}

export function reportMediaUrl(path: string): string {
    return `${REPORT_MEDIA_ENDPOINT}?path=${encodeURIComponent(path)}`;
}

const MediaPathSchema = z.string().refine(value => !!parseReportMediaPath(value), 'Зургийн зам буруу байна');
const imagePaths = z.array(MediaPathSchema).max(WEEKLY_SLIDE_LIMITS.images, `Нэг слайдад ${WEEKLY_SLIDE_LIMITS.images} хүртэл зураг`)
    .refine(paths => new Set(paths).size === paths.length, 'Ижил зураг давхардсан байна');
const title = z.string().trim().max(WEEKLY_SLIDE_LIMITS.title, `Сэдэв ${WEEKLY_SLIDE_LIMITS.title} хүртэл тэмдэгт`);
const note = z.string().max(WEEKLY_SLIDE_LIMITS.note, `Тайлбар ${WEEKLY_SLIDE_LIMITS.note} хүртэл тэмдэгт`)
    .transform(value => value.replace(/\r\n/g, '\n').replace(/\s+$/, ''));
const hasContent = (value: { title?: string; note?: string; imagePaths?: string[] }) =>
    !!(value.title || value.note?.trim() || value.imagePaths?.length);

export const WeeklySlideCreateSchema = z.object({
    meetingDate: meetingDateSchema,
    part: z.enum(WEEKLY_SLIDE_PARTS),
    section: z.enum(WEEKLY_SLIDE_SECTIONS),
    title: title.default(''),
    note: note.default(''),
    imagePaths: imagePaths.default([]),
}).strict()
    .refine(value => WEEKLY_SLIDE_PART_SECTIONS[value.part].includes(value.section), { message: 'Энэ хэсэгт тохирохгүй сэдэв байна', path: ['section'] })
    .refine(hasContent, { message: 'Сэдэв, тайлбар эсвэл зураг оруулна уу' });
export type WeeklySlideCreate = z.output<typeof WeeklySlideCreateSchema>;

export const WeeklySlidePatchSchema = z.object({
    section: z.enum(WEEKLY_SLIDE_SECTIONS).optional(),
    title: title.optional(),
    note: note.optional(),
    imagePaths: imagePaths.optional(),
}).strict().refine(value => Object.values(value).some(field => field !== undefined), 'Өөрчлөх зүйлээ сонгоно уу');
export type WeeklySlidePatch = z.output<typeof WeeklySlidePatchSchema>;

export const WeeklySlideOrderSchema = z.object({
    meetingDate: meetingDateSchema,
    part: z.enum(WEEKLY_SLIDE_PARTS),
    ids: z.array(uuid).min(1).max(WEEKLY_SLIDE_LIMITS.slides).refine(ids => new Set(ids).size === ids.length, 'Давхардсан слайд'),
}).strict();

export interface WeeklySlide {
    id: string;
    meeting_date: string;
    part: WeeklySlidePart;
    section: WeeklySlideSection;
    title: string;
    note: string;
    image_paths: string[];
    position: number;
    author_id: string | null;
    author_name: string;
    updated_at: string;
}

export const WEEKLY_SLIDE_COLUMNS = 'id,meeting_date,part,section,title,note,image_paths,position,author_id,author_name,updated_at';

/** Слайдын гарчиг: сэдвийн нэр («Сошиал медиа»), доор нь хэрэглэгчийн бичсэн сэдэв. */
export function weeklySlideHeading(slide: Pick<WeeklySlide, 'section' | 'title'>): { label: string; title: string } {
    return { label: WEEKLY_SLIDE_SECTION_LABEL[slide.section], title: slide.title };
}
