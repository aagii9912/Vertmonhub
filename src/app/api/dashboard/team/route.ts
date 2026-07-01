import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// ============================================
// GET /api/dashboard/team
// Идэвхтэй shop-ийн багийн гишүүд (эзэн + гишүүд).
// Хариуцагч/менежер сонгох Select-д ашиглана.
// ============================================
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ members: [] });
        }

        const supabase = supabaseAdmin();

        const { data: memberRows, error: memberErr } = await supabase
            .from('shop_members')
            .select('user_id, role')
            .eq('shop_id', authShop.id);

        if (memberErr) {
            logger.error('[Team API] members query error:', { error: memberErr.message });
            return NextResponse.json({ members: [] });
        }

        const userIds = (memberRows || []).map(m => m.user_id);
        if (userIds.length === 0) {
            return NextResponse.json({ members: [] });
        }

        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, full_name, email')
            .in('id', userIds);

        const roleMap = new Map((memberRows || []).map(m => [m.user_id, m.role]));

        const members = (profiles || [])
            .map(p => ({
                id: p.id,
                full_name: p.full_name || p.email || 'Нэргүй',
                email: p.email || '',
                role: roleMap.get(p.id) || 'member',
            }))
            // Эзнийг эхэнд, дараа нь нэрээр эрэмбэлнэ
            .sort((a, b) => {
                if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
                return a.full_name.localeCompare(b.full_name, 'mn');
            });

        return NextResponse.json({ members });
    } catch (error) {
        logger.error('[Team API] GET error:', { error });
        return NextResponse.json({ members: [] });
    }
}
