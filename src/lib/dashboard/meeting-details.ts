/**
 * Лхагвын илтгэлийн «НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ» (багийн загварын 10-р слайд). Client-safe, pure:
 * сервер `meeting-details-load.ts`.
 *  • Сонирхсон загвар 7 хоногоор: сүүлийн 4 Лхагва→Мягмар 7 хоног (range.to-оор дуусна), `completed`
 *    (ирээгүй, цуцалсан биш), устгаагүй бүх төрлийн уулзалт, уулзалтын ЭХНИЙ сонирхлын блок + загвараар
 *    (`pricingKey`-ээр: «Б1»/«B1», «E7»/«e7» нэг загвар; нэр нь байрны бүртгэлийнх, эс бөгөөс эхэлж бичигдсэн нь).
 *    Өрөө = байрны бүртгэлийн блок + загвар (нэг утгатай бол), талбай = тухайн 7 хоногийн хамгийн олон
 *    давтагдсан `area_sqm`. Сонирхолгүй уулзалт тусдаа (`withoutInterest`) — хасахгүй.
 *  • «Сэжим» (хаанаас ирсэн): тайлант 7 хоногийн ШИНЭ (`new_customer`) уулзалт сэжмийн нэрээр;
 *    сонгоогүй эсвэл талбар хараахан алга бол «Тодорхойгүй» (`unknown`), 0 гэж хасахгүй.
 */
import { pricingKey } from '@/lib/sales/pricing';
import { activityRangeLabel } from './sales-activity';
import { shiftReviewDate, weeklyReviewRange } from './weekly-review';

export const MEETING_DETAIL_WEEKS = 4;

export interface MeetingModelCount { key: string; label: string; count: number }
export interface MeetingDetailWeek { label: string; from: string; to: string; total: number; withoutInterest: number; byModel: MeetingModelCount[] }
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

    const weeks = meetingDetailWeeks(input.meetingDate).map(week => {
        const meetings = input.meetings.filter(meeting => meeting.day >= week.from && meeting.day <= week.to);
        const groups = new Map<string, { block: string; model: string; count: number; areas: Map<number, number> }>();
        let withoutInterest = 0;
        for (const meeting of meetings) {
            const interest = firstInterest(meeting.interests);
            if (!interest) { withoutInterest++; continue; }
            const key = modelKey(interest.block, interest.model);
            const group = groups.get(key) ?? { ...(registerNames.get(key) ?? { block: interest.block, model: interest.model }), count: 0, areas: new Map() };
            group.count++;
            if (interest.area !== null) group.areas.set(interest.area, (group.areas.get(interest.area) ?? 0) + 1);
            groups.set(key, group);
        }
        const byModel = [...groups].map(([key, group]) => {
            // Хамгийн олон давтагдсан талбай (тэнцвэл бага нь).
            const area = [...group.areas].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
            return { key, label: modelLabel(group.block, group.model, area, roomsOf(rooms, group.block, group.model)), count: group.count };
        }).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'mn', { numeric: true }));
        return { ...week, total: meetings.length, withoutInterest, byModel };
    });
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
