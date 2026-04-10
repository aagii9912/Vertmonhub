import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';
import { sendBulkOrderNotifications } from '@/lib/services/OrderNotificationService';

const bulkUpdateSchema = z.object({
    orderIds: z.array(z.string().uuid()),
    status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'paid']),
});

export async function POST(request: NextRequest) {
    try {
        const authShop = await getAuthUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const validation = bulkUpdateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({
                error: 'Validation failed',
                details: validation.error.issues
            }, { status: 400 });
        }

        const { orderIds, status } = validation.data;
        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        if (orderIds.length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0 });
        }

        // Update orders
        const { data: updatedOrders, error } = await supabase
            .from('orders')
            .update({ status, updated_at: new Date().toISOString() })
            .in('id', orderIds)
            .eq('shop_id', shopId) // Ensure ownership
            .select();

        if (error) throw error;

        // Stock management for confirmed/cancelled status changes
        if (status === 'confirmed' || status === 'cancelled') {
            const { deductStockForOrder, releaseStockForOrder } = await import('@/lib/services/StockService');

            // Get previous statuses to only process orders that actually changed
            const { data: previousOrders } = await supabase
                .from('orders')
                .select('id, status')
                .in('id', orderIds)
                .eq('shop_id', shopId);

            if (previousOrders) {
                await Promise.all(previousOrders.map(async (order) => {
                    if (status === 'confirmed' && order.status === 'pending') {
                        await deductStockForOrder(order.id);
                    } else if (status === 'cancelled' && order.status === 'pending') {
                        await releaseStockForOrder(order.id);
                    }
                }));
            }
        }

        // Send notifications to all customers (async, non-blocking)
        sendBulkOrderNotifications(orderIds, status, shopId);

        return NextResponse.json({
            success: true,
            updatedCount: updatedOrders?.length || 0,
            message: `${updatedOrders?.length || 0} захиалга шинэчлэгдлээ`
        });

    } catch (error: unknown) {
        logger.error('Bulk update error:', { error });
        return NextResponse.json({ error: 'Failed to update orders' }, { status: 500 });
    }
}
