import { NextRequest, NextResponse } from 'next/server';
import { getUserId, getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite, resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { WEEKLY_SLIDE_PART_MODULE, WeeklySlideCopySchema } from '@/lib/dashboard/weekly-slides';
import { copyPreviousSlides, previousTextSlides, slideActor, slideDatabaseError } from '@/lib/dashboard/weekly-slides-store';

/**
 * «Өмнөх хурлаас хуулах» — тухайн хэсэг × сэдвийн өмнөх хурлын зураггүй слайдууд (жишээ нь «Энэ сард хийгдэх ажил»).
 * GET ?meetingDate=&part=&section= — хуулах слайдын жагсаалт (хэсгийн унших эрх).
 * POST { meetingDate, part, section } — энэ хуралд хуулна (хэсгийн бичих эрх). shop, зохиогчийг серверээс авна.
 * Зурагтай слайд хуулагдахгүй: зургийн файл оруулсан хүнийх.
 */
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
    try {
        if (!await resolvePermissions()) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const params = request.nextUrl.searchParams;
        const parsed = WeeklySlideCopySchema.safeParse({ meetingDate: params.get('meetingDate'), part: params.get('part'), section: params.get('section') });
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Хурал, хэсэг, сэдвээ сонгоно уу.' }, { status: 400 });
        const denied = await requireModule(WEEKLY_SLIDE_PART_MODULE[parsed.data.part]);
        if (denied) return denied;
        const shop = await getUserShop();
        if (!shop) return NextResponse.json({ error: 'Байгууллагад хандах эрх олдсонгүй' }, { status: 403 });
        const result = await previousTextSlides(supabaseAdmin(), shop.id, parsed.data.meetingDate, parsed.data.part, parsed.data.section);
        if ('error' in result) return slideDatabaseError(result.error);
        return NextResponse.json(result, { headers });
    } catch (error) {
        return safeErrorResponse(error, 'Өмнөх хурлын слайдыг уншиж чадсангүй.');
    }
}

export async function POST(request: NextRequest) {
    try {
        if (!await resolvePermissions()) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const parsed = WeeklySlideCopySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Хурал, хэсэг, сэдвээ сонгоно уу.' }, { status: 400 });
        const denied = await requireModuleWrite(WEEKLY_SLIDE_PART_MODULE[parsed.data.part]);
        if (denied) return denied;
        const [shop, userId] = await Promise.all([getUserShop(), getUserId()]);
        if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        if (!shop) return NextResponse.json({ error: 'Байгууллагад хандах эрх олдсонгүй' }, { status: 403 });
        const db = supabaseAdmin();
        const actor = await slideActor(db, userId);
        if ('error' in actor) return slideDatabaseError(actor.error);
        const result = await copyPreviousSlides(db, shop.id, actor, parsed.data);
        if ('invalid' in result) return NextResponse.json({ error: result.invalid }, { status: 409 });
        if ('error' in result) return slideDatabaseError(result.error);
        if ('notFound' in result) return NextResponse.json({ error: 'Слайд олдсонгүй' }, { status: 404 });
        return NextResponse.json(result, { status: result.copied.length ? 201 : 200, headers });
    } catch (error) {
        return safeErrorResponse(error, 'Слайдыг хуулж чадсангүй.');
    }
}
