import { supabaseAdmin } from '@/lib/supabase';
import type { AIProduct, AIFAQ, AIQuickReply, AISlogan, NotifySettings } from '@/types/ai';

export interface ShopWithProducts {
    id: string;
    name: string;
    description?: string | null;
    ai_instructions?: string | null;
    ai_emotion?: 'friendly' | 'professional' | 'enthusiastic' | 'calm' | 'playful' | null;
    facebook_page_id: string;
    facebook_page_username?: string | null;
    facebook_page_access_token?: string | null;
    instagram_business_account_id?: string | null;
    instagram_access_token?: string | null;
    instagram_username?: string | null;
    products: AIProduct[];
    notify_on_order?: boolean | null;
    notify_on_contact?: boolean | null;
    notify_on_support?: boolean | null;
    notify_on_cancel?: boolean | null;
    is_ai_active?: boolean | null;
    subscription_plan?: string | null;
    subscription_status?: string | null;
    trial_ends_at?: string | null;
    custom_knowledge?: Record<string, unknown> | null;
}

export interface AIFeatures {
    faqs: AIFAQ[];
    quickReplies: AIQuickReply[];
    slogans: AISlogan[];
}

export async function getShopByPageId(pageId: string): Promise<ShopWithProducts | null> {
    const supabase = supabaseAdmin();

    const { data } = await supabase
        .from('shops')
        .select('*, products(*)')
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
        products: data.products || [],
        notify_on_order: data.notify_on_order,
        notify_on_contact: data.notify_on_contact,
        notify_on_support: data.notify_on_support,
        notify_on_cancel: data.notify_on_cancel,
        is_ai_active: data.is_ai_active,
        subscription_plan: data.subscription_plan,
        subscription_status: data.subscription_status,
        trial_ends_at: data.trial_ends_at,
        custom_knowledge: data.custom_knowledge,
        instagram_business_account_id: data.instagram_business_account_id,
        instagram_access_token: data.instagram_access_token,
        instagram_username: data.instagram_username,
    };
}

export async function getShopByInstagramId(instagramId: string): Promise<ShopWithProducts | null> {
    const supabase = supabaseAdmin();

    const { data } = await supabase
        .from('shops')
        .select('*, products(*)')
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
        products: data.products || [],
        notify_on_order: data.notify_on_order,
        notify_on_contact: data.notify_on_contact,
        notify_on_support: data.notify_on_support,
        notify_on_cancel: data.notify_on_cancel,
        is_ai_active: data.is_ai_active,
        subscription_plan: data.subscription_plan,
        subscription_status: data.subscription_status,
        trial_ends_at: data.trial_ends_at,
        custom_knowledge: data.custom_knowledge,
    };
}

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

export function buildNotifySettings(shop: ShopWithProducts): NotifySettings {
    return {
        order: shop.notify_on_order ?? true,
        contact: shop.notify_on_contact ?? true,
        support: shop.notify_on_support ?? true,
        cancel: shop.notify_on_cancel ?? true,
    };
}
