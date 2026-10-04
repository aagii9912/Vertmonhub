import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Байгууллагын мэдлэг — `shops.custom_knowledge` (admin import-ын company/project/
 * payment_policy/... ангилал) ба идэвхтэй `shop_faqs`. Туслахын prompt-ын
 * «КОМПАНИЙН МЭДЛЭГ» блокт ордог.
 */
export function buildDynamicKnowledge(customKnowledge?: Record<string, unknown> | string | null): string {
    if (!customKnowledge) return '';

    const normalized: Record<string, unknown> = typeof customKnowledge === 'string'
        ? { knowledge_legacy: customKnowledge }
        : customKnowledge;

    if (Object.keys(normalized).length === 0) return '';

    const knowledgeList = Object.entries(normalized)
        .map(([key, value]) => `### ${key}\n${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
        .join('\n\n');

    return `\nТУСГАЙ МЭДЭЭЛЭЛ:\n${knowledgeList}\n`;
}

export function buildFAQs(faqs?: Array<{ question: string; answer: string }>): string {
    if (!faqs || faqs.length === 0) return '';

    const list = faqs
        .map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`)
        .join('\n');

    return `\nТҮГЭЭМЭЛ АСУУЛТ-ХАРИУЛТ:\n${list}\n`;
}

export async function loadShopKnowledge(db: SupabaseClient, shopId: string): Promise<string> {
    const [shopRes, faqRes] = await Promise.all([
        db.from('shops').select('custom_knowledge').eq('id', shopId).single(),
        db.from('shop_faqs').select('question, answer').eq('shop_id', shopId).eq('is_active', true),
    ]);
    const ck = (shopRes.data?.custom_knowledge as Record<string, unknown> | string | null) || null;
    const faqs = (faqRes.data || []) as { question: string; answer: string }[];
    return [buildDynamicKnowledge(ck), buildFAQs(faqs)].filter(Boolean).join('\n');
}
