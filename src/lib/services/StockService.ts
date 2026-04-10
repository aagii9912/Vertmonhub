/**
 * Stock Service - Handles stock deduction and release for orders
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * Deduct stock when order is confirmed
 * - Decrements `stock` by ordered quantity
 * - Decrements `reserved_stock` by ordered quantity (was reserved at checkout)
 */
export async function deductStockForOrder(orderId: string): Promise<void> {
    const supabase = supabaseAdmin();

    const { data: orderItems } = await supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', orderId);

    if (!orderItems || orderItems.length === 0) {
        logger.warn('No order items found for stock deduction:', { orderId });
        return;
    }

    await Promise.all(orderItems.map(async (item) => {
        const { data: product } = await supabase
            .from('products')
            .select('stock, reserved_stock')
            .eq('id', item.product_id)
            .single();

        if (product) {
            const newStock = Math.max(0, (product.stock || 0) - item.quantity);
            const newReserved = Math.max(0, (product.reserved_stock || 0) - item.quantity);

            await supabase
                .from('products')
                .update({ stock: newStock, reserved_stock: newReserved })
                .eq('id', item.product_id);
        }
    }));

    logger.info('Stock deducted for order:', { orderId, items: orderItems.length });
}

/**
 * Release reserved stock when order is cancelled
 * - Decrements `reserved_stock` only (stock stays the same)
 */
export async function releaseStockForOrder(orderId: string): Promise<void> {
    const supabase = supabaseAdmin();

    const { data: orderItems } = await supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', orderId);

    if (!orderItems || orderItems.length === 0) return;

    await Promise.all(orderItems.map(async (item) => {
        const { data: product } = await supabase
            .from('products')
            .select('reserved_stock')
            .eq('id', item.product_id)
            .single();

        if (product) {
            const newReserved = Math.max(0, (product.reserved_stock || 0) - item.quantity);

            await supabase
                .from('products')
                .update({ reserved_stock: newReserved })
                .eq('id', item.product_id);
        }
    }));

    logger.info('Reserved stock released for cancelled order:', { orderId });
}
