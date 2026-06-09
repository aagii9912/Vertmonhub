import { NextResponse } from 'next/server';
import { handleDataAssistantQuery } from '@/lib/ai/data-assistant';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { readTools } from '@/lib/ai/data-assistant/tools';
import {
    fetchDashboardStats, fetchProperties, fetchLeads,
    fetchSalesSummary, fetchSalesForecast, fetchOrders,
    fetchCustomerInsights, fetchContracts, fetchContractDetails,
    fetchContractsSummary, generateChartConfig,
} from '@/lib/ai/data-assistant/functions';
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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * General mode system prompt — like gemini.com but with Vertmon context
 */
const GENERAL_SYSTEM_PROMPT = `Та бол Vertmon Hub-ийн AI Туслах. Та бүх төрлийн асуултад хариулна — маркетинг, бизнес стратеги, контент, төлөвлөгөө, ерөнхий мэдлэг гэх мэт.

ТАНЫ ЧАДВАРУУД:
- Маркетингийн төлөвлөгөө, кампанит ажил зөвлөх
- Борлуулалтын стратеги, үнийн бодлого
- Бизнесийн шинжилгээ, санхүүгийн тооцоо, ROI
- Контент маркетинг, сошиал медиа стратеги
- Үл хөдлөхийн зах зээлийн чиг хандлага, тренд
- Ерөнхий бизнесийн зөвлөгөө
- Mongolian зах зээлд тохирсон маркетинг
- DB мэдээлэлтэй ажиллах — бодит property, leads, customers, contracts, sales data татах

МАРКЕТИНГ ТӨЛӨВЛӨГӨӨ бичихдээ:
- Зорилтот бүлэг → Суваг → Контент → Хуваарь → Төсөв → KPI гэсэн бүтэцтэй
- Бодит тоон мэдээлэл шаардвал заавал DB-ээс data авна
- Монголын зах зээлд нийцсэн зөвлөгөө өгнө

ДҮРЭМ:
1. Монгол хэлээр хариулна
2. Бодитой, хэрэгжих боломжтой зүйл бичнэ
3. Тоон мэдээлэл шаардвал tool дуудаж бодит DB мэдээлэл авна
4. Хүснэгт, жагсаалт ашиглан цэгцтэй хариулна
5. Санхүүгийн тоо ₮ форматаар бичнэ (380,000,000₮)
6. Тодорхойгүй бол тодруулж асуу`;

/**
 * Execute general-mode tool calls
 */
async function executeGeneralTool(toolName: string, args: any, shopId: string): Promise<any> {
    switch (toolName) {
        case 'get_dashboard_stats': return await fetchDashboardStats(shopId, args.timeRange || 'month');
        case 'list_properties': return await fetchProperties(shopId, args);
        case 'list_leads': return await fetchLeads(shopId, args);
        case 'get_sales_summary': return await fetchSalesSummary(shopId, args);
        case 'get_sales_forecast': return await fetchSalesForecast(shopId, args);
        case 'list_orders': return await fetchOrders(shopId, args.status, args.limit || 10);
        case 'get_customer_insights': return await fetchCustomerInsights(shopId, args);
        case 'list_contracts': return await fetchContracts(shopId, args);
        case 'get_contract_details': return await fetchContractDetails(shopId, args);
        case 'get_contracts_summary': return await fetchContractsSummary(shopId, args);
        default: return { error: `Unknown tool: ${toolName}` };
    }
}

/**
 * Handle general-mode query — like gemini.com but with DB access
 */
async function handleGeneralQuery(
    message: string,
    shopId: string,
    history: any[] = [],
    shopKnowledge?: string,
) {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: shopKnowledge ? GENERAL_SYSTEM_PROMPT + '\n\n' + shopKnowledge : GENERAL_SYSTEM_PROMPT,
        tools: [{ functionDeclarations: readTools }],
        generationConfig: { temperature: 0.7, topP: 0.9, maxOutputTokens: 4096 },
    });

    const geminiHistory: Content[] = history
        .filter((m: any) => m.role && m.content)
        .map((m: any) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(message);
    const response = result.response;
    const functionCalls = response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
        const toolResults = [];
        let allData: any = null;
        let chartConfig: any = null;

        for (const fc of functionCalls) {
            const toolResult = await executeGeneralTool(fc.name, fc.args || {}, shopId);
            toolResults.push({ functionResponse: { name: fc.name, response: { result: toolResult } } });
            allData = toolResult;
            chartConfig = generateChartConfig(fc.name, fc.args || {}, toolResult);
        }

        const synthesisResult = await chat.sendMessage(toolResults.map(tr => ({ functionResponse: tr.functionResponse })));
        return { text: synthesisResult.response.text(), data: allData, chartConfig };
    }

    return { text: response.text(), data: null, chartConfig: null };
}

/**
 * AI Assistant API Route — Dual Mode
 * mode=data: Function-calling with DB tools, strict data focus
 * mode=general: Free Gemini chat (like gemini.com) with optional DB access
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
            return NextResponse.json({ error: 'AI туслах ашиглах эрх танд алга' }, { status: 403 });
        }

        const { message, shopId, history = [], mode = 'data', conversationId } = await req.json();
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

        let response;
        if (mode === 'general') {
            response = await handleGeneralQuery(message, effectiveShopId, history, shopKnowledge);
        } else {
            response = await handleDataAssistantQuery(message, effectiveShopId, resolvedUser.id, history, perms, shopKnowledge);
        }

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
                        mode,
                    })
                    .select('id')
                    .single();
                if (conv) activeConversationId = conv.id;
            }

            if (activeConversationId) {
                // Save user message + assistant response
                await adminDb.from('ai_messages').insert([
                    { conversation_id: activeConversationId, role: 'user', content: message },
                    {
                        conversation_id: activeConversationId,
                        role: 'assistant',
                        content: response.text,
                        chart_config: response.chartConfig || null,
                        data: response.data || null,
                    },
                ]);

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
            conversationId: activeConversationId || null,
        });
    } catch (error) {
        return safeErrorResponse(error, 'AI түгээх үед алдаа гарлаа');
    }
}
