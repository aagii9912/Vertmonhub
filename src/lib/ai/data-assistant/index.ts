/**
 * Vertmon AI Data Assistant — tool гүйцэтгэгч (provider-independent)
 *
 * Orchestrator (Claude) tool дуудлагыг энд гүйцэтгэнэ: RBAC шалгалт → data функц → audit.
 * Tool тодорхойлолт ./tools.ts, data функцууд ./functions.ts. Модель дуудлага ЭНД БАЙХГҮЙ.
 */

import { logger } from '@/lib/utils/logger';
import { WRITE_TOOL_NAMES, DELETE_TOOL_NAMES, ADMIN_TOOL_NAMES, TOOL_MODULE, AUTO_TOOL_NAMES } from './tools';

const AUTO_SET = new Set(AUTO_TOOL_NAMES);
const AUTO_LABELS: Record<string, string> = {
    add_lead_note: 'Тэмдэглэл нэмэх', remember_fact: 'Санах', log_call: 'Дуудлага бүртгэх', set_followup: 'Follow-up тавих', record_viewing_outcome: 'Уулзалтын үр дүн',
    create_task: 'Ажил нэмэх', complete_task: 'Ажил дуусгах', add_customer_tag: 'Таг нэмэх', remove_customer_tag: 'Таг хасах', set_customer_ai_pause: 'AI зогсоох/сэргээх', add_market_indicator: 'Зах зээлийн үзүүлэлт',
};
import { logAiAudit } from './audit';
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
    generateChartConfig,
} from './functions';
import { inviteUser, assignRole, createRole } from './admin-functions';
import { getKpiReport, getManagerPerformanceTool, getExportLink, customerTag, customerAiPause, replyCustomer, mergeCustomersTool, logSpend, setBudget, listSpend, addIndicator, financeSummaryTool, listTransactionsTool, addTransactionTool, listBillsTool, payBillTool } from './actions2';
import { logCall, setFollowup, assignLeadManager, listViewingsTool, recordViewingOutcome, rescheduleViewing, listMyTasks, createTaskTool, completeTaskTool, listContractPayments, addContractPayment, markPaymentPaid } from './actions';

/** AI Assistant-ийн RBAC эрхүүд (route-аас тооцоолж дамжуулна). */
export interface AssistantPerms {
    canWrite: boolean;
    canDelete: boolean;
    role: string;
    /** Хэрэглэгчийн нээлттэй модулиуд (RBAC). Өгөгдөөгүй бол модулийн шалгалт хийхгүй (хуучин дуудагч). */
    modules?: string[];
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
    const requiredModule = TOOL_MODULE[toolName];
    if (requiredModule && perms.modules && !perms.modules.includes(requiredModule) && perms.role !== 'super_admin') {
        return { error: `Энэ үйлдэлд «${requiredModule}» модулийн эрх шаардлагатай — танд алга.` };
    }

    // AUTO tool-ууд ч confirm=false үед preview буцаана (executor түвшний нэгдсэн хаалт).
    // Orchestrator loop тэдгээрийг confirm=true-ээр дуудаж шууд гүйцэтгэнэ (AUTO_TOOL_NAMES).
    if (AUTO_SET.has(toolName) && !confirm) {
        return { requiresConfirmation: true, action: { tool: toolName, args }, label: AUTO_LABELS[toolName] || toolName, preview: args };
    }

    let result: any;
    switch (toolName) {
        case 'get_dashboard_stats': result = await fetchDashboardStats(shopId, args.timeRange || 'month'); break;
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
        // Mutating (баталгаажуулалт шаардах) — confirm-gated. userName = борлуулалтын менежер.
        // Бүх write tool confirm=false үед preview буцаана (2026-09: өмнө нь доорх 6 нь шууд ажилладаг байв).
        case 'update_property_status': result = await updatePropertyStatus(shopId, args, confirm); break;
        case 'update_unit_status': result = await updateUnitStatus(shopId, args, confirm); break;
        case 'update_property_price': result = await updatePropertyPrice(shopId, args, confirm); break;
        case 'update_lead_status': result = await updateLeadStatus(shopId, args, confirm); break;
        case 'add_lead_note': result = await addLeadNote(shopId, args, confirm); break;
        case 'process_contract_action': result = await processContractAction(shopId, args, confirm); break;
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
        case 'get_marketing_budget_status': result = await fetchMarketingBudgetStatus(shopId, args); break;
        case 'get_market_indicators': result = await fetchMarketIndicators(shopId); break;
        case 'create_social_post': result = await createSocialPost(shopId, args, confirm, userName); break;
        case 'remember_fact': result = await rememberFact(shopId, args, confirm, userName); break;
        // Wave 1 — өдөр тутмын үйлдлүүд (service давхаргаар)
        case 'list_viewings': result = await listViewingsTool(shopId, args); break;
        case 'list_my_tasks': result = await listMyTasks(shopId, args, userId); break;
        case 'list_contract_payments': result = await listContractPayments(shopId, args); break;
        case 'log_call': result = await logCall(shopId, args, userId, userName); break; // confirm: AUTO хаалт дээр
        case 'set_followup': result = await setFollowup(shopId, args, userId, userName); break; // confirm: AUTO хаалт дээр
        case 'assign_lead_manager': result = await assignLeadManager(shopId, args, confirm, userId, userName); break;
        case 'record_viewing_outcome': result = await recordViewingOutcome(shopId, args, userId, userName); break; // confirm: AUTO хаалт дээр
        case 'reschedule_viewing': result = await rescheduleViewing(shopId, args, confirm, userId, userName); break;
        case 'create_task': result = await createTaskTool(shopId, args, userId); break; // confirm: AUTO хаалт дээр
        case 'complete_task': result = await completeTaskTool(shopId, args, userId); break; // confirm: AUTO хаалт дээр
        case 'add_contract_payment': result = await addContractPayment(shopId, args, confirm); break;
        case 'mark_payment_paid': result = await markPaymentPaid(shopId, args, confirm); break;
        // Wave 2–4 — менежер / харилцагч / маркетинг / санхүү
        case 'get_kpi_report': result = await getKpiReport(shopId, args, userId, perms); break;
        case 'get_manager_performance': result = await getManagerPerformanceTool(shopId); break;
        case 'get_export_link': result = await getExportLink(shopId, args); break;
        case 'add_customer_tag': result = await customerTag(shopId, args, false); break; // confirm: AUTO хаалт дээр
        case 'remove_customer_tag': result = await customerTag(shopId, args, true); break; // confirm: AUTO хаалт дээр
        case 'set_customer_ai_pause': result = await customerAiPause(shopId, args); break; // confirm: AUTO хаалт дээр
        case 'reply_to_customer': result = await replyCustomer(shopId, args, confirm); break;
        case 'merge_customers': result = await mergeCustomersTool(shopId, args, confirm); break;
        case 'log_marketing_spend': result = await logSpend(shopId, args, confirm, userId); break;
        case 'set_marketing_budget': result = await setBudget(shopId, args, confirm); break;
        case 'list_marketing_spend': result = await listSpend(shopId, args); break;
        case 'add_market_indicator': result = await addIndicator(shopId, args); break; // confirm: AUTO хаалт дээр
        case 'get_finance_summary': result = await financeSummaryTool(shopId); break;
        case 'list_finance_transactions': result = await listTransactionsTool(shopId, args); break;
        case 'add_finance_transaction': result = await addTransactionTool(shopId, args, confirm); break;
        case 'list_vendor_bills': result = await listBillsTool(shopId, args); break;
        case 'pay_vendor_bill': result = await payBillTool(shopId, args, confirm); break;
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
