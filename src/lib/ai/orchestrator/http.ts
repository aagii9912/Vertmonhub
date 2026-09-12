import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveApiUser } from '@/lib/auth/resolve-user';
import { fetchRolePermissions } from '@/lib/rbac';
import { buildDynamicKnowledge, buildFAQs } from '@/lib/ai/services/PromptService';
import { resolveSalesManagerName } from '@/lib/ai/data-assistant/functions';
import { hasClaudeKey } from '@/lib/ai/claude/client';
import { executeDataTool } from '@/lib/ai/data-assistant';
import { loadConversationSummary, maybeUpdateSummary } from './memory';
import type { OrchestratorContext, OrchestratorResult } from './types';

/**
 * /api/ai-assistant ба /api/ai-assistant/stream хоёрын ХУВААЛЦСАН хэсэг:
 * хэрэглэгч/эрх/shop шалгалт, shop мэдлэг, харагдаж буй бичлэгийн контекст,
 * яриа хадгалалт. Хоёр route ижил дүрмээр ажиллах ёстой тул нэг газар.
 */

/** UI-аас ирэх «одоо харж буй бичлэг» — AI-д tool дуудахад хэрэгтэй id-г өгнө. */
export interface AssistantUiContext {
    type: 'lead' | 'contract' | 'viewing' | 'property' | 'today' | 'dashboard';
    id?: string;
    label?: string;
}

export interface PreparedAssistantRequest {
    ctx: OrchestratorContext;
    /** Хэрэглэгчийн БИЧСЭН мессеж (хадгалагдана) */
    message: string;
    /** Orchestrator-т өгөх мессеж (контекстийн тэмдэглэлтэй) */
    modelMessage: string;
    conversationId: string | null;
    effectiveShopId: string;
    userId: string;
    adminDb: SupabaseClient;
}

async function loadShopKnowledge(db: SupabaseClient, shopId: string): Promise<string> {
    const [shopRes, faqRes] = await Promise.all([
        db.from('shops').select('custom_knowledge').eq('id', shopId).single(),
        db.from('shop_faqs').select('question, answer').eq('shop_id', shopId).eq('is_active', true),
    ]);
    const ck = (shopRes.data?.custom_knowledge as Record<string, unknown> | string | null) || null;
    const faqs = (faqRes.data || []) as { question: string; answer: string }[];
    return [buildDynamicKnowledge(ck), buildFAQs(faqs)].filter(Boolean).join('\n');
}

/** Контекстийн тэмдэглэл — model зөв tool-ыг зөв id-тай дуудна. */
export function buildContextNote(c?: AssistantUiContext | null): string {
    if (!c) return '';
    switch (c.type) {
        case 'lead':
            return `[КОНТЕКСТ] Хэрэглэгч одоо лид «${c.label || ''}» (lead_id: ${c.id}) дээр байна. Асуулт энэ лидтэй холбоотой бол get_lead_details(lead_id="${c.id}")-ээр бүх мэдээлэл, түүхийг уншаад хариул; статус/тэмдэглэл/уулзалтын үйлдэлд мөн энэ lead_id-г ашигла.`;
        case 'contract':
            return `[КОНТЕКСТ] Хэрэглэгч одоо гэрээ «${c.label || ''}» (contract_id: ${c.id}) дээр байна. Асуулт энэ гэрээтэй холбоотой бол get_contract_details(contract_id="${c.id}")-ээр уншаад хариул.`;
        case 'viewing':
            return `[КОНТЕКСТ] Хэрэглэгч одоо уулзалт «${c.label || ''}» дээр байна${c.id ? ` (lead_id: ${c.id})` : ''}.`;
        case 'property':
            return `[КОНТЕКСТ] Хэрэглэгч одоо байр «${c.label || ''}» (property_id: ${c.id}) дээр байна.`;
        case 'today':
            return `[КОНТЕКСТ] Хэрэглэгч «Өнөөдөр» дэлгэц дээр — өөрийн өнөөдрийн уулзалт, залгах лид, сануулгаа харж байна. Хариу нь ӨНӨӨДӨР хийх зүйлд төвлөрсөн, товч, эрэмбэлсэн байг.`;
        case 'dashboard':
            return `[КОНТЕКСТ] Хэрэглэгч захирлын самбар дээр — сарын борлуулалт, зорилт, менежерийн гүйцэтгэл, эх үүсвэрийн хөрвөлт, авлагыг харж байна. Тоон дүгнэлт, шалтгаан, санал зөвлөмж хэлбэрээр хариул.`;
        default:
            return '';
    }
}

/**
 * Харж буй лид/гэрээний мэдээллийг урьдчилж уншина — модель нэг раунд хэмнэж шууд хариулна.
 * Best-effort: алдаа бол хоосон (модель өөрөө tool дуудна).
 */
async function prefetchContext(c: AssistantUiContext | null, shopId: string, perms: { canWrite: boolean; canDelete: boolean; role: string }, userId: string): Promise<string> {
    if (!c || !c.id || (c.type !== 'lead' && c.type !== 'contract')) return '';
    try {
        const tool = c.type === 'lead' ? 'get_lead_details' : 'get_contract_details';
        const args = c.type === 'lead' ? { lead_id: c.id } : { contract_id: c.id };
        const r = await executeDataTool(tool, args, shopId, perms, userId, false, '');
        if (!r || r.error) return '';
        const json = JSON.stringify(r);
        return json.length > 6000 ? json.slice(0, 6000) + '…' : json;
    } catch { return ''; }
}

/**
 * Хүсэлтийг шалгаж orchestrator-ын контекстийг бэлдэнэ. Алдаа бол NextResponse.
 */
export async function prepareAssistantRequest(req: Request): Promise<{ error: NextResponse } | PreparedAssistantRequest> {
    const resolvedUser = await resolveApiUser();
    if (!resolvedUser) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

    const adminDb = supabaseAdmin();

    // Дүр — ганц эх сурвалж user_roles (`admins` хүснэгт prod-д байхгүй, fallback хасав)
    const { data: roleRow } = await adminDb.from('user_roles').select('role').eq('user_id', resolvedUser.id).maybeSingle();
    const roleName = roleRow?.role || 'viewer';
    const permissions = await fetchRolePermissions(roleName);
    if (!permissions.modules.includes('ai-assistant')) {
        return { error: NextResponse.json({ error: 'AI туслах ашиглах эрх танд алга' }, { status: 403 }) };
    }

    const body = await req.json().catch(() => ({}));
    const { message, shopId, history = [], conversationId, attachments = [], context } = body as {
        message?: string; shopId?: string; history?: Array<{ role: string; content: string }>; conversationId?: string | null;
        attachments?: unknown; context?: AssistantUiContext | null;
    };
    if (!message || typeof message !== 'string') return { error: NextResponse.json({ error: 'Message is required' }, { status: 400 }) };
    const mockDev = process.env.NODE_ENV !== 'production' && !!req.headers.get('x-ai-mock');
    if (!hasClaudeKey() && !mockDev) return { error: NextResponse.json({ error: 'AI туслах тохируулагдаагүй байна (ANTHROPIC_API_KEY алга). Админд хандана уу.' }, { status: 503 }) };

    const [{ data: ownedRows }, { data: memberRows }] = await Promise.all([
        adminDb.from('shops').select('id').eq('user_id', resolvedUser.id),
        adminDb.from('shop_members').select('shop_id').eq('user_id', resolvedUser.id),
    ]);
    const accessible = new Set<string>([...(ownedRows || []).map((r) => r.id), ...(memberRows || []).map((r) => r.shop_id)]);
    if (shopId && !accessible.has(shopId)) return { error: NextResponse.json({ error: 'Энэ shop-ийн мэдээлэлд хандах эрхгүй' }, { status: 403 }) };
    const effectiveShopId = shopId || [...accessible][0];
    if (!effectiveShopId) return { error: NextResponse.json({ error: 'Холбогдсон shop олдсонгүй' }, { status: 403 }) };

    const [shopKnowledge, userName, summaryRow] = await Promise.all([
        loadShopKnowledge(adminDb, effectiveShopId),
        resolveSalesManagerName(resolvedUser.id, resolvedUser.email),
        conversationId ? loadConversationSummary(adminDb, String(conversationId)) : Promise.resolve(null),
    ]);

    const uiCtx = context && typeof context === 'object' ? context : null;
    const perms = { canWrite: permissions.canWrite, canDelete: permissions.canDelete, role: roleName, modules: permissions.modules };
    const [note, prefetched] = await Promise.all([
        Promise.resolve(buildContextNote(uiCtx)),
        prefetchContext(uiCtx, effectiveShopId, perms, resolvedUser.id),
    ]);
    const modelMessage = note ? `${note}${prefetched ? `\n[КОНТЕКСТИЙН ӨГӨГДӨЛ — аль хэдийн уншсан, дахин tool дуудах шаардлагагүй]:\n${prefetched}` : ''}\n\n${message}` : message;

    return {
        ctx: {
            shopId: effectiveShopId,
            userId: resolvedUser.id,
            perms,
            shopKnowledge,
            history: Array.isArray(history) ? history.slice(-20) : [],
            conversationSummary: summaryRow?.summary || null,
            userName,
            attachments: Array.isArray(attachments) ? (attachments as OrchestratorContext['attachments']) : [],
        },
        message,
        modelMessage,
        conversationId: conversationId || null,
        effectiveShopId,
        userId: resolvedUser.id,
        adminDb,
    };
}

/**
 * Яриаг хадгална (best-effort, хэзээ ч шидэхгүй). Шинэ яриа үүсгэсэн бол id-г буцаана.
 */
export async function persistAssistantExchange(
    p: Pick<PreparedAssistantRequest, 'adminDb' | 'userId' | 'effectiveShopId' | 'conversationId' | 'message'>,
    response: OrchestratorResult,
): Promise<string | null> {
    let activeConversationId = p.conversationId;
    try {
        // Client-ийн өгсөн conversation_id зөвхөн ӨӨРИЙН + энэ shop-ийнх байх ёстой —
        // өмнө нь дурын яриа руу мессеж нэмэх боломжтой байв (review M18).
        if (activeConversationId) {
            const { data: owned } = await p.adminDb
                .from('ai_conversations')
                .select('id')
                .eq('id', activeConversationId)
                .eq('user_id', p.userId)
                .eq('shop_id', p.effectiveShopId)
                .maybeSingle();
            if (!owned) activeConversationId = null;
        }
        if (!activeConversationId) {
            const autoTitle = p.message.length > 40 ? p.message.substring(0, 40) + '…' : p.message;
            const base = { user_id: p.userId, shop_id: p.effectiveShopId, title: autoTitle };
            let conv = (await p.adminDb.from('ai_conversations').insert({ ...base, mode: 'orchestrator' }).select('id').single()).data;
            if (!conv) conv = (await p.adminDb.from('ai_conversations').insert({ ...base, mode: 'data' }).select('id').single()).data;
            if (conv) activeConversationId = conv.id;
        }
        if (activeConversationId) {
            const { data: inserted } = await p.adminDb.from('ai_messages').insert([
                { conversation_id: activeConversationId, role: 'user', content: p.message },
                { conversation_id: activeConversationId, role: 'assistant', content: response.text || (response.clarification ? `❓ ${response.clarification.question}` : ''), chart_config: response.chartConfig || null, data: response.data || null },
            ]).select('id, role');
            const assistantRow = (inserted || []).find((r: { role: string }) => r.role === 'assistant');
            if (assistantRow) {
                const { error } = await p.adminDb.from('ai_messages').update({ agents_used: response.agentsUsed, trace: response.trace }).eq('id', assistantRow.id);
                if (error) console.warn('Orchestrator metadata not persisted (migration pending?):', error.message);
            }
            await p.adminDb.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConversationId);
            // Урт яриа → өмнөх хэсгийг хураангуйлж санах ойд (best-effort, ~1с).
            await maybeUpdateSummary(p.adminDb, activeConversationId);
        }
    } catch (e) {
        console.error('Failed to persist chat messages:', e);
    }
    return activeConversationId;
}
