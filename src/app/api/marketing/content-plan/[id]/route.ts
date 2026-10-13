import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId } from '@/lib/auth/supabase-auth';
import { requireModuleDelete } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import { ContentPatchSchema } from '@/lib/marketing/content-plan';
import { deleteContent, getContent, updateContent } from '@/lib/marketing/content-plan-store';
import { removeUnusedMedia } from '@/lib/dashboard/weekly-slides-store';
import { logger } from '@/lib/utils/logger';

/** Контентын төлөв (төлөвлөсөн → нийтэлсэн), огноо, хариуцагч, постер засах; устгах. */
const headers = { 'Cache-Control': 'private, no-store' };
const failed = (error: unknown, message: string) => {
    logger.error(`[content-plan] ${message}`, { error });
    return NextResponse.json({ error: message }, { status: 500 });
};

export const PATCH = withRoute<{ id: string }>({ module: 'marketing-roi', access: 'write', error: 'Контентыг хадгалж чадсангүй' }, async ({ request, shop, params }) => {
    if (!z.uuid().safeParse(params.id).success) return NextResponse.json({ error: 'Контент олдсонгүй' }, { status: 404 });
    const parsed = ContentPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Контентын мэдээллээ шалгана уу' }, { status: 400 });
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const db = supabaseAdmin();
    const found = await getContent(db, shop.id, params.id);
    if ('error' in found) return failed(found.error, 'Контентыг хадгалж чадсангүй');
    if (!('item' in found)) return NextResponse.json({ error: 'Контент олдсонгүй' }, { status: 404 });
    const result = await updateContent(db, shop.id, userId, found.item, parsed.data);
    if ('invalid' in result) return NextResponse.json({ error: result.invalid }, { status: 409 });
    if (!('item' in result)) return failed('error' in result ? result.error : null, 'Контентыг хадгалж чадсангүй');
    await removeUnusedMedia(db, shop.id, result.removed).catch(error => logger.error('[content-plan] media cleanup failed', { error }));
    return NextResponse.json({ item: result.item }, { headers });
});

/** Өөрийн үүсгэсэн контентыг бичих эрхээр, бусдынхыг устгах эрхээр. Эс бөгөөс «Цуцалсан» төлөв тавина. */
export const DELETE = withRoute<{ id: string }>({ module: 'marketing-roi', access: 'write', error: 'Контентыг устгаж чадсангүй' }, async ({ shop, params }) => {
    if (!z.uuid().safeParse(params.id).success) return NextResponse.json({ error: 'Контент олдсонгүй' }, { status: 404 });
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const db = supabaseAdmin();
    const found = await getContent(db, shop.id, params.id);
    if ('error' in found) return failed(found.error, 'Контентыг устгаж чадсангүй');
    if (!('item' in found)) return NextResponse.json({ error: 'Контент олдсонгүй' }, { status: 404 });
    if (found.item.created_by !== userId) {
        const denied = await requireModuleDelete('marketing-roi');
        if (denied) return denied;
    }
    const result = await deleteContent(db, shop.id, found.item);
    if (!('removed' in result)) return failed('error' in result ? result.error : null, 'Контентыг устгаж чадсангүй');
    await removeUnusedMedia(db, shop.id, result.removed).catch(error => logger.error('[content-plan] media cleanup failed', { error }));
    return NextResponse.json({ ok: true }, { headers });
});
