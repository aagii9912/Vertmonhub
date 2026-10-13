import { z } from 'zod';
import { parseReportMediaPath } from '@/lib/dashboard/report-media';

/**
 * Маркетингийн албаны өөрийн төлөвлөгөө: контент календарь (`content_calendar`). Маркетинг
 * контент бүтээж, өөрийн төлөвлөгөөгөөр ажилладаг. Лхагвагийн маркетингийн тайлан
 * борлуулалтын лид, гэрээгээр биш, энэ төлөвлөгөөний гүйцэтгэлээр (төлөвлөсөн → нийтэлсэн)
 * хэмжигдэнэ. Контент бүр постер/reel-ийн зурагтай (≤ 6, хувийн `report-media`).
 */
export const CONTENT_TYPES = ['post', 'story', 'reel', 'blog', 'email', 'ad', 'event'] as const;
export type ContentType = typeof CONTENT_TYPES[number];
export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
    post: 'Пост', story: 'Story', reel: 'Reel', blog: 'Блог', email: 'Имэйл', ad: 'Зар', event: 'Эвент',
};

export const CONTENT_STATUSES = ['planned', 'in_progress', 'ready', 'published', 'cancelled'] as const;
export type ContentStatus = typeof CONTENT_STATUSES[number];
export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
    planned: 'Төлөвлөсөн', in_progress: 'Хийгдэж байна', ready: 'Бэлэн', published: 'Нийтэлсэн', cancelled: 'Цуцалсан',
};

export const CONTENT_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'web', 'other'] as const;
export type ContentPlatform = typeof CONTENT_PLATFORMS[number];
export const CONTENT_PLATFORM_LABEL: Record<ContentPlatform, string> = {
    facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', web: 'Вэб', other: 'Бусад',
};
/** Хуучин мөрийн чөлөөт текстэн платформыг гэмтээлгүй харуулна. */
export const contentPlatformLabel = (value: string | null) => value && Object.hasOwn(CONTENT_PLATFORM_LABEL, value) ? CONTENT_PLATFORM_LABEL[value as ContentPlatform] : value || '—';

export interface ContentItem {
    id: string;
    title: string;
    type: ContentType;
    platform: string | null;
    scheduled_date: string;
    scheduled_time: string | null;
    status: ContentStatus;
    description: string | null;
    assigned_to: string | null;
    color: string | null;
    image_paths: string[];
    created_by: string | null;
    updated_at: string;
}
export const CONTENT_COLUMNS = 'id,title,type,platform,scheduled_date,scheduled_time,status,description,assigned_to,color,image_paths,created_by,updated_at';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Огноо буруу байна');
const dayNumber = (value: string) => Date.parse(`${value}T00:00:00Z`) / 86_400_000;
export const ContentRangeSchema = z.object({ from: day, to: day })
    .refine(value => value.to >= value.from && dayNumber(value.to) - dayNumber(value.from) <= 92, '93 хүртэл өдрийн хугацаа сонгоно уу');

const imagePaths = z.array(z.string().refine(value => !!parseReportMediaPath(value), 'Зургийн зам буруу байна')).max(6, 'Нэг контентод 6 хүртэл зураг')
    .refine(paths => new Set(paths).size === paths.length, 'Ижил зураг давхардсан байна');
const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null).nullable();
const fields = {
    title: z.string().trim().min(1, 'Гарчиг оруулна уу').max(255),
    type: z.enum(CONTENT_TYPES),
    platform: z.enum(CONTENT_PLATFORMS).nullable(),
    scheduledDate: day,
    scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Цаг буруу байна').nullable(),
    status: z.enum(CONTENT_STATUSES),
    description: optionalText(2000),
    assignedTo: optionalText(120),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
    imagePaths,
};
export const ContentCreateSchema = z.object({
    ...fields,
    platform: fields.platform.default(null), scheduledTime: fields.scheduledTime.default(null), status: fields.status.default('planned'),
    description: fields.description.default(null), assignedTo: fields.assignedTo.default(null), color: fields.color.default(null), imagePaths: imagePaths.default([]),
}).strict();
export type ContentCreate = z.output<typeof ContentCreateSchema>;
export const ContentPatchSchema = z.object(Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])) as {
    [K in keyof typeof fields]: z.ZodOptional<(typeof fields)[K]>;
}).strict().refine(value => Object.values(value).some(field => field !== undefined), 'Өөрчлөх зүйлээ сонгоно уу');
export type ContentPatch = z.output<typeof ContentPatchSchema>;

/** Хугацааны төлөвлөгөөний гүйцэтгэл. Цуцалсан контент төлөвлөгөөнд тооцогдохгүй. */
export function summarizeContentPlan(items: readonly ContentItem[], range: { from: string; to: string }, today: string) {
    const inRange = items.filter(item => item.scheduled_date >= range.from && item.scheduled_date <= range.to);
    const planned = inRange.filter(item => item.status !== 'cancelled');
    const published = planned.filter(item => item.status === 'published');
    const open = planned.filter(item => item.status !== 'published');
    const overdue = open.filter(item => item.scheduled_date < today);
    const byType = CONTENT_TYPES.map(type => ({
        type, label: CONTENT_TYPE_LABEL[type],
        planned: planned.filter(item => item.type === type).length,
        published: published.filter(item => item.type === type).length,
    })).filter(row => row.planned > 0);
    return {
        planned: planned.length,
        published: published.length,
        inProgress: open.filter(item => item.status === 'in_progress' || item.status === 'ready').length,
        overdue: overdue.length,
        cancelled: inRange.length - planned.length,
        pct: planned.length ? Math.round(published.length / planned.length * 100) : null,
        byType,
        items: [...inRange].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '') || a.title.localeCompare(b.title, 'mn')),
        overdueItems: overdue,
    };
}
export type ContentPlanSummary = ReturnType<typeof summarizeContentPlan>;
