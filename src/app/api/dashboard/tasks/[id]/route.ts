import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logger } from '@/lib/utils/logger';
import { updateTask } from '@/lib/services/TaskService';

/**
 * PATCH/DELETE /api/dashboard/tasks/[id] — хувийн ажлын засвар / зөөлөн устгал.
 * Бүх үйлдэл user_id + shop_id-гаар шүүгдэнэ (зөвхөн өөрийн ажил).
 * remind_at өөрчлөгдвөл reminder_sent_at null болж сануулга дахин идэвхжинэ.
 */

const PatchSchema = z.object({
    title: z.string().trim().min(1).max(300).optional(),
    note: z.string().max(4000).nullable().optional(),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    remindAt: z.string().datetime({ offset: true }).nullable().optional(),
    status: z.enum(['pending', 'done']).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const [authShop, uid] = await Promise.all([getUserShop(), getUserId()]);
        if (!authShop || !uid) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json().catch(() => null);
        const parsed = PatchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Буруу өгөгдөл', details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        const { data, error } = await updateTask(supabaseAdmin(), authShop.id, uid, id, parsed.data);

        if (error) {
            logger.error('[Tasks] update error', { error: error.message });
            return NextResponse.json({ error: 'Ажил шинэчлэх алдаа' }, { status: 500 });
        }
        if (!data) {
            return NextResponse.json({ error: 'Ажил олдсонгүй' }, { status: 404 });
        }

        return NextResponse.json({ task: data });
    } catch (error) {
        return safeErrorResponse(error, 'Ажил шинэчлэх алдаа');
    }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const [authShop, uid] = await Promise.all([getUserShop(), getUserId()]);
        if (!authShop || !uid) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { id } = await params;
        const db = supabaseAdmin();
        const { error } = await db
            .from('user_tasks')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', uid)
            .eq('shop_id', authShop.id);

        if (error) {
            logger.error('[Tasks] delete error', { error: error.message });
            return NextResponse.json({ error: 'Ажил устгах алдаа' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Ажил устгах алдаа');
    }
}
