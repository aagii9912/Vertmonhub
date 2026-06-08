import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

interface ProjectPnl {
    project_id: string | null;
    name: string;
    revenue: number;
    collected: number;
    cost: number;
    paidCost: number;
    margin: number;
    budget: number;
    budgetVariance: number;
}

/**
 * GET /api/dashboard/finance/project-pnl
 * Төсөл тус бүрийн орлого (гэрээ) vs өртөг (нэхэмжлэх) → margin, төсөв vs гүйцэтгэл.
 */
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ projects: [] });

        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        const [{ data: projects }, { data: contracts }, { data: bills }, { data: budgets }] = await Promise.all([
            supabase.from('projects').select('id, name').eq('shop_id', shopId),
            supabase.from('property_contracts').select('project_id, total_price, paid_amount, contract_status').eq('shop_id', shopId),
            supabase.from('vendor_bills').select('project_id, total_amount, paid_amount, status').eq('shop_id', shopId),
            supabase.from('project_budgets').select('project_id, planned_amount').eq('shop_id', shopId),
        ]);

        // project_id → P&L map ("unassigned" = null)
        const map = new Map<string | null, ProjectPnl>();
        const ensure = (id: string | null, name: string): ProjectPnl => {
            let row = map.get(id);
            if (!row) {
                row = { project_id: id, name, revenue: 0, collected: 0, cost: 0, paidCost: 0, margin: 0, budget: 0, budgetVariance: 0 };
                map.set(id, row);
            }
            return row;
        };

        for (const p of projects || []) ensure(p.id, p.name);

        for (const c of contracts || []) {
            if (c.contract_status === 'cancelled') continue;
            const row = ensure(c.project_id ?? null, c.project_id ? '' : 'Холбоогүй');
            row.revenue += Number(c.total_price) || 0;
            row.collected += Number(c.paid_amount) || 0;
        }
        for (const b of bills || []) {
            if (b.status === 'cancelled') continue;
            const row = ensure(b.project_id ?? null, b.project_id ? '' : 'Холбоогүй');
            row.cost += Number(b.total_amount) || 0;
            row.paidCost += Number(b.paid_amount) || 0;
        }
        for (const bg of budgets || []) {
            const row = map.get(bg.project_id);
            if (row) row.budget += Number(bg.planned_amount) || 0;
        }

        // name-г төслийн нэрээр нөхөж, margin/variance тооцоолно
        const nameById = new Map((projects || []).map(p => [p.id, p.name]));
        const result = Array.from(map.values())
            .map(r => ({
                ...r,
                name: r.project_id ? (nameById.get(r.project_id) || '—') : 'Холбоогүй',
                margin: r.revenue - r.cost,
                budgetVariance: r.budget - r.cost,
            }))
            // Зөвхөн идэвхтэй мөрүүд (орлого/зардал/төсөв байгаа)
            .filter(r => r.revenue > 0 || r.cost > 0 || r.budget > 0)
            .sort((a, b) => b.revenue - a.revenue);

        return NextResponse.json({ projects: result });
    } catch (error) {
        logger.error('[Project PnL] error', { error });
        return NextResponse.json({ error: 'Төслийн P&L татахад алдаа гарлаа' }, { status: 500 });
    }
}
