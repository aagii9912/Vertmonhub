import { NextResponse } from 'next/server';
import { runOrchestrator } from '@/lib/ai/orchestrator';
import type { OrchestratorProgress } from '@/lib/ai/orchestrator/types';
import { resolveSalesManagerName } from '@/lib/ai/data-assistant/functions';
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

// Planner + agent-ууд (зэрэгцээ) + synthesizer. Зэрэгцүүлснээр нийт хугацаа
// хамгийн удаан agent-аар тодорхойлогдох боловч tool дуудлага олонтой үед
// 60 секунд хүрэлцэхгүй байв. 300с нь Vercel-ийн Pro багцын дээд хязгаар;
// Hobby багцад платформ өөрөө 60с болгож дарна (алдаа өгөхгүй).
export const maxDuration = 300;

/**
 * AI Orchestrator API Route
 *
 * Хүсэлтийг автоматаар шинжилж, мэргэшсэн agent-уудад (Дата аналист, Байрны
 * мэргэжилтэн, CRM, Санхүү, Зөвлөх) замчилж, үр дүнг нэгтгэн, мөшгилттэй буцаана.
 * (Хуучин гар mode сонголтыг халж, orchestrator өөрөө шийднэ.)
 */

/**
 * Ярианы солилцоог хадгална (яриа авто-үүсгэх + мессеж + orchestrator мета).
 * Streaming ба энгийн хоёр зам ЭНЭ ЛОГИКИЙГ хуваалцана — өмнө нь зөвхөн
 * энгийн замд байсан тул streaming нэмэхэд хоёр хувилбар салах эрсдэлтэй байв.
 *
 * Best-effort: хадгалалт бүтэлгүйтсэн ч AI-ийн хариуг хэрэглэгчид буцаана.
 */
async function persistExchange(
    response: { text: string; chartConfig?: unknown; data?: unknown; agentsUsed?: unknown; trace?: unknown },
    opts: {
        adminDb: any;
        conversationId?: string | null;
        effectiveShopId: string;
        message: string;
        userId: string;
    },
): Promise<string | null> {
    const { adminDb, effectiveShopId, message, userId } = opts;
    let activeConversationId = opts.conversationId || null;

    try {
        if (!activeConversationId && effectiveShopId) {
            const autoTitle = message.length > 40 ? message.substring(0, 40) + '...' : message;
            const base = { user_id: userId, shop_id: effectiveShopId, title: autoTitle };
            // 'orchestrator'-оор оролдоно; хуучин mode CHECK constraint (data/general)
            // байвал зөрчигдөж амжилтгүй болох тул 'data'-аар найдвартай fallback хийнэ.
            let conv = (await adminDb.from('ai_conversations').insert({ ...base, mode: 'orchestrator' }).select('id').single()).data;
            if (!conv) {
                conv = (await adminDb.from('ai_conversations').insert({ ...base, mode: 'data' }).select('id').single()).data;
            }
            if (conv) activeConversationId = conv.id;
        }

        if (activeConversationId) {
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

            // Best-effort: orchestrator мета (agents_used / trace). Тусдаа update —
            // миграци ороогүй бол энэ алхам алдаа өгнө ч мессеж хадгалагдсан хэвээр.
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

            await adminDb
                .from('ai_conversations')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', activeConversationId);
        }
    } catch (dbError) {
        console.error('Failed to persist chat messages:', dbError);
        // Non-blocking: still return the AI response even if DB save fails
    }

    return activeConversationId;
}

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

        const { message, shopId, history = [], conversationId, attachments = [], stream: wantsStream = false } = await req.json();
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
            // Модулийн эрхийг AI зам руу ЗААВАЛ дамжуулна — эс бөгөөс чат нь
            // хажуугийн цэсээр хаагдсан хэсгүүдийг тойрч гарна.
            modules: permissions.modules,
        };

        const shopKnowledge = await loadShopKnowledge(effectiveShopId);
        const userName = await resolveSalesManagerName(effectiveShopId, resolvedUser.id);

        // Streaming горим (wantsStream) — хэрэглэгч 30-60 секунд хоосон спиннер
        // ширтэхийн оронд планчлал ба agent бүрийн дуусахыг шууд харна.
        const runWith = (onProgress?: (e: OrchestratorProgress) => void) =>
            runOrchestrator(message, {
                shopId: effectiveShopId,
                userId: resolvedUser.id,
                perms,
                shopKnowledge,
                history,
                userName,
                attachments: Array.isArray(attachments) ? attachments : [],
                onProgress,
            });

        if (wantsStream) {
            const encoder = new TextEncoder();
            // Хэрэглэгч холболтоо таслахад цаашид бичихгүй бөгөөд ярианы
            // мөрийг ч хадгалахгүй (эс бөгөөс хэрэглэгчийн харахгүй, хоосон
            // яриа DB-д хуримтлагдана).
            let clientGone = false;
            const stream = new ReadableStream<Uint8Array>({
                async start(controller) {
                    const send = (event: Record<string, unknown>) => {
                        if (clientGone) return;
                        try {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                        } catch {
                            clientGone = true;
                        }
                    };

                    try {
                        const result = await runWith((e) => send({ ...e, phase: 'progress' }));

                        // Таслагдсан бол шинэ яриа үүсгэхгүй. Одоо байгаа
                        // ярианд бол хадгална — хэрэглэгч буцаж ирэхэд түүх
                        // бүрэн байх нь зөв.
                        if (clientGone && !conversationId) {
                            return;
                        }

                        const convId = await persistExchange(result, {
                            adminDb, conversationId, effectiveShopId, message, userId: resolvedUser.id,
                        });
                        send({
                            phase: 'done',
                            response: result.text,
                            data: result.data,
                            chartConfig: result.chartConfig,
                            agentsUsed: result.agentsUsed,
                            trace: result.trace,
                            pendingActions: result.pendingActions,
                            conversationId: convId,
                        });
                    } catch (err) {
                        send({
                            phase: 'error',
                            message: err instanceof Error ? err.message : 'AI Orchestrator-т алдаа гарлаа',
                        });
                    } finally {
                        try { controller.close(); } catch { /* аль хэдийн хаагдсан */ }
                    }
                },
                cancel() {
                    // Хөтөч урсгалыг таслав (хэрэглэгч «Зогсоох» дарсан эсвэл
                    // хуудсаас гарсан).
                    clientGone = true;
                },
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                    Connection: 'keep-alive',
                    // Прокси/CDN буфферлэхээс сэргийлнэ — эс бөгөөс явц бөөнөөрөө ирнэ
                    'X-Accel-Buffering': 'no',
                },
            });
        }

        const response = await runWith();

        const activeConversationId = await persistExchange(response, {
            adminDb, conversationId, effectiveShopId, message, userId: resolvedUser.id,
        });

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
