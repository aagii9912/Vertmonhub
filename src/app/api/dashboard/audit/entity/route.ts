import { NextRequest, NextResponse } from 'next/server';
import { apiContext } from '@/lib/api/context';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/dashboard/audit/entity?entity=contract&id=<uuid>
 *
 * Тухайн бичлэгийн бүх өөрчлөлтийн түүх — гэрээ/лийд/харилцагчийн
 * дэлгэрэнгүй хуудсан дахь «Өөрчлөлтийн түүх» таб уншина.
 *
 * Эрх: тухайн энтитийн модулийн эрх. Ингэснээр гэрээний түүхийг зөвхөн
 * гэрээ харах эрхтэй хүн харна.
 */
const ENTITY_MODULE: Record<string, string> = {
    contract: 'contracts',
    lead: 'leads',
    customer: 'customers',
    property: 'properties',
    viewing: 'viewings',
    unit: 'properties',
    service_log: 'customer-service',
    transaction: 'finance',
    budget: 'finance',
    bill: 'procurement',
    vendor: 'procurement',
    survey: 'surveys',
    task: 'dashboard',
};

export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const entity = sp.get('entity') || '';
        const id = sp.get('id') || '';

        if (!entity || !id) {
            return NextResponse.json({ error: 'entity болон id шаардлагатай' }, { status: 400 });
        }

        const requiredModule = ENTITY_MODULE[entity];
        if (!requiredModule) {
            return NextResponse.json({ error: `Тодорхойгүй entity: ${entity}` }, { status: 400 });
        }

        const r = await apiContext(request, { module: requiredModule });
        if ('error' in r) return r.error;
        const { ctx } = r;

        const db = supabaseAdmin();
        const { data, error } = await db
            .from('activity_log')
            .select('id, occurred_at, actor_name, actor_role, source, action, summary, before, after, status')
            .eq('shop_id', ctx.shopId)
            .eq('entity', entity)
            .eq('entity_id', id)
            .order('occurred_at', { ascending: false })
            .limit(100);

        if (error) {
            if (/relation .*activity_log.* does not exist/i.test(error.message)) {
                return NextResponse.json({ history: [], available: false });
            }
            return NextResponse.json({ error: 'Түүх татахад алдаа гарлаа' }, { status: 500 });
        }

        return NextResponse.json({ history: data || [], available: true });
    } catch (error) {
        return safeErrorResponse(error, 'Түүх татахад алдаа гарлаа');
    }
}
