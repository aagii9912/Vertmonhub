import { NextRequest, NextResponse } from 'next/server';
import { auditFor } from '@/lib/api/context';
import { z } from 'zod';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logger } from '@/lib/utils/logger';

/**
 * GET/POST /api/dashboard/tasks — хувийн ажлын жагсаалт (user_tasks).
 *
 * • ХАТУУ ХУВИЙН: бүх query user_id + shop_id-гаар шүүгдэнэ — бусдын ажил
 *   хэзээ ч харагдахгүй/өөрчлөгдөхгүй.
 * • Чөлөөт формат: title + note (ямар ч бүтэцгүй текст), due_at/remind_at сонголттой.
 * • user_tasks хүснэгт байхгүй (миграци 20260721120000 ороогүй) орчинд GET
 *   хоосон + available:false буцаана, POST ойлгомжтой алдаа өгнө — 500 гарахгүй.
 */

const CreateSchema = z.object({
    title: z.string().trim().min(1, 'Гарчиг хоосон байна').max(300),
    note: z.string().max(4000).optional().nullable(),
    dueAt: z.string().datetime({ offset: true }).optional().nullable(),
    remindAt: z.string().datetime({ offset: true }).optional().nullable(),
});

/** user_tasks хүснэгт үүсээгүй орчны алдаа мөн үү. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01' || /user_tasks/i.test(error.message || '');
}

const MIGRATION_HINT =
    'Ажлын жагсаалтын хүснэгт (user_tasks) үүсээгүй байна — 20260721120000_user_tasks.sql миграцийг ажиллуулна уу';

export async function GET(request: NextRequest) {
    try {
        const [authShop, uid] = await Promise.all([getUserShop(), getUserId()]);
        if (!authShop || !uid) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status'); // pending | done | (бусад = бүгд)

        const db = supabaseAdmin();
        let q = db
            .from('user_tasks')
            .select('id, title, note, due_at, remind_at, status, completed_at, created_at')
            .eq('user_id', uid)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(300);
        if (status === 'pending' || status === 'done') q = q.eq('status', status);

        const { data, error } = await q;
        if (error) {
            if (isMissingTable(error)) {
                return NextResponse.json({ tasks: [], available: false });
            }
            logger.error('[Tasks] list error', { error: error.message });
            return NextResponse.json({ error: 'Ажлын жагсаалт унших алдаа' }, { status: 500 });
        }

        return NextResponse.json({ tasks: data || [], available: true });
    } catch (error) {
        return safeErrorResponse(error, 'Ажлын жагсаалт унших алдаа');
    }
}

export async function POST(request: NextRequest) {
    try {
        const [authShop, uid] = await Promise.all([getUserShop(), getUserId()]);
        if (!authShop || !uid) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const parsed = CreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Буруу өгөгдөл', details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        const db = supabaseAdmin();
        const { data, error } = await db
            .from('user_tasks')
            .insert({
                user_id: uid,
                shop_id: authShop.id,
                title: parsed.data.title,
                note: parsed.data.note?.trim() || null,
                due_at: parsed.data.dueAt || null,
                remind_at: parsed.data.remindAt || null,
            })
            .select('id, title, note, due_at, remind_at, status, completed_at, created_at')
            .single();

        if (error) {
            if (isMissingTable(error)) {
                return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
            }
            logger.error('[Tasks] create error', { error: error.message });
            return NextResponse.json({ error: 'Ажил нэмэх алдаа' }, { status: 500 });
        }

        await auditFor(request, authShop.id, {
            entity: 'task', action: 'create',
            summary: `${data?.title ?? 'Ажил'} үүсгэв`,
            after: data as Record<string, unknown>,
        });

        return NextResponse.json({ task: data });
    } catch (error) {
        return safeErrorResponse(error, 'Ажил нэмэх алдаа');
    }
}
