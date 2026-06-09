import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/** GET /api/dashboard/projects — Төслүүд (dropdown/сонголтод) */
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ projects: [] });

        const supabase = supabaseAdmin();
        const { data: projects, error } = await supabase
            .from('projects')
            .select('id, name, status')
            .eq('shop_id', authShop.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ projects: projects || [] });
    } catch (error) {
        logger.error('[Projects] GET error', { error });
        return NextResponse.json({ error: 'Төсөл татахад алдаа гарлаа' }, { status: 500 });
    }
}
