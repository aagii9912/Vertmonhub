/**
 * WebhookService — Meta webhook-оос ирсэн Messenger / Instagram DM-ийг
 * харилцагч ба chat_history-д хадгална (dashboard Inbox уншина).
 * Автомат (AI) хариу байхгүй — хариуг хүн Inbox-оос өгнө.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { extractPhoneFromText } from '@/lib/utils/phone';
import { appsecretProof } from '@/lib/facebook/messenger';
import { decryptToken } from '@/lib/crypto/tokens';

/** Webhook-д хэрэгтэй shop-ийн талбарууд (токенууд тайлагдсан). */
export interface WebhookShop {
    id: string;
    name: string;
    facebook_page_id: string | null;
    facebook_page_access_token?: string | null;
    instagram_business_account_id?: string | null;
    instagram_access_token?: string | null;
}

export interface CustomerData {
    id: string;
    name?: string | null;
    phone?: string | null;
    message_count?: number;
    instagram_id?: string | null;
    platform?: 'messenger' | 'instagram';
}

const SHOP_COLUMNS = 'id, name, facebook_page_id, facebook_page_access_token, instagram_business_account_id, instagram_access_token';

function toWebhookShop(data: Record<string, unknown> | null): WebhookShop | null {
    if (!data) return null;
    return {
        id: data.id as string,
        name: data.name as string,
        facebook_page_id: (data.facebook_page_id as string | null) ?? null,
        facebook_page_access_token: decryptToken(data.facebook_page_access_token as string | null),
        instagram_business_account_id: (data.instagram_business_account_id as string | null) ?? null,
        instagram_access_token: decryptToken(data.instagram_access_token as string | null),
    };
}

/** Facebook page ID-аар идэвхтэй shop. */
export async function getShopByPageId(pageId: string): Promise<WebhookShop | null> {
    const { data } = await supabaseAdmin()
        .from('shops')
        .select(SHOP_COLUMNS)
        .eq('facebook_page_id', pageId)
        .eq('is_active', true)
        .single();
    return toWebhookShop(data);
}

/** Instagram Business Account ID-аар идэвхтэй shop. */
export async function getShopByInstagramId(instagramId: string): Promise<WebhookShop | null> {
    const { data } = await supabaseAdmin()
        .from('shops')
        .select(SHOP_COLUMNS)
        .eq('instagram_business_account_id', instagramId)
        .eq('is_active', true)
        .single();
    return toWebhookShop(data);
}

/** Жагсаалтаас хасагдсан (soft delete) харилцагч дахин бичвэл Inbox, CRM-д буцааж гаргана. */
async function restoreIfDeleted(customer: { id: string; deleted_at?: string | null }): Promise<void> {
    if (!customer.deleted_at) return;
    const { error } = await supabaseAdmin().from('customers').update({ deleted_at: null }).eq('id', customer.id);
    if (error) logger.warn('[Webhook] could not restore a deleted customer', { customerId: customer.id, error: error.message });
}

/**
 * Get or create customer from Facebook sender ID
 */
export async function getOrCreateCustomer(
    shopId: string,
    facebookId: string,
    pageAccessToken: string
): Promise<CustomerData> {
    const supabase = supabaseAdmin();

    const { data: existingCustomer } = await supabase
        .from('customers')
        .select('*')
        .eq('facebook_id', facebookId)
        .eq('shop_id', shopId)
        .single();

    if (existingCustomer) {
        await restoreIfDeleted(existingCustomer);
        return {
            id: existingCustomer.id,
            name: existingCustomer.name,
            phone: existingCustomer.phone,
            message_count: existingCustomer.message_count || 0,
        };
    }

    // Try to get Facebook profile
    const userName = await fetchFacebookUserName(facebookId, pageAccessToken);

    let { data: newCustomer } = await supabase
        .from('customers')
        .insert({
            shop_id: shopId,
            facebook_id: facebookId,
            name: userName,
            tags: ['source:facebook'],
        })
        .select()
        .single();

    // Race: зэрэг ирсэн 2 мессеж — UNIQUE(shop_id, facebook_id) ялагдсан insert-ийн дараа
    // дахин уншина (өмнө нь id:'' буцааж тухайн ээлж түүх/санах ойгүй явдаг байв).
    if (!newCustomer?.id) {
        const { data: again } = await supabase
            .from('customers')
            .select('*')
            .eq('facebook_id', facebookId)
            .eq('shop_id', shopId)
            .limit(1)
            .maybeSingle();
        newCustomer = again ?? null;
    }

    return {
        id: newCustomer?.id || '',
        name: newCustomer?.name || userName,
        phone: newCustomer?.phone ?? null,
        message_count: newCustomer?.message_count || 0,
        platform: 'messenger',
    };
}

/**
 * Get or create customer from Instagram sender ID
 */
export async function getOrCreateInstagramCustomer(
    shopId: string,
    instagramId: string,
    accessToken: string
): Promise<CustomerData> {
    const supabase = supabaseAdmin();

    // First check by instagram_id (.limit(1).maybeSingle — давхар мөр байсан ч `.single()`
    // шиг алдаа өгч мессеж бүрд шинэ харилцагч үүсгэхгүй)
    const { data: existingCustomer } = await supabase
        .from('customers')
        .select('*')
        .eq('instagram_id', instagramId)
        .eq('shop_id', shopId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (existingCustomer) {
        await restoreIfDeleted(existingCustomer);
        return {
            id: existingCustomer.id,
            name: existingCustomer.name,
            phone: existingCustomer.phone,
            message_count: existingCustomer.message_count || 0,
            instagram_id: existingCustomer.instagram_id,
            platform: 'instagram',
        };
    }

    // Try to get Instagram username
    const userName = await fetchInstagramUserName(instagramId, accessToken);

    let { data: newCustomer } = await supabase
        .from('customers')
        .insert({
            shop_id: shopId,
            instagram_id: instagramId,
            name: userName,
            platform: 'instagram',
            tags: ['source:instagram'],
        })
        .select()
        .single();

    // Race (зэрэг 2 мессеж): unique index (migration 20260911130000) ялагдсан insert-ийн
    // дараа дахин уншина — давхар харилцагч үүсэхгүй, id хоосон буцахгүй.
    if (!newCustomer?.id) {
        const { data: again } = await supabase
            .from('customers')
            .select('*')
            .eq('instagram_id', instagramId)
            .eq('shop_id', shopId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
        newCustomer = again ?? null;
    }

    return {
        id: newCustomer?.id || '',
        name: userName,
        phone: null,
        message_count: 0,
        instagram_id: instagramId,
        platform: 'instagram',
    };
}

/**
 * Fetch Instagram user name from Graph API
 */
async function fetchInstagramUserName(userId: string, accessToken: string): Promise<string | null> {
    try {
        const proof = appsecretProof(accessToken);
        const proofParam = proof ? `&appsecret_proof=${proof}` : '';
        const response = await fetch(
            `https://graph.facebook.com/v21.0/${userId}?fields=username,name&access_token=${accessToken}${proofParam}`
        );
        if (response.ok) {
            const data = await response.json();
            return data.name || data.username || null;
        }
    } catch {
        logger.warn('Could not fetch Instagram profile', { userId });
    }
    return null;
}

/**
 * Fetch Facebook user name
 */
async function fetchFacebookUserName(userId: string, accessToken: string): Promise<string | null> {
    try {
        const proof = appsecretProof(accessToken);
        const proofParam = proof ? `&appsecret_proof=${proof}` : '';
        const response = await fetch(
            `https://graph.facebook.com/v21.0/${userId}?fields=first_name,last_name,name&access_token=${accessToken}${proofParam}`
        );
        if (response.ok) {
            const data = await response.json();
            return data.name || data.first_name || null;
        }
    } catch {
        logger.warn('Could not fetch Facebook profile', { userId });
    }
    return null;
}

/**
 * Update customer info (name from Facebook if missing)
 */
export async function updateCustomerInfo(
    customer: CustomerData,
    facebookId: string,
    pageAccessToken: string,
    message: string
): Promise<CustomerData> {
    const supabase = supabaseAdmin();
    const updatedCustomer = { ...customer };

    // Extract phone from message if not saved
    if (!customer.phone) {
        const extracted = extractPhoneFromText(message);
        if (extracted) {
            await supabase
                .from('customers')
                .update({ phone: extracted, phone_normalized: extracted })
                .eq('id', customer.id);
            updatedCustomer.phone = extracted;
            logger.info('Phone extracted from message', { phone: extracted });
        }
    }

    // Update name from Facebook if missing
    if (!customer.name) {
        const userName = await fetchFacebookUserName(facebookId, pageAccessToken);
        if (userName) {
            await supabase
                .from('customers')
                .update({ name: userName })
                .eq('id', customer.id);
            updatedCustomer.name = userName;
            logger.info('Updated customer name from Facebook', { userName });
        }
    }

    return updatedCustomer;
}

const ATTACHMENT_LABELS: Record<string, string> = {
    image: '[Зураг]',
    video: '[Видео]',
    audio: '[Дуут мессеж]',
    file: '[Файл]',
    location: '[Байршил]',
};

/** Inbox-д харуулах текст. Хавсралтын (хугацаатай) URL-ийг хадгалахгүй, зөвхөн төрлийг нь. */
export function incomingMessageText(message?: { text?: string; attachments?: Array<{ type: string }> }): string {
    const labels = (message?.attachments || []).map((attachment) => ATTACHMENT_LABELS[attachment.type] || '[Хавсралт]');
    return [message?.text?.trim(), ...labels].filter(Boolean).join(' ');
}

/** Харилцагчийн мессеж (response = null) эсвэл хүний хариуг chat_history-д бичнэ. */
export async function saveChatHistory(shopId: string, customerId: string, message: string, response: string | null = null): Promise<void> {
    const { error } = await supabaseAdmin().from('chat_history').insert({
        shop_id: shopId,
        customer_id: customerId,
        message,
        response,
    });
    if (error) logger.error('[Webhook] chat_history insert failed', { shopId, customerId, error: error.message });
}

/** Харилцагчийн нийт мессежийн тоог нэмэгдүүлнэ (atomic RPC, байхгүй бол энгийн update). */
export async function incrementMessageCount(customerId: string): Promise<void> {
    const supabase = supabaseAdmin();
    try {
        const { error } = await supabase.rpc('increment_customer_message_count', { p_customer_id: customerId });
        if (!error) return;
        logger.warn('RPC increment failed, using manual update:', { error: error.message });
        const { data: customer } = await supabase.from('customers').select('message_count').eq('id', customerId).single();
        await supabase.from('customers').update({ message_count: (customer?.message_count || 0) + 1 }).eq('id', customerId);
    } catch (error) {
        logger.error('Failed to increment message count:', { error, customerId });
    }
}
