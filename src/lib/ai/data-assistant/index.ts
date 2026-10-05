/**
 * Vertmon AI Data Assistant — tool гүйцэтгэгч (provider-independent)
 *
 * Orchestrator (Claude) tool дуудлагыг энд гүйцэтгэнэ: RBAC шалгалт → data функц → audit.
 * Tool тодорхойлолт ./tools.ts, data функцууд ./functions.ts. Модель дуудлага ЭНД БАЙХГҮЙ.
 */

import { logger } from '@/lib/utils/logger';
import { supabaseAdmin } from '@/lib/supabase';
import { applyProjectScope, resolveSalesProjectScope, UNRESTRICTED_SALES_SCOPE, type SalesProjectScope } from '@/lib/sales/project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import { loadOperationsReport } from '@/lib/dashboard/operations-report-load';
import { loadMarketingPerformance } from '@/lib/marketing/performance-load';
import { buildDepartmentKpis } from '@/lib/marketing/department-kpi';
import { formatOperationsReportText } from '@/lib/dashboard/operations-report';
import { ZodError } from 'zod';
import { TOOL_CATALOG, canUseToolModule, isCatalogTool, toolKindDenial, type ToolName } from '@/lib/ai/tool-catalog';
import { logAiAudit } from './audit';
import { redactAuditArgs } from './audit-redaction';
import {
    fetchDashboardStats,
    fetchProperties, fetchLeads, fetchLeadDetails, fetchCustomerInsights,
    fetchContracts, fetchContractDetails, fetchContractsSummary,
    fetchSalesSummary, fetchSalesForecast, compareProperties,
    updatePropertyStatus, updateUnitStatus, updatePropertyPrice, updateLeadStatus,
    addLeadNote, processContractAction,
    createProperty, deleteProperty, createLead, deleteLead, createCustomer,
    scheduleViewing, deleteViewing, createContract, deleteContract, deleteCustomer,
    attachFile, bulkUpdateLeads,
    fetchMarketingSummary, fetchMarketingBudgetStatus, fetchMarketIndicators,
    createSocialPost, rememberFact,
} from './functions';
import { inviteUser, assignRole, createRole } from './admin-functions';
import { getKpiReport, getManagerActivityTool, getManagerPerformanceTool, getExportLink, customerTag, replyCustomer, mergeCustomersTool, logSpend, setBudget, listSpend, addIndicator } from './actions2';
import { logCall, setFollowup, logPriceQuote, assignLeadManager, listViewingsTool, recordViewingOutcome, rescheduleViewing, listMyTasks, createTaskTool, completeTaskTool, listContractPayments, addContractPayment, markPaymentPaid } from './actions';
import { transferContractTool } from './actions-contract-transfer';
import { listLeadCategoriesTool, setLeadCategory } from './actions-lead-category';

/** AI Assistant-ийн RBAC эрхүүд (route-аас тооцоолж дамжуулна). */
export interface AssistantPerms {
    canWrite: boolean;
    canDelete: boolean;
    role: string;
    /** Серверийн баталсан модулиуд. Өгөгдөөгүй бол super_admin-аас бусдад хандалт хаалттай. */
    modules?: string[];
}

/** Handler-т дамжих нэг дуудлагын контекст. userName = борлуулалтын менежер (attribution). */
interface ToolCall {
    shopId: string;
    args: any;
    confirm: boolean;
    scope: SalesProjectScope;
    perms: AssistantPerms;
    userId: string;
    userName: string;
}

async function marketingPerformanceTool({ shopId, args, scope }: ToolCall) {
    try {
        const { report } = await loadMarketingPerformance(supabaseAdmin(), shopId, args, scope);
        return { ...report, departmentKpis: buildDepartmentKpis(report), url: '/marketing', guidance: 'Зөвхөн энэ тайлангийн тоонд тулгуурлан дүгнэ. Үүссэн лидийн бүлгийн Sales/Deal хувийг хугацааны нийт гэрээтэй андуурахгүй. Менежерт шилжүүлэлтийг Qualified Lead гэж үзэхгүй. Албаны KPI-ийн жин нь нийлбэр үнэлгээ биш; дутуу шалгуур, зорилт, онооны дүрмийг зохиохгүй. Хоосон зорилт, дутуу холбоосыг 0 гүйцэтгэл гэж тайлбарлахгүй. Дуусаагүй сарыг бүтэн сартай харьцуулсныг дурд. Шалтгааныг нотолгоогүй бүү зохио.' };
    } catch (error) {
        logger.error('[AI Marketing Performance] Read failed', { error });
        return { error: error instanceof ZodError ? 'Огноо, төслийн сонголт буруу байна.' : 'Маркетингийн тайлан бүрэн уншигдсангүй. Тоо таамаглаж дүгнэх боломжгүй.' };
    }
}

async function operationsReportTool({ shopId, args, scope, perms }: ToolCall) {
    // This report never accepts client-supplied permissions, including legacy callers without modules.
    if (perms.role !== 'super_admin' && !perms.modules?.includes('reports')) {
        return { error: 'Үйл ажиллагааны тайлан харах эрх шаардлагатай.' };
    }
    try {
        const report = await loadOperationsReport(supabaseAdmin(), {
            shopId, from: args.from, to: args.to, scope,
            canReadFinance: perms.role === 'super_admin' || !!perms.modules?.includes('finance'),
        });
        return { ...report, plainText: formatOperationsReportText(report), url: `/dashboard/reports/operations?${new URLSearchParams(report.range)}` };
    } catch (error) {
        logger.error('[AI Operations Report] Read failed', { error });
        return { error: error instanceof ZodError ? 'Огноо буруу байна. YYYY-MM-DD хэлбэрээр 367 хүртэл өдөр сонгоно уу.' : 'Тайлангийн эх өгөгдлийг бүрэн татаж чадсангүй. Дахин оролдоно уу.' };
    }
}

/**
 * Tool бүрийн гүйцэтгэгч. Mutating tool-ууд confirm=false үед preview буцаана;
 * AUTO tool-ууд (log_call, create_task …) confirm-ийг executor-ийн нэгдсэн хаалтаас авна.
 */
const HANDLERS: Record<ToolName, (call: ToolCall) => Promise<unknown>> = {
    list_lead_projects: async ({ shopId, scope }) => ({ projects: await fetchAllRows((from, to) => applyProjectScope(supabaseAdmin().from('projects')
        .select('id,name').eq('shop_id', shopId).order('id').range(from, to), scope, 'id')) }),
    list_lead_categories: ({ shopId }) => listLeadCategoriesTool(shopId),
    get_marketing_performance: marketingPerformanceTool,
    get_operations_report: operationsReportTool,
    get_dashboard_stats: ({ shopId, args, scope }) => fetchDashboardStats(shopId, args.timeRange || 'month', scope),
    list_properties: ({ shopId, args }) => fetchProperties(shopId, args),
    list_leads: ({ shopId, args, scope }) => fetchLeads(shopId, args, scope),
    get_lead_details: ({ shopId, args, scope }) => fetchLeadDetails(shopId, args, scope),
    get_customer_insights: ({ shopId, args, scope }) => fetchCustomerInsights(shopId, args, scope),
    list_contracts: ({ shopId, args }) => fetchContracts(shopId, args),
    get_contract_details: ({ shopId, args }) => fetchContractDetails(shopId, args),
    get_contracts_summary: ({ shopId, args }) => fetchContractsSummary(shopId, args),
    get_sales_summary: ({ shopId, args }) => fetchSalesSummary(shopId, args),
    get_sales_forecast: ({ shopId, args }) => fetchSalesForecast(shopId, args),
    compare_properties: ({ shopId, args }) => compareProperties(shopId, args),
    update_property_status: ({ shopId, args, confirm }) => updatePropertyStatus(shopId, args, confirm),
    update_unit_status: ({ shopId, args, confirm }) => updateUnitStatus(shopId, args, confirm),
    update_property_price: ({ shopId, args, confirm }) => updatePropertyPrice(shopId, args, confirm),
    update_lead_status: ({ shopId, args, confirm, scope, userId, userName }) => updateLeadStatus(shopId, args, confirm, scope, { userId, userName }),
    add_lead_note: ({ shopId, args, confirm, scope, userId, userName }) => addLeadNote(shopId, args, confirm, scope, { userId, userName }),
    process_contract_action: ({ shopId, args, confirm, scope, userId, userName }) => processContractAction(shopId, args, confirm, scope, { userId, userName }),
    create_property: ({ shopId, args, confirm }) => createProperty(shopId, args, confirm),
    delete_property: ({ shopId, args, confirm }) => deleteProperty(shopId, args, confirm),
    create_lead: ({ shopId, args, confirm, userId, perms, scope }) => createLead(shopId, args, confirm, { userId, role: perms.role, scope }),
    delete_lead: ({ shopId, args, confirm, scope }) => deleteLead(shopId, args, confirm, scope),
    create_customer: ({ shopId, args, confirm, userName }) => createCustomer(shopId, args, confirm, userName),
    schedule_viewing: ({ shopId, args, confirm, userName, userId, scope }) => scheduleViewing(shopId, args, confirm, userName, userId, scope),
    delete_viewing: ({ shopId, args, confirm, scope, userId }) => deleteViewing(shopId, args, confirm, scope, userId),
    create_contract: ({ shopId, args, confirm, userName, scope }) => createContract(shopId, args, confirm, userName, scope),
    transfer_contract: ({ shopId, args, confirm, scope, userId, userName }) => transferContractTool(shopId, args, confirm, { userId, userName, scope }),
    delete_contract: ({ shopId, args, confirm }) => deleteContract(shopId, args, confirm),
    delete_customer: ({ shopId, args, confirm }) => deleteCustomer(shopId, args, confirm),
    attach_file: ({ shopId, args, confirm, userName, userId, perms, scope }) => attachFile(shopId, args, confirm, userName, userId, perms, scope),
    bulk_update_leads: ({ shopId, args, confirm, scope, userId, userName }) => bulkUpdateLeads(shopId, args, confirm, scope, { userId, userName }),
    get_marketing_summary: ({ shopId, args }) => fetchMarketingSummary(shopId, args),
    get_marketing_budget_status: ({ shopId, args }) => fetchMarketingBudgetStatus(shopId, args),
    get_market_indicators: ({ shopId }) => fetchMarketIndicators(shopId),
    create_social_post: ({ shopId, args, confirm, userName }) => createSocialPost(shopId, args, confirm, userName),
    remember_fact: ({ shopId, args, confirm, userName }) => rememberFact(shopId, args, confirm, userName),
    list_viewings: ({ shopId, args, scope }) => listViewingsTool(shopId, args, scope),
    list_my_tasks: ({ shopId, args, userId }) => listMyTasks(shopId, args, userId),
    list_contract_payments: ({ shopId, args }) => listContractPayments(shopId, args),
    log_call: ({ shopId, args, userId, userName, scope }) => logCall(shopId, args, userId, userName, scope),
    set_followup: ({ shopId, args, userId, userName, scope }) => setFollowup(shopId, args, userId, userName, scope),
    log_price_quote: ({ shopId, args, confirm, userId, userName, scope }) => logPriceQuote(shopId, args, confirm, userId, userName, scope),
    set_lead_category: ({ shopId, args, userId, userName, scope }) => setLeadCategory(shopId, args, userId, userName, scope),
    assign_lead_manager: ({ shopId, args, confirm, userId, userName, scope }) => assignLeadManager(shopId, args, confirm, userId, userName, scope),
    record_viewing_outcome: ({ shopId, args, userId, userName, scope }) => recordViewingOutcome(shopId, args, userId, userName, scope),
    reschedule_viewing: ({ shopId, args, confirm, userId, userName, scope }) => rescheduleViewing(shopId, args, confirm, userId, userName, scope),
    create_task: ({ shopId, args, userId }) => createTaskTool(shopId, args, userId),
    complete_task: ({ shopId, args, userId }) => completeTaskTool(shopId, args, userId),
    add_contract_payment: ({ shopId, args, confirm }) => addContractPayment(shopId, args, confirm),
    mark_payment_paid: ({ shopId, args, confirm }) => markPaymentPaid(shopId, args, confirm),
    get_kpi_report: ({ shopId, args, userId, perms, scope }) => getKpiReport(shopId, args, userId, perms, scope),
    get_manager_activity: ({ shopId, args, userId, perms, scope }) => getManagerActivityTool(shopId, args, userId, perms, scope),
    get_manager_performance: ({ shopId }) => getManagerPerformanceTool(shopId),
    get_export_link: ({ shopId, args }) => getExportLink(shopId, args),
    add_customer_tag: ({ shopId, args }) => customerTag(shopId, args, false),
    remove_customer_tag: ({ shopId, args }) => customerTag(shopId, args, true),
    reply_to_customer: ({ shopId, args, confirm }) => replyCustomer(shopId, args, confirm),
    merge_customers: ({ shopId, args, confirm, scope }) => mergeCustomersTool(shopId, args, confirm, scope),
    log_marketing_spend: ({ shopId, args, confirm, userId }) => logSpend(shopId, args, confirm, userId),
    set_marketing_budget: ({ shopId, args, confirm }) => setBudget(shopId, args, confirm),
    list_marketing_spend: ({ shopId, args }) => listSpend(shopId, args),
    add_market_indicator: ({ shopId, args }) => addIndicator(shopId, args),
    invite_user: ({ shopId, args, confirm, userId }) => inviteUser(shopId, args, confirm, userId),
    assign_role: ({ shopId, args, confirm, userId }) => assignRole(shopId, args, confirm, userId),
    create_role: ({ shopId, args, confirm }) => createRole(shopId, args, confirm),
};

// ============================================
// TOOL EXECUTOR
// ============================================

/**
 * Data/admin tool гүйцэтгэгч: эрхийн төрөл → модуль → төслийн хүрээ → (AUTO preview) → handler → audit.
 * confirm=false → mutating tool-ууд preview (баталгаажуулалт хүсэх) буцаана.
 * confirm=true  → бодит үйлдлийг гүйцэтгэнэ (зөвшөөрлийн дараа action endpoint дуудна).
 */
export async function executeDataTool(toolName: string, args: any, shopId: string, perms: AssistantPerms, userId: string, confirm = false, userName = ''): Promise<any> {
    logger.info(`[AI Data Assistant] Executing tool: ${toolName}`, { args: redactAuditArgs(toolName, args ?? {}), role: perms.role, confirm });

    if (!isCatalogTool(toolName)) return { error: `Unknown tool: ${toolName}` };
    const meta = TOOL_CATALOG[toolName];
    const denied = toolKindDenial(meta.kind, perms);
    if (denied) return { error: denied };
    if (!canUseToolModule(toolName, perms, args)) {
        const required = typeof meta.module === 'string' ? meta.module : meta.module.join(', ');
        return { error: `Энэ үйлдэлд «${required}» модулийн эрх шаардлагатай — хандалт зөвшөөрөгдөөгүй.` };
    }

    let scope = UNRESTRICTED_SALES_SCOPE;
    if (meta.scoped && (toolName !== 'attach_file' || args.entity_type === 'lead')) {
        try { scope = await resolveSalesProjectScope(supabaseAdmin(), shopId, { userId, role: perms.role }); }
        catch (error) { return { error: error instanceof Error ? error.message : 'Лидийн хандалтыг шалгаж чадсангүй' }; }
    }

    // AUTO tool-ууд ч confirm=false үед preview буцаана (executor түвшний нэгдсэн хаалт).
    // Orchestrator loop тэдгээрийг confirm=true-ээр дуудаж шууд гүйцэтгэнэ.
    if (meta.auto && !confirm) {
        return { requiresConfirmation: true, action: { tool: toolName, args }, label: meta.auto, preview: args };
    }

    const result: any = await HANDLERS[toolName]({ shopId, args, confirm, scope, perms, userId, userName });

    // Audit: бодит үйлдэл хийсэн үед (confirm=true) write/delete/admin-ийг бүртгэнэ
    if (meta.kind !== 'read' && confirm) {
        await logAiAudit({ shopId, userId, tool: toolName, args, success: !(result && result.error) });
    }

    return result;
}
