/**
 * CommentAutomationService
 * Manages comment-to-DM automations for shops
 * Matches incoming comments against stored automation rules and executes actions
 */

import { supabaseAdmin } from '@/lib/supabase';
import { sendTextMessage } from '@/lib/facebook/messenger';
import { logger } from '@/lib/utils/logger';

export interface CommentAutomation {
    id: string;
    shop_id: string;
    name: string;
    is_active: boolean;
    post_id: string | null;
    post_url: string | null;
    trigger_keywords: string[];
    match_type: 'contains' | 'exact';
    action_type: 'send_dm' | 'reply_comment' | 'both';
    dm_message: string;
    reply_message: string | null;
    platform: 'facebook' | 'instagram' | 'both';
    trigger_count: number;
    last_triggered_at: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Get all active automations for a shop
 */
export async function getActiveAutomations(shopId: string): Promise<CommentAutomation[]> {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
        .from('comment_automations')
        .select('id, shop_id, name, is_active, post_id, post_url, trigger_keywords, match_type, reply_template, is_private_reply, private_reply_template, action_type, dm_message, reply_message, platform, trigger_count, last_triggered_at, updated_at, created_at')
        .eq('shop_id', shopId)
        .eq('is_active', true);

    if (error) {
        logger.error('Failed to fetch comment automations', { error: error.message });
        return [];
    }

    return (data || []) as CommentAutomation[];
}

/**
 * Find a matching automation for an incoming comment
 * Checks keywords, post_id, and platform filters
 */
export async function getMatchingAutomation(
    shopId: string,
    postId: string | null,
    commentText: string,
    platform: 'facebook' | 'instagram'
): Promise<CommentAutomation | null> {
    const automations = await getActiveAutomations(shopId);

    if (automations.length === 0) return null;

    const normalizedComment = commentText.toLowerCase().trim();

    for (const automation of automations) {
        // Check platform filter
        if (automation.platform !== 'both' && automation.platform !== platform) {
            continue;
        }

        // Check post_id filter (null = all posts)
        if (automation.post_id && postId && automation.post_id !== postId) {
            continue;
        }

        // Check keyword match
        const matched = matchKeywords(
            normalizedComment,
            automation.trigger_keywords,
            automation.match_type
        );

        if (matched) {
            return automation;
        }
    }

    return null;
}

/**
 * Match comment text against trigger keywords
 */
function matchKeywords(
    comment: string,
    keywords: string[],
    matchType: 'contains' | 'exact'
): boolean {
    for (const keyword of keywords) {
        const normalizedKeyword = keyword.toLowerCase().trim();
        if (!normalizedKeyword) continue;

        if (matchType === 'exact') {
            // Exact match: entire comment must equal the keyword
            if (comment === normalizedKeyword) return true;
        } else {
            // Contains: keyword appears anywhere in comment
            if (comment.includes(normalizedKeyword)) return true;
        }
    }
    return false;
}

/**
 * Execute an automation: send DM and/or reply to comment
 */
export async function executeAutomation(
    automation: CommentAutomation,
    senderId: string,
    commentId: string,
    pageAccessToken: string,
    platform: 'facebook' | 'instagram'
): Promise<{ dmSent: boolean; replySent: boolean }> {
    const result = { dmSent: false, replySent: false };
    const supabase = supabaseAdmin();

    // 1. Send DM if action includes it
    if (automation.action_type === 'send_dm' || automation.action_type === 'both') {
        try {
            await sendTextMessage({
                recipientId: senderId,
                message: automation.dm_message,
                pageAccessToken,
            });
            result.dmSent = true;
            logger.success(`[Comment Automation] DM sent to ${senderId} via ${platform}`, {
                automationName: automation.name,
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`[Comment Automation] Failed to send DM`, { error: msg, senderId });
        }
    }

    // 2. Reply to comment if action includes it
    if (
        (automation.action_type === 'reply_comment' || automation.action_type === 'both') &&
        automation.reply_message
    ) {
        try {
            const apiVersion = 'v21.0';
            const response = await fetch(
                `https://graph.facebook.com/${apiVersion}/${commentId}/comments`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: automation.reply_message,
                        access_token: pageAccessToken,
                    }),
                }
            );

            if (response.ok) {
                result.replySent = true;
                logger.success(`[Comment Automation] Comment reply sent on ${platform}`, {
                    automationName: automation.name,
                    commentId,
                });
            } else {
                const errorData = await response.json();
                logger.error(`[Comment Automation] Comment reply failed`, { error: errorData });
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`[Comment Automation] Comment reply error`, { error: msg });
        }
    }

    // 3. Increment trigger count
    await supabase
        .from('comment_automations')
        .update({
            trigger_count: automation.trigger_count + 1,
            last_triggered_at: new Date().toISOString(),
        })
        .eq('id', automation.id);

    // 4. Save to chat history
    await supabase.from('chat_history').insert({
        shop_id: automation.shop_id,
        message: `[Comment Automation: ${automation.name}] Trigger by comment`,
        response: automation.dm_message,
        intent: 'COMMENT_AUTOMATION',
    });

    return result;
}

/**
 * Get all automations for a shop (including inactive, for dashboard)
 */
export async function getAllAutomations(shopId: string): Promise<CommentAutomation[]> {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
        .from('comment_automations')
        .select('id, shop_id, name, is_active, post_id, post_url, trigger_keywords, match_type, reply_template, is_private_reply, private_reply_template, action_type, dm_message, reply_message, platform, trigger_count, last_triggered_at, updated_at, created_at')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });

    if (error) {
        logger.error('Failed to fetch all comment automations', { error: error.message });
        return [];
    }

    return (data || []) as CommentAutomation[];
}

/**
 * Create a new automation
 */
export async function createAutomation(
    shopId: string,
    data: {
        name: string;
        trigger_keywords: string[];
        dm_message: string;
        match_type?: 'contains' | 'exact';
        action_type?: 'send_dm' | 'reply_comment' | 'both';
        reply_message?: string;
        platform?: 'facebook' | 'instagram' | 'both';
        post_id?: string;
        post_url?: string;
    }
): Promise<CommentAutomation | null> {
    const supabase = supabaseAdmin();

    const { data: result, error } = await supabase
        .from('comment_automations')
        .insert({
            shop_id: shopId,
            name: data.name,
            trigger_keywords: data.trigger_keywords,
            dm_message: data.dm_message,
            match_type: data.match_type || 'contains',
            action_type: data.action_type || 'send_dm',
            reply_message: data.reply_message || null,
            platform: data.platform || 'both',
            post_id: data.post_id || null,
            post_url: data.post_url || null,
        })
        .select()
        .single();

    if (error) {
        logger.error('Failed to create comment automation', { error: error.message });
        return null;
    }

    return result as CommentAutomation;
}

/**
 * Update an automation
 */
export async function updateAutomation(
    automationId: string,
    shopId: string,
    updates: Partial<Omit<CommentAutomation, 'id' | 'shop_id' | 'created_at'>>
): Promise<CommentAutomation | null> {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
        .from('comment_automations')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', automationId)
        .eq('shop_id', shopId)
        .select()
        .single();

    if (error) {
        logger.error('Failed to update comment automation', { error: error.message });
        return null;
    }

    return data as CommentAutomation;
}

/**
 * Delete an automation
 */
export async function deleteAutomation(
    automationId: string,
    shopId: string
): Promise<boolean> {
    const supabase = supabaseAdmin();

    const { error } = await supabase
        .from('comment_automations')
        .delete()
        .eq('id', automationId)
        .eq('shop_id', shopId);

    if (error) {
        logger.error('Failed to delete comment automation', { error: error.message });
        return false;
    }

    return true;
}
