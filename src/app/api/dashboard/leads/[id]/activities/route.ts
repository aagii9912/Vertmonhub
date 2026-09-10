import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logLeadActivity, listLeadActivities } from '@/lib/leads/activities';

const CreateSchema = z.object({
    type: z.enum(['note', 'call']).default('note'),
    content: z.string().trim().min(1, 'Тэмдэглэл хоосон байна').max(4000),
    /** Залгасны дараа дараагийн холбоо барих цаг (заавал биш) */
    next_followup_at: z.string().datetime({ offset: true }).nullable().optional(),
});

/** GET /api/dashboard/leads/[id]/activities — сүүлийн 100 үйлдэл, шинэ нь дээр. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const { id } = await params;
        const activities = await listLeadActivities(supabaseAdmin(), authShop.id, id);
        return NextResponse.json({ activities });
    } catch (error) {
        return safeErrorResponse(error, 'Түүх татахад алдаа гарлаа');
    }
}

/**
 * POST /api/dashboard/leads/[id]/activities
 * Тэмдэглэл / дуудлагын бүртгэл. Дуудлага бол last_contact_at-г шинэчилж,
 * next_followup_at өгсөн бол тавина («Өнөөдөр» жагсаалтад гарна).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const denied = await requireModuleWrite('leads');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id } = await params;
        const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Буруу өгөгдөл' }, { status: 400 });
        }
        const p = parsed.data;

        const db = supabaseAdmin();
        const { data: lead } = await db.from('leads').select('id').eq('id', id).eq('shop_id', authShop.id).is('deleted_at', null).maybeSingle();
        if (!lead) return NextResponse.json({ error: 'Лид олдсонгүй' }, { status: 404 });

        const uid = await getUserId();
        const identity = uid ? await resolveManagerIdentity(db, authShop.id, uid) : null;

        const activity = await logLeadActivity(db, {
            shopId: authShop.id,
            leadId: id,
            type: p.type,
            content: p.content,
            createdBy: uid,
            createdByName: identity?.managerName ?? null,
        });

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (p.type === 'call') updates.last_contact_at = new Date().toISOString();
        if (p.next_followup_at !== undefined) updates.next_followup_at = p.next_followup_at;
        if (Object.keys(updates).length > 1) await db.from('leads').update(updates).eq('id', id);

        return NextResponse.json({ activity }, { status: 201 });
    } catch (error) {
        return safeErrorResponse(error, 'Тэмдэглэл хадгалахад алдаа гарлаа');
    }
}
