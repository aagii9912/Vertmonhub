import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Inbox (FB/IG DM) — `/api/dashboard/conversations` жагсаалт, навигацийн «inbox» тоо ба AI
 * `list_conversations` НЭГ query, НЭГ дүрмээр тооцогдоно: тоо нь Inbox-д харагдах яриануудаас л гарна.
 * `chat_history`-ийн мөр бүр харилцагчийн мессеж (`message`) ба/эсвэл хариу (`response`; ажилтны
 * хариу `intent = 'human_reply'`, сануулга, хуучин ботын хариу) байна.
 */

/** Inbox жагсаалт сүүлийн ийм тооны мессежээс бүрдэнэ. */
export const INBOX_MESSAGE_LIMIT = 200;

/**
 * Shop-ийн сүүлийн мессежүүд (шинэ нь эхэндээ), харилцагчийн нэртэй. Жагсаалтаас хассан
 * (deleted_at) харилцагчийн яриаг хязгаараас ӨМНӨ хасна — эс бөгөөс устгасан нэг харилцагч
 * бүх мөрийг эзэлж Inbox хоосорно. (Дахин мессеж бичвэл webhook харилцагчийг сэргээнэ.)
 */
export function recentInboxMessages(db: SupabaseClient, shopId: string, limit = INBOX_MESSAGE_LIMIT) {
    return db
        .from('chat_history')
        .select('id, customer_id, message, response, created_at, customers!inner(name, deleted_at)')
        .eq('shop_id', shopId)
        .is('customers.deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
}

export interface InboxMessageLike {
    customer_id: string;
    message: string | null;
    response: string | null;
}

/**
 * Ажилтны хариу хүлээж буй яриа = харилцагчийн хамгийн сүүлийн мессеж нь харилцагчийнх.
 * Уншсан эсэхийг хадгалдаггүй тул «уншаагүй»-г ингэж тодорхойлно.
 *
 * `rows` шинэ нь эхэндээ эрэмбэлэгдсэн байх ёстой. Буцаах утга: customer_id → сүүлийн
 * хариунаас хойш ирсэн харилцагчийн мессежийн тоо (зөвхөн хариу хүлээж буй яриа).
 */
export function awaitingReplyByCustomer(rows: readonly InboxMessageLike[]): Map<string, number> {
    const awaiting = new Map<string, number>();
    const answered = new Set<string>();
    for (const row of rows) {
        if (answered.has(row.customer_id)) continue;
        if (row.response?.trim()) answered.add(row.customer_id);
        else if (row.message?.trim()) awaiting.set(row.customer_id, (awaiting.get(row.customer_id) ?? 0) + 1);
    }
    return awaiting;
}

export interface InboxMessage { id: string; role: 'user' | 'assistant'; content: string; created_at: string }
export interface InboxConversation {
    id: string;
    customer_name: string;
    customer_avatar: null;
    last_message: string;
    last_message_at: string;
    /** Сүүлийн хариунаас хойш ирсэн харилцагчийн мессеж (nav-counts-ийн «inbox»-той нэг дүрэм). */
    unread_count: number;
    /** Ажилтны хариу хүлээж буй яриа (`unread_count > 0`). */
    awaiting_reply: boolean;
    messages: InboxMessage[];
}

type ChatRow = InboxMessageLike & {
    id: string; created_at: string;
    customers?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

/** Шинээс хуучин руу эрэмбэлсэн мөрүүдийг харилцагчаар бүлэглэнэ (эхний мөр = сүүлийн). */
export function groupChatRows(rows: readonly ChatRow[]): InboxConversation[] {
    const awaiting = awaitingReplyByCustomer(rows);
    const byCustomer = new Map<string, InboxConversation>();
    for (const chat of rows) {
        let conversation = byCustomer.get(chat.customer_id);
        if (!conversation) {
            const customer = Array.isArray(chat.customers) ? chat.customers[0] : chat.customers;
            const unread = awaiting.get(chat.customer_id) ?? 0;
            conversation = {
                id: chat.customer_id,
                customer_name: customer?.name || 'Зочин',
                customer_avatar: null,
                last_message: chat.message || chat.response || '',
                last_message_at: chat.created_at,
                unread_count: unread,
                awaiting_reply: unread > 0,
                messages: [],
            };
            byCustomer.set(chat.customer_id, conversation);
        }
        if (chat.message) conversation.messages.push({ id: `${chat.id}-user`, role: 'user', content: chat.message, created_at: chat.created_at });
        if (chat.response) conversation.messages.push({ id: `${chat.id}-assistant`, role: 'assistant', content: chat.response, created_at: chat.created_at });
    }
    return [...byCustomer.values()];
}

/** Сүүлийн `limit` мессежийг харилцагчаар бүлэглэнэ (API ба AI `list_conversations`). */
export async function loadInboxConversations(db: SupabaseClient, shopId: string, limit = INBOX_MESSAGE_LIMIT): Promise<InboxConversation[]> {
    const { data, error } = await recentInboxMessages(db, shopId, limit);
    if (error) throw error;
    return groupChatRows((data ?? []) as ChatRow[]);
}

/** Нэг харилцагчийн сүүлийн `limit` мөрийг цагийн дарааллаар (хуучнаас шинэ рүү). */
export async function loadCustomerChat(db: SupabaseClient, shopId: string, customerId: string, limit = 30) {
    const { data, error } = await db
        .from('chat_history')
        .select('id, message, response, intent, created_at')
        .eq('shop_id', shopId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return [...(data ?? [])].reverse().flatMap((row: { id: string; message: string | null; response: string | null; intent: string | null; created_at: string }) => [
        ...(row.message ? [{ from: 'customer' as const, text: row.message, at: row.created_at }] : []),
        ...(row.response ? [{ from: row.intent === 'human_reply' ? 'staff' as const : 'bot' as const, text: row.response, at: row.created_at }] : []),
    ]);
}
