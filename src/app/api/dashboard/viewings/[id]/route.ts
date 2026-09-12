import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getUserId } from '@/lib/auth/supabase-auth';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { updateViewing } from '@/lib/services/ViewingService';

const PatchSchema = z.object({
    status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
    scheduled_at: z.string().datetime({ offset: true }).optional(),
    agent_notes: z.string().max(4000).nullable().optional(),
    customer_feedback: z.string().max(4000).nullable().optional(),
    interest_level: z.number().int().min(1).max(5).nullable().optional(),
    /** Үр дүнгийн дараа лидийн дараагийн холбоо барих цаг (заавал биш) */
    next_followup_at: z.string().datetime({ offset: true }).nullable().optional(),
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
        const db = supabaseAdmin();
        const uid = await getUserId();
        const identity = uid ? await resolveManagerIdentity(db, authShop.id, uid) : null;
        const r = await updateViewing(db, authShop.id, id, p, { userId: uid, managerName: identity?.managerName ?? null });
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
        const data = r.data;

        return NextResponse.json({ viewing: data });
    } catch (error) {
        return safeErrorResponse(error, 'Уулзалт шинэчлэхэд алдаа гарлаа');
    }
}
