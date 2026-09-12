import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logger } from '@/lib/utils/logger';
import { listTasks, createTask, isMissingTaskTable, TASK_MIGRATION_HINT } from '@/lib/services/TaskService';

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

export async function GET(request: NextRequest) {
    try {
        const [authShop, uid] = await Promise.all([getUserShop(), getUserId()]);
        if (!authShop || !uid) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status'); // pending | done | (бусад = бүгд)

        const { data, error } = await listTasks(supabaseAdmin(), authShop.id, uid, status);
        if (error) {
            if (isMissingTaskTable(error)) {
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

        const { data, error } = await createTask(supabaseAdmin(), authShop.id, uid, parsed.data);

        if (error) {
            if (isMissingTaskTable(error)) {
                return NextResponse.json({ error: TASK_MIGRATION_HINT }, { status: 503 });
            }
            logger.error('[Tasks] create error', { error: error.message });
            return NextResponse.json({ error: 'Ажил нэмэх алдаа' }, { status: 500 });
        }

        return NextResponse.json({ task: data });
    } catch (error) {
        return safeErrorResponse(error, 'Ажил нэмэх алдаа');
    }
}
