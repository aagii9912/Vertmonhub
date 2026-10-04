import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserId } from '@/lib/auth/supabase-auth';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { updateViewing } from '@/lib/services/ViewingService';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { withRoute } from '@/lib/api/route';

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
export const PATCH = withRoute<{ id: string }>({ module: 'viewings', access: 'write', error: 'Уулзалт шинэчлэхэд алдаа гарлаа' }, async ({ request, shop: authShop, params }) => {
    const { id } = await params;
    const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: 'Буруу өгөгдөл', details: parsed.error.flatten() }, { status: 400 });
    }
    const p = parsed.data;
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, authShop.id);
    const uid = await getUserId();
    const identity = uid ? await resolveManagerIdentity(db, authShop.id, uid) : null;
    const r = await updateViewing(db, authShop.id, id, p, { scope, userId: uid, managerName: identity?.managerName ?? null });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    const data = r.data;

    return NextResponse.json({ viewing: data, warning: r.warning });
});
