import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMarketingPerformance } from '@/lib/marketing/performance-load';
import { exportMarketingPerformance } from '@/lib/marketing/performance-export';
import { safeErrorResponse } from '@/lib/utils/safe-error';

export async function GET(request: NextRequest) {
    try {
        const denied = await requireModule('marketing-roi');
        if (denied) return denied;
        const shop = await getUserShop();
        if (!shop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const params = request.nextUrl.searchParams;
        const { report } = await loadMarketingPerformance(supabaseAdmin(), shop.id, { from: params.get('from') ?? undefined, to: params.get('to') ?? undefined, project: params.get('project') ?? undefined });
        return new NextResponse(await exportMarketingPerformance(report), { headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="Marketing-${report.range.from}-${report.range.to}.xlsx"`,
            'Cache-Control': 'private, no-store',
        } });
    } catch (error) {
        if (error instanceof ZodError) return NextResponse.json({ error: 'Тайлангийн хугацаа буруу байна' }, { status: 400 });
        return safeErrorResponse(error, 'Excel тайлан үүсгэж чадсангүй');
    }
}
