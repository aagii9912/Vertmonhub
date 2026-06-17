import { NextResponse } from 'next/server';
import { runOrchestrator } from '@/lib/ai/orchestrator';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { resolveApiUser } from '@/lib/auth/resolve-user';
import { buildDynamicKnowledge, buildFAQs } from '@/lib/ai/services/PromptService';
import { fetchRolePermissions } from '@/lib/rbac';

/**
 * Load shop's custom_knowledge + shop_faqs and format as a prompt suffix.
 * Returns '' if shopId is missing or there's no knowledge to inject.
 */
async function loadShopKnowledge(shopId: string | undefined): Promise<string> {
    if (!shopId) return '';
    const db = supabaseAdmin();
    const [shopRes, faqRes] = await Promise.all([
        db.from('shops').select('custom_knowledge').eq('id', shopId).single(),
        db.from('shop_faqs').select('question, answer').eq('shop_id', shopId).eq('is_active', true),
    ]);
    const ck = (shopRes.data?.custom_knowledge as Record<string, unknown> | string | null) || null;
    const faqs = (faqRes.data || []) as { question: string; answer: string }[];
    const parts = [buildDynamicKnowledge(ck), buildFAQs(faqs)].filter(Boolean);
    return parts.join('\n');
}

export const maxDuration = 60;

/**
 * AI Orchestrator API Route
 *
 * Хүсэлтийг автоматаар шинжилж, мэргэшсэн agent-уудад (Дата аналист, Байрны
 * мэргэжилтэн, CRM, Санхүү, Зөвлөх) замчилж, үр дүнг нэгтгэн, мөшгилттэй буцаана.
 * (Хуучин гар mode сонголтыг халж, orchestrator өөрөө шийднэ.)
 */
export async function POST(req: Request) {
    try {
        // Resolve user from Supabase or custom session
        const resolvedUser = await resolveApiUser();
        if (!resolvedUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const adminDb = supabaseAdmin();

        // Хэрэглэгчийн дүрийг RBAC-аар тодорхойлно (user_roles → admins fallback)
        let roleName = 'viewer';
        const { data: roleRow } = await adminDb
            .from('user_roles').select('role').eq('user_id', resolvedUser.id).single();
        if (roleRow?.role) {
            roleName = roleRow.role;
        } else {
            const { data: adminData } = await adminDb
                .from('admins').select('role').eq('user_id', resolvedUser.id).eq('is_active', true).single();
            if (adminData?.role) roleName = adminData.role;
        }
        const permissions = await fetchRolePermissions(roleName);

        // RBAC: ai-assistant модулийн эрхгүй бол блоклоно
        if (!permissions.modules.includes('ai-assistant')) {
            return NextResponse.json({ error: 'AI Orchestrator ашиглах эрх танд алга' }, { status: 403 });
        }

        const { message, shopId, history = [], conversationId } = await req.json();
        if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });

        // Shop scoping: хүсэлтийн shopId-г хэрэглэгчийн хандах эрхтэй shop-уудтай тулгана
        const [{ data: ownedRows }, { data: memberRows }] = await Promise.all([
            adminDb.from('shops').select('id').eq('user_id', resolvedUser.id),
            adminDb.from('shop_members').select('shop_id').eq('user_id', resolvedUser.id),
        ]);
        const accessibleShopIds = new Set<string>([
            ...(ownedRows || []).map(r => r.id),
            ...(memberRows || []).map(r => r.shop_id),
        ]);
        if (shopId && !accessibleShopIds.has(shopId)) {
            return NextResponse.json({ error: 'Энэ shop-ийн мэдээлэлд хандах эрхгүй' }, { status: 403 });
        }
        const effectiveShopId = shopId || [...accessibleShopIds][0];
        if (!effectiveShopId) {
            return NextResponse.json({ error: 'Холбогдсон shop олдсонгүй' }, { status: 403 });
        }

        const perms = {
            canWrite: permissions.canWrite,
            canDelete: permissions.canDelete,
            role: roleName,
        };

        const shopKnowledge = await loadShopKnowledge(effectiveShopId);

        const response = await runOrchestrator(message, {
            shopId: effectiveShopId,
            userId: resolvedUser.id,
            perms,
            shopKnowledge,
            history,
        });

        // Persist messages to database
        let activeConversationId = conversationId;
        try {
            // Auto-create conversation if none provided
            if (!activeConversationId && effectiveShopId) {
                const autoTitle = message.length > 40 ? message.substring(0, 40) + '...' : message;
                const { data: conv } = await adminDb
                    .from('ai_conversations')
                    .insert({
                        user_id: resolvedUser.id,
                        shop_id: effectiveShopId,
                        title: autoTitle,
                        mode: 'orchestrator',
                    })
                    .select('id')
                    .single();
                if (conv) activeConversationId = conv.id;
            }

            if (activeConversationId) {
                // Save user message + assistant response (core columns — always present)
                const { data: inserted } = await adminDb.from('ai_messages').insert([
                    { conversation_id: activeConversationId, role: 'user', content: message },
                    {
                        conversation_id: activeConversationId,
                        role: 'assistant',
                        content: response.text,
                        chart_config: response.chartConfig || null,
                        data: response.data || null,
                    },
                ]).select('id, role');

                // Best-effort: attach orchestrator metadata (agents_used / trace).
                // Тусдаа update — миграци ороогүй бол энэ алхам алдаа өгнө ч үндсэн
                // мессеж хадгалагдсан хэвээр (regression-гүй).
                const assistantRow = (inserted || []).find((r: any) => r.role === 'assistant');
                if (assistantRow) {
                    const { error: metaError } = await adminDb
                        .from('ai_messages')
                        .update({ agents_used: response.agentsUsed, trace: response.trace })
                        .eq('id', assistantRow.id);
                    if (metaError) {
                        console.warn('Orchestrator metadata not persisted (migration pending?):', metaError.message);
                    }
                }

                // Touch conversation updated_at
                await adminDb
                    .from('ai_conversations')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', activeConversationId);
            }
        } catch (dbError) {
            console.error('Failed to persist chat messages:', dbError);
            // Non-blocking: still return the AI response even if DB save fails
        }

        return NextResponse.json({
            response: response.text,
            data: response.data,
            chartConfig: response.chartConfig,
            agentsUsed: response.agentsUsed,
            trace: response.trace,
            pendingActions: response.pendingActions,
            conversationId: activeConversationId || null,
        });
    } catch (error) {
        return safeErrorResponse(error, 'AI Orchestrator-т алдаа гарлаа');
    }
}
