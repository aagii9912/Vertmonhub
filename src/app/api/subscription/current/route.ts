/**
 * Current Subscription API
 * Get current user's subscription status
 */

import { NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export async function GET() {
    try {
        const shop = await getAuthUserShop();

        if (!shop) {
            logger.error('Subscription API: Unauthorized - No shop found for user');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();

        // Get subscription with plan details
        const { data: subscription, error } = await supabase
            .from('subscriptions')
            .select(`
                *,
                plans (
                    id,
                    name,
                    slug,
                    description,
                    price_monthly,
                    price_yearly,
                    features,
                    limits
                )
            `)
            .eq('shop_id', shop.id)
            .single();

        // Get REAL usage stats from actual tables
        const periodStart = new Date();
        periodStart.setDate(1);
        periodStart.setHours(0, 0, 0, 0);

        // Parallel queries for real usage counts
        const [messagesRes, productsRes, customersRes, ordersRes, ordersThisMonthRes, revenueRes] = await Promise.all([
            // Total messages this month from chat_history
            supabase
                .from('chat_history')
                .select('id', { count: 'exact', head: true })
                .eq('shop_id', shop.id)
                .gte('created_at', periodStart.toISOString()),
            // Total products
            supabase
                .from('products')
                .select('id', { count: 'exact', head: true })
                .eq('shop_id', shop.id),
            // Total customers
            supabase
                .from('customers')
                .select('id', { count: 'exact', head: true })
                .eq('shop_id', shop.id),
            // Total orders
            supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .eq('shop_id', shop.id),
            // Orders this month
            supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .eq('shop_id', shop.id)
                .gte('created_at', periodStart.toISOString()),
            // Revenue this month
            supabase
                .from('orders')
                .select('total_amount')
                .eq('shop_id', shop.id)
                .in('status', ['completed', 'paid', 'delivered'])
                .gte('created_at', periodStart.toISOString()),
        ]);

        // Build real usage summary
        const usageSummary: Record<string, number> = {
            messages: messagesRes.count || 0,
            products: productsRes.count || 0,
            customers: customersRes.count || 0,
            orders: ordersRes.count || 0,
            orders_this_month: ordersThisMonthRes.count || 0,
            revenue_this_month: revenueRes.data?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0,
            pages: 1, // Default to 1 Facebook page
        };

        // Get recent invoices
        const { data: invoices } = await supabase
            .from('invoices')
            .select('id, invoice_number, amount, status, created_at, paid_at')
            .eq('shop_id', shop.id)
            .order('created_at', { ascending: false })
            .limit(5);

        return NextResponse.json({
            subscription: subscription || null,
            plan: subscription?.plans || null,
            usage: usageSummary,
            invoices: invoices || [],
            has_subscription: !!subscription
        });
    } catch (error: unknown) {
        logger.error('Get subscription error:', { error: error });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch subscription' },
            { status: 500 }
        );
    }
}
