/**
 * Борлуулалтын менежерийн сарын KPI карт (v2).
 *
 * Одоогийн Excel загвар (30% борлуулалт / 30% үйл ажиллагаа / 40% нэмэлт ажил) нь гэрээний
 * дүн, урьдчилгааг 0 жинтэй, ихэнх мөрийг «Хийгдсэн» гэж үнэлдэг тул үр дүнг шагнадаггүй.
 * v2 нь үр дүнд 60%, идэвх/сахилгад 25%, чанар, үнэлгээнд 15% (санал хүсэлтийг хугацаандаа
 * шийдвэрлэсэн 5 + удирдлагын үнэлгээ 10) өгнө. Гүйцэтгэлийг ERP экспорт, CRM-ээс автоматаар
 * тооцож, төлөвлөгөөг сарын эхэнд тогтооно. Жин нь эзэмшигч батлах хүртэл кодын анхдагч утга.
 * Өдрийн идэвх (дуудлага, уулзалт, санал хүсэлт) болон өдрийн зорилт: lib/sales/activity.ts.
 *
 * Оноо = жин × min(гүйцэтгэл / төлөвлөгөө, дээд хязгаар). Төлөвлөгөөгүй эсвэл мэдээлэлгүй
 * мөрийг 0 гэж тооцохгүй: нийт оноог зөвхөн тооцогдсон мөрүүдийн жингээр нормчилж,
 * тооцогдсон жинг (хамрах хүрээ) хамт харуулна.
 */
import { z } from 'zod';
import { DAILY_TARGET_LIMITS } from './activity';

export type KpiGroup = 'result' | 'activity' | 'quality';
export type KpiUnit = 'mnt' | 'count' | 'pct' | 'score';
export type KpiItemKey = 'contract_amount' | 'cash_collected' | 'overdue_collected' | 'new_meetings' | 'calls_chats' | 'followup' | 'service_resolution' | 'management';

export interface KpiItemDef {
    key: KpiItemKey;
    group: KpiGroup;
    label: string;
    unit: KpiUnit;
    weight: number;
    /** Гүйцэтгэлийн харьцааны дээд хязгаар (1.5 = 150%). */
    cap: number;
    /** Гүйцэтгэлийн эх сурвалж; `manual` бол гараар оруулна. */
    source: 'erp' | 'crm' | 'manual';
    basis: string;
}

export const KPI_GROUP_LABEL: Record<KpiGroup, string> = {
    result: 'Борлуулалтын үр дүн',
    activity: 'Идэвх, сахилга',
    quality: 'Чанар, үнэлгээ',
};

export const KPI_ITEMS: readonly KpiItemDef[] = [
    { key: 'contract_amount', group: 'result', label: 'Гэрээний дүн', unit: 'mnt', weight: 25, cap: 1.5, source: 'erp',
        basis: 'ERP-ийн гэрээ: захиалгын огноо тухайн сард, цуцлагдаагүй, менежерийн нэрээр.' },
    { key: 'cash_collected', group: 'result', label: 'Орсон мөнгө (урьдчилгаа + төлбөр)', unit: 'mnt', weight: 25, cap: 1.2, source: 'erp',
        basis: 'ERP «Нийт төлсөн дүн»-гийн зөрүү (сарын эхэн ба сүүлийн snapshot). Гэрээний дүнгээс тусдаа.' },
    { key: 'overdue_collected', group: 'result', label: 'Хугацаа хэтэрсэн авлага барагдуулалт', unit: 'mnt', weight: 10, cap: 1.2, source: 'erp',
        basis: 'Менежерийн гэрээний «Төлбөр хоцролт»-ын бууралт (сарын эхэн → сүүл).' },
    { key: 'new_meetings', group: 'activity', label: 'Шинэ харилцагчтай уулзалт', unit: 'count', weight: 10, cap: 1.2, source: 'crm',
        basis: 'CRM: тухайн сард болсон, «шинэ харилцагч» төрлийн уулзалт.' },
    { key: 'calls_chats', group: 'activity', label: 'Дуудлага, чат', unit: 'count', weight: 10, cap: 1.2, source: 'crm',
        basis: 'CRM-д бүртгэсэн дуудлага (лид → «Дуудлага», «Өнөөдөр» → «Дууссан», AI). Гараар оруулсан тоо (CallPro, Viber) байвал түүнийг авна — нэмэхгүй.' },
    { key: 'followup', group: 'activity', label: 'Хугацаандаа холбогдсон лид', unit: 'pct', weight: 5, cap: 1, source: 'crm',
        basis: 'CRM: менежерийн идэвхтэй лидээс дараагийн алхам нь хоцроогүй хувь (тооцох үеийн байдал).' },
    { key: 'service_resolution', group: 'quality', label: 'Санал хүсэлтийг хугацаандаа шийдвэрлэсэн', unit: 'pct', weight: 5, cap: 1, source: 'crm',
        basis: 'Санал гомдол: SLA (яаралтай 24ц, өндөр 48ц, дунд 120ц, бага 240ц) дотор шийдвэрлэсэн хувь, хариуцагч менежерээр.' },
    { key: 'management', group: 'quality', label: 'Удирдлагын үнэлгээ (1–5)', unit: 'score', weight: 10, cap: 1, source: 'manual',
        basis: 'Хүлээлцэх ажил, хурлын үүрэг, багийн ажил — удирдлага 1–5 оноогоор.' },
];

const keys = KPI_ITEMS.map(item => item.key) as [KpiItemKey, ...KpiItemKey[]];
const amount = z.number().finite().min(0).max(1e13);

/** Админы оруулах төлөвлөгөө, гар гүйцэтгэл (null = CRM-ийн тоо руу буцах), өдрийн зорилт, удирдлагын үнэлгээ. */
export const KpiMonthInputSchema = z.object({
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
    manager: z.string().trim().min(1).max(120),
    plans: z.partialRecord(z.enum(keys), amount).optional(),
    manual: z.partialRecord(z.enum(['calls_chats'] as const), amount.nullable()).optional(),
    daily: z.object({
        calls: z.number().int().min(1).max(DAILY_TARGET_LIMITS.calls).nullable().optional(),
        meetings: z.number().int().min(1).max(DAILY_TARGET_LIMITS.meetings).nullable().optional(),
    }).strict().optional(),
    review: z.object({
        management: z.number().int().min(1).max(5).nullable().optional(),
        note: z.string().trim().max(2000).optional(),
    }).strict().optional(),
}).strict();
export type KpiMonthInput = z.infer<typeof KpiMonthInputSchema>;

export type KpiActuals = Partial<Record<KpiItemKey, number | null>>;

export interface KpiItemScore extends KpiItemDef {
    plan: number | null;
    actual: number | null;
    /** Гүйцэтгэлийн хувь (хязгаарлаагүй). */
    attainmentPct: number | null;
    score: number | null;
    /** Яагаад тооцогдоогүй. */
    missing: 'plan' | 'actual' | null;
}

export function scoreKpi(input: { plans: Partial<Record<KpiItemKey, number>>; actuals: KpiActuals; management?: number | null }) {
    const items: KpiItemScore[] = KPI_ITEMS.map(def => {
        const isManagement = def.key === 'management';
        const plan = isManagement ? 5 : input.plans[def.key] ?? null;
        const actual = isManagement ? input.management ?? null : input.actuals[def.key] ?? null;
        if (actual === null) return { ...def, plan, actual, attainmentPct: null, score: null, missing: 'actual' as const };
        if (!plan || plan <= 0) return { ...def, plan: null, actual, attainmentPct: null, score: null, missing: 'plan' as const };
        const ratio = Math.max(0, actual / plan);
        return { ...def, plan, actual, attainmentPct: Math.round(ratio * 1000) / 10, score: Math.round(def.weight * Math.min(ratio, def.cap) * 10) / 10, missing: null };
    });
    const scored = items.filter(item => item.score !== null);
    const coveredWeight = scored.reduce((sum, item) => sum + item.weight, 0);
    const raw = scored.reduce((sum, item) => sum + (item.score ?? 0), 0);
    const total = coveredWeight ? Math.round(raw / coveredWeight * 1000) / 10 : null;
    const groups = (Object.keys(KPI_GROUP_LABEL) as KpiGroup[]).map(group => {
        const rows = items.filter(item => item.group === group);
        return { group, label: KPI_GROUP_LABEL[group], weight: rows.reduce((sum, item) => sum + item.weight, 0),
            score: rows.some(item => item.score !== null) ? Math.round(rows.reduce((sum, item) => sum + (item.score ?? 0), 0) * 10) / 10 : null };
    });
    return { items, groups, total, coveredWeight, grade: kpiGrade(total) };
}

export function kpiGrade(total: number | null): { label: string; tone: 'success' | 'info' | 'pending' | 'danger' | 'neutral' } {
    if (total === null) return { label: 'Тооцоогүй', tone: 'neutral' };
    if (total >= 100) return { label: 'Онцгой', tone: 'success' };
    if (total >= 85) return { label: 'Сайн', tone: 'info' };
    if (total >= 70) return { label: 'Хангалттай', tone: 'pending' };
    return { label: 'Сайжруулах', tone: 'danger' };
}

export type KpiScore = ReturnType<typeof scoreKpi>;
