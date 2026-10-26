/**
 * Лхагвын илтгэлийн «НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ» (багийн загварын 10-р слайд). Client-safe, pure:
 * сервер `meeting-details-load.ts`.
 *  • Сонирхсон загвар 7 хоногоор: сүүлийн 4 Лхагва→Мягмар 7 хоног (range.to-оор дуусна), `completed`
 *    (ирээгүй, цуцалсан биш), устгаагүй бүх төрлийн уулзалт, уулзалтын ЭХНИЙ сонирхлын блок + загвараар
 *    (`pricingKey`-ээр: «Б1»/«B1», «E7»/«e7» нэг загвар; нэр нь байрны бүртгэлийнх, эс бөгөөс эхэлж бичигдсэн нь).
 *    Өрөө = байрны бүртгэлийн блок + загвар (нэг утгатай бол), талбай = 4 долоо хоногийн хамгийн олон
 *    давтагдсан `area_sqm` — загварын нэр (`label`) долоо хоног бүрт ижил. Сонирхолгүй уулзалт тусдаа
 *    (`withoutInterest`) — хасахгүй.
 *  • «Сэжим» (хаанаас ирсэн): тайлант 7 хоногийн ШИНЭ (`new_customer`) уулзалт сэжмийн нэрээр;
 *    сонгоогүй эсвэл талбар хараахан алга бол «Тодорхойгүй» (`unknown`), 0 гэж хасахгүй.
 */
import { periodCoverage, type PeriodCoverage } from './data-since';
import { pricingKey } from '@/lib/sales/pricing';
import { activityRangeLabel } from './sales-activity';
import { shiftReviewDate, weeklyReviewRange } from './weekly-review';

export const MEETING_DETAIL_WEEKS = 4;

export interface MeetingModelCount { key: string; label: string; count: number }
/**
 * `coverage`: уулзалтын бүртгэл эхлэхээс өмнө дууссан 7 хоног → none (тоо тодорхойгүй, «0» биш); дунд нь эхэлсэн → partial
 * (тоо доод хязгаар «N+»); full → бүрэн. Идэвхжлийн тайлантай (9-р слайд) нэг дүрэм (`data-since.ts`).
 */
export interface MeetingDetailWeek { label: string; from: string; to: string; total: number; withoutInterest: number; byModel: MeetingModelCount[]; coverage: PeriodCoverage }
export interface MeetingDetailsReport {
    range: { from: string; to: string };
    weeks: MeetingDetailWeek[];
    referral: { rows: Array<{ label: string; count: number }>; unknown: number; total: number; /** Сэжмийн талбар DB-д бий эсэх. */ available: boolean };
    notes: string[];
}

export interface MeetingDetailRow {
    id: string;
    /** Уулзалтын УБ өдөр. */
    day: string;
    type: string | null;
    interests: unknown;
}
export interface MeetingDetailsInput {
    meetingDate: string;
    meetings: readonly MeetingDetailRow[];
    /** Байрны бүртгэл (орон сууц): блок, загвар, өрөө. */
    units: ReadonlyArray<{ block: string | null; model: string | null; rooms: number | string | null }>;
    /** Сэжим: `available: false` = багана/хүснэгт алга; `byViewing` = уулзалт → сэжмийн нэр (сонгоогүй бол null). */
    referrals: { available: boolean; byViewing: ReadonlyMap<string, string | null> };
    /** Уулзалтын бүртгэл эхэлсэн УБ өдөр (устгаагүй, ямар ч төлөвтэй хамгийн эртний уулзалт); алга бол null. Хуучин дуудагчид заавал биш. */
    meetingsSince?: string | null;
}

/** Тайлант 7 хоногоор дуусах сүүлийн `count` Лхагва→Мягмар 7 хоног (эрт → хожуу). */
export function meetingDetailWeeks(meetingDate: string, count = MEETING_DETAIL_WEEKS): Array<{ label: string; from: string; to: string }> {
    const range = weeklyReviewRange(meetingDate);
    return Array.from({ length: count }, (_, index) => {
        const offset = (count - 1 - index) * -7;
        const from = shiftReviewDate(range.from, offset);
        const to = shiftReviewDate(range.to, offset);
        return { label: activityRangeLabel(from, to), from, to };
    });
}

/** Уулзалтын эхний сонирхол (блок, загвар, талбай); бүтэцгүй бол null. */
export function firstInterest(interests: unknown): { block: string; model: string; area: number | null } | null {
    const item = Array.isArray(interests) ? interests[0] as Record<string, unknown> | undefined : undefined;
    const block = typeof item?.block === 'string' ? item.block.trim() : '';
    const model = typeof item?.model === 'string' ? item.model.trim() : '';
    if (!block || !model) return null;
    const area = Number(item?.area_sqm);
    return { block, model, area: Number.isFinite(area) && area > 0 ? Math.round(area * 100) / 100 : null };
}

/** Блок + загвар → өрөө (байрны бүртгэлд нэг утгатай бол л). */
export function modelRooms(units: MeetingDetailsInput['units']): Map<string, number | null> {
    const values = new Map<string, Set<number>>();
    for (const unit of units) {
        const rooms = Number(unit.rooms);
        if (!unit.block || !unit.model || unit.rooms === null || !Number.isInteger(rooms) || rooms <= 0) continue;
        const key = `${pricingKey(unit.block)}|${pricingKey(unit.model)}`;
        values.set(key, (values.get(key) ?? new Set()).add(rooms));
    }
    return new Map([...values].map(([key, set]) => [key, set.size === 1 ? [...set][0] : null]));
}
/** Блок + загварын түлхүүр (кирилл/латин «Б»/«B», «Е»/«E», том/жижиг үсэг ялгахгүй). */
export const modelKey = (block: string, model: string) => `${pricingKey(block)}|${pricingKey(model)}`;
export const roomsOf = (rooms: Map<string, number | null>, block: string, model: string) => rooms.get(modelKey(block, model)) ?? null;
/** Түлхүүр → байрны бүртгэлд бичигдсэн блок, загварын нэр (эхний байрных). */
export function registerModelNames(units: MeetingDetailsInput['units']): Map<string, { block: string; model: string }> {
    const names = new Map<string, { block: string; model: string }>();
    for (const unit of units) {
        const block = unit.block?.trim();
        const model = unit.model?.trim();
        if (block && model && !names.has(modelKey(block, model))) names.set(modelKey(block, model), { block, model });
    }
    return names;
}

/** «Б1 E7 · 89.73 м² · 3 өрөө». */
export function modelLabel(block: string, model: string, area: number | null, rooms: number | null): string {
    return [`${block} ${model}`, area === null ? null : `${area} м²`, rooms === null ? null : `${rooms} өрөө`].filter(Boolean).join(' · ');
}

export function buildMeetingDetails(input: MeetingDetailsInput): MeetingDetailsReport {
    const range = weeklyReviewRange(input.meetingDate);
    const rooms = modelRooms(input.units);
    const registerNames = registerModelNames(input.units);
    const notes: string[] = [];

    const windowWeeks = meetingDetailWeeks(input.meetingDate);
    const inWindow = input.meetings.filter(meeting => meeting.day >= windowWeeks[0].from && meeting.day <= windowWeeks[windowWeeks.length - 1].to);
    // Загварын нэр 4 долоо хоногт нэг (слайдын тайлбар, график бүрт ижил): долоо хоног бүр өөрийн талбайгаар нэрлэвэл
    // нэг загвар (нэг өнгө) хоёр нэртэй болно.
    const models = new Map<string, { block: string; model: string; areas: Map<number, number> }>();
    for (const meeting of inWindow) {
        const interest = firstInterest(meeting.interests);
        if (!interest) continue;
        const key = modelKey(interest.block, interest.model);
        const entry = models.get(key) ?? { ...(registerNames.get(key) ?? { block: interest.block, model: interest.model }), areas: new Map() };
        if (interest.area !== null) entry.areas.set(interest.area, (entry.areas.get(interest.area) ?? 0) + 1);
        models.set(key, entry);
    }
    const labels = new Map([...models].map(([key, entry]) => {
        // Хамгийн олон давтагдсан талбай (тэнцвэл бага нь).
        const area = [...entry.areas].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
        return [key, modelLabel(entry.block, entry.model, area, roomsOf(rooms, entry.block, entry.model))];
    }));

    const weeks = windowWeeks.map(week => {
        const meetings = inWindow.filter(meeting => meeting.day >= week.from && meeting.day <= week.to);
        const counts = new Map<string, number>();
        let withoutInterest = 0;
        for (const meeting of meetings) {
            const interest = firstInterest(meeting.interests);
            if (!interest) { withoutInterest++; continue; }
            const key = modelKey(interest.block, interest.model);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const byModel = [...counts].map(([key, count]) => ({ key, label: labels.get(key)!, count }))
            .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'mn', { numeric: true }));
        const coverage: PeriodCoverage = input.meetingsSince === undefined ? 'full' : periodCoverage(input.meetingsSince, week.from, week.to);
        return { ...week, total: meetings.length, withoutInterest, byModel, coverage };
    });
    if (input.meetingsSince === null) notes.push('Уулзалт бүртгэгдээгүй тул 7 хоногийн тоо тодорхойгүй.');
    else if (input.meetingsSince && input.meetingsSince > weeks[0].from) {
        notes.push(`Уулзалтын бүртгэл ${input.meetingsSince}-нээс эхэлсэн — түүнээс өмнөх 7 хоног тодорхойгүй, тэр өдрийг агуулсан 7 хоногийн тоо доод хязгаар («N+»).`);
    }
    const missing = weeks.reduce((sum, week) => sum + week.withoutInterest, 0);
    if (missing) notes.push(`${missing} уулзалтад сонирхсон загвар бүртгэгдээгүй («Сонголтгүй»).`);

    // Сэжим: тайлант 7 хоногийн шинэ уулзалт.
    const fresh = input.meetings.filter(meeting => meeting.type === 'new_customer' && meeting.day >= range.from && meeting.day <= range.to);
    const counts = new Map<string, number>();
    let unknown = 0;
    for (const meeting of fresh) {
        const name = input.referrals.available ? input.referrals.byViewing.get(meeting.id)?.trim() || null : null;
        if (!name) { unknown++; continue; }
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    if (!input.referrals.available) notes.push('«Сэжим (хаанаас ирсэн)» талбар хараахан нэмэгдээгүй тул шинэ уулзалт бүгд «Тодорхойгүй».');
    else if (unknown) notes.push(`${unknown} шинэ уулзалтад «Сэжим» сонгоогүй.`);
    const rows = [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'mn'));

    return { range, weeks, referral: { rows, unknown, total: fresh.length, available: input.referrals.available }, notes };
}
