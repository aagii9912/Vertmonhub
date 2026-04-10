import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { sendPushNotification } from '@/lib/notifications';
import type { CancelOrderArgs } from '../../definitions';
import type { ToolExecutionResult, ToolExecutionContext } from '../../../services/ToolExecutor';

export async function executeCancelOrder(
    args: CancelOrderArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const { reason } = args;
    const supabase = supabaseAdmin();

    if (!context.customerId) {
        return { success: false, error: 'No customer context' };
    }

    const { data: pendingOrder } = await supabase
        .from('orders')
        .select(`id, status, total_amount, order_items (product_id, quantity)`)
        .eq('customer_id', context.customerId)
        .eq('shop_id', context.shopId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!pendingOrder) {
        return { success: false, error: 'No pending order found to cancel' };
    }

    await supabase
        .from('orders')
        .update({ status: 'cancelled', notes: `Cancelled by customer. Reason: ${reason || 'Not specified'}` })
        .eq('id', pendingOrder.id);

    for (const item of (pendingOrder.order_items as { id: string; product_id: string; product_name: string; quantity: number; unit_price: number }[] || [])) {
        const { data: product } = await supabase
            .from('products')
            .select('reserved_stock')
            .eq('id', item.product_id)
            .single();

        if (product) {
            await supabase
                .from('products')
                .update({ reserved_stock: Math.max(0, (product.reserved_stock || 0) - item.quantity) })
                .eq('id', item.product_id);
        }
    }

    if (context.notifySettings?.cancel !== false) {
        await sendPushNotification(context.shopId, {
            title: '❌ Захиалга цуцлагдлаа',
            body: `${context.customerName || 'Хэрэглэгч'} захиалгаа цуцаллаа. Шалтгаан: ${reason || 'Тодорхойгүй'}`,
            url: '/dashboard/orders',
            tag: `cancel-${pendingOrder.id}`
        });
    }

    logger.info('Order cancelled and stock restored:', { orderId: pendingOrder.id });

    return {
        success: true,
        message: `Order #${pendingOrder.id.substring(0, 8)} cancelled. Stock restored.`,
        actions: [
            {
                type: 'support_actions',
                buttons: [
                    {
                        id: 'browse_products',
                        label: '🛍️ Бараа үзэх',
                        variant: 'primary',
                        payload: 'BROWSE_PRODUCTS',
                    },
                    {
                        id: 'human_support',
                        label: '👤 Оператор',
                        icon: 'human',
                        variant: 'secondary',
                        payload: 'REQUEST_HUMAN',
                    },
                ],
            },
        ],
    };
}
