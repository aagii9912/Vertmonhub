import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { requireModuleWrite, resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { ACTIVE_STATUSES, anonymousLeadOrFilter, isAnonymousLeadQuery } from '@/lib/leads/labels';
import { isLeadWorkQueue, workQueueFilter } from '@/lib/leads/work-queue';
import { parsePagination, buildPageMeta } from '@/lib/utils/pagination';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { insertLeadOnce, resolveLeadIdentity, resolveStaffLead } from '@/lib/services/LeadService';
import { phoneIlikePattern } from '@/lib/utils/phone';
import { withRoute } from '@/lib/api/route';
import { applyLeadScope, canAccessProject, ProjectScopeError, resolveSalesProjectScope } from '@/lib/sales/project-scope';

/** Хугацааны шүүлтүүр — гүйдэг цонх (өнөөдрөөс хойш N хоног). */
const PERIOD_DAYS: Record<string, number> = {
    week: 7,
    month: 30,
    quarter: 90,
    year: 365,
};

/**
 * GET /api/dashboard/leads?status=<status>&source=<source>&period=<week|month|quarter|year>&manager=<нэр>&phone=<дугаар>&q=<хайлт>
 * Лийдийн жагсаалт (shop-scoped, сервер cookie auth + service role).
 * phone — утасны давхардал шалгах (форматаас үл хамааран: «9911 2233» / «99112233» / «9911-2233»).
 * q — нэр, утас, и-мэйлээр хайлт; «нэргүй»/«нэргүй харилцагч» бол нэргүй лидүүдийг нэмж буцаана.
 * view — хадгалсан харагдац: all | mine (миний лид) | new | meetings (уулзалт товлосон) | active (хаагдаагүй).
 * sort — created_at (анхдагч) | last_contact_at | customer_name | next_followup_at; dir — asc | desc.
 * Soft-delete хийгдсэн лийдийг (deleted_at) хасна.
 * manager — хариуцагч менежерээр шүүнэ (sales_manager_name, contracts API-ийн жишиг).
 */
export const GET = withRoute({ module: 'leads', error: 'Лийд татахад алдаа гарлаа' }, async ({ request, shop: authShop }) => {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const source = searchParams.get('source');
    const period = searchParams.get('period');

    // Хуудаслалт: их өгөгдөлд бүгдийг татаж ~1000 мөрөнд чимээгүй тасрахаас
    // сэргийлнэ. ?page&pageSize эсвэл ?limit&offset өгөөгүй бол аюулгүйн таг.
    const pagination = parsePagination(searchParams);

    const SORTABLE = ['created_at', 'last_contact_at', 'customer_name', 'next_followup_at', 'status'] as const;
    const sortRaw = searchParams.get('sort');
    const sort = (SORTABLE as readonly string[]).includes(sortRaw || '') ? (sortRaw as string) : 'created_at';
    const ascending = searchParams.get('dir') === 'asc';

    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, authShop.id);
    const requestedProject = searchParams.get('project');
    const projectId = requestedProject === 'all' ? null : requestedProject;
    if (projectId && !z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: 'Буруу төсөл' }, { status: 400 });
    if (projectId && !canAccessProject(scope, projectId)) return NextResponse.json({ error: 'Энэ төслийн лид харах эрхгүй' }, { status: 403 });
    let query = applyLeadScope(db
        .from('leads')
        .select('*', { count: 'exact' })
        .eq('shop_id', authShop.id)
        .is('deleted_at', null)
        .order(sort, { ascending, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(pagination.from, pagination.to), scope);
    if (projectId) query = query.eq('project_id', projectId);

    const queue = searchParams.get('queue');
    if (queue && !isLeadWorkQueue(queue)) return NextResponse.json({ error: 'Буруу ажлын жагсаалт' }, { status: 400 });
    if (isLeadWorkQueue(queue)) query = query.or(workQueueFilter(queue));

    // Хадгалсан харагдац
    const view = searchParams.get('view');
    if (view === 'mine') {
        const uid = await getUserId();
        const identity = uid ? await resolveManagerIdentity(db, authShop.id, uid) : null;
        if (identity?.managerName) query = query.eq('sales_manager_name', identity.managerName);
        else query = query.eq('sales_manager_name', '__none__'); // менежер биш → хоосон
    } else if (view === 'new') {
        query = query.eq('status', 'new');
    } else if (view === 'meetings') {
        query = query.eq('status', 'viewing_scheduled');
    } else if (view === 'active') {
        query = query.in('status', ACTIVE_STATUSES);
    }

    if (status && status !== 'all') {
        query = query.eq('status', status);
    }
    if (source && source !== 'all') {
        query = query.eq('source', source);
    }
    const manager = searchParams.get('manager');
    if (manager && manager !== 'all') {
        query = query.eq('sales_manager_name', manager);
    }
    if (period && PERIOD_DAYS[period]) {
        const start = new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);
        query = query.gte('created_at', start.toISOString());
    }
    // Тодорхой хугацааны цонх (ISO) — тайлангийн хуудсууд browser Supabase-гүйгээр ашиглана
    const fromIso = searchParams.get('from');
    const toIso = searchParams.get('to');
    if (fromIso && !Number.isNaN(Date.parse(fromIso))) query = query.gte('created_at', new Date(fromIso).toISOString());
    if (toIso && !Number.isNaN(Date.parse(toIso))) query = query.lt('created_at', new Date(toIso).toISOString());
    // Давхардлын шалгалт: хадгалсан формат (+976, зай, зураас) ямар ч байсан таарна.
    const phonePattern = phoneIlikePattern(searchParams.get('phone'));
    if (phonePattern) query = query.ilike('customer_phone', phonePattern);
    const q = searchParams.get('q')?.trim();
    if (q) {
        const safe = q.replace(/[%_,()]/g, ' ').trim();
        const clauses = safe ? [`customer_name.ilike.%${safe}%`, `customer_phone.ilike.%${safe}%`, `customer_email.ilike.%${safe}%`] : [];
        // «нэргүй…» хайлт нэргүй лидүүдийг НЭМНЭ (нэрийг нөхөхөд); «Нэргүй» нэртэй хүн хэвээр олдоно.
        if (isAnonymousLeadQuery(q)) clauses.push(anonymousLeadOrFilter());
        if (clauses.length) query = query.or(clauses.join(','));
    }

    const { data, error, count } = await query;
    if (error) {
        return NextResponse.json({ error: 'Лийд татахад алдаа гарлаа' }, { status: 500 });
    }

    return NextResponse.json({ leads: data || [], pagination: buildPageMeta(count ?? 0, pagination) });
});

const VALID_STATUSES = ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'] as const;

const CreateLeadSchema = z.object({
    // Shop = төсөл: өгөөгүй бол resolveStaffLead shop-ийн ганц төслийг авна.
    project_id: z.string().uuid('Төслөө сонгоно уу').optional(),
    // Нэргүй лид: нэр хоосон + anonymous=true (resolveLeadIdentity утас/и-мэйл шаардана).
    customer_name: z.string().trim().max(200).nullish(),
    anonymous: z.boolean().optional(),
    customer_phone: z.string().trim().max(30).nullish(),
    customer_email: z.string().trim().max(200).nullish(),
    source: z.string().trim().max(50).optional(),
    preferred_type: z.string().trim().max(30).nullish(),
    preferred_rooms: z.number().int().min(1).max(20).nullish(),
    financing_intent: z.string().trim().max(30).nullish(),
    budget_min: z.number().nonnegative().nullish(),
    budget_max: z.number().nonnegative().nullish(),
    notes: z.string().trim().max(2000).nullish(),
    status: z.enum(VALID_STATUSES).optional(),
    /** Админ өөр менежерт шууд хуваарилах бол (бусдад үл хэрэгсэнэ). */
    assignManager: z.string().trim().min(1).max(120).nullish(),
    /** Client-ийн idempotency түлхүүр (offline outbox / давхар submit-ээс хамгаална). */
    client_request_id: z.string().uuid().nullish(),
});

/**
 * POST /api/dashboard/leads
 * Дашбоардаас шинэ лийд үүсгэнэ. Хариуцагч менежерийг СЕРВЕР дээр тамгална:
 * үүсгэсэн хэрэглэгчийн канон нэр (user_profiles/sales_managers), админ бол
 * assignManager-аар өөр менежерт хуваарилж болно.
 * Төслийн харьяалал, менежерийн холбоосыг сервер дээр шалгана.
 */
export async function POST(request: NextRequest) {
    try {
        const denied = await requireModuleWrite('leads');
        if (denied) return denied;

        const authShop = await getUserShop();
        const uid = await getUserId();
        if (!authShop || !uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const parsed = CreateLeadSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Буруу өгөгдөл', details: parsed.error.flatten() },
                { status: 400 },
            );
        }
        const input = parsed.data;
        const identity = resolveLeadIdentity(input);
        if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

        const db = supabaseAdmin();
        const [scope, perms] = await Promise.all([resolveSalesProjectScope(db, authShop.id), resolvePermissions()]);
        const resolved = await resolveStaffLead(db, authShop.id, {
            projectId: input.project_id, status: input.status, source: input.source, assignManager: input.assignManager,
        }, { userId: uid, role: perms?.role || 'viewer', scope });
        if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

        // Idempotency: ижил client_request_id дахин ирвэл (outbox дахин илгээсэн / ⌘↵ давхар
        // дарсан) аль хэдийн үүссэн лидийг буцаана.
        const result = await insertLeadOnce(db, {
            shop_id: authShop.id,
            project_id: resolved.project_id,
            client_request_id: input.client_request_id || null,
            customer_name: identity.customer_name,
            customer_phone: identity.customer_phone,
            customer_email: identity.customer_email,
            source: resolved.source,
            preferred_type: input.preferred_type || null,
            preferred_rooms: input.preferred_rooms ?? null,
            financing_intent: input.financing_intent || null,
            budget_min: input.budget_min ?? null,
            budget_max: input.budget_max ?? null,
            notes: input.notes || null,
            status: resolved.status,
            sales_manager_name: resolved.sales_manager_name,
        }, { scope });
        if (result.ok) return NextResponse.json(result.duplicate ? { lead: result.lead, deduplicated: true } : { lead: result.lead });
        if (result.conflict) return NextResponse.json({ error: 'Энэ хүсэлтийн түлхүүр өмнө ашиглагдсан байна' }, { status: 409 });
        return NextResponse.json({ error: 'Лийд үүсгэхэд алдаа гарлаа' }, { status: 500 });
    } catch (error) {
        if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
        return safeErrorResponse(error, 'Лийд үүсгэхэд алдаа гарлаа');
    }
}
