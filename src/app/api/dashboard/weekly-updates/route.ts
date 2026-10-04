import { NextRequest, NextResponse } from 'next/server';
import { getUserId, getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite, resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { meetingDateSchema } from '@/lib/dashboard/weekly-review';
import { listWeeklyUpdates, saveWeeklyUpdate } from '@/lib/dashboard/weekly-updates';
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
        const result = await listWeeklyUpdates(supabaseAdmin(), shop.id, date.data, { userId, canViewTeam });
        if ('error' in result) return databaseError(result.error);
        return NextResponse.json({ updates: result.updates, canViewTeam }, { headers });
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
        // shop_id, user_id, author_name-ийг хэрэглэгчийн body-оос авахгүй.
        const result = await saveWeeklyUpdate(supabaseAdmin(), shop.id, userId, await request.json().catch(() => null));
        if ('invalid' in result) return NextResponse.json({ error: 'Огноо, текстээ шалгана уу. Хэсэг тус бүр 4000 хүртэл тэмдэгттэй байна.' }, { status: 400 });
        if ('error' in result) return databaseError(result.error);
        return NextResponse.json({ update: result.update }, { headers });
    } catch (error) {
        return safeErrorResponse(error, 'Ажлын шинэчлэлийг хадгалж чадсангүй.');
    }
}
