/**
 * Ярианы санах ой — урт ярианы өмнөх хэсгийг хураангуйлж `ai_conversations.summary`-д
 * хадгална (migration 20260912120000). Шинэ хүсэлт бүрт: хураангуй + сүүлийн 20 мессеж.
 * Бүх DB үйлдэл best-effort: багана байхгүй бол чимээгүй алгасна.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { claude, FAST_MODEL } from '@/lib/ai/claude/client';
import type { HistoryMessage } from './types';

/** Энэ тооноос дээш мессежтэй яриаг хураангуйлна. */
export const SUMMARY_TRIGGER = 24;
/** Хураангуйд орохгүй, шууд контекстод үлдэх сүүлийн мессежийн тоо. */
export const KEEP_RECENT = 12;

export interface ConversationSummaryRow {
    summary: string | null;
    summary_message_count: number | null;
}

export async function loadConversationSummary(db: SupabaseClient, conversationId: string): Promise<ConversationSummaryRow | null> {
    try {
        const { data, error } = await db.from('ai_conversations').select('summary, summary_message_count').eq('id', conversationId).single();
        if (error || !data) return null;
        return data as ConversationSummaryRow;
    } catch { return null; }
}

/** Хураангуйлах шаардлагатай эсэх (цэвэр функц — тест). */
export function needsSummary(totalMessages: number, summarizedCount: number | null): boolean {
    if (totalMessages < SUMMARY_TRIGGER) return false;
    return totalMessages - (summarizedCount || 0) > KEEP_RECENT;
}

/** Өмнөх хураангуй + шинэ мессежүүдээс шинэ хураангуй бичнэ. */
export async function summarizeMessages(previous: string | null, msgs: HistoryMessage[]): Promise<string> {
    const transcript = msgs.map((m) => `${m.role === 'assistant' ? 'AI' : 'Хэрэглэгч'}: ${m.content}`).join('\n');
    const res = await claude().messages.create({
        model: FAST_MODEL,
        max_tokens: 1200,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        system: 'Та ярианы хураангуй бичигч. Дараах ажлын ярианы ЧУХАЛ баримтуудыг (хэрэглэгчийн зорилго, дурдсан лид/гэрээ/байрны нэр ба id, шийдсэн зүйл, хүлээгдэж буй үйлдэл, хэрэглэгчийн давуу сонголт) монголоор, 10–15 мөрт багтаан бичнэ. Хэрэглэгчийн хэлсэн бүх тоо/нэр/id-г хадгал. Шинэ мэдээлэл зохиохгүй.',
        messages: [{ role: 'user', content: `${previous ? `ӨМНӨХ ХУРААНГУЙ:\n${previous}\n\n` : ''}ШИНЭ ХЭСЭГ:\n${transcript}\n\nШинэчилсэн хураангуй:` }],
    });
    return res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim();
}

/**
 * Ярианы бүх мессежийг DB-ээс уншиж, шаардлагатай бол хураангуйг шинэчилнэ.
 * Дуудагч await хийж болно (~1–2с), алдаа шидэхгүй.
 */
export async function maybeUpdateSummary(db: SupabaseClient, conversationId: string): Promise<void> {
    try {
        const row = await loadConversationSummary(db, conversationId);
        if (!row) return; // багана байхгүй (migration хийгдээгүй) → алгасна
        const { data: all } = await db.from('ai_messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: true });
        const msgs = (all || []) as HistoryMessage[];
        if (!needsSummary(msgs.length, row.summary_message_count)) return;
        const upto = msgs.length - KEEP_RECENT;
        const fresh = msgs.slice(row.summary_message_count || 0, upto);
        if (fresh.length === 0) return;
        const summary = await summarizeMessages(row.summary, fresh);
        if (!summary) return;
        await db.from('ai_conversations').update({ summary, summary_message_count: upto }).eq('id', conversationId);
    } catch (e) {
        console.warn('[AI memory] summary update skipped:', e instanceof Error ? e.message : e);
    }
}
