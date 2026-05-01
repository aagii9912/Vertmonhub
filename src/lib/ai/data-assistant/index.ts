/**
 * Vertmon AI Data Assistant — Gemini Powered
 * 
 * Internal staff assistant that can query ALL Vertmon business data:
 * - Properties, Leads, Customers, Orders, Products
 * - Dashboard Stats, Property Viewings
 * 
 * Handler + Executor only. Tool definitions in ./tools.ts, data functions in ./functions.ts
 */

import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { logger } from '@/lib/utils/logger';
import { readTools, writeTools, WRITE_TOOL_NAMES } from './tools';
import {
    fetchDashboardStats, fetchOrders, fetchProductStats,
    fetchProperties, fetchLeads, fetchLeadDetails, fetchCustomerInsights,
    fetchSalesSummary, fetchSalesForecast, compareProperties,
    updatePropertyStatus, updatePropertyPrice, updateLeadStatus,
    addLeadNote, processContractAction,
    generateChartConfig,
} from './functions';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ============================================
// TOOL EXECUTOR
// ============================================

async function executeTool(toolName: string, args: any, shopId: string, userRole: string): Promise<any> {
    logger.info(`[AI Data Assistant] Executing tool: ${toolName}`, { args, userRole });

    // Block write tools for non-super_admin
    if (WRITE_TOOL_NAMES.includes(toolName) && userRole !== 'super_admin') {
        return { error: 'Энэ үйлдлийг хийх эрхгүй. Зөвхөн Super Admin ашиглах боломжтой.' };
    }

    switch (toolName) {
        case 'get_dashboard_stats': return await fetchDashboardStats(shopId, args.timeRange || 'month');
        case 'list_orders': return await fetchOrders(shopId, args.status, args.limit || 10);
        case 'get_product_stats': return await fetchProductStats(shopId, args.type || 'all', args.limit || 10);
        case 'list_properties': return await fetchProperties(shopId, args);
        case 'list_leads': return await fetchLeads(shopId, args);
        case 'get_lead_details': return await fetchLeadDetails(shopId, args);
        case 'get_customer_insights': return await fetchCustomerInsights(shopId, args);
        case 'get_sales_summary': return await fetchSalesSummary(shopId, args);
        case 'get_sales_forecast': return await fetchSalesForecast(shopId, args);
        case 'compare_properties': return await compareProperties(shopId, args);
        case 'update_property_status': return await updatePropertyStatus(shopId, args);
        case 'update_property_price': return await updatePropertyPrice(shopId, args);
        case 'update_lead_status': return await updateLeadStatus(shopId, args);
        case 'add_lead_note': return await addLeadNote(shopId, args);
        case 'process_contract_action': return await processContractAction(shopId, args);
        default: return { error: `Unknown tool: ${toolName}` };
    }
}

// ============================================
// SYSTEM INSTRUCTIONS
// ============================================

const BASE_INSTRUCTION = `Та бол Vertmon Hub-ийн AI Дата Туслах. Та зөвхөн Vertmon-ий ажилтан, менежерүүдэд дотоод мэдээллээр үйлчилнэ.

ТАНЫ ЧАДВАРУУД:
- Байрны мэдээлэл (properties): жагсаалт, үнэ, статус, м², өрөө тоо, дүүрэг
- Лийд/сонирхогч (leads): жагсаалт, статус, яаралтай, төсөв, сонирхол
- Лийдийн дэлгэрэнгүй: холбогдох байр, үзлэг түүх, зөвлөмж
- Захиалга (orders): жагсаалт, статус, нийт дүн
- Бүтээгдэхүүн (products): нөөц, статистик
- Харилцагч (customers): мэдээлэл, захиалгын түүх
- Dashboard статистик: орлого, захиалга тоо, лийд тоо

ДҮРЭМ:
1. ЗААВАЛ монгол хэлээр хариулна
2. Тоон мэдээллийг ₮ форматаар бичнэ (жишээ: 380,000,000₮)
3. Хүснэгт, жагсаалт ашиглан цэгцтэй хариулна
4. Хэрэглэгч тодорхой зүйл асуувал зөв tool дуудаж бодит мэдээлэл өгнө
5. Tool дуудалтын үр дүнг хүн ойлгохоор тайлбарлана
6. Хэрэглэгчийн асуултад шууд хариулна, илүү юм бичихгүй
7. Ямар нэг data олдохгүй бол шударгаар хэлнэ`;

const ADMIN_WRITE_INSTRUCTION = `

Та SUPER ADMIN эрхтэй хэрэглэгч. Нэмэлт чадварууд:
- Байрны статус солих (available/reserved/sold/rented/barter)
- Байрны үнэ өөрчлөх
- Лийд статус солих
- Лийдэд тэмдэглэл нэмэх
- Гэрээний процесс (sign=гэрээ→байр reserved+лийд negotiating, paid=төлбөр→sold+closed_won, cancel=цуцлах→available+closed_lost)

ӨӨРЧЛӨЛТ хийхэд юу хийснийг тодорхой хэлж өгнө: "[Байрны нэр] статусыг [хуучин] → [шинэ] болгож солилоо."`;

const READ_ONLY_INSTRUCTION = `

Та УНШИЖ ЗӨВХӨН чадна. Мэдээлэл өөрчлөх, статус солих боломжгүй. Хэрэв хэрэглэгч өөрчлөлт хийхийг хүсвэл "Энэ үйлдлийг зөвхөн Super Admin хийх боломжтой" гэж хариулна.`;

function getSystemInstruction(userRole: string, shopKnowledge?: string): string {
    const base = userRole === 'super_admin' ? BASE_INSTRUCTION + ADMIN_WRITE_INSTRUCTION : BASE_INSTRUCTION + READ_ONLY_INSTRUCTION;
    return shopKnowledge ? base + '\n\n' + shopKnowledge : base;
}

// ============================================
// MAIN HANDLER
// ============================================

export async function handleDataAssistantQuery(
    message: string,
    shopId: string,
    userId: string,
    history: any[] = [],
    userRole: string = 'user',
    shopKnowledge?: string
) {
    try {
        const activeTools = userRole === 'super_admin' ? [...readTools, ...writeTools] : readTools;

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: getSystemInstruction(userRole, shopKnowledge),
            tools: [{ functionDeclarations: activeTools }],
            generationConfig: { temperature: 0.3, topP: 0.8, maxOutputTokens: 2048 },
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
                const toolResult = await executeTool(fc.name, fc.args || {}, shopId, userRole);
                toolResults.push({ functionResponse: { name: fc.name, response: { result: toolResult } } });
                allData = toolResult;
                chartConfig = generateChartConfig(fc.name, fc.args || {}, toolResult);
            }

            const synthesisResult = await chat.sendMessage(toolResults.map(tr => ({ functionResponse: tr.functionResponse })));
            return { text: synthesisResult.response.text(), data: allData, chartConfig };
        }

        return { text: response.text(), data: null, chartConfig: null };
    } catch (error) {
        logger.error('[AI Data Assistant] Error:', { error });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('API key')) {
            return { text: 'Gemini API key тохируулаагүй байна. Админд хандана уу.', data: null, chartConfig: null };
        }
        return { text: `Уучлаарай, алдаа гарлаа: ${errorMessage}. Дахин оролдоно уу.`, data: null, chartConfig: null };
    }
}
