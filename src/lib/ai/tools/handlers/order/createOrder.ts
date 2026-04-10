import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { sendOrderNotification } from '@/lib/notifications';
import type { CreateOrderArgs } from '../../definitions';
import type { ToolExecutionResult, ToolExecutionContext } from '../../../services/ToolExecutor';

export async function executeCreateOrder(
    args: CreateOrderArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const { product_name, quantity, color, size } = args;
    const supabase = supabaseAdmin();

    const product = context.products.find(p =>
        p.name.toLowerCase().includes(product_name.toLowerCase())
    );

    if (!product) {
        return { success: false, error: `Product "${product_name}" not found.` };
    }

    const { data: dbProduct } = await supabase
        .from('products')
        .select('stock, reserved_stock, price, id')
        .eq('id', product.id)
        .single();

    if (!dbProduct) {
        return { success: false, error: 'Бүтээгдэхүүний мэдээлэл олдсонгүй.' };
    }

    const availableStock = (dbProduct.stock || 0) - (dbProduct.reserved_stock || 0);
    if (availableStock < quantity) {
        return { success: false, error: `Үлдэгдэл хүрэлцэхгүй. Боломжит: ${availableStock}` };
    }

    if (!context.shopId || !context.customerId) {
        return { success: false, error: 'Missing shop or customer ID context.' };
    }

    // Idempotency: check for duplicate pending orders
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
    const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, total_amount')
        .eq('customer_id', context.customerId)
        .eq('shop_id', context.shopId)
        .eq('status', 'pending')
        .gt('created_at', thirtySecondsAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (existingOrder) {
        const { data: verifyItem } = await supabase
            .from('order_items')
            .select('product_id')
            .eq('order_id', existingOrder.id)
            .eq('product_id', product.id)
            .single();

        if (verifyItem) {
            logger.info('Duplicate order prevented, returning existing:', { orderId: existingOrder.id });
            return {
                success: true,
                message: `Success! Order #${existingOrder.id.substring(0, 8)} created (Found existing). Total: ${existingOrder.total_amount.toLocaleString()}₮.`,
                data: { orderId: existingOrder.id, total: existingOrder.total_amount }
            };
        }
    }

    // Atomic stock reservation (prevents race conditions via SELECT ... FOR UPDATE)
    const { data: reserved, error: reserveError } = await supabase.rpc('reserve_stock', {
        p_product_id: product.id,
        p_quantity: quantity,
    });

    if (reserveError || !reserved) {
        logger.warn('Stock reservation failed:', { error: reserveError, reserved });
        return { success: false, error: `Үлдэгдэл хүрэлцэхгүй байна. Дахин оролдоно уу.` };
    }

    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
            shop_id: context.shopId,
            customer_id: context.customerId,
            status: 'pending',
            total_amount: dbProduct.price * quantity,
            notes: `AI Order: ${product_name} (${color || ''} ${size || ''})`,
            created_at: new Date().toISOString()
        })
        .select()
        .single();

    if (orderError) {
        logger.error('Order creation error, releasing stock:', { error: orderError });
        // Release the reserved stock since order failed
        await supabase.rpc('reserve_stock', { p_product_id: product.id, p_quantity: -quantity });
        return { success: false, error: orderError.message };
    }

    const { error: itemError } = await supabase.from('order_items').insert({
        order_id: order.id,
        product_id: product.id,
        quantity: quantity,
        unit_price: dbProduct.price,
        color: color || null,
        size: size || null
    });

    if (itemError) {
        logger.error('Order item insert failed, rolling back order:', { error: itemError });
        await supabase.from('orders').delete().eq('id', order.id);
        await supabase.rpc('reserve_stock', { p_product_id: product.id, p_quantity: -quantity });
        return { success: false, error: 'Захиалгын бараа нэмэхэд алдаа гарлаа. Дахин оролдоно уу.' };
    }

    if (context.notifySettings?.order !== false) {
        try {
            await sendOrderNotification(context.shopId, 'new', {
                orderId: order.id,
                customerName: context.customerName,
                totalAmount: dbProduct.price * quantity,
            });
        } catch (notifError) {
            logger.warn('Failed to send order notification:', { error: String(notifError) });
        }
    }

    return {
        success: true,
        message: `Success! Order #${order.id.substring(0, 8)} created. Total: ${(dbProduct.price * quantity).toLocaleString()}₮. Stock reserved.`,
        data: { orderId: order.id, total: dbProduct.price * quantity },
        actions: [
            {
                type: 'confirmation',
                buttons: [
                    {
                        id: 'checkout_now',
                        label: '💳 Төлбөр төлөх',
                        variant: 'primary',
                        payload: 'CHECKOUT',
                    },
                    {
                        id: 'continue',
                        label: '🛒 Үргэлжлүүлэх',
                        variant: 'secondary',
                        payload: 'CONTINUE_SHOPPING',
                    },
                ],
                context: { order_id: order.id },
            },
        ],
    };
}
