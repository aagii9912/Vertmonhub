import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { getAdminUser } from '@/lib/admin/auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getTeamTargets, getMonthlyActualsByManager, sumYear } from '@/lib/sales/targets';

/**
 * Багийн борлуулалтын төлөвлөгөө + идэвхтэй менежерийн бүртгэл (admin only).
 *
 * GET  ?shopId=&year=
 *      → багийн 12 сарын төлөвлөгөө + гүйцэтгэл, all-time менежерүүд (идэвхтэй
 *        эсэх + жилийн борлуулалт), акаунт холбох багийн гишүүд.
 * POST body:{ shopId, year, months:number[12] }
 *      → багийн сарын төлөвлөгөөг upsert.
 * PUT  body:{ shopId, managers:[{name, is_active, user_id?}] }
 *      → менежерүүдийн идэвхтэй эсэхийг хадгална (акаунтыг нэрээр авто-холбоно).
 */

async function requireAdmin() {
    const userId = await getUserId();
    if (!userId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    const admin = await getAdminUser();
    if (!admin) return { error: NextResponse.json({ error: 'Admin required' }, { status: 403 }) };
    return { userId };
}

/** shop-ийн багийн гишүүд (нэр→id) — акаунт авто-холбоход. */
async function loadMembers(supabase: ReturnType<typeof supabaseAdmin>, shopId: string) {
    const { data: memberRows } = await supabase
        .from('shop_members')
        .select('user_id')
        .eq('shop_id', shopId);
    const ids = (memberRows || []).map((m) => m.user_id);
    if (!ids.length) return [] as Array<{ id: string; full_name: string }>;
    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', ids);
    return (profiles || []).map((p) => ({ id: p.id, full_name: p.full_name || p.email || 'Нэргүй' }));
}

export async function GET(request: NextRequest) {
    try {
        const gate = await requireAdmin();
        if (gate.error) return gate.error;

        const sp = request.nextUrl.searchParams;
        const shopId = sp.get('shopId');
        if (!shopId) return NextResponse.json({ error: 'shopId шаардлагатай' }, { status: 400 });
        const year = Number(sp.get('year')) || new Date().getFullYear();

        const supabase = supabaseAdmin();

        const [teamTarget, byManager, rosterRes, perfRes, teamMembers] = await Promise.all([
            getTeamTargets(supabase, shopId, year),
            getMonthlyActualsByManager(supabase, shopId, year),
            supabase.from('sales_managers').select('name, user_id, is_active').eq('shop_id', shopId),
            supabase.from('manager_performance').select('sales_manager').eq('shop_id', shopId),
            loadMembers(supabase, shopId),
        ]);

        const rosterMap = new Map(
            (rosterRes.data || []).map((r) => [r.name, { is_active: r.is_active, user_id: r.user_id }]),
        );

        // all-time менежерүүдийн нэгдэл: гэрээ (perf) ∪ энэ жилийн борлуулалт ∪ бүртгэл
        const names = new Set<string>();
        for (const r of perfRes.data || []) if (r.sales_manager) names.add(r.sales_manager);
        for (const n of byManager.keys()) names.add(n);
        for (const n of rosterMap.keys()) names.add(n);

        const managers = Array.from(names)
            .map((name) => {
                const roster = rosterMap.get(name);
                // Бүртгэлд байхгүй бол default идэвхтэй (админ идэвхгүйг нь салгана)
                const isActive = roster ? roster.is_active : true;
                const yearActual = sumYear(byManager.get(name)?.actuals || []);
                return { name, is_active: isActive, user_id: roster?.user_id || null, year_actual: yearActual };
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'mn'));

        // Багийн гүйцэтгэл = идэвхтэй менежерүүдийн нийлбэр
        const activeNames = new Set(managers.filter((m) => m.is_active).map((m) => m.name));
        const teamActual = Array(12).fill(0);
        for (const [name, m] of byManager) {
            if (!activeNames.has(name)) continue;
            for (let i = 0; i < 12; i++) teamActual[i] += m.actuals[i];
        }

        return NextResponse.json({ year, teamTarget, teamActual, managers, teamMembers });
    } catch (error) {
        return safeErrorResponse(error, 'Төлөвлөгөө татахад алдаа гарлаа');
    }
}

export async function POST(request: NextRequest) {
    try {
        const gate = await requireAdmin();
        if (gate.error) return gate.error;

        const body = await request.json();
        const shopId: string | undefined = body.shopId;
        const year = Number(body.year);
        const months: unknown = body.months;

        if (!shopId || !year || !Array.isArray(months) || months.length !== 12) {
            return NextResponse.json({ error: 'shopId, year, months[12] шаардлагатай' }, { status: 400 });
        }

        const supabase = supabaseAdmin();
        const rows = (months as unknown[]).map((v, i) => ({
            shop_id: shopId,
            year,
            month: i + 1,
            target_amount: Math.max(0, Number(v) || 0),
        }));

        const { error } = await supabase
            .from('team_sales_targets')
            .upsert(rows, { onConflict: 'shop_id,year,month' });

        if (error) return safeErrorResponse(error, 'Төлөвлөгөө хадгалахад алдаа гарлаа');
        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Төлөвлөгөө хадгалахад алдаа гарлаа');
    }
}

export async function PUT(request: NextRequest) {
    try {
        const gate = await requireAdmin();
        if (gate.error) return gate.error;

        const body = await request.json();
        const shopId: string | undefined = body.shopId;
        const managers: unknown = body.managers;
        if (!shopId || !Array.isArray(managers)) {
            return NextResponse.json({ error: 'shopId, managers[] шаардлагатай' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Нэрээр акаунт авто-холбох (full_name → user_id)
        const members = await loadMembers(supabase, shopId);
        const nameToId = new Map(members.map((m) => [m.full_name, m.id]));

        const rows = (managers as Array<{ name?: string; is_active?: boolean; user_id?: string | null }>)
            .filter((m) => m.name && m.name.trim())
            .map((m) => ({
                shop_id: shopId,
                name: m.name!.trim(),
                is_active: m.is_active !== false,
                user_id: m.user_id || nameToId.get(m.name!.trim()) || null,
            }));

        if (rows.length === 0) return NextResponse.json({ success: true });

        const { error } = await supabase
            .from('sales_managers')
            .upsert(rows, { onConflict: 'shop_id,name' });

        if (error) return safeErrorResponse(error, 'Менежерийн бүртгэл хадгалахад алдаа гарлаа');
        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Менежерийн бүртгэл хадгалахад алдаа гарлаа');
    }
}
