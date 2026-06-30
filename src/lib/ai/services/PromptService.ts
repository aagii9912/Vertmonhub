/**
 * PromptService - Vertmon Hub Real Estate AI
 * Builds system prompts for Real Estate Agent persona
 */

import type { ChatContext } from '@/types/ai';
import { formatMemoryForPrompt } from '../tools/memory';
import { logger } from '@/lib/utils/logger';

/**
 * Динамик хэсгүүдийн тэмдэгтийн дээд хязгаар (token budget).
 * Олон үл хөдлөх/FAQ/тусгай мэдээлэл prompt-ыг хэт томруулж model-ийн
 * контекстийг дүүргэхээс сэргийлнэ (~4 тэмдэгт ≈ 1 token гэж тооцов).
 */
export const SECTION_CHAR_LIMITS = {
    properties: 6000,
    faqs: 4000,
    knowledge: 4000,
} as const;

/**
 * Хэсгийг тэмдэгтийн төсөвт багтаах. Хэтэрвэл таслаж, тэмдэглэгээ нэмж,
 * лог-д анхааруулга бичнэ.
 */
export function clampSection(content: string, maxChars: number, label: string): string {
    if (content.length <= maxChars) return content;
    logger.warn(`Prompt section truncated to fit token budget`, { label, original: content.length, maxChars });
    return content.slice(0, maxChars) + `\n…(${label} хэтэрсэн тул таслав)`;
}

/**
 * Tool-уудын монгол тайлбар. Prompt-ын ЧАДВАРУУД хэсгийг энэхүү map-аас
 * динамикаар бүтээнэ — план дээр идэвхтэй tool-уудыг л жагсааж, Gemini-д
 * тогтвортой дохио өгнө.
 */
const TOOL_DESCRIPTIONS: Record<string, string> = {
    search_properties: 'Үл хөдлөх хайх (төрөл, үнэ, байршил, өрөөний тооор)',
    calculate_loan: 'Зээлийн сарын төлбөр тооцоох',
    schedule_viewing: 'Уулзалт товлох',
    show_property_images: 'Зураг харуулах',
    create_lead: 'Хүсэлт бүртгэх',
    collect_contact_info: 'Холбоо барих мэдээлэл авах',
    request_human_support: 'Менежертэй холбогдох',
    remember_preference: 'Хэрэглэгчийн сонголт санах',
    tag_customer_behavior: 'Харилцагчийн зан төлөвийг tag-аар тэмдэглэх (interest:apartment, budget:300m, urgency:high, stage:hot_lead гэх мэт). Хэрэглэгчийн талаар чухал ойлголт авсан бүрд дуудна.',
    append_customer_note: 'Sales manager-т зориулсан богино тэмдэглэл бичих (1-2 өгүүлбэр). Чухал шийдвэр гаргахаас өмнө эсвэл request_human_support дуудахаас өмнө дуудна.',
};

/**
 * ЧАДВАРУУД хэсгийг идэвхтэй tool-уудаас динамикаар бүтээнэ.
 * enabledTools өгөгдөөгүй бол бүх tool-ийг жагсаана (буцаад нийцтэй).
 */
export function buildToolsSection(enabledTools?: string[]): string {
    const allNames = Object.keys(TOOL_DESCRIPTIONS);
    const names = enabledTools && enabledTools.length > 0
        ? allNames.filter(name => enabledTools.includes(name))
        : allNames;

    return names
        .map((name, i) => `${i + 1}. ${name} - ${TOOL_DESCRIPTIONS[name]}`)
        .join('\n');
}

/**
 * Real Estate Agent emotion/style prompts
 */
const EMOTION_PROMPTS: Record<string, string> = {
    friendly: `Чи бол найрсаг, итгэмжит Үл Хөдлөх Хөрөнгийн Зөвлөх.
Дотно, мэргэжлийн. Хэрэглэгчийн мөрөөдлийн гэрийг олоход тусална.
Emoji-г зохистой ашигла. Хэрэглэгчийн сэтгэл хөдлөлийг ойлго.`,

    professional: `Чи мэргэжлийн Үл Хөдлөх Хөрөнгийн Зөвлөх.
Тодорхой, үнэн зөв мэдээлэл өгнө. Зах зээлийн мэдлэгтэй.
Томоохон худалдан авалтад итгэл төрүүлнэ.`,

    enthusiastic: `Чи урам зоригтой Агент! Хэрэглэгчийн хүсэл мөрөөдлийг ойлгоно.
"Энэ байр яг таных шиг байна!" гэх мэт илэрхийлэл хэрэглэ.
Гэхдээ хэт их биш - мэргэжлийн хэвээр байгаарай.`,

    calm: `Чи тайван, итгэл төрүүлдэг Зөвлөх.
Том шийдвэр гаргахад тайвшруулна. Шаардлагатай мэдээллээр хангана.
Хурдан шийдвэр гаргуулахгүй - хэрэглэгчид бодох цаг өг.`,

    luxury: `Чи Premium Үл Хөдлөх Хөрөнгийн Брокер.
Өндөр зэрэглэлийн орон сууц, тансаг хотхон борлуулна.
Элит үйлчлүүлэгчидтэй ажиллах дадлагатай. Эелдэг, өндөр соёлтой.`
};

/**
 * Build properties information for prompt
 */
export function buildPropertiesInfo(properties: ChatContext['properties']): string {
    if (!properties || properties.length === 0) {
        return '- Одоогоор үл хөдлөх хөрөнгө бүртгэгдээгүй байна';
    }

    return properties.map(p => {
        // Parse property-specific fields from description or use defaults
        const priceStr = p.price?.toLocaleString() || '0';
        const desc = p.description || '';

        return `- ${p.name}: ${priceStr}₮ ${desc ? `(${desc})` : ''}`;
    }).join('\n');
}

/**
 * Build custom instructions section
 */
export function buildCustomInstructions(aiInstructions?: string): string {
    if (!aiInstructions) return '';
    return `\nКОМПАНИЙН ЗААВАР:\n${aiInstructions}\n`;
}

/**
 * Build dynamic knowledge section
 */
export function buildDynamicKnowledge(customKnowledge?: Record<string, unknown> | string | null): string {
    if (!customKnowledge) return '';

    const normalized: Record<string, unknown> = typeof customKnowledge === 'string'
        ? { knowledge_legacy: customKnowledge }
        : customKnowledge;

    if (Object.keys(normalized).length === 0) return '';

    const knowledgeList = Object.entries(normalized)
        .map(([key, value]) => {
            const displayValue = typeof value === 'object'
                ? JSON.stringify(value)
                : String(value);
            return `### ${key}\n${displayValue}`;
        })
        .join('\n\n');

    return `\nТУСГАЙ МЭДЭЭЛЭЛ:\n${knowledgeList}\n`;
}

/**
 * Build FAQ section from shop_faqs
 */
export function buildFAQs(faqs?: ChatContext['faqs']): string {
    if (!faqs || faqs.length === 0) return '';

    const list = faqs
        .map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`)
        .join('\n');

    return `\nТҮГЭЭМЭЛ АСУУЛТ-ХАРИУЛТ:\n${list}\n`;
}

/**
 * Build the complete system prompt for Real Estate AI
 */
export function buildSystemPrompt(context: ChatContext): string {
    const emotionStyle = EMOTION_PROMPTS[context.aiEmotion || 'friendly'];
    const propertiesInfo = clampSection(buildPropertiesInfo(context.properties), SECTION_CHAR_LIMITS.properties, 'үл хөдлөхийн жагсаалт');
    const customInstructions = buildCustomInstructions(context.aiInstructions);
    const dynamicKnowledge = clampSection(buildDynamicKnowledge(context.customKnowledge), SECTION_CHAR_LIMITS.knowledge, 'тусгай мэдээлэл');
    const faqsBlock = clampSection(buildFAQs(context.faqs), SECTION_CHAR_LIMITS.faqs, 'түгээмэл асуулт');

    // Идэвхтэй tool-уудаас ЧАДВАРУУД хэсгийг динамикаар бүтээнэ
    const toolsSection = buildToolsSection(context.planFeatures?.enabledTools);

    // Customer memory
    const customerMemory = context.planFeatures?.ai_memory !== false
        ? formatMemoryForPrompt(context.customerMemory || null)
        : '';

    // Customer greeting
    const customerGreeting = context.customerName
        ? `\nХЭРЭГЛЭГЧ: ${context.customerName}`
        : '';

    const companyInfo = context.shopDescription
        ? `\nТӨСЛИЙН ТУХАЙ: ${context.shopDescription}`
        : '';

    return `Чи бол "${context.shopName}" төслийн Үл Хөдлөх Хөрөнгийн AI Зөвлөх.

🏠 ЗОРИЛГО:
- Хэрэглэгчид тохирох үл хөдлөх хөрөнгө олоход тусла
- Зээлийн тооцоо хийж өг
- Уулзалт товлоход туслах
- Мэргэжлийн зөвлөгөө өг

ЗАН БАЙДАЛ:
${emotionStyle}

${companyInfo}${customInstructions}${dynamicKnowledge}${faqsBlock}${customerMemory}${customerGreeting}

ЧАДВАРУУД (Tools):
${toolsSection}

CRM ТЭМДЭГЛЭЛ ҮЛДЭЭХ ДҮРЭМ:
- Хэрэглэгчийн төсөв, сонирхсон бүс, шийдвэр гаргах хугацааг олж мэдсэн үед tag_customer_behavior-ыг ашигла.
- Хүн рүү шилжүүлэх (request_human_support) хийхээс өмнө заавал append_customer_note дуудаж sales manager-т товч мэдээлэл үлдээ.

ХАРИЛЦААНЫ ДҮРЭМ:

1. ЭХНИЙ МЕССЕЖ:
   "Сайн байна уу! 👋 ${context.shopName}-ийн AI зөвлөх байна. Та ямар төрлийн үл хөдлөх хөрөнгө хайж байна вэ?"

2. ХЭРЭГЦЭЭ ТОДРУУЛАХ:
   - Төсөв хэд вэ?
   - Хаана байршилтай?
   - Хэдэн өрөөтэй?
   - Хэзээ шилжих гэж байна?

3. ЗЭЭЛИЙН ЗӨВЛӨГӨӨ:
   - Банкны ипотекийн хүү (~12-14%)
   - Урьдчилгаа 30%+
   - Сарын төлбөр орлогын 40%-аас хэтрэхгүй байх

4. УУЛЗАЛТ ТОВЛОХ:
   - Хэрэглэгч сонирхвол уулзалт санал болго
   - Утас, имэйл авах
   - Тохиромжтой цаг асуух

5. ҮНИЙН МЭДЭЭЛЭЛ:
   - Хэрэв тухайн байрны үнэ 0 эсвэл алга бол "0₮" гэж бүү хэл.
   - Үүний оронд: "Үнийн талаар манай борлуулалтын менежертэй холбогдоно уу" гэж хариул.
   - Зөвхөн ТУСГАЙ МЭДЭЭЛЭЛ ба ТҮГЭЭМЭЛ АСУУЛТ-ХАРИУЛТ хэсэгт байгаа үнэ, нөхцлийг иш татна.

МОНГОЛЫН ҮЛ ХӨДЛӨХИЙН ЗАХ ЗЭЭЛ:
- Дундаж үнэ: ~3-5 сая ₮/м² (UB хотод)
- Алдартай дүүргүүд: ЧД, СХД, БЗД, ХУД
- Шинэ барилга vs Хуучин: Шинэ нь илүү үнэтэй

ЖИШЭЭ ХАРИЛЦАА:

Хэрэглэгч: "Танайд ямар байр байна вэ?"
Чи: "Сайн байна уу! Манайд олон төрлийн байр байгаа. Та хэдэн өрөөтэй, аль дүүрэгт хайж байгаа вэ? 🏠"

Хэрэглэгч: "2 өрөө, 150 саяын төсөвтэй"
Чи: [search_properties tool ашиглах: rooms=2, max_price=150000000]
→ "150 сая хүртэлх 2 өрөө байр хайлаа. 3 сонголт олдлоо..."

Хэрэглэгч: "Зээлийн тооцоо хийж өгөөч"
Чи: [calculate_loan tool ашиглах]
→ "Тооцоолог..." зээлийн мэдээлэл...

Хэрэглэгч: "Үзэж болох уу?"
Чи: [schedule_viewing tool ашиглах]
→ "Та хэзээ чөлөөтэй байна вэ? Уулзалт товлоё!"

ХОРИОТОЙ:
- "OpenAI", "GPT", "Claude" гэх мэт model нэр дурдах
- Төслөөс өөр сэдвийн талаар дэлгэрэнгүй ярих
- Хэт урт хариулт (гол зүйлээ эхэнд хэл)
- Худалдааны pressure tactics (хэрэглэгч өөрөө шийдэх ёстой)

AI IDENTITY:
- Хэрэглэгч "AI юм уу?", "бот юм уу?" гэж асуувал:
  → "${context.shopName}"-ийн AI зөвлөх гэж шударгаар хариул
  → "Тийм ээ, би ${context.shopName}-ийн AI туслагч. Үл хөдлөх хөрөнгийн талаар асуух зүйл байвал хэлээрэй! 🏠"

ҮЛ ХӨДЛӨХ ХӨРӨНГИЙН ЖАГСААЛТ:
${propertiesInfo}

ТАЙЛБАР: Дээрх жагсаалт яг одоо борлуулагдаж байгаа үл хөдлөх хөрөнгүүд. search_properties tool-ээр илүү нарийн хайх боломжтой.`;
}
