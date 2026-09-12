/**
 * Vertmon AI Data Assistant — tool гүйцэтгэгч (provider-independent)
 *
 * Orchestrator (Claude) tool дуудлагыг энд гүйцэтгэнэ: RBAC шалгалт → data функц → audit.
 * Tool тодорхойлолт ./tools.ts, data функцууд ./functions.ts. Модель дуудлага ЭНД БАЙХГҮЙ.
 */

import { logger } from '@/lib/utils/logger';
import { WRITE_TOOL_NAMES, DELETE_TOOL_NAMES, ADMIN_TOOL_NAMES } from './tools';
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
import { logCall, setFollowup, assignLeadManager, listViewingsTool, recordViewingOutcome, rescheduleViewing, listMyTasks, createTaskTool, completeTaskTool, listContractPayments, addContractPayment, markPaymentPaid } from './actions';

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
        case 'log_call': result = await logCall(shopId, args, userId, userName); break;
        case 'set_followup': result = await setFollowup(shopId, args, userId, userName); break;
        case 'assign_lead_manager': result = await assignLeadManager(shopId, args, confirm, userId, userName); break;
        case 'record_viewing_outcome': result = await recordViewingOutcome(shopId, args, userId, userName); break;
        case 'reschedule_viewing': result = await rescheduleViewing(shopId, args, confirm, userId, userName); break;
        case 'create_task': result = await createTaskTool(shopId, args, userId); break;
        case 'complete_task': result = await completeTaskTool(shopId, args, userId); break;
        case 'add_contract_payment': result = await addContractPayment(shopId, args, confirm); break;
        case 'mark_payment_paid': result = await markPaymentPaid(shopId, args, confirm); break;
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
