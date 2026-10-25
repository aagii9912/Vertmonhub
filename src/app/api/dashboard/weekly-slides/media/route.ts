import { NextRequest, NextResponse } from 'next/server';
import { assertShopAccess, getUserId, getUserShop } from '@/lib/auth/supabase-auth';
import { requireModuleWrite, resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import {
    parseReportMediaPath, REPORT_MEDIA_BUCKET, REPORT_MEDIA_TYPES, reportMediaUrl, WEEKLY_SLIDE_LIMITS, WEEKLY_SLIDE_PART_MODULE, WEEKLY_SLIDE_PARTS,
    type WeeklySlidePart,
} from '@/lib/dashboard/weekly-slides';
import { mediaParts } from '@/lib/dashboard/weekly-slides-store';
import { sniffReportImage } from '@/lib/dashboard/report-media';

/**
 * Хурлын слайдын зураг (постер, дэлгэцийн зураг) — хувийн `report-media` bucket.
 * POST: хэсгийн бичих эрхтэй хэрэглэгч JPEG/PNG (≤ 4 MB) оруулна; төрлийг файлын эхний байтаас тогтооно.
 * GET: нэвтрэлт, shop-ийн гишүүнчлэл, зураг хадгалагдсан слайдын хэсгийн модулийг татах бүрд шалгана.
 * Слайдад хараахан ороогүй зургийг зөвхөн оруулсан хүн харна.
 */

export async function POST(request: NextRequest) {
    try {
        if (!await resolvePermissions()) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const form = await request.formData().catch(() => null);
        const part = form?.get('part');
        const file = form?.get('file');
        if (typeof part !== 'string' || !(WEEKLY_SLIDE_PARTS as readonly string[]).includes(part)) {
            return NextResponse.json({ error: 'Слайдын хэсгийг сонгоно уу' }, { status: 400 });
        }
        const denied = await requireModuleWrite(WEEKLY_SLIDE_PART_MODULE[part as WeeklySlidePart]);
        if (denied) return denied;
        if (!(file instanceof File)) return NextResponse.json({ error: 'Зураг олдсонгүй' }, { status: 400 });
        if (file.size > WEEKLY_SLIDE_LIMITS.imageBytes) return NextResponse.json({ error: 'Зургийн хэмжээ 4MB-аас хэтэрсэн байна' }, { status: 400 });
        const bytes = new Uint8Array(await file.arrayBuffer());
        const type = sniffReportImage(bytes);
        if (!type) return NextResponse.json({ error: 'Зөвхөн JPEG эсвэл PNG зураг оруулна' }, { status: 400 });
        const [shop, userId] = await Promise.all([getUserShop(), getUserId()]);
        if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        if (!shop) return NextResponse.json({ error: 'Байгууллагад хандах эрх олдсонгүй' }, { status: 403 });
        const path = `${shop.id}/${userId}/${crypto.randomUUID()}.${REPORT_MEDIA_TYPES[type]}`;
        const { error } = await supabaseAdmin().storage.from(REPORT_MEDIA_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
        if (error) {
            logger.error('[weekly-slides] media upload failed', { error });
            return NextResponse.json({ error: 'Зургийг хадгалж чадсангүй. Дахин оролдоно уу.' }, { status: 500 });
        }
        return NextResponse.json({ path, url: reportMediaUrl(path) }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        logger.error('[weekly-slides] media upload error', { error });
        return NextResponse.json({ error: 'Зургийг хадгалж чадсангүй. Дахин оролдоно уу.' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const [access, userId] = await Promise.all([resolvePermissions(), getUserId()]);
        if (!access || !userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const params = request.nextUrl.searchParams.getAll('path');
        const parsed = params.length === 1 ? parseReportMediaPath(params[0]) : null;
        if (!parsed) return NextResponse.json({ error: 'Зургийн хаяг буруу байна' }, { status: 400 });
        if (!await assertShopAccess(parsed.shopId)) return NextResponse.json({ error: 'Зураг олдсонгүй' }, { status: 404 });
        const db = supabaseAdmin();
        const usage = await mediaParts(db, parsed.shopId, parsed.path);
        if ('error' in usage) throw usage.error;
        const canRead = (part: WeeklySlidePart) => access.role === 'super_admin' || access.permissions.modules.includes(WEEKLY_SLIDE_PART_MODULE[part]);
        const allowed = usage.parts.length ? usage.parts.some(canRead) : parsed.userId === userId;
        if (!allowed) return NextResponse.json({ error: 'Зураг харах эрх танд алга' }, { status: 403 });
        const { data, error } = await db.storage.from(REPORT_MEDIA_BUCKET).download(parsed.path);
        if (error || !data) return NextResponse.json({ error: 'Зураг олдсонгүй' }, { status: 404 });
        if (!REPORT_MEDIA_TYPES[data.type] || data.size > WEEKLY_SLIDE_LIMITS.imageBytes) return NextResponse.json({ error: 'Зургийн төрөл буруу байна' }, { status: 400 });
        return new Response(data, { headers: {
            'Content-Type': data.type,
            'Content-Disposition': 'inline',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        } });
    } catch (error) {
        logger.error('[weekly-slides] media download error', { error });
        return NextResponse.json({ error: 'Зургийг татаж чадсангүй' }, { status: 500 });
    }
}
