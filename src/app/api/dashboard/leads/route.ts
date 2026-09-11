import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { requireModuleWrite, resolvePermissions, requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { ACTIVE_STATUSES } from '@/lib/leads/labels';
import { parsePagination, buildPageMeta } from '@/lib/utils/pagination';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logger } from '@/lib/utils/logger';

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
 * q — нэр, утас, и-мэйлээр хайлт.
 * view — хадгалсан харагдац: all | mine (миний лид) | new | meetings (уулзалт товлосон) | active (хаагдаагүй).
 * sort — created_at (анхдагч) | last_contact_at | customer_name | next_followup_at; dir — asc | desc.
 * Soft-delete хийгдсэн лийдийг (deleted_at) хасна.
 * manager — хариуцагч менежерээр шүүнэ (sales_manager_name, contracts API-ийн жишиг).
 */
export async function GET(request: NextRequest) {
    try {
        const denied = await requireModule('leads');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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
        let query = db
            .from('leads')
            .select('*', { count: 'exact' })
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .order(sort, { ascending, nullsFirst: false })
            .order('created_at', { ascending: false })
            .range(pagination.from, pagination.to);

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
        // Давхардлын шалгалт: цифрүүдийг 4-өөр хувааж хооронд нь дурын тэмдэгт зөвшөөрнө,
        // ингэснээр хадгалсан формат (зай, зураас) ямар ч байсан таарна.
        const phone = searchParams.get('phone');
        if (phone) {
            // Сүүлийн 8 орон — улсын код (+976) орсон ч хадгалсан «99 11 22 33»-тай таарна
            const digits = phone.replace(/\D/g, '').slice(-8);
            if (digits.length >= 6) {
                const chunks = digits.match(/.{1,4}/g) ?? [digits];
                query = query.ilike('customer_phone', `%${chunks.join('%')}%`);
            }
        }
        const q = searchParams.get('q')?.trim();
        if (q) {
            const safe = q.replace(/[%_,()]/g, ' ').trim();
            if (safe) {
                query = query.or(
                    `customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%,customer_email.ilike.%${safe}%`,
                );
            }
        }

        const { data, error, count } = await query;
        if (error) {
            return NextResponse.json({ error: 'Лийд татахад алдаа гарлаа' }, { status: 500 });
        }

        return NextResponse.json({ leads: data || [], pagination: buildPageMeta(count ?? 0, pagination) });
    } catch (error) {
        return safeErrorResponse(error, 'Лийд татахад алдаа гарлаа');
    }
}

const VALID_STATUSES = ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'] as const;

const CreateLeadSchema = z.object({
    customer_name: z.string().trim().min(1, 'Нэр шаардлагатай').max(200),
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
 * sales_manager_name багана байхгүй (миграци ороогүй) орчинд тамгагүй үүсгэнэ.
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

        const db = supabaseAdmin();
        const [perms, identity] = await Promise.all([
            resolvePermissions(),
            resolveManagerIdentity(db, authShop.id, uid),
        ]);
        const role = perms?.role || 'viewer';
        const isAdmin = role === 'admin' || role === 'super_admin';
        const salesManagerName =
            (isAdmin && input.assignManager) || identity.managerName || null;

        // Idempotency: ижил client_request_id-тай лид аль хэдийн байвал түүнийг буцаана
        // (сүлжээ тасарч outbox дахин илгээсэн / ⌘↵ давхар дарсан тохиолдол).
        if (input.client_request_id) {
            const { data: existing } = await db
                .from('leads')
                .select('*')
                .eq('shop_id', authShop.id)
                .eq('client_request_id', input.client_request_id)
                .maybeSingle();
            if (existing) return NextResponse.json({ lead: existing, deduplicated: true });
        }

        const insert: Record<string, unknown> = {
            shop_id: authShop.id,
            client_request_id: input.client_request_id || null,
            customer_name: input.customer_name,
            customer_phone: input.customer_phone || null,
            customer_email: input.customer_email || null,
            source: input.source || 'other',
            preferred_type: input.preferred_type || null,
            preferred_rooms: input.preferred_rooms ?? null,
            financing_intent: input.financing_intent || null,
            budget_min: input.budget_min ?? null,
            budget_max: input.budget_max ?? null,
            notes: input.notes || null,
            status: input.status || 'new',
            sales_manager_name: salesManagerName,
        };

        let { data, error } = await db.from('leads').insert(insert).select('*').single();

        // Unique (shop_id, client_request_id) зөрчил = давхар илгээлт → байгааг буцаана
        if (error && error.code === '23505' && input.client_request_id) {
            const { data: existing } = await db.from('leads').select('*')
                .eq('shop_id', authShop.id).eq('client_request_id', input.client_request_id).maybeSingle();
            if (existing) return NextResponse.json({ lead: existing, deduplicated: true });
        }
        // Миграци ороогүй орчинд (sales_manager_name / client_request_id багана байхгүй) тамгагүйгээр дахин оролдоно
        if (error && /sales_manager_name|client_request_id/i.test(error.message || '')) {
            logger.warn(`[Leads API] optional column skipped: ${error.message}`);
            if (/sales_manager_name/i.test(error.message || '')) delete insert.sales_manager_name;
            if (/client_request_id/i.test(error.message || '')) delete insert.client_request_id;
            ({ data, error } = await db.from('leads').insert(insert).select('*').single());
        }

        if (error) {
            return NextResponse.json({ error: 'Лийд үүсгэхэд алдаа гарлаа' }, { status: 500 });
        }

        return NextResponse.json({ lead: data });
    } catch (error) {
        return safeErrorResponse(error, 'Лийд үүсгэхэд алдаа гарлаа');
    }
}
