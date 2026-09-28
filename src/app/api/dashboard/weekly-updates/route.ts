import { NextRequest, NextResponse } from 'next/server';
import { getUserId, getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite, resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { meetingDateSchema, WeeklyUpdateSchema } from '@/lib/dashboard/weekly-review';

const COLUMNS = 'id,user_id,author_name,meeting_date,achievements,blockers,next_steps,updated_at';
const headers = { 'Cache-Control': 'private, no-store' };

function databaseError(error: { code?: string; message: string }) {
    if (['42P01', 'PGRST205'].includes(error.code || '')) {
        return NextResponse.json({ error: 'Ажлын шинэчлэл хадгалах хэсэг хараахан идэвхжээгүй байна. Админд хандаж шинэчлэлийг суулгана уу.' }, { status: 503 });
    }
    return safeErrorResponse(error, 'Ажлын шинэчлэлийг хадгалах эсвэл уншихад алдаа гарлаа.');
}

export async function GET(request: NextRequest) {
    try {
        const denied = await requireModule('dashboard');
        if (denied) return denied;
        const [shop, userId, permissions] = await Promise.all([getUserShop(), getUserId(), resolvePermissions()]);
        if (!userId || !permissions) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        if (!shop) return NextResponse.json({ error: 'Байгууллагад хандах эрх олдсонгүй.' }, { status: 403 });
        const date = meetingDateSchema.safeParse(request.nextUrl.searchParams.get('meetingDate'));
        if (!date.success) return NextResponse.json({ error: 'Лхагва гарагийн огноо сонгоно уу.' }, { status: 400 });
        const canViewTeam = permissions.role === 'super_admin' || permissions.permissions.modules.includes('reports');
        const db = supabaseAdmin();
        const updates = [];
        // Багийн бүх шинэчлэлийг уншина; PostgREST-ийн 1000 мөрийн хязгаарт таслахгүй.
        for (let offset = 0; ; offset += 500) {
            let query = db.from('weekly_updates').select(COLUMNS).eq('shop_id', shop.id).eq('meeting_date', date.data);
            if (!canViewTeam) query = query.eq('user_id', userId);
            const { data, error } = await query.order('id').range(offset, offset + 499);
            if (error) return databaseError(error);
            updates.push(...(data || []));
            if (!data || data.length < 500) break;
        }
        return NextResponse.json({ updates, canViewTeam }, { headers });
    } catch (error) {
        return safeErrorResponse(error, 'Ажлын шинэчлэлийг уншиж чадсангүй.');
    }
}

export async function PUT(request: NextRequest) {
    try {
        const denied = await requireModuleWrite('dashboard');
        if (denied) return denied;
        const [shop, userId] = await Promise.all([getUserShop(), getUserId()]);
        if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        if (!shop) return NextResponse.json({ error: 'Байгууллагад хандах эрх олдсонгүй.' }, { status: 403 });
        const parsed = WeeklyUpdateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Огноо, текстээ шалгана уу. Хэсэг тус бүр 4000 хүртэл тэмдэгттэй байна.' }, { status: 400 });
        const db = supabaseAdmin();
        const profile = await db.from('user_profiles').select('full_name').eq('id', userId).maybeSingle();
        if (profile.error) return databaseError(profile.error);
        const { meetingDate, achievements, blockers, nextSteps } = parsed.data;
        // shop_id, user_id, author_name-ийг хэрэглэгчийн body-оос авахгүй.
        const { data, error } = await db.from('weekly_updates').upsert({
            shop_id: shop.id, user_id: userId, author_name: profile.data?.full_name || 'Багийн гишүүн',
            meeting_date: meetingDate, achievements, blockers, next_steps: nextSteps,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'shop_id,user_id,meeting_date' }).select(COLUMNS).single();
        if (error) return databaseError(error);
        return NextResponse.json({ update: data }, { headers });
    } catch (error) {
        return safeErrorResponse(error, 'Ажлын шинэчлэлийг хадгалж чадсангүй.');
    }
}
