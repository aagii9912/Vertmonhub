/**
 * WebhookService - Handles Facebook webhook processing
 * Extracted from webhook/route.ts for better organization
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { sendImage, sendImageGallery, appsecretProof } from '@/lib/facebook/messenger';
import { generateCommentReply } from '@/lib/ai/comment-detector';
import type { AIFAQ, AIQuickReply, AISlogan, NotifySettings, ChatMessage as AIChatMessage } from '@/types/ai';
import { IntentResult } from '@/lib/ai/intent-detector';

/**
 * Shop data with products and settings
 */
export interface ShopWithProducts {
    id: string;
    name: string;
    description?: string | null;
    ai_instructions?: string | null;
    ai_emotion?: 'friendly' | 'professional' | 'enthusiastic' | 'calm' | 'playful' | null;
    facebook_page_id: string;
    facebook_page_username?: string | null;
    facebook_page_access_token?: string | null;
    // Instagram fields
    instagram_business_account_id?: string | null;
    instagram_access_token?: string | null;
    instagram_username?: string | null;
    properties?: any[];
    notify_on_lead?: boolean | null;
    notify_on_viewing?: boolean | null;
    notify_on_contact?: boolean | null;
    notify_on_support?: boolean | null;
    is_ai_active?: boolean | null;
    custom_knowledge?: Record<string, unknown> | null;
}

/**
 * Customer data
 */
export interface CustomerData {
    id: string;
    name?: string | null;
    phone?: string | null;
    ai_paused_until?: string | null;
    // Message counting fields
    message_count?: number;
    message_count_reset_at?: string | null;
    // Platform fields
    instagram_id?: string | null;
    platform?: 'messenger' | 'instagram';
}

/**
 * AI Features data
 */
export interface AIFeatures {
    faqs: AIFAQ[];
    quickReplies: AIQuickReply[];
    slogans: AISlogan[];
}

/**
 * Chat history entry
 */
interface ChatHistoryEntry {
    message: string;
    response: string;
}

/**
 * Fetch shop data by Facebook page ID
 */
export async function getShopByPageId(pageId: string): Promise<ShopWithProducts | null> {
    const supabase = supabaseAdmin();

    const { data } = await supabase
        .from('shops')
        .select('*, properties(*)')
        .eq('facebook_page_id', pageId)
        .eq('is_active', true)
        .single();

    if (!data) return null;

    return {
        id: data.id,
        name: data.name,
        description: data.description,
        ai_instructions: data.ai_instructions,
        ai_emotion: data.ai_emotion,
        facebook_page_id: data.facebook_page_id,
        facebook_page_username: data.facebook_page_username,
        facebook_page_access_token: data.facebook_page_access_token,
        properties: data.properties || [],
        notify_on_lead: data.notify_on_lead,
        notify_on_viewing: data.notify_on_viewing,
        notify_on_contact: data.notify_on_contact,
        notify_on_support: data.notify_on_support,
        is_ai_active: data.is_ai_active,
        custom_knowledge: data.custom_knowledge,
        // Instagram fields
        instagram_business_account_id: data.instagram_business_account_id,
        instagram_access_token: data.instagram_access_token,
        instagram_username: data.instagram_username,
    };
}

/**
 * Fetch shop data by Instagram Business Account ID
 */
export async function getShopByInstagramId(instagramId: string): Promise<ShopWithProducts | null> {
    const supabase = supabaseAdmin();

    const { data } = await supabase
        .from('shops')
        .select('*, properties(*)')
        .eq('instagram_business_account_id', instagramId)
        .eq('is_active', true)
        .single();

    if (!data) return null;

    return {
        id: data.id,
        name: data.name,
        description: data.description,
        ai_instructions: data.ai_instructions,
        ai_emotion: data.ai_emotion,
        facebook_page_id: data.facebook_page_id,
        facebook_page_username: data.facebook_page_username,
        facebook_page_access_token: data.facebook_page_access_token,
        instagram_business_account_id: data.instagram_business_account_id,
        instagram_access_token: data.instagram_access_token,
        instagram_username: data.instagram_username,
        properties: data.properties || [],
        notify_on_lead: data.notify_on_lead,
        notify_on_viewing: data.notify_on_viewing,
        notify_on_contact: data.notify_on_contact,
        notify_on_support: data.notify_on_support,
        is_ai_active: data.is_ai_active,
        custom_knowledge: data.custom_knowledge,
    };
}

/**
 * Fetch AI features for a shop
 */
export async function getAIFeatures(shopId: string): Promise<AIFeatures> {
    const supabase = supabaseAdmin();

    const [faqRes, qrRes, sloganRes] = await Promise.all([
        supabase.from('shop_faqs').select('question, answer').eq('shop_id', shopId).eq('is_active', true),
        supabase.from('shop_quick_replies').select('trigger_words, response, is_exact_match').eq('shop_id', shopId).eq('is_active', true),
        supabase.from('shop_slogans').select('slogan, usage_context').eq('shop_id', shopId).eq('is_active', true)
    ]);

    return {
        faqs: (faqRes.data || []) as AIFAQ[],
        quickReplies: (qrRes.data || []) as AIQuickReply[],
        slogans: (sloganRes.data || []) as AISlogan[],
    };
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
        return {
            id: existingCustomer.id,
            name: existingCustomer.name,
            phone: existingCustomer.phone,
            ai_paused_until: existingCustomer.ai_paused_until,
            message_count: existingCustomer.message_count || 0,
            message_count_reset_at: existingCustomer.message_count_reset_at,
        };
    }

    // Try to get Facebook profile
    const userName = await fetchFacebookUserName(facebookId, pageAccessToken);

    const { data: newCustomer } = await supabase
        .from('customers')
        .insert({
            shop_id: shopId,
            facebook_id: facebookId,
            name: userName,
        })
        .select()
        .single();

    return {
        id: newCustomer?.id || '',
        name: userName,
        phone: null,
        message_count: 0,
        message_count_reset_at: null,
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

    // First check by instagram_id
    const { data: existingCustomer } = await supabase
        .from('customers')
        .select('*')
        .eq('instagram_id', instagramId)
        .eq('shop_id', shopId)
        .single();

    if (existingCustomer) {
        return {
            id: existingCustomer.id,
            name: existingCustomer.name,
            phone: existingCustomer.phone,
            ai_paused_until: existingCustomer.ai_paused_until,
            message_count: existingCustomer.message_count || 0,
            message_count_reset_at: existingCustomer.message_count_reset_at,
            instagram_id: existingCustomer.instagram_id,
            platform: 'instagram',
        };
    }

    // Try to get Instagram username
    const userName = await fetchInstagramUserName(instagramId, accessToken);

    const { data: newCustomer } = await supabase
        .from('customers')
        .insert({
            shop_id: shopId,
            instagram_id: instagramId,
            name: userName,
            platform: 'instagram',
        })
        .select()
        .single();

    return {
        id: newCustomer?.id || '',
        name: userName,
        phone: null,
        message_count: 0,
        message_count_reset_at: null,
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
        const phoneMatch = message.match(/(\d{8})/);
        if (phoneMatch) {
            await supabase
                .from('customers')
                .update({ phone: phoneMatch[1] })
                .eq('id', customer.id);
            updatedCustomer.phone = phoneMatch[1];
            logger.info('Phone extracted from message', { phone: phoneMatch[1] });
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

/**
 * Get recent chat history for AI context
 */
export async function getChatHistory(shopId: string, customerId: string): Promise<AIChatMessage[]> {
    const supabase = supabaseAdmin();

    const { data: historyData } = await supabase
        .from('chat_history')
        .select('message, response')
        .eq('shop_id', shopId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(5);

    const history: AIChatMessage[] = [];
    if (historyData) {
        historyData.reverse().forEach((h: ChatHistoryEntry) => {
            if (h.message) {
                history.push({ role: 'user', content: h.message });
            }
            if (h.response) {
                history.push({ role: 'assistant', content: h.response });
            }
        });
    }
    return history;
}

/**
 * Save chat to history
 */
export async function saveChatHistory(
    shopId: string,
    customerId: string | undefined,
    message: string,
    response: string,
    intent: string
): Promise<void> {
    const supabase = supabaseAdmin();

    await supabase.from('chat_history').insert({
        shop_id: shopId,
        customer_id: customerId,
        message,
        response,
        intent
    });
}

/**
 * Increment customer message count for plan-based limiting
 * Uses database function for atomic increment with monthly reset
 */
export async function incrementMessageCount(customerId: string): Promise<number> {
    const supabase = supabaseAdmin();

    try {
        // Try to use the database function for atomic increment
        const { data, error } = await supabase
            .rpc('increment_customer_message_count', { p_customer_id: customerId });

        if (error) {
            logger.warn('RPC increment failed, using manual update:', { error: error.message });

            // Fallback: manual increment
            const { data: customer } = await supabase
                .from('customers')
                .select('message_count, message_count_reset_at')
                .eq('id', customerId)
                .single();

            let newCount = (customer?.message_count || 0) + 1;
            const resetAt = customer?.message_count_reset_at;

            // Check if reset needed
            if (resetAt && new Date(resetAt) <= new Date()) {
                newCount = 1;
                await supabase
                    .from('customers')
                    .update({
                        message_count: newCount,
                        message_count_reset_at: getNextMonthFirstDay()
                    })
                    .eq('id', customerId);
            } else {
                await supabase
                    .from('customers')
                    .update({ message_count: newCount })
                    .eq('id', customerId);
            }

            return newCount;
        }

        return data || 0;
    } catch (error) {
        logger.error('Failed to increment message count:', { error, customerId });
        return 0;
    }
}

/**
 * Get first day of next month
 */
function getNextMonthFirstDay(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

/**
 * Build notify settings from shop data
 */
export function buildNotifySettings(shop: ShopWithProducts): NotifySettings {
    return {
        lead: shop.notify_on_lead ?? true,
        viewing: shop.notify_on_viewing ?? true,
        contact: shop.notify_on_contact ?? true,
        support: shop.notify_on_support ?? true,
    };
}

/**
 * Generate fallback response when AI fails
 */
export function generateFallbackResponse(
    intent: IntentResult,
    shopName: string,
    properties?: any[]
): string {
    const propertyList = (properties || []).slice(0, 3)
        .map((p: any) => `${p.name || p.title} (${Number(p.price).toLocaleString()}₮)`)
        .join(', ');

    switch (intent.intent) {
        case 'GREETING':
            return `Сайн байна уу! 😊 ${shopName}-д тавтай морил! Танд яаж туслах вэ?`;
        case 'PRODUCT_INQUIRY':
        case 'STOCK_CHECK':
            return propertyList
                ? `Манайд ${propertyList} зэрэг байрууд байна! 😊 Аль нь сонирхож байна вэ?`
                : 'Байрны мэдээлэл удахгүй орно!';
        case 'PRICE_CHECK':
            return 'Ямар байрны үнийг мэдэхийг хүсч байна вэ? 💰';
        case 'ORDER_CREATE':
            return 'Байр үзэхийг хүсвэл нэр, утас, хүссэн цагаа бичнэ үү! 📋';
        case 'ORDER_STATUS':
            return 'Мэдээлэл авахын тулд нэр, утас дугаараа хэлнэ үү! 🔍';
        case 'THANK_YOU':
            return 'Баярлалаа! Дахиад хандаарай 😊';
        case 'COMPLAINT':
            return 'Уучлаарай, танд тохиромжгүй байдал үүссэнд харамсаж байна. Асуудлаа дэлгэрэнгүй хэлнэ үү 🙏';
        default:
            return 'Уучлаарай, одоо системд түр алдаа гарлаа. Удахгүй хариулах болно! 🙏';
    }
}

/**
 * Process and send AI response with images
 */
export async function processAIResponse(
    response: { text: string; imageAction?: { type: 'single' | 'confirm' | 'attachment'; properties?: Array<{ name: string; price: number; imageUrl: string; description?: string }>; imageUrls?: string[] } },
    senderId: string,
    pageAccessToken: string
): Promise<void> {
    const { imageAction } = response;

    if (!imageAction) return;

    try {
        // Handle attachment type for property images
        if (imageAction.type === 'attachment' && imageAction.imageUrls && imageAction.imageUrls.length > 0) {
            for (const imageUrl of imageAction.imageUrls.slice(0, 5)) {
                await sendImage({
                    recipientId: senderId,
                    imageUrl,
                    pageAccessToken,
                });
            }
            logger.success(`Sent ${imageAction.imageUrls.length} property image(s)`);
            return;
        }

        // Handle property gallery
        if (imageAction.properties && imageAction.properties.length > 0) {
            if (imageAction.properties.length === 1 && imageAction.type === 'single') {
                await sendImage({
                    recipientId: senderId,
                    imageUrl: imageAction.properties[0].imageUrl,
                    pageAccessToken,
                });
            } else {
                await sendImageGallery({
                    recipientId: senderId,
                    products: imageAction.properties,
                    pageAccessToken,
                    confirmMode: imageAction.type === 'confirm',
                });
            }
            logger.success(`Sent ${imageAction.properties.length} property image(s) in ${imageAction.type} mode`);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to send images:', { message: errorMessage });
    }
}

/**
 * Reply to Facebook comment
 */
export async function replyToComment(
    shopId: string,
    shopName: string,
    pageUsername: string | null | undefined,
    commentId: string,
    commentMessage: string,
    pageAccessToken: string
): Promise<boolean> {
    const supabase = supabaseAdmin();
    const replyMessage = generateCommentReply(shopName, pageUsername || undefined);

    try {
        const proof = appsecretProof(pageAccessToken);
        const proofParam = proof ? `&appsecret_proof=${proof}` : '';
        const response = await fetch(
            `https://graph.facebook.com/v21.0/${commentId}/comments?access_token=${pageAccessToken}${proofParam}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: replyMessage,
                }),
            }
        );

        if (response.ok) {
            logger.success(`[${shopName}] Comment reply sent successfully!`);

            await supabase.from('chat_history').insert({
                shop_id: shopId,
                message: `[FB Comment] ${commentMessage}`,
                response: replyMessage,
                intent: 'COMMENT_REPLY'
            });
            return true;
        } else {
            const errorData = await response.json();
            logger.error(`[${shopName}] Failed to reply to comment`, errorData);
            return false;
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[${shopName}] Error replying to comment`, { error: errorMessage });
        return false;
    }
}
