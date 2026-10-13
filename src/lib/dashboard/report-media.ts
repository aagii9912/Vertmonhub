import { z } from 'zod';

/**
 * Хувийн `report-media` bucket-ийн зам (хурлын нэмэлт слайд, маркетингийн контентын постер).
 * Хамааралгүй жижиг модуль — weekly-slides ↔ weekly-review ↔ content-plan импортын тойрог үүсгэхгүй.
 */
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

