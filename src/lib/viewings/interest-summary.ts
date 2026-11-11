/**
 * Уулзалтын сонирхлын нэгтгэл (огнооны мужаар) — «хамгийн их сонирхсон загвар / төлбөрийн нөхцөл».
 * Client-safe, pure: сервер `interest-summary-load.ts`, AI `get_meeting_interests`.
 *  • Уулзалт бүр загвар (блок + загвар, `pricingKey`-ээр «Б1»/«B1», «e7»/«E7» нэг) болон төлбөрийн нөхцөл
 *    бүрт НЭГ л удаа тоологдоно: нэг уулзалтад хоёр загвар сонгосон бол хоёуланд нь +1, нэг загварыг хоёр
 *    давхарт сонгосон бол нэг. Хувь = тухайн загвар/нөхцөлтэй уулзалт ÷ сонирхолтой уулзалт.
 *  • Сонирхолгүй уулзалт, нөхцөлгүй сонирхол тусдаа тоологдоно — хасахгүй, «0» гэж нуухгүй.
 *  • Уулзалтын бүртгэл мужийн дунд эхэлсэн бол тоо доод хязгаар (`partial`), бүртгэлээс өмнө бол тодорхойгүй (`none`).
 */
import { periodCoverage, type PeriodCoverage } from '@/lib/dashboard/data-since';
import { modelKey, modelLabel, modelRooms, registerModelNames, roomsOf } from '@/lib/dashboard/meeting-details';
import { pricingKey } from '@/lib/sales/pricing';
import { MEETING_TYPE_META, type MeetingType } from './labels';

export const MEETING_INTEREST_STATUSES = ['completed', 'scheduled', 'no_show', 'cancelled', 'all'] as const;
export type MeetingInterestStatus = typeof MEETING_INTEREST_STATUSES[number];
export const MEETING_INTEREST_MAX_DAYS = 366;

export interface MeetingInterestRow {
    id: string;
    /** Уулзалтын УБ өдөр (YYYY-MM-DD). */
    day: string;
    status: string;
    type: string | null;
    interests: unknown;
}

export interface MeetingInterestInput {
    from: string;
    to: string;
    status: MeetingInterestStatus;
    meetings: readonly MeetingInterestRow[];
    /** Байрны бүртгэл (орон сууц): загварын нэр, өрөө. */
    units: ReadonlyArray<{ block: string | null; model: string | null; rooms: number | string | null }>;
    /** Уулзалтын бүртгэл эхэлсэн УБ өдөр (алга бол null). */
    meetingsSince: string | null;
}

export interface InterestShare { label: string; meetings: number; /** Сонирхолтой уулзалтын хувь (0–100, нэг орны нарийвчлал). */ sharePct: number | null }
export interface MeetingInterestSummary {
    range: { from: string; to: string };
    status: MeetingInterestStatus;
    coverage: PeriodCoverage;
    meetings: number;
    withInterest: number;
    withoutInterest: number;
    byModel: Array<InterestShare & { block: string; model: string }>;
    byPaymentCondition: InterestShare[];
    /** Сонирхолтой боловч төлбөрийн нөхцөл сонгоогүй уулзалт. */
    withoutPaymentCondition: number;
    /** Загвар × нөхцөл (хамгийн олон 10). */
    byModelAndCondition: Array<{ model: string; paymentCondition: string; meetings: number }>;
    byMeetingType: Array<{ type: string; meetings: number }>;
    notes: string[];
}

const STATUS_LABEL: Record<MeetingInterestStatus, string> = {
    completed: 'болсон', scheduled: 'товлогдсон', no_show: 'ирээгүй', cancelled: 'цуцалсан', all: 'бүх төлөвийн',
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
/** «10-30 %» = «10-30%»; кирилл/латин үсгийг `pricingKey`-ээр нэгтгэнэ. */
const conditionKey = (value: string) => pricingKey(value).replace(/\s+/g, '');
const share = (count: number, total: number) => total > 0 ? Math.round((count / total) * 1000) / 10 : null;
const byCount = <T extends { meetings: number }>(key: (row: T) => string) => (a: T, b: T) => b.meetings - a.meetings || key(a).localeCompare(key(b), 'mn', { numeric: true });

export function buildMeetingInterestSummary(input: MeetingInterestInput): MeetingInterestSummary {
    const meetings = input.meetings.filter(meeting => meeting.day >= input.from && meeting.day <= input.to
        && (input.status === 'all' || meeting.status === input.status));
    const rooms = modelRooms(input.units);
    const registerNames = registerModelNames(input.units);

    const models = new Map<string, { block: string; model: string; meetings: number; areas: Map<number, number> }>();
    const conditions = new Map<string, { label: string; meetings: number }>();
    const combos = new Map<string, { modelKey: string; conditionKey: string; meetings: number }>();
    const types = new Map<string, number>();
    let withInterest = 0, withoutPaymentCondition = 0;

    for (const meeting of meetings) {
        const type = MEETING_TYPE_META[meeting.type as MeetingType]?.short ?? 'Тодорхойгүй';
        types.set(type, (types.get(type) ?? 0) + 1);
        const items = (Array.isArray(meeting.interests) ? meeting.interests : []) as Array<Record<string, unknown>>;
        const seenModels = new Set<string>(), seenConditions = new Set<string>(), seenCombos = new Set<string>();
        for (const item of items) {
            const block = text(item?.block), model = text(item?.model), condition = text(item?.payment_condition);
            const mKey = block && model ? modelKey(block, model) : null;
            const cKey = condition ? conditionKey(condition) : null;
            if (mKey && !seenModels.has(mKey)) {
                seenModels.add(mKey);
                const entry = models.get(mKey) ?? { ...(registerNames.get(mKey) ?? { block, model }), meetings: 0, areas: new Map() };
                entry.meetings++;
                models.set(mKey, entry);
            }
            if (mKey) {
                const area = Number(item?.area_sqm);
                if (Number.isFinite(area) && area > 0) {
                    const rounded = Math.round(area * 100) / 100;
                    const entry = models.get(mKey)!;
                    entry.areas.set(rounded, (entry.areas.get(rounded) ?? 0) + 1);
                }
            }
            if (cKey && !seenConditions.has(cKey)) {
                seenConditions.add(cKey);
                const entry = conditions.get(cKey) ?? { label: condition, meetings: 0 };
                entry.meetings++;
                conditions.set(cKey, entry);
            }
            if (mKey && cKey && !seenCombos.has(`${mKey}#${cKey}`)) {
                seenCombos.add(`${mKey}#${cKey}`);
                const entry = combos.get(`${mKey}#${cKey}`) ?? { modelKey: mKey, conditionKey: cKey, meetings: 0 };
                entry.meetings++;
                combos.set(`${mKey}#${cKey}`, entry);
            }
        }
        if (seenModels.size || seenConditions.size) {
            withInterest++;
            if (!seenConditions.size) withoutPaymentCondition++;
        }
    }

    const labels = new Map([...models].map(([key, entry]) => {
        // Хамгийн олон давтагдсан талбай (тэнцвэл бага нь) — Лхагвын слайдын загварын нэртэй ижил.
        const area = [...entry.areas].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
        return [key, modelLabel(entry.block, entry.model, area, roomsOf(rooms, entry.block, entry.model))];
    }));
    const byModel = [...models].map(([key, entry]) => ({ block: entry.block, model: entry.model, label: labels.get(key)!, meetings: entry.meetings, sharePct: share(entry.meetings, withInterest) }))
        .sort(byCount(row => row.label));
    const byPaymentCondition = [...conditions.values()].map(entry => ({ label: entry.label, meetings: entry.meetings, sharePct: share(entry.meetings, withInterest) }))
        .sort(byCount(row => row.label));
    const byModelAndCondition = [...combos.values()].map(entry => ({
        model: labels.get(entry.modelKey)!, paymentCondition: conditions.get(entry.conditionKey)!.label, meetings: entry.meetings,
    })).sort(byCount(row => `${row.model} ${row.paymentCondition}`)).slice(0, 10);
    const byMeetingType = [...types].map(([type, count]) => ({ type, meetings: count })).sort(byCount(row => row.type));

    const coverage = periodCoverage(input.meetingsSince, input.from, input.to);
    const notes: string[] = [];
    const statusText = STATUS_LABEL[input.status];
    if (coverage === 'none') notes.push(input.meetingsSince
        ? `Уулзалтын бүртгэл ${input.meetingsSince}-нээс эхэлсэн тул энэ хугацааны тоо тодорхойгүй (0 биш).`
        : 'Уулзалт бүртгэгдээгүй тул тоо тодорхойгүй (0 биш).');
    else if (coverage === 'partial') notes.push(`Уулзалтын бүртгэл ${input.meetingsSince}-нээс эхэлсэн — тоо доод хязгаар («N+»).`);
    if (meetings.length) notes.push(`Тоо = ${statusText} уулзалт; нэг уулзалтад хэд хэдэн загвар/нөхцөл сонгосон бол тус бүрд нэг удаа тоологдоно, хувь нь сонирхолтой уулзалтаас.`);
    if (meetings.length - withInterest > 0) notes.push(`${meetings.length - withInterest} уулзалтад сонирхсон загвар бүртгэгдээгүй («Сонголтгүй»).`);
    if (withoutPaymentCondition) notes.push(`${withoutPaymentCondition} уулзалтад төлбөрийн нөхцөл сонгоогүй.`);
    const top = (rows: Array<{ meetings: number }>) => rows.length > 1 && rows[0].meetings === rows[1].meetings;
    if (top(byModel)) notes.push('Хамгийн их сонирхсон загвар тэнцүү байна — тэнцсэн бүгдийг нэрлэ.');
    if (top(byPaymentCondition)) notes.push('Хамгийн их сонирхсон төлбөрийн нөхцөл тэнцүү байна — тэнцсэн бүгдийг нэрлэ.');

    return {
        range: { from: input.from, to: input.to }, status: input.status, coverage,
        meetings: meetings.length, withInterest, withoutInterest: meetings.length - withInterest,
        byModel, byPaymentCondition, withoutPaymentCondition, byModelAndCondition, byMeetingType, notes,
    };
}
