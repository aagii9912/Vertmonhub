import { dashboardFetch } from '@/lib/api/dashboardFetch';
import { WEEKLY_SLIDE_LIMITS, type WeeklySlidePart } from './weekly-slides';

/**
 * Хурлын слайдын зургийг хөтөч дээр бэлдэж оруулна. PowerPoint-д найдвартай орох JPEG/PNG л
 * хадгална: жижиг JPEG/PNG-ийг хэвээр нь, бусдыг (WEBP, GIF, том дэлгэцийн зураг) 2400px хүртэл
 * багасгаж JPEG болгоно — Vercel-ийн 4.5MB хүсэлтийн хязгаараас хэтрэхгүй.
 */
const KEEP_BYTES = 3.5 * 1024 * 1024;
const KEEP_EDGE = 3200;

async function decode(file: Blob): Promise<ImageBitmap> {
    try {
        return await createImageBitmap(file);
    } catch {
        throw new Error('Энэ зургийг уншиж чадсангүй. JPEG эсвэл PNG болгоод дахин оруулна уу.');
    }
}

async function encode(bitmap: ImageBitmap, edge: number, quality: number): Promise<Blob> {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Зургийг боловсруулж чадсангүй.');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Зургийг боловсруулж чадсангүй.');
    return blob;
}

export async function prepareReportImage(file: Blob): Promise<Blob> {
    if (!file.type.startsWith('image/')) throw new Error('Зөвхөн зураг оруулна.');
    const bitmap = await decode(file);
    try {
        const keep = (file.type === 'image/jpeg' || file.type === 'image/png') && file.size <= KEEP_BYTES && Math.max(bitmap.width, bitmap.height) <= KEEP_EDGE;
        if (keep) return file;
        for (const [edge, quality] of [[2400, 0.88], [2000, 0.8], [1600, 0.72]] as const) {
            const blob = await encode(bitmap, edge, quality);
            if (blob.size <= WEEKLY_SLIDE_LIMITS.imageBytes - 64 * 1024) return blob;
        }
        throw new Error('Зураг хэт том байна. Жижигрүүлээд дахин оруулна уу.');
    } finally {
        bitmap.close();
    }
}

export async function uploadReportImage(file: Blob, part: WeeklySlidePart): Promise<{ path: string; url: string }> {
    const prepared = await prepareReportImage(file);
    const form = new FormData();
    form.append('part', part);
    form.append('file', prepared, prepared.type === 'image/png' ? 'image.png' : 'image.jpg');
    const response = await dashboardFetch('/api/dashboard/weekly-slides/media', { method: 'POST', body: form });
    const body = await response.json().catch(() => null) as { path?: string; url?: string; error?: string } | null;
    if (!response.ok || !body?.path || !body.url) throw new Error(body?.error || 'Зургийг хадгалж чадсангүй.');
    return { path: body.path, url: body.url };
}
