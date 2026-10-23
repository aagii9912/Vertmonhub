import { NextRequest, NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { assertShopAccess, getUserId } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import {
    brandingMediaUrl, parseBrandingMediaPath, REPORT_MEDIA_BUCKET, REPORT_MEDIA_TYPES, sniffReportImage,
} from '@/lib/dashboard/report-media';
import { WEEKLY_SLIDE_LIMITS } from '@/lib/dashboard/weekly-slides';

/**
 * Илтгэлийн брэнд зураг (нүүрний зураг, лого) — хувийн `report-media` bucket, `branding/<shop_id>/<uuid>.<jpg|png>`.
 * POST: settings write — JPEG/PNG (≤ 4 MB), төрлийг файлын эхний байтаас тогтооно; брэндэд PUT-аар хадгална.
 * GET: нэвтрэлт, замын shop-ийн гишүүнчлэл, reports (эсвэл settings) модулийг татах бүрд шалгана.
 */
export const POST = withRoute({ module: 'settings', access: 'write', error: 'Зургийг хадгалж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Зураг олдсонгүй' }, { status: 400 });
    if (file.size > WEEKLY_SLIDE_LIMITS.imageBytes) return NextResponse.json({ error: 'Зургийн хэмжээ 4MB-аас хэтэрсэн байна' }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffReportImage(bytes);
    if (!type) return NextResponse.json({ error: 'Зөвхөн JPEG эсвэл PNG зураг оруулна' }, { status: 400 });
    const path = `branding/${shop.id}/${crypto.randomUUID()}.${REPORT_MEDIA_TYPES[type]}`;
    const { error } = await supabaseAdmin().storage.from(REPORT_MEDIA_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
    if (error) {
        logger.error('[report-branding] media upload failed', { error });
        return NextResponse.json({ error: 'Зургийг хадгалж чадсангүй. Дахин оролдоно уу.' }, { status: 500 });
    }
    return NextResponse.json({ path, url: brandingMediaUrl(path) }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
});

export async function GET(request: NextRequest) {
    try {
        const [access, userId] = await Promise.all([resolvePermissions(), getUserId()]);
        if (!access || !userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const params = request.nextUrl.searchParams.getAll('path');
        const parsed = params.length === 1 ? parseBrandingMediaPath(params[0]) : null;
        if (!parsed) return NextResponse.json({ error: 'Зургийн хаяг буруу байна' }, { status: 400 });
        if (!await assertShopAccess(parsed.shopId)) return NextResponse.json({ error: 'Зураг олдсонгүй' }, { status: 404 });
        const allowed = access.role === 'super_admin' || ['reports', 'settings'].some(module => access.permissions.modules.includes(module));
        if (!allowed) return NextResponse.json({ error: 'Зураг харах эрх танд алга' }, { status: 403 });
        const { data, error } = await supabaseAdmin().storage.from(REPORT_MEDIA_BUCKET).download(parsed.path);
        if (error || !data) return NextResponse.json({ error: 'Зураг олдсонгүй' }, { status: 404 });
        if (!REPORT_MEDIA_TYPES[data.type] || data.size > WEEKLY_SLIDE_LIMITS.imageBytes) return NextResponse.json({ error: 'Зургийн төрөл буруу байна' }, { status: 400 });
        return new Response(data, { headers: {
            'Content-Type': data.type,
            'Content-Disposition': 'inline',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        } });
    } catch (error) {
        logger.error('[report-branding] media download error', { error });
        return NextResponse.json({ error: 'Зургийг татаж чадсангүй' }, { status: 500 });
    }
}
