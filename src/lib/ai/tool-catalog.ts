/**
 * Dashboard AI туслахын data tool-уудын НЭГ бүртгэл (client-safe — SDK импортгүй).
 * Эрхийн төрөл, модуль, AUTO, «үргэлж баталгаажуулах», төслийн хүрээ зөвхөн энд
 * тодорхойлогдож, бусад жагсаалт эндээс гарна. Шинэ tool: энд мөр нэмээд
 * `data-assistant/tools.ts`-д schema, `data-assistant/index.ts`-д handler (тест гурвыг тулгана).
 */

export type ToolKind = 'read' | 'write' | 'delete' | 'admin';

interface ToolMeta {
    kind: ToolKind;
    /** API-тай ижил модулийн шаардлага (массив = аль нэг нь). */
    module: string | readonly string[];
    /** Буцаах боломжтой, эрсдэл багатай бичих tool — картгүй шууд гүйцэтгэгдэж audit бичигдэнэ (идэвхийн нэр). */
    auto?: string;
    /** Мөнгө, нөөц, олон бичлэгт нөлөөлөх тул «энэ session-д үргэлж зөвшөөрөх»-д цээжлэгдэхгүй. */
    alwaysConfirm?: true;
    /** Борлуулалтын менежерийн төслийн хүрээг (`applyLeadScope`) шаардана. */
    scoped?: true;
}

/** attach_file гүйцэтгэхэд хавсаргах entity-ийн модулийг дахин шалгана. */
const ATTACHMENT_MODULE = { property: 'properties', lead: 'leads', customer: 'customers', contract: 'contracts' } as const;

const ENTRIES = {
    // Тайлан
    get_dashboard_stats: { kind: 'read', module: 'dashboard', scoped: true },
    get_operations_report: { kind: 'read', module: 'reports', scoped: true },
    get_kpi_report: { kind: 'read', module: 'reports', scoped: true },
    get_manager_activity: { kind: 'read', module: 'reports', scoped: true },
    get_daily_report: { kind: 'read', module: ['reports', 'dashboard'], scoped: true },
    get_weekly_sales_report: { kind: 'read', module: 'reports' },
    import_erp_file: { kind: 'write', module: 'erp-imports', alwaysConfirm: true },
    get_manager_performance: { kind: 'read', module: 'reports' },
    get_export_link: { kind: 'read', module: 'reports' },
    get_sales_summary: { kind: 'read', module: 'reports' },
    get_sales_forecast: { kind: 'read', module: 'reports' },
    // Байр
    list_properties: { kind: 'read', module: 'properties' },
    compare_properties: { kind: 'read', module: 'properties' },
    update_property_status: { kind: 'write', module: 'properties' },
    update_unit_status: { kind: 'write', module: 'properties' },
    update_unit: { kind: 'write', module: 'properties' },
    update_property_price: { kind: 'write', module: 'properties', alwaysConfirm: true },
    create_property: { kind: 'write', module: 'properties', alwaysConfirm: true },
    delete_property: { kind: 'delete', module: 'properties' },
    // Лид
    list_lead_projects: { kind: 'read', module: ['leads', 'viewings'], scoped: true },
    list_lead_categories: { kind: 'read', module: ['leads', 'reports-leads'] },
    list_leads: { kind: 'read', module: 'leads', scoped: true },
    get_lead_details: { kind: 'read', module: 'leads', scoped: true },
    update_lead_status: { kind: 'write', module: 'leads', scoped: true },
    update_lead: { kind: 'write', module: 'leads', scoped: true },
    add_lead_note: { kind: 'write', module: 'leads', scoped: true, auto: 'Тэмдэглэл нэмэх' },
    create_lead: { kind: 'write', module: 'leads', scoped: true },
    bulk_update_leads: { kind: 'write', module: 'leads', scoped: true, alwaysConfirm: true },
    log_call: { kind: 'write', module: 'leads', scoped: true, auto: 'Дуудлага бүртгэх' },
    set_followup: { kind: 'write', module: 'leads', scoped: true, auto: 'Follow-up тавих' },
    log_price_quote: { kind: 'write', module: 'leads', scoped: true, alwaysConfirm: true },
    set_lead_category: { kind: 'write', module: 'leads', scoped: true, auto: 'Ангилал тавих' },
    assign_lead_manager: { kind: 'write', module: 'leads', scoped: true },
    delete_lead: { kind: 'delete', module: 'leads', scoped: true },
    // Харилцагч, Inbox
    get_customer_insights: { kind: 'read', module: 'customers', scoped: true },
    create_customer: { kind: 'write', module: 'customers' },
    update_customer: { kind: 'write', module: 'customers' },
    add_customer_tag: { kind: 'write', module: 'customers', auto: 'Таг нэмэх' },
    remove_customer_tag: { kind: 'write', module: 'customers', auto: 'Таг хасах' },
    merge_customers: { kind: 'write', module: 'customers', scoped: true, alwaysConfirm: true },
    delete_customer: { kind: 'delete', module: 'customers' },
    list_conversations: { kind: 'read', module: 'inbox' },
    get_conversation: { kind: 'read', module: 'inbox' },
    reply_to_customer: { kind: 'write', module: 'inbox', alwaysConfirm: true },
    // Уулзалт
    list_viewings: { kind: 'read', module: 'viewings', scoped: true },
    get_viewing_options: { kind: 'read', module: 'viewings', scoped: true },
    calculate_viewing_quote: { kind: 'read', module: 'viewings', scoped: true },
    update_viewing: { kind: 'write', module: 'viewings', scoped: true, alwaysConfirm: true },
    schedule_viewing: { kind: 'write', module: 'viewings', scoped: true },
    record_viewing_outcome: { kind: 'write', module: 'viewings', scoped: true, auto: 'Уулзалтын үр дүн' },
    reschedule_viewing: { kind: 'write', module: 'viewings', scoped: true },
    delete_viewing: { kind: 'delete', module: 'viewings', scoped: true },
    // Гэрээ, төлбөр
    list_contracts: { kind: 'read', module: 'contracts' },
    get_contract_details: { kind: 'read', module: 'contracts' },
    get_contracts_summary: { kind: 'read', module: 'contracts' },
    list_contract_payments: { kind: 'read', module: 'contracts' },
    process_contract_action: { kind: 'write', module: 'contracts', scoped: true, alwaysConfirm: true },
    create_contract: { kind: 'write', module: 'contracts', scoped: true, alwaysConfirm: true },
    transfer_contract: { kind: 'write', module: 'contracts', scoped: true, alwaysConfirm: true },
    add_contract_payment: { kind: 'write', module: 'contracts', alwaysConfirm: true },
    mark_payment_paid: { kind: 'write', module: 'contracts', alwaysConfirm: true },
    delete_contract: { kind: 'delete', module: 'contracts' },
    // Хувийн ажил
    get_weekly_updates: { kind: 'read', module: 'dashboard' },
    save_weekly_update: { kind: 'write', module: 'dashboard' },
    list_my_tasks: { kind: 'read', module: 'dashboard' },
    create_task: { kind: 'write', module: 'dashboard', auto: 'Ажил нэмэх' },
    complete_task: { kind: 'write', module: 'dashboard', auto: 'Ажил дуусгах' },
    // Маркетинг
    get_marketing_performance: { kind: 'read', module: 'marketing-roi', scoped: true },
    get_marketing_summary: { kind: 'read', module: 'marketing-roi' },
    get_marketing_budget_status: { kind: 'read', module: 'marketing-roi' },
    get_market_indicators: { kind: 'read', module: 'marketing-roi' },
    list_marketing_spend: { kind: 'read', module: 'marketing-roi' },
    log_marketing_spend: { kind: 'write', module: 'marketing-roi' },
    set_marketing_budget: { kind: 'write', module: 'marketing-roi', alwaysConfirm: true },
    add_market_indicator: { kind: 'write', module: 'marketing-roi', auto: 'Зах зээлийн үзүүлэлт' },
    create_social_post: { kind: 'write', module: 'marketing-roi' },
    // Хавсралт (зөвхөн лидэд хавсаргахад төслийн хүрээ шалгана), shop-ийн санах ой
    attach_file: { kind: 'write', module: Object.values(ATTACHMENT_MODULE), scoped: true },
    remember_fact: { kind: 'write', module: 'ai-settings', auto: 'Санах' },
    // Админ (зөвхөн super_admin)
    invite_user: { kind: 'admin', module: 'settings' },
    assign_role: { kind: 'admin', module: 'settings' },
    create_role: { kind: 'admin', module: 'settings' },
    set_user_projects: { kind: 'admin', module: 'settings' },
    set_sales_target: { kind: 'admin', module: 'settings', alwaysConfirm: true },
} satisfies Record<string, ToolMeta>;

export type ToolName = keyof typeof ENTRIES;
export const TOOL_CATALOG: Readonly<Record<ToolName, ToolMeta>> = ENTRIES;
const TOOL_NAMES = Object.keys(TOOL_CATALOG) as ToolName[];

export function isCatalogTool(name: string): name is ToolName {
    return Object.hasOwn(TOOL_CATALOG, name);
}

const namesWhere = (test: (meta: ToolMeta) => boolean): readonly string[] => TOOL_NAMES.filter((name) => test(TOOL_CATALOG[name]));
export const WRITE_TOOL_NAMES = namesWhere((meta) => meta.kind === 'write');
export const DELETE_TOOL_NAMES = namesWhere((meta) => meta.kind === 'delete');
export const ADMIN_TOOL_NAMES = namesWhere((meta) => meta.kind === 'admin');
/** Бодит өгөгдөл өөрчилдөг (баталгаажуулалт шаардах) бүх tool. */
export const MUTATING_TOOL_NAMES = namesWhere((meta) => meta.kind !== 'read');
export const AUTO_TOOL_NAMES = namesWhere((meta) => !!meta.auto);

export function isMutatingTool(name: string): boolean {
    return isCatalogTool(name) && TOOL_CATALOG[name].kind !== 'read';
}

/** Эрхийн төрлөөр хориглох шалтгаан: бичих → canWrite, устгах → canDelete, админ → super_admin. */
export function toolKindDenial(kind: ToolKind, perms: { canWrite: boolean; canDelete: boolean; role: string }): string | null {
    if (kind === 'write' && !perms.canWrite) return 'Энэ үйлдлийг хийх эрх танд алга (бичих эрх шаардлагатай).';
    if (kind === 'delete' && !perms.canDelete) return 'Энэ үйлдлийг хийх эрх танд алга (устгах эрх шаардлагатай).';
    if (kind === 'admin' && perms.role !== 'super_admin') return 'Энэ үйлдлийг зөвхөн super_admin хийх боломжтой.';
    return null;
}

/** Модулийн шалгалт — model-д харуулах жагсаалт ба бодит executor хоёул ашиглана. Бүртгэлгүй tool хориотой. */
export function canUseToolModule(tool: string, perms: { role: string; modules?: string[] }, args?: Record<string, unknown>): boolean {
    if (!isCatalogTool(tool)) return false;
    let required = TOOL_CATALOG[tool].module;
    if (tool === 'attach_file' && args) {
        const entityType = String(args.entity_type || '');
        if (!Object.hasOwn(ATTACHMENT_MODULE, entityType)) return false;
        required = ATTACHMENT_MODULE[entityType as keyof typeof ATTACHMENT_MODULE];
    }
    if (perms.role === 'super_admin') return true;
    return (typeof required === 'string' ? [required] : required).some((module) => perms.modules?.includes(module));
}

/** «Энэ session-д үргэлж зөвшөөрөх» боломжтой эсэх: зөвхөн бичих tool, өндөр нөлөөтэйг хасна. */
export function canRememberTool(tool: string): boolean {
    return isCatalogTool(tool) && TOOL_CATALOG[tool].kind === 'write' && !TOOL_CATALOG[tool].alwaysConfirm;
}

/** Нэрсийн жагсаалтыг эрхийн төрлөөр бүлэглэнэ (агентын жагсаалт харуулахад). */
export function groupToolsByKind(names: readonly string[]): Record<ToolKind, string[]> {
    const groups: Record<ToolKind, string[]> = { read: [], write: [], delete: [], admin: [] };
    for (const name of names) if (isCatalogTool(name)) groups[TOOL_CATALOG[name].kind].push(name);
    return groups;
}
