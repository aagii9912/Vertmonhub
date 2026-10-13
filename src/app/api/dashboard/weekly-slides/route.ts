import { NextRequest, NextResponse } from 'next/server';
import { getUserId, getUserShop } from '@/lib/auth/supabase-auth';
import { requireModuleWrite, resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { meetingDateSchema } from '@/lib/dashboard/weekly-review';
import {
    WEEKLY_SLIDE_PART_MODULE, WEEKLY_SLIDE_PARTS, WeeklySlideCreateSchema, WeeklySlideOrderSchema, type WeeklySlidePart,
} from '@/lib/dashboard/weekly-slides';
import { createWeeklySlide, listWeeklySlides, reorderWeeklySlides, slideActor, slideDatabaseError } from '@/lib/dashboard/weekly-slides-store';

/**
 * Лхагвагийн хурлын нэмэлт слайд. Хэсэг бүр өөрийн модулийн эрхтэй:
 * борлуулалт = reports, маркетинг = marketing-roi. shop, зохиогчийг серверээс авна.
 */
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
    try {
        const access = await resolvePermissions();
        if (!access) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const date = meetingDateSchema.safeParse(request.nextUrl.searchParams.get('meetingDate'));
        if (!date.success) return NextResponse.json({ error: 'Лхагва гарагийн огноо сонгоно уу.' }, { status: 400 });
        const can = (part: WeeklySlidePart) => access.role === 'super_admin' || access.permissions.modules.includes(WEEKLY_SLIDE_PART_MODULE[part]);
        const parts = WEEKLY_SLIDE_PARTS.filter(can);
        if (!parts.length) return NextResponse.json({ error: 'Энэ хэсэгт хандах эрх танд алга' }, { status: 403 });
        const shop = await getUserShop();
        if (!shop) return NextResponse.json({ error: 'Байгууллагад хандах эрх олдсонгүй' }, { status: 403 });
        const result = await listWeeklySlides(supabaseAdmin(), shop.id, date.data, parts);
        if ('error' in result) return slideDatabaseError(result.error);
        return NextResponse.json({ slides: result.slides, parts }, { headers });
    } catch (error) {
        return safeErrorResponse(error, 'Слайдуудыг уншиж чадсангүй.');
    }
}

export async function POST(request: NextRequest) {
    try {
        if (!await resolvePermissions()) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const parsed = WeeklySlideCreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Слайдын мэдээллээ шалгана уу.' }, { status: 400 });
        const denied = await requireModuleWrite(WEEKLY_SLIDE_PART_MODULE[parsed.data.part]);
        if (denied) return denied;
        const [shop, userId] = await Promise.all([getUserShop(), getUserId()]);
        if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        if (!shop) return NextResponse.json({ error: 'Байгууллагад хандах эрх олдсонгүй' }, { status: 403 });
        const db = supabaseAdmin();
        const actor = await slideActor(db, userId);
        if ('error' in actor) return slideDatabaseError(actor.error);
        const result = await createWeeklySlide(db, shop.id, actor, parsed.data);
        if ('invalid' in result) return NextResponse.json({ error: result.invalid }, { status: 400 });
        if ('error' in result) return slideDatabaseError(result.error);
        if ('notFound' in result) return NextResponse.json({ error: 'Слайд олдсонгүй' }, { status: 404 });
        return NextResponse.json({ slide: result.slide }, { status: 201, headers });
    } catch (error) {
        return safeErrorResponse(error, 'Слайдыг хадгалж чадсангүй.');
    }
}

/** Дараалал солих: { meetingDate, part, ids } — хэсгийн бүх слайдын шинэ дараалал. */
export async function PUT(request: NextRequest) {
    try {
        if (!await resolvePermissions()) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const parsed = WeeklySlideOrderSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Слайдын дарааллыг шалгана уу.' }, { status: 400 });
        const denied = await requireModuleWrite(WEEKLY_SLIDE_PART_MODULE[parsed.data.part]);
        if (denied) return denied;
        const shop = await getUserShop();
        if (!shop) return NextResponse.json({ error: 'Байгууллагад хандах эрх олдсонгүй' }, { status: 403 });
        const result = await reorderWeeklySlides(supabaseAdmin(), shop.id, parsed.data.meetingDate, parsed.data.part, parsed.data.ids);
        if ('invalid' in result) return NextResponse.json({ error: result.invalid }, { status: 409 });
        if ('error' in result) return slideDatabaseError(result.error);
        return NextResponse.json({ ok: true }, { headers });
    } catch (error) {
        return safeErrorResponse(error, 'Слайдын дарааллыг хадгалж чадсангүй.');
    }
}
