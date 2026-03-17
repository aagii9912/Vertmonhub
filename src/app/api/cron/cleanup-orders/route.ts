import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { safeErrorResponse } from '@/lib/utils/safe-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/cleanup-orders
 * Cron job to expire unpaid orders older than 30 minutes.
 * Can be called by Vercel Cron or Supabase Edge Functions.
 */
export async function GET(request: NextRequest) {
    // Verify Authorization header for security
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const supabase = supabaseAdmin();
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    try {
        // 1. Find expired 'pending' orders
        const { data: expiredOrders, error: findError } = await supabase
            .from('orders')
            .select('id, shop_id, order_items(product_id, quantity)')
            .eq('status', 'pending')
            .lt('created_at', thirtyMinutesAgo);

        if (findError) throw findError;

        if (!expiredOrders || expiredOrders.length === 0) {
            return NextResponse.json({ message: 'No expired orders found', count: 0 });
        }

        logger.info(`Found ${expiredOrders.length} expired orders to clean up.`);

        // 2. Collect all product IDs that need stock restoration
        const productStockUpdates = new Map<string, number>();

        for (const order of expiredOrders) {
            if (order.order_items && order.order_items.length > 0) {
                for (const item of order.order_items) {
                    const current = productStockUpdates.get(item.product_id) || 0;
                    productStockUpdates.set(item.product_id, current + item.quantity);
                }
            }
        }

        // 3. Batch fetch all affected products in ONE query (fixes N+1)
        const productIds = Array.from(productStockUpdates.keys());
        if (productIds.length > 0) {
            const { data: products } = await supabase
                .from('products')
                .select('id, reserved_stock')
                .in('id', productIds);

            // 4. Batch update all products in parallel
            if (products) {
                await Promise.all(products.map(product => {
                    const quantityToRestore = productStockUpdates.get(product.id) || 0;
                    const newReserved = Math.max(0, (product.reserved_stock || 0) - quantityToRestore);
                    return supabase
                        .from('products')
                        .update({ reserved_stock: newReserved })
                        .eq('id', product.id);
                }));
            }
        }

        // 5. Batch update all orders to cancelled
        let successCount = 0;
        for (const order of expiredOrders) {
            const { error: updateError } = await supabase
                .from('orders')
                .update({
                    status: 'cancelled',
                    notes: 'Auto-expired: Payment not received in 30 mins'
                })
                .eq('id', order.id);

            if (!updateError) successCount++;
        }

        return NextResponse.json({
            success: true,
            message: `Successfully expired ${successCount} orders`,
            processed: expiredOrders.length
        });

    } catch (error) {
        return safeErrorResponse(error, 'Cleanup cron алдаа');
    }
}
