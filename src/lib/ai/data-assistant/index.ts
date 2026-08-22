/**
 * Vertmon AI Data Assistant — Gemini Powered
 * 
 * Internal staff assistant that can query ALL Vertmon business data:
 * - Properties, Leads, Customers, Orders, Products
 * - Dashboard Stats, Property Viewings
 * 
 * Handler + Executor only. Tool definitions in ./tools.ts, data functions in ./functions.ts
 */

import { logger } from '@/lib/utils/logger';
import { WRITE_TOOL_NAMES, DELETE_TOOL_NAMES, ADMIN_TOOL_NAMES, TOOL_MODULE_MAP } from './tools';
import { MODULE_LABELS } from '@/lib/rbac';
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
import {
    getMyDay, listMyLeads, listViewings,
    updateViewing, completeViewing, logActivity,
    setLeadFollowup, reassignLead, createTask, completeTask,
} from './manager-functions';
import { getTeamActivity, getManagerProgress, getAnomalies } from './oversight-functions';

/** AI Assistant-ийн RBAC эрхүүд (route-аас тооцоолж дамжуулна). */
export interface AssistantPerms {
    canWrite: boolean;
    canDelete: boolean;
    role: string;
    /**
     * Хэрэглэгчийн модулийн эрхүүд (rbac.ts). ЗААВАЛ дамжуулна —
     * өмнө нь AI зам `permissions.modules`-ыг ОГТ шалгадаггүй байсан тул
     * маркетингийн ролийн хэрэглэгч чатаар гэрээ/санхүүгийн дата уншиж чаддаг
     * байв (хажуугийн цэс нуудаг ч AI нээлттэй байсан).
     * Тодорхойгүй (undefined) бол хуучин зан төлөв — шалгахгүй өнгөрүүлнэ.
     */
    modules?: string[];
}

/**
 * Tool-д шаардлагатай модулийн эрхийг шалгана.
 * super_admin бүх зүйлд хандана. `modules` дамжуулаагүй (хуучин дуудагч) бол
 * шалгалт хийхгүй — регресс үүсгэхгүйн тулд.
 */
function checkToolModule(toolName: string, perms: AssistantPerms): { error: string } | null {
    if (perms.role === 'super_admin') return null;
    if (!perms.modules) return null;

    const required = TOOL_MODULE_MAP[toolName];
    if (!required || required.length === 0) return null;

    const has = required.some((m) => perms.modules!.includes(m));
    if (has) return null;

    const labels = required.map((m) => MODULE_LABELS[m]?.mn || m).join(' / ');
    return { error: `Энэ мэдээлэлд хандах эрх танд алга (${labels}). Админаас эрхээ шалгуулна уу.` };
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

    // Модулийн эрх — хажуугийн цэстэй ИЖИЛ дүрэм AI зам дээр ч мөрдөгдөнө.
    const moduleDenial = checkToolModule(toolName, perms);
    if (moduleDenial) return moduleDenial;

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
        // ---- Менежерийн өдрийн ажил (унших) — userName = каноник менежерийн нэр ----
        case 'get_my_day': result = await getMyDay(shopId, userName, userId); break;
        case 'list_my_leads': result = await listMyLeads(shopId, userName, args); break;
        case 'list_viewings': result = await listViewings(shopId, userName, args); break;
        // ---- Удирдлагын хяналт (зөвхөн унших) ----
        case 'get_team_activity': result = await getTeamActivity(shopId, args); break;
        case 'get_manager_progress': result = await getManagerProgress(shopId, args); break;
        case 'get_anomalies': result = await getAnomalies(shopId, args); break;
        case 'update_property_status': result = await updatePropertyStatus(shopId, args); break;
        case 'update_unit_status': result = await updateUnitStatus(shopId, args); break;
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
        // ---- Менежерийн өдрийн ажил (бичих, confirm-gated) ----
        case 'log_activity': result = await logActivity(shopId, args, confirm, userId, userName); break;
        case 'update_viewing': result = await updateViewing(shopId, args, confirm, userName); break;
        case 'complete_viewing': result = await completeViewing(shopId, args, confirm, userName); break;
        case 'set_lead_followup': result = await setLeadFollowup(shopId, args, confirm, userName); break;
        case 'reassign_lead': result = await reassignLead(shopId, args, confirm, userName); break;
        case 'create_task': result = await createTask(shopId, args, confirm, userId); break;
        case 'complete_task': result = await completeTask(shopId, args, confirm, userId); break;
        case 'get_marketing_summary': result = await fetchMarketingSummary(shopId, args); break;
        case 'get_marketing_budget_status': result = await fetchMarketingBudgetStatus(shopId, args); break;
        case 'get_market_indicators': result = await fetchMarketIndicators(shopId); break;
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
