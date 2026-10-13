import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import { ContentCreateSchema, ContentRangeSchema } from '@/lib/marketing/content-plan';
import { createContent, listContent } from '@/lib/marketing/content-plan-store';
import { logger } from '@/lib/utils/logger';

/**
 * Маркетингийн контент төлөвлөгөө (Контент календарь). Унших/бичих = marketing-roi.
 *   GET  /api/marketing/content-plan?from=YYYY-MM-DD&to=YYYY-MM-DD   (≤ 93 өдөр)
 *   POST /api/marketing/content-plan   { title, type, platform, scheduledDate, status, assignedTo, description, imagePaths }
 */
const headers = { 'Cache-Control': 'private, no-store' };

export const GET = withRoute({ module: 'marketing-roi', error: 'Контент төлөвлөгөөг уншиж чадсангүй' }, async ({ request, shop }) => {
    const range = ContentRangeSchema.safeParse({ from: request.nextUrl.searchParams.get('from'), to: request.nextUrl.searchParams.get('to') });
    if (!range.success) return NextResponse.json({ error: range.error.issues[0]?.message || 'Хугацаагаа шалгана уу' }, { status: 400 });
    const result = await listContent(supabaseAdmin(), shop.id, range.data);
    if ('error' in result) {
        logger.error('[content-plan] list failed', { error: result.error });
        return NextResponse.json({ error: 'Контент төлөвлөгөөг уншиж чадсангүй' }, { status: 500 });
    }
    return NextResponse.json({ items: result.items }, { headers });
});

export const POST = withRoute({ module: 'marketing-roi', access: 'write', error: 'Контентыг хадгалж чадсангүй' }, async ({ request, shop }) => {
    const parsed = ContentCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Контентын мэдээллээ шалгана уу' }, { status: 400 });
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const result = await createContent(supabaseAdmin(), shop.id, userId, parsed.data);
    if ('invalid' in result) return NextResponse.json({ error: result.invalid }, { status: 400 });
    if ('error' in result || 'notFound' in result) {
        if ('error' in result) logger.error('[content-plan] create failed', { error: result.error });
        return NextResponse.json({ error: 'Контентыг хадгалж чадсангүй' }, { status: 500 });
    }
    return NextResponse.json({ item: result.item }, { status: 201, headers });
});
