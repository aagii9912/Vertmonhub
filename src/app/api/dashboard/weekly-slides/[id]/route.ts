import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId, getUserShop } from '@/lib/auth/supabase-auth';
import { requireModuleDelete, requireModuleWrite, resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { WEEKLY_SLIDE_PART_MODULE, WeeklySlidePatchSchema, type WeeklySlide } from '@/lib/dashboard/weekly-slides';
import {
    deleteWeeklySlide, getWeeklySlide, removeUnusedMedia, slideActor, slideDatabaseError, updateWeeklySlide,
} from '@/lib/dashboard/weekly-slides-store';
import { logger } from '@/lib/utils/logger';

const headers = { 'Cache-Control': 'private, no-store' };
type Params = { params: Promise<{ id: string }> };

type Loaded =
    | { ok: false; response: Response }
    | { ok: true; db: ReturnType<typeof supabaseAdmin>; shopId: string; userId: string; slide: WeeklySlide };

/** Слайдыг shop-оор нь уншаад хэсгийн модулийн бичих эрхийг шалгана. */
async function load(params: Params['params']): Promise<Loaded> {
    if (!await resolvePermissions()) return { ok: false, response: NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 }) };
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return { ok: false, response: NextResponse.json({ error: 'Слайд олдсонгүй' }, { status: 404 }) };
    const [shop, userId] = await Promise.all([getUserShop(), getUserId()]);
    if (!userId) return { ok: false, response: NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 }) };
    if (!shop) return { ok: false, response: NextResponse.json({ error: 'Байгууллагад хандах эрх олдсонгүй' }, { status: 403 }) };
    const db = supabaseAdmin();
    const found = await getWeeklySlide(db, shop.id, id);
    if ('error' in found) return { ok: false, response: slideDatabaseError(found.error) };
    if (!('slide' in found)) return { ok: false, response: NextResponse.json({ error: 'Слайд олдсонгүй' }, { status: 404 }) };
    const denied = await requireModuleWrite(WEEKLY_SLIDE_PART_MODULE[found.slide.part]);
    if (denied) return { ok: false, response: denied };
    return { ok: true, db, shopId: shop.id, userId, slide: found.slide };
}

export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const loaded = await load(params);
        if (!loaded.ok) return loaded.response;
        const parsed = WeeklySlidePatchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Слайдын мэдээллээ шалгана уу.' }, { status: 400 });
        const actor = await slideActor(loaded.db, loaded.userId);
        if ('error' in actor) return slideDatabaseError(actor.error);
        const result = await updateWeeklySlide(loaded.db, loaded.shopId, actor, loaded.slide, parsed.data);
        if ('invalid' in result) return NextResponse.json({ error: result.invalid }, { status: 409 });
        if ('error' in result) return slideDatabaseError(result.error);
        if ('notFound' in result) return NextResponse.json({ error: 'Слайд олдсонгүй' }, { status: 404 });
        await removeUnusedMedia(loaded.db, loaded.shopId, result.removed).catch(error => logger.error('[weekly-slides] media cleanup failed', { error }));
        return NextResponse.json({ slide: result.slide }, { headers });
    } catch (error) {
        return safeErrorResponse(error, 'Слайдыг хадгалж чадсангүй.');
    }
}

/** Өөрийн оруулсан слайдыг бичих эрхээр, бусдынхыг устгах эрхээр устгана. */
export async function DELETE(_request: NextRequest, { params }: Params) {
    try {
        const loaded = await load(params);
        if (!loaded.ok) return loaded.response;
        if (loaded.slide.author_id !== loaded.userId) {
            const denied = await requireModuleDelete(WEEKLY_SLIDE_PART_MODULE[loaded.slide.part]);
            if (denied) return denied;
        }
        const result = await deleteWeeklySlide(loaded.db, loaded.shopId, loaded.slide);
        if ('error' in result) return slideDatabaseError(result.error);
        if (!('removed' in result)) return NextResponse.json({ error: 'Слайд олдсонгүй' }, { status: 404 });
        await removeUnusedMedia(loaded.db, loaded.shopId, result.removed).catch(error => logger.error('[weekly-slides] media cleanup failed', { error }));
        return NextResponse.json({ ok: true }, { headers });
    } catch (error) {
        return safeErrorResponse(error, 'Слайдыг устгаж чадсангүй.');
    }
}
