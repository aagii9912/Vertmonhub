import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Inbox-ийн чат (`chat_history`): мөр бүр харилцагчийн мессеж (`message`) ба/эсвэл хариу
 * (`response`; ажилтны хариу `intent = 'human_reply'`, хуучин бот бусад). API ба AI хоёулаа уншина.
 */
export interface InboxMessage { id: string; role: 'user' | 'assistant'; content: string; created_at: string }
export interface InboxConversation {
    id: string;
    customer_name: string;
    customer_avatar: null;
    last_message: string;
    last_message_at: string;
    unread_count: number;
    /** Сүүлийн мөр нь хариугүй харилцагчийн мессеж. */
    awaiting_reply: boolean;
    messages: InboxMessage[];
}

type ChatRow = {
    id: string; customer_id: string; message: string | null; response: string | null; created_at: string;
    customers?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

/** Шинээс хуучин руу эрэмбэлсэн мөрүүдийг харилцагчаар бүлэглэнэ (эхний мөр = сүүлийн). */
export function groupChatRows(rows: ChatRow[]): InboxConversation[] {
    const byCustomer = new Map<string, InboxConversation>();
    for (const chat of rows) {
        let conversation = byCustomer.get(chat.customer_id);
        if (!conversation) {
            const customer = Array.isArray(chat.customers) ? chat.customers[0] : chat.customers;
            conversation = {
                id: chat.customer_id,
                customer_name: customer?.name || 'Зочин',
                customer_avatar: null,
                last_message: chat.message || chat.response || '',
                last_message_at: chat.created_at,
                unread_count: 0,
                awaiting_reply: !!chat.message && !chat.response,
                messages: [],
            };
            byCustomer.set(chat.customer_id, conversation);
        }
        if (chat.message) conversation.messages.push({ id: `${chat.id}-user`, role: 'user', content: chat.message, created_at: chat.created_at });
        if (chat.response) conversation.messages.push({ id: `${chat.id}-assistant`, role: 'assistant', content: chat.response, created_at: chat.created_at });
    }
    return [...byCustomer.values()];
}

/**
 * Сүүлийн `limit` мессежийг харилцагчаар бүлэглэнэ. Жагсаалтаас хассан (deleted_at) харилцагчийн
 * яриаг хязгаараас ӨМНӨ хасна — эс бөгөөс устгасан нэг харилцагч бүх мөрийг эзэлж Inbox хоосорно.
 */
export async function loadInboxConversations(db: SupabaseClient, shopId: string, limit = 200): Promise<InboxConversation[]> {
    const { data, error } = await db
        .from('chat_history')
        .select('id, customer_id, message, response, created_at, customers!inner(name, deleted_at)')
        .eq('shop_id', shopId)
        .is('customers.deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
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
