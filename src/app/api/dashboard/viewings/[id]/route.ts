import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

const PatchSchema = z.object({
    status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
    scheduled_at: z.string().datetime({ offset: true }).optional(),
    agent_notes: z.string().max(4000).nullable().optional(),
    customer_feedback: z.string().max(4000).nullable().optional(),
    interest_level: z.number().int().min(1).max(5).nullable().optional(),
});

/**
 * PATCH /api/dashboard/viewings/[id]
 * Уулзалтын төлөв / цаг / тэмдэглэлийг шинэчилнэ (shop-scoped).
 * «Өнөөдөр» дэлгэцийн мөрийн үйлдлүүд (Дууссан, Хойшлуулах) үүнийг дуудна.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const denied = await requireModuleWrite('viewings');
        if (denied) return denied;

        const { id } = await params;
        const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: 'Буруу өгөгдөл', details: parsed.error.flatten() }, { status: 400 });
        }
        const p = parsed.data;
        const updates: Record<string, unknown> = {};
        if (p.status !== undefined) {
            updates.status = p.status;
            updates.completed_at = p.status === 'completed' ? new Date().toISOString() : null;
        }
        if (p.scheduled_at !== undefined) updates.scheduled_at = p.scheduled_at;
        if (p.agent_notes !== undefined) updates.agent_notes = p.agent_notes;
        if (p.customer_feedback !== undefined) updates.customer_feedback = p.customer_feedback;
        if (p.interest_level !== undefined) updates.interest_level = p.interest_level;
        if (!Object.keys(updates).length) {
            return NextResponse.json({ error: 'Өөрчлөх зүйл алга' }, { status: 400 });
        }

        const db = supabaseAdmin();
        const { data, error } = await db
            .from('property_viewings')
            .update(updates)
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .select('id, status, scheduled_at, completed_at')
            .maybeSingle();
        if (error) return NextResponse.json({ error: 'Шинэчлэхэд алдаа гарлаа' }, { status: 500 });
        if (!data) return NextResponse.json({ error: 'Уулзалт олдсонгүй' }, { status: 404 });

        return NextResponse.json({ viewing: data });
    } catch (error) {
        return safeErrorResponse(error, 'Уулзалт шинэчлэхэд алдаа гарлаа');
    }
}
