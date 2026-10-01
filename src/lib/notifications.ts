import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// Lazy VAPID initialization flag
let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
    if (vapidConfigured) return true;

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@vertmon.mn';

    if (vapidPublicKey && vapidPrivateKey) {
        try {
            // Sanitize keys: remove whitespace and base64 padding (=)
            const cleanPublicKey = vapidPublicKey.trim().replace(/=/g, '');
            const cleanPrivateKey = vapidPrivateKey.trim().replace(/=/g, '');
            const cleanEmail = vapidEmail.trim();

            webpush.setVapidDetails(cleanEmail, cleanPublicKey, cleanPrivateKey);
            vapidConfigured = true;
            return true;
        } catch (error) {
            logger.error('Failed to configure VAPID', { error });
            return false;
        }
    }
    return false;
}

export interface NotificationPayload {
    title: string;
    body: string;
    url?: string;
    tag?: string;
    icon?: string;
    actions?: Array<{ action: string; title: string }>;
}

interface PushSubscriptionRow {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
}

/** Өгсөн бүртгэлүүд рүү payload илгээж, хүчингүй болсныг нь устгана. */
async function sendToSubscriptions(
    subscriptions: PushSubscriptionRow[],
    payload: NotificationPayload,
): Promise<{ success: number; failed: number }> {
    const supabase = supabaseAdmin();
    let success = 0;
    let failed = 0;

    for (const sub of subscriptions) {
        try {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                },
            };

            await webpush.sendNotification(
                pushSubscription,
                JSON.stringify(payload)
            );
            success++;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            logger.error('Push notification failed', { error: errorMessage });
            failed++;

            // Remove invalid subscriptions (expired or unsubscribed)
            const statusCode = (err as { statusCode?: number })?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
                await supabase
                    .from('push_subscriptions')
                    .delete()
                    .eq('id', sub.id);
            }
        }
    }

    return { success, failed };
}

/**
 * Send push notification to all subscriptions for a shop
 */
export async function sendPushNotification(
    shopId: string,
    payload: NotificationPayload
): Promise<{ success: number; failed: number }> {
    // Ensure VAPID is configured before sending
    if (!ensureVapidConfigured()) {
        logger.warn('Push notification skipped: VAPID not configured');
        return { success: 0, failed: 0 };
    }

    const supabase = supabaseAdmin();

    logger.debug('sendPushNotification called', { shopId, payload });

    // Get all subscriptions for this shop
    const { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('shop_id', shopId);

    logger.debug('Push subscriptions query result', { count: subscriptions?.length || 0, error: error?.message });

    if (error) {
        logger.error('Push notification database error', { error });
        return { success: 0, failed: 0 };
    }

    if (!subscriptions || subscriptions.length === 0) {
        logger.debug('No push subscriptions found', { shopId });
        return { success: 0, failed: 0 };
    }

    return sendToSubscriptions(subscriptions, payload);
}

/**
 * Зөвхөн НЭГ хэрэглэгчийн бүртгэлүүд рүү push илгээнэ (хувийн сануулга г.м).
 * push_subscriptions.user_id нь /api/push/subscribe дээр тамгалагддаг;
 * user_id-гүй хуучин бүртгэлүүд дараагийн нэвтрэлтээр автоматаар холбогдоно.
 */
export async function sendPushNotificationToUser(
    shopId: string,
    userId: string,
    payload: NotificationPayload,
): Promise<{ success: number; failed: number }> {
    if (!ensureVapidConfigured()) {
        logger.warn('Push notification skipped: VAPID not configured');
        return { success: 0, failed: 0 };
    }

    const supabase = supabaseAdmin();
    const { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('shop_id', shopId)
        .eq('user_id', userId);

    if (error) {
        logger.error('Push notification database error', { error });
        return { success: 0, failed: 0 };
    }
    if (!subscriptions || subscriptions.length === 0) {
        logger.debug('No user push subscriptions found', { shopId, userId });
        return { success: 0, failed: 0 };
    }

    return sendToSubscriptions(subscriptions, payload);
}

/** Лидийн хувийн мэдээллийг зөвхөн хариуцсан акаунт болон байгууллагын админд илгээнэ. */
export async function sendLeadPushNotification(
    shopId: string,
    leadId: string | null,
    payload: NotificationPayload,
): Promise<{ success: number; failed: number }> {
    const skipped = { success: 0, failed: 0 };
    if (!ensureVapidConfigured()) return skipped;
    const db = supabaseAdmin();
    const [shop, members] = await Promise.all([
        db.from('shops').select('user_id').eq('id', shopId).maybeSingle(),
        db.from('shop_members').select('user_id').eq('shop_id', shopId),
    ]);
    if (shop.error || members.error || !shop.data) return skipped;
    const shopUsers = new Set<string>((members.data || []).map(row => row.user_id).filter(Boolean));
    if (shop.data.user_id) shopUsers.add(shop.data.user_id);
    if (!shopUsers.size) return skipped;
    const roles = await db.from('user_roles').select('user_id').in('user_id', [...shopUsers]).in('role', ['admin', 'super_admin']);
    if (roles.error) return skipped;
    const recipients = new Set<string>((roles.data || []).map(row => row.user_id));

    if (leadId) {
        const lead = await db.from('leads').select('project_id,sales_manager_name').eq('id', leadId).eq('shop_id', shopId).is('deleted_at', null).maybeSingle();
        if (lead.error || !lead.data) return skipped;
        const leadRow = lead.data;
        if (leadRow.project_id && leadRow.sales_manager_name) {
            const managers = await db.from('sales_managers').select('name,user_id').eq('shop_id', shopId).eq('is_active', true);
            if (!managers.error) {
                const matched = (managers.data || []).filter(row => row.name === leadRow.sales_manager_name);
                const manager = matched.length === 1 ? matched[0] : null;
                if (manager?.user_id && shopUsers.has(manager.user_id) && managers.data?.filter(row => row.user_id === manager.user_id).length === 1) {
                    const membership = await db.from('sales_manager_projects').select('project_id').eq('shop_id', shopId)
                        .eq('project_id', leadRow.project_id).eq('manager_name', manager.name).maybeSingle();
                    if (!membership.error && membership.data) recipients.add(manager.user_id);
                }
            }
        }
    }
    if (!recipients.size) return skipped;
    const subscriptions = await db.from('push_subscriptions').select('*').eq('shop_id', shopId).in('user_id', [...recipients]);
    if (subscriptions.error) return skipped;
    return sendToSubscriptions(subscriptions.data || [], payload);
}

/**
 * Get VAPID public key for client
 */
export function getVapidPublicKey(): string {
    return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
}
