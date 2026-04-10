import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export interface CustomerData {
    id: string;
    name?: string | null;
    phone?: string | null;
    total_orders?: number;
    ai_paused_until?: string | null;
    message_count?: number;
    message_count_reset_at?: string | null;
    instagram_id?: string | null;
    platform?: 'messenger' | 'instagram';
}

function getNextMonthFirstDay(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

async function fetchFacebookUserName(userId: string, accessToken: string): Promise<string | null> {
    try {
        const response = await fetch(
            `https://graph.facebook.com/${userId}?fields=first_name,last_name,name&access_token=${accessToken}`
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

async function fetchInstagramUserName(userId: string, accessToken: string): Promise<string | null> {
    try {
        const response = await fetch(
            `https://graph.facebook.com/v21.0/${userId}?fields=username,name&access_token=${accessToken}`
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

export async function getOrCreateCustomer(
    shopId: string,
    facebookId: string,
    pageAccessToken: string
): Promise<CustomerData> {
    const supabase = supabaseAdmin();

    const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id, name, phone, total_orders, ai_paused_until, message_count, message_count_reset_at')
        .eq('facebook_id', facebookId)
        .eq('shop_id', shopId)
        .single();

    if (existingCustomer) {
        return {
            id: existingCustomer.id,
            name: existingCustomer.name,
            phone: existingCustomer.phone,
            total_orders: existingCustomer.total_orders || 0,
            ai_paused_until: existingCustomer.ai_paused_until,
            message_count: existingCustomer.message_count || 0,
            message_count_reset_at: existingCustomer.message_count_reset_at,
        };
    }

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
        total_orders: 0,
        message_count: 0,
        message_count_reset_at: null,
        platform: 'messenger',
    };
}

export async function getOrCreateInstagramCustomer(
    shopId: string,
    instagramId: string,
    accessToken: string
): Promise<CustomerData> {
    const supabase = supabaseAdmin();

    const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id, name, phone, total_orders, ai_paused_until, message_count, message_count_reset_at, instagram_id')
        .eq('instagram_id', instagramId)
        .eq('shop_id', shopId)
        .single();

    if (existingCustomer) {
        return {
            id: existingCustomer.id,
            name: existingCustomer.name,
            phone: existingCustomer.phone,
            total_orders: existingCustomer.total_orders || 0,
            ai_paused_until: existingCustomer.ai_paused_until,
            message_count: existingCustomer.message_count || 0,
            message_count_reset_at: existingCustomer.message_count_reset_at,
            instagram_id: existingCustomer.instagram_id,
            platform: 'instagram',
        };
    }

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
        total_orders: 0,
        message_count: 0,
        message_count_reset_at: null,
        instagram_id: instagramId,
        platform: 'instagram',
    };
}

export async function updateCustomerInfo(
    customer: CustomerData,
    facebookId: string,
    pageAccessToken: string,
    message: string
): Promise<CustomerData> {
    const supabase = supabaseAdmin();
    const updatedCustomer = { ...customer };

    if (!customer.phone) {
        const phoneMatch = message.match(/\b([89765]\d{7})\b/);
        if (phoneMatch) {
            await supabase
                .from('customers')
                .update({ phone: phoneMatch[1] })
                .eq('id', customer.id);
            updatedCustomer.phone = phoneMatch[1];
            logger.info('Phone extracted from message', { phone: phoneMatch[1] });
        }
    }

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

export async function incrementMessageCount(customerId: string): Promise<number> {
    const supabase = supabaseAdmin();

    try {
        const { data, error } = await supabase
            .rpc('increment_customer_message_count', { p_customer_id: customerId });

        if (error) {
            logger.warn('RPC increment failed, using manual update:', { error: error.message });

            const { data: customer } = await supabase
                .from('customers')
                .select('message_count, message_count_reset_at')
                .eq('id', customerId)
                .single();

            let newCount = (customer?.message_count || 0) + 1;
            const resetAt = customer?.message_count_reset_at;

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
    } catch (error: unknown) {
        logger.error('Failed to increment message count:', { error, customerId });
        return 0;
    }
}
