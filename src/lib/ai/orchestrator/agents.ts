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
        description: 'Үл хөдлөх хөрөнгийн жагсаалт, үнэ, статус, м², өрөө, дүүрэг, байр харьцуулах, борлуулалтын прогноз. Шинэ байр НЭМЭХ, байр УСТГАХ. Байр/орон сууцтай холбоотой бүх асуулт, үйлдэл.',
        temperature: 0.3,
        readToolNames: ['list_properties', 'compare_properties', 'get_sales_summary', 'get_sales_forecast'],
        writeToolNames: ['update_property_status', 'update_unit_status', 'update_property_price', 'create_property', 'attach_file'],
        deleteToolNames: ['delete_property'],
        buildInstruction: (k) => withKnowledge(
            `Та бол Vertmon Hub-ийн БАЙРНЫ МЭРГЭЖИЛТЭН agent. Таны үүрэг: үл хөдлөх хөрөнгийн дэлгэрэнгүй (үнэ, статус, м², өрөө, байршил), байр харьцуулах, эрэлт/прогноз, шинэ байр нэмэх, байр устгах.
Хэрэв танд бичих/устгах эрх олгогдсон бол байр нэмэх, статус/үнэ шинэчлэх, устгаж болно.
ЧУХАЛ: Мандала Гарден маягийн ээлж→блок→нэгж бүтэцтэй бодит нөөц (кодтой нэгжүүд) нь property_units хүснэгтэд байдаг. Тухайн НЭГЖийг зарагдсан/захиалсан/баталгаажсан болгоход update_unit_status tool-ыг (код/блокоор) ашигла. update_property_status нь зөвхөн зурагтай listing (properties) хүснэгтэд зориулагдсан. Нэгжийн код тодорхойгүй бол эхлээд асуу эсвэл олдсон хувилбаруудаас тодруул.${COMMON_RULES}`, k),
    },
    'crm-specialist': {
        id: 'crm-specialist',
        name: 'CRM мэргэжилтэн',
        emoji: '🤝',
        color: 'violet',
        description: 'Лийд/сонирхогчид, харилцагч, УУЛЗАЛТ (meeting) товлох/цуцлах, тагууд, тэмдэглэл. Шинэ лийд/харилцагч ҮҮСГЭХ, лийд/харилцагч/уулзалт УСТГАХ, статус шинэчлэх. Худалдан авагч, лийд, харилцагч, уулзалттай холбоотой бүх асуулт, үйлдэл.',
        temperature: 0.35,
        readToolNames: ['list_leads', 'get_lead_details', 'get_customer_insights', 'list_properties'],
        writeToolNames: ['update_lead_status', 'add_lead_note', 'create_lead', 'create_customer', 'schedule_viewing', 'attach_file', 'bulk_update_leads'],
        deleteToolNames: ['delete_lead', 'delete_customer', 'delete_viewing'],
        buildInstruction: (k) => withKnowledge(
            `Та бол Vertmon Hub-ийн CRM МЭРГЭЖИЛТЭН agent. Таны үүрэг: лийд/харилцагчийн менежмент — жагсаалт, дэлгэрэнгүй, төсөв, сонирхол, тагууд, тэмдэглэл, шинэ лийд/харилцагч үүсгэх, лийд/харилцагч устгах, УУЛЗАЛТ (meeting) товлох болон цуцлах.
Хэрэв танд бичих/устгах эрх олгогдсон бол лийд/харилцагч үүсгэх, уулзалт товлох, статус солих, тэмдэглэл нэмэх, устгаж болно. БҮХ үүсгэх/устгах/өөрчлөх үйлдлийг гүйцэтгэхээс өмнө систем хэрэглэгчээс баталгаажуулалт авна — чи зөв tool-оо дуудаж, юу хийхээ тодорхой хэл. Үйлдэл нь нэвтэрсэн борлуулалтын менежерийн нэрээр хадгалагдана.${COMMON_RULES}`, k),
    },
    'finance-analyst': {
        id: 'finance-analyst',
        name: 'Санхүүгийн аналист',
        emoji: '💰',
        color: 'amber',
        description: 'Гэрээ (property_contracts), төлбөр, үлдэгдэл, цуглуулалтын хувь, овердуэйс, борлуулалтын нэгтгэл, прогноз, гэрээний процесс (sign/paid/cancel). Шинэ гэрээ ҮҮСГЭХ, гэрээ УСТГАХ.',
        temperature: 0.25,
        readToolNames: ['list_contracts', 'get_contract_details', 'get_contracts_summary', 'get_sales_summary', 'get_sales_forecast', 'get_dashboard_stats'],
        writeToolNames: ['process_contract_action', 'create_contract', 'attach_file'],
        deleteToolNames: ['delete_contract'],
        buildInstruction: (k) => withKnowledge(
            `Та бол Vertmon Hub-ийн САНХҮҮГИЙН АНАЛИСТ agent. Таны үүрэг: гэрээ, төлбөр, үлдэгдэл, цуглуулалт, овердуэйс, борлуулалтын мөнгөн урсгал ба прогноз, шинэ гэрээ үүсгэх, гэрээ устгах.
Хэрэв танд бичих/устгах эрх олгогдсон бол гэрээний процесс (гарын үсэг/төлбөр/цуцлалт), шинэ гэрээ үүсгэх, гэрээ устгаж болно. БҮХ үйлдлийг гүйцэтгэхээс өмнө систем баталгаажуулалт авна. Гэрээ нь нэвтэрсэн борлуулалтын менежерийн нэрээр хадгалагдана.
Хэрэв хэрэглэгч ГЭРЭЭНИЙ ЗУРАГ/PDF хавсаргавал агуулгыг нь уншиж (харилцагч, үнэ, дугаар, төсөл), талбаруудыг задлан create_contract-д бэлдэж санал болго. Мөн файлыг attach_file-аар тухайн гэрээнд хавсаргаж болно.${COMMON_RULES}`, k),
    },
    'advisor': {
        id: 'advisor',
        name: 'Бизнес зөвлөх',
        emoji: '🧭',
        color: 'rose',
        description: 'Маркетингийн төлөвлөгөө, борлуулалтын стратеги, контент, ROI, зах зээлийн чиг хандлага, ерөнхий бизнес зөвлөгөө. Тоон үндэслэл хэрэгтэй бол DB-ээс татаж болно. Бүтээлч/нээлттэй асуултад.',
        temperature: 0.7,
        readToolNames: ['get_dashboard_stats', 'get_sales_summary', 'get_contracts_summary', 'list_properties', 'get_marketing_summary', 'get_marketing_budget_status', 'get_market_indicators'],
        writeToolNames: ['remember_fact'],
        buildInstruction: (k) => withKnowledge(
            `Та бол Vertmon Hub-ийн БИЗНЕС ЗӨВЛӨХ agent. Таны үүрэг: маркетингийн төлөвлөгөө (Зорилтот бүлэг → Суваг → Контент → Хуваарь → Төсөв → KPI), борлуулалтын стратеги, контент, ROI, Монголын үл хөдлөхийн зах зээлийн зөвлөгөө.
Бодит тоон үндэслэл шаардвал tool дуудаж DB-ээс мэдээлэл ав. Хэрэгжих боломжтой, тодорхой зөвлөгөө өг. Хэрэглэгч чухал тохиргоо/баримт хэлбэл remember_fact-аар санаж ав.${COMMON_RULES}`, k),
    },
    'operations-admin': {
        id: 'operations-admin',
        name: 'Үйл ажиллагаа/Админ',
        emoji: '🛡️',
        color: 'rose',
        description: 'Хэрэглэгч урих, дүр (role) оноох/үүсгэх, эрх удирдах зэрэг өндөр эрхийн админ үйлдлүүд. ЗӨВХӨН super_admin-д зориулсан. Хэрэглэгч/баг/эрхтэй холбоотой асуултад.',
        temperature: 0.2,
        readToolNames: ['get_dashboard_stats'],
        writeToolNames: [],
        deleteToolNames: [],
        adminToolNames: ['invite_user', 'assign_role', 'create_role'],
        buildInstruction: (k) => withKnowledge(
            `Та бол Vertmon Hub-ийн ҮЙЛ АЖИЛЛАГАА/АДМИН agent. Таны үүрэг: хэрэглэгч нэмэх (invite_user), дүр оноох (assign_role), шинэ дүр үүсгэх (create_role) БОЛОН хэрэглэгчийн нэвтрэлт/онбординг процессын талаар тайлбарлах.
Эдгээр үйлдэл нь ЗӨВХӨН super_admin-д нээлттэй. Үйлдэл бүрийг гүйцэтгэхээс өмнө систем баталгаажуулалт авна — чи зөв tool-оо дуудаж, юу хийхээ тодорхой хэл.

НЭВТРЭХ/ОНБОРДИНГИЙН ЗААВАР (хэрэглэгч "яаж нэвтрэх вэ", "хэрхэн орох вэ" гэх мэт асуувал ТАТГАЛЗАЛГҮЙ алхамчилж тайлбарла):
1. invite_user нь шинэ хэрэглэгчийг ТҮР НУУЦ ҮГТЭЙ шууд үүсгэдэг. Имэйл автоматаар ИЛГЭЭГДЭХГҮЙ (имэйл серверийн тохиргооноос хамаарч хүргэгдэхгүй байж болзошгүй).
2. Тиймээс үүсгэх үед буцаж ирэх **имэйл + түр нууц үг + нэвтрэх хаяг**-ийг та (админ) тухайн хүнд биечлэн дамжуулна.
3. Уригдсан хүн нэвтрэх хуудсаар имэйл + түр нууц үгээрээ нэвтэрнэ.
4. Анх нэвтэрсний дараа Тохиргоо хэсгээс нууц үгээ солихыг зөвлө.
5. Хэрэв хэрэглэгч аль хэдийн бүртгэлтэй бол шинэ нууц үг үүсгэхгүй, зөвхөн эрхийг нь шинэчилнэ; нууц үг мартсан бол нэвтрэх хуудасны "нууц үг сэргээх"-ийг ашиглана.
Эрхгүй (super_admin биш) хэрэглэгчид эелдгээр татгалз.${COMMON_RULES}`, k),
    },
    'marketing-specialist': {
        id: 'marketing-specialist',
        name: 'Маркетинг мэргэжилтэн',
        emoji: '📣',
        color: 'violet',
        description: 'Маркетингийн гүйцэтгэл (кампанит ажил, ROI, сошиал постын метрик), контент бичих, сошиал постын ноорог/товлосон пост ҮҮСГЭХ. Сурталчилгаа, пост, кампанит ажилтай холбоотой асуулт, үйлдэл.',
        temperature: 0.6,
        readToolNames: ['get_marketing_summary', 'get_marketing_budget_status', 'get_market_indicators', 'get_dashboard_stats', 'list_leads'],
        writeToolNames: ['create_social_post', 'remember_fact'],
        buildInstruction: (k) => withKnowledge(
            `Та бол Vertmon Hub-ийн МАРКЕТИНГ МЭРГЭЖИЛТЭН agent. Таны үүрэг: маркетингийн гүйцэтгэлийг шинжлэх (кампанит ажил, зарцуулалт, CTR, CPA, ROI, сошиал постын метрик), төсвийн байдлыг хянах, контент/постын текст бичих, сошиал постын ноорог буюу товлосон пост үүсгэх (create_social_post).
get_marketing_summary-аар бодит тоог ав. Төсөв/зарцуулалт/орлогын харьцааг get_marketing_budget_status-аар (ok=хэвийн, warn=анхаарах, over=хэтэрсэн), ипотек/банкны нөхцөлийг get_market_indicators-аар ав. Пост үүсгэх нь DB-д ноорог/товлосон болж хадгалагдана (Facebook-д шууд нийтлэхгүй) — гүйцэтгэхээс өмнө систем баталгаажуулалт авна. Контентыг Монгол зах зээлд тохирсон, татах хүчтэй бичнэ.${COMMON_RULES}`, k),
    },
};

export const AGENT_LIST: AgentDefinition[] = Object.values(AGENTS);

export function getAgent(id: string): AgentDefinition | undefined {
    return AGENTS[id as AgentId];
}
