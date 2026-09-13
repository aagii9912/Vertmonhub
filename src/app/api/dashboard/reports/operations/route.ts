import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { ZodError } from 'zod';
import { loadOperationsReport } from '@/lib/dashboard/operations-report-load';

/** Read-only source report. Failed reads fail the report, rather than becoming zero KPIs. */
export async function GET(request: NextRequest) {
    try {
        const permissions = await resolvePermissions();
        if (!permissions) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const isSuperAdmin = permissions.role === 'super_admin';
        if (!isSuperAdmin && !permissions.permissions.modules.includes('reports')) {
            return NextResponse.json({ error: 'Тайлан харах эрх шаардлагатай' }, { status: 403 });
        }
        const shop = await getUserShop();
        if (!shop) return NextResponse.json({ error: 'Төсөлд хандах эрх олдсонгүй' }, { status: 403 });
        const query = request.nextUrl.searchParams;
        const report = await loadOperationsReport(supabaseAdmin(), {
            shopId: shop.id, shopName: shop.name,
            canReadFinance: isSuperAdmin || permissions.permissions.modules.includes('finance'),
            from: query.get('from'), to: query.get('to'),
        });
        return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        if (error instanceof ZodError) return NextResponse.json({ error: 'Огнооны хязгаар буруу байна. 367 хүртэл өдөр сонгоно уу.' }, { status: 400 });
        logger.error('[Operations Report] Read failed', { error });
        return NextResponse.json({ error: 'Тайлангийн эх өгөгдлийг бүрэн татаж чадсангүй. Дахин оролдоно уу.' }, { status: 500 });
    }
}
