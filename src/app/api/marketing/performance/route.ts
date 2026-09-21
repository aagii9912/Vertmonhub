import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMarketingPerformance } from '@/lib/marketing/performance-load';
import { safeErrorResponse } from '@/lib/utils/safe-error';

export async function GET(request: NextRequest) {
    try {
        const denied = await requireModule('marketing-roi');
        if (denied) return denied;
        const shop = await getUserShop();
        if (!shop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const params = request.nextUrl.searchParams;
        return NextResponse.json(await loadMarketingPerformance(supabaseAdmin(), shop.id, {
            from: params.get('from') ?? undefined, to: params.get('to') ?? undefined, project: params.get('project') ?? undefined,
        }), { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        if (error instanceof ZodError) return NextResponse.json({ error: '367 хүртэл өдрийн зөв хугацаа, төсөл сонгоно уу.' }, { status: 400 });
        if (error instanceof Error && /does not exist|schema cache/i.test(error.message)) {
            return NextResponse.json({ error: 'Маркетингийн шинэ тайлан хараахан идэвхжээгүй байна. Админд хандаж шинэчлэлийг суулгана уу.' }, { status: 503 });
        }
        return safeErrorResponse(error, 'Тайлангийн мэдээллийг бүрэн татаж чадсангүй. Дахин оролдоно уу.');
    }
}
