/**
 * AI Orchestrator-ийн mutating tool-уудын эрсдэлийн түвшин (CLIENT-safe).
 *
 * ⚠️ src/lib/ai/data-assistant/tools.ts-ийг client component-д импортлож БОЛОХГҮЙ —
 * тэр нь `@google/generative-ai` (SchemaType)-г татаж client bundle-ийг хөөрөгдөнө.
 * Тиймээс энд tool нэрсийг plain string хуулбараар зарлана. `__tests__/riskTiers.test.ts`
 * нь эдгээрийг жинхэнэ tools.ts массивтай тэнцүү эсэхийг шалгаж drift-ээс сэргийлнэ.
 */

export type RiskTier = 'safe' | 'danger' | 'admin';

/** Бичих (WRITE) — шинэ бичлэг үүсгэх, шинэчлэх. tools.ts → WRITE_TOOL_NAMES-ийн хуулбар. */
export const WRITE_TOOLS: string[] = [
    'update_property_status', 'update_property_price', 'update_lead_status', 'add_lead_note',
    'process_contract_action', 'create_property', 'create_lead', 'create_customer',
    'schedule_viewing', 'create_contract', 'attach_file', 'bulk_update_leads',
    'create_social_post', 'remember_fact',
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
const NON_REMEMBERABLE = new Set<string>(['bulk_update_leads', 'process_contract_action']);

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
