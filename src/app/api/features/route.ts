/**
 * Features API — идэвхтэй боломжууд ба хязгаарууд.
 *
 * 2026-09 review (M6): өмнө нь `shops.plan_id / subscription_plan / enabled_features`
 * багана ба `plans` хүснэгтээс уншдаг байсан — эдгээр SaaS-billing объектууд prod DB-д
 * байхгүй тул query бүр алдаа өгч «free» default буцаадаг байв. Vertmon Hub нэг компанийн
 * дотоод систем тул төлөвлөгөөний gating байхгүй: бүх боломж нээлттэй, хязгааргүй.
 */
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/auth';

const FULL_FEATURES = {
    features: {
        ai_enabled: true,
        ai_model: 'gemini',
        sales_intelligence: true,
        ai_memory: true,
        cart_system: 'none',
        payment_integration: false,
        crm_analytics: 'full',
        auto_tagging: true,
        appointment_booking: true,
        bulk_marketing: true,
        excel_export: true,
        custom_branding: true,
        comment_reply: true,
        priority_support: true,
    },
    limits: {
        max_messages: -1,
        max_shops: -1,
        max_products: -1,
        max_customers: -1,
    },
    plan: { slug: 'internal', name: 'Vertmon Hub' },
} as const;

export async function GET() {
    const userId = await getAuthUser();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(FULL_FEATURES, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
