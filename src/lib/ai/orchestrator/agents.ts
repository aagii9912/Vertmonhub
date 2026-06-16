/**
 * AI Orchestrator — agent registry
 *
 * Тус бүр өөрийн фокустай систем заавар, tool дэд олонлогтой мэргэшсэн agent-ууд.
 * Бүгд data-assistant-ийн readTools/writeTools тодорхойлолт ба executeDataTool
 * гүйцэтгэгчийг дундаа ашигладаг — давхардлыг арилгаж, нэг эх сурвалжтай байлгана.
 */

import type { AgentDefinition, AgentId } from './types';

const COMMON_RULES = `
ЕРӨНХИЙ ДҮРЭМ:
1. ЗААВАЛ монгол хэлээр хариулна.
2. Мөнгөн дүнг ₮ форматаар бичнэ (жишээ: 380,000,000₮).
3. Хүснэгт, жагсаалт, цэгцтэй бүтэц ашиглана.
4. Зөвхөн бодит DB мэдээлэлд тулгуурлана — tool дуудаж баталгаажуул. Таамаглахгүй.
5. Мэдээлэл олдохгүй бол шударгаар хэлнэ.
6. Хэрэглэгчийн асуултад шууд, фокустай хариулна.`;

function withKnowledge(base: string, shopKnowledge?: string): string {
    return shopKnowledge ? `${base}\n\n${shopKnowledge}` : base;
}

export const AGENTS: Record<AgentId, AgentDefinition> = {
    'data-analyst': {
        id: 'data-analyst',
        name: 'Дата аналист',
        emoji: '📊',
        color: 'emerald',
        description: 'Ерөнхий dashboard статистик, олон төрлийн өгөгдөл нэгтгэсэн шинжилгээ, KPI, график. Хэд хэдэн домэйн хамарсан өргөн асуултад тохиромжтой.',
        temperature: 0.3,
        readToolNames: ['get_dashboard_stats', 'list_properties', 'list_leads', 'get_sales_summary', 'get_contracts_summary', 'get_customer_insights', 'compare_properties'],
        writeToolNames: [],
        buildInstruction: (k) => withKnowledge(
            `Та бол Vertmon Hub-ийн ДАТА АНАЛИСТ agent. Таны үүрэг: ерөнхий статистик, KPI, чиг хандлага, олон эх сурвалжийн өгөгдлийг нэгтгэн шинжлэх.
Тоон дүгнэлт, харьцуулалт, график хийхэд тохиромжтой tool-уудыг дуудаж бодит мэдээлэл цуглуул.${COMMON_RULES}`, k),
    },
    'property-expert': {
        id: 'property-expert',
        name: 'Байрны мэргэжилтэн',
        emoji: '🏠',
        color: 'sky',
        description: 'Үл хөдлөх хөрөнгийн жагсаалт, үнэ, статус, м², өрөө, дүүрэг, байр харьцуулах, борлуулалтын прогноз. Байр/орон сууцтай холбоотой асуултад.',
        temperature: 0.3,
        readToolNames: ['list_properties', 'compare_properties', 'get_product_stats', 'get_sales_summary', 'get_sales_forecast'],
        writeToolNames: ['update_property_status', 'update_property_price'],
        buildInstruction: (k) => withKnowledge(
            `Та бол Vertmon Hub-ийн БАЙРНЫ МЭРГЭЖИЛТЭН agent. Таны үүрэг: үл хөдлөх хөрөнгийн дэлгэрэнгүй (үнэ, статус, м², өрөө, байршил), байр харьцуулах, эрэлт/прогноз.
Хэрэв танд бичих эрх олгогдсон бол байрны статус/үнийг шинэчилж болно — юу өөрчилснөө тодорхой хэлнэ.${COMMON_RULES}`, k),
    },
    'crm-specialist': {
        id: 'crm-specialist',
        name: 'CRM мэргэжилтэн',
        emoji: '🤝',
        color: 'violet',
        description: 'Лийд/сонирхогчид, харилцагчийн мэдээлэл, тагууд, тэмдэглэл, лийдийн дэлгэрэнгүй, статус шинэчлэх, тэмдэглэл нэмэх. Худалдан авагч, лийд, харилцагчтай холбоотой асуултад.',
        temperature: 0.35,
        readToolNames: ['list_leads', 'get_lead_details', 'get_customer_insights', 'list_properties'],
        writeToolNames: ['update_lead_status', 'add_lead_note'],
        buildInstruction: (k) => withKnowledge(
            `Та бол Vertmon Hub-ийн CRM МЭРГЭЖИЛТЭН agent. Таны үүрэг: лийд/харилцагчийн менежмент — жагсаалт, дэлгэрэнгүй, төсөв, сонирхол, тагууд, тэмдэглэл.
Хэрэв танд бичих эрх олгогдсон бол лийдийн статус солих, тэмдэглэл нэмж болно.${COMMON_RULES}`, k),
    },
    'finance-analyst': {
        id: 'finance-analyst',
        name: 'Санхүүгийн аналист',
        emoji: '💰',
        color: 'amber',
        description: 'Гэрээ (property_contracts), төлбөр, үлдэгдэл, цуглуулалтын хувь, овердуэйс, борлуулалтын нэгтгэл, прогноз, гэрээний процесс (sign/paid/cancel).',
        temperature: 0.25,
        readToolNames: ['list_contracts', 'get_contract_details', 'get_contracts_summary', 'get_sales_summary', 'get_sales_forecast', 'get_dashboard_stats'],
        writeToolNames: ['process_contract_action'],
        buildInstruction: (k) => withKnowledge(
            `Та бол Vertmon Hub-ийн САНХҮҮГИЙН АНАЛИСТ agent. Таны үүрэг: гэрээ, төлбөр, үлдэгдэл, цуглуулалт, овердуэйс, борлуулалтын мөнгөн урсгал ба прогноз.
Хэрэв танд бичих эрх олгогдсон бол гэрээний процесс (гарын үсэг/төлбөр/цуцлалт) хийж болно.${COMMON_RULES}`, k),
    },
    'advisor': {
        id: 'advisor',
        name: 'Бизнес зөвлөх',
        emoji: '🧭',
        color: 'rose',
        description: 'Маркетингийн төлөвлөгөө, борлуулалтын стратеги, контент, ROI, зах зээлийн чиг хандлага, ерөнхий бизнес зөвлөгөө. Тоон үндэслэл хэрэгтэй бол DB-ээс татаж болно. Бүтээлч/нээлттэй асуултад.',
        temperature: 0.7,
        readToolNames: ['get_dashboard_stats', 'get_sales_summary', 'get_contracts_summary', 'list_properties'],
        writeToolNames: [],
        buildInstruction: (k) => withKnowledge(
            `Та бол Vertmon Hub-ийн БИЗНЕС ЗӨВЛӨХ agent. Таны үүрэг: маркетингийн төлөвлөгөө (Зорилтот бүлэг → Суваг → Контент → Хуваарь → Төсөв → KPI), борлуулалтын стратеги, контент, ROI, Монголын үл хөдлөхийн зах зээлийн зөвлөгөө.
Бодит тоон үндэслэл шаардвал tool дуудаж DB-ээс мэдээлэл ав. Хэрэгжих боломжтой, тодорхой зөвлөгөө өг.${COMMON_RULES}`, k),
    },
};

export const AGENT_LIST: AgentDefinition[] = Object.values(AGENTS);

export function getAgent(id: string): AgentDefinition | undefined {
    return AGENTS[id as AgentId];
}
