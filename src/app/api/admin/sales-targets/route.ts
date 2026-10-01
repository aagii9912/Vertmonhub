import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { getAdminUser } from '@/lib/admin/auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getTeamTargets, getMonthlyActualsByManager, sumYear } from '@/lib/sales/targets';
import { z } from 'zod';

const rosterSchema = z.object({
    shopId: z.uuid(),
    managers: z.array(z.object({
        name: z.string().trim().min(1).max(120),
        is_active: z.boolean(),
        user_id: z.uuid().nullable(),
    })).max(500),
});

/**
 * Багийн борлуулалтын төлөвлөгөө + идэвхтэй менежерийн бүртгэл (admin only).
 *
 * GET  ?shopId=&year=
 *      → багийн 12 сарын төлөвлөгөө + гүйцэтгэл, бүртгэлтэй менежерүүд
 *        (идэвхтэй эсэх + жилийн борлуулалт), акаунт холбох багийн гишүүд.
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
    const { data: memberRows, error: memberError } = await supabase
        .from('shop_members')
        .select('user_id')
        .eq('shop_id', shopId);
    if (memberError) throw memberError;
    const ids = (memberRows || []).map((m) => m.user_id);
    if (!ids.length) return [] as Array<{ id: string; full_name: string }>;
    const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', ids);
    if (profileError) throw profileError;
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

        const [teamTarget, byManager, rosterRes, teamMembers] = await Promise.all([
            getTeamTargets(supabase, shopId, year),
            getMonthlyActualsByManager(supabase, shopId, year),
            supabase.from('sales_managers').select('name, user_id, is_active').eq('shop_id', shopId),
            loadMembers(supabase, shopId),
        ]);
        if (rosterRes.error) throw rosterRes.error;

        const managers = (rosterRes.data || [])
            .map((manager) => {
                const yearActual = sumYear(byManager.get(manager.name)?.actuals || []);
                return { name: manager.name, is_active: manager.is_active, user_id: manager.user_id || null, year_actual: yearActual };
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

        const parsed = rosterSchema.safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({ error: 'Менежерийн мэдээлэл буруу байна' }, { status: 400 });
        const { shopId, managers } = parsed.data;
        if (new Set(managers.map((manager) => manager.name)).size !== managers.length)
            return NextResponse.json({ error: 'Ижил нэртэй менежер давхар байна' }, { status: 400 });

        const supabase = supabaseAdmin();
        const members = await loadMembers(supabase, shopId);
        const memberIds = new Set(members.map((member) => member.id));
        if (managers.some((manager) => manager.user_id && !memberIds.has(manager.user_id)))
            return NextResponse.json({ error: 'Менежерийн акаунт энэ байгууллагад харьяалагдахгүй байна' }, { status: 400 });
        const nameToId = new Map<string, string>();
        const duplicateNames = new Set<string>();
        for (const member of members) {
            if (nameToId.has(member.full_name) || duplicateNames.has(member.full_name)) {
                nameToId.delete(member.full_name);
                duplicateNames.add(member.full_name);
            } else nameToId.set(member.full_name, member.id);
        }
        const rows = managers.map((manager) => ({
            shop_id: shopId,
            name: manager.name,
            is_active: manager.is_active,
            user_id: manager.user_id || nameToId.get(manager.name) || null,
        }));
        if (!rows.length) return NextResponse.json({ success: true });

        const { data: existingRoster, error: rosterError } = await supabase
            .from('sales_managers').select('name, user_id').eq('shop_id', shopId);
        if (rosterError) throw rosterError;
        const submittedNames = new Set(rows.map((row) => row.name));
        const retained = (existingRoster || []).filter((row) => !submittedNames.has(row.name));
        const linkedUsers = new Set<string>();
        for (const row of [...retained, ...rows]) {
            if (!row.user_id) continue;
            if (linkedUsers.has(row.user_id))
                return NextResponse.json({ error: 'Нэг акаунтыг энэ байгууллагад олон менежерт холбож болохгүй' }, { status: 409 });
            linkedUsers.add(row.user_id);
        }

        const { error } = await supabase
            .from('sales_managers')
            .upsert(rows, { onConflict: 'shop_id,name' });

        if (error) return safeErrorResponse(error, 'Менежерийн бүртгэл хадгалахад алдаа гарлаа');
        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Менежерийн бүртгэл хадгалахад алдаа гарлаа');
    }
}
