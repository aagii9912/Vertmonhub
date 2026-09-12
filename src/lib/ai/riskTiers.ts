/**
 * AI Orchestrator-ийн mutating tool-уудын эрсдэлийн түвшин (CLIENT-safe).
 *
 * src/lib/ai/data-assistant/tools.ts том тул client bundle-д татахгүйн тулд
 * tool нэрсийг plain string хуулбараар зарлана. `__tests__/riskTiers.test.ts`
 * нь эдгээрийг жинхэнэ tools.ts массивтай тэнцүү эсэхийг шалгаж drift-ээс сэргийлнэ.
 */

export type RiskTier = 'safe' | 'danger' | 'admin';

/** Бичих (WRITE) — шинэ бичлэг үүсгэх, шинэчлэх. tools.ts → WRITE_TOOL_NAMES-ийн хуулбар. */
export const WRITE_TOOLS: string[] = [
    'update_property_status', 'update_unit_status', 'update_property_price', 'update_lead_status', 'add_lead_note',
    'process_contract_action', 'create_property', 'create_lead', 'create_customer',
    'schedule_viewing', 'create_contract', 'attach_file', 'bulk_update_leads',
    'create_social_post', 'remember_fact',
    'log_call', 'set_followup', 'assign_lead_manager', 'record_viewing_outcome', 'reschedule_viewing', 'create_task', 'complete_task', 'add_contract_payment', 'mark_payment_paid',
    'add_customer_tag', 'remove_customer_tag', 'set_customer_ai_pause', 'reply_to_customer', 'merge_customers', 'log_marketing_spend', 'set_marketing_budget', 'add_market_indicator', 'add_finance_transaction', 'pay_vendor_bill',
];

/** Устгах (soft delete). tools.ts → DELETE_TOOL_NAMES-ийн хуулбар. */
export const DELETE_TOOLS: string[] = [
    'delete_property', 'delete_lead', 'delete_viewing', 'delete_contract', 'delete_customer',
];

/** Админ — эрх, дүр, хэрэглэгч. tools.ts → ADMIN_TOOL_NAMES-ийн хуулбар. */
export const ADMIN_TOOLS: string[] = ['invite_user', 'assign_role', 'create_role'];

/**
 * "Энэ session-д үргэлж зөвшөөрөх" боломжгүй WRITE tool-ууд — олон бичлэг/санхүүд
 * өндөр нөлөөтэй тул тэдгээрийг үргэлж гараар баталгаажуулна.
 */
const NON_REMEMBERABLE = new Set<string>([
    'bulk_update_leads', 'process_contract_action',
    // Санхүү/нөөцөд шууд нөлөөлдөг тул үргэлж гараар баталгаажуулна (2026-09 review).
    'update_property_price', 'create_contract', 'create_property',
    'add_contract_payment', 'mark_payment_paid', 'merge_customers', 'reply_to_customer', 'add_finance_transaction', 'pay_vendor_bill', 'set_marketing_budget',
]);

const DELETE_SET = new Set<string>(DELETE_TOOLS);
const ADMIN_SET = new Set<string>(ADMIN_TOOLS);
const WRITE_SET = new Set<string>(WRITE_TOOLS);

/** Tool-ийн эрсдэлийн түвшинг буцаана. */
export function getRiskTier(tool: string): RiskTier {
    if (DELETE_SET.has(tool)) return 'danger';
    if (ADMIN_SET.has(tool)) return 'admin';
    return 'safe';
}

/**
 * Тухайн tool-ыг "энэ session-д үргэлж зөвшөөрөх"-д цээжилж болох эсэх.
 * ЗӨВХӨН WRITE tool (устгах/админ хэзээ ч биш), тэр дундаа өндөр нөлөөтэйг хасна.
 */
export function canRememberTool(tool: string): boolean {
    return WRITE_SET.has(tool) && !NON_REMEMBERABLE.has(tool);
}
