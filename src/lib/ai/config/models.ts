/**
 * Gemini загварын ID-ийн ЦОРЫН ГАНЦ эх сурвалж.
 *
 * ЯАГААД: 2026-08-22-ны аудитаар кодод 5 өөр загварын ID 16 газарт ХАТУУ
 * бичигдсэн байсан (`gemini-3.5-flash` ×11, `gemini-3-pro` ×5, `gemini-3-flash`,
 * `gemini-3-nano`, `gemini-1.5-flash`). Тэдгээрийн нэг нь хүчингүй болбол
 * шалтгааныг олоход 16 файл шалгах шаардлагатай байв — түүнчлэн орчестраторын
 * гурван гол цэг бүгд нэг ID-д тулгуурладаг тул тэр ID буруу байвал AI чат
 * бүхэлдээ ажиллахгүй болно.
 *
 * Одоо env-ээр дарж болно (`GEMINI_MODEL`, `GEMINI_MODEL_PRO`) — загвар
 * солиход deploy хийхгүйгээр тохируулга сольж болно.
 */

/** Хурдан/хямд загвар — замчлал, agent-ууд, задлан шинжилгээ. */
export const GEMINI_FLASH = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';

/** Илүү чадвартай загвар — нарийн задлан шинжилгээ шаардсан газарт. */
export const GEMINI_PRO = process.env.GEMINI_MODEL_PRO?.trim() || 'gemini-3-pro';

/** Тохиргоог оношилгоонд харуулах (жишээ: /api/health). */
export function describeModelConfig() {
    return {
        flash: GEMINI_FLASH,
        pro: GEMINI_PRO,
        flashFromEnv: !!process.env.GEMINI_MODEL?.trim(),
        proFromEnv: !!process.env.GEMINI_MODEL_PRO?.trim(),
    };
}
