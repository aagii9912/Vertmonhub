import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireWrite, requireDelete } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { CreateBudgetLineSchema, validateBody } from '@/lib/validations/schemas';

/** GET /api/dashboard/finance/budgets?project_id= — Төслийн төсвийн мөрүүд */
export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ budgets: [] });

        const supabase = supabaseAdmin();
        const projectId = request.nextUrl.searchParams.get('project_id');

        let query = supabase
            .from('project_budgets')
            .select('*, chart_of_accounts(code, name)')
            .eq('shop_id', authShop.id)
            .order('created_at', { ascending: true });

        if (projectId) query = query.eq('project_id', projectId);

        const { data: budgets, error } = await query;
        if (error) throw error;
        return NextResponse.json({ budgets: budgets || [] });
    } catch (error) {
        logger.error('[Budgets] GET error', { error });
        return NextResponse.json({ error: 'Төсөв татахад алдаа гарлаа' }, { status: 500 });
    }
}

/** POST /api/dashboard/finance/budgets — Төсвийн мөр нэмэх */
export async function POST(request: NextRequest) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const validation = validateBody(CreateBudgetLineSchema, body);
        if (!validation.success) return validation.response;
        const d = validation.data;

        const supabase = supabaseAdmin();
        const { data: budget, error } = await supabase
            .from('project_budgets')
            .insert({
                shop_id: authShop.id,
                project_id: d.project_id,
                account_id: d.account_id || null,
                label: d.label || null,
                planned_amount: d.planned_amount,
                note: d.note || null,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ budget, message: 'Төсөв нэмлээ' }, { status: 201 });
    } catch (error) {
        logger.error('[Budgets] POST error', { error });
        return NextResponse.json({ error: 'Төсөв нэмэхэд алдаа гарлаа' }, { status: 500 });
    }
}

/** DELETE /api/dashboard/finance/budgets?id= — Төсвийн мөр устгах */
export async function DELETE(request: NextRequest) {
    try {
        const denied = await requireDelete();
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const id = request.nextUrl.searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id шаардлагатай' }, { status: 400 });

        const supabase = supabaseAdmin();
        const { error } = await supabase
            .from('project_budgets')
            .delete()
            .eq('id', id)
            .eq('shop_id', authShop.id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('[Budgets] DELETE error', { error });
        return NextResponse.json({ error: 'Устгахад алдаа гарлаа' }, { status: 500 });
    }
}
