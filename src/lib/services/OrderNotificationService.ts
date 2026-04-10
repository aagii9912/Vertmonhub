/**
 * Order Notification Service
 * Sends Facebook Messenger notifications when order status changes
 * Uses Message Tags (POST_PURCHASE_UPDATE) to send outside 24-hour window
 */

import { sendTaggedMessage } from '@/lib/facebook/messenger';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// Mongolian status messages
const STATUS_MESSAGES: Record<string, string> = {
    confirmed: '✅ Таны #{orderId} захиалга баталгаажлаа! Бид удахгүй бэлтгэж эхэлнэ.',
    processing: '📦 Таны #{orderId} захиалга бэлтгэгдэж байна.',
    shipped: '🚚 Таны #{orderId} захиалга хүргэлтэнд гарлаа! Удахгүй хүргэгдэнэ.',
    delivered: '🎉 Таны #{orderId} захиалга амжилттай хүргэгдлээ! Баярлалаа 🙏',
    cancelled: '❌ Таны #{orderId} захиалга цуцлагдлаа. Асуух зүйл байвал бидэнтэй холбогдоорой.',
};

interface NotificationResult {
    success: boolean;
    error?: string;
}

/**
 * Send order status notification to customer via Facebook Messenger
 */
export async function sendOrderStatusNotification(
    customerId: string,
    orderId: string,
    status: string,
    shopId: string
): Promise<NotificationResult> {
    try {
        const supabase = supabaseAdmin();

        // Get customer's Facebook ID
        const { data: customer } = await supabase
            .from('customers')
            .select('facebook_id, name')
            .eq('id', customerId)
            .single();

        if (!customer?.facebook_id) {
            logger.info(`[OrderNotification] Customer ${customerId} has no Facebook ID, skipping notification`);
            return { success: true }; // Not an error, just skip
        }

        // Get shop's page access token
        const { data: shop } = await supabase
            .from('shops')
            .select('facebook_page_access_token')
            .eq('id', shopId)
            .single();

        if (!shop?.facebook_page_access_token) {
            logger.warn(`[OrderNotification] Shop ${shopId} has no page access token`);
            return { success: false, error: 'No page access token' };
        }

        // Get appropriate message
        const messageTemplate = STATUS_MESSAGES[status];
        if (!messageTemplate) {
            logger.info(`[OrderNotification] No message template for status: ${status}`);
            return { success: true }; // Not all statuses need notifications
        }

        // Format message with order ID (show first 8 chars)
        const message = messageTemplate.replace('#{orderId}', orderId.slice(0, 8));

        // Send the tagged message
        await sendTaggedMessage({
            recipientId: customer.facebook_id,
            message,
            pageAccessToken: shop.facebook_page_access_token,
            tag: 'POST_PURCHASE_UPDATE',
        });

        logger.info(`[OrderNotification] Sent "${status}" notification to ${customer.name || 'customer'}`);

        return { success: true };
    } catch (error: unknown) {
        logger.error('[OrderNotification] Failed to send notification:', { error });
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Send notifications for bulk order updates (async, non-blocking)
 */
export async function sendBulkOrderNotifications(
    orderIds: string[],
    status: string,
    shopId: string
): Promise<void> {
    // Run in background, don't await
    Promise.all(
        orderIds.map(async (orderId) => {
            try {
                const supabase = supabaseAdmin();
                const { data: order } = await supabase
                    .from('orders')
                    .select('customer_id')
                    .eq('id', orderId)
                    .single();

                if (order?.customer_id) {
                    await sendOrderStatusNotification(order.customer_id, orderId, status, shopId);
                }
            } catch (error: unknown) {
                logger.error(`[BulkNotification] Error for order ${orderId}:`, { error });
            }
        })
    ).catch((error) => {
        logger.error('[BulkNotification] Bulk notification failed:', { error });
    });
}
