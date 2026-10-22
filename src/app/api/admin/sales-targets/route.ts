import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId, assertShopAccess } from '@/lib/auth/supabase-auth';
import { getAdminUser } from '@/lib/admin/auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getTeamMonthlySales, getMonthlyActualsByManager, sumYear, saveTeamMonthlySales } from '@/lib/sales/targets';
import { MonthlySalesWriteSchema, SalesYearSchema, summarizeMonthlySales } from '@/lib/sales/monthly';
import { fetchAllRows } from '@/lib/utils/pagination';
import { z } from 'zod';
import { soleShopProjectId } from '@/lib/projects/shop-project';
import { ubParts } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';
import { loadPlanPerformance } from '@/lib/sales/plan-performance-load';
import { sumPlanValues, type PlanMetricKey, type PlanPerformance, type PlanScopeCells, type PlanValue } from '@/lib/sales/plan-performance';

const shopSchema = z.guid();
const yearSchema = SalesYearSchema;
const rosterSchema = z.object({
    shopId: shopSchema,
    managers: z.array(z.object({
        name: z.string().trim().min(1).max(120),
        is_active: z.boolean(),
        user_id: z.uuid().nullable(),
        project_ids: z.array(z.uuid()).max(500).optional(),
    })).max(500),
});

function throwOnError(error: unknown): never { throw error; }

const SYSTEM_ACTUAL_SOURCE = 'Төслийн бүх гэрээ (менежерээр шүүхгүй) · захиалга өгсөн огноогоор · цуцлагдсаныг хассан · Б1, Б2, зогсоол';

const autoOf = (cells: PlanScopeCells) => Object.fromEntries(Object.entries(cells.metrics).map(([key, cell]) => [key, cell!.auto])) as Partial<Record<PlanMetricKey, PlanValue>>;

/**
 * «CRM-ээр тооцсон» харьцуулалт — төлөвлөгөөний биелэлтийн ачаалагчийн системийн дүн (гар гүйцэтгэлээс тусдаа):
 * сар × блок, огноогүй гэрээтэй бол «+», ирээдүйн сар null. Гар гүйцэтгэлд хэзээ ч нэмэхгүй.
 * Жилийн нийлбэр нь өнгөрсөн ба энэ сарын (`sumPlanValues`: тодорхойгүй сар байвал «+», «0+» = тодорхойгүй).
 */
function systemActuals(plan: PlanPerformance) {
    const months = plan.months.map(row => ({
        month: row.month, status: row.status,
        total: autoOf(row.total),
        blocks: { b1: autoOf(row.blocks.b1), b2: autoOf(row.blocks.b2), parking: autoOf(row.blocks.parking) },
        outside: { count: row.outside.count, amount: row.outside.amount },
    }));
    const elapsed = months.filter(row => row.status !== 'future');
    const year = Object.fromEntries((['contract_count', 'contract', 'cashflow'] as const)
        .map(key => [key, sumPlanValues(elapsed.flatMap(row => row.total[key] ? [row.total[key]!] : []))])) as Record<PlanMetricKey, PlanValue>;
    return { months, year, undated: plan.undated.count, source: SYSTEM_ACTUAL_SOURCE };
}

/**
 * Багийн борлуулалтын төлөвлөгөө + идэвхтэй менежерийн бүртгэл (admin only).
 *
 * GET  ?shopId=&year=
 *      → багийн 12 сарын төлөвлөгөө + гүйцэтгэл, бүртгэлтэй менежерүүд
 *        (идэвхтэй эсэх + жилийн борлуулалт), акаунт холбох багийн гишүүд.
 * POST body:{ shopId, year, months:[{month, expectedRevision, ...changedAmounts}] }
 *      → дөрвөн үзүүлэлтийн өөрчилсөн нүдийг хувилбар шалгаж, аудиттай хадгална.
 * PUT  body:{ shopId, managers:[{name, is_active, user_id, project_ids?}] }
 *      → менежерийн бүртгэл + төслийн харьяаллыг нэг гүйлгээгээр хадгална.
 *        project_ids байхгүй бол өмнөх харьяаллыг хадгална; [] бол цэвэрлэнэ.
 */

async function requireAdmin() {
    const userId = await getUserId();
    if (!userId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    const admin = await getAdminUser();
    if (!admin) return { error: NextResponse.json({ error: 'Admin required' }, { status: 403 }) };
    return { userId };
}

/** Төслийн (shop) ажилтнууд — менежерийн акаунтыг ил тод холбоход сонгоно. */
async function loadMembers(supabase: ReturnType<typeof supabaseAdmin>, shopId: string) {
    const { data: memberRows, error: memberError } = await supabase
        .from('shop_members')
        .select('user_id')
        .eq('shop_id', shopId);
    if (memberError) throw memberError;
    const ids = (memberRows || []).map((m) => m.user_id);
    if (!ids.length) return [] as Array<{ id: string; full_name: string; role: string | null }>;
    const [{ data: profiles, error: profileError }, { data: roles, error: roleError }] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name, email').in('id', ids),
        supabase.from('user_roles').select('user_id, role').in('user_id', ids),
    ]);
    if (profileError) throw profileError;
    if (roleError) throw roleError;
    const roleById = new Map((roles || []).map((row) => [row.user_id, row.role as string]));
    return (profiles || []).map((p) => ({ id: p.id, full_name: p.full_name || p.email || 'Нэргүй', role: roleById.get(p.id) ?? null }));
}

export async function GET(request: NextRequest) {
    try {
        const gate = await requireAdmin();
        if (gate.error) return gate.error;

        const sp = request.nextUrl.searchParams;
        const shopId = sp.get('shopId');
        if (!shopSchema.safeParse(shopId).success) return NextResponse.json({ error: 'Төсөл буруу байна' }, { status: 400 });
        const year = sp.has('year') ? Number(sp.get('year')) : ubParts().year;
        if (!yearSchema.safeParse(year).success) return NextResponse.json({ error: 'Он буруу байна' }, { status: 400 });
        if (!await assertShopAccess(shopId)) return NextResponse.json({ error: 'Энэ төсөлд хандах эрхгүй' }, { status: 403 });

        const supabase = supabaseAdmin();

        // Системийн дүн зөвхөн харьцуулалт: уншиж чадахгүй бол төлөвлөгөө засварыг хаахгүй, «тооцоолж чадсангүй» гэнэ.
        const system = loadPlanPerformance(supabase, { shopId: shopId!, year, canReadFinance: true }).then(systemActuals).catch(error => {
            logger.warn('[Sales targets] System actuals unavailable', { error });
            return null;
        });
        const [months, byManager, rosterRes, teamMembers, projects, memberships, systemActual] = await Promise.all([
            getTeamMonthlySales(supabase, shopId!, year),
            getMonthlyActualsByManager(supabase, shopId!, year, throwOnError),
            supabase.from('sales_managers').select('name, user_id, is_active').eq('shop_id', shopId),
            loadMembers(supabase, shopId!),
            fetchAllRows<{ id: string; name: string }>((from, to) => supabase.from('projects')
                .select('id, name').eq('shop_id', shopId).order('id').range(from, to)),
            fetchAllRows<{ manager_name: string; project_id: string }>((from, to) => supabase.from('sales_manager_projects')
                .select('manager_name, project_id').eq('shop_id', shopId).order('manager_name').order('project_id').range(from, to)),
            system,
        ]);
        if (rosterRes.error) throw rosterRes.error;
        const projectsByManager = new Map<string, string[]>();
        for (const membership of memberships) {
            const ids = projectsByManager.get(membership.manager_name) || [];
            ids.push(membership.project_id);
            projectsByManager.set(membership.manager_name, ids);
        }

        const managers = (rosterRes.data || [])
            .map((manager) => {
                const yearActual = sumYear(byManager.get(manager.name)?.actuals || []);
                return {
                    name: manager.name, is_active: manager.is_active, user_id: manager.user_id || null,
                    year_actual: yearActual,
                    project_ids: projectsByManager.get(manager.name) || [],
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'mn'));

        // Багийн системийн гүйцэтгэл төслийн хэмжээнд (эзэмшигч 2026-10-22) — роостер өөрчлөгдөхөд түүх өөрчлөгдөхгүй.
        // Менежер бүрийн year_actual л роостероор. Тодорхойгүй сар null (0 биш).
        const teamActual = systemActual ? systemActual.months.map(row => row.total.contract?.value ?? null) : null;
        const teamCount = systemActual ? systemActual.months.map(row => row.total.contract_count?.value ?? null) : null;
        const teamTarget = months.map(row => row.target_amount ?? 0);
        return NextResponse.json({ year, months, summary: summarizeMonthlySales(months), teamTarget, teamActual, teamCount,
            system: systemActual, computedActualSource: SYSTEM_ACTUAL_SOURCE, managers, teamMembers, projects }, {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    } catch (error) {
        return safeErrorResponse(error, 'Төлөвлөгөө болон менежерийн төслийн харьяалал татахад алдаа гарлаа', 503);
    }
}

export async function POST(request: NextRequest) {
    try {
        const gate = await requireAdmin();
        if (gate.error) return gate.error;

        const parsed = MonthlySalesWriteSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Он, сар, дүн эсвэл мэдээллийн хувилбар буруу байна' }, { status: 400 });
        const { shopId, year, months } = parsed.data;
        if (!await assertShopAccess(shopId)) return NextResponse.json({ error: 'Энэ төсөлд хандах эрхгүй' }, { status: 403 });
        const { data, error } = await saveTeamMonthlySales(supabaseAdmin(), shopId, year, months, gate.userId!);
        if (error?.code === '40001') return NextResponse.json({ error: 'Энэ сарын мэдээллийг өөр хэрэглэгч өөрчилсөн. Шинэ мэдээллийг авч дахин оруулна уу.', code: 'MONTHLY_SALES_CONFLICT' }, { status: 409 });
        if (error?.code === '42501') return NextResponse.json({ error: 'Энэ төсөлд төлөвлөгөө хадгалах эрхгүй' }, { status: 403 });
        if (error?.code === '22023') return NextResponse.json({ error: 'Блокийн дүн, сарын нийлбэрийг шалгана уу. Задаргаатай дүнг зөвхөн блокийн нүдээр засна.' }, { status: 400 });
        if (error) return safeErrorResponse(error, 'Төлөвлөгөө, гүйцэтгэл хадгалахад алдаа гарлаа');
        return NextResponse.json({ success: true, months: data });
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
        if (new Set(managers.map((m) => m.name)).size !== managers.length)
            return NextResponse.json({ error: 'Ижил нэртэй менежер давхар байна' }, { status: 400 });

        const supabase = supabaseAdmin();

        const requestedProjectIds = [...new Set(managers.flatMap((manager) => manager.project_ids || []))];
        if (requestedProjectIds.length) {
            const projects = await fetchAllRows<{ id: string }>((from, to) => supabase.from('projects')
                .select('id').eq('shop_id', shopId).order('id').range(from, to));
            const allowedProjectIds = new Set(projects.map((project) => project.id));
            if (requestedProjectIds.some((id) => !allowedProjectIds.has(id))) {
                return NextResponse.json({ error: 'Менежерийн төсөл энэ ажлын орчинд харьяалагдахгүй байна' }, { status: 400 });
            }
        }

        // Акаунтыг зөвхөн админ ил тод сонгосон үед холбоно. Профайлын нэр таарсан гэж
        // автоматаар холбохгүй: хэрэглэгч нэрээ өөрчилж бусдын лидийг авах эрсдэлтэй.
        const members = await loadMembers(supabase, shopId);
        const memberIds = new Set(members.map((m) => m.id));
        if (managers.some((m) => m.user_id && !memberIds.has(m.user_id)))
            return NextResponse.json({ error: 'Менежерийн акаунт энэ төсөлд харьяалагдахгүй байна' }, { status: 400 });

        // Shop = төсөл: ганц төсөлтэй shop-ийн бүртгэлтэй менежер тэр төслийг хариуцна.
        const soleProject = await soleShopProjectId(supabase, shopId);
        const rows = managers.map((m) => ({
                name: m.name,
                is_active: m.is_active,
                user_id: m.user_id || null,
                ...(soleProject ? { project_ids: [soleProject] }
                    : m.project_ids !== undefined ? { project_ids: [...new Set(m.project_ids)] } : {}),
            }));

        if (rows.length === 0) return NextResponse.json({ success: true });

        // Submitted names replace existing rows; every other roster link survives this upsert.
        const { data: existingRoster, error: rosterError } = await supabase
            .from('sales_managers').select('name, user_id').eq('shop_id', shopId);
        if (rosterError) throw rosterError;
        const submittedNames = new Set(rows.map((row) => row.name));
        const retained = (existingRoster || []).filter((row) => !submittedNames.has(row.name));
        const linkedUsers = new Set<string>();
        for (const row of [...retained, ...rows]) {
            if (!row.user_id) continue;
            if (linkedUsers.has(row.user_id)) {
                return NextResponse.json({ error: 'Нэг акаунтыг энэ төсөлд олон менежерт холбож болохгүй' }, { status: 409 });
            }
            linkedUsers.add(row.user_id);
        }

        const { error } = await supabase.rpc('save_sales_manager_roster', {
            p_shop_id: shopId,
            p_managers: rows,
        });

        if (error) return safeErrorResponse(error, 'Менежерийн бүртгэл болон төслийн харьяалал хадгалахад алдаа гарлаа', error.code === '23505' ? 409 : 503);
        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Менежерийн бүртгэл хадгалахад алдаа гарлаа');
    }
}
