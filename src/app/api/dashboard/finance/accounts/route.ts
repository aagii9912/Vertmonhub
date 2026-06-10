import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/dashboard/finance/accounts — Дансны төлөвлөгөө (Chart of Accounts)
 */
export async function GET() {
    try {
        const denied = await requireModule('finance');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ accounts: [] });
        }

        const supabase = supabaseAdmin();
        const { data: accounts, error } = await supabase
            .from('chart_of_accounts')
            .select('id, code, name, type, parent_id, is_active')
            .eq('shop_id', authShop.id)
            .eq('is_active', true)
            .order('code', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ accounts: accounts || [] });
    } catch (error) {
        logger.error('[Finance Accounts] error', { error });
        return NextResponse.json({ error: 'Данс татахад алдаа гарлаа' }, { status: 500 });
    }
}
