import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { safeErrorResponse } from '@/lib/utils/safe-error';

const VALID_STATUS = ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'];

/**
 * PATCH /api/dashboard/leads/[id]
 * Лийдийн төлөв/тэмдэглэлийг шинэчилнэ (leads модулийн бичих эрх шаардана).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const denied = await requireModuleWrite('leads');
        if (denied) return denied;

        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json().catch(() => ({}));

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.status !== undefined) {
            if (!VALID_STATUS.includes(body.status)) {
                return NextResponse.json({ error: 'Буруу төлөв' }, { status: 400 });
            }
            updates.status = body.status;
            // closed_lost-аас өөр шат руу шилжвэл алдсан шалтгааныг цэвэрлэнэ.
            if (body.status !== 'closed_lost' && body.lost_reason === undefined) {
                updates.lost_reason = null;
            }
        }
        if (typeof body.notes === 'string') updates.notes = body.notes;
        if (typeof body.lost_reason === 'string') updates.lost_reason = body.lost_reason.slice(0, 300) || null;
        // Хариуцагч менежер хуваарилах/чөлөөлөх (null = хуваарилаагүй)
        if (body.sales_manager_name !== undefined) {
            const name = body.sales_manager_name;
            if (name !== null && typeof name !== 'string') {
                return NextResponse.json({ error: 'Буруу менежерийн нэр' }, { status: 400 });
            }
            const trimmed = typeof name === 'string' ? name.trim().slice(0, 120) : null;
            updates.sales_manager_name = trimmed || null;
        }

        const db = supabaseAdmin();

        // Лийд энэ shop-д харьяалагдаж байгааг шалгана
        const { data: lead } = await db
            .from('leads')
            .select('id')
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .single();
        if (!lead) {
            return NextResponse.json({ error: 'Лийд олдсонгүй' }, { status: 404 });
        }

        const { error } = await db.from('leads').update(updates).eq('id', id);
        if (error) {
            return NextResponse.json({ error: 'Шинэчлэхэд алдаа гарлаа' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return safeErrorResponse(error, 'Лийд шинэчлэхэд алдаа гарлаа');
    }
}
