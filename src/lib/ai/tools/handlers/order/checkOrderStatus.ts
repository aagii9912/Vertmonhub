import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import type { CheckOrderStatusArgs } from '../../definitions';
import type { ToolExecutionResult, ToolExecutionContext } from '../../../services/ToolExecutor';

export async function executeCheckOrderStatus(
    args: CheckOrderStatusArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const supabase = supabaseAdmin();
    const { orderId } = { orderId: args.order_id };

    try {
        let query = supabase
            .from('orders')
            .select('id, status, total_amount, created_at, order_items(product_name, quantity, unit_price)')
            .eq('shop_id', context.shopId)
            .eq('customer_id', context.customerId)
            .order('created_at', { ascending: false });

        if (orderId) {
            query = query.eq('id', orderId);
        } else {
            query = query.limit(5);
        }

        const { data: orders, error } = await query;

        if (error) {
            logger.error('Failed to fetch orders:', { error });
            return { success: false, error: 'Захиалга хайхад алдаа гарлаа' };
        }

        if (!orders || orders.length === 0) {
            return {
                success: true,
                message: 'Танд одоогоор захиалга байхгүй байна.',
                data: { orders: [] }
            };
        }

        const orderSummaries = orders.map(order => {
            const statusLabels: Record<string, string> = {
                pending: '⏳ Хүлээгдэж буй',
                confirmed: '✅ Баталгаажсан',
                processing: '📦 Бэлтгэж байна',
                shipped: '🚚 Хүргэлтэд',
                delivered: '✔️ Хүргэгдсэн',
                cancelled: '❌ Цуцлагдсан'
            };

            const items = (order.order_items as { product_name: string; quantity: number }[])?.map(
                (item: { product_name: string; quantity: number }) => `${item.product_name} x${item.quantity}`
            ).join(', ') || '';

            return {
                id: order.id.substring(0, 8).toUpperCase(),
                status: statusLabels[order.status] || order.status,
                total: order.total_amount,
                date: new Date(order.created_at).toLocaleDateString('mn-MN'),
                items
            };
        });

        const summaryText = orderSummaries.map(o =>
            `#${o.id}: ${o.status} - ${o.total?.toLocaleString()}₮ (${o.date})\n   └ ${o.items}`
        ).join('\n\n');

        return {
            success: true,
            message: `Таны сүүлийн захиалгууд:\n\n${summaryText}`,
            data: { orders: orderSummaries },
            actions: [
                {
                    type: 'order_actions',
                    buttons: [
                        {
                            id: 'cancel_order',
                            label: '❌ Цуцлах',
                            icon: 'cancel',
                            variant: 'danger',
                            payload: 'CANCEL_ORDER',
                        },
                        {
                            id: 'reorder',
                            label: '🔄 Дахин захиалах',
                            icon: 'reorder',
                            variant: 'secondary',
                            payload: 'REORDER',
                        },
                        {
                            id: 'human_support',
                            label: '👤 Оператор',
                            variant: 'ghost',
                            payload: 'REQUEST_HUMAN',
                        },
                    ],
                },
            ],
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Check order status error:', { error: errorMessage });
        return { success: false, error: 'Захиалгын статус шалгахад алдаа гарлаа' };
    }
}
