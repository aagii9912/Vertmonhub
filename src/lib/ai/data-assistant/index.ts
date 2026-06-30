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
import { readTools, writeTools, WRITE_TOOL_NAMES, DELETE_TOOL_NAMES, ADMIN_TOOL_NAMES } from './tools';
import { logAiAudit } from './audit';
import {
    fetchDashboardStats, fetchOrders, fetchProductStats,
    fetchProperties, fetchLeads, fetchLeadDetails, fetchCustomerInsights,
    fetchContracts, fetchContractDetails, fetchContractsSummary,
    fetchSalesSummary, fetchSalesForecast, compareProperties,
    updatePropertyStatus, updatePropertyPrice, updateLeadStatus,
    addLeadNote, processContractAction,
    createProperty, deleteProperty, createLead, deleteLead, createCustomer,
    scheduleViewing, deleteViewing, createContract, deleteContract, deleteCustomer,
    attachFile, bulkUpdateLeads,
    fetchMarketingSummary, createSocialPost, rememberFact,
    generateChartConfig,
} from './functions';
import { inviteUser, assignRole, createRole } from './admin-functions';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/** AI Assistant-ийн RBAC эрхүүд (route-аас тооцоолж дамжуулна). */
export interface AssistantPerms {
    canWrite: boolean;
    canDelete: boolean;
    role: string;
}

// ============================================
// TOOL EXECUTOR
// ============================================

/**
 * Data/admin tool гүйцэтгэгч.
 * confirm=false → mutating tool-ууд preview (баталгаажуулалт хүсэх) буцаана.
 * confirm=true  → бодит үйлдлийг гүйцэтгэнэ (зөвшөөрлийн дараа action endpoint дуудна).
 */
export async function executeDataTool(toolName: string, args: any, shopId: string, perms: AssistantPerms, userId: string, confirm = false, userName = ''): Promise<any> {
    logger.info(`[AI Data Assistant] Executing tool: ${toolName}`, { args, role: perms.role, confirm });

    const isWrite = WRITE_TOOL_NAMES.includes(toolName);
    const isDelete = DELETE_TOOL_NAMES.includes(toolName);
    const isAdmin = ADMIN_TOOL_NAMES.includes(toolName);

    // RBAC: write→canWrite, delete→canDelete, admin→зөвхөн super_admin
    if (isWrite && !perms.canWrite) {
        return { error: 'Энэ үйлдлийг хийх эрх танд алга (бичих эрх шаардлагатай).' };
    }
    if (isDelete && !perms.canDelete) {
        return { error: 'Энэ үйлдлийг хийх эрх танд алга (устгах эрх шаардлагатай).' };
    }
    if (isAdmin && perms.role !== 'super_admin') {
        return { error: 'Энэ үйлдлийг зөвхөн super_admin хийх боломжтой.' };
    }

    let result: any;
    switch (toolName) {
        case 'get_dashboard_stats': result = await fetchDashboardStats(shopId, args.timeRange || 'month'); break;
        case 'list_orders': result = await fetchOrders(shopId, args.status, args.limit || 10); break;
        case 'get_product_stats': result = await fetchProductStats(shopId, args.type || 'all', args.limit || 10); break;
        case 'list_properties': result = await fetchProperties(shopId, args); break;
        case 'list_leads': result = await fetchLeads(shopId, args); break;
        case 'get_lead_details': result = await fetchLeadDetails(shopId, args); break;
        case 'get_customer_insights': result = await fetchCustomerInsights(shopId, args); break;
        case 'list_contracts': result = await fetchContracts(shopId, args); break;
        case 'get_contract_details': result = await fetchContractDetails(shopId, args); break;
        case 'get_contracts_summary': result = await fetchContractsSummary(shopId, args); break;
        case 'get_sales_summary': result = await fetchSalesSummary(shopId, args); break;
        case 'get_sales_forecast': result = await fetchSalesForecast(shopId, args); break;
        case 'compare_properties': result = await compareProperties(shopId, args); break;
        case 'update_property_status': result = await updatePropertyStatus(shopId, args); break;
        case 'update_property_price': result = await updatePropertyPrice(shopId, args); break;
        case 'update_lead_status': result = await updateLeadStatus(shopId, args); break;
        case 'add_lead_note': result = await addLeadNote(shopId, args); break;
        case 'process_contract_action': result = await processContractAction(shopId, args); break;
        // Mutating (баталгаажуулалт шаардах) — confirm-gated. userName = борлуулалтын менежер.
        case 'create_property': result = await createProperty(shopId, args, confirm); break;
        case 'delete_property': result = await deleteProperty(shopId, args, confirm); break;
        case 'create_lead': result = await createLead(shopId, args, confirm, userName); break;
        case 'delete_lead': result = await deleteLead(shopId, args, confirm); break;
        case 'create_customer': result = await createCustomer(shopId, args, confirm, userName); break;
        case 'schedule_viewing': result = await scheduleViewing(shopId, args, confirm, userName); break;
        case 'delete_viewing': result = await deleteViewing(shopId, args, confirm); break;
        case 'create_contract': result = await createContract(shopId, args, confirm, userName); break;
        case 'delete_contract': result = await deleteContract(shopId, args, confirm); break;
        case 'delete_customer': result = await deleteCustomer(shopId, args, confirm); break;
        case 'attach_file': result = await attachFile(shopId, args, confirm, userName); break;
        case 'bulk_update_leads': result = await bulkUpdateLeads(shopId, args, confirm); break;
        case 'get_marketing_summary': result = await fetchMarketingSummary(shopId, args); break;
        case 'create_social_post': result = await createSocialPost(shopId, args, confirm, userName); break;
        case 'remember_fact': result = await rememberFact(shopId, args, confirm, userName); break;
        case 'invite_user': result = await inviteUser(shopId, args, confirm, userId); break;
        case 'assign_role': result = await assignRole(shopId, args, confirm); break;
        case 'create_role': result = await createRole(shopId, args, confirm); break;
        default: return { error: `Unknown tool: ${toolName}` };
    }

    // Audit: бодит үйлдэл хийсэн үед (confirm=true) write/delete/admin-ийг бүртгэнэ
    if ((isWrite || isDelete || isAdmin) && confirm) {
        await logAiAudit({ shopId, userId, tool: toolName, args, success: !(result && result.error) });
    }

    return result;
}

// ============================================
// SYSTEM INSTRUCTIONS
// ============================================

const BASE_INSTRUCTION = `Та бол Vertmon Hub-ийн AI Дата Туслах. Та зөвхөн Vertmon-ий ажилтан, менежерүүдэд дотоод мэдээллээр үйлчилнэ.

ТАНЫ ЧАДВАРУУД:
- Байрны мэдээлэл (properties): жагсаалт, үнэ, статус, м², өрөө тоо, дүүрэг
- Лийд/сонирхогч (leads): жагсаалт, статус, яаралтай, төсөв, сонирхол
- Лийдийн дэлгэрэнгүй: холбогдох байр, уулзалтын түүх, зөвлөмж
- Харилцагч (customers): мэдээлэл, тагууд, тэмдэглэл, мессеж тоо, холбогдох лийд+гэрээ
- Гэрээ (property_contracts): жагсаалт, дэлгэрэнгүй (үнэ, төлсөн, үлдэгдэл, овердуэйс, менежер, банк), нэгтгэл (нийт борлуулалт, цуглуулалтын %, ТОП менежер)
- Dashboard статистик: орлого, лийд тоо, харилцагч тоо, гэрээ тоо

ДҮРЭМ:
1. ЗААВАЛ монгол хэлээр хариулна
2. Тоон мэдээллийг ₮ форматаар бичнэ (жишээ: 380,000,000₮)
3. Хүснэгт, жагсаалт ашиглан цэгцтэй хариулна
4. Хэрэглэгч тодорхой зүйл асуувал зөв tool дуудаж бодит мэдээлэл өгнө
5. Tool дуудалтын үр дүнг хүн ойлгохоор тайлбарлана
6. Хэрэглэгчийн асуултад шууд хариулна, илүү юм бичихгүй
7. Ямар нэг data олдохгүй бол шударгаар хэлнэ`;

const ADMIN_WRITE_INSTRUCTION = `

Танд өгөгдөл өөрчлөх (бичих) эрх бий. Нэмэлт чадварууд:
- Байрны статус солих (available/reserved/sold/rented/barter)
- Байрны үнэ өөрчлөх
- Лийд статус солих
- Лийдэд тэмдэглэл нэмэх
- Гэрээний процесс (sign=гэрээ→байр reserved+лийд negotiating, paid=төлбөр→sold+closed_won, cancel=цуцлах→available+closed_lost)

ӨӨРЧЛӨЛТ хийхэд юу хийснийг тодорхой хэлж өгнө: "[Байрны нэр] статусыг [хуучин] → [шинэ] болгож солилоо."`;

const READ_ONLY_INSTRUCTION = `

Та УНШИЖ ЗӨВХӨН чадна. Мэдээлэл өөрчлөх, статус солих боломжгүй. Хэрэв хэрэглэгч өөрчлөлт хийхийг хүсвэл "Танд энэ үйлдлийг хийх эрх алга" гэж хариулна.`;

function getSystemInstruction(canWrite: boolean, shopKnowledge?: string): string {
    const base = canWrite ? BASE_INSTRUCTION + ADMIN_WRITE_INSTRUCTION : BASE_INSTRUCTION + READ_ONLY_INSTRUCTION;
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
    perms: AssistantPerms = { canWrite: false, canDelete: false, role: 'viewer' },
    shopKnowledge?: string
) {
    try {
        const activeTools = perms.canWrite ? [...readTools, ...writeTools] : readTools;

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: getSystemInstruction(perms.canWrite, shopKnowledge),
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
                const toolResult = await executeDataTool(fc.name, fc.args || {}, shopId, perms, userId);
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
