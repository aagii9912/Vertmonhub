import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { getAdminUser } from '@/lib/admin/auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getManagerYearData } from '@/lib/sales/targets';

/**
 * Борлуулалтын менежерийн төлөвлөгөө (admin only).
 *
 * GET  /api/admin/sales-targets?shopId=&year=
 *      → тухайн shop-ийн менежер бүрийн 12 сарын төлөвлөгөө (₮) + гүйцэтгэл,
 *        мөн акаунттай холбоход зориулсан багийн гишүүдийн жагсаалт.
 * POST /api/admin/sales-targets
 *      body: { shopId, year, sales_manager, user_id?, months:number[12] }
 *      → 12 сарын төлөвлөгөөг upsert хийнэ.
 * DELETE /api/admin/sales-targets?shopId=&year=&manager=
 *      → тухайн менежерийн жилийн бүх төлөвлөгөөг устгана.
 */

export async function GET(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const admin = await getAdminUser();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const sp = request.nextUrl.searchParams;
        const shopId = sp.get('shopId');
        if (!shopId) return NextResponse.json({ error: 'shopId шаардлагатай' }, { status: 400 });
        const year = Number(sp.get('year')) || new Date().getFullYear();

        const supabase = supabaseAdmin();

        // Менежер бүрийн жилийн төлөвлөгөө + гүйцэтгэл
        const yearData = await getManagerYearData(supabase, shopId, year);

        // Гэрээнд орсон менежерүүд (гүйцэтгэлгүй ч төлөвлөгөө оруулж болохоор)
        const { data: perfRows } = await supabase
            .from('manager_performance')
            .select('sales_manager')
            .eq('shop_id', shopId);

        // Багийн гишүүд (акаунттай холбох / шинэ менежер нэмэх сонголтод)
        const { data: memberRows } = await supabase
            .from('shop_members')
            .select('user_id')
            .eq('shop_id', shopId);
        const memberIds = (memberRows || []).map((m) => m.user_id);
        let teamMembers: Array<{ id: string; full_name: string }> = [];
        if (memberIds.length) {
            const { data: profiles } = await supabase
                .from('user_profiles')
                .select('id, full_name, email')
                .in('id', memberIds);
            teamMembers = (profiles || []).map((p) => ({
                id: p.id,
                full_name: p.full_name || p.email || 'Нэргүй',
            }));
        }

        // Менежерийн нэрсийн нэгдэл: төлөвлөгөө + гэрээ + гишүүд
        const byName = new Map(yearData.map((m) => [m.sales_manager, m]));
        for (const r of perfRows || []) {
            if (r.sales_manager && !byName.has(r.sales_manager)) {
                byName.set(r.sales_manager, {
                    sales_manager: r.sales_manager,
                    user_id: null,
                    targets: Array(12).fill(0),
                    actuals: Array(12).fill(0),
                    counts: Array(12).fill(0),
                });
            }
        }

        const managers = Array.from(byName.values()).sort((a, b) =>
            a.sales_manager.localeCompare(b.sales_manager, 'mn'),
        );

        return NextResponse.json({ year, managers, teamMembers });
    } catch (error) {
        return safeErrorResponse(error, 'Төлөвлөгөө татахад алдаа гарлаа');
    }
}

export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const admin = await getAdminUser();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const body = await request.json();
        const shopId: string | undefined = body.shopId;
        const salesManager: string | undefined = body.sales_manager?.trim();
        const year = Number(body.year);
        const userLink: string | null = body.user_id || null;
        const months: unknown = body.months;

        if (!shopId || !salesManager || !year || !Array.isArray(months) || months.length !== 12) {
            return NextResponse.json(
                { error: 'shopId, sales_manager, year, months[12] шаардлагатай' },
                { status: 400 },
            );
        }

        const supabase = supabaseAdmin();

        const rows = (months as unknown[]).map((v, i) => ({
            shop_id: shopId,
            sales_manager: salesManager,
            user_id: userLink,
            year,
            month: i + 1,
            target_amount: Math.max(0, Number(v) || 0),
        }));

        const { error } = await supabase
            .from('sales_targets')
            .upsert(rows, { onConflict: 'shop_id,sales_manager,year,month' });

        if (error) return safeErrorResponse(error, 'Төлөвлөгөө хадгалахад алдаа гарлаа');

        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Төлөвлөгөө хадгалахад алдаа гарлаа');
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const admin = await getAdminUser();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const sp = request.nextUrl.searchParams;
        const shopId = sp.get('shopId');
        const manager = sp.get('manager');
        const year = Number(sp.get('year'));
        if (!shopId || !manager || !year) {
            return NextResponse.json({ error: 'shopId, manager, year шаардлагатай' }, { status: 400 });
        }

        const supabase = supabaseAdmin();
        const { error } = await supabase
            .from('sales_targets')
            .delete()
            .eq('shop_id', shopId)
            .eq('sales_manager', manager)
            .eq('year', year);

        if (error) return safeErrorResponse(error, 'Төлөвлөгөө устгахад алдаа гарлаа');

        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Төлөвлөгөө устгахад алдаа гарлаа');
    }
}
