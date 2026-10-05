import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Inbox (FB/IG DM) — `/api/dashboard/conversations` жагсаалт ба навигацийн «inbox» тоо
 * НЭГ query, НЭГ дүрмээр тооцогдоно: тоо нь Inbox-д харагдах яриануудаас л гарна.
 */

/** Inbox жагсаалт сүүлийн ийм тооны мессежээс бүрдэнэ. */
export const INBOX_MESSAGE_LIMIT = 200;

/**
 * Shop-ийн сүүлийн мессежүүд (шинэ нь эхэндээ), харилцагчийн нэртэй. Жагсаалтаас хассан
 * (deleted_at) харилцагчийн яриаг хязгаараас ӨМНӨ хасна — эс бөгөөс устгасан нэг харилцагч
 * бүх мөрийг эзэлж Inbox хоосорно. (Дахин мессеж бичвэл webhook харилцагчийг сэргээнэ.)
 */
export function recentInboxMessages(db: SupabaseClient, shopId: string) {
    return db
        .from('chat_history')
        .select('id, customer_id, message, response, created_at, customers!inner(name, deleted_at)')
        .eq('shop_id', shopId)
        .is('customers.deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(INBOX_MESSAGE_LIMIT);
}

export interface InboxMessageLike {
    customer_id: string;
    message: string | null;
    response: string | null;
}

/**
 * Ажилтны хариу хүлээж буй яриа = харилцагчийн хамгийн сүүлийн мессеж нь харилцагчийнх.
 * Уншсан эсэхийг хадгалдаггүй тул «уншаагүй»-г ингэж тодорхойлно. chat_history-ийн мөр нь
 * харилцагчийн мессеж (`message`, `response` хоосон) эсвэл хариу (`response`: Inbox-оос
 * ажилтан, сануулга, хуучин ботын хариу) байна.
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
