/**
 * Харилцагчийн үйлдлүүд — таг, AI түр зогсоох, DM хариу, нэгтгэх.
 * API route ба AI tool хоёулаа энд дамжина.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';
import { sendTextMessage } from '@/lib/facebook/messenger';
import { decryptToken } from '@/lib/crypto/tokens';
import { recomputeCustomerScore } from '@/lib/services/CustomerScoringService';

export async function addCustomerTag(db: SupabaseClient, shopId: string, customerId: string, tag: string) {
    const { data: customer } = await db.from('customers').select('tags').eq('id', customerId).eq('shop_id', shopId).single();
    if (!customer) return { error: 'Харилцагч олдсонгүй', status: 404 as const };
    const current: string[] = customer.tags || [];
    if (current.includes(tag)) return { tags: current, existed: true };
    const { data, error } = await db.from('customers').update({ tags: [...current, tag] }).eq('id', customerId).select('tags').single();
    if (error) return { error: error.message, status: 500 as const };
    return { tags: data.tags as string[], existed: false };
}

export async function removeCustomerTag(db: SupabaseClient, shopId: string, customerId: string, tag: string) {
    const { data: customer } = await db.from('customers').select('tags').eq('id', customerId).eq('shop_id', shopId).single();
    if (!customer) return { error: 'Харилцагч олдсонгүй', status: 404 as const };
    const current: string[] = customer.tags || [];
    const { data, error } = await db.from('customers').update({ tags: current.filter((t) => t !== tag) }).eq('id', customerId).select('tags').single();
    if (error) return { error: error.message, status: 500 as const };
    return { tags: data.tags as string[] };
}

/** AI-г түр зогсоох (minutes) эсвэл сэргээх (null). */
export async function setCustomerAiPause(db: SupabaseClient, shopId: string, customerId: string, minutes: number | null) {
    const until = minutes === null ? null : new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const { error } = await db.from('customers').update({ ai_paused_until: until }).eq('id', customerId).eq('shop_id', shopId);
    if (error) return { error: error.message };
    return { ai_paused_until: until };
}

/** Messenger-ээр хүнээс хариу илгээж, chat_history-д бичиж, AI-г 30 мин зогсооно (эсвэл 'off'). */
export async function replyToCustomer(db: SupabaseClient, shopId: string, customerId: string, message: string, aiPauseMode: 'pause' | 'off' = 'pause') {
    const { data: customer } = await db.from('customers').select('facebook_id, name').eq('id', customerId).eq('shop_id', shopId).single();
    if (!customer?.facebook_id) return { error: 'Харилцагч олдсонгүй эсвэл Facebook ID алга', status: 404 as const };
    const { data: shop } = await db.from('shops').select('facebook_page_access_token').eq('id', shopId).single();
    if (!shop?.facebook_page_access_token) return { error: 'Facebook page холбогдоогүй', status: 400 as const };
    const token = decryptToken(shop.facebook_page_access_token);
    if (!token) return { error: 'Facebook token decrypt хийж чадсангүй', status: 400 as const };
    await sendTextMessage({ recipientId: customer.facebook_id, message, pageAccessToken: token });
    await db.from('chat_history').insert({ shop_id: shopId, customer_id: customerId, message: '', response: message, intent: 'human_reply' });
    await setCustomerAiPause(db, shopId, customerId, aiPauseMode === 'off' ? null : 30);
    return { sent: true, customerName: customer.name as string | null };
}

const CHILD_TABLES = ['leads', 'chat_history', 'property_viewings', 'property_contracts', 'ai_memory', 'customer_surveys', 'service_logs'];

/** Давхардсан хоёр харилцагчийг нэгтгэнэ: duplicate → primary, duplicate устна. */
export async function mergeCustomers(db: SupabaseClient, shopId: string, primaryId: string, duplicateId: string) {
    if (primaryId === duplicateId) return { error: 'Нэг харилцагчийг өөртэй нь нэгтгэх боломжгүй', status: 400 as const };
    const { data: rows } = await db.from('customers').select('*').eq('shop_id', shopId).in('id', [primaryId, duplicateId]);
    const primary = rows?.find((r) => r.id === primaryId);
    const duplicate = rows?.find((r) => r.id === duplicateId);
    if (!primary || !duplicate) return { error: 'Харилцагч олдсонгүй', status: 404 as const };

    const repointWarnings: string[] = [];
    for (const table of CHILD_TABLES) {
        const { error } = await db.from(table).update({ customer_id: primaryId }).eq('customer_id', duplicateId);
        if (error) repointWarnings.push(`${table}: ${error.message}`);
    }
    const mergedTags = Array.from(new Set([...(Array.isArray(primary.tags) ? primary.tags : []), ...(Array.isArray(duplicate.tags) ? duplicate.tags : [])]));
    const mergedAiMemory = { ...(duplicate.ai_memory && typeof duplicate.ai_memory === 'object' ? duplicate.ai_memory : {}), ...(primary.ai_memory && typeof primary.ai_memory === 'object' ? primary.ai_memory : {}) };
    const mergedNotes = [primary.notes, duplicate.notes].filter(Boolean).join('\n').trim() || null;
    const updatePayload: Record<string, unknown> = {
        name: primary.name || duplicate.name, phone: primary.phone || duplicate.phone, phone_normalized: primary.phone_normalized || duplicate.phone_normalized,
        email: primary.email || duplicate.email, address: primary.address || duplicate.address,
        facebook_id: primary.facebook_id || duplicate.facebook_id, instagram_id: primary.instagram_id || duplicate.instagram_id,
        notes: mergedNotes, tags: mergedTags, ai_memory: mergedAiMemory, message_count: (primary.message_count || 0) + (duplicate.message_count || 0),
    };
    await db.from('customers').update({ facebook_id: null, instagram_id: null }).eq('id', duplicateId);
    const { data: merged, error: updateError } = await db.from('customers').update(updatePayload).eq('id', primaryId).select().single();
    if (updateError) { logger.error('[CustomerOps] merge update primary failed', { error: updateError }); return { error: 'Нэгтгэх үед алдаа гарлаа', status: 500 as const }; }
    const { error: deleteError } = await db.from('customers').delete().eq('id', duplicateId);
    if (deleteError) logger.warn('[CustomerOps] delete duplicate failed', { error: deleteError });
    try { await recomputeCustomerScore(primaryId); } catch { /* best-effort */ }
    return { merged, repointWarnings };
}
