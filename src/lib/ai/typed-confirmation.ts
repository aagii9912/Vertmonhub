import { TOOL_CATALOG, isCatalogTool } from '@/lib/ai/tool-catalog';

/**
 * Хүлээгдэж буй үйлдлийн картыг чатад «тийм» / «үгүй» гэж бичиж шийдвэрлэх (client-safe).
 * Зөвхөн БҮТЭН мессеж доорх үгтэй яг таарвал (жишээ: «тийм, гэхдээ 3 өрөө болго» таарахгүй — моделд очно).
 * Батлалт нь картын «Зөвшөөрөх»-тэй ижил /api/ai-assistant/action замаар (RBAC + audit) явна.
 */
const APPROVE = new Set([
    'тийм', 'тийм ээ', 'тиймээ', 'тийм тийм', 'за', 'за за', 'зүгээр', 'болно', 'ок', 'ok', 'okay', 'yes',
    'батал', 'батална', 'баталъя', 'баталгаажуул', 'зөвшөөрнө', 'зөвшөөрлөө', 'зөвшөөр', 'хий', 'хийгээрэй', 'тэг', 'тэгээрэй', 'тэгье',
    'tiim', 'tiimee', 'za', 'hii', 'hiigeerei', 'tg', 'teg', 'tegeerei', 'bolno', 'batal', 'zuvshuurnu',
]);
const APPROVE_ALL = new Set(['бүгдийг', 'бүгдийг батал', 'бүгдийг хий', 'бүгдийг зөвшөөр', 'бүгдийг тэг', 'bugdiig', 'bugdiig batal', 'bugdiig hii']);
const DECLINE = new Set([
    'үгүй', 'үгүй ээ', 'үгүйээ', 'болих', 'боль', 'больё', 'болъё', 'хэрэггүй', 'цуцал', 'цуцлах', 'битгий', 'битгий хий', 'no',
    'ugui', 'boli', 'bolih', 'heregui', 'tsutsal', 'bitgii',
]);

export type TypedDecision = 'approve' | 'approve_all' | 'decline';

export function classifyTypedConfirmation(text: string): TypedDecision | null {
    const normalized = text.normalize('NFC').toLowerCase().replace(/[.!?,…"'«»()]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (APPROVE_ALL.has(normalized)) return 'approve_all';
    if (APPROVE.has(normalized)) return 'approve';
    if (DECLINE.has(normalized)) return 'decline';
    return null;
}

export interface TypedConfirmationPlan {
    approve: string[];
    cancel: string[];
    /** Мөнгө, олон бичлэгт нөлөөлөх (alwaysConfirm) — заавал карт дээр дарна. */
    needsCard: string[];
    /** Олон карт хүлээгдэж байхад энгийн «тийм» — аль нь болохыг тодруулна. */
    ambiguous: boolean;
}

export function planTypedConfirmation(pending: ReadonlyArray<{ id: string; tool: string }>, decision: TypedDecision): TypedConfirmationPlan {
    if (decision === 'decline') return { approve: [], cancel: pending.map((action) => action.id), needsCard: [], ambiguous: false };
    const cardOnly = (tool: string) => !isCatalogTool(tool) || !!TOOL_CATALOG[tool].alwaysConfirm;
    const needsCard = pending.filter((action) => cardOnly(action.tool)).map((action) => action.id);
    if (decision === 'approve' && pending.length > 1) return { approve: [], cancel: [], needsCard, ambiguous: true };
    return { approve: pending.filter((action) => !cardOnly(action.tool)).map((action) => action.id), cancel: [], needsCard, ambiguous: false };
}
